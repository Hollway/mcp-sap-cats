export interface SummaryRow {
  workdate: string;
  hours: number | string;
  status: string;
  prjct?: string;
  rqsnb?: string;
  descr?: string;
}

export type SummaryBy = "request" | "project";

export interface SummaryGroup {
  prjct: string;
  rqsnb?: string;
  descr?: string;
  hours: number;
  days: number;
  records: number;
  by_status: Record<string, number>;
  weeks?: Record<string, number>;
}

/** Старые версии после правки утверждённой записи и сторно хранят часы в CATSDB, но это уже не работа. */
const NOT_WORKED = new Set(["50", "60"]);

const round = (value: number) => Math.round(value * 100) / 100;

/** Понедельник недели, в которую попадает дата, — YYYY-MM-DD. */
export const weekOf = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

const add = (target: Record<string, number>, key: string, hours: number) => {
  target[key] = round((target[key] ?? 0) + hours);
};

/**
 * Без номера ТЗ описание вводят вручную, и именно оно отличает одну работу
 * от другой, поэтому такие записи группируются по проекту и описанию.
 */
const keyOf = (row: SummaryRow, by: SummaryBy) => {
  const prjct = row.prjct ?? "";
  if (by === "project") return prjct;
  return row.rqsnb ? `${prjct}\u0000${row.rqsnb}` : `${prjct}\u0000\u0000${row.descr ?? ""}`;
};

export function summarize(rows: SummaryRow[], by: SummaryBy, weeks: boolean) {
  const groups = new Map<string, SummaryGroup & { dates: Set<string> }>();
  const total = { hours: 0, by_status: {} as Record<string, number>, weeks: {} as Record<string, number> };
  const dates = new Set<string>();

  for (const row of rows) {
    const hours = Number(row.hours);
    if (NOT_WORKED.has(row.status) || !hours) continue;
    const key = keyOf(row, by);
    let group = groups.get(key);
    if (!group) {
      group = {
        prjct: row.prjct ?? "",
        ...(by === "request" ? { rqsnb: row.rqsnb ?? "", descr: row.descr ?? "" } : {}),
        hours: 0,
        days: 0,
        records: 0,
        by_status: {},
        ...(weeks ? { weeks: {} } : {}),
        dates: new Set(),
      };
      groups.set(key, group);
    }
    if (by === "request" && !group.descr && row.descr) group.descr = row.descr;
    group.hours = round(group.hours + hours);
    group.records += 1;
    group.dates.add(row.workdate);
    add(group.by_status, row.status, hours);
    total.hours = round(total.hours + hours);
    add(total.by_status, row.status, hours);
    dates.add(row.workdate);
    if (weeks) {
      const week = weekOf(row.workdate);
      add(group.weeks!, week, hours);
      add(total.weeks, week, hours);
    }
  }

  const sorted = (weekly: Record<string, number>) => Object.fromEntries(Object.entries(weekly).sort(([a], [b]) => a.localeCompare(b)));

  const result = [...groups.values()]
    .map(({ dates: groupDates, ...group }) => ({
      ...group,
      days: groupDates.size,
      ...(group.weeks ? { weeks: sorted(group.weeks) } : {}),
    }))
    .sort((a, b) => b.hours - a.hours || a.prjct.localeCompare(b.prjct) || Number(a.rqsnb ?? 0) - Number(b.rqsnb ?? 0));

  return {
    groups: result,
    total_hours: total.hours,
    days: dates.size,
    by_status: total.by_status,
    ...(weeks ? { weeks: sorted(total.weeks) } : {}),
  };
}

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  catsRecord,
  catsRecordWithCounter,
  isoDate,
  pernr,
  profile,
  CATS_STATUS,
} from "./schemas.js";
import { BapiMessage, SapClient, SapError, formatMessages, hasErrors, loadConfig } from "./sap.js";

const cfg = loadConfig();
const sap = new SapClient(cfg);

const server = new McpServer({ name: "sap-cats", version: "0.1.0" });

const ok = (payload: unknown, messages: BapiMessage[] = []) => {
  const text = [JSON.stringify(payload, null, 2), formatMessages(messages)].filter(Boolean).join("\n\n");
  return { content: [{ type: "text" as const, text }] };
};

const fail = (error: unknown) => {
  const text = error instanceof SapError
    ? [error.message, formatMessages(error.messages)].filter(Boolean).join("\n\n")
    : String(error);
  return { content: [{ type: "text" as const, text }], isError: true };
};

server.registerTool(
  "cats_whoami",
  {
    title: "Мой табельный номер",
    description:
      "Табельный номер, ФИО и оргединица пользователя, под которым MCP ходит в SAP (ИТ 0105, подтип 0001). Вызывай первым, если пользователь не назвал табельный номер.",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await sap.call<{ messages: BapiMessage[] }>("/whoami", "POST", {});
      const { messages, ...rest } = data;
      return hasErrors(messages) ? { ...ok(rest, messages), isError: true } : ok(rest, messages);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_projects",
  {
    title: "Активные проекты и номера ТЗ",
    description:
      "Справочник для ext.prjct и ext.rqsnb. Без параметров — все активные проекты; search — фильтр по коду или названию; prjct — номера ТЗ этого проекта (без удалённых).",
    inputSchema: {
      search: z.string().max(50).optional().describe("Часть кода или названия проекта, без учёта регистра"),
      prjct: z.string().max(30).optional().describe("Код проекта — вернуть его номера ТЗ"),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ messages: BapiMessage[] }>("/projects", "POST", args);
      const { messages, ...rest } = data;
      return ok(rest, messages);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_read",
  {
    title: "Вывод таймшита",
    description:
      "Записи учёта времени по сотруднику за период: дата, объект отнесения, вид работ, часы, статус, признак подробного текста (longtext). Сторнированные записи (статус 60) выводятся, но в total_hours не входят.",
    inputSchema: {
      pernr,
      date_from: isoDate,
      date_to: isoDate,
      status: z.array(z.enum(["10", "20", "30", "40", "50", "60"])).optional(),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ rows: Array<{ status: string }>; total_hours: number }>(
        "/read",
        "POST",
        args,
      );
      const rows = data.rows.map((r) => ({ ...r, status_text: CATS_STATUS[r.status] ?? r.status }));
      return ok({ ...data, rows });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_capacity",
  {
    title: "Свободные часы по дням",
    description: "Сколько часов уже списано и сколько осталось до нормы дня, с учётом календаря выходных и праздников.",
    inputSchema: {
      pernr,
      date_from: isoDate,
      date_to: isoDate,
      norm_hours: z.number().positive().default(8),
    },
  },
  async (args) => {
    try {
      return ok(await sap.call("/capacity", "POST", args));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_validate",
  {
    title: "Проверка записей без сохранения",
    description:
      "Прогоняет записи через BAPI с TESTRUN: проверяет объекты отнесения, допустимость периода и полномочия. Дополнительно проверяет дневной лимит часов (норма — свой расчёт MCP, BAPI его не проверяет). Ничего не пишет.",
    inputSchema: {
      pernr,
      profile: profile.default(cfg.profile as "TIME_D1"),
      records: z.array(catsRecord).min(1),
      norm_hours: z.number().positive().default(8).describe("Дневная норма часов для проверки лимита"),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ messages: BapiMessage[] }>("/validate", "POST", args);
      return ok({ ok: !hasErrors(data.messages) }, data.messages);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_insert",
  {
    title: "Создание записей таймшита",
    description:
      "Создаёт записи учёта времени, в том числе сразу за несколько дней и по нескольким объектам. Фиксирует изменения. Блокирует запись, если она превышает дневной лимит часов (существующие + новые записи за день). Перед вызовом имеет смысл прогнать cats_validate.",
    inputSchema: {
      pernr,
      profile: profile.default(cfg.profile as "TIME_D1"),
      records: z.array(catsRecord).min(1),
      idempotency_key: z
        .string()
        .min(8)
        .max(20)
        .describe("Ключ вызова: защищает от задвоения часов при повторе"),
      release: z.boolean().default(false).describe("Сразу деблокировать для утверждения"),
      norm_hours: z.number().positive().default(8).describe("Дневная норма часов для проверки лимита"),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ created: unknown[]; committed: boolean; messages: BapiMessage[] }>(
        "/insert",
        "POST",
        args,
      );
      return ok({ created: data.created, committed: data.committed }, data.messages);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_change",
  {
    title: "Изменение записей таймшита",
    description:
      "Меняет существующие записи по их ключу. Записи в статусах 30 и 50 изменению не подлежат. Проверяет дневной лимит: часы изменяемых записей заменяются новыми, а не складываются с ними.",
    inputSchema: {
      pernr,
      profile: profile.default(cfg.profile as "TIME_D1"),
      records: z.array(catsRecordWithCounter).min(1),
      test: z.boolean().default(false),
      norm_hours: z.number().positive().default(8).describe("Дневная норма часов для проверки лимита"),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ changed: unknown[]; committed: boolean; messages: BapiMessage[] }>(
        "/change",
        "POST",
        args,
      );
      return ok({ changed: data.changed, committed: data.committed }, data.messages);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_delete",
  {
    title: "Удаление записей таймшита",
    description: "Удаляет записи по ключу.",
    inputSchema: {
      profile: profile.default(cfg.profile as "TIME_D1"),
      counters: z.array(z.string().max(12)).min(1),
      test: z.boolean().default(false),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ deleted: unknown[]; committed: boolean; messages: BapiMessage[] }>(
        "/delete",
        "POST",
        args,
      );
      return ok({ deleted: data.deleted, committed: data.committed }, data.messages);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "cats_release",
  {
    title: "Деблокирование для утверждения",
    description:
      "Переводит записи из статуса «В обработке» дальше по циклу утверждения. В этой системе процедура утверждения в TCATS не настроена (APPROVAL пусто), поэтому релиз сразу даёт статус «Утверждено» (30), а не «Деблокировано для утверждения» (20). SAP при этом создаёт свою аудиторскую запись-историю (REFCOUNTER на исходный counter) — это штатное поведение CATS.",
    inputSchema: {
      pernr,
      counters: z.array(z.string().max(12)).optional(),
      date_from: isoDate.optional(),
      date_to: isoDate.optional(),
    },
  },
  async (args) => {
    try {
      const data = await sap.call<{ released: unknown[]; messages: BapiMessage[] }>("/release", "POST", args);
      return ok({ released: data.released }, data.messages);
    } catch (error) {
      return fail(error);
    }
  },
);

const who = (pernr: string | undefined) => (pernr ? `табельного ${pernr}` : "моего табельного (узнай его через cats_whoami)");

const prompt = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

const WRITE_RULES = `Правила записи:
- ничего не записывай, пока я не подтвердил итоговую таблицу (дата, часы, проект, номер ТЗ, текст);
- код проекта и номер ТЗ бери из cats_projects, не придумывай;
- перед записью прогони cats_validate и покажи сообщения, если они есть;
- один вызов cats_insert на весь набор, idempotency_key — 8–20 символов, уникальный для этого набора, при повторе после сбоя используй тот же ключ;
- после записи покажи результат через cats_read.`;

server.registerPrompt(
  "fill_week_like_last",
  {
    title: "Заполнить неделю по образцу прошлой",
    description: "Берёт записи прошлой недели как шаблон и раскладывает их на указанную неделю в пределах свободных часов.",
    argsSchema: {
      pernr: pernr.optional().describe("Табельный номер; если не задан — через cats_whoami"),
      week_start: isoDate.describe("Понедельник заполняемой недели, YYYY-MM-DD"),
    },
  },
  ({ pernr, week_start }) =>
    prompt(`Заполни таймшит ${who(pernr)} на неделю, начинающуюся ${week_start}, по образцу предыдущей недели.

1. cats_read за предыдущую неделю (понедельник–воскресенье перед ${week_start}) — это шаблон: проекты, номера ТЗ, тексты и распределение часов по дням недели. Сторнированные записи (статус 60) не учитывай.
2. cats_capacity на заполняемую неделю — сколько свободно в каждый рабочий день. Нерабочие дни не заполняй, уже занятые часы не перекрывай.
3. Предложи записи: тот же день недели → тот же набор, урезанный до свободных часов дня; если шаблонный день был нерабочим, а заполняемый рабочий (или наоборот) — спроси меня.

${WRITE_RULES}`),
);

server.registerPrompt(
  "fill_gaps",
  {
    title: "Дозаполнить свободные часы",
    description: "Находит рабочие дни периода с недобором до нормы и закрывает их одним проектом.",
    argsSchema: {
      pernr: pernr.optional().describe("Табельный номер; если не задан — через cats_whoami"),
      date_from: isoDate,
      date_to: isoDate,
      prjct: z.string().max(30).describe("Проект для недостающих часов"),
      shorttext: z.string().max(40).optional().describe("Текст записи"),
    },
  },
  ({ pernr, date_from, date_to, prjct, shorttext }) =>
    prompt(`Дозаполни таймшит ${who(pernr)} за ${date_from} – ${date_to} проектом ${prjct}${shorttext ? ` с текстом «${shorttext}»` : ""}.

1. cats_capacity за период: возьми только рабочие дни с free > 0.
2. На каждый такой день — одна запись на free часов (шаг 0,25).
3. Покажи таблицу дней и часов и итог.

${WRITE_RULES}`),
);

server.registerPrompt(
  "period_close_check",
  {
    title: "Проверка периода перед закрытием",
    description: "Сводка по периоду: недобор и перебор по дням, записи в обработке, которые ещё не деблокированы.",
    argsSchema: {
      pernr: pernr.optional().describe("Табельный номер; если не задан — через cats_whoami"),
      date_from: isoDate,
      date_to: isoDate,
    },
  },
  ({ pernr, date_from, date_to }) =>
    prompt(`Проверь таймшит ${who(pernr)} за ${date_from} – ${date_to} перед закрытием периода.

1. cats_capacity за период — рабочие дни с недобором (free > 0) и дни с перебором (free < 0), в том числе часы в выходные.
2. cats_read за период — записи в статусе 10 «В обработке».
3. Выведи коротко: дни с недобором и сколько не хватает, дни с перебором, итог часов против нормы, список записей в статусе 10.
4. Предложи действия (дозаполнить, поправить, деблокировать через cats_release), но ничего не меняй без моего подтверждения. Учти, что cats_release в этой системе сразу даёт статус 30 «Утверждено», после этого запись правится только сторно.`),
);

await server.connect(new StdioServerTransport());

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
  "cats_read",
  {
    title: "Вывод таймшита",
    description: "Записи учёта времени по сотруднику за период: дата, объект отнесения, вид работ, часы, статус.",
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
      "Прогоняет записи через BAPI с TESTRUN: проверяет объекты отнесения, допустимость периода и полномочия. Ничего не пишет.",
    inputSchema: {
      pernr,
      profile: profile.default(cfg.profile as "TIME_D1"),
      records: z.array(catsRecord).min(1),
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
      "Создаёт записи учёта времени, в том числе сразу за несколько дней и по нескольким объектам. Фиксирует изменения. Перед вызовом имеет смысл прогнать cats_validate.",
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
    description: "Меняет существующие записи по их ключу. Записи в статусах 30 и 50 изменению не подлежат.",
    inputSchema: {
      pernr,
      profile: profile.default(cfg.profile as "TIME_D1"),
      records: z.array(catsRecordWithCounter).min(1),
      test: z.boolean().default(false),
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

await server.connect(new StdioServerTransport());

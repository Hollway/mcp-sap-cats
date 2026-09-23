import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const requests = [];
const replies = new Map();

const handler = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace("/sap/bc/zcats", "");
    requests.push({ route, url, headers: req.headers, body: body ? JSON.parse(body) : undefined });
    const [status, payload] = replies.get(route) ?? [404, { error: "no reply" }];
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
});

let client;

before(async () => {
  await new Promise((resolve) => handler.listen(0, "127.0.0.1", resolve));
  const { port } = handler.address();
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
      env: {
        SAP_CATS_URL: `http://127.0.0.1:${port}/sap/bc/zcats/`,
        SAP_CLIENT: "102",
        SAP_USER: "tester",
        SAP_PASSWORD: "secret",
        SAP_CATS_PROFILE: "TIME_W1",
        SAP_LOCK_RETRY_DELAY_MS: "1",
        NO_PROXY: "127.0.0.1,localhost",
      },
    }),
  );
});

after(async () => {
  await client?.close();
  handler.close();
});

const call = async (name, args) => {
  requests.length = 0;
  const result = await client.callTool({ name, arguments: args });
  return { ...result, text: result.content.map((c) => c.text).join("\n"), sent: requests[0], all: [...requests] };
};

const record = { workdate: "2026-09-21", hours: 2, ext: { prjct: "PRJ01", descr: "Работа" } };

test("сервер публикует все девять инструментов", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "cats_capacity",
    "cats_change",
    "cats_delete",
    "cats_insert",
    "cats_projects",
    "cats_read",
    "cats_release",
    "cats_validate",
    "cats_whoami",
  ]);
});

test("cats_whoami: ответ без messages, ошибка MCP003 — isError", async () => {
  replies.set("/whoami", [200, { user: "TESTER", pernr: "00012345", name: "Тест", orgeh: "1", orgunit: "Отдел", messages: [] }]);
  const found = await call("cats_whoami", {});
  assert.equal(found.isError, undefined);
  assert.equal(JSON.parse(found.text).pernr, "00012345");
  assert.equal(JSON.parse(found.text).messages, undefined);

  replies.set("/whoami", [200, { user: "TESTER", pernr: "00000000", messages: [{ type: "E", id: "MCP", number: "003", text: "Нет табельного", row: 0 }] }]);
  const missing = await call("cats_whoami", {});
  assert.equal(missing.isError, true);
  assert.match(missing.text, /Нет табельного \(MCP003\)/);
});

test("cats_projects: поиск по ТЗ, новые первыми, limit и статус Трекера", async () => {
  replies.set("/projects", [200, {
    projects: [{ prjct: "PRJ01", text: "Проект" }],
    requests: [
      { prjct: "PRJ01", rqsnb: 1, text: "Старое ТЗ", ytr_key: "", ytr_status: "" },
      { prjct: "PRJ01", rqsnb: 562, text: "ZSTMAT остатки", ytr_key: "SAP-19109", ytr_status: "4" },
      { prjct: "PRJ01", rqsnb: 600, text: "ZSTMAT транзакция", ytr_key: "SAP-19200", ytr_status: "3" },
    ],
    messages: [],
  }]);
  const result = await call("cats_projects", { prjct: "PRJ01", search: "zstmat", limit: 1 });
  assert.deepEqual(result.sent.body, { prjct: "PRJ01", search: "zstmat" });
  const payload = JSON.parse(result.text);
  assert.equal(payload.requests_total, 2);
  assert.deepEqual(payload.requests.map((r) => r.rqsnb), ["600"]);
  assert.equal(payload.requests[0].ytr_status_text, "В работе");
});

test("ext.ytr_key превращается в проект и номер ТЗ до записи", async () => {
  replies.set("/projects", [200, { projects: [], requests: [{ prjct: "ОЗИПП", rqsnb: 562, text: "ТЗ", ytr_key: "SAP-19109", ytr_status: "4" }], messages: [] }]);
  replies.set("/insert", [200, { created: [], committed: true, messages: [] }]);
  const result = await call("cats_insert", {
    pernr: "12345",
    records: [
      { workdate: "2026-09-21", hours: 1, ext: { ytr_key: "SAP-19109" } },
      { workdate: "2026-09-22", hours: 1, ext: { ytr_key: "SAP-19109" } },
    ],
    idempotency_key: "TEST0002",
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.all.map((r) => r.route), ["/projects", "/insert"]);
  assert.deepEqual(result.all[1].body.records[1].ext, { prjct: "ОЗИПП", rqsnb: "562" });
});

test("ext.ytr_key: неоднозначный ключ и расхождение с парой — ошибка без записи", async () => {
  replies.set("/projects", [200, { projects: [], requests: [
    { prjct: "А", rqsnb: 1, ytr_key: "SAP-1", ytr_status: "" },
    { prjct: "Б", rqsnb: 1, ytr_key: "SAP-1", ytr_status: "" },
  ], messages: [] }]);
  const ambiguous = await call("cats_insert", { pernr: "12345", records: [{ ...record, ext: { ytr_key: "SAP-1" } }], idempotency_key: "TEST0003" });
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.text, /нескольким парам \(А\/1, Б\/1\)/);
  assert.deepEqual(ambiguous.all.map((r) => r.route), ["/projects"]);

  replies.set("/projects", [200, { projects: [], requests: [{ prjct: "ОЗИПП", rqsnb: 562, ytr_key: "SAP-19109", ytr_status: "4" }], messages: [] }]);
  const mismatch = await call("cats_validate", { pernr: "12345", records: [{ ...record, ext: { ytr_key: "SAP-19109", prjct: "PRJ01" } }] });
  assert.equal(mismatch.isError, true);
  assert.match(mismatch.text, /это ОЗИПП\/562/);
  assert.deepEqual(mismatch.all.map((r) => r.route), ["/projects"]);
});

test("cats_projects: параметры поиска уходят в хендлер", async () => {
  replies.set("/projects", [200, { projects: [{ prjct: "PRJ01", text: "Проект" }], requests: [{ rqsnb: "00001", text: "ТЗ" }], messages: [] }]);
  const result = await call("cats_projects", { prjct: "PRJ01" });
  assert.deepEqual(result.sent.body, { prjct: "PRJ01" });
  assert.equal(JSON.parse(result.text).requests[0].rqsnb, "00001");
});

test("cats_read: фильтр status уходит в хендлер, к строкам добавляется status_text", async () => {
  replies.set("/read", [200, { rows: [{ counter: "1", status: "30" }, { counter: "2", status: "99" }], total_hours: 3 }]);
  const result = await call("cats_read", { pernr: "12345", date_from: "2026-09-01", date_to: "2026-09-30", status: ["30"] });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.sent.body.status, ["30"]);
  assert.equal(result.sent.url.searchParams.get("sap-client"), "102");
  assert.equal(result.sent.headers.authorization, `Basic ${Buffer.from("tester:secret").toString("base64")}`);
  const payload = JSON.parse(result.text);
  assert.equal(payload.rows[0].status_text, "Утверждено");
  assert.equal(payload.rows[1].status_text, "99");
});

test("cats_validate: пустой messages — ok: true", async () => {
  replies.set("/validate", [200, { messages: [] }]);
  const result = await call("cats_validate", { pernr: "12345", records: [record] });
  assert.deepEqual(JSON.parse(result.text), { ok: true });
});

test("cats_validate: ошибка дневного лимита — ok: false и текст сообщения", async () => {
  replies.set("/validate", [200, { messages: [{ type: "E", id: "MCP", number: "002", text: "Превышен лимит", row: 1 }] }]);
  const result = await call("cats_validate", { pernr: "12345", records: [record], norm_hours: 6 });
  assert.equal(result.sent.body.norm_hours, 6);
  assert.match(result.text, /"ok": false/);
  assert.match(result.text, /Ошибка · строка 1: Превышен лимит \(MCP002\)/);
});

test("cats_insert: умолчания профиля, release и norm_hours подставляются до вызова SAP", async () => {
  replies.set("/insert", [200, { created: [{ row: 1, counter: "000000000001" }], committed: true, messages: [] }]);
  const result = await call("cats_insert", { pernr: "12345", records: [record], idempotency_key: "TEST0001" });
  assert.equal(result.sent.body.profile, "TIME_W1");
  assert.equal(result.sent.body.release, false);
  assert.equal(result.sent.body.norm_hours, 8);
  assert.equal(result.sent.body.records[0].wagetype, "M120");
  assert.equal(JSON.parse(result.text).committed, true);
});

test("cats_insert: повтор с тем же ключом — committed: false и сообщение S", async () => {
  replies.set("/insert", [
    200,
    { created: [{ row: 1, counter: "000000000001" }], committed: false, messages: [{ type: "S", id: "MCP", number: "001", text: "Уже создано", row: 0 }] },
  ]);
  const result = await call("cats_insert", { pernr: "12345", records: [record], idempotency_key: "TEST0001" });
  assert.equal(result.isError, undefined);
  assert.match(result.text, /"committed": false/);
  assert.match(result.text, /Успешно · Уже создано \(MCP001\)/);
  assert.doesNotMatch(result.text, /строка 0/);
});

test("невалидный ввод отвергается до обращения к SAP", async () => {
  const cases = [
    ["cats_read", { pernr: "ABC", date_from: "2026-09-01", date_to: "2026-09-30" }],
    ["cats_insert", { pernr: "12345", records: [record], idempotency_key: "short" }],
    ["cats_insert", { pernr: "12345", records: [{ ...record, ext: {} }], idempotency_key: "TEST0001" }],
    ["cats_validate", { pernr: "12345", records: [] }],
    ["cats_delete", { counters: [] }],
    ["cats_insert", { pernr: "12345", records: [{ ...record, ext: { prjct: "PRJ01" } }], idempotency_key: "TEST0001" }],
  ];
  for (const [name, args] of cases) {
    const result = await call(name, args);
    assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    assert.equal(result.sent, undefined, `${name} не должен был дойти до SAP`);
  }
});

test("HTTP 403 от SAP — ошибка инструмента с пояснением про полномочия", async () => {
  replies.set("/capacity", [403, {}]);
  const result = await call("cats_capacity", { pernr: "54321", date_from: "2026-09-21", date_to: "2026-09-21" });
  assert.equal(result.isError, true);
  assert.match(result.text, /P_ORGIN/);
});

test("cats_change, cats_delete, cats_release пробрасывают ответ хендлера", async () => {
  replies.set("/change", [200, { changed: [{ row: 1, counter: "1" }], committed: true, messages: [] }]);
  replies.set("/delete", [200, { deleted: [{ row: 1, counter: "1" }], committed: true, messages: [] }]);
  replies.set("/release", [200, { released: [{ row: 1, counter: "1", status: "30" }], messages: [] }]);

  const changed = await call("cats_change", { pernr: "12345", records: [{ ...record, counter: "1", longtext: "строка 1\nстрока 2" }] });
  assert.equal(changed.sent.body.test, false);
  assert.equal(changed.sent.body.norm_hours, 8);
  assert.equal(changed.sent.body.records[0].longtext, "строка 1\nстрока 2");
  assert.equal(JSON.parse(changed.text).changed.length, 1);

  const deleted = await call("cats_delete", { counters: ["1"] });
  assert.deepEqual(deleted.sent.body.counters, ["1"]);
  assert.equal(JSON.parse(deleted.text).committed, true);

  const released = await call("cats_release", { pernr: "12345", date_from: "2026-09-21", date_to: "2026-09-21" });
  assert.equal(JSON.parse(released.text).released[0].status, "30");
});

test("prompts: три сценария, аргументы подставляются в текст", async () => {
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ["fill_gaps", "fill_week_like_last", "period_close_check"]);

  const { messages } = await client.getPrompt({
    name: "fill_gaps",
    arguments: { pernr: "12345", date_from: "2026-09-01", date_to: "2026-09-30", prjct: "PRJ01" },
  });
  const text = messages[0].content.text;
  assert.match(text, /табельного 12345/);
  assert.match(text, /проектом PRJ01/);
  assert.match(text, /cats_capacity/);
  assert.match(text, /пока я не подтвердил/);
  assert.doesNotMatch(text, /undefined/);
});

test("prompts: без pernr — подсказка про cats_whoami", async () => {
  const { messages } = await client.getPrompt({ name: "period_close_check", arguments: { date_from: "2026-09-01", date_to: "2026-09-30" } });
  assert.match(messages[0].content.text, /cats_whoami/);
  assert.doesNotMatch(messages[0].content.text, /undefined/);
});

test("prompts: невалидная дата отвергается", async () => {
  await assert.rejects(
    client.getPrompt({ name: "period_close_check", arguments: { pernr: "12345", date_from: "01.09.2026", date_to: "2026-09-30" } }),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { catsRecord, receiver } from "../dist/schemas.js";
import { SapClient, SapError, formatMessages, hasErrors } from "../dist/sap.js";

const baseRecord = { workdate: "2026-09-21", hours: 2, ext: { prjct: "PRJ01" } };

test("catsRecord: минимальная запись без receiver проходит и получает умолчания", () => {
  const parsed = catsRecord.parse(baseRecord);
  assert.equal(parsed.unit, "STD");
  assert.equal(parsed.wagetype, "M120");
  assert.equal(parsed.receiver, undefined);
});

test("catsRecord: ext.prjct обязателен (BAdI ZCL_BADI_CATS)", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: {} }).success, false);
  assert.equal(catsRecord.safeParse({ workdate: "2026-09-21", hours: 2 }).success, false);
});

test("catsRecord: часы — положительные, шаг 0,25", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 1.25 }).success, true);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 1.3 }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 0 }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: -1 }).success, false);
});

test("catsRecord: формат даты и времени", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, workdate: "21.09.2026" }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, start_time: "9:00" }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, start_time: "09:00", end_time: "11:00" }).success, true);
});

test("catsRecord: неизвестные поля отвергаются", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, counter: "1" }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", zzfoo: "x" } }).success, false);
});

test("receiver: ровно один вид объекта отнесения", () => {
  assert.equal(receiver.safeParse({ order: "ORDER000001" }).success, true);
  assert.equal(receiver.safeParse({ cost_center: "1000", co_area: "1000" }).success, true);
  assert.equal(receiver.safeParse({ order: "1", wbs: "X" }).success, false);
  assert.equal(receiver.safeParse({ cost_center: "1000" }).success, false);
});

test("formatMessages: row 0 и отсутствующий row — сообщение уровня вызова", () => {
  const text = formatMessages([
    { type: "E", id: "LR", number: "199", text: "Несколько табельных", row: 0 },
    { type: "S", id: "MCP", number: "1", text: "Уже создано" },
    { type: "W", id: "KI", number: "101", text: "Строка", row: 2 },
  ]);
  assert.deepEqual(text.split("\n"), [
    "Ошибка · Несколько табельных (LR199)",
    "Успешно · Уже создано (MCP1)",
    "Предупреждение · строка 2: Строка (KI101)",
  ]);
  assert.equal(formatMessages([]), "");
});

test("hasErrors: E и A — ошибки, остальное нет", () => {
  assert.equal(hasErrors([]), false);
  assert.equal(hasErrors([{ type: "W", id: "", number: "", text: "" }]), false);
  assert.equal(hasErrors([{ type: "E", id: "", number: "", text: "" }]), true);
  assert.equal(hasErrors([{ type: "A", id: "", number: "", text: "" }]), true);
});

const cfg = { url: "https://sap.example/sap/bc/zcats", client: "102", user: "u", password: "p", profile: "TIME_D1" };

function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test("SapClient: Basic-авторизация, мандант в sap-client, JSON-тело", () =>
  withFetch(
    async (url, init) => {
      assert.equal(String(url), "https://sap.example/sap/bc/zcats/read?sap-client=102");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, `Basic ${Buffer.from("u:p").toString("base64")}`);
      assert.equal(init.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(init.body), { pernr: "1" });
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    },
    async () => {
      assert.deepEqual(await new SapClient(cfg).call("/read", "POST", { pernr: "1" }), { rows: [] });
    },
  ));

for (const [status, pattern] of [
  [401, /учётные данные/],
  [403, /P_ORGIN/],
  [500, /Хендлер вернул 500: dump/],
]) {
  test(`SapClient: HTTP ${status} превращается в SapError`, () =>
    withFetch(
      async () => new Response("dump", { status }),
      async () => {
        await assert.rejects(new SapClient(cfg).call("/read", "POST", {}), (error) => {
          assert.ok(error instanceof SapError);
          assert.equal(error.status, status);
          assert.match(error.message, pattern);
          return true;
        });
      },
    ));
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { catsRecord, catsRecordWithCounter, isoDate, receiver } from "../dist/schemas.js";
import { SapClient, SapError, dotenvValue, envInt, formatMessages, hasErrors, isLocked } from "../dist/sap.js";

const baseRecord = { workdate: "2026-09-21", hours: 2, ext: { prjct: "PRJ01", descr: "Работа" } };

test("catsRecord: минимальная запись без receiver проходит и получает умолчания", () => {
  const parsed = catsRecord.parse(baseRecord);
  assert.equal(parsed.unit, "STD");
  assert.equal(parsed.wagetype, "M120");
  assert.equal(parsed.receiver, undefined);
});

test("catsRecord: нужен ext.prjct или ext.ytr_key (ZCATS001)", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { descr: "Работа" } }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { ytr_key: "SAP-19109" } }).success, true);
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { ytr_key: "sap 19109" } }).success, false);
  assert.equal(catsRecord.safeParse({ workdate: "2026-09-21", hours: 2 }).success, false);
});

test("catsRecord: часы — положительные, не больше 24, шаг 0,25", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 1.25 }).success, true);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 1.3 }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 0 }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: -1 }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 24 }).success, true);
  assert.equal(catsRecord.safeParse({ ...baseRecord, hours: 24.25 }).success, false);
});

test("catsRecord: формат даты и времени", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, workdate: "21.09.2026" }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, start_time: "9:00" }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, start_time: "09:00", end_time: "11:00" }).success, true);
});

test("isoDate: несуществующая дата отвергается, а не уходит в SAP нулём", () => {
  for (const value of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10"]) {
    assert.equal(isoDate.safeParse(value).success, false, value);
  }
  for (const value of ["2024-02-29", "2026-12-31", "2026-01-01"]) {
    assert.equal(isoDate.safeParse(value).success, true, value);
  }
});

test("counter: ведущие нули дополняются до 12 знаков, нецифры отвергаются", () => {
  const parsed = catsRecordWithCounter.parse({ ...baseRecord, counter: "388371" });
  assert.equal(parsed.counter, "000000388371");
  assert.equal(catsRecordWithCounter.parse({ ...baseRecord, counter: "000000388371" }).counter, "000000388371");
  assert.equal(catsRecordWithCounter.safeParse({ ...baseRecord, counter: "abc" }).success, false);
  assert.equal(catsRecordWithCounter.safeParse({ ...baseRecord, counter: "1234567890123" }).success, false);
});

test("catsRecordWithCounter: без умолчаний для unit и wagetype — пустое значит «оставить как в записи»", () => {
  const parsed = catsRecordWithCounter.parse({ ...baseRecord, counter: "1" });
  assert.equal(parsed.unit, undefined);
  assert.equal(parsed.wagetype, undefined);
  assert.equal(catsRecord.parse(baseRecord).wagetype, "M120");
});

test("catsRecord: longtext необязателен и ограничен 4000 символами", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, longtext: "a\nb" }).success, true);
  assert.equal(catsRecord.safeParse({ ...baseRecord, longtext: "x".repeat(4001) }).success, false);
});

test("catsRecord: без номера ТЗ описание обязательно, с номером — нет", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01" } }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", rqsnb: "562" } }).success, true);
});

test("catsRecord: номер ТЗ из одних нулей — это «номера нет», описание обязательно", () => {
  for (const rqsnb of ["0", "00000"]) {
    assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", rqsnb } }).success, false, rqsnb);
    assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", rqsnb, descr: "Работа" } }).success, true, rqsnb);
  }
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", descr: "   " } }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", rqsnb: "", descr: "Работа" } }).success, true, "пустой rqsnb из cats_read");
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", rqsnb: "" } }).success, false);
});

test("catsRecord: неизвестные поля отвергаются", () => {
  assert.equal(catsRecord.safeParse({ ...baseRecord, counter: "1" }).success, false);
  assert.equal(catsRecord.safeParse({ ...baseRecord, ext: { prjct: "PRJ01", descr: "Работа", zzfoo: "x" } }).success, false);
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
    "Успешно · Уже создано (MCP001)",
    "Предупреждение · строка 2: Строка (KI101)",
  ]);
  assert.equal(formatMessages([]), "");
});

test("formatMessages: NUMC-номер, пришедший числом, — в виде SE91 (LR002)", () => {
  assert.equal(formatMessages([{ type: "E", id: "LR", number: 2, text: "Блокировка" }]), "Ошибка · Блокировка (LR002)");
});

test("dotenvValue: кавычки снимаются, « #» без кавычек — комментарий, # внутри значения остаётся", () => {
  assert.equal(dotenvValue('"Pa#ss word"'), "Pa#ss word");
  assert.equal(dotenvValue("'a b'"), "a b");
  assert.equal(dotenvValue("102 # мандант"), "102");
  assert.equal(dotenvValue("Pa#ss"), "Pa#ss");
  assert.equal(dotenvValue('"'), '"');
  assert.equal(dotenvValue(""), "");
});

test("envInt: пусто — умолчание, опечатка — ошибка запуска, а не NaN", () => {
  const name = "SAP_CATS_TEST_INT";
  try {
    delete process.env[name];
    assert.equal(envInt(name, 5, 0, 10), 5);
    process.env[name] = " ";
    assert.equal(envInt(name, 5, 0, 10), 5);
    process.env[name] = "7";
    assert.equal(envInt(name, 5, 0, 10), 7);
    for (const bad of ["2 # повторы", "abc", "1.5", "-1", "11"]) {
      process.env[name] = bad;
      assert.throws(() => envInt(name, 5, 0, 10), new RegExp(name), bad);
    }
  } finally {
    delete process.env[name];
  }
});

test("hasErrors: E и A — ошибки, остальное нет", () => {
  assert.equal(hasErrors([]), false);
  assert.equal(hasErrors([{ type: "W", id: "", number: "", text: "" }]), false);
  assert.equal(hasErrors([{ type: "E", id: "", number: "", text: "" }]), true);
  assert.equal(hasErrors([{ type: "A", id: "", number: "", text: "" }]), true);
});

const cfg = {
  url: "https://sap.example/sap/bc/zcats",
  client: "102",
  user: "u",
  password: "p",
  profile: "TIME_D1",
  language: "",
  timeoutMs: 1_000,
  lockRetries: 2,
  lockRetryDelayMs: 1,
};

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
  [403, /SICF/],
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

const locked = { messages: [{ type: "E", id: "LR", number: "002", text: "Транзакцию блокирует пользователь", row: 0 }] };

test("isLocked: только E/LR/002", () => {
  assert.equal(isLocked(locked.messages), true);
  assert.equal(isLocked([{ ...locked.messages[0], type: "W" }]), false);
  assert.equal(isLocked([{ ...locked.messages[0], number: "199" }]), false);
  assert.equal(isLocked(undefined), false);
});

test("SapClient: LR2 повторяется и проходит со следующей попытки", () => {
  let calls = 0;
  return withFetch(
    async () => {
      calls++;
      const payload = calls === 1 ? locked : { committed: true, messages: [] };
      return new Response(JSON.stringify(payload), { status: 200 });
    },
    async () => {
      assert.deepEqual(await new SapClient(cfg).call("/insert", "POST", {}), { committed: true, messages: [] });
      assert.equal(calls, 2);
    },
  );
});

test("SapClient: после исчерпания повторов возвращается последний ответ с LR2", () => {
  let calls = 0;
  return withFetch(
    async () => {
      calls++;
      return new Response(JSON.stringify(locked), { status: 200 });
    },
    async () => {
      assert.deepEqual(await new SapClient(cfg).call("/delete", "POST", {}), locked);
      assert.equal(calls, 1 + cfg.lockRetries);
    },
  );
});

test("SapClient: другие ошибки BAPI не повторяются", () => {
  let calls = 0;
  const failed = { messages: [{ type: "E", id: "MCP", number: "002", text: "Лимит", row: 1 }] };
  return withFetch(
    async () => {
      calls++;
      return new Response(JSON.stringify(failed), { status: 200 });
    },
    async () => {
      await new SapClient(cfg).call("/insert", "POST", {});
      assert.equal(calls, 1);
    },
  );
});

test("SapClient: таймаут превращается в SapError с подсказкой про idempotency_key", () =>
  withFetch(
    (url, init) =>
      new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
    async () => {
      await assert.rejects(new SapClient({ ...cfg, timeoutMs: 50 }).call("/insert", "POST", {}), (error) => {
        assert.ok(error instanceof SapError);
        assert.match(error.message, /не ответил за 0.05 с/);
        assert.match(error.message, /idempotency_key/);
        return true;
      });
    },
  ));

test("SapClient: SAP_LANGUAGE уходит в sap-language", () =>
  withFetch(
    async (url) => {
      assert.equal(new URL(String(url)).searchParams.get("sap-language"), "RU");
      return new Response("{}", { status: 200 });
    },
    () => new SapClient({ ...cfg, language: "RU" }).call("/read", "POST", {}),
  ));

test("SapClient: ответ не JSON (страница входа) — SapError, у записи — с подсказкой про повтор", () =>
  withFetch(
    async () => new Response("<html>logon</html>", { status: 200 }),
    async () => {
      await assert.rejects(new SapClient(cfg).call("/read", "POST", {}), (error) => {
        assert.ok(error instanceof SapError);
        assert.match(error.message, /не JSON/);
        assert.doesNotMatch(error.message, /idempotency_key/);
        return true;
      });
      await assert.rejects(new SapClient(cfg).call("/insert", "POST", {}), /idempotency_key/);
    },
  ));

test("SapClient: сетевая ошибка — код из cause и подсказка по его виду", () => {
  const failWith = (code) => async () => {
    throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code.toLowerCase()), { code }) });
  };
  return (async () => {
    await withFetch(failWith("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), () =>
      assert.rejects(new SapClient(cfg).call("/insert", "POST", {}), (error) => {
        assert.ok(error instanceof SapError);
        assert.match(error.message, /UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
        assert.match(error.message, /NODE_EXTRA_CA_CERTS/);
        assert.doesNotMatch(error.message, /неизвестен/);
        return true;
      }),
    );
    await withFetch(failWith("ENOTFOUND"), () => assert.rejects(new SapClient(cfg).call("/read", "POST", {}), /SAP_CATS_URL/));
    await withFetch(failWith("UND_ERR_SOCKET"), () => assert.rejects(new SapClient(cfg).call("/change", "POST", {}), /неизвестен/));
    await withFetch(failWith("ETIMEDOUT"), () => assert.rejects(new SapClient(cfg).call("/insert", "POST", {}), /неизвестен/));
    await withFetch(failWith("ECONNREFUSED"), () =>
      assert.rejects(new SapClient(cfg).call("/insert", "POST", {}), (error) => !/неизвестен/.test(error.message)),
    );
    await withFetch(failWith("UND_ERR_SOCKET"), () =>
      assert.rejects(new SapClient(cfg).call("/read", "POST", {}), (error) => !/неизвестен/.test(error.message)),
    );
  })();
});

test("SapClient: таймаут на чтении тела — тот же SapError, что и таймаут соединения", () =>
  withFetch(
    async (url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            init.signal.addEventListener("abort", () => controller.error(init.signal.reason));
          },
        }),
        { status: 200 },
      ),
    () =>
      assert.rejects(new SapClient({ ...cfg, timeoutMs: 50 }).call("/insert", "POST", {}), (error) => {
        assert.ok(error instanceof SapError);
        assert.match(error.message, /не ответил за 0.05 с/);
        assert.match(error.message, /idempotency_key/);
        return true;
      }),
  ));

test("summarize: группы проект + ТЗ, без ТЗ — по описанию, статусы 50 и 60 не считаются", async () => {
  const { summarize } = await import("../dist/summary.js");
  const rows = [
    { workdate: "2026-09-21", hours: 2, status: "10", prjct: "PRJ01", rqsnb: "562", descr: "ТЗ 562" },
    { workdate: "2026-09-22", hours: 3, status: "30", prjct: "PRJ01", rqsnb: "562", descr: "ТЗ 562" },
    { workdate: "2026-09-22", hours: 1, status: "10", prjct: "PRJ01", rqsnb: "", descr: "Совещание" },
    { workdate: "2026-09-23", hours: 1.5, status: "10", prjct: "PRJ01", rqsnb: "", descr: "Консультация" },
    { workdate: "2026-09-23", hours: 4, status: "50", prjct: "PRJ01", rqsnb: "562", descr: "ТЗ 562" },
    { workdate: "2026-09-24", hours: 5, status: "60", prjct: "PRJ02", rqsnb: "1", descr: "Сторно" },
    { workdate: "2026-09-24", hours: 0, status: "30", prjct: "PRJ01", rqsnb: "562", descr: "История" },
  ];
  const result = summarize(rows, "request", false);
  assert.equal(result.total_hours, 7.5);
  assert.equal(result.days, 3);
  assert.deepEqual(result.by_status, { "10": 4.5, "30": 3 });
  assert.equal(result.weeks, undefined);
  assert.deepEqual(result.groups.map((g) => [g.prjct, g.rqsnb, g.descr, g.hours, g.days, g.records]), [
    ["PRJ01", "562", "ТЗ 562", 5, 2, 2],
    ["PRJ01", "", "Консультация", 1.5, 1, 1],
    ["PRJ01", "", "Совещание", 1, 1, 1],
  ]);
  assert.deepEqual(result.groups[0].by_status, { "10": 2, "30": 3 });
});

test("summarize: by project и разбивка по неделям с понедельника", async () => {
  const { summarize, weekOf } = await import("../dist/summary.js");
  assert.equal(weekOf("2026-09-27"), "2026-09-21");
  assert.equal(weekOf("2026-09-28"), "2026-09-28");
  const rows = [
    { workdate: "2026-09-27", hours: 1, status: "10", prjct: "PRJ01", rqsnb: "1" },
    { workdate: "2026-09-28", hours: 2.25, status: "10", prjct: "PRJ01", rqsnb: "2" },
    { workdate: "2026-09-21", hours: 0.5, status: "30", prjct: "PRJ02", rqsnb: "" },
  ];
  const result = summarize(rows, "project", true);
  assert.deepEqual(result.groups.map((g) => [g.prjct, g.hours, g.rqsnb]), [["PRJ01", 3.25, undefined], ["PRJ02", 0.5, undefined]]);
  assert.deepEqual(Object.keys(result.groups[0].weeks), ["2026-09-21", "2026-09-28"]);
  assert.deepEqual(result.weeks, { "2026-09-21": 1.5, "2026-09-28": 2.25 });
});

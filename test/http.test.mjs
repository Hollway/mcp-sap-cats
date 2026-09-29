import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { connect as connectSocket } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

const sapRequests = [];
const sap = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    sapRequests.push({ route: new URL(req.url, "http://localhost").pathname, authorization: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rows: [{ counter: "1", status: "10", hours: 1 }], total_hours: 1 }));
  });
});

const baseEnv = (sapPort, extra = {}) => ({
  SYSTEMROOT: process.env.SYSTEMROOT ?? "",
  SAP_CATS_DOTENV: "0",
  MCP_TRANSPORT: "http",
  MCP_PORT: "0",
  SAP_CATS_URL: `http://127.0.0.1:${sapPort}/sap/bc/zcats/`,
  SAP_CLIENT: "102",
  SAP_LOCK_RETRY_DELAY_MS: "1",
  NO_PROXY: "127.0.0.1,localhost",
  ...extra,
});

/** Запускает сервер и ждёт строку «слушает …» в stderr — порт выбирает ОС. */
const startMcp = (env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/слушает (https?:\/\/\S+)/);
      if (match) resolve({ child, url: match[1], log: () => stderr });
    });
    child.on("exit", (code) => reject(new Error(`сервер завершился (${code}): ${stderr}`)));
  });

let mcp;

before(async () => {
  await new Promise((resolve) => sap.listen(0, "127.0.0.1", resolve));
  mcp = await startMcp(baseEnv(sap.address().port));
});

after(() => {
  mcp?.child.kill();
  sap.close();
});

const connect = async (authorization) => {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: { Authorization: authorization } } }));
  return client;
};

/** Ждёт строку журнала: она пишется на finish ответа и приходит через pipe чуть позже. */
const waitForLog = async (server, pattern) => {
  for (let i = 0; i < 50 && !pattern.test(server.log()); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  return server.log();
};

/** Сырой HTTP/1.1 через сокет — чтобы отправить request-target, который http.request не пропустит. */
const rawSocket = (text) =>
  new Promise((resolve, reject) => {
    const url = new URL(mcp.url);
    const socket = connectSocket(Number(url.port), url.hostname, () => socket.end(text));
    let reply = "";
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("end", () => resolve(reply));
    socket.on("error", reject);
  });

const raw = (method, { headers = {}, body, server = mcp } = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(server.url);
    const req = request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers } },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });

const initialize = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } },
});

test("http: инструменты и сценарии те же, что в stdio", async () => {
  const client = await connect(basic("alice", "a-secret"));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 10);
  assert.ok(tools.some((t) => t.name === "cats_summary"));
  const { prompts } = await client.listPrompts();
  assert.equal(prompts.length, 3);
  await client.close();
});

test("http: в SAP уходит заголовок того клиента, который вызвал инструмент", async () => {
  const alice = await connect(basic("alice", "a-secret"));
  const bob = await connect(basic("bob", "b-secret"));
  sapRequests.length = 0;
  const args = { pernr: "12345", date_from: "2026-09-01", date_to: "2026-09-30" };
  await Promise.all([alice.callTool({ name: "cats_read", arguments: args }), bob.callTool({ name: "cats_read", arguments: args })]);
  await alice.callTool({ name: "cats_read", arguments: args });
  assert.deepEqual(
    sapRequests.map((r) => r.authorization).sort(),
    [basic("alice", "a-secret"), basic("alice", "a-secret"), basic("bob", "b-secret")].sort(),
  );
  assert.ok(sapRequests.every((r) => r.route === "/sap/bc/zcats/read"));
  await Promise.all([alice.close(), bob.close()]);
});

test("http: в журнал пишется логин, но не пароль", async () => {
  const carol = await connect(basic("carol", "c-secret"));
  await carol.callTool({ name: "cats_read", arguments: { pernr: "12345", date_from: "2026-09-01", date_to: "2026-09-30" } });
  await carol.close();
  const log = await waitForLog(mcp, /carol tools\/call 200/);
  assert.match(log, /carol tools\/call 200/);
  assert.doesNotMatch(log, /c-secret/);
  assert.doesNotMatch(log, new RegExp(Buffer.from("carol:c-secret").toString("base64")));
  assert.doesNotMatch(log, /Basic /);
});

test("http: перевод строки в логине и объект в method не подделывают журнал и не роняют сервер", async () => {
  const forged = basic("x\nmallory tools/call 200", "p");
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: { toString: 1 } });
  const reply = await raw("POST", { body, headers: { Authorization: forged } });
  assert.equal(reply.status, 400);
  const log = await waitForLog(mcp, /x\\nmallory/);
  assert.match(log, /x\\nmallory tools\/call 200 \? 400/);
  assert.doesNotMatch(log, /^mallory/m);

  const unicode = basic("y\u2028mallory", "p");
  const nel = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list\u0085evil" });
  await raw("POST", { body: nel, headers: { Authorization: unicode } });
  const escaped = await waitForLog(mcp, /y\\u\{2028\}mallory/);
  assert.match(escaped, /y\\u\{2028\}mallory tools\/list\\u\{85\}evil/);
  assert.doesNotMatch(escaped, /[\u2028\u0085]/);

  const client = await connect(basic("alice", "a-secret"));
  assert.equal((await client.listTools()).tools.length, 10);
  await client.close();
});

test("http: битый request-target — отказ, а не падение общего сервера", async () => {
  for (const target of ["//[", "http://[/mcp"]) {
    const reply = await rawSocket(`POST ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    assert.match(reply, /^HTTP\/1\.1 404/, target);
  }
  const client = await connect(basic("alice", "a-secret"));
  assert.equal((await client.listTools()).tools.length, 10);
  await client.close();
});

test("http: тело больше MCP_MAX_BODY_BYTES — клиент получает 413, а не обрыв", async () => {
  const small = await startMcp(baseEnv(sap.address().port, { MCP_MAX_BODY_BYTES: "100" }));
  try {
    const auth = { Authorization: basic("alice", "a-secret") };
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(1000) } });
    assert.equal((await raw("POST", { body: big, headers: auth, server: small })).status, 413);
    const chunked = await raw("POST", { body: big, headers: { ...auth, "Transfer-Encoding": "chunked" }, server: small });
    assert.equal(chunked.status, 413);

    const huge = "x".repeat(20_000_000);
    const byFetch = await fetch(small.url, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: huge });
    assert.equal(byFetch.status, 413);
    await byFetch.text();
  } finally {
    small.child.kill();
  }
});

test("http: без Authorization — 401 с WWW-Authenticate, до MCP дело не доходит", async () => {
  const missing = await raw("POST", { body: initialize });
  assert.equal(missing.status, 401);
  assert.match(missing.headers["www-authenticate"], /^Basic /);

  const bearer = await raw("POST", { body: initialize, headers: { Authorization: "Bearer token" } });
  assert.equal(bearer.status, 401);
});

test("http: чужой Host — 403, GET — 405, не JSON — 400, чужой путь — 404", async () => {
  const auth = { Authorization: basic("alice", "a-secret") };
  assert.equal((await raw("POST", { body: initialize, headers: { ...auth, Host: "evil.example:80" } })).status, 403);
  assert.equal((await raw("GET", { headers: auth })).status, 405);
  assert.equal((await raw("POST", { body: "{oops", headers: auth })).status, 400);
  const url = new URL(mcp.url);
  const other = await new Promise((resolve, reject) =>
    request({ hostname: url.hostname, port: url.port, path: "/other", method: "POST" }, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    })
      .on("error", reject)
      .end(),
  );
  assert.equal(other.statusCode, 404);
});

test("http: без TLS на внешнем интерфейсе сервер не стартует", async () => {
  await assert.rejects(startMcp(baseEnv(sap.address().port, { MCP_HOST: "0.0.0.0" })), /без TLS/);
});

test("stdio: без SAP_USER не стартует, в http-режиме логин из .env не нужен", async () => {
  await assert.rejects(startMcp(baseEnv(sap.address().port, { MCP_TRANSPORT: "stdio", SAP_USER: "", SAP_PASSWORD: "" })), /SAP_USER/);
});

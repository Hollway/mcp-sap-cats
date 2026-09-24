import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
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
      const match = stderr.match(/слушает (http:\/\/\S+)/);
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

const raw = (method, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(mcp.url);
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

test("http: в журнал пишется логин, но не пароль", () => {
  assert.match(mcp.log(), /alice tools\/call 200/);
  assert.doesNotMatch(mcp.log(), /a-secret|b-secret/);
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

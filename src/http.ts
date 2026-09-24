/**
 * HTTP-режим: один общий сервер на всех пользователей. Учётные данные SAP
 * приходят с каждым запросом в заголовке Authorization и уходят в SAP как
 * есть — логина в .env сервера нет, служебного пользователя тоже (решение №2).
 */

import { readFileSync } from "node:fs";
import { createServer as createPlainServer, IncomingMessage, ServerResponse } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface HttpConfig {
  host: string;
  port: number;
  path: string;
  allowedHosts: string[];
  tls?: { cert: Buffer; key: Buffer };
  maxBodyBytes: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function loadHttpConfig(): HttpConfig {
  const host = process.env.MCP_HOST || "127.0.0.1";
  const cert = process.env.MCP_TLS_CERT;
  const key = process.env.MCP_TLS_KEY;
  if (Boolean(cert) !== Boolean(key)) throw new Error("MCP_TLS_CERT и MCP_TLS_KEY задаются вместе");
  const tls = cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;
  if (!tls && !LOOPBACK.has(host)) {
    throw new Error(
      `MCP_HOST=${host} без TLS: в заголовке Authorization пароль SAP, по открытому HTTP он уйдёт в сеть как есть. ` +
        "Задайте MCP_TLS_CERT и MCP_TLS_KEY или слушайте 127.0.0.1 за обратным прокси с HTTPS.",
    );
  }
  const allowedHosts = (process.env.MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return {
    host,
    port: Number(process.env.MCP_PORT ?? 3000),
    path: "/mcp",
    allowedHosts: allowedHosts.length ? allowedHosts : LOOPBACK.has(host) ? [...LOOPBACK] : [host.toLowerCase()],
    ...(tls ? { tls } : {}),
    maxBodyBytes: Number(process.env.MCP_MAX_BODY_BYTES ?? 1_000_000),
  };
}

/** Имя хоста из заголовка Host без порта; IPv6 — в квадратных скобках. */
const hostname = (header: string | undefined) => {
  const value = (header ?? "").toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.split(":")[0]!;
};

/** Логин из Basic-заголовка — только для журнала, пароль никуда не пишется. */
const basicUser = (authorization: string) => {
  const decoded = Buffer.from(authorization.slice("Basic ".length).trim(), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  return colon > 0 ? decoded.slice(0, colon) : "";
};

const jsonRpcError = (res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
};

class BodyTooLarge extends Error {}

const readJson = (req: IncomingMessage, limit: number) =>
  new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BodyTooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });

/**
 * Без сессий: на каждый POST — свой McpServer со своим SapClient. Все
 * маршруты хендлера и так без состояния — пишущие коммитят в том же вызове.
 */
export function startHttpServer(cfg: HttpConfig, build: (authorization: string) => McpServer) {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const refuse = (status: number, message: string, headers?: Record<string, string>) => {
      req.resume();
      jsonRpcError(res, status, message, headers);
    };
    const url = new URL(req.url ?? "/", "http://placeholder");
    if (url.pathname !== cfg.path) return refuse(404, `Нет такого пути, MCP слушает ${cfg.path}`);
    if (!cfg.allowedHosts.includes(hostname(req.headers.host))) {
      return refuse(403, `Хост ${req.headers.host ?? "—"} не разрешён (MCP_ALLOWED_HOSTS)`);
    }
    if (req.method !== "POST") {
      return refuse(405, "Сервер работает без сессий: только POST", { Allow: "POST" });
    }
    const authorization = req.headers.authorization ?? "";
    if (!/^Basic \S+$/i.test(authorization) || !basicUser(authorization)) {
      return refuse(401, "Нужен заголовок Authorization: Basic с логином и паролем SAP", {
        "WWW-Authenticate": 'Basic realm="sap-cats", charset="UTF-8"',
      });
    }

    let body: unknown;
    try {
      body = await readJson(req, cfg.maxBodyBytes);
    } catch (error) {
      return error instanceof BodyTooLarge
        ? jsonRpcError(res, 413, `Тело запроса больше ${cfg.maxBodyBytes} байт`)
        : jsonRpcError(res, 400, "Тело запроса — не JSON");
    }

    const server = build(authorization);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    const started = Date.now();
    res.on("finish", () => {
      const methods = (Array.isArray(body) ? body : [body]).map((m) => (m as { method?: string })?.method ?? "?").join(",");
      console.error(`${new Date().toISOString()} ${basicUser(authorization)} ${methods} ${res.statusCode} ${Date.now() - started}ms`);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) jsonRpcError(res, 500, "Внутренняя ошибка MCP-сервера");
    }
  };

  const listener = (req: IncomingMessage, res: ServerResponse) => void handle(req, res);
  const server = cfg.tls ? createTlsServer(cfg.tls, listener) : createPlainServer(listener);
  server.listen(cfg.port, cfg.host, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : cfg.port;
    const host = cfg.host.includes(":") ? `[${cfg.host}]` : cfg.host;
    console.error(`sap-cats MCP слушает ${cfg.tls ? "https" : "http"}://${host}:${port}${cfg.path}`);
  });
  return server;
}

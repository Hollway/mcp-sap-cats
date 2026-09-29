/**
 * Клиент ICF-хендлера. Учётные данные уходят в SAP как есть — авторизацию
 * выполняет сам SAP, поэтому ни ролей, ни проверок прав на этой стороне нет.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * MCP-клиент (Claude Code) запускает `node dist/index.js` напрямую, .env
 * никто за нас не читает. Без внешней зависимости — она не встанет там,
 * где не проходит npm install за прокси.
 *
 * Переменные, которые Node читает при старте процесса (NODE_EXTRA_CA_CERTS,
 * NODE_OPTIONS=--use-system-ca, NODE_USE_ENV_PROXY), отсюда уже не действуют — их
 * задают в окружении запуска. SAP_CATS_DOTENV=0 отключает чтение файла (тесты).
 */
function loadDotenv(): void {
  if (process.env.SAP_CATS_DOTENV === "0") return;
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let content: string;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of content.replace(/^\uFEFF/, "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = dotenvValue(trimmed.slice(eq + 1).trim());
  }
}

/** Значение в кавычках берётся как есть без кавычек; у значения без кавычек « #…» в конце — комментарий. */
export function dotenvValue(raw: string): string {
  const quote = raw[0];
  if ((quote === '"' || quote === "'") && raw.length >= 2 && raw.endsWith(quote)) return raw.slice(1, -1);
  return raw.replace(/\s+#.*$/, "");
}

/** Целое из переменной окружения в пределах [min, max]; опечатка должна остановить запуск, а не дать NaN. */
export function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}=${raw}: нужно целое число от ${min} до ${max}`);
  }
  return value;
}

export interface SapConfig {
  url: string;
  client: string;
  /** Пусты в HTTP-режиме: там учётные данные приходят с каждым запросом клиента. */
  user?: string;
  password?: string;
  profile: string;
  /** Язык сеанса ICF (sap-language); пусто — язык пользователя по умолчанию. */
  language: string;
  timeoutMs: number;
  lockRetries: number;
  lockRetryDelayMs: number;
}

export interface BapiMessage {
  type: "S" | "E" | "W" | "I" | "A";
  id: string;
  /** NUMC 3: /ui2/cl_json отдаёт его числом (2), а не строкой ("002"). */
  number: string | number;
  text: string;
  /** Номер записи во входном массиве с 1; 0 — сообщение относится ко всему вызову. */
  row?: number;
}

export class SapError extends Error {
  constructor(message: string, readonly status?: number, readonly messages: BapiMessage[] = []) {
    super(message);
    this.name = "SapError";
  }
}

export type McpTransport = "stdio" | "http";

export function loadConfig(): SapConfig & { transport: McpTransport } {
  loadDotenv();

  const transport = process.env.MCP_TRANSPORT || "stdio";
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`MCP_TRANSPORT=${transport}: допустимо stdio или http`);
  }

  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Не задана переменная окружения ${name} — см. .env.example`);
    return value;
  };

  return {
    transport,
    url: required("SAP_CATS_URL").replace(/\/+$/, ""),
    client: process.env.SAP_CLIENT ?? "100",
    ...(transport === "stdio" ? { user: required("SAP_USER"), password: required("SAP_PASSWORD") } : {}),
    profile: process.env.SAP_CATS_PROFILE ?? "TIME_D1",
    language: (process.env.SAP_LANGUAGE ?? "").trim(),
    timeoutMs: envInt("SAP_TIMEOUT_MS", 60_000, 1_000, 600_000),
    lockRetries: envInt("SAP_LOCK_RETRIES", 2, 0, 10),
    lockRetryDelayMs: envInt("SAP_LOCK_RETRY_DELAY_MS", 2_000, 0, 60_000),
  };
}

const WRITE_PATHS = new Set(["/insert", "/change", "/delete", "/release"]);

const UNKNOWN_RESULT =
  "Результат записи неизвестен: сначала проверьте cats_read; cats_insert повторяйте только с тем же idempotency_key — новый ключ задвоит часы.";

const TLS_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/;
const UNREACHABLE_CODES = /^(ENOTFOUND|ECONNREFUSED|EHOSTUNREACH)$/;

/** Код и текст из error.cause: fetch прячет за «fetch failed» и сертификат, и DNS, и обрыв сокета. */
function networkError(error: unknown, path: string): SapError {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ?? "";
  const tls = TLS_CODES.test(code);
  const unreachable = UNREACHABLE_CODES.test(code);
  const hint = tls
    ? " Сертификат SAP не доверен: задайте NODE_EXTRA_CA_CERTS (или NODE_OPTIONS=--use-system-ca) в окружении запуска MCP — из .env Node их уже не прочитает."
    : unreachable
      ? " Проверьте адрес SAP_CATS_URL и доступ к хосту из этой сети."
      : "";
  const unknown = WRITE_PATHS.has(path) && !tls && !unreachable ? ` ${UNKNOWN_RESULT}` : "";
  return new SapError(`Нет связи с SAP: ${[code, cause?.message ?? String(error)].filter(Boolean).join(" ")}.${hint}${unknown}`);
}

/**
 * LR2 «Транзакцию блокирует пользователь» — enqueue самого SAP, чаще всего
 * своей же только что закрытой транзакции. Проходит со второй попытки, а
 * повтор безопасен: при E-сообщении хендлер откатывает LUW, /insert к тому же
 * идемпотентен по ключу.
 */
export const isLocked = (messages: BapiMessage[] | undefined): boolean =>
  (messages ?? []).some((m) => m.type === "E" && m.id === "LR" && Number(m.number) === 2);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const basicAuthorization = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

export class SapClient {
  private readonly authorization: string;

  /** authorization — готовый заголовок клиента в HTTP-режиме; без него — логин из .env. */
  constructor(private readonly cfg: SapConfig, authorization?: string) {
    this.authorization = authorization ?? basicAuthorization(cfg.user ?? "", cfg.password ?? "");
  }

  async call<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const data = await this.request<T>(path, method, body);
      const messages = (data as { messages?: BapiMessage[] }).messages;
      if (!isLocked(messages) || attempt >= this.cfg.lockRetries) return data;
      await sleep(this.cfg.lockRetryDelayMs * (attempt + 1));
    }
  }

  private async request<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    const url = new URL(this.cfg.url + path);
    url.searchParams.set("sap-client", this.cfg.client);
    if (this.cfg.language) url.searchParams.set("sap-language", this.cfg.language);
    const unknown = WRITE_PATHS.has(path) ? ` ${UNKNOWN_RESULT}` : "";

    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: this.authorization,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new SapError(`SAP не ответил за ${this.cfg.timeoutMs / 1000} с.${unknown}`);
      }
      throw networkError(error, path);
    }

    if (response.status === 401) {
      throw new SapError("SAP отклонил учётные данные. Проверьте логин и пароль SAP (SAP_USER и SAP_PASSWORD в .env или заголовок Authorization в настройках MCP-клиента).", 401);
    }
    if (response.status === 403) {
      throw new SapError(
        "SAP не пустил к узлу /sap/bc/zcats (HTTP 403): узел не активен в SICF этой системы или у пользователя нет доступа к нему. Полномочия на табельный номер здесь ни при чём — их нехватка приходит сообщением BAPI.",
        403,
      );
    }
    if (!response.ok) {
      throw new SapError(`Хендлер вернул ${response.status}: ${text.slice(0, 500)}${response.status >= 500 ? unknown : ""}`, response.status);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new SapError(
        `SAP вернул не JSON (HTTP ${response.status}) — похоже на страницу входа или ошибки ICF, а не на ответ хендлера: ${text.slice(0, 200)}${unknown}`,
        response.status,
      );
    }
  }
}

/** Разбор BAPIRET2 в человекочитаемый текст с привязкой к номеру строки. */
export function formatMessages(messages: BapiMessage[]): string {
  if (messages.length === 0) return "";
  return messages
    .map((m) => {
      const where = m.row ? `строка ${m.row}: ` : "";
      const severity = { E: "Ошибка", A: "Прерывание", W: "Предупреждение", I: "Информация", S: "Успешно" }[m.type];
      return `${severity} · ${where}${m.text} (${m.id}${String(m.number).padStart(3, "0")})`;
    })
    .join("\n");
}

export const hasErrors = (messages: BapiMessage[]): boolean =>
  messages.some((m) => m.type === "E" || m.type === "A");

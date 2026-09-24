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
 */
function loadDotenv(): void {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let content: string;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

export interface SapConfig {
  url: string;
  client: string;
  /** Пусты в HTTP-режиме: там учётные данные приходят с каждым запросом клиента. */
  user?: string;
  password?: string;
  profile: string;
  timeoutMs: number;
  lockRetries: number;
  lockRetryDelayMs: number;
}

export interface BapiMessage {
  type: "S" | "E" | "W" | "I" | "A";
  id: string;
  number: string;
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
    timeoutMs: Number(process.env.SAP_TIMEOUT_MS ?? 60_000),
    lockRetries: Number(process.env.SAP_LOCK_RETRIES ?? 2),
    lockRetryDelayMs: Number(process.env.SAP_LOCK_RETRY_DELAY_MS ?? 2_000),
  };
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

    let response: Response;
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
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new SapError(
          `SAP не ответил за ${this.cfg.timeoutMs / 1000} с. Для записывающих вызовов результат неизвестен: проверьте cats_read, cats_insert можно безопасно повторить с тем же idempotency_key.`,
        );
      }
      throw error;
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
      throw new SapError(`Хендлер вернул ${response.status}: ${await response.text()}`, response.status);
    }

    return (await response.json()) as T;
  }
}

/** Разбор BAPIRET2 в человекочитаемый текст с привязкой к номеру строки. */
export function formatMessages(messages: BapiMessage[]): string {
  if (messages.length === 0) return "";
  return messages
    .map((m) => {
      const where = m.row ? `строка ${m.row}: ` : "";
      const severity = { E: "Ошибка", A: "Прерывание", W: "Предупреждение", I: "Информация", S: "Успешно" }[m.type];
      return `${severity} · ${where}${m.text} (${m.id}${m.number})`;
    })
    .join("\n");
}

export const hasErrors = (messages: BapiMessage[]): boolean =>
  messages.some((m) => m.type === "E" || m.type === "A");

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
  user: string;
  password: string;
  profile: string;
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

export function loadConfig(): SapConfig {
  loadDotenv();

  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Не задана переменная окружения ${name} — см. .env.example`);
    return value;
  };

  return {
    url: required("SAP_CATS_URL").replace(/\/+$/, ""),
    client: process.env.SAP_CLIENT ?? "100",
    user: required("SAP_USER"),
    password: required("SAP_PASSWORD"),
    profile: process.env.SAP_CATS_PROFILE ?? "TIME_D1",
  };
}

export class SapClient {
  constructor(private readonly cfg: SapConfig) {}

  async call<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.cfg.user}:${this.cfg.password}`).toString("base64");
    const url = new URL(this.cfg.url + path);
    url.searchParams.set("sap-client", this.cfg.client);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 401) {
      throw new SapError("SAP отклонил учётные данные. Проверьте SAP_USER и SAP_PASSWORD.", 401);
    }
    if (response.status === 403) {
      throw new SapError(
        "Недостаточно полномочий. Круг доступных табельных номеров определяют P_ORGIN и структурная авторизация вашего пользователя.",
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

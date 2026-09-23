import { z } from "zod";

export const CATS_PROFILES = ["TIME_D1", "TIME_W1", "TIME_M1"] as const;

export const CATS_STATUS: Record<string, string> = {
  "10": "В обработке",
  "20": "Деблокировано для утверждения",
  "30": "Утверждено",
  "40": "Утверждение отклонено",
  "50": "После утверждения изменено",
  "60": "Сторнировано",
};

export const pernr = z
  .string()
  .regex(/^\d{1,8}$/)
  .describe("Табельный номер, до 8 цифр");

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Дата в формате YYYY-MM-DD");

export const profile = z
  .enum(CATS_PROFILES)
  .describe("Профиль ввода данных CATS");

/**
 * Объект отнесения. Ровно один вид на запись — взаимоисключение проверяется
 * здесь, до вызова SAP, чтобы ошибка приходила понятным текстом, а не
 * сообщением BAPI о несовместимых полях.
 */
export const receiver = z.union([
  z.object({ order: z.string().max(12) }).strict(),
  z.object({ cost_center: z.string().max(10), co_area: z.string().max(4) }).strict(),
  z.object({ wbs: z.string().max(24) }).strict(),
  z.object({ network: z.string().max(12), activity: z.string().max(4), sub_activity: z.string().max(4).optional() }).strict(),
  z.object({ sales_order: z.string().max(10), item: z.string().max(6) }).strict(),
  z.object({ purchase_order: z.string().max(10), item: z.string().max(5) }).strict(),
]);

export const CATS_YTR_STATUS: Record<string, string> = {
  "0": "Новый документ",
  "1": "Опубликовано",
  "2": "Передано в работу",
  "3": "В работе",
  "4": "Тестирование",
  "5": "Выполнено",
  "6": "На согласовании",
  "7": "Удалено",
  "9": "В продуктиве",
};

export const ytrKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9]*-\d+$/)
  .describe("Ключ задачи в Яндекс Трекере, например SAP-19109");

/**
 * Z-поля CATSDB, уходят в EXTENSIONIN через структуру BAPI_TE_CATSDB.
 * Проект обязателен: пользовательский выход ZXCATU05 отбраковывает запись
 * без активного проекта (ZCATS001). Вместо пары проект + номер ТЗ можно
 * передать ytr_key — MCP сам найдёт пару до вызова SAP.
 *
 * Описание при заданном номере ТЗ подставляет выход ZXCATU02 (как в CAT2),
 * без номера ТЗ его вводят вручную — поэтому тогда оно обязательно.
 */
export const extFields = z
  .object({
    rqsnb: z.string().regex(/^\d{1,5}$/).optional().describe("Номер ТЗ"),
    prjct: z.string().max(30).optional().describe("Проект; можно не указывать, если задан ytr_key"),
    ytr_key: ytrKey.optional().describe("Ключ задачи в Трекере вместо пары prjct + rqsnb"),
    descr: z
      .string()
      .max(35)
      .optional()
      .describe("Описание работ; при заданном номере ТЗ подставится из названия ТЗ, без номера ТЗ — обязательно"),
    orgunit: z.string().max(35).optional().describe("Оргединица; SAP заполняет её сам из оргструктуры"),
  })
  .strict()
  .refine((e) => e.prjct || e.ytr_key, { message: "Нужен ext.prjct или ext.ytr_key" })
  .refine((e) => e.rqsnb || e.ytr_key || e.descr, {
    message: "Без номера ТЗ описание работ (ext.descr) обязательно — в CAT2 его вводят вручную",
  });

export const catsRecord = z
  .object({
    workdate: isoDate,
    hours: z.number().positive().multipleOf(0.25),
    receiver: receiver.optional().describe("Объект отнесения — не обязателен, реальные записи его не используют"),
    unit: z.string().max(3).default("STD"),
    wagetype: z.string().max(4).default("M120"),
    acttype: z.string().max(6).optional().describe("Вид работ"),
    send_cctr: z.string().max(10).optional().describe("МВЗ-отправитель"),
    shorttext: z.string().max(40).optional(),
    start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    attendance_type: z.string().max(4).optional(),
    longtext: z
      .string()
      .max(4000)
      .optional()
      .describe("Подробный текст записи, если 40 символов shorttext мало; переводы строк сохраняются"),
    ext: extFields,
  })
  .strict();

export const catsRecordWithCounter = catsRecord.extend({
  counter: z.string().max(12).describe("Ключ записи CATSDB"),
});

export type CatsRecord = z.infer<typeof catsRecord>;
export type Receiver = z.infer<typeof receiver>;

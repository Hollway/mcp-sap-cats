# Контракт ICF-хендлера

Node-сторона написана против этого контракта. ABAP-класс ещё не создан — при его разработке контракт либо соблюдается, либо правится здесь и в `src/index.ts` одновременно.

## Узел

Базовый путь: `/sap/bc/zcats` в целевой SAP-системе.

**Данные логона в узле не сохраняются.** Авторизацию выполняет SAP по заголовку `Authorization: Basic`, полномочия вызывающего пользователя определяют, чьи табельные номера ему доступны.

## Общее

- Тело запроса и ответа — JSON, UTF-8.
- Мандант приходит в `sap-client`.
- Ответ всегда содержит `messages` — разобранный `BAPIRET2`:
  ```json
  { "type": "E", "id": "CATS", "number": "042", "text": "...", "row": 2 }
  ```
- `row` — номер записи во входном массиве, начиная с 1. Без него сообщение относится ко всему вызову.
- Ошибка полномочий — HTTP 403, неверные учётные данные — 401. Прикладные ошибки приходят с HTTP 200 и типом `E` в `messages`.

## Маршруты

| Метод | Путь | BAPI | Фиксация |
|---|---|---|---|
| POST | `/read` | чтение `CATSDB` | — |
| POST | `/capacity` | `CATSDB` + `HOLIDAY_GET` | — |
| POST | `/validate` | `BAPI_CATIMESHEETMGR_INSERT`, `TESTRUN = 'X'` | нет |
| POST | `/insert` | `BAPI_CATIMESHEETMGR_INSERT` | `BAPI_TRANSACTION_COMMIT` в том же вызове |
| POST | `/change` | `BAPI_CATIMESHEETMGR_CHANGE` | то же |
| POST | `/delete` | `BAPI_CATIMESHEETMGR_DELETE` | то же |
| POST | `/release` | `BAPI_CATIMESHEETMGR_INSERT`, `RELEASE_DATA = 'X'` | то же |

**Фиксация обязана происходить внутри того же обращения к хендлеру, что и вызов BAPI.** При stateless HTTP каждый запрос — новая LUW, и запись пропадёт молча.

## Идемпотентность

`idempotency_key` из запроса раскладывается в `BAPICATS1`:

- `EXTSYSTEM` — постоянное значение, например `MCP`
- `EXTAPPLICATION` — `CATS`
- `EXTDOCUMENTNO` — сам ключ

Перед вставкой хендлер проверяет, нет ли в `CATSDB` записи с тем же `EXTDOCUMENTNO`. Если есть — возвращает её `COUNTER` и сообщение типа `S`, ничего не создавая.

## Z-поля

`ZZRQSNB`, `ZZPRJCT`, `ZZDESCR`, `ZZORGUNIT` передаются в `EXTENSIONIN` структурой `BAPI_TE_CATSDB`. Она уже существует, доработка словаря не требуется.

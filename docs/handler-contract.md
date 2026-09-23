# Контракт ICF-хендлера

Node-сторона написана против этого контракта, ABAP-класс `ZCL_CATS_MCP_HANDLER` (`abap/`) его реализует. Изменения контракта вносятся здесь, в `src/index.ts` и в хендлере одновременно; Node-сторона контракта покрыта `npm test` (фейковый хендлер в `test/server.test.mjs`).

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
- `row` — номер записи во входном массиве, начиная с 1. `0` — сообщение относится ко всему вызову. Поля `messages`, `committed` и массивы результатов присутствуют всегда, даже пустые (`/ui2/cl_json` вызывается без `compress`).
- Ошибка полномочий — HTTP 403, неверные учётные данные — 401. Прикладные ошибки приходят с HTTP 200 и типом `E` в `messages`.

## Маршруты

| Метод | Путь | BAPI | Фиксация |
|---|---|---|---|
| POST | `/read` | чтение `CATSDB` | — |
| POST | `/capacity` | `CATSDB` + `DATE_CONVERT_TO_FACTORYDATE` (календарь `BY`) | — |
| POST | `/validate` | `BAPI_CATIMESHEETMGR_INSERT`, `TESTRUN = 'X'` + дневной лимит | нет |
| POST | `/insert` | `BAPI_CATIMESHEETMGR_INSERT` + дневной лимит | `BAPI_TRANSACTION_COMMIT` в том же вызове |
| POST | `/change` | `BAPI_CATIMESHEETMGR_CHANGE` | то же |
| POST | `/delete` | `BAPI_CATIMESHEETMGR_DELETE` | то же |
| POST | `/release` | `BAPI_CATIMESHEETMGR_CHANGE`, `RELEASE_DATA = 'X'`, ресенд строки из `CATSDB` | то же |

**Фиксация обязана происходить внутри того же обращения к хендлеру, что и вызов BAPI.** При stateless HTTP каждый запрос — новая LUW, и запись пропадёт молча.

## Идемпотентность

`idempotency_key` из запроса раскладывается в `BAPICATS1`:

- `EXTSYSTEM` — постоянное значение, например `MCP`
- `EXTAPPLICATION` — `CATS`
- `EXTDOCUMENTNO` — сам ключ

Перед вставкой хендлер проверяет, нет ли в `CATSDB` записи с тем же `EXTDOCUMENTNO`. Если есть — возвращает её `COUNTER` и сообщение типа `S`, ничего не создавая.

## Z-поля

`ZZRQSNB`, `ZZPRJCT`, `ZZDESCR`, `ZZORGUNIT` передаются в `EXTENSIONIN` структурой `BAPI_TE_CATSDB`. Она уже существует, доработка словаря не требуется.

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
| POST | `/change` | `BAPI_CATIMESHEETMGR_CHANGE` + дневной лимит (часы изменяемых записей не складываются с новыми) | то же |
| POST | `/delete` | `BAPI_CATIMESHEETMGR_DELETE` | то же |
| POST | `/release` | `BAPI_CATIMESHEETMGR_CHANGE`, `RELEASE_DATA = 'X'`, ресенд строки из `CATSDB` | то же |
| POST | `/whoami` | `PA0105` (подтип `0001`) по `sy-uname`, `PA0001`, `T527X` | — |
| POST | `/projects` | `ZBTPRJCT`/`ZBTPRJCTT`; с `prjct` — ТЗ из `ZBTPROJECT`/`ZBTREQSPT` и `ZYTRPROJ`; с `ytr_key` — пара из `ZYTRPROJ`, затем `ZBTPROJECT` | — |

Дневной лимит, `/capacity` и `total_hours` в `/read` не учитывают сторнированные записи (статус `60`): они сохраняют часы в `CATSDB`.

Подробный текст записи — поле `longtext` (строка с переводами строк) в `records` маршрутов `/validate`, `/insert`, `/change`; уходит в параметр `LONGTEXT` BAPI (`BAPICATS8`, по 132 символа). `/read` возвращает только признак `longtext`. `/change` и `/release` передают `TEXT_FORMAT_IMP = 'ITF'`; `/release` пересылает существующий подробный текст, иначе BAPI его удалит.

`ext.ytr_key` (ключ задачи Трекера) хендлеру не передаётся: MCP заранее переводит его в `prjct` + `rqsnb` через `/projects`. Описание (`ext.descr`) при заданном номере ТЗ можно не передавать — его подставит пользовательский выход CATS `ZXCATU02`.

**Фиксация обязана происходить внутри того же обращения к хендлеру, что и вызов BAPI.** При stateless HTTP каждый запрос — новая LUW, и запись пропадёт молча.

## Идемпотентность

`idempotency_key` из запроса раскладывается в `BAPICATS1`:

- `EXTSYSTEM` — постоянное значение, например `MCP`
- `EXTAPPLICATION` — `CATS`
- `EXTDOCUMENTNO` — сам ключ

Перед вставкой хендлер проверяет, нет ли в `CATSDB` записи с тем же `EXTDOCUMENTNO`. Если есть — возвращает её `COUNTER` и сообщение типа `S`, ничего не создавая.

## Z-поля

`ZZRQSNB`, `ZZPRJCT`, `ZZDESCR`, `ZZORGUNIT` передаются в `EXTENSIONIN` структурой `BAPI_TE_CATSDB`. Она уже существует, доработка словаря не требуется.

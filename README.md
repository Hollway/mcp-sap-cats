# mcp-sap-cats

MCP-сервер для таймшитов SAP — транзакция CAT2 / CATS. Задача **SAP-18862**.

Чтение и заполнение учёта времени через стандартные `BAPI_CATIMESHEETMGR_*`, вызываемые из собственного ICF-хендлера в целевой SAP-системе.

## Установка

```bash
npm install
npm run build
```

Скопировать `.env.example` в `.env` и заполнить. Сертификат корпоративного CA задаётся через `NODE_EXTRA_CA_CERTS` — без него самоподписанный сертификат SAP-хоста не пройдёт проверку.

## Тесты

```bash
npm test
```

Собирает проект и прогоняет `node:test` без обращения к SAP: схемы входных параметров, разбор сообщений и сквозной тест MCP-сервера против фейкового ICF-хендлера (`test/server.test.mjs`).

## Отладка

```bash
npm run dev
```

Откроет MCP Inspector: список инструментов виден сразу, вызывать можно руками, без перезапуска Claude.

Всё, что попадает в stdout, — это протокол. Отладочный вывод только через `console.error`.

## Подключение

```bash
claude mcp add-json --scope user sap-cats "{\"command\":\"node\",\"args\":[\"C:\\\\Tools\\\\mcp-sap-cats\\\\dist\\\\index.js\"]}"
```

Правка `claude_desktop_config.json` руками не работает: приложение перезаписывает файл из памяти при перезапуске.

## Инструменты

| Инструмент | Назначение |
|---|---|
| `cats_read` | Вывод таймшита за период |
| `cats_capacity` | Свободные часы по дням |
| `cats_validate` | Проверка записей без сохранения (`TESTRUN`) |
| `cats_insert` | Создание записей, в том числе за несколько дней сразу |
| `cats_change` | Изменение существующих записей |
| `cats_delete` | Удаление записей |
| `cats_release` | Деблокирование для утверждения |

Входные и выходные параметры — в `docs/solution.md`, контракт с ABAP-стороной — в `docs/handler-contract.md`.

## Состояние

Узел SICF `/sap/bc/zcats` заведён и активен, хендлер `ZCL_CATS_MCP_HANDLER` — в системе. `cats_read`, `cats_validate`, `cats_insert`, `cats_change`, `cats_delete` и `cats_release` реализованы и проверены на реальных данных. `cats_capacity` пока отвечает заглушкой (HTTP 501). Порядок работ и открытые вопросы — в `CLAUDE.md`.

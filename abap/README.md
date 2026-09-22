# ABAP-сторона

Здесь держим копию исходника ICF-хендлера для ревью и истории. Боевой объект живёт в целевой SAP-системе и попадает туда транспортом — этот каталог не источник истины, при расхождении верить системе (сверять через ADT).

## Состояние (2026-09-22)

- `ZCL_CATS_MCP_HANDLER` — создан, активен. Пакет `ZCATS`. Копия — [zcl_cats_mcp_handler.clas.abap](zcl_cats_mcp_handler.clas.abap).
  - `/read`, `/validate`, `/insert`, `/change`, `/delete`, `/release` — реализованы полностью, проверены вживую через сам MCP-сервер, включая реальные коммиты.
  - `/capacity` — единственная оставшаяся заглушка, отвечает HTTP 501.
- Узел SICF `/sap/bc/zcats` — создан и активен, обработчик назначен, **без сохранённых данных логона**.

Контракт, который класс обязан соблюдать, — в `../docs/handler-contract.md` (для `/read` реализация чуть проще контракта: ответ `{rows, total_hours, messages}`, поля строки — `counter, workdate, pernr, rec_cctr, rec_order, acttype, wagetype, unit, hours, status, rqsnb, prjct, descr, orgunit`).

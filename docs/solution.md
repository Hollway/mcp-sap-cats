# Техническое решение SAP-18862

Оформленная версия на согласование: https://claude.ai/code/artifact/f96144c4-e409-4855-a56f-1ce2a21f6300

Решения, факты о системе и подвохи профилей — в `CLAUDE.md`. Здесь только перечень инструментов с параметрами, то есть требуемый ТЗ результат.

## Структура записи

Объект `record` переиспользуется в `cats_validate`, `cats_insert` и `cats_change`.

| Поле | Тип | Поле BAPICATS1 | Обяз. |
|---|---|---|---|
| `workdate` | дата `YYYY-MM-DD` | `WORKDATE` | да |
| `hours` | число, шаг 0,25 | `CATSHOURS` | да |
| `receiver` | объект отнесения, ровно один вид | см. ниже | нет |
| `unit` | ЕИ времени, по умолчанию `STD` | `UNIT` | нет |
| `wagetype` | вид оплаты, по умолчанию `M120` | `WAGETYPE` | нет |
| `acttype` | вид работ | `ACTTYPE` | нет |
| `send_cctr` | МВЗ-отправитель | `SEND_CCTR` | нет |
| `shorttext` | текст до 40 символов | `SHORTTEXT` | нет |
| `start_time`, `end_time` | время `ЧЧ:ММ` | `STARTTIME`, `ENDTIME` | нет |
| `attendance_type` | вид присутствия/отсутствия | `ABS_ATT_TYPE` | нет |
| `ext.rqsnb` | номер ТЗ | `EXTENSIONIN` → `ZZRQSNB` | нет |
| `ext.prjct` | проект | `EXTENSIONIN` → `ZZPRJCT` | нет |
| `ext.descr` | описание | `EXTENSIONIN` → `ZZDESCR` | нет |
| `ext.orgunit` | оргединица | `EXTENSIONIN` → `ZZORGUNIT` | нет |
| `counter` | ключ записи, только для изменения и удаления | `BAPICATS4-COUNTER` | — |

### Виды объекта отнесения

| Вид | Форма | Поля BAPICATS1 |
|---|---|---|
| Заказ | `{ order }` | `REC_ORDER` |
| МВЗ | `{ cost_center, co_area }` | `REC_CCTR` + `CO_AREA` |
| СПП-элемент | `{ wbs }` | `WBS_ELEMENT` |
| Операция сети | `{ network, activity, sub_activity? }` | `NETWORK` + `ACTIVITY` |
| Заказ клиента | `{ sales_order, item }` | `RECSALEORD` + `RECITEM` |
| Заказ на закупку | `{ purchase_order, item }` | `PO_NUMBER` + `PO_ITEM` |

## Инструменты

Все возвращают `messages[]` — разобранный `BAPIRET2` с типом, номером и текстом.

### `cats_read` — вывод таймшита

**Вход:** `pernr*`, `date_from*`, `date_to*`, `status[]`
**Выход:** `rows[]` (counter, workdate, hours, unit, wagetype, receiver, acttype, shorttext, status, status_text, ext, created_by, created_at), `total_hours`

Читается напрямую из `CATSDB`, а не через `BAPI_CATIMESHEETRECORD_GETLIST`: быстрее и отдаёт Z-поля без расширений.

### `cats_capacity` — свободные часы по дням

**Вход:** `pernr*`, `date_from*`, `date_to*`, `norm_hours` (8)
**Выход:** `days[]` (date, is_workday, booked, free), `norm_hours`, `calendar`, `total_free`

Праздники и рабочие дни — по календарю `BY`.

### `cats_validate` — проверка без сохранения

**Вход:** `pernr*`, `profile*`, `records[]*`
**Выход:** `ok`, `messages[]`, `hours_by_day[]`

Валидацию выполняет сама BAPI по профилю через `TESTRUN`. Ничего не пишет и не коммитит.

### `cats_insert` — создание записей

**Вход:** `pernr*`, `profile*`, `records[]*`, `idempotency_key*`, `release` (false)
**Выход:** `created[]` (row, counter, workdate, hours), `committed`, `messages[]`

### `cats_change` — изменение

**Вход:** `profile*`, `records[]*` (каждая с `counter`), `test` (false)
**Выход:** `changed[]`, `committed`, `messages[]`

Записи в статусах 30 и 50 отклоняются до вызова BAPI, с указанием статуса.

### `cats_delete` — удаление

**Вход:** `profile*`, `counters[]*`, `test` (false)
**Выход:** `deleted[]`, `committed`, `messages[]`

### `cats_release` — деблокирование для утверждения

**Вход:** `pernr*`, `counters[]` либо `date_from`/`date_to`
**Выход:** `released[]`, `messages[]`

Переводит записи из статуса 10 в 20.

## Оценка

| Блок | Дней |
|---|---|
| Проверка гипотез через `TESTRUN` | 0,5 |
| ICF-хендлер и узел SICF | 1,0 |
| MCP-сервер, модель полей, семь инструментов | 2,5 |
| Идемпотентность | 0,5 |
| Разбор `BAPIRET2` | 0,5 |
| Тесты и приёмка | 1,0 |
| **Итого** | **6,0** |

Против `P1W` в ТЗ — на день больше. Разница: идемпотентность и разбор сообщений, которых в постановке не было.

Не входит: настройка четвёртого профиля ввода данных, если подтвердится упор в `PERLEFT`, и заведение узла SICF силами базиса.

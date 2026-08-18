## Why

Тесты адаптера ванили (change `store-and-dataset-tests`) вскрыли два дефекта в
`pipeline/extract_vanilla.py`, из-за которых ванильный режим считает неверно:

1. В таблице `RVI(...)` (`vendor/openttd/src/table/engines.h`) восьмая колонка — класс
   содержания (`RC_S`/`RC_D`/`RC_E`/`RC_W`), одиннадцатая — класс двигателя (`S`/`D`/`E`/`N`/`V`).
   Экстрактор читает их наоборот: `engine_class` получает `RC_S`, а класс содержания
   ищется по `S` и не находится → **все** ванильные машины получают дизельную базу
   содержания (5200 вместо 5600 у паровозов, 4800 у электровозов). Побочно
   `power_by_source` содержит мусор `RC_*`, и оптимизатор не умеет отличить ванильный
   электровоз (переключатель «линия электрифицирована» на него не действует).
2. Метка ванильного груза берётся из имени константы (`CT_OIL` → `OIL`), а настоящая
   `CargoLabel` живёт в `vendor/openttd/src/cargo_type.h` (`CT_OIL{"OIL_"}`,
   `CT_PASSENGERS{"PASS"}`, `CT_GOODS{"GOOD"}`…). Iron Horse и FIRS используют настоящие
   метки, поэтому режим «Iron Horse + ванильные грузы» (FIRS выключен) сцепляет вагоны
   с грузом только там, где имя совпало случайно (`COAL`, `MAIL`, `WOOD`, `FOOD`) — 27 из
   31 груза не возятся ничем.

## What Changes

- `extract_vanilla.py`: `running_cost_class` ← колонка `RC_*`, `engine_class` ← колонка
  класса двигателя (нормализованная: `steam`/`diesel`/`electric`/`monorail`/`maglev`);
  метки грузов и `default_cargo` машин — из `cargo_type.h`; `CT_NONE` (локомотив без
  груза) → `default_cargo: null`; удаляется мёртвая сверка имени с `name_list`.
- `web/src/vanilla.ts`: `power_by_source` по классу двигателя (`electric` → `OHLE`, чтобы
  работал `isPureElectric`); `default_cargos` без `replace('CT_', '')`.
- `web/src/i18n/cargos.ru.json`: записи `CT_*` заменяются настоящими метками для грузов,
  которых нет в FIRS (`LVST`, `GOOD`, `GRAI`, `WHEA`, `VALU`, тойленд…).
- `pipeline/validate.py`, `pipeline/tests/test_known_values.py`: `CT_COAL` → `COAL`.
- Тесты, отложенные из `store-and-dataset-tests`: Kirby — `running_steam`, электровозы —
  `OHLE`, метки грузов ванили совпадают с игрой, `canCarryIn` в режиме IH без FIRS
  сцепляет пассажирский вагон с `PASS`.
- Найдено по ходу и исправлено тем же change: (а) `MCT_*` — климат-зависимые грузы
  вагонов (`MCT_GRAIN_WHEAT_MAIZE`) → `default_cargos` списком; (б) монорельс и маглев
  (`O`/`L`) считались обычными путями → типы `MONO`/`MAGLEV` в данных и настройке;
  (в) `model_life` ванильных вагонов → бесконечный (`engine.cpp:141`); (г) к ванильным
  машинам применялись basecost-шифты Iron Horse → `dataset.activeTrainsMeta(game)` с
  нулевыми шифтами; (д) `running_cost_base` ванили — словарь Iron Horse (`RUNNING_COST_*`).
- **BREAKING**: содержание и покупка ванильных машин меняются; в режиме «Iron Horse без
  FIRS» появляются грузы, которых раньше нельзя было выбрать; маглев/монорельс уходят с RAIL.

## Non-goals

- Прочий техдолг пайплайна (общий бутстрап, `requirements.txt`, схемы) — отдельный change.
- Иконки ванильных грузов — путь строится по `id` (`oil`), он не меняется.

## Semver

**major** — те же настройки дают другие числа содержания у ванильных паровозов/электровозов.

## Источник истины

`vendor/openttd/src/table/engines.h` (макрос `RVI`, строки ~380–410: `#define RC_S
Price::RunningTrainSteam`, `#define S EngineClass::Steam`; строка 416 — Kirby Paul Tank
`RC_S … S`), `vendor/openttd/src/cargo_type.h` (`CT_PASSENGERS{"PASS"}` и далее),
`vendor/openttd/src/table/cargo_const.h` (макрос `MK`).

## Capabilities

### New Capabilities
- `vanilla-dataset`: что калькулятор считает «ванильными данными» — машины из таблиц
  игры с классами двигателя/содержания и настоящими метками грузов, совместимыми с
  метками NewGRF.

### Modified Capabilities
<!-- нет -->

## Impact

- Данные: `web/src/data/vanilla_trains.json`, `vanilla_cargos.json` перегенерируются
  (`make data`); `meta.json`.
- Код: `pipeline/extract_vanilla.py`, `pipeline/validate.py`, `pipeline/tests/test_known_values.py`,
  `web/src/vanilla.ts`, `web/src/i18n/cargos.ru.json`.
- Тесты: `web/src/__tests__/vanilla.test.ts`, `dataset.test.ts`, `i18n/__tests__/locales.test.ts`.

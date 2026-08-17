# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это

Веб-калькулятор для OpenTTD + Iron Horse (ростер Pony) + FIRS 5: подбор лучшего состава под
задачу, конструктор составов, доход перевозок, цепочки FIRS, прибыльность. Двухчастная
архитектура:

- `pipeline/` — Python-экстракторы. Импортируют исходники Iron Horse/FIRS из `vendor/`
  **напрямую как Python-модули** (без компиляции NewGRF) и пишут статические JSON в
  `web/src/data/` + иконки грузов и спрайты машин в `web/public/icons/`. JSON закоммичены —
  SPA собирается без Python. `extract_vanilla.py` парсит таблицы самой игры, чтобы расчёт
  работал при отключённых NewGRF.
- `web/` — React 19 + Vite + TypeScript SPA. Игровые формулы — чистые TS-модули в
  `web/src/engine/` (income/physics/costs/inflation/units/optimize/consist/settings),
  UI-фичи в `web/src/features/`, zustand-сторы (persist в localStorage) в `web/src/state/`.
  i18n: все UI-строки через `t()` из `web/src/i18n/`.

Вкладки: Best train (оптимизатор), Consist builder, Route income, FIRS chains,
Profitability, Settings.

## Команды

- `make fetch` — shallow-клоны исходников в `vendor/` (iron-horse пинуется `IRON_HORSE_REF`):
  iron-horse, firs, openttd, openttd-patches (JGRPP — справочник по патчпаку)
- `make venv` — venv пайплайна (`pipeline/.venv`, Python ≥3.12, Pillow + Chameleon + markdown)
- `make data` — перегенерация JSON (iron-horse, firs, vanilla) + `validate.py`
- `make data-images` — рендер спрайтшитов Iron Horse и нарезка спрайтов машин (небыстро)
- `make test` — регрессионные тесты пайплайна (`unittest`) + тесты формул (`vitest`)
- Один тест: `pipeline/.venv/bin/python -m unittest pipeline.tests.test_known_values -k coal`;
  `cd web && npx vitest run -t "timeFactor"`
- `make dev` / `make build` / `make verify`

## Критичные инварианты (легко сломать)

- **Basecost-шифты Iron Horse**: цены = ванильная база × factor/256 × 2^shift; шифты
  (движки −2, вагоны +1, running steam −2, diesel −4) лежат в `meta.basecost_shifts`
  trains.json и обязаны применяться во всех денежных расчётах (`engine/costs.ts`).
- **FIRS price_factor ≠ payment rate**: конверсия в NewGRF prop 0x12 —
  `price_factor × 2^21 / 51000` (формула NML) — выполняется в `extract_firs.py`.
- **transit_periods** грузов — в периодах старения по 2.5 игровых дня (185 тиков), НЕ в днях.
- **Инфляция по умолчанию выключена** — Iron Horse кидает фатальную ошибку GRF при
  включённой инфляции (в UI об этом предупреждение + баннер).
- Скорости: внутренняя единица OpenTTD, display mph = internal × 10/16 (`engine/units.ts`).
- **Длина**: поле `length` — единицы длины OpenTTD, стандартная машина 8 единиц = ПОЛТАЙЛА,
  тайл = 16 единиц (не 8! проверено против игры: Haar + 14 длинных вагонов = 5.8 тайла).
- Экстракторы подменяют `sys.argv`/`os.chdir` перед импортом `iron_horse`/`firs` — порядок
  строк в начале файлов значим.

## Настройки (engine/settings.ts)

`GameSettings` — параметры игры (названы как в Advanced Settings, чтобы пользователь
копировал один в один), `CalcSettings` — допущения калькулятора. Оба живут в
`state/settingsStore.ts` (persist) и передаются в формулы явными аргументами — движок
остаётся чистым, без импорта сторов.

**Правило: каждая настройка обязана менять расчёт.** `engine/__tests__/settings-effect.test.ts`
перебирает все настройки и падает, если переключатель ни на что не влияет. Добавляешь
настройку — добавляй кейс туда же. Так уже ловились «мёртвые» переключатели
(`inflationFixedDates`) и места, куда настройки забыли прокинуть (цены в каталоге машин).

Механика цен в игре (проверено по `economy.cpp:RecomputePrices` и `newgrf.cpp:1584`):

1. `difficulty.construction_cost` / `vehicle_costs` — множитель базы 6/8, 8/8, 9/8;
   покупка транспорта относится к категории **Construction** (`table/pricebase.h`).
2. **Base Costs GRF** не определяет машин, поэтому его множители игра применяет
   **глобально** (степени двойки — отсюда шкала free…8192x).
3. **Iron Horse** определяет поезда, поэтому его basecost-шифт **локальный** — только для
   его машин. Все три множителя перемножаются, не конкурируют.

JGRPP-специфика (флаг `jgrpp` раскрывает эти настройки в UI):
`day_length_factor` в свежих версиях называется **Economy speed reduction factor** —
это одна и та же настройка; `payment_algorithm` traditional обрезает время в пути до 255
периодов (различие видно только на рейсах > ~637 дней); `vehicle_costs_when_stopped` делит
расходы стоящего поезда; `inflation_fixed_dates` — замирает ли инфляция после 2090.

## Наборы NewGRF

`dataset.ts`: `activeTrains(game)` / `activeCargos(game)` / `canCarryIn(game, train, cargo)`
выбирают между данными NewGRF и ванильными (`vanilla.ts`). Ванильные вагоны рефита не имеют —
возят только свой `default_cargo`. При выключенном FIRS оплата берётся из ключа `VANILLA`,
вкладка FIRS chains скрывается.

## Правки данных

Данные о машинах/грузах/индустриях НЕ править руками в JSON — только через экстракторы
и `make data`. Эталонные значения в `pipeline/tests/test_known_values.py` сверены с
https://grf.farm/iron-horse/4.29.0/ — при обновлении версий обновлять осознанно.
Ванильные эталоны: Kirby Paul Tank cost_factor 7, уголь initial_payment 5916.

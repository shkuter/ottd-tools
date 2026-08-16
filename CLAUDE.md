# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это

Веб-калькулятор для OpenTTD + Iron Horse (ростер Pony) + FIRS 5: конструктор составов,
доход перевозок, цепочки FIRS, прибыльность. Двухчастная архитектура:

- `pipeline/` — Python-экстракторы. Импортируют исходники Iron Horse/FIRS из `vendor/`
  **напрямую как Python-модули** (без компиляции NewGRF) и пишут статические JSON в
  `web/src/data/` + иконки грузов в `web/public/icons/`. JSON закоммичены — SPA собирается
  без Python.
- `web/` — React 19 + Vite + TypeScript SPA. Игровые формулы — чистые TS-модули в
  `web/src/engine/` (income/physics/costs/inflation/units), UI-фичи в `web/src/features/`,
  zustand-сторы в `web/src/state/`. i18n: все UI-строки через `t()` из `web/src/i18n/`.

## Команды

- `make fetch` — shallow-клоны исходников в `vendor/` (iron-horse пинуется тегом `IRON_HORSE_REF`)
- `make venv` — venv пайплайна (`pipeline/.venv`, Python ≥3.12, Pillow + Chameleon)
- `make data` — перегенерация JSON + `validate.py`
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
- **Инфляция по умолчанию выключена** — Iron Horse фатально несовместим с ней в игре.
- Скорости: внутренняя единица OpenTTD, display mph = internal × 10/16 (`engine/units.ts`).
- **Длина**: поле `length` — единицы длины OpenTTD, стандартная машина 8 единиц = ПОЛТАЙЛА,
  тайл = 16 единиц (не 8! проверено против игры: Haar + 14 длинных вагонов = 5.8 тайла).
- Экстракторы подменяют `sys.argv`/`os.chdir` перед импортом `iron_horse`/`firs` — порядок
  строк в начале файлов значим.

## Правки данных

Данные о машинах/грузах/индустриях НЕ править руками в JSON — только через экстракторы
и `make data`. Эталонные значения в `pipeline/tests/test_known_values.py` сверены с
https://grf.farm/iron-horse/4.29.0/ — при обновлении версий обновлять осознанно.

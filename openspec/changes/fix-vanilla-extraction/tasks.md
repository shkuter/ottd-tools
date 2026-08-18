## 1. Экстрактор

- [x] 1.1 `extract_vanilla.py`: `parse_cargo_labels()` из `cargo_type.h`; `RVI` — колонки 7/10 по назначению; `engine_class` нормализован; `default_cargo` через метку, `CT_NONE` → null; убрать `name_list`
- [x] 1.2 `validate.py`, `tests/test_known_values.py`: `CT_COAL` → `COAL`; добавить проверку Kirby `running_cost_class == running_steam` и меток (`PASS`, `OIL_`)
- [x] 1.3 `make data` — диф только в `vanilla_*.json` + `meta.json`; `make test` (unittest) зелёный

## 2. Фронт

- [x] 2.1 `web/src/vanilla.ts`: `power_by_source` по классу (`electric` → `OHLE`), `default_cargos` без `replace`, null → `[]`
- [x] 2.2 `web/src/i18n/cargos.ru.json`: `CT_*` → настоящие метки для грузов вне FIRS; `locales.test` зелёный
- [x] 2.3 Тесты: `vanilla.test.ts` (Kirby steam, электровозы OHLE, метки), `dataset.test.ts` (IH без FIRS + `PASS`)

## 3. Проверка

- [x] 3.1 В браузере: режим «Iron Horse без FIRS» — в списке грузов оптимизатора есть пассажиры/нефть/товары и находятся вагоны; ванильный режим — паровоз показывает содержание от базы 5600
- [x] 3.2 CHANGELOG `[Unreleased]` → `Fixed` (по-английски), два пункта
- [x] 3.3 `make test`, `npx tsc --noEmit`, `npx oxlint`

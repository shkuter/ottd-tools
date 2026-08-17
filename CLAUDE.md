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

## Локализация

- Языки: `web/src/i18n/en.json` + `ru.json`, выбранный язык — в `state/localeStore.ts`
  (отдельно от `GameSettings`/`CalcSettings`, как и скин: язык не меняет расчёт).
  `t()` читает стор вне React, поэтому `App` подписан через `useLocale()` — от него
  перерисовывается дерево. Строки, попадающие в `useMemo`, переводить **в момент рендера**
  (заголовки таблицы каталога — `header: () => t('table.name')`), иначе застрянут на старом языке.
- Названия настроек взяты из русской локали самой игры (`vendor/openttd/src/lang/russian.txt`,
  JGRPP — `vendor/openttd-patches/src/lang/extra/russian.txt`), чтобы пользователь находил их
  один в один в своей игре. Новую настройку переводить так же, а не «по смыслу».
- Названия грузов и предприятий — данные NewGRF, а FIRS поставляется только с `english.lng`,
  поэтому русские названия лежат в `web/src/i18n/cargos.ru.json` и `industries.ru.json`
  (совпадающие с ванилью — из `STR_CARGO_PLURAL_*` / `STR_INDUSTRY_NAME_*` игры), а
  подставляются хелперами `i18n/names.ts`: `cargoName()`, `cargoUnits()`, `industryName()`,
  `sortCargos()` и `localiseDot()`. В dot-графе FIRS id узла — это label груза (`ACID`) или id
  предприятия (`coal_mine`), поэтому подмена идёт по id и трогает только `label=`; рёбра
  ссылаются на id и не страдают. Формат чисел и сортировка следуют языку (`intlLocale()`).
- Списки грузов в фильтрах сортируются по отображаемому названию, поэтому `sortCargos()`
  принимает локаль **аргументом**: вызовы мемоизированы, и так локаль становится честной
  зависимостью `useMemo` (иначе список застрянет в старом языке, а линтер будет ругаться).
- `i18n/__tests__/locales.test.ts` падает, если в `ru.json` нет ключа из `en.json`, строка не
  переведена или в данных появился груз, единица или предприятие без записи в словаре — то есть
  после обновления FIRS тест сам покажет, что переводить.

Вкладки: Best train (оптимизатор), Consist builder, Route income (доход рейса + прибыльность
собранного состава), FIRS chains, Settings.

## Команды

- `make fetch` — shallow-клоны исходников в `vendor/` (версии пинуются `IRON_HORSE_REF`,
  `FIRS_REF`):
  iron-horse, firs, openttd, openttd-patches (JGRPP — справочник по патчпаку)
- `make venv` — venv пайплайна (`pipeline/.venv`, Python ≥3.12, Pillow + Chameleon + markdown)
- `make data` — перегенерация JSON (iron-horse, firs, vanilla) + `validate.py`
- `make data-images` — рендер спрайтшитов Iron Horse и нарезка спрайтов машин (небыстро)
- `make data-opengfx2` — графика ванильного режима из OpenGFX2 Classic (спрайты машин,
  иконки грузов, палитра интерфейса); `make fetch-opengfx2` — только если набора нет локально
- `make test` — регрессионные тесты пайплайна (`unittest`) + тесты формул (`vitest`)
- Один тест: `pipeline/.venv/bin/python -m unittest pipeline.tests.test_known_values -k coal`;
  `cd web && npx vitest run -t "timeFactor"`
- `make dev` / `make build` / `make verify`
- `make release VERSION=x.y.z` — релиз по semver (см. ниже)

## Версионирование (semver)

Версия одна на весь репозиторий, единственный источник правды — `version` в
`web/package.json`. `vite.config.ts` читает его и инлайнит в бандл как `__APP_VERSION__`
(объявление типа — `web/src/globals.d.ts`), футер `App.tsx` показывает его рядом с версиями
данных. Руками версию нигде больше не дублировать. Первый тег — **0.1.0** (17.08.2026).

Публичного API у калькулятора нет, поэтому разряды считаются по тому, что видит пользователь:

- **major** — тот же ввод осознанно даёт другие числа (правка формулы или игровой механики)
  либо сбрасывается сохранённое состояние в localStorage;
- **minor** — новая вкладка, настройка, набор данных или язык; обновление версии NewGRF,
  меняющее данные;
- **patch** — исправления, полировка UI, переводы, рефакторинг с теми же числами.

`CHANGELOG.md` — формат Keep a Changelog, **на английском**, как README и комментарии в коде.
Заметные правки дописываются в `## [Unreleased]` тем же коммитом, что и сама правка.

Релиз только через `make release VERSION=x.y.z` (`scripts/release.sh`, совместим с системным
bash 3.2): проверяет формат версии, чистое дерево, отсутствие тега, что версия строго больше
текущей и что `Unreleased` не пустой; затем закрывает `Unreleased` секцией версии с датой,
бампает `package.json` + `package-lock.json` (`npm version`), делает коммит «Релиз X.Y.Z» и
аннотированный тег `vX.Y.Z`. Руками теги не ставить и версию в `package.json` не править.

Версии данных (`IRON_HORSE_REF`, `FIRS_REF`, `OPENGFX2_REF` в Makefile → `data/meta.json`) —
отдельная ось: они живут своей нумерацией, а их обновление в приложении — обычный minor.

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

## Графика OpenGFX2 Classic

`pipeline/grf_sprites.py` читает базовый набор игры (GRF container v2) — декодер написан по
`vendor/openttd/src/spritecache.cpp` и `src/spriteloader/grf.cpp`. Держится на том, что игра
грузит базовый набор как `LoadGrfFile(файл, 0, …)`, поэтому **SpriteID = порядковый номер
записи info-секции**: номера из таблиц игры адресуют файл напрямую.

- Спрайт машины: `((dir + _engine_sprite_add[i]) & _engine_sprite_and[i]) + _engine_sprite_base[i]`
  при `dir = Direction::W = 6`; у сдвоенных задняя половина — `image_index + 1`. Считается в
  `extract_vanilla.py` (поля `image_index`, `sprite_id`, `sprite_id_rear`).
- Иконка груза: `SPR_CARGO_<PLURAL>` (4297+), брать вариант `zoom = In2x` — он 20×20, как у FIRS.
- Палитру брать из `src/table/palettes.h`, а НЕ из `docs/palettes/openttd.gpl`: в .gpl индексы
  1-9 затёрты служебными маркерами, спрайты с ними становятся малиновыми.
- Версия набора пинится md5 файла `ogfx21_base_8.grf` (`BASE_SET_MD5`): другой релиз сдвинет
  все номера спрайтов.
- Скин интерфейса (`web/src/skin.css`) — чистый CSS: рамки окон OpenTTD не спрайты, движок
  рисует их цветами палитры (`DrawFrameRect`, widget.cpp). Цвета берутся из recolour-спрайтов
  775…790 набора → `data/opengfx2_palette.json` → CSS-переменные (`skin.ts`).
- Выбор скина живёт в отдельном `state/skinStore.ts`, а НЕ в `GameSettings`/`CalcSettings` —
  иначе нарушится правило «каждая настройка меняет расчёт».

## Правки данных

Данные о машинах/грузах/индустриях НЕ править руками в JSON — только через экстракторы
и `make data`. Эталонные значения в `pipeline/tests/test_known_values.py` сверены с
https://grf.farm/iron-horse/4.29.0/ — при обновлении версий обновлять осознанно.
Текущие версии данных: Iron Horse 4.29.0, FIRS **5.2.0** (релизный тег, не master —
в master уже есть расхождения, например `liquids_terminal` переименован в `oil_terminal`).
Ванильные эталоны: Kirby Paul Tank cost_factor 7, уголь initial_payment 5916.

Имена и картинки машин должны совпадать со списком покупки в игре — пользователь ищет
машину в игре по тому, что видит в калькуляторе. Поэтому имя собирается через
`game_name()` (`get_name_parts(context="default_name")`), а НЕ через
`DocHelper.unpack_name_string()`: докозвой хелпер Iron Horse дописывает рандомизированным
вагонам суффикс «- Random», которого в игре нет (тест `test_names_match_the_game`).
Картинки — buy-menu спрайты того же ростера, у рандомизированных вагонов это композит
«вагон + кубик + вагон» (`requires_custom_buy_menu_sprite`), в игре ровно такой же.

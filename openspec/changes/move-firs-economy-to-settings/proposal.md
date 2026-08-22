## Why

Партия в OpenTTD идёт ровно в одной экономике FIRS, а калькулятор хранит три ответа на вопрос
«в какой»: табы на вкладке цепочек (`firsStore.economyId`), независимый `Select` на вкладке
дохода (`routeStore.economyId`) и молчаливый запасной вариант в оптимизаторе — «первая
экономика списка, где такой груз вообще есть» (`economyIdForCargo`). Две сохранённые копии
могут расходиться, а оптимизатор не согласован ни с одной из них. Кроме того, списки грузов
нигде не сужаются по экономике: в партии Steeltown интерфейс предлагает все 96 грузов FIRS
вместо 62, а по грузу, которого в экономике нет, считается ставка чужой экономики.

Источник истины по данным: `web/src/data/economies.json` и `cargos.json` (FIRS 5.2.0, `make
data`). Проверено по ним же: ни один из 96 грузов не имеет разных `initial_payment_by_economy`
или `price_factor_by_economy` между экономиками — экономика решает состав грузов и предприятий,
а не ставку.

## What Changes

- Новая игровая настройка `GameSettings.firsEconomy` (по умолчанию `STEELTOWN`) на вкладке
  Settings в секции «Наборы NewGRF», под тумблером FIRS; при выключенном FIRS поле скрыто.
- Неизвестный сохранённый id экономики (переименование в будущей версии FIRS) откатывается на
  `STEELTOWN` в `normaliseGame()` — тем же приёмом, что уже применён к множителям Base Costs.
- **BREAKING** Убираются табы выбора экономики на вкладке FIRS chains и `Select` экономики на
  вкладке Route income; вместо табов — строка с названием текущей экономики и подсказкой, что
  она меняется в настройках.
- **BREAKING** Из `firsStore` и `routeStore` удаляются поля `economyId`; `firsStore` теряет
  `persist` целиком (оставшийся `selectedNode` и раньше не сохранялся). Сохранённый выбор не
  мигрируется: во всех трёх местах уже стоял `STEELTOWN`.
- `activeCargos(game)` отдаёт только грузы текущей экономики (при выключенном FIRS — ванильный
  набор). Груз, которого в выбранной экономике нет, нигде не предлагается; выбор груза,
  выпавший из экономики после переключения, сбрасывается на первый доступный.
- `economyIdForCargo(game, cargo, preferred)` схлопывается в `economyIdForPayment(game)` →
  `VANILLA` либо `game.firsEconomy`; запасной вариант «первая экономика, где груз есть»
  исчезает.
- Импорт сохранения перестаёт нести экономику отдельно от настроек: `SavegameImport.economyId`
  и его особая ветка в `diff.ts` уходят, экономика приезжает в `game.firsEconomy` и
  применяется общим `applySettings`.
- `settings-effect.test.ts` получает кейс для экономики: снимок расширяется набором активных
  грузов, потому что чисел эта настройка не меняет (обоснование — `docs/adr/0002-firs-economy-is-a-game-setting.md`).
- Названия экономик остаются английскими, как в `economies.json`; словарь переводов не заводится.

## Non-goals

- Перевод названий экономик на русский (в `vendor/firs-ru/russian.toml` строки
  `STR_PARAM_VALUE_ECONOMIES_*` есть, но заводить под них словарь и генерацию сейчас не будем).
- Изменение самих формул дохода, цен и физики: числа для груза, доступного в выбранной
  экономике, остаются прежними.
- Фильтрация по экономике глобальных индексов датасета (`cargos`, `cargoByLabel`): они
  описывают весь набор данных и нужны карточке узла FIRS, `localiseDot()` и тестам.
- Миграция сохранённого в localStorage выбора экономики из старых сторов.

## Capabilities

### New Capabilities

- `cargo-sets`: какой набор грузов и предприятий активен — выбор экономики FIRS как единой
  игровой настройки, сужение активных грузов до этой экономики, ставка оплаты по ней,
  поведение при выключенном FIRS и при неизвестном id.

### Modified Capabilities

- `savegame-import`: экономика FIRS из сохранения переносится как обычная настройка партии
  (`GameSettings`), а не отдельным путём применения; сценарий «применяется одинаково во
  вкладках дохода и цепочек FIRS» переформулируется — вкладки своего выбора больше не имеют.

## Impact

- Настройки и сторы: `web/src/engine/settings.ts` (`GameSettings`, `DEFAULT_GAME_SETTINGS`),
  `web/src/state/settingsStore.ts` (`normaliseGame`), `web/src/state/firsStore.ts`,
  `web/src/state/routeStore.ts`.
- Данные: `web/src/dataset.ts` (`activeCargos`, `activeCargoByLabel`, `economyIdForCargo` →
  `economyIdForPayment`).
- Вкладки: `features/firs/FirsPage.tsx`, `features/route/RoutePage.tsx`,
  `features/optimizer/OptimizerPage.tsx`, `features/settings/SettingsPage.tsx`,
  `features/settings/SavegameImportPanel.tsx`.
- Импорт сохранений: `web/src/savegame/import.ts`, `diff.ts`, `apply.ts` и их тесты.
- Тесты: `engine/__tests__/settings-effect.test.ts`, `state/__tests__/reset.test.ts`,
  `__tests__/dataset.test.ts`, `savegame/__tests__/{diff,apply}.test.ts`.
- Строки: `i18n/en.json` + `ru.json` — новые ключи настройки, ключи `firs.economy` и
  `route.economy` выводятся из употребления.
- Документация: `CONTEXT.md` (секция «Cargo sets» уже добавлена),
  `docs/adr/0002-firs-economy-is-a-game-setting.md`, `CHANGELOG.md`.

## Semver

Разряд — **minor** с пометкой `**BREAKING**` в `[Unreleased]`. Ломающего в нём два: перестаёт
читаться часть сохранённого состояния (поля `economyId` двух сторов, ключ `ottd-tools-firs`
целиком) и у пользователя, у которого вкладка дохода стояла в одной экономике, а цепочки — в
другой, числа дохода изменятся. По правилам репозитория это major, но пока версия 0.x
ломающее изменение поднимает minor.

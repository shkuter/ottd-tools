## 1. Настройки

- [x] 1.1 `engine/settings.ts`: удалить `minutesPerYear`; добавить `startingYear` (def 1950 —
      `CalendarTime::DEF_START_YEAR`, объявлена в `vendor/openttd/src/table/settings/world_settings.ini:128`;
      игровой диапазон 0…5000000 для UI бессмыслен, ограничить 1920…2090 как у `priceYear`);
      дефолты `vehicleCosts: 0`, `constructionCost: 0`,
      `subsidyMultiplier: 2`; убрать `{ value: 0 }` из `BASECOST_MULTIPLIERS`; `daysPerEconomyYear`
      wallclock → 360; хелперы `economyYearFraction(game)`, `inflationModel(game)`
- [x] 1.2 `state/settingsStore.ts`: в `merge` нормализовать неизвестный множитель Base Costs → 1
- [x] 1.3 `features/settings/SettingsPage.tsx`: убрать строку «минут на год», добавить «Год начала игры»
      (Row в секции Time, `min={1920} max={2090}` как у `priceYear`), подсказка про JGRPP-модель инфляции
- [x] 1.4 `i18n/en.json`, `ru.json`: `settings.startingYear` (+Hint) — русское название из
      `vendor/openttd/src/lang/russian.txt:2138`; удалить ключи `minutesPerYear*`

## 2. Движок

- [x] 2.1 `engine/inflation.ts`: `inflationFactors(year, on, interest, fixedDates, startingYear)` — две модели
      по design, включая `year < startingYear` → множитель 1; комментарий шапки исправить
      (off = 170 лет от старта, не «без потолка»)
- [x] 2.2 `engine/costs.ts`: `trainRunningCostPerYear` × `economyYearFraction(game)`; передавать `startingYear`
      и модель в `price()`/`buyCost()`/`runningCostPerYear()`
- [x] 2.3 `engine/income.ts`: `cargoPaymentRate(cargo, economyId, game, calc)`; `RoutePage`, `OptimizerPage`
      берут ставку через него
- [x] 2.4 `engine/trip.ts`, `optimize.ts`: без изменений формул — проверить, что ставка приходит с инфляцией

## 3. Тесты

- [x] 3.1 `settings-effect.test.ts`: кейс `inflationFixedDates` с базой `jgrpp: true, inflation: true`
      (изолированно); новый кейс `startingYear` (`jgrpp, inflation, inflationFixedDates: false, startingYear: 1990`);
      удалить кейс `minutesPerYear`; кейс `timekeeping wallclock` остаётся
- [x] 3.2 `engine.test.ts`: инфляция — фиксированная модель в 1970 > 1; модель от старта: 1970 = 1,
      2000 = fixed(1950); Kirby по умолчанию £8203; wallclock: `tripsPerYear = 360/круг`,
      содержание × 360/365; `cargoPaymentRate` с инфляцией > базовой
- [x] 3.3 `state/__tests__/settingsStore.test.ts`: старый localStorage с `basecostLocomotive: 0` → 1
      (поля множителей: `basecostLocomotive`, `basecostWagon`, `basecostTrainRunning`);
      с `vehicleCosts: 1` → остаётся 1; без `startingYear` → 1950

## 4. Проверка

- [x] 4.1 В браузере: настройки показывают год старта, нет «минут на год»; при inflation on доход
      на вкладке рейса растёт с годом; wallclock — рейсов в год = 360/круг
- [x] 4.2 `CHANGELOG.md` `[Unreleased]`: `Changed` (дефолты, wallclock, инфляция выплат — BREAKING),
      `Removed` (минуты на год), `Fixed` (мёртвый `inflationFixedDates`)
- [x] 4.3 `make test`, `npx tsc --noEmit`, `npx oxlint`

## 5. Правки по код-ревью

- [x] 5.1 `engine/inflation.ts`: индекс года приводить к целому (`Math.trunc`), иначе дробный
      год из поля `type=number` даёт `table.price[30.5] === undefined` → NaN во всех ценах,
      содержании и ставке груза (оптимизатор при этом молча отдаёт пустой список: `!payment`
      считает NaN ложным)
- [x] 5.2 `features/settings/SettingsPage.tsx`: клампить «Год начала игры» при вводе, как
      остальные числовые поля страницы; сейчас очищенное поле даёт 0 → инфляция ×28.6
- [x] 5.3 `features/firs/FirsPage.tsx`: ставку груза брать через `cargoPaymentRate`, иначе
      вкладка показывает 3536 там, где рейс и оптимизатор показывают 7756 (требование
      «Инфляция выплат за груз» в `specs/route-economics`)
- [x] 5.4 `engine/__tests__/engine.test.ts`: кейсы на дробный год (не NaN) и на нулевой/
      заниженный год старта; `features/settings` — проверка клампа, если есть куда повесить
- [x] 5.5 `engine/__tests__/settings-effect.test.ts`: `base: { inflation: true }` для кейсов
      `inflation`, `inflationInterest` и `priceYear (с инфляцией)` — сейчас они проходят за счёт
      самого флага инфляции, а не проверяемой настройки
- [x] 5.6 `CLAUDE.md`: обновить устаревшие утверждения — семантика `inflation_fixed_dates`
      (две модели, а не «замирает после 2090»), шкала Base Costs без «free», формулировка про
      settings-effect (он не ловил мёртвый `inflationFixedDates`)
- [x] 5.7 `CHANGELOG.md`: снять противоречие — запись обещает, что сохранённые настройки не
      трогаются, и тут же описывает нормализацию сохранённого множителя Base Costs
- [x] 5.8 `make test`, `npx tsc --noEmit`, `npx oxlint`

## Why

Аудит формул против `vendor/openttd` (18.08.2026) показал, что ядро расчёта верно, а
ошибки собрались в настройках экономики — там, где калькулятор трактовал параметр игры не
так, как игра:

1. **Wallclock.** Экономический год в режиме реального времени — всегда 360 дней
   (`timer_game_economy.h:52`); `minutes_per_calendar_year` крутит только календарь
   (даты, старение техники) и на доход/расход не влияет. Калькулятор считает год как
   `минуты × 30`, а содержание не масштабирует вовсе: при 24 мин/год доход завышен вдвое,
   при этом расход остаётся «за 365 дней».
2. **`inflationFixedDates` — мёртвый переключатель.** Обе ветки в `inflation.ts` клампят год
   к 2090, результат не зависит от значения; тест `settings-effect` не ловит это, потому что
   в кейсе одновременно включён `jgrpp`, и меняется он, а не настройка. К тому же семантика
   перепутана: в JGRPP «выключено» — это старая модель «инфляция с года старта игры в течение
   170 лет, без предстартового разгона», а не «без потолка».
3. **Инфляция выплат не применяется.** `inflationFactors().payment` считается, но никто его не
   читает: при включённой инфляции расходы растут (к 2090 — ×29), доходы — нет.
4. **Дефолты не игровые.** `difficulty.vehicle_costs` и `construction_cost` в игре по умолчанию
   Low (×6/8), в калькуляторе Medium (×8/8) — цены «из коробки» на 33 % выше игровых;
   `subsidy_multiplier` в игре по умолчанию ×3, у нас ×2.
5. **Base Costs «0 = free»** невозможен в игре: минимум множителя ×1/256, и `RecomputePrices`
   защищает цену от нуля.

## What Changes

- Экономический год в wallclock — 360 дней (константа), а годовое содержание в этом режиме
  приводится к тому же году (×360/365). Настройка «минут на год» после этого перестаёт влиять
  на расчёт (сейчас она влияет только через ошибочную формулу года) и удаляется из
  `GameSettings` — правило проекта требует, чтобы каждая настройка меняла числа. Локаль игры
  подтверждает: «Это не влияет на скорость транспортных средств и на расчёт экономической
  модели в игре (за исключением инфляции)».
- Новая настройка `startingYear` (`game_creation.starting_year`, «Год начала игры», def 1950)
  и честная модель инфляции: при `inflationFixedDates` (и всегда в ванили) — с 1920 по 2090 с
  предстартовым разгоном; при выключенном (JGRPP) — от года старта в течение 170 лет без
  предстартовой инфляции (год расчёта раньше года старта → множитель 1).
- Ставка оплаты груза умножается на множитель инфляции выплат того же года, что и цены.
- Дефолты приводятся к игровым: `vehicleCosts` 0, `constructionCost` 0, `subsidyMultiplier` 2.
- Из списка Base Costs убирается «free (no costs)».
- **BREAKING**: у новых пользователей цены «из коробки» на 25 % ниже, субсидия ×3; в wallclock
  меняются рейсы/доход/расход; при включённой инфляции меняется доход. Сохранённые
  настройки существующих пользователей не сбрасываются (`merge` доливает `startingYear`).

## Non-goals

- Диапазон Base Costs GRF (1/64…8192 против игрового 1/256…65536) — сам GRF не в `vendor/`,
  проверить, что предлагает его меню, нельзя; список не расширяем.
- Использование `startingYear` в `availability.ts` (первые два года без рандомизации даты
  появления) — отдельный change про доступность техники.
- `vehicle_costs_when_stopped` при любой остановке (не только под погрузкой) и парная
  `vehicle_costs_in_depot` — change про стоянки.
- Потолок инфляции `MAX_INFLATION` — недостижим при interest 2…4 за 170 лет.

## Semver

**major** — при тех же настройках меняются числа (дефолты сложности/субсидии, wallclock,
доход при инфляции). localStorage не сбрасывается.

## Источник истины

- Wallclock: `vendor/openttd/src/timer/timer_game_economy.h:52` (`DAYS_IN_ECONOMY_YEAR = 360`),
  `timer_game_economy.cpp:126-129`, `timer_game_calendar.cpp:100-110`,
  `table/settings/economy_settings.ini:334-348`.
- Running cost: `vendor/openttd/src/train_cmd.cpp:4272` (делитель `DAYS_IN_YEAR × DAY_TICKS`).
- Инфляция: `vendor/openttd/src/economy.cpp:696-730, 789-791`;
  `vendor/openttd-patches/src/economy.cpp:834-838, 1029-1035`;
  `vendor/openttd-patches/src/lang/extra/english.txt:197-198` (семантика переключателя).
- Дефолты: `vendor/openttd/src/table/settings/difficulty_settings.ini` (`vehicle_costs`,
  `construction_cost` def 0; `subsidy_multiplier` def 2), `game_settings.ini`
  (`starting_year` def 1950).
- Base Costs: `vendor/openttd/src/economy_type.h:228-229` (`MIN_PRICE_MODIFIER = -8`),
  `economy.cpp:779-783`.
- Год начала игры: `vendor/openttd/src/table/settings/world_settings.ini:128`
  (`def = CalendarTime::DEF_START_YEAR`, `timer_game_common.h:184` — 1950); название —
  `vendor/openttd/src/lang/russian.txt:2138` (`STR_CONFIG_SETTING_STARTING_YEAR`).

## Capabilities

### New Capabilities
<!-- нет -->

### Modified Capabilities
- `pricing`: добавляются требования к модели инфляции (две модели, год старта), к игровым
  значениям по умолчанию и к диапазону Base Costs GRF; сценарий «Инфляция цен» уточняется.
- `route-economics`: требование «Рейсов за экономический год» — wallclock = 360 дней вместо
  «минут на год»; добавляется требование «Инфляция выплат за груз».

## Impact

- `web/src/engine/settings.ts` (удаление `minutesPerYear`, добавление `startingYear`, дефолты,
  `daysPerEconomyYear`, список Base Costs), `web/src/engine/inflation.ts` (две модели),
  `web/src/engine/costs.ts` (содержание × 360/365 в wallclock), `web/src/engine/income.ts`
  (хелпер ставки с инфляцией), `web/src/engine/trip.ts`, `web/src/engine/optimize.ts`,
  `web/src/features/route/RoutePage.tsx`, `web/src/features/optimizer/OptimizerPage.tsx`,
  `web/src/features/settings/SettingsPage.tsx`, `web/src/state/settingsStore.ts` (merge
  дефолтов уже доливает новые поля), `web/src/i18n/en.json`, `ru.json`.
- Тесты: `engine/__tests__/settings-effect.test.ts` (изолированный кейс `inflationFixedDates`,
  новый кейс `startingYear`, удаление `minutesPerYear`), `engine.test.ts` (инфляция выплат,
  wallclock).

## Why

Настройки калькулятора пользователь сейчас переносит из игры руками, и это молча расходится
с реальной партией. Проверка на живом сейве (`Londworth Transport, 1975-07-21.sav`, JGRPP)
показала восемь расхождений с дефолтами калькулятора: `jgrpp`, `dayLengthFactor` (1 против 5),
`startingYear` (1950 против 1860), `vehicleCosts` и `constructionCost` (low против high),
`inflationInterest` (2 против 4), `priceYear` (1950 против 1975) и `basecostGrf` (выключен,
хотя в партии активен BaseCosts Mod 5.0 с удвоенной ценой локомотивов и вагонов). То есть
числа, которые калькулятор показывает этому игроку, к его партии не относятся.

Сам сейв все эти значения содержит: чанк `PATS` в современных сейвах самоописывающийся —
имена настроек лежат прямо в файле, схема из исходников игры не нужна.

## What Changes

- Новая возможность «загрузить сейв» в настройках: пользователь выбирает `.sav`, калькулятор
  читает его целиком в браузере и показывает, чем партия отличается от текущих настроек.
- Импорт **не применяется молча**: пользователь видит список различий и подтверждает.
- Читаются: `PATS` (настройки игры), `NGRF` (активные NewGRF и их параметры), `ECMY`
  (накопленные множители инфляции — показываются справочно, в расчёт не идут), `DATE`
  (текущая дата партии).
- Из `NGRF` определяются `ironHorse`, `firs`, `basecostGrf`, `capacityIndex` (Iron Horse
  param 0) и экономика FIRS (param 0), из `DATE` — `priceYear`.
- Поддерживаются все четыре формата сжатия сейвов: `OTTN` (без сжатия), `OTTZ` (zlib —
  нативный `DecompressionStream`), `OTTX` (xz), `OTTD` (LZO).
- Настройки, которые в сейве есть и на игру влияют, но модели в калькуляторе не имеют,
  показываются отдельным списком «к сведению» — без применения.
- **BREAKING** для модели цен: `basecostTrainRunning` заменяется на три множителя — steam,
  diesel и electric, по одному на running-класс, потому что и игра, и BaseCosts Mod задают их
  раздельно (параметры 42, 43, 44). Iron Horse берёт для движков базу `RUNNING_COST_STEAM`,
  для вагонов — `RUNNING_COST_DIESEL` (`vendor/iron-horse/src/global_constants.py`:
  `PR_RUNNING_TRAIN_STEAM`, `PR_RUNNING_TRAIN_DIESEL`), а ванильные электровозы относятся к
  `RUNNING_COST_ELECTRIC`. Один общий множитель воспроизвести партию не может.
- Шкала `BASECOST_MULTIPLIERS` расширяется до 16kx / 32kx / 64kx — столько предлагает
  BaseCosts Mod 5.0 (значения параметра 22, 23, 24).

## Non-goals

- Не поддерживаем сейвы старее savegame-версии 295 (OpenTTD 12, 2021) и JGRPP без фичи
  `XSLFI_TABLE_PATS`: в них `PATS` позиционный, и для чтения нужна вся таблица совместимости
  из `saveload/compat/`. Такой файл отклоняется с понятным сообщением.
- Не извлекаем на этом шаге данные из `VEHS` (составы игрока), `INDY` (предприятия на карте),
  `STNN`, `SUBS`, `PLYR`: ридер эти чанки проходит и умеет считать в них записи, но их
  содержимое остаётся на следующие изменения.
- Не сохраняем и не изменяем сейвы — только чтение.
- Не добавляем настройки из списка «к сведению» в модель расчёта: каждая такая настройка —
  отдельное изменение со своей формулой и кейсом в `settings-effect.test.ts`.
- Не загружаем сейв ни на какой сервер: разбор целиком в браузере.

## Capabilities

### New Capabilities
- `savegame-import`: чтение сейва OpenTTD/JGRPP в браузере и перенос настроек партии в
  калькулятор с подтверждением различий.

### Modified Capabilities
- `pricing`: множитель running cost из Base Costs GRF разделяется на steam и diesel, шкала
  множителей расширяется до 64kx.

## Impact

- Новый модуль `web/src/savegame/` (ридер чанков + экстракторы по chunk id) и экран импорта
  в `web/src/features/settings/`.
- `web/src/engine/settings.ts`: `basecostTrainRunning` → `basecostTrainRunningSteam` и
  `basecostTrainRunningDiesel`, расширенная `BASECOST_MULTIPLIERS`; `engine/costs.ts` выбирает
  множитель по типу машины.
- `web/src/state/settingsStore.ts`: миграция persist (старое значение `basecostTrainRunning`
  переносится в оба новых), `firsStore` и `routeStore` — синхронный выбор экономики FIRS.
- Новые зависимости: `xz-decompress` (MIT, 52 КБ, распаковал тестовый сейв 4.84 МБ за 40 мс)
  и `lzo1x` (MIT, pure TypeScript; нативный `lzo` у него в `optionalDependencies`).
- Источники истины сверены: `vendor/openttd/src/saveload/saveload.cpp` (формат чанков, теги
  сжатия, gamma-длины), `vendor/openttd/src/saveload/settings_sl.cpp` (`PATS` как `CH_TABLE`),
  `vendor/openttd-patches/src/sl/saveload.cpp` (бит `SAVEGAME_VERSION_EXT = 0x8000`,
  `CH_EXT_HDR`), `vendor/openttd/src/saveload/newgrf_sl.cpp` и `economy_sl.cpp`,
  `vendor/iron-horse/src/templates/header.pynml` (param 0 = вместимость),
  `vendor/firs/src/economies/__init__.py` (порядок экономик в меню),
  Action 14 файла `basecosts.grf` из BaseCosts Mod 5.0 (имена и шкала 71 параметра).
- Semver: **major**. При том же вводе числа меняются (разделение running-cost множителя), и
  persist-состояние настроек мигрируется.

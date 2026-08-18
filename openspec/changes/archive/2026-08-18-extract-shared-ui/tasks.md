## 1. Общие компоненты

- [x] 1.1 Создать `web/src/components/TrainImage.tsx` и `web/src/components/CargoIcon.tsx`,
      перенеся код из `features/consist/ConsistPage.tsx` без изменений
- [x] 1.2 Переключить импорты в `ConsistPage.tsx`, `OptimizerPage.tsx`, `RoutePage.tsx`,
      `FirsPage.tsx` на `components/`
- [x] 1.3 Убедиться, что `grep -rn "from '.*features/" web/src/features` не находит импортов
      между вкладками

## 2. Мёртвый код

- [x] 2.1 Удалить `accelSimulation()` и `AccelSimResult` из `web/src/engine/physics.ts`
- [x] 2.2 Удалить `internalToKmh()` (`units.ts`), `yearTicks()` (`settings.ts`),
      `WAIT_TIME_THRESHOLD_DAYS` (`rating.ts`), `cargoById` (`dataset.ts`),
      `paletteSource` (`skin.ts`)
- [x] 2.3 Перед каждым удалением проверить grep'ом, что символ не используется

## 3. Проверка

- [x] 3.1 `npx tsc --noEmit`, `npx vitest run`, `npx oxlint` — без новых замечаний
- [x] 3.2 `make build` собирается
- [x] 3.3 Дописать пункт в `## [Unreleased]` → `Changed` в `CHANGELOG.md` (по-английски)

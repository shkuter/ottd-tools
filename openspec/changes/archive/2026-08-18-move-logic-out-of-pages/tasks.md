## 1. Движок

- [x] 1.1 `engine/income.ts`: добавить `incomeCurve(amount, distanceTiles, currentDays, spec, agingRate, algorithm, points = 120)`
      с правилом диапазона из design.md; тест в `engine.test.ts` (длина, начало в 0, невозрастание, диапазон ≥ 2.5×days и ≥ 50)
- [x] 1.2 `engine/consist.ts`: `Math.floor((x * 10) / 16)` → `internalToMph(x)`; `npx vitest run` — те же числа

## 2. Данные и состояние

- [x] 2.1 `dataset.ts`: `economyIdForCargo(game, cargo)`; перевести `OptimizerPage` и `RoutePage` (ключ `'VANILLA'`) на неё; тест
- [x] 2.2 `state/index.ts`: `resetPersistedState()`; `SettingsPage.resetAll` → вызов + `location.reload()`

## 3. Страницы

- [x] 3.1 `RoutePage`: график через `incomeCurve()`; зависимости `useMemo` — все входы функции
- [x] 3.2 `FirsPage`: `chainNodes` → `features/firs/chains.ts`; тест `features/firs/__tests__/chains.test.ts`
      (достижимость вперёд и назад, изолированный узел, отсутствующий узел)

## 4. Проверка

- [x] 4.1 В браузере: график на вкладке рейса выглядит как раньше; сброс в настройках чистит все сторы; подсветка цепочки FIRS работает
- [x] 4.2 `CHANGELOG.md` → `[Unreleased]` → `Changed` (по-английски)
- [x] 4.3 `make test`, `npx tsc --noEmit`, `npx oxlint` — количество warning'ов не выросло (ожидается уменьшение)

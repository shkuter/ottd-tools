## Why

После унификации денег и рейса в страницах остались куски доменной логики, которые не относятся
к отображению: точки кривой оплаты для графика (`RoutePage`), обход графа цепочек FIRS
(`FirsPage`), правило «в какой экономике брать ставку груза» (`OptimizerPage`), ручное дублирование
конверсии скорости в `consist.ts`, а сброс хранилища в `SettingsPage` знает строковые ключи
localStorage всех сторов. Каждый такой кусок нельзя протестировать без рендера, и каждый —
кандидат на тихое расхождение с движком (график оплаты, например, уже не перечисляет все
настройки в зависимостях `useMemo`).

## What Changes

- Кривая оплаты от времени в пути → `engine/income.ts` (`incomeCurve()`), страница только
  рисует SVG по готовым точкам; зависимости `useMemo` становятся честными.
- Обход графа FIRS в обе стороны → `features/firs/chains.ts` (`chainNodes()`) с тестом, по
  образцу `features/optimizer/doubtful.ts`.
- Правило выбора экономики для груза (`FIRS: первая экономика, где груз есть; без FIRS —
  VANILLA`) → `dataset.ts` (`economyIdForCargo(game, cargo)`), используется оптимизатором и
  вкладкой рейса вместо двух рукописных условий.
- Конверсия скорости в `consist.ts` — через `units.internalToMph()` вместо
  `Math.floor(v * 10 / 16)` на месте.
- Сброс хранилища: `SettingsPage` перестаёт держать список ключей localStorage; сторы
  собираются в `state/index.ts` с функцией `resetPersistedState()`, которая чистит все
  зарегистрированные там persist-хранилища.
- Манипуляции с SVG-деревом graphviz в `FirsPage` (клики по `g.node`, приглушение
  `style.opacity`) остаются: SVG приходит строкой от WASM-рендерера и вставляется как HTML,
  React-дерева у него нет — переписать нечего, кроме как обвязать теми же
  `querySelectorAll`. Это осознанно.

## Non-goals

- Разбиение крупных страниц на подкомпоненты ради размера файла.
- Изменение UI и вёрстки.
- Тесты компонентов (`@testing-library/react`) — отдельная тема после того, как логика вынесена.

## Semver

**patch** — числа и localStorage не меняются; график тот же, только точки считает движок.

## Источник истины

Не требуется: формулы не трогаются, переносятся вызовы уже существующих функций движка.

## Capabilities

Спеки не затрагиваются: поведение не меняется (`skip_specs: true`).

## Impact

- `web/src/engine/income.ts`, `web/src/engine/consist.ts`, `web/src/dataset.ts`,
  новый `web/src/features/firs/chains.ts`, новый `web/src/state/index.ts`;
  правки в `RoutePage.tsx`, `FirsPage.tsx`, `OptimizerPage.tsx`, `SettingsPage.tsx`.
- Тесты: `engine.test.ts` (кривая оплаты: монотонность, длина, крайние точки),
  новый `features/firs/__tests__/chains.test.ts`, кейс на `economyIdForCargo`.

## Why

Три вкладки — оптимизатор, доход рейса и цепочки FIRS — импортируют презентационные компоненты
`TrainImage` и `CargoIcon` из файла **чужой страницы** `features/consist/ConsistPage.tsx`. Файл
страницы стал общей библиотекой: тронешь каталог машин — заденешь три другие вкладки, а импорт
`features/a → features/b` мешает и разбирать вкладки по отдельности, и понимать зависимости.

Рядом накопился мёртвый код: экспорты, которые не вызываются нигде, кроме собственных тестов
или вообще нигде (`accelSimulation`, `internalToKmh`, `yearTicks`, `cargoById`, …). Он создаёт
ложное впечатление, что поведение покрыто и используется.

## What Changes

- `TrainImage` и `CargoIcon` переезжают в `web/src/components/` — туда же, где уже живут
  `Money` и `Warning`; все вкладки импортируют их оттуда.
- Ни одна вкладка больше не импортирует из файла страницы другой вкладки.
- Удаляется мёртвый код движка: `accelSimulation()` и `AccelSimResult`, `internalToKmh()`,
  `yearTicks()`, `WAIT_TIME_THRESHOLD_DAYS`, `cargoById`, `paletteSource` — вместе с их тестами,
  если такие есть. `internalToMph()` остаётся: он выражает игровую конверсию и используется
  как раз там, где сейчас продублирован вручную (отдельный change).
- Поведение приложения не меняется: та же вёрстка, те же числа, тот же localStorage.

## Capabilities

Спеки не затрагиваются: это перемещение кода и удаление невызываемого — наблюдаемое поведение
остаётся прежним (`skip_specs: true`).

## Impact

- Код: новый `web/src/components/TrainImage.tsx` и `CargoIcon.tsx`; правки импортов в
  `features/consist/ConsistPage.tsx`, `features/optimizer/OptimizerPage.tsx`,
  `features/route/RoutePage.tsx`, `features/firs/FirsPage.tsx`.
- Удаления: `web/src/engine/physics.ts`, `units.ts`, `settings.ts`, `rating.ts`, `dataset.ts`,
  `skin.ts`.
- Риск: `accelSimulation()` — единственный кусок симуляции разгона; если он понадобится под
  будущую вкладку «время разгона», его вернут из истории git (пункт зафиксирован в design.md).

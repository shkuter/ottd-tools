## 1. Данные: экстрактор FIRS и палитра

- [x] 1.1 `extract_firs.py`: `colour_by_economy` у груза из `cargo.get_cargo_colour(economy)`
- [x] 1.2 `extract_firs.py`: `graph.tuning` из `economy.cargoflow_graph_tuning` (грузы → метки,
      неизвестный id — падение), `graph.supply_labels` из `doc_helper`, `excluded_labels` =
      banned + supply; константа `GRAPH_EXCLUDED_LABELS` и `economy_dot()` удалены
- [x] 1.3 `extract_vanilla.py`: `web/src/data/game_palette.json` — 256 цветов из
      `table/palettes.h`
- [x] 1.4 Новый `pipeline/extract_industry_images.py` + цель `data-industry-images` в
      `Makefile` (из `make data`): полные и nearest ×0.5 картинки, поля `image`/`image_small`;
      строка в `web/public/icons/ATTRIBUTION.md`
- [x] 1.5 Тест пайплайна: картинки у каждого предприятия каждой экономики, цвет у каждого
      груза, `tuning` Steeltown содержит `slag`/`wharf`; `make data`, `validate.py` знает
      новые поля

## 2. Типы и датасет

- [x] 2.1 `types.ts`: `Cargo.colour_by_economy`, `Industry.image`/`image_small`,
      `Economy.graph` без `dot`, с `tuning` и `supply_labels`; `dataset.ts` — `gamePalette`
- [x] 2.2 `i18n/names.ts`: удалить `localiseDot()` и её тест в `locales.test.ts`

## 3. Построение и раскладка графа (тесты первыми)

- [x] 3.1 `graph/model.ts` + `graph/sizes.ts`: типы узлов/рёбер, id дублей, `baseId`
- [x] 3.2 `graph/buildGraph.ts` с тестами: supply/banned не узлы; wormhole → строка «На …»
      без ребра; дубли по тюнингу, связанные с общим узлом; ранги/кластеры/группы в DOT;
      размеры не зависят от языка (DOT одинаков для en/ru кроме подписей)
- [x] 3.3 `graph/layout.ts` с тестами разбора `plain` (узел, сплайн, ось y) на фикстуре
- [x] 3.4 Обход по базовому id: клоны сводятся к id предприятия / метке груза
      (`model.baseNodeId`), `chains.ts` остаётся как есть; тест — каждый клон сводится к
      узлу, который знает обход

## 4. Полотно

- [x] 4.1 `graph/useZoomPan.ts` с тестами: зум вокруг курсора, пан, «вписать», «1:1»
- [x] 4.2 `GraphCanvas.tsx`: SVG рёбер + абсолютные узлы, подсветка по `baseId`, клик
      (не после перетаскивания — тест), заглушка загрузки; карточка и бейдж —
      `GraphNodeCard.tsx`, цвета — `cargoColour.ts`
- [x] 4.3 Подмена картинок у видимых узлов при `k > 1` — чистая функция с тестом
- [x] 4.4 Поиск по узлу: центрирование и выбор
- [x] 4.6 Клик мышью доходит до узла: указатель захватывается только с началом
      перетаскивания; проверка настоящим указателем в браузере
      (`__tests__/visual/graph.visual.test.ts`), в jsdom — что захвата до движения нет
- [x] 4.5 `FirsPage.tsx`: новое полотно вместо `graph-container`, поведение выбора и цели
      прежнее, `ChainTasks` на месте

## 5. Карточка и мосты

- [x] 5.1 Стрелки моста в «Снабжение» у строк принимаемых грузов карточки предприятия
      (`chainTaskToSupply`)
- [x] 5.2 `cargoToIncome()` в `bridge.ts` с тестом; стрелка в «Доход рейса» у карточки груза;
      пометка происхождения

## 6. Строки интерфейса

- [x] 6.1 `en.json`/`ru.json`: `firs.node.*` («Требует», «Производит», «На …»), `firs.graph.*`
      (поиск, зум, вписать, загрузка), подсказки мостов; `locales.test.ts` зелёный

## 7. Скин и проверки вида

- [x] 7.1 `skin.css`: стили полотна, узлов, бейджей, рёбер, кнопок; правила перекраски
      graphviz удалены; `skin-palette.test.ts` зелёный
- [x] 7.2 Палитра на отрисованной странице (`colours.ts`/`findings.ts`): полная палитра
      игры внутри `graph-canvas`; `chart.visual.test.ts`: токены скина + цвета грузов;
      `routes.ts` ждёт узел графа, `clipping.visual.test.ts` — полотно вместо
      `graph-container`; `make check-visual`

## 8. Документы

- [x] 8.1 ADR 0007 и 0008 в `docs/adr/`; термины в `CONTEXT.md`
- [x] 8.2 `README.md` + `README.ru.md` — абзац вкладки
- [x] 8.3 `CHANGELOG.md` `[Unreleased]` (по-английски)

## 9. Проверка

- [x] 9.1 `make data`, `make check-i18n`, `npx tsc -b`, `npx oxlint src`, `make test`,
      `make check-visual`; прод-сборка и просмотр `/firs` в браузере рядом с grf.farm

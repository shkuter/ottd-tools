## 1. Данные: экстрактор FIRS и палитра

- [ ] 1.1 `extract_firs.py`: `colour_by_economy` у груза из `cargo.get_cargo_colour(economy)`
- [ ] 1.2 `extract_firs.py`: `graph.tuning` из `economy.cargoflow_graph_tuning` (грузы → метки,
      неизвестный id — падение), `graph.supply_labels` из `doc_helper`, `excluded_labels` =
      banned + supply; константа `GRAPH_EXCLUDED_LABELS` и `economy_dot()` удалены
- [ ] 1.3 `extract_vanilla.py`: `web/src/data/game_palette.json` — 256 цветов из
      `table/palettes.h`
- [ ] 1.4 Новый `pipeline/extract_industry_images.py` + цель `data-industry-images` в
      `Makefile` (из `make data`): полные и nearest ×0.5 картинки, поля `image`/`image_small`;
      строка в `web/public/icons/ATTRIBUTION.md`
- [ ] 1.5 Тест пайплайна: картинки у каждого предприятия каждой экономики, цвет у каждого
      груза, `tuning` Steeltown содержит `slag`/`wharf`; `make data`, `validate.py` знает
      новые поля

## 2. Типы и датасет

- [ ] 2.1 `types.ts`: `Cargo.colour_by_economy`, `Industry.image`/`image_small`,
      `Economy.graph` без `dot`, с `tuning` и `supply_labels`; `dataset.ts` — `gamePalette`
- [ ] 2.2 `i18n/names.ts`: удалить `localiseDot()` и её тест в `locales.test.ts`

## 3. Построение и раскладка графа (тесты первыми)

- [ ] 3.1 `graph/model.ts` + `graph/sizes.ts`: типы узлов/рёбер, id дублей, `baseId`
- [ ] 3.2 `graph/buildGraph.ts` с тестами: supply/banned не узлы; wormhole → строка «На …»
      без ребра; дубли по тюнингу, связанные с общим узлом; ранги/кластеры/группы в DOT;
      размеры не зависят от языка (DOT одинаков для en/ru кроме подписей)
- [ ] 3.3 `graph/layout.ts` с тестами разбора `plain` (узел, сплайн, ось y) на фикстуре
- [ ] 3.4 `chains.ts`: обход по `baseId`, тест с дублем

## 4. Полотно

- [ ] 4.1 `graph/useZoomPan.ts` с тестами: зум вокруг курсора, пан, «вписать», «1:1»
- [ ] 4.2 `GraphCanvas.tsx`: SVG рёбер + абсолютные узлы, подсветка по `baseId`, клик,
      заглушка загрузки; `IndustryNode.tsx`, `CargoBadge.tsx`
- [ ] 4.3 Подмена картинок у видимых узлов при `k > 1` — чистая функция с тестом
- [ ] 4.4 Поиск по узлу: центрирование и выбор
- [ ] 4.5 `FirsPage.tsx`: новое полотно вместо `graph-container`, поведение выбора и цели
      прежнее, `ChainTasks` на месте

## 5. Карточка и мосты

- [ ] 5.1 Стрелки моста в «Снабжение» у строк принимаемых грузов карточки предприятия
      (`chainTaskToSupply`)
- [ ] 5.2 `cargoToIncome()` в `bridge.ts` с тестом; стрелка в «Доход рейса» у карточки груза;
      пометка происхождения

## 6. Строки интерфейса

- [ ] 6.1 `en.json`/`ru.json`: `firs.node.*` («Требует», «Попутно», «На …»), `firs.graph.*`
      (поиск, зум, вписать, загрузка), подсказки мостов; `locales.test.ts` зелёный

## 7. Скин и проверки вида

- [ ] 7.1 `skin.css`: стили полотна, узлов, бейджей, рёбер, кнопок; правила перекраски
      graphviz удалены; `skin-palette.test.ts` зелёный
- [ ] 7.2 `palette.visual.test.ts`: полная палитра игры внутри `graph-canvas`;
      `chart.visual.test.ts`: токены скина + цвета грузов; `routes.ts` и
      `clipping.visual.test.ts` — полотно вместо `graph-container`; `make check-visual`

## 8. Документы

- [ ] 8.1 ADR 0007 и 0008 в `docs/adr/`; термины в `CONTEXT.md`
- [ ] 8.2 `README.md` + `README.ru.md` — абзац вкладки
- [ ] 8.3 `CHANGELOG.md` `[Unreleased]` (по-английски)

## 9. Проверка

- [ ] 9.1 `make data`, `make check-i18n`, `npx tsc -b`, `npx oxlint src`, `make test`,
      `make check-visual`; прод-сборка и просмотр `/firs` в браузере рядом с grf.farm

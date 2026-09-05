## Context

Вкладка после `add-industry-dependency-tree`: `FirsPage.tsx` держит граф (`graph-container`
с SVG от graphviz через `dangerouslySetInnerHTML`), боковую карточку `NodeCard`, а под ними
`ChainTasks` — панель цели и задачи снабжения. Стор `firsStore` (не persist): `selectedNode`,
`chainTargetId`, `targetOutputPerMonth`; клик по предприятию ставит и выбор, и цель, смена
экономики сбрасывает оба. `chains.ts` — обход соседей в обе стороны по `economy.graph.edges`.
DOT приходит готовым из `economies.json` (`economy_dot()` в `pipeline/extract_firs.py`),
подписи подменяет `localiseDot()` регуляркой. Скин перекрашивает SVG правилами
`skin.css` (`g.node polygon`, `g.edge path`), а `chart.visual.test.ts` требует, чтобы в
графе не было цветов, кроме пяти токенов скина; `palette.visual.test.ts` сверяет всё со
133 цветами (градиенты + именованные).

Модули `engine/` не затрагиваются; настройки `GameSettings`/`CalcSettings` в расчёте не
участвуют — граф читает `game.firsEconomy` через `activeEconomy(game)`, как и сейчас.
Изменения данных описаны как правки экстракторов, не JSON.

## Goals / Non-Goals

**Goals:**
- Тот же вид, что у документации FIRS, тем же тюнингом, что задаёт сам набор.
- Полотно, по которому можно ходить: зум, пан, поиск; выбор узла и подсветка как раньше.
- Цвета грузов — те, что в игре; визуальные проверки продолжают стеречь всё вне графа.

**Non-Goals:**
- Автоматика раскладки поверх тюнинга набора; вид для ванильного набора.
- Правки расчётов, обратного обхода, задач снабжения.

## Decisions

### Данные (pipeline/extract_firs.py)

- **Цвет груза**: `cargo.get_cargo_colour(economy)` → `cargos.json`,
  `colour_by_economy: { <economy>: <индекс палитры> }` рядом с `price_factor_by_economy`.
  Индекс, не hex: hex резолвится на фронте по палитре игры, и тест вида сверяет тот же
  источник.
- **Палитра игры**: `web/src/data/game_palette.json` — 256 `#rrggbb` из
  `vendor/openttd/src/table/palettes.h` (DOS-палитра, та же, что читает `grf_sprites.py`).
  Пишет `extract_vanilla.py` (он уже парсит таблицы игры и идёт в `make data`);
  `opengfx2_palette.json` не трогаем — он про скин.
- **Тюнинг раскладки**: `economy.cargoflow_graph_tuning` → `economies.json`,
  `graph.tuning`: `{ clone_produce: [label], clone_accept: [label], wormhole_industries: [id],
  ranks: [{ rank, nodes }], clusters: [{ nodes, rank? }], edge_groups: [[node]] }`, где узел
  записан как id узла графа (`C:<label>` / `I:<id>`). Грузы в конфиге набора идут по
  `cargo.id`, узлы рангов/кластеров — по голому id; экстрактор переводит грузы в метки
  (`label_by_id`), предприятия оставляет, неизвестный id — падение (как
  `unpack_cargoflow_node_name` у FIRS). В `wormhole_industries` экстрактор добавляет все
  городские предприятия экономики, как `doc_helper` у FIRS; сами они помечены флагом
  `town_industry` в записи предприятия (`industries.json`), по нему страница их не рисует.
  Пустой конфиг → `tuning` с пустыми списками.
- **Грузы снабжения**: `doc_helper.supply_cargos` → `graph.supply_labels` (по меткам);
  `graph.excluded_labels` остаётся = banned (`PASS`, `MAIL`) + supply, чтобы потребители
  поля не ломались. `GRAPH_EXCLUDED_LABELS` как константа уходит — список берётся у
  источника. Рёбра `graph.edges` по-прежнему без supply и banned.
- **`graph.dot` удаляется** из данных и из `Economy`; `economy_dot()` — из экстрактора.
- **Картинки**: новый `pipeline/extract_industry_images.py` — для каждого предприятия из
  `industries.json` копирует `vendor/firs/src/docs/static/img/industries/<id>.png` в
  `web/public/icons/industries/<id>.png` и пишет nearest ×0.5 в
  `web/public/icons/industries/small/<id>.png`; поля `image` и `image_small` у записи.
  Nearest — потому что бикубик родил бы цвета вне палитры. Цель `make data-industry-images`,
  вызывается из `make data`: шаг дешёвый (копирование), и тест «у каждого предприятия есть
  картинка» иначе не работает после `make data`. `ATTRIBUTION.md` — строка про графику FIRS.
- Тест пайплайна (`pipeline/tests/`): у каждого предприятия каждой экономики есть обе
  картинки на диске; у каждого груза экономики есть цвет; `tuning` Steeltown содержит
  `slag` в `clone_produce` и `wharf` в `wormhole_industries` (сверено с `steeltown.py`).

### Построение графа (web/src/features/firs/graph/)

- **`model.ts`** — `GraphNode { id, kind: 'industry'|'cargo', baseId, width, height,
  industry?, cargo?, notes: string[] }`, `GraphEdge { from, to, cargoLabel }`,
  `Layout { nodes: NodePlacement[], edges: EdgeSpline[], width, height }`. Id узлов:
  `I:<industry>`, `C:<label>`, дубли `C:<label>@<industry>` (на приём) и
  `I:<industry>@<label>` (на выпуск) — `baseId` у дубля указывает на груз. `@` не встречается
  ни в id FIRS, ни в метках, поэтому `baseId` восстанавливается разбором.
- **`buildGraph.ts`** — чистая: `(economy, { industryById, cargoByLabel }, names) → { nodes,
  edges, dot }`, где `names` — уже переведённые функции имён и строк (страница строит их из
  `t()` и словарей, ключуя мемо на локали). Правила из спеки: supply/banned не узлы; wormhole-ребро не создаётся, а даёт строку
  «На <предприятие>» в бейдже груза; дубли по спискам тюнинга связаны с общим узлом одним
  ребром (как у FIRS: `C_x -> C_x_ind_2 -> I_ind`); ранги, кластеры, группы — в DOT
  (`newrank=true`, `rankdir=LR`, кластеры без рамки). Размеры узлов — в DOT как
  `fixedsize=true, width, height` в дюймах при `dpi=72`, т.е. пиксели/72: ширина
  предприятия — константа (200px), высота — картинка + строки по их числу; бейдж —
  константа ширины, высота по числу строк «На …». Так раскладка не зависит от языка.
- **`layout.ts`** — `layoutGraph(dot): Promise<Layout>`: динамический импорт
  `@hpcc-js/wasm-graphviz`, `graphviz.layout(dot, 'plain', 'dot')`, разбор строк
  `graph`/`node`/`edge` (дюймы, ось y снизу вверх → пиксели, y сверху вниз). Формат
  `plain` — потому что даёт ровно то, что нужно (центр узла, контрольные точки сплайна), без
  разбора JSON-операций рисования. Сплайн → SVG-путь: точки идут четвёрками кубической
  Безье; стрелка — треугольник на последней точке по касательной. `Layout` — функция одного
  DOT: только места и сплайны, без текста узлов и без грузов; `placeNodes(graph, layout)` и
  `placeEdges(graph, layout)` соединяют их с графом текущего языка. Результат кэшируется по тексту DOT (`cachedLayout(dot)` отдаёт его
  синхронно): раскладка от языка не зависит, поэтому смена языка не перекладывает граф, не
  показывает заглушку и не сбрасывает зум, а лишь перерисовывает подписи.
- Размеры узлов — единственный вход раскладки, зависящий от скина: константы в
  `graph/sizes.ts`, выведенные из `SKIN_SCALE` (`skin.ts`, копия `--skin-scale`, равенство
  стережёт `sizes.test.ts`): кегль × число строк + отступы + бордюр.

### Полотно (GraphCanvas.tsx)

- `<div class="graph-canvas">` фиксированной высоты (`clamp(480px, 70vh, 900px)`),
  `overflow: hidden`; внутри слой с `transform: translate(x, y) scale(k)`: SVG рёбер
  (размер `Layout`) и поверх — абсолютно позиционированные узлы (`GraphNodeCard` —
  карточка предприятия или бейдж груза; цвета — `cargoColour.ts`). Зум колесом вокруг курсора, пан перетаскиванием (pointer events,
  кнопки «+», «−», «1:1», «вписать»; начальное состояние — вписать. Своя реализация
  (~60 строк в `useZoomPan.ts`): библиотека тянула бы CSS мимо слоёв. `setPointerCapture`
  вызывается **не на нажатии, а на первом движении**: захват нужен, чтобы пан не отставал
  за краем полотна, но по Pointer Events совместимый `click` после захвата уходит тому, кто
  захват держал, — захватив на `pointerdown`, полотно съедало бы каждый клик по узлу. В
  jsdom это не воспроизводится (перенаправления клика там нет), поэтому проверяется
  браузерным тестом `__tests__/visual/graph.visual.test.ts`.
- Подсветка: `chainNodes(economy, baseId)` как сейчас; узел получает `data-dim`, если его
  `baseId` вне множества, ребро — если вне хоть один конец. Клик по узлу →
  `setSelectedNode(baseId)` и для предприятия `setChainTargetId` — поведение прежнее. Клик,
  которым кончается перетаскивание, выбором не считается ни на фоне, ни на узле. Экономика
  выбора живёт в `firsStore` (`economyId`, `showEconomy`): вкладка сообщает, какую показывает,
  и стор сбрасывает выбор и цель, сделанные в другой, — экономика меняется на «Настройках»,
  пока вкладка размонтирована, поэтому ref в компоненте смену бы не увидел.
- Картинки: при `k > 1` узлы, чей прямоугольник пересекает видимую область (считается из
  `Layout` и текущего transform, не через IntersectionObserver — так проверяется юнит-тестом),
  получают `image`, остальные `image_small`; `image-rendering: pixelated`.
- Поиск: Mantine `Select` с поиском над полотном по узлам экономики (имя на текущем языке,
  предприятия и грузы, без дублей); выбор → центрирование узла, `setSelectedNode`.
- Загрузка wasm: пока раскладки нет — полотно показывает заглушку загрузки (в прод-сборке
  Steeltown с дублями ~300 узлов; замерить, ожидание до ~1 с).

### Карточка и мосты

- `NodeCard` остаётся; у каждой строки принимаемого груза в карточке предприятия — стрелка
  моста в «Снабжение» через существующий `chainTaskToSupply({ industryId, cargoLabel,
  distanceTiles: null, productionPerMonth: null })` и `applyBridge`; у карточки груза —
  стрелка в «Доход рейса» через новый `cargoToIncome(label, game): Bridge<Partial<RoutePrefill>>`
  (блокер `noCargo`). Пометка происхождения — по общему механизму `prefillOrigin`.

### Скин и проверки вида

- `skin.css`: правила перекраски graphviz уходят; вместо них стили `.graph-canvas`,
  `.graph-node` (`--industry` / `--cargo`), рёбер и кнопок; цвет груза ставится инлайновым
  `style="--cargo-colour: #…"` из `game_palette.json`, текст бейджа — цветом по контрасту.
- Проверка палитры на отрисованной странице (`visual/colours.ts`, `visual/findings.ts`)
  получает второй набор — для элементов, чей путь содержит `graph-canvas`, допустима вся
  `game_palette.json`. `chart.visual.test.ts`:
  «граф красит скин» переписывается — допустимы токены скина плюс цвета грузов из данных.
  `routes.ts`: у `/firs` `scrollsX: ['table-wrap']`, а готовность — `.graph-canvas
  .graph-node` (раскладка приходит из wasm после вкладки; снимок до неё видел бы только
  заглушку); `clipping.visual.test.ts` пропускает `.graph-canvas` вместо `.graph-container`.
  `exemptions.ts` остаётся пустым.

### Документы

- ADR 0007 «Chain graph layout tuning comes from FIRS, not from us»; ADR 0008 «Inside the
  chain graph the whole game palette is allowed». `CONTEXT.md`: клон узла груза (cargo node
  clone), wormhole-предприятие, груз снабжения (supply cargo), тюнинг раскладки (layout
  tuning), полотно (canvas). README (оба) — абзац вкладки; CHANGELOG `[Unreleased]`.

## Risks / Trade-offs

- **Время раскладки**: дубли удваивают-утраивают число узлов Steeltown. Мемоизация по
  экономике и заглушка загрузки; если дольше секунды — сжать `ranksep`/`nodesep`.
- **Фиксированные размеры узлов** обрезают длинные русские имена («Песчано-гравийная
  смесь») — перенос на две строки и `title` с полным именем.
- **Формат `plain`** не выдаёт кластеры — нам они нужны только раскладчику, рамок не рисуем.
- **Nearest ×0.5** теряет ~20 % пикселей (картинки FIRS не 2×-спрайты): на натуральной
  величине незаметно, при зуме подменяется полный файл.
- Тест «граф красит скин» ослабляется на цвета грузов из данных — зафиксировано ADR 0008.

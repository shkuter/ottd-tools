## 1. Общие места вместо копий

- [ ] 1.1 Добавить в `web/src/engine/units.ts` чистую `displaySpeed(internal, unit): number`
      (усечение как в игре, тот же выбор `internalToMph` / `internalToKmh`) и переписать
      `speedValue` в `web/src/components/format.ts` как `String(displaySpeed(internal, unit))`;
      проверка — `make test` зелёный, ни одна цифра скорости в существующих тестах не поехала
- [ ] 1.2 Вынести предикат «собственный предел машины связывает» из выражения в
      `web/src/engine/consist.ts:120` в `ownLimitBinds(train, game)` в
      `web/src/engine/tracktypes.ts`, вместе с комментарием о том, почему решает `kind`, и
      звать её из `consist.ts`; проверка — `engine/__tests__/wagon-speed-limits.test.ts`
      проходит без правок
- [ ] 1.3 Завести `UNITS_PER_TILE = 16` в `web/src/engine/units.ts` и заменить литерал в
      `engine/consist.ts` (`lengthTiles`) и `engine/optimize.ts` (`lengthTiles`); проверка —
      `make test` зелёный, инвариант «тайл = 16 единиц» из CLAUDE.md записан в одном месте

## 2. Формулы

- [ ] 2.1 Создать `web/src/features/consist/metrics.ts` с `capacityPerTile(train, calc)`
      (вместимость × `UNITS_PER_TILE` / `train.length`, `null` при нулевой вместимости) и
      `capacityTimesSpeed(train, track, game, calc, speedUnit)` (вместимость × отображаемая
      скорость `topSpeedOn` через `displaySpeed`; `null` без собственной скорости, при нулевой
      вместимости и когда `ownLimitBinds` отвечает «нет»); без импорта сторов. Проверка — новый
      `web/src/features/consist/__tests__/metrics.test.ts` (на английском): машина в 8 единиц
      даёт вдвое больше номинала, в 16 — номинал; произведение равно вместимости × числу,
      которое печатает колонка «Скорость» в обеих единицах; `lgv_capable` вагон на пути с `lgv`
      считается от второй скорости; ванильный вагон — `null`; вагон при выключенных лимитах —
      `null`, локомотив с вместимостью при них же — число

## 3. Сортировка

- [ ] 3.1 Добавить в `web/src/features/consist/sorting.ts` колонки `capacity_per_tile` и
      `capacity_speed` в `CatalogueColumn`, третий аргумент `speedUnit` в
      `catalogueSortValues(game, calc, speedUnit)` и значения через функции из `metrics.ts`;
      проверка — `web/src/features/consist/__tests__/sorting.test.ts` дополнен: обе колонки
      сортируются по значению своей функции, строки с `null` идут в конец при обоих
      направлениях (по образцу теста колонки мощности), существующие кейсы проходят с новой
      сигнатурой

## 4. Страница каталога

- [ ] 4.1 В `web/src/features/consist/ConsistPage.tsx` вывести два заголовка `SortableTh`
      (`table.capacityPerTile`; `withUnit(t('table.capacitySpeed'), speedUnitLabel())`) и две
      ячейки `cell-num` (`num(v, 1)` и `num(v)`, прочерк при `null`) только при
      `cargoFilter !== ''`, читая значения теми же функциями `metrics.ts`; проверка —
      компонентный тест `web/src/features/__tests__/capacityColumns.test.tsx` (на английском,
      по образцу `buyMenuNote.test.tsx`): без груза заголовков нет, с выбранным грузом есть и в
      строке стандартного вагона стоит удвоенная вместимость
- [ ] 4.2 Откат сортировки: завести в `ConsistPage` один хелпер сброса фильтра груза, который
      ставит `DEFAULT_SORT`, если `sort.column` — одна из двух новых колонок, и звать его из
      обоих мест сброса (обработчик `onChange` фильтра и эффект, сбрасывающий устаревший груз
      при смене экономики), чтобы правило не разъехалось между копиями; проверка — в том же
      компонентном тесте: сортировка по «Вместимость/клетку», сброс фильтра в «любой» — колонок
      нет, отмечен заголовок «Год», порядок по умолчанию
- [ ] 4.3 Строка-пояснение под таблицей при выбранном грузе и `game.wagonSpeedLimits === false`
      (`consist.capacitySpeedNoWagonLimits`); проверка — в том же компонентном тесте: с
      выключенной настройкой у вагона в колонке прочерк, строка видна; с включённой — строки
      нет

## 5. Строки

- [ ] 5.1 Завести `table.capacityPerTile` («Capacity/tile» / «Вместимость/клетку»),
      `table.capacitySpeed` («Capacity × speed» / «Вместимость × скорость») и
      `consist.capacitySpeedNoWagonLimits` в `web/src/i18n/en.json` и `ru.json`; проверка —
      `i18n/__tests__/locales.test.ts` проходит (названия грузов и предприятий не трогать —
      они генерируются)

## 6. Документация

- [ ] 6.1 Добавить термины **Capacity per tile** и **Capacity × speed** в раздел Catalogue
      файла `CONTEXT.md` в формулировке из design.md, вместе со строками `_Avoid_`; проверка —
      термины есть, русская колонка каждого совпадает со строкой интерфейса из `ru.json`,
      ссылки **track type**, **fleet**, **hauled per year** указывают на существующие записи
- [ ] 6.2 Дописать в абзац о вкладке «Конструктор состава» в `README.md` и `README.ru.md` (одним
      коммитом) упоминание двух колонок под выбранный груз; проверка — оба файла изменены в
      одном коммите, структура абзаца совпадает
- [ ] 6.3 Дописать запись в `## [Unreleased]` → `### Added` файла `CHANGELOG.md` (на
      английском): две колонки каталога, условие показа, прочерк при выключенных лимитах
      вагонов; проверка — `scripts/next-version.sh` выводит minor

## 7. Проверка

- [ ] 7.1 Прогнать `make check-visual`; проверка — зелёный, заголовки таблицы каталога с
      выбранным грузом не переносятся на три строки, новых исключений в `visual/exemptions.ts`
      нет
- [ ] 7.2 Прогнать `make test`; проверка — набор зелёный

## 1. Рамка фокуса

- [ ] 1.1 Сверить на `/kit` реальные классы фокусируемых частей (кнопка, NavLink, ActionIcon, Anchor, поле, Select, SegmentedControl input/label, Switch input/track, Checkbox) и записать селекторы в комментарий правила; проверка — список селекторов совпадает с DOM страницы `/kit`
- [ ] 1.2 Добавить в `web/src/skin-mantine.css` одно правило рамки фокуса по D1 (пунктир `--skin-text`, `:focus-visible` у кнопок и скрытых input, `:focus` у полей); проверка — `skin-palette.test.ts` зелёный, на `/kit` Tab по элементам показывает рамку, щелчок мышью по кнопке рамки не оставляет
- [ ] 1.3 Визуальная проверка `web/src/__tests__/visual/focus.visual.test.ts`: для поля, вкладки, жёлтой кнопки, пункта сегмента и переключателя после `keyboard.press('Tab')` computed `outline-style` = dashed и `outline-color` = токен `--skin-text` своей группы окна (в том числе в `brown` и `mauve`); после `mouse.click` по кнопке outline отсутствует; проверка — `make check-visual` зелёный

## 2. Сортировка с клавиатуры

- [ ] 2.1 Переделать `web/src/components/table/SortableTh.tsx` по D2 (кнопка без обработчика внутри `th`, `aria-sort` у активной колонки), сбросить вид кнопки в скине так, чтобы заголовок выглядел как раньше; проверка — `capacityColumns.test.tsx` и визуальные `table`/`list` проверки зелёные без правок
- [ ] 2.2 Юнит-тест рядом с компонентом: Tab до заголовка, три Enter дают возрастание → убывание → порядок по умолчанию; `aria-sort` только у отсортированной колонки; один щелчок даёт ровно один такт; проверка — `cd web && npx vitest run SortableTh`

## 3. Кнопка импорта

- [ ] 3.1 Перевести `web/src/features/savegame-import/SavegameFileButton.tsx` на `FileButton` Mantine по D3 (`accept=".sav"`, `disabled={reading}` и в `FileButton`, и в `Button`, `null` из `onChange` игнорируется, сброс через `resetRef`, повторный выбор того же файла работает); проверка — существующие тесты `SavegameImportLauncher.test.tsx` и `SavegameImportPanel.test.tsx` зелёные
- [ ] 3.2 Тест: `getByRole('button', { name: <подпись импорта> })` находится и в шапке, и в настройках, достигается `user.tab()`; Enter на кнопке вызывает `click` у файлового input (шпион на `HTMLInputElement.prototype.click`); во время чтения кнопка `disabled`; проверка — vitest по этим файлам
- [ ] 3.3 В `web/src/skin.css` добавить `@media (max-width: 700px)` с `position: absolute` для `.savegame-launcher` (D4); обновить `launcher.visual.test.ts`: селектор `label` → `button`, «остаётся в углу» проверяется на широком окне, новый кейс — на 400px после прокрутки кнопка ушла вверх и не пересекается с содержимым `main`; проверка — `make check-visual`

## 4. Имена элементов управления

- [ ] 4.1 `web/src/components/SettingRow.tsx` по D5: `useId`, `useLayoutEffect` связывает контролы с пустым вычисленным именем (включая Switch с пустым обёрточным label) с названием и подсказкой, пропуская `aria-hidden` и `tabindex=-1`; проверка — тест на `SettingsPage`: ни одного `combobox`/`switch`/`spinbutton`/`textbox` с пустым доступным именем, отдельно — конкретный переключатель находится по `getByRole('switch', { name: <название настройки> })` и несёт описание из подсказки, стрелки NumberInput `aria-labelledby` не получили
- [ ] 4.2 Ключи en/ru для имён полей снабжения и кнопок «добавить/убрать машину» (D6); проверка — `i18n/__tests__/locales.test.ts` зелёный
- [ ] 4.3 Проставить имена полям таблицы в `IndustrySupplyPage.tsx` и кнопкам в `ConsistPage.tsx`; проверка — тесты: поле расстояния находится по имени с грузом, кнопка добавления — по имени машины

## 5. Заголовок документа и движение

- [ ] 5.1 В `web/src/App.tsx` эффект заголовка документа по D7, объявленный до `usePageviews()`; проверка — тест: переход на `/income` даёт «<Route income> — OTTD Tools», переключение языка переписывает заголовок, `/game` — имя файла, `/kit` — название сайта; при замоканном `countPageview` (или `window.goatcounter.count` в режиме PROD) счётчик при переходе видит уже новый `document.title`
- [ ] 5.2 `respectReducedMotion: true` в `web/src/theme.ts`; проверка — юнит-тест, что `theme.respectReducedMotion === true`, и визуальная проверка: при `page.emulateMedia({ reducedMotion: 'reduce' })` у открытого выпадающего списка computed `transition-duration` равен `0s`

## 6. Кегль читаемого текста

- [ ] 6.1 По D9 перевести `h4`–`h6` в `theme.ts` и подвал, `.intro-reset`, `h4`, `.subtitle` в `skin.css` на `var(--skin-font)`; проверка — `footer-switch.visual.test.ts` и `launcher.visual.test.ts` зелёные
- [ ] 6.2 Визуальная проверка в `type.visual.test.ts`: на каждой вкладке (и `/kit`) у перечисленных спекой элементов — текст и ссылки подвала, переключатель языка, `.subtitle`, `h4`–`h6`, надписи кнопок — computed `font-size` не меньше значения `--skin-font`, а в подвале у текста и ссылок один кегль (подписи графиков и полотна графа проверка не трогает); проверка — `make check-visual`

## 7. Недоступный пункт сегмента

- [ ] 7.1 В `skin-mantine.css` по D10 дать надписи недоступного пункта сплошную подложку `--skin-button`, штриховка остаётся на плашке; расширить `disabled.visual.test.ts`: у надписи недоступного пункта `background-color` = `--skin-button`, у самого пункта штриховка есть; проверка — `make check-visual`
- [ ] 7.2 В `OptimizerPage.tsx` по D10: подписи недоступных из-за выпуска целей получают `title` с текстом `opt.goalNeedsProduction`, строка `.goal-hint` — `id`, недоступные радио ряда целей — `aria-describedby` на неё (снимается, когда пункт доступен); проверка — тест: при выпуске 0 радио «Haul» имеет доступное описание с причиной (`toHaveAccessibleDescription`), при выпуске > 0 описания нет

## 8. Завершение

- [ ] 8.1 Запись в `CHANGELOG.md` → `[Unreleased]` → `### Fixed` на английском: keyboard focus, sortable headers, import button, control names, tab titles, reduced motion, small print, disabled goal lettering; проверка — `scripts/next-version.sh` выдаёт patch
- [ ] 8.2 Прогнать `make test` и `make check-visual`, `cd web && npx oxlint`; проверка — все зелёные

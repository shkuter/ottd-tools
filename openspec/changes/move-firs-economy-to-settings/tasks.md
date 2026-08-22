## 1. Настройка

- [ ] 1.1 Добавить `firsEconomy: string` в `GameSettings` и `DEFAULT_GAME_SETTINGS`
      (`web/src/engine/settings.ts`), значение по умолчанию `STEELTOWN`, комментарий на
      английском рядом с флагом `firs`
- [ ] 1.2 В `normaliseGame()` (`web/src/state/settingsStore.ts`) откатывать неизвестный id
      экономики на `STEELTOWN`
- [ ] 1.3 Добавить поле выбора экономики в `SettingsPage.tsx`, в секцию «Наборы NewGRF» под
      тумблером FIRS, скрывая его при `game.firs === false`
- [ ] 1.4 Завести ключи `settings.firsEconomy` и подсказку в `i18n/en.json` + `ru.json`

## 2. Активный набор грузов

- [ ] 2.1 Перевести `activeCargos(game)` (`web/src/dataset.ts`) на грузы выбранной экономики,
      с мемоизацией списка по id экономики; проверить, что `activeCargoByLabel` следует за ней
- [ ] 2.2 Заменить `economyIdForCargo(game, cargo, preferred)` на `economyIdForPayment(game)`
      и обновить вызовы в оптимизаторе и на вкладке дохода
- [ ] 2.3 Убедиться, что глобальные `cargos` / `cargoByLabel` остались полными и карточка узла
      FIRS с `localiseDot()` работают на грузах любой экономики

## 3. Вкладки

- [ ] 3.1 Убрать табы экономик в `FirsPage.tsx`, заменив строкой с названием текущей экономики
      и подсказкой про настройки; граф читает экономику из настроек
- [ ] 3.2 Убрать `Select` экономики в `RoutePage.tsx`, читать экономику из настроек
- [ ] 3.3 Сбрасывать выбранный груз на первый доступный, если его нет в активном наборе
      (вкладка дохода и фильтры оптимизатора)
- [ ] 3.4 Удалить `economyId` из `routeStore`; удалить `economyId` и `persist` из `firsStore`

## 4. Импорт сохранения

- [ ] 4.1 Класть экономику в `game.firsEconomy` в `buildImport()`, убрать поле
      `SavegameImport.economyId`
- [ ] 4.2 Убрать особую ветку экономики и параметр `economyId` из `diffImport()`; название
      экономики показывать форматтером значения настройки
- [ ] 4.3 Убрать запись в сторы вкладок из `applyImport()` и обновить `SavegameImportPanel.tsx`

## 5. Тесты и проверка

- [ ] 5.1 Расширить снимок `engine/__tests__/settings-effect.test.ts` набором активных грузов
      и добавить кейс для `firsEconomy`
- [ ] 5.2 Добавить в `__tests__/dataset.test.ts` проверку активного набора по каждой экономике
      и отката неизвестного id
- [ ] 5.3 Обновить `savegame/__tests__/diff.test.ts` и `apply.test.ts` под новый путь
      применения экономики
- [ ] 5.4 Обновить `state/__tests__/reset.test.ts` под изменившиеся сторы
- [ ] 5.5 Проверить, что для груза, доступного в двух экономиках, числа не изменились
      (регрессия против текущего поведения)
- [ ] 5.6 Прогнать `make verify` (oxlint + vitest + сборка + `check-i18n`)

## 6. Документация

- [ ] 6.1 Дописать `CHANGELOG.md` в `[Unreleased]` с пометкой `**BREAKING**` (на английском)
- [ ] 6.2 Сверить `CONTEXT.md` (секция «Cargo sets») и `docs/adr/0002-firs-economy-is-a-game-setting.md`
      с тем, что вышло в коде

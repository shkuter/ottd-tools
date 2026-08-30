Код изменения по большей части уже написан и лежит в рабочем дереве (коммит `ce6082f`, сделанный
мимо OpenSpec). Задачи групп 1–3 — сверка того, что там есть, с требованиями спек; группы 4–6 —
доводка, которой не хватает.

## 1. Валюта RUR

- [ ] 1.1 Сверить, что `CURRENCIES` в `web/src/state/settingsStore.ts` содержит RUR с курсом 50 и
  суффиксом ` p`, а RUB остался с курсом 80 и знаком ` ₽`, — значения совпадают с
  `vendor/openttd/src/currency.cpp:52,65` (курсы), расхождение по знаку RUB осознанное
- [ ] 1.2 Сверить, что тест `web/src/components/__tests__/format.test.ts` считает обе валюты по
  своим курсам (46 £ → `2 300 p` на RUR и `3 680 ₽` на RUB) и что фунт не пересчитывается;
  проверка — `cd web && npx vitest run format.test`

## 2. Извлечение настроек отображения из сейва

- [ ] 2.1 Сверить `displaySettingsFrom()` и `CURRENCY_BY_INDEX` в `web/src/savegame/mapping.ts`:
  индексы валют совпадают с `vendor/openttd/src/currency.h` (RUR 21, RUB 34), карта покрывает
  все шесть валют из `CURRENCIES`, `locale.units_velocity` читается только для 0 и 1
- [ ] 2.2 Сверить, что незнакомая валюта и незнакомая система единиц дают **пустой** патч, а не
  значение по умолчанию, и что поле `display` в `SavegameImport` — `Partial<DisplaySettings>`;
  проверка — кейсы в `web/src/savegame/__tests__/extract.test.ts`, включая перенос с реального
  сейва `xussr-1872` (`{ currency: 'RUR', speedUnit: 'metric' }`)

## 3. Применение и показ различий

- [ ] 3.1 Сверить, что `applySettings` принимает настройки отображения третьим аргументом и
  применяет их одним кадром стора вместе с `game` и `calc`, а `applyImport` их передаёт;
  проверка — кейсы «валюта партии применяется вместе с остальным» и «сейв без валюты выбор не
  трогает» в `web/src/savegame/__tests__/apply.test.ts`
- [ ] 3.2 Сверить, что `ImportDiff` несёт группу `display`, валюта в ней печатается вместе с
  курсом (`RUR ×50`), а `identical` учитывает все три группы; проверка — чтение
  `web/src/savegame/diff.ts` против требования «Подтверждение различий»
- [ ] 3.3 Сверить, что `snapshotSettings()` по-прежнему получает только `game` и `calc`, то есть
  настройки отображения в снапшот партии не попадают (требование спеки `savegame-snapshot`)

## 4. Доводка API диффа

- [ ] 4.1 Сделать параметр `display` у `diffImport()` обязательным (`display: DisplaySettings`)
  и обновить четыре вызова в `web/src/savegame/__tests__/diff.test.ts`; проверка — `npx tsc`
  без ошибок и зелёный `npx vitest run diff.test`
- [ ] 4.2 Добавить в `diff.test.ts` кейс на саму группу: сейв на RUR при текущем RUB даёт запись
  в `diff.display` и `identical === false` (сейчас в файле только поле-заглушка `display: {}`)
- [ ] 4.3 Добавить в `web/src/features/settings/__tests__/SavegameImportPanel.test.tsx` кейс на
  то, что группа настроек отображения показана пользователю до подтверждения (сейчас там тоже
  только заглушка)

## 5. Тексты и документация

- [ ] 5.1 Переписать запись в `CHANGELOG.md`: новая валюта и перенос настроек отображения — в
  `### Added` секции `[Unreleased]`, в `### Fixed` остаётся только исправление сумм у партии на
  RUR; проверка — `bash scripts/next-version.sh` называет разряд по секциям и не падает
- [ ] 5.2 Убедиться, что новых UI-строк не требуется: `settings.currency`, `settings.speedUnit`,
  `settings.speedUnit.imperial`, `settings.speedUnit.metric` уже есть в `en.json` и `ru.json`, а
  коды валют не переводятся; проверка — `npx vitest run locales.test`
- [ ] 5.3 Убедиться, что кейс в `web/src/engine/__tests__/settings-effect.test.ts` не нужен:
  настройки отображения не входят в `GameSettings`/`CalcSettings` (тест перебирает только их) и
  на расчёт не влияют по требованию спеки `display-units`

## 6. Проверка

- [ ] 6.1 Прогнать `make test` — тесты пайплайна и весь набор `vitest` зелёные (данные не
  менялись, `make data` не нужен)
- [ ] 6.2 Прогнать `make verify` и `openspec validate import-display-settings --strict`

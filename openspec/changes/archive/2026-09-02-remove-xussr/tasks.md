## 1. Пайплайн и сборка

- [x] 1.1 Удалить `pipeline/extract_xussr.py`, `pipeline/xussr_nml.py`,
      `pipeline/extract_xussr_ru.py`, `pipeline/extract_xussr_images.py` и тесты
      `pipeline/tests/test_xussr_extraction.py`, `pipeline/tests/test_xussr_sources.py`.
      Результат: `pipeline/.venv/bin/python -m unittest discover pipeline/tests` проходит.
- [x] 1.2 Убрать из `Makefile` `XUSSR_REPO` / `XUSSR_REF`, цели `fetch-xussr` и `data-xussr`,
      их упоминания в `.PHONY`, в `fetch`, `data`, `check-i18n`, `data-images`.
      Результат: `make -n data` и `make -n data-images` не поминают xUSSR.
- [x] 1.3 Убрать `nml==0.9.0` и комментарий о нём из `pipeline/requirements.txt`.
- [x] 1.4 Вычистить `pipeline/validate.py`: блок `--- xussr ---`, третий источник в цикле
      проверок, ключ `xussr` в `meta.json`, роды тока `AC25`/`AC15`/`DC3`/`DC1_5`/`SELF` из
      `KNOWN_POWER_SOURCES`. Результат: `pipeline/.venv/bin/python pipeline/validate.py`
      проходит на закоммиченных данных.
- [x] 1.5 Снять комментарии-отсылки к xUSSR в `pipeline/extract_iron_horse.py`,
      `pipeline/extract_vanilla.py`, `pipeline/tests/test_known_values.py`. Поле
      `power_source` и `running_electric` в шифтах не трогать — они про оставшиеся наборы.

## 2. Данные, спрайты, словари

- [x] 2.1 Удалить `web/src/data/xussr_trains.json`, `web/src/i18n/trains_xussr.ru.json`,
      каталог `web/public/icons/xussr/` (926 файлов) и фикстуру
      `web/src/savegame/__tests__/fixtures/xussr-1872.sav`.
- [x] 2.2 Убрать ключ `xussr` из `web/src/data/meta.json` и секцию xUSSR из
      `web/public/icons/ATTRIBUTION.md`.

## 3. Ядро датасета и типы

- [x] 3.1 `web/src/dataset.ts`: убрать импорт и экспорты `xussrTrains` / `xussrTrainsMeta`,
      ключ `xussr` из `SETS`, третий спред в `trainByAnyId`, `xussrTrainById`,
      `xussrCarries()`, ветку `capacity_by_cargo` в `trainCapacity()` и в
      `hasNothingToCarry()`, поле `xussr` в `datasetMeta`.
- [x] 3.2 `web/src/types.ts`: убрать поля `grf`, `speed_by_source`, `capacity_by_cargo`,
      `running_roadveh` и относящиеся к ним комментарии; проверить `vehicle_group_pre` —
      его объявляет и Iron Horse, значит остаётся.
      Результат: `cd web && npx tsc --noEmit` чист.

## 4. Движок

- [x] 4.1 `engine/settings.ts`: `TRAIN_SETS` без `'xussr'`; `RunningClass` без `'roadveh'`
      и ветка в `basecostRunningFactor()`.
- [x] 4.2 `engine/costs.ts`: убрать `running_roadveh` из `BASE_PRICES` и ветку `ROADVEH`
      в `runningClassOf()`.
- [x] 4.3 `engine/purchase.ts`: `purchaseKey()` без ветки `capacity_by_cargo`.
- [x] 4.4 `engine/tracktypes.ts`: из `POWER_SOURCES` убрать `AC25`/`AC15`/`DC3`/`DC1_5`/`SELF`,
      удалить `speedForSystem()` и её вызов в `vehicleSpeedOn()`, снять сравнение с
      `values.SELF` в `onTheTrack()`, поправить докблок `trackTypeOfConsist`.
      Результат: `cd web && npx vitest run engine` зелёный.

## 5. Импорт сейва

- [x] 5.1 `savegame/registry.ts`: убрать импорт `xussr_trains.json`, `XUSSR_GRFIDS`,
      `XUSSR_UNBUILT_GRFIDS`, `grfidFromHex()` и записи xUSSR в `KNOWN_GRFS`; поле
      `KnownGrf.trainSet` оставить.
- [x] 5.2 `savegame/snapshot.ts`: убрать `multiFileIds` и её использование в
      `engineMatcher()` — последняя ветка возвращает `null`; убрать импорты xUSSR.
- [x] 5.3 Переписать тесты импорта: в `savegame/__tests__/extract.test.ts` и
      `snapshot.test.ts` убрать блоки на фикстуре xUSSR, а `describe('что партия продаёт')`
      перевести на `londworth-1975.sav`; в `snapshotStore.test.ts` заменить `trainSet` в
      тестовых наборах. Результат: `cd web && npx vitest run savegame` зелёный.

## 6. Локализация и UI

- [x] 6.1 `i18n/names.ts`: убрать импорт `trains_xussr.ru.json`, `TRAIN_NAMES` и
      `trainName()`; `RAILTYPE_NAMES` оставить только на `railtypes.ru.json` с переписанным
      комментарием; `trainSetName()` без ветки `'xussr'`.
- [x] 6.2 Заменить вызовы `trainName(train, locale)` на `train.name` в
      `features/optimizer/{sorting.ts,doubtful.ts,OptimizerPage.tsx}`,
      `features/consist/{sorting.ts,ConsistPage.tsx}`, `features/savegame/labels.ts`,
      `features/__tests__/buyMenuNote.test.tsx`; `matchesTrainName()` оставить общей точкой
      поиска, упростив до сравнения с `train.name`.
- [x] 6.3 Убрать из `en.json` и `ru.json` ключи `savegame.grf.xussr`,
      `savegame.grf.xussrSubways`, `savegame.grf.xussrIvolga`; из
      `i18n/__tests__/locales.test.ts` — обязательные ключи и блоки про имена машин и путей
      xUSSR. Результат: `cd web && npx vitest run i18n` зелёный.
- [x] 6.4 `App.tsx`: убрать `xUSSR {datasetMeta.xussr}` из подвала;
      `components/TrainImage.tsx`: убрать выбор папки `xussr`.

## 7. Миграция сохранённого выбора

- [x] 7.1 `state/settingsStore.ts`: поднять `SETTINGS_VERSION` до 5 и дописать шаг
      `if (version < 5)`, переносящий `trainSet: 'xussr'` на `'vanilla'` и сбрасывающий
      `calc.trackType` на `RAIL`.
- [x] 7.2 Переписать `state/__tests__/settingsStore.test.ts:189` на новое поведение и
      добавить кейс, что сохранение v4 с `iron_horse` не трогается.
      Результат: `cd web && npx vitest run state` зелёный.

## 8. Остальные тесты

- [x] 8.1 Удалить `web/src/__tests__/visual/trainset.visual.test.ts` и блоки про xUSSR в
      `__tests__/dataset.test.ts`, `engine/__tests__/tracktypes.test.ts`,
      `engine/__tests__/purchase.test.ts`, `engine/__tests__/engine.test.ts`,
      `features/settings/__tests__/{newgrfSection,SavegameImportPanel}.test.tsx`.
- [x] 8.2 Перевести на оставшиеся ростеры тесты, где xUSSR был фикстурой:
      `components/__tests__/format.test.ts`, `features/consist/__tests__/sorting.test.ts`,
      `engine/__tests__/availability.test.ts` (`steeltown`-блок).
- [x] 8.3 Кейс `trainSet` в `engine/__tests__/settings-effect.test.ts` перевести с `xussr`
      на `iron_horse` против ванильной базы — правило «каждая настройка меняет расчёт»
      должно остаться выполненным.

## 9. Документация

- [x] 9.1 Убрать xUSSR из `README.md` и `README.ru.md` одним изменением (разделы охвата,
      источники, атрибуция) — структура и порядок пунктов в обоих файлах должны совпасть.
- [x] 9.2 Убрать раздел `### xUSSR` и остальные упоминания из `CLAUDE.md` и `CONTEXT.md`,
      сохранив описание оставшихся механизмов (типы путей, род тока, доступность машин).
- [x] 9.3 Дописать запись в `CHANGELOG.md` в `[Unreleased]` на английском с пометкой
      `**BREAKING**`.

## 10. Спеки и хвосты

- [x] 10.1 Удалить каталог `openspec/changes/xussr-dataset/`.
- [x] 10.2 Проверить `openspec validate remove-xussr --strict`.
- [x] 10.3 Снять worktree `../ottd-tools-xussr-firs5`, удалить ветку `xussr-firs5-data`
      и клон `vendor/xussrset`.

## 11. Проверка

- [x] 11.1 Прогнать `make test` целиком (unittest пайплайна + vitest) и `make build`.
- [x] 11.2 Прогнать `make check-visual` — визуальный набор потерял один файл, остальные
      должны остаться зелёными.

## 12. Правки по code review

- [x] 12.1 `savegame/snapshotStore.ts`: отбрасывать при чтении запись, чей `trainSet` не
      значится в `TRAIN_SETS` (партия на удалённом наборе роняла вкладку «Партия»), + тест
      в `snapshotStore.test.ts`, проверенный на снятой проверке.
- [x] 12.2 Вернуть визуальную проверку пути спрайтов другого ростера
      (`__tests__/visual/trainset.visual.test.ts`, теперь на ванили) и ассерт
      `neverExpireVehicles` в `savegame/__tests__/extract.test.ts` на фикстуре
      `londworth-1860`.
- [x] 12.3 Убрать тавтологичный `describe('vehicle names')` из `i18n/__tests__/locales.test.ts`
      — правило проверяет `components/__tests__/format.test.ts`.
- [x] 12.4 Мелочи: английский комментарий в миграции v5, `id` из типов подписей в
      `components/format.ts`, устаревшее обоснование в `savegame/registry.ts`, подрезать
      докблоки `trainCapacity` и `matchesTrainName`, перенос строки в `CLAUDE.md`.
- [x] 12.5 Спеки: delta `localisation` (словарь путей один на все наборы), delta
      «Хранение снапшота» в `savegame-snapshot`, объяснение переиздания требования и
      сверхобъёмных правок в `proposal.md`.

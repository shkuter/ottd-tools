## 1. Данные: внутренняя скорость машин

- [x] 1.1 В `pipeline/extract_iron_horse.py` добавить хелпер, повторяющий запись свойства 0x09
      в NML (`n = round(mph * 1.6)`, затем подгонка на ±1, пока `(10 * n) // 16 == mph`),
      и писать в машину `speed_internal` и `speed_lgv_internal` (`None`, если скорости нет).
      Проверка: `pipeline/.venv/bin/python pipeline/extract_iron_horse.py` (так его зовёт
      `make data`; через `-m` не запускается — экстрактор импортирует `common` как top-level)
      отрабатывает, и у машины со 112 mph в `web/src/data/trains.json` появилось 180.
- [x] 1.2 Эталоны в `pipeline/tests/test_known_values.py`: внутренняя скорость для быстрой машины
      (112 mph → 180) и для медленной (45 mph → 72), плюс инвариант `(10 * internal) // 16 == mph`
      для всех машин. Проверка: `pipeline/.venv/bin/python -m unittest pipeline.tests.test_known_values`.
- [x] 1.3 Прогнать `make data` и убедиться, что `git diff web/src/data/trains.json` содержит
      только новые поля скорости, а остальные значения не поехали.

## 2. Веб: типы и конверсия

- [x] 2.1 Пробросить внутреннюю скорость в веб-слой: поле в `web/src/types.ts` и маппинг в
      `web/src/vanilla.ts` (в ванильных JSON `speed_internal` уже есть). Проверка: `tsc` в
      `make build` проходит, `web/src/__tests__/vanilla.test.ts` зелёный.
- [x] 2.2 В `web/src/engine/units.ts` добавить `internalToKmh()` по формуле игры
      (`Math.floor(Math.trunc(internal * 10 * 1.609344) / 16)`) с ссылкой на `strings.cpp`.
- [x] 2.3 Тесты конверсии в `web/src/engine/__tests__/engine.test.ts`: 180 → 181 км/ч,
      64 → 64 км/ч (Kirby Paul Tank), 144 → 90 миль/ч. Проверка:
      `cd web && npx vitest run -t "units"`.

## 3. Настройка

- [x] 3.1 В `web/src/state/settingsStore.ts` добавить `speedUnit: 'imperial' | 'metric'` рядом с
      `currency`, значение по умолчанию `'metric'`, сеттер и сброс в `reset()`. Версию persist не
      менять. Проверка: `web/src/state/__tests__/settingsStore.test.ts` и `reset.test.ts`
      дополнены и зелёные (сохранённые настройки без поля получают значение по умолчанию).
- [x] 3.2 Строки интерфейса в `web/src/i18n/en.json` и `ru.json`: единица «км/ч» / «km/h»,
      название настройки, подсказка и подписи двух вариантов — тексты взять из
      `vendor/openttd/src/lang/russian.txt` и `english.txt`. Проверка:
      `cd web && npx vitest run i18n`.
- [x] 3.3 Переключатель в `web/src/features/settings/SettingsPage.tsx` — `Select` в блоке
      `settings.display` сразу после валюты. Проверка: в `make dev` настройка видна, выбор
      сохраняется после перезагрузки страницы.

## 4. Вывод скорости

- [x] 4.1 В `web/src/components/format.ts` добавить `speed(internal)`: выбирает конверсию по
      `speedUnit` и подставляет единицу через `t()`; строка собирается в момент вызова.
      Проверка: новый `web/src/components/__tests__/format.test.ts` (у `components/` тестов пока
      нет) — при `speedUnit: 'metric'` 180 даёт «181 км/ч», при `'imperial'` — «112 mph».
- [x] 4.2 В `web/src/engine/consist.ts` заменить `speedLimitMph` / `balancingSpeedMph` /
      `balancingSpeedOnGradeMph` на поля во внутренних единицах; предел скорости считать как
      минимум `speed_internal` по составу, вход физики (`maxSpeedInternal`) оставить прежним и
      пометить комментарием, что это осознанно (числа расчёта не меняются).
- [x] 4.3 В `web/src/engine/optimize.ts` заменить `loadedSpeedMph` / `emptySpeedMph` /
      `gradeSpeedMph` на внутренние единицы и поправить чтение полей в
      `web/src/engine/__tests__/settings-effect.test.ts` и `engine.test.ts`. Проверка:
      `cd web && npx vitest run engine`.
- [x] 4.4 Перевести на `speed()` все места вывода: колонка «Скорость» и три показателя состава в
      `features/consist/ConsistPage.tsx`, два столбца в `features/optimizer/OptimizerPage.tsx`,
      два места в `features/route/RoutePage.tsx`. Сортировку каталога по скорости оставить по
      числу (порядок не должен меняться от единицы).

## 5. Проверки и завершение

- [x] 5.1 Отдельный тест на требование «единица не влияет на расчёт»: переключение `speedUnit`
      не меняет доход рейса, время рейса и порядок выдачи оптимизатора. В
      `web/src/engine/__tests__/settings-effect.test.ts` кейса для этой настройки НЕ заводить —
      она живёт вне `GameSettings`/`CalcSettings`; там правится только чтение переименованных
      полей скорости (задача 4.3).
- [x] 5.2 Проверить в браузере (`make dev`) обе системы единиц на трёх вкладках, где выводится
      скорость (Consist builder, Best train, Route income): числа
      совпадают с игрой на контрольной машине (112 миль/ч ↔ 181 км/ч), единицы нигде не смешаны.
- [x] 5.3 Запись в `CHANGELOG.md` в секцию `[Unreleased]` (на английском): новая настройка и
      смена значения по умолчанию на км/ч.
- [x] 5.4 Финальный прогон: `make data` (данные менялись) и `make test`, затем `make verify`.

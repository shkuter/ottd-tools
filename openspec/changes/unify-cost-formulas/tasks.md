## 1. Подготовка

- [x] 1.1 Снять снимок текущих чисел: покупка и содержание для нескольких машин Iron Horse
      (движок, вагон, паровая, дизельная) и для составов, при дефолтных настройках и при
      изменённых (сложность, Base Costs GRF, инфляция, длина дня) — сохранить как временный
      файл в scratchpad для сверки после рефакторинга

## 2. Единая реализация

- [x] 2.1 Добавить в `web/src/engine/costs.ts` функции `trainBuyCost(train, meta, game, calc)`,
      `trainRunningCostPerYear(train, meta, game, calc)` и `consistMoney(entries, meta, game, calc)`
      с выбором basecost-шифтов внутри и множителем длины дня в содержании
- [x] 2.2 Перевести `consistStats()` в `web/src/engine/consist.ts` на `consistMoney()`
- [x] 2.3 Удалить `moneyFor()` в `web/src/engine/optimize.ts`, заменив вызовы на `consistMoney()`
- [x] 2.4 Удалить `trainBuyCost`/`trainRunningCost` из
      `web/src/features/consist/ConsistPage.tsx`, перевести колонки каталога на функции движка

## 3. Проверка

- [x] 3.1 Добавить в `web/src/engine/__tests__/engine.test.ts` кейсы на новые функции: выбор
      шифта по типу машины и по running-классу, множитель длины дня в содержании, равенство
      «деньги состава = сумма денег машин × количество»
- [x] 3.2 Сверить снимок из 1.1 с числами после правки — расхождений быть не должно
- [x] 3.3 `make test`, `npx tsc --noEmit`, `npx oxlint` — без новых замечаний
- [x] 3.4 Дописать пункт в `## [Unreleased]` раздел `Changed` файла `CHANGELOG.md` (по-английски)

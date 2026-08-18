## Why

Формула «сколько стоит купить и содержать машину» написана в проекте трижды — в
`engine/consist.ts`, `engine/optimize.ts` и прямо в компоненте `features/consist/ConsistPage.tsx`.
Копии сейчас совпадают посимвольно, но любая правка (новый множитель, другой шифт, иная
трактовка day length) обязана быть внесена в три места, иначе вкладки начнут показывать разные
деньги за один и тот же поезд. Это же блокирует следующий этап работы — сверку формул с
исходниками игры: проверять придётся три реализации вместо одной.

Заодно поведение ценообразования нигде не описано: `openspec/specs/` пуст, поэтому «правильность»
не с чем сверять.

## What Changes

- Единственная реализация денег в `engine/costs.ts`: `trainBuyCost()` и `trainRunningCostPerYear()`
  для одной машины и `consistMoney()` для набора машин — принимают `Train`/`ConsistEntry[]`,
  `TrainsMeta`, `GameSettings`, `CalcSettings` и сами выбирают basecost-шифты и множители.
- `consistStats()` (`engine/consist.ts`) и `moneyFor()` (`engine/optimize.ts`) переходят на общую
  функцию; локальный `moneyFor` удаляется.
- `ConsistPage.tsx` перестаёт считать деньги сам и удаляет локальные `trainBuyCost` /
  `trainRunningCost` — компонент только отображает.
- Поведение расчёта фиксируется спекой `pricing`, включая места, которые ещё предстоит сверить
  с игрой (пометка про running cost и day length).
- Числа не меняются: тот же ввод даёт тот же результат, что и до change (проверяется тестами).

## Capabilities

### New Capabilities
- `pricing`: расчёт стоимости покупки и годового содержания машин и составов — базовые цены
  OpenTTD, cost factor, basecost-шифты NewGRF, множители сложности, Base Costs GRF, инфляция
  и множитель длины дня JGRPP.

### Modified Capabilities
<!-- Нет: спеков в проекте ещё нет, поведение не меняется. -->

## Impact

- Код: `web/src/engine/costs.ts` (новые функции), `web/src/engine/consist.ts`,
  `web/src/engine/optimize.ts`, `web/src/features/consist/ConsistPage.tsx`.
- Тесты: `web/src/engine/__tests__/engine.test.ts` — добавляются кейсы на новые функции;
  `settings-effect.test.ts` остаётся страховкой «каждая настройка меняет расчёт».
- Пользователь изменений не видит: числа, UI и localStorage не затрагиваются (patch по semver).

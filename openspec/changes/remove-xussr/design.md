## Что удаляется, а что остаётся

Граница проходит по данным: механизм остаётся, если хотя бы один из двух оставшихся
ростеров даёт ему пищу, и уходит, если после удаления `xussr_trains.json` его некому
кормить. По этому правилу:

| Механизм | Данные у ванили / Iron Horse | Решение |
|---|---|---|
| `power_by_source`, `POWER_SOURCE_ORDER`, `EXTERNAL_SOURCES` | есть у обоих | остаётся |
| `powered` / `compatible`, нормализация масок | есть у обоих | остаётся |
| `hidden` и фолбэк выбора пути | `LGVN` Iron Horse | остаётся |
| `lgv`, `lgv_capable`, LGV-скорость | Iron Horse | остаётся |
| `speed_limit_internal`, `trackSpeedLimit`, `topSpeedOn` | поле пишут оба экстрактора, значения нулевые | остаётся: спек `track-types` требует применять лимит и вмещать наборы с лимитами без правки кода |
| `power_source` у пути (`OHLE`, `METRO`) | есть у обоих | остаётся |
| роды тока `AC25` / `AC15` / `DC3` / `DC1_5`, заглушка `SELF` | ни у кого | удаляется |
| `speed_by_source` + `speedForSystem()` | ни у кого | удаляется |
| `capacity_by_cargo` + ветка `trainCapacity()`, `xussrCarries()` | ни у кого | удаляется |
| running-класс `roadveh`, `BASE_PRICES.running_roadveh` | ни у кого; спек `pricing` знает три класса | удаляется |
| `Train.grf`, `multiFileIds`, `grfidFromHex()`, `XUSSR_GRFIDS` | ни у кого | удаляется |
| `KnownGrf.trainSet` | нужен Iron Horse | остаётся |

`hasNothingToCarry()` в `dataset.ts` остаётся: правило «машина без груза не показывается»
описано в `vehicle-availability` и относится ко всем наборам. Уходит только его xUSSR-ветка
(`capacity_by_cargo` и `xussrCarries`).

`engineMatcher()` в `savegame/snapshot.ts` теряет последнюю ветку: `multiFileIds` без xUSSR —
пустая карта, поэтому машина неизвестного GRF возвращает `null` напрямую. Ветки базового
набора и Iron Horse не трогаются, требование `savegame-snapshot` продолжает выполняться.

## Затрагиваемые модули engine/ и настройки

- `engine/settings.ts` — `TRAIN_SETS` теряет элемент, и тип `TrainSet` сужается сам:
  это единственное объявление, поэтому `SETS` в `dataset.ts` перестанет компилироваться,
  пока в нём остаётся ключ `xussr` — компилятор и есть тут страховка. Оттуда же уходит
  `RunningClass` `'roadveh'` и его ветка в `basecostRunningFactor()`.
- `engine/costs.ts` — `BASE_PRICES.running_roadveh` и ветка `ROADVEH` в `runningClassOf()`.
- `engine/purchase.ts` — ветка `capacity_by_cargo` в `purchaseKey()`; ключ снова строится
  по `capacities[capacityIndex]`.
- `engine/tracktypes.ts` — из `POWER_SOURCES` уходят четыре рода тока и `SELF`, из
  `vehicleSpeedOn()` — вызов `speedForSystem()`, сама функция удаляется, из `onTheTrack()` —
  сравнение с `values.SELF`.
- `GameSettings.trainSet` остаётся настройкой, меняющей расчёт: ростеров два, и переключатель
  по-прежнему меняет каталог, цены и таблицу путей. Кейс в `settings-effect.test.ts`
  переводится с `xussr` на `iron_horse` против ванильной базы.

## Миграция сохранённого выбора

`SETTINGS_VERSION` поднимается с 4 до 5, шаг `if (version < 5)` дописывается лесенкой к
существующим (ранний выход уже поднят до текущей версии — правило соблюдено). Шаг переносит
`game.trainSet === 'xussr'` на `'vanilla'` и вместе с ним сбрасывает `calc.trackType` на
ванильный `RAIL`: пути xUSSR (`ER2D`, `ER3a`…) в ванильной таблице нет, и хотя
`activeRailtype()` умеет откатываться на первый выбираемый путь набора, оставлять в persist
лейбл несуществующего пути незачем — следующая же запись сохранила бы его снова.

Одним `settingsStore` дело не кончается: снапшот импортированной партии живёт в IndexedDB и
несёт **свою** копию настроек (`SnapshotSettings.game.trainSet`), которую вкладка «Партия»
разрешает через `activeTrains()`. Запись партии на xUSSR пережила бы обновление и уронила бы
вкладку (`Cannot read properties of undefined`). Версию схемы за это бампать нельзя — она
сбросила бы и здоровые записи ванили и Iron Horse; поэтому `loadSnapshot()` отбрасывает
запись, чей ростер не значится в `TRAIN_SETS`, тем же путём, что запись устаревшей схемы
(`droppedOutdated`, готовое сообщение «загрузите сейв заново»). Ростер читается там как
строка: его тип больше не знает значения, которое запись может нести.

Тест `state/__tests__/settingsStore.test.ts:189` («сохранение v4 не трогается: выбранный
xUSSR остаётся выбранным») переписывается на противоположное утверждение: сохранение v4 с
`xussr` приходит на ваниль, а сохранение v4 с `iron_horse` остаётся нетронутым.

## Тесты, которые брали xUSSR как образец

Удаляются вместе с набором только те, что проверяли его самого
(`test_xussr_extraction.py`, `test_xussr_sources.py`, `visual/trainset.visual.test.ts`,
блоки `describe` про род тока и про имена машин). Там, где xUSSR был лишь удобной фикстурой,
проверка остаётся, а фикстура меняется:

- `components/__tests__/format.test.ts` — образцы берутся из `trains` (Iron Horse).
- `features/consist/__tests__/sorting.test.ts` — сортировка по вместимости проверяется на
  ванили или Iron Horse.
- `savegame/__tests__/snapshot.test.ts` — `describe('что партия продаёт')` переезжает на
  `londworth-1975.sav`; блок про монолитный `xussr.grf` уходит целиком вместе с фикстурой
  `xussr-1872.sav`.
- `engine/__tests__/availability.test.ts` — `steeltown`-блок про танкеры без груза
  переводится на Iron Horse: правило про машину без груза общее, а иллюстрация была
  xUSSR-ская.

## Пайплайн

Экстракторы ванили и Iron Horse не трогаются по существу — только комментарии-отсылки к
xUSSR. `pipeline/validate.py` теряет блок `--- xussr ---`, третий источник в цикле проверок
и ключ `xussr` в `meta.json`; `KNOWN_POWER_SOURCES` остаётся общей проверкой для двух
наборов, из неё уходят четыре рода тока и `SELF`. `display_mph()` остаётся в `common.py` —
переезд туда был правильным независимо от того, кто второй потребитель.

## Context

Мотивация и объём — proposal.md, требования — дельта-спеки, факты с номерами строк —
`.scratch/ui-flow-safety/research.md`. Коротко о том, что определяет способ:

- Состав заменяют два пути: «→» (`OptimizerPage.tsx` `applyToConsist`, пишет consist и route,
  уходит на `/income`) и мост маршрута партии (`applyBridge.ts` `applyIncomeBridge`, вызов из
  `RoutesTab.tsx`). Кнопка очистки конструктора зовёт `consistStore.clear()` и показывает
  уведомление без отмены. Мост графа FIRS меняет только груз.
- Груз хранится дважды: `consistStore.cargoLabel` (`string | null`, влияет на вместимость панели) и
  `routeStore.cargoLabel` (`string`, по нему считаются доход и прибыльность, в том числе вкладкой
  Network через `useRouteParams`). У обоих сторов persist без `version`/`migrate`. Перенос между
  сторами в этом репозитории — только через `state/upgrade.ts` (сырые ключи localStorage до
  гидратации, ступени по `UPGRADE_VERSION`, модуль `upgradeOnLoad` импортируется первым).
- `<Notifications />` смонтирован снаружи `BrowserRouter`: содержимое уведомления не может звать
  `useNavigate`, но может звать колбэк, замкнутый на страницу. Уведомлений с кнопкой в коде нет.
- «Reset everything»: `SettingsPage.resetAll` → `resetPersistedState()` → `location.reload()`.
  `.btn-danger` лежит в `skin.css`, в том же `@layer app`, что и `skin-mantine.css`, но подключён
  раньше, поэтому `.mantine-Button-root` той же специфичности его перебивает.
- Окно в стиле игры уже есть у импорта (`SavegameImportLauncher` + `.window-actions`).
- Ложное Base Costs: `features/savegame/game.ts` `differingSettings` сравнивает множители Base Costs
  поле за полем, хотя при выключенном `basecostGrf` `engine/settings.ts` их не читает.
- `engine/` не меняется. `GameSettings`/`CalcSettings` не меняются: груз — поле `routeStore`, не
  настройка.

## Goals / Non-Goals

**Goals:**
- Одна точка «заменить состав с отменой», которую зовут все три пути, — чтобы четвёртый путь
  нельзя было добавить без отмены.
- Один источник груза без изменения чисел Route income и без потери сохранённого выбора.
- Каждое требование — с проверкой: юнит-тест (Testing Library/стор) или визуальная.

**Non-Goals:**
- История отмен глубже одного шага; отмена сброса всего.
- Снапшот с неразобранными параметрами Base Costs (non-goal proposal).

## Decisions

### D1. Отмена замены — модуль `state/consistReplacement.ts` + уведомление в `features/consist`

- `captureConsistAndRoute()` снимает то, что замена может переписать: consist `entries`; route
  `cargoLabel`, `distanceTiles`, `amount`, `manualDays`, `productionPerMonth`, `waitForFullLoad`,
  `prefillOrigin`. `restoreConsistAndRoute(snapshot)` пишет это обратно одним вызовом на стор.
- Поля рейса — один список ключей (`TRIP_FIELDS`), из него и тип снимка (`Pick<RouteState, …>`),
  и сам снимок: поле, добавленное в список, отмена вернёт, а забытое видно в одном месте.
- `replaceConsist(write: () => void)` (там же, без UI): снимает снимок, выполняет `write`, и если
  прежний состав был непустым, возвращает снимок, иначе `null`. «Непустой» — по машинам активного
  набора (`activeEntries`): записи выключенного набора в конструкторе не видны, и предлагать их
  «вернуть» значило бы восстанавливать состав, которого пользователь не видел.
- `notifyConsistReplaced(snapshot)` (`components/consistReplacedNotice.tsx`): сначала
  скрывает прежнее уведомление замены (`notifications.hide` по его `id`), затем показывает новое
  со своим `id` на каждую замену. Вытеснять надо явно: в Mantine 9 `notifications.show` с `id`,
  который уже показан, молча ничего не делает (`notifications.store.mjs`, `showNotification`), и
  без этого кнопка первого уведомления после второй замены стёрла бы её. `autoClose: 10_000`, в
  `message` — текст и кнопка «Вернуть прежний состав», которая зовёт
  `restoreConsistAndRoute(snapshot)` и скрывает своё уведомление.
  Навигации в кнопке нет: отмена не меняет вкладку (спека), так что внешний к роутеру
  `<Notifications/>` не мешает.
- Замена по пустому конструктору уведомления не показывает, но висящее от прежней замены
  уведомление убирает: иначе его кнопка вернула бы состав, бывший до обеих замен, и стёрла бы
  только что перенесённый (сценарий «Отмена устарела» — «пользователь сделал вторую замену»,
  какой бы та ни была).
- `replaceConsistWithUndo(write, message)` (там же): запись и уведомление одним вызовом. Все три
  пути — `applyToConsist` (оптимизатор), обработчик моста в `RoutesTab`, кнопка очистки
  `ConsistPage` (заменяет прежнее уведомление `notify.consistCleared`) — зовут только его, так
  что четвёртый путь не может заменить состав и забыть про отмену.

*Почему так:* снимок/восстановление — чистая логика сторов, её тестирует стор-тест без DOM; UI
только показывает. Логика — в `state/` рядом со сторами, как `upgrade.ts`; уведомление — в
`components/`, потому что его зовут три фичи (оптимизатор, конструктор, партия), и держать его
внутри одной из них значило бы связать фичи между собой.

*Отвергнуто:* хранить «предыдущий состав» в самом `consistStore` — это persist-поле, которое
переживёт перезагрузку и сделает отмену многошаговой и неявной; модальное подтверждение до
замены — решение владельца: сразу менять и давать вернуть.

### D2. Общий груз — `routeStore.cargoLabel`, поле `consistStore.cargoLabel` уходит

- Панель состава читает и пишет `routeStore.cargoLabel` через `useActiveCargo` (тот же
  хелпер, что у вкладки дохода: груз вне набора заменяется первым и пишется обратно). Логика
  `ConsistPage.tsx:91-95` «сбросить в null» уходит: груз всегда задан. Вместе с ней уходит
  пустой выбор панели (`placeholder consist.none`, `value={cargoLabel ?? null}`): селект
  получает `allowDeselect={false}`, ключ `consist.none` удаляется из обоих словарей, если
  больше нигде не используется. Спека `cargo-sets` («Груз выпал там, где он необязателен»)
  меняется: правило «выбор снимается» остаётся за фильтром каталога, панель состава переходит
  на «подменяется первым». Колонки «на клетку» от груза панели не зависят (`filterCargo`).
- Мосты и «→» пишут груз один раз, в `routeStore`.
- `consistStore`: из состояния, `partialize` и действий уходят `cargoLabel`/`setCargoLabel`;
  лишний ключ в уже сохранённом JSON `merge` игнорирует.

*Почему `routeStore`:* по нему считаются доход, прибыльность и Network — числа не меняются
(proposal, semver minor). Отвергнуто — `consistStore`: пришлось бы переучивать `useRouteParams`
и Network, а у пользователя с сохранёнными обоими грузами поменялись бы числа дохода.

### D3. Перенос сохранённого груза — ступень 2 в `state/upgrade.ts`

`UPGRADE_VERSION = 2`, ветка `if (version < 2) carryConsistCargoIntoRoute()`: если в
`localStorage['ottd-tools-consist']` есть непустой `state.cargoLabel`, а у
`'ottd-tools-route'` нет `state.cargoLabel` (ключа нет или поля нет) — записать груз в
route-ключ, сохранив прочие поля route-ключа и формат persist (`{ state, version }`). Если груз
рейса есть — ничего не делать. Ключи — строками, как в ступени 1. Тест совпадения ключей в
`upgrade.test.ts` сейчас сверяет только optimizer, supply и settings — он расширяется ключами
consist (`useConsistStore.persist.getOptions().name`) и route (`ROUTE_KEY`).

Тест — по known-bug-pattern: через живой стор (`await import('../upgradeOnLoad'); const {
useRouteStore } = await import('../routeStore')`), на состоянии, сохранённом версией 1, и на
чистом профиле.

### D4. Подтверждение сброса — `ResetEverythingButton` с окном игры

- Кнопка на вкладке настроек открывает `Modal` с тем же оформлением, что окно импорта
  (заголовок-полоса, `.window-actions` снизу). В теле — список стираемого: настройки игры и
  расчёта; состав и рейс; импортированная партия — только если снапшот есть. Читать подпиской
  `useSyncExternalStore(subscribeSnapshot, getSnapshotState)`, как `SavegameImportPanel`: при
  старте состояние ещё `loading`, и разовое чтение сказало бы «партии нет».
- В `.window-actions`: «Отмена» (обычная) и «Сбросить всё» (`.btn-danger`), по которой —
  прежний `resetAll`.
- `.btn-danger` переносится из `skin.css` в `skin-mantine.css` после блока BUTTONS, с
  селектором `.mantine-Button-root.btn-danger` и его `:hover`/`:active`: цвет — существующий
  токен убытка (`--skin-loss`), новых цветов нет.

*Отвергнуто:* двойной щелчок «нажмите ещё раз» — не игра и не очевидно; `window.confirm` — вне
скина.

### D5. Переходы и подписи

- i18n: `opt.apply` → «Open in Route income» / «Открыть в «Доходе рейса»»; `game.toIncome` →
  «Calculate in Route income» / «Посчитать в «Доходе рейса»»; `combined.needConsist` → текст
  без названия вкладки плюс отдельная ссылка; en-строки `firs.bridge.toSupply`,
  `firs.chain.noteSupplied`, `firs.chain.bridge` — «Industry supply tab»;
  `firs.chain.noteNoGame` en/ru — «the imported game's tab» / «вкладке импортированной партии».
  Кнопки переноса с других вкладок — тоже действием с названием вкладки: `firs.bridge.toIncome`
  → «Open in Route income with this cargo» / «Открыть в «Доходе рейса» с этим грузом»,
  `game.toOptimizerCargo` → «Find a train for this cargo in Best train» / «Подобрать поезд под
  этот груз в «Лучшем поезде»»; ru `settings.firsHint` — «вкладка «Цепочки FIRS» скрыта».
  Русские формулировки — по образцу существующих строк.
- `ConsistPage`: под `summary-table` при непустом составе — `NavLink to="/income"` «Calculate
  route income →» / «Посчитать доход рейса →», голым `NavLink`, как соседние ссылки между
  вкладками (`RoutePage`, `NetworkPage`).
- Строки, описательно называвшие вкладки («the route income tab», «the network tab», «на
  вкладке дохода рейса», «на вкладке сети»), называют их как в меню: «the Route income tab»,
  «на вкладке «Доход рейса»» и т. д.
- `RoutePage`: пустое состояние прибыльности при пустом составе — сообщение и `NavLink` на
  `/consist` с названием вкладки; при непустом составе и пустом наборе грузов — свой текст
  `combined.noCargo` без ссылки: «сначала соберите состав» там было бы неправдой. У
  `TableFrame` проп `emptyMessage` сейчас строка в `<p>`: он расширяется до `ReactNode`, чтобы
  ссылка стояла внутри той же рамки пустого состояния (спека: «в той же рамке»).
- Тест подписей — юнит: en-словарь не содержит «Consist tab», «Supply tab», «Game tab»,
  «Open in Profitability», «route income tab», «network tab»; ru — «вкладке дохода рейса»,
  «вкладке сети».

### D6. «Открыть партию» в сводке импорта

`SavegameImportResult` в фазе `saved` получает кнопку «Open game» / «Открыть партию»:
`navigate('/game')`, затем `onClose`/`reset()`. Обе кнопки фазы `saved` — «Закрыть» (сейчас стоит
голой, `SavegameImportResult.tsx:57-64`) и «Открыть партию» — встают в `.window-actions`, как у
фазы различий. На экране настроек (`SavegameImportPanel`) — та же кнопка: роутер доступен и там;
`SavegameImportPanel.test.tsx` рендерит панель без роутера и оборачивается в `MemoryRouter`.

### D7. Base Costs в `differingSettings`

В `features/savegame/game.ts` поля множителей Base Costs (`basecostLocomotive`, `basecostWagon`,
ходовые, инфраструктура, строительство путей — список полей по `engine/settings.ts`)
пропускаются, если `basecostGrf` false и в снапшоте, и в текущих настройках — по образцу
`NOT_USED_BY_THE_FORECAST`. Тест: снапшот `basecostGrf:false` ×1, текущие `basecostGrf:false`
×2 → не названы; текущие `basecostGrf:true` ×2 → названы.

### D8. Тесты, которые ломаются ожидаемо

- `features/settings/__tests__/reset.test.tsx` — теперь два шага (открыть окно, подтвердить);
  плюс кейс отказа.
- Тесты, читающие `consistStore.cargoLabel` (`consistStore.test.ts`, `applyBridge.test.ts`) —
  на `routeStore.cargoLabel`.

## Risks / Trade-offs

- [Колбэк отмены держит снимок, а пользователь успел изменить состав руками после замены] →
  отмена всё равно возвращает снимок до замены: так понимается «прежний состав». Уведомление
  живёт ~10 с, окно для такой гонки мало.
- [Груз вне набора на панели состава теперь заменяется первым грузом, а не сбрасывается в
  «не выбран»] → принято: у рейса груз всегда задан, и так было и раньше на вкладке дохода.
- [Ступень апгрейда 2 выполнится у всех, кто открывал приложение] → ступень идемпотентна и
  ничего не делает, когда груз рейса уже есть.
- [Уведомление с кнопкой — первый такой вид в скине] → визуальная проверка цвета и формы кнопки
  внутри уведомления.

## Migration Plan

Ступень 2 апгрейда localStorage (D3), других миграций нет. Откат — revert коммита; поле груза
конструктора в сохранённом JSON остаётся нетронутым, старая версия его прочитает.

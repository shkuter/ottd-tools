# Context

Domain glossary for this repo. Terms are the ones the code, the specs and the UI use; the
Russian column is what the interface says, so chat and planning documents can stay consistent
with what the user sees on screen.

Game-domain terms (consist, wagon, refit, basecost shift, transit period) follow OpenTTD /
Iron Horse / FIRS usage — those sources are the authority, not our paraphrases.

## Route economics

**Flow** (_поток_) — the industry output offered to the station, in cargo units per economy
year: `productionPerMonth × 12`. It is the full output, before the station rating takes its
cut. `0` means "not stated": the optimizer then assumes the train is always filled and skips
everything below.

**Delivered share** (_доля вывоза_) — the fraction of the flow the game actually hands to the
station, `(station rating + 1) / 256` (`MoveGoodsToStation` + `UpdateStationWaiting`). Computed
by `engine/rating.ts` from the pickup interval and the **backlog**; it is the percentage the game
shows as "transported". It cuts the **flow**, before the fleet shares it — not the income
afterwards (ADR-0001). While a backlog stands, the share is read off the balance instead —
what one visit carries off, over what the interval would bring in at full rating — and the
rating follows from it: the parts of a rating move in steps, and a station that never empties
swings across a step rather than sitting on it.

**Balance share** (_равновесная доля_) — the share a station settles at: the point where the
share it hands over stops outrunning itself, and, when the fleet cannot keep up, no more than
what one visit carries off. Every **delivered share** the estimate reports is one of these. Read
off the balance rather than off the penalty step below it, because a step is 1/256 of the output:
pinning the share to one would have a larger industry hauled less by the same fleet, and would
leave the share a backlog is decided by different from the share shown.

**Rating swing** (`parts.swing`) — a different quantity: how far the rating implied by the
balance share sits from what the parts of a rating add up to. The parts move in steps and a
station balances between two of them, so this is normally non-zero — on a station that empties
as much as on one that does not. Listed in the UI beside the parts so they still come to the
total shown.

**Backlog** (_остаток_) — cargo standing on the platform at every visit because the fleet never
gets round to it. `0` for a fleet that clears the flow; otherwise the pile the station settles
at, where what arrives between visits has fallen to what one visit carries off — or where the
game stops counting it (`MAX_BACKLOG`, past which the waiting-cargo penalty is at its floor).
The rating estimate solves for it, so it is an output of `engine/rating.ts`, not an input.

**Offered per year** (_отдаваемое_) — what the station actually receives, `flow × delivered
share`. This is the amount the fleet divides between its trains and earns on.

**Hauled per year** (_вывоз за год_) — cargo actually moved over a year: what the station
offers, or what the fleet can physically carry, whichever is smaller
(`min(offered, fleet × tripsPerYear × capacity)`). This is what the "transported" goal ranks
by, and what the optimizer shows in absolute units ("Вывоз/год") next to the share
("Доля вывоза").

**Fleet** (_парк_) — the identical consists running one route; the optimizer column of that
name. Every money figure in an optimizer row (buy cost, running cost, yearly profit) is stated
for the whole fleet, so rows with different fleet sizes compare directly. What the station
offers is shared by the fleet, so a train beyond what the industry can fill adds cost without
adding cargo.

**Cargo per trip** (_груз за рейс_) — what one consist carries on one trip. It follows the
**loading branch**: with no full-load order, the capacity or the offered flow falling to one
train of the fleet, whichever is smaller; with one, always the capacity. Physics is computed on
a full load in both branches — a half-empty train is lighter and faster in game, but that
correction is a separate change.

**Loading branch** (_ветка загрузки_) — which of the two order modes a route is costed in.
"Runs with what accumulated" (_уезжает с накопленным_) is the plain route: the consist leaves on
arrival with whatever the station has. "Waits for a full load" (_ждёт полной загрузки_) is the
full-load order: the consist leaves only when it is full, so its round trip carries an
**accumulation wait**. The branch is a parameter of the calculation, never a setting — the
optimizer costs both and keeps the better one for the chosen goal, and the route income tab
lets the user pick.

**Engine day** (_движковый день_) — the day the trip and the accumulation are counted in:
`DAY_TICKS = 74` ticks, the unit `daysForDistance` produces. A JGRPP day length factor does not
change a trip in ticks, but it stretches the economy year, so a year holds
`daysPerEconomyYear × dayLengthFactor` of them (`engineDaysPerYear`). Not to be confused with
the **engine** of a consist: "engine" here is the clock, not the locomotive.

**Accumulation wait** (_ожидание накопления_) — the part of a round trip a consist spends
standing while the source builds the load up: `round trip = max(physical round trip, fleet ×
capacity ÷ accumulation rate)`, where the rate is what the station is **offered** per day, i.e.
after the delivered share. A closed form rather than an iteration, and it assumes the flow
splits evenly between the trains of the fleet: real consists bunch up and wait unevenly, so this
is the average. Each branch reads its own **delivered share**: a consist that waits visits the
station less often, so its rating is lower and the industry hands it less — which is how a
full-load order can cost a route its output rather than merely re-spacing the same deliveries.
The interval feeds the rating, the rating the flow, the flow the wait, and the wait the
interval; the loop is walked until the rating stops moving, which it always does, because
waiting can only lower it.

**Pickup interval** (_интервал_) — days between visits to the station, `roundTripDays / fleet`.
Shorter interval → higher station rating → larger delivered share. The same figure is the gap
between arrivals at the far end, so it feeds two unrelated mechanics at once: the station rating
at the source and the **supply window** at the destination. One number, deliberately not two —
splitting it would invite the two sides to drift apart.

**Trains needed** (`trainsNeeded`) — the smallest fleet that clears the **full** output by
capacity. It only bounds the search: the fleet a row really needs is usually smaller, because
the station forwards part of the output. Both goals sweep the fleet from one train up — the
"profit" goal stops at the smallest fleet that moves everything offered, the "transported" goal
goes to the user's limit.

**Fleet limited** (`fleetLimited`) — the fleet, not the station, is the binding constraint:
the route carries a **backlog**. Not measured against `trainsNeeded` — a fleet below it still
clears everything waiting when the share is low enough — and not by comparing flows either: a
station whose fleet lags settles at handing over exactly what that fleet carries off, so the two
flows meet and only the pile on the platform tells them apart.

## Search

**Goal** (_цель_) — what the optimizer ranks by: `profit` (yearly profit), `transported`
(hauled per year) or `supply` (how well the receiving industry ends up fed). Without a flow
there is no delivered share, so `transported` degrades to `profit` inside the engine, and
`supply` does the same without a flow or without a receiving industry — the UI only stops the
user from picking a dead option. `supply` ranks lexicographically: the conversion the industry
reaches first, profit among the rows that reach the same one, so it buys the cheapest way to a
result rather than the shortest interval for its own sake.

**Sort** (_сортировка_) — a view over the rows a tab lists, applied after that tab put them in
its own order. It reorders what is on screen and changes neither the set nor the numbers; a
third click on a header returns that order, whatever it is for the tab: the search order in the
optimizer, which the goal decided, the year in the catalogue. One mechanism, a default of its
own per tab.

## Catalogue

**Variant family** (_семейство вариантов_) — the models Iron Horse ships behind one entry of
the game's purchase list: Coil Carrier is covered / covered asymmetric / tarpaulin / uncovered
plus a randomised one. They share the name and every number the calculator reads, and differ
only in the sprite; the game hides them inside a variant group and shows the non-randomised
one as its head. A family is not a **purchase entry** by itself — two generations of "Coal
Wagon" are two entries, each with its own family.

**Purchase entry** (_пункт списка покупки_) — one line the player can actually pick out in the
game: kind, track type, name, capacity, length, introduction date and weight all equal. This is
the unit the vehicle catalogue lists, and the unit the optimizer's "doubtful" checkboxes switch
off. Its representative is the non-randomised member, ties settled by identifier, so the same
vehicle stands for the entry everywhere in the app.

**Calculation profile** (_расчётный профиль_) — the numbers a sweep actually reads (capacity,
weight, length, power, tractive effort, speed, costs, loading speed). Vehicles sharing it give
identical rows, so the optimizer searches one per profile. Deliberately blind to the name: it
groups harder than a **purchase entry** — that one is for lists a human reads, this one is for
the search.

## Sets

**Train set** (_набор машин_) — the roster a game runs: vanilla or Iron Horse. Exactly
one is active, because the catalogue, the **track type** table and the basecost shifts all come
from it — a vehicle of one set priced by another's shifts would be priced wrong. Unlike FIRS and
Base Costs, which the game loads independently and the calculator switches on and off, the
roster is a choice of one. _Avoid_: NewGRF (that is any set, not the roster); vehicle set.

## Track types

**Track type** (_тип путей_) — the kind of track a route is built with: a railtype in NewGRF
terms, a label carrying a speed limit and the set of vehicles it powers. The user picks one per
calculation — a single global choice shared by every computing tab — and it decides both which
vehicles are offered and how fast they go. A set may define a track the game keeps out of its
build menu, to hold vehicles compatible across gauges; such a track takes part in the relations
but is never offered as a choice. A track's introduction date is ignored: the year decides
which vehicles exist, not which track can be laid. _Avoid_: rail type, track kind; тип пути
(the UI says «Тип путей»).

**Track family** (`base_track_type`) — the coarse gauge family of a vehicle: RAIL, NG, METRO —
plus MONO and MAGLEV in vanilla. It is what Iron Horse states speeds and capacities by; several
**track types** share one family (RAIL covers plain, electrified and LGV track), so the family
alone cannot say what runs where.

**Powered** (_потянет сам_) — the relation "this vehicle pulls under its own power on this
**track type**". An engine is offered only for track it is powered on; a dual-power engine is
powered on several types, with a different power on each.

**Compatible** (_проедет_) — the weaker relation "this vehicle can physically travel on this
**track type**", towed if need be. Enough for wagons; an engine that is merely compatible
would move at zero power.

**Power source** (_род тока_) — what a **track type** feeds a vehicle with: overhead wires of a
given current (25 kV / 15 kV AC, 3 kV / 1.5 kV DC), third rail, or nothing — the vehicle then
runs on its own fuel. A track names the sources it carries, in the order its set checks them:
usually one, but a set may build a **multi-system line** — an AC + DC trunk is a track a
player lays like any other. A vehicle states a power per source it accepts, so a
dual-system engine makes different power under different wires, and on a multi-system line it
takes the first source it accepts. Generalises the old "OHLE where there is catenary" rule —
catenary stays a fact about wires, not about current.

## Network upkeep

**Network upkeep** (_обслуживание сети_) — what a company pays every year simply for owning
its track, signals and stations, whether or not anything runs on them. The game bills it
monthly, per category, and shows the year as twelve of those; the calculator does the same,
truncating the monthly figure exactly where the game truncates it. Turned off by default, as
in the game. _Avoid_: maintenance cost of a train (that is **running cost**), содержание
(the settings screen says «Обслуживание инфраструктуры», the game's own wording).

**Track piece** (_кусок пути_) — the unit upkeep is billed in, and not the same thing as a
tile: a tile carries one piece per track on it, squared where the tracks cross, four per tile
of tunnel or bridge, two for a level crossing, and a rail station tile carries one of its own
(`sl/company_sl.cpp` AfterLoadCompanyStats). Signals are counted by head, so a two-way signal
is two. A figure typed in tiles understates a double-track line twofold, which is why the
field names the unit. _Avoid_: клетка пути for this quantity; station tiles genuinely are
tiles.

**Company network** (_сеть компании_) — what one company of an imported game owns, counted
off the map of the save the way the game recounts it on load: track pieces per railtype,
signals, station tiles, road and tram pieces per type, canal tiles. A savegame stores no such
counters, so this is computed, not read. **Absent is not zero**: a map in a layout the import
does not know leaves the network unknown, and the bridge into the upkeep panel refuses rather
than carrying zeroes — a company with no network and a network nobody could look at are
different answers. _Avoid_: "infrastructure" for the counts alone; that word is the cost
category.

**Growth model** (_модель роста_) — how upkeep grows with the size of a network. Vanilla
raises the price of every piece as the network grows (`1 + IntSqrt(total)`); JGRPP's
**linear maintenance growth** replaces that with a flat per-category scale, so cost stays
proportional to what is owned. A game not on the patchpack has the setting nowhere, and
grows by the root whatever the calculator holds saved.

## Industry supply

**Supply window** (_окно поставок_) — the stretch FIRS looks back over when it decides whether
an input counts as delivered: 27 production cycles of 256 ticks each, 6912 ticks. A constant of
the newgrf — not an OpenTTD setting, not a parameter, not something the player can change. The
industry window words it as "every three minutes", which is the same span read on OpenTTD 14+
wallclock time. It is measured in **ticks**, so a longer JGRPP day makes it span fewer game
days, never more.

**Supplied** (_подан_) — an input whose last delivery falls inside the **supply window**. The
industry stores a per-cargo countdown, reset on every delivery and stepped down each production
cycle; "supplied" is that countdown still being above zero. Nothing here depends on how *much*
arrived — one unit inside the window counts the same as a full train.

**Conversion** (_конверсия_) — the share of its output an industry gets out of what it is fed:
`min(8, Σ input ratio over supplied inputs) / 8`. Every FIRS acceptance rule falls out of this
one sum — an industry the game describes as "any three of five" is five inputs of ratio 3 under
a ceiling of 8. Output is the delivered amount **times** conversion, so an input that missed
the window also shrinks the yield of the inputs that arrived on time.

**Supply ratio** (_отношение к окну_) — the **pickup interval** measured against the **supply
window**. At most 1 the receiving industry stays supplied; above 1 it drops out of the window
between arrivals. This is the fleet-side view of **supplied**.

**Marginal** (_впритык_) — a **supply ratio** above `MARGINAL_RATIO` (0.85) but at most 1: the
fleet holds the window on paper, but the model spaces it evenly while real consists bunch up,
so the verdict is not to be trusted at face value. The threshold marks the doubt rather than
measuring it, and wants checking in a game before it is quoted as fact.

**Trains for window** (`trainsForWindow`) — the smallest fleet whose **supply ratio** reaches 1,
i.e. that keeps the receiving industry supplied. Not to be confused with **trains needed**,
which is about clearing the source industry's output rather than feeding the destination.

**Supply pool** (_накопительный пул_) — the acceptance rule primaries and ports use instead of
**conversion**: units delivered across the **supply window** counted against two thresholds, an
improved level and a full one. Ports pool every cargo they accept into one count; primaries
count their one supply cargo.

**Input state** (_состояние входа_) — where one input of an industry stands on the supply tab:
held (**supplied**), **marginal**, missing the window, or *unset*. Unset is a state of its own,
not a zero: an input the player has not routed yet must never read as one that misses the
window, because a figure computed from a distance nobody gave is wrong where it is most
visible.

**Unserved** (_нечем возить_) — a routed input the buy menu of that year cannot haul at all: no
consist exists for the cargo on that route. Distinct from an unset input (nothing was asked) and
from one that merely needs more trains — the advice differs in each case.

**Incomplete** (_неполный итог_) — a **conversion** or **supply pool** figure computed while some
inputs are still unset. The number answers for part of the industry, so the tab says so instead
of presenting it as final.

**Bottleneck** (_узкое место_) — the input to fix first: the one whose input ratio still limits
the **conversion**. Two shapes, because the advice differs — a fleet that brings it inside the
window (quoted with the consist that fleet belongs to), or the fact that the input is
**unserved**. There is no bottleneck when the supplied inputs already reach the conversion
ceiling: fixing anything then buys no output.

## Cargo sets

**Economy** (_экономика_) — the FIRS variant a game runs: Temperate Basic, Arctic Basic, Tropic
Basic, Steeltown, In A Hot Country. It decides which cargos and industries exist at all — 62 of
them in Steeltown against 18 in Temperate Basic — and how an industry is named and what it
accepts. It does **not** change what a cargo pays: FIRS 5 states the same payment rate for a
cargo in every economy that has it. A game runs exactly one economy, so the calculator holds one
too, and everything it shows — the catalogue, the optimizer, route income, the chain graph —
speaks of that one economy.

**Active cargos** (_активные грузы_) — the cargos a calculation may use: the current
**economy**'s cargos with FIRS on, the vanilla set with it off. A cargo outside the active set
is not offered anywhere; it has no payment rate to compute with.

**Calculation year** (_год расчёта_) — the single year every tab computes in: it decides which
vehicles the buy menu offers and, with inflation on, which prices apply. Tabs offer a field for
it, but there is one value behind them all. The field it is stored in is still called
`priceYear`, from when it only decided prices — see ADR-0004; the name is the exception, not a
second concept.

## Savegame

**Snapshot** (_снапшот партии_) — the calculator's stored copy of one saved game: its trains,
routes, stations, towns, industries, train groups and companies. One snapshot exists at a time; the next import replaces
it. Carries a schema version so an outdated copy asks for the file again instead of misreading.

**Snapshot settings** (_настройки партии_, `SnapshotSettings`) — the settings the imported
game was played with, stored beside the **snapshot** and complete: what the savegame stated,
filled out with the calculator's defaults where it stated nothing, never with what the user
has configured. The **savegame tab** computes its forecasts from these, so a route's figures
describe the game the file came from and do not move when the calculator's own settings are
edited afterwards.
_Avoid_: snapshot of the settings (the snapshot is the network; these are its settings)

**Route** (_маршрут_) — a shared orders list together with the trains running it; a train with
a private orders list is a route of one train. The game has no route entity — this is the
calculator's reading of shared orders. Where its consists are identical, a route's trains are
the **fleet** of the optimizer.
_Avoid_: line, service

**Savegame tab** (_вкладка «Партия»_) — the tab presenting the **snapshot**, titled with the
savegame's file name. It states the game's own figures beside what the calculator computes for
the same thing — fact next to forecast, with no promise they match.

**Buy menu availability** (_доступность в списке покупки_, `engine/availability.ts`) — whether
a vehicle stands in the game's buy menu in the year being calculated. Three answers, because
the game rolls both the introduction date and the selling life out of the map's seed: on sale,
gone, or **uncertain** — the honest answer for the stretch of a vehicle's life where the map
decides. Not the same word as **offered per year**, which is cargo, not vehicles: the code says
`standsInBuyMenu` and `BuyMenuNote`.
_Avoid_: offered (taken by cargo), available (says nothing about the doubt)

**Series head** (_голова серии_, `variant_group`) — the vehicle whose age decides when the
whole variant series leaves the buy menu. The game ages a variant by its head rather than by
itself, walking up the chain while each link asks for it, so a series is withdrawn at once. A
head the player cannot buy is a menu-only placeholder the game marks introduced on the first
day of the game — which is why such a series ages with the game rather than with its own
dates. Vehicles carrying no head age by themselves.
_Avoid_: variant group (that is the buy-menu fold, which can exist without the ageing)

**Sold ids** (_что продаёт партия_, `Snapshot.soldIds`) — the catalogue ids an imported game
sells on the date of its save, read from the savegame's own per-engine answer. Beats the model
while the year and the roster being calculated are the game's own; `null` means the file said
nothing, which is not the same as a game selling nothing.

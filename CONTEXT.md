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
by `engine/rating.ts` from the pickup interval; it is the percentage the game shows as
"transported". It cuts the **flow**, before the fleet shares it — not the income afterwards
(ADR-0001).

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

**Cargo per trip** (_груз за рейс_) — what one consist carries on one trip: its capacity, or
the offered flow falling to one train of the fleet, whichever is smaller. Physics is always
computed on a full load: the train waits to be filled rather than running light.

**Pickup interval** (_интервал_) — days between visits to the station, `roundTripDays / fleet`.
Shorter interval → higher station rating → larger delivered share.

**Trains needed** (`trainsNeeded`) — the smallest fleet that clears the **full** output by
capacity. It only bounds the search: the fleet a row really needs is usually smaller, because
the station forwards part of the output. Both goals sweep the fleet from one train up — the
"profit" goal stops at the smallest fleet that moves everything offered, the "transported" goal
goes to the user's limit.

**Fleet limited** (`fleetLimited`) — the fleet, not the station, is the binding constraint:
`fleet × tripsPerYear × capacity < offered`. Measured against what the station offers, not
against `trainsNeeded` — a fleet below `trainsNeeded` still clears everything waiting when the
share is low enough.

## Search

**Goal** (_цель_) — what the optimizer ranks by: `profit` (yearly profit) or `transported`
(hauled per year). Without a flow there is no delivered share, so `transported` degrades to
`profit` inside the engine — the UI only stops the user from picking a dead option.

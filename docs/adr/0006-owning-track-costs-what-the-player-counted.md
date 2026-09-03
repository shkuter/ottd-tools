# ADR-0006: Track costs enter the model as counts the player states

- Status: accepted
- Date: 2026-09-03
- Change: `openspec/changes/add-electrification-payback`
- Supersedes one consequence of [ADR-0005](0005-track-type-is-a-route-property.md)

## Context

ADR-0005 closed with a consequence that has now been overtaken twice:

> Track construction and maintenance costs, and the curve-speed bonus, stay out of the model:
> the calculator knows the route's distance, not its geometry.

The reason given there was not that these costs do not matter — they dominate a large
network's books — but that the calculator has no way to know them. A route is a distance and
a cargo here; how many pieces of track carry it, how many signals stand on it and how many
tiles its stations occupy are facts about a map the calculator never sees.

Two changes since then found a third way out of that. `add-infrastructure-maintenance`
priced the upkeep of a network from counts the player types in, prefilled from an imported
savegame where there is one. This change prices the conversion of a corridor from one track
type to another the same way: the length is a number of track pieces, stated, not derived.

Neither reads geometry, and neither guesses at it. ADR-0004 still holds — a network nobody
counted is not a network of zero: the panels compute nothing until the counts are there.

## Decision

Costs of owning and building track are part of the model, and their quantities are **input**,
not inference. The calculator asks for pieces of track, signals and station tiles in the
units the game bills them in, prefills them from a savegame when it has one, and computes
nothing from an empty count.

The curve-speed bonus, the other half of that consequence, stays out: it is geometry with no
number a player could state in its place.

## Consequences

- The route income tab carries two panels the ADR-0005 world had no place for: what the
  network costs to own, and what converting a corridor would cost and save.
- Railtype data gains the construction multiplier alongside the maintenance one, so a
  conversion is priced from the set rather than from a constant.
- The calculator now models a price category it never touched — `PCAT_CONSTRUCTION` — and so
  carries the difficulty knob and the Base Costs multiplier that go with it.
- The question the calculator answers grows accordingly: not only "what does this train
  earn" but "does this corridor carry enough traffic to justify its track".

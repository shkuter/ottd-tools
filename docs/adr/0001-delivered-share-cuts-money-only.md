# ADR-0001: The delivered share cuts the flow, not the income and not the physics

- Status: accepted
- Date: 2026-08-20
- Change: `openspec/changes/optimizer-transport-goal`

> The file name records the first version of this decision ("cuts money only"), which the
> review of 2026-08-20 replaced — see "Revision" below. ADRs are addressed by number, so the
> name stays; the decision is the one stated here.

## Context

A station only forwards `(rating + 1) / 256` of an industry's output to the trains that call
there (`station_cmd.cpp`, `MoveGoodsToStation` / `UpdateStationWaiting`); the rest never leaves
the industry. The calculator already estimated that share (`engine/rating.ts`) and showed it as
a "transported" percentage, but every money figure was still computed from the **full** output.
Rows with a 40 % and a 90 % share were therefore inflated by different amounts and could not be
compared — which is exactly what the new "transported" goal asks the user to do.

Feeding the share back into the *whole* model would also shorten the consist: less cargo
reaching the station means a smaller load per trip, a lighter train, higher speeds, more trips,
a different rating, and so on. So the question is where in the chain the share belongs.

## Decision

The delivered share cuts the **flow**, before it is shared by the fleet:

```
offeredPerYear = flowPerYear × deliveredShare
cargoPerTrip   = min(capacity, offeredPerYear / (fleet × tripsPerYear))
```

Money follows from `cargoPerTrip` like it does for any other load — there is no separate share
multiplier on income (`engine/optimize.ts` computes the load, `engine/trip.ts` the money).

Consequences of that split, all deliberate:

- The train waits to be filled. In game a train that finds less cargo waiting departs later,
  not lighter — full-load physics is the closer model, and it is the one the tab has always
  used for an industry that cannot keep up. Consist length, mass, speeds, round trip and trips
  per year are all computed from a full load.
- The rating loop keeps seeing the full `cargoPerDay`; the share-of-a-share convergence stays
  inside `rating.ts`, where it is already verified against a real save.
- The fleet sweep starts at one train. How much the station hands over depends on the interval,
  so the smallest fleet that clears it is not known upfront: a station forwarding 64 % of its
  output is cleared by proportionally fewer trains than the full output would need.

## Revision (2026-08-20, code review)

The first version of this decision put the share on income instead
(`TripParams.deliveredShare`, since removed). That is equivalent as long as the station is the
bottleneck, and wrong as soon as the fleet is: when the allowed fleet cannot move what the
station offers (`fleetLimited`), the train loads the whole accumulated pile,
`cargoPerTrip = capacity`, and an outside multiplier understated the money by `1/share` — the
row showed a haul limited by the fleet but a profit limited by the station. Inside the `min`
both cases agree: with an unsaturated fleet the numbers are the ones the multiplier gave, with
a saturated one the money matches the haul the row displays.

## Consequences

- Money on the optimizer tab drops for everyone who states a production figure — flagged
  `**BREAKING**` in `CHANGELOG.md` (minor bump under the 0.x rule).
- The route income tab does not know the production flow and keeps its old numbers, so the two
  tabs disagree once production is stated. That divergence is now specified
  (`route-economics`, "Единая модель во всех вкладках") and named in the UI hint rather than
  quietly tolerated.
- `paybackYears` and `profitPerYear` stay derived inside `trip.ts`: the fleet multiplier lives
  there too (`fleetSize`), so no caller re-implements the profit formula.

## Alternatives considered

- **Multiply `incomePerTrip` by the share.** Rejected on review — see "Revision": it double-cuts
  a fleet-limited row, whose train is in fact full.
- **Multiply `profitPerYear` in `optimize.ts`.** Rejected: `paybackYears` and
  `runningCostPerYear` would have to be rebuilt by hand at the call site, and the "one set of
  numbers from one module" invariant would break at the first refactor.
- **Let the share size the consist too.** Rejected: it turns an estimate of what the station
  forwards into an estimate of what to buy, and it contradicts how a train loads in game.

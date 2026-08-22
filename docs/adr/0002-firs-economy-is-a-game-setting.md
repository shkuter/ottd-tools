# ADR-0002: The FIRS economy is a game setting, even though it changes no number

- Status: accepted
- Date: 2026-08-22
- Change: `openspec/changes/move-firs-economy-to-settings`

## Context

A game runs exactly one FIRS economy, but the calculator kept three answers to "which one":
`firsStore.economyId` behind the tabs of the FIRS chains tab, a second, independent
`routeStore.economyId` behind a `Select` on the route income tab, and nothing at all on the
optimizer, which fell back to "the first economy in the list that lists this cargo"
(`economyIdForCargo`). Two persisted copies could disagree, and the optimizer agreed with
neither.

Moving the choice into `GameSettings` collides with an invariant of this repo: **every setting
must change a calculation** (`engine/__tests__/settings-effect.test.ts`). The FIRS economy does
not. Checked against the data of FIRS 5.2.0: not one of the 96 cargos states a different
`initial_payment_by_economy` or `price_factor_by_economy` between economies. What an economy
decides is which cargos and industries *exist* — 62 in Steeltown against 18 in Temperate Basic —
and how industries are named and fed.

## Decision

`GameSettings.firsEconomy` holds it, next to the `firs` toggle it depends on, and the
settings-effect test grows an assertion that is true of it: switching the setting changes the
set of **active cargos**. The set joins the snapshot for every setting, not just this one, so a
dead switch is still caught — it changes neither the numbers nor the set.

The rule the invariant protects — a switch in the UI that no formula reads — still holds; what
widens is what counts as "changes a calculation". A cargo outside the chosen economy has no
payment rate to compute with, so the setting decides what can be computed at all, which is a
stronger effect than moving a figure, not a weaker one.

## Consequences

- Both persisted copies are dropped: `firsStore` loses its `economyId` (and with it its
  `persist`, since `selectedNode` was never persisted) and `routeStore` loses its own.
  A user's saved economy is not migrated — every default was already `STEELTOWN`.
- `economyIdForCargo(game, cargo, preferred)` collapses to `economyIdForPayment(game)`:
  `VANILLA` or the setting. The "first economy that lists this cargo" fallback disappears,
  because `activeCargos(game)` now only offers cargos the economy has.
- The savegame import stops carrying the economy beside the settings
  (`SavegameImport.economyId` and its special branch in `diff.ts` are gone) and applies it
  through `applySettings`, like every other game setting.
- Unknown ids — a renamed economy in a future FIRS — fall back to `STEELTOWN` in two places.
  `normaliseGame()` repairs the **stored** value, the same treatment already given to dropped
  Base Costs multipliers; `activeEconomy()` repairs every **read**, because `applySettings()`
  and `setGame()` write past the persist `merge` where `normaliseGame()` sits. Neither can
  actually produce an unknown id today — both take one from the list of economies — so the
  second point is structural, not a patched hole: nothing that reads the setting may return
  an empty cargo set or a rate of zero. Reads go through it wherever the id decides the
  result, the payment rate included.

## Alternatives considered

- **A top-level field of `settingsStore`, next to `currency` and `speedUnit`.** That is where a
  setting goes when it is a presentation choice rather than a game parameter, and the letter of
  the invariant pointed here. Rejected: the economy *is* a game parameter — it is a FIRS GRF
  parameter read straight out of savegames — and putting it outside `GameSettings` would leave
  the import splitting one savegame's parameters across two mechanisms, which is the split this
  change exists to remove.
- **Keep a per-tab override on top of a global default.** Rejected: it preserves exactly the
  disagreement being fixed; a route income tab priced in another economy than the graph beside
  it is a bug, not a feature.

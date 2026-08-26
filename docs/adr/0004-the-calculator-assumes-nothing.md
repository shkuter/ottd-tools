# ADR-0004: The calculator assumes nothing about the player's game

- Status: accepted
- Date: 2026-08-26
- Change: `openspec/changes/settings-overhaul`

## Context

Two defaults claimed knowledge the calculator did not have.

`DEFAULT_GAME_SETTINGS` switched Iron Horse and FIRS **on**, so a first-time visitor was
shown a game running two NewGRF sets. The game itself loads no set of its own — a set comes
from the savegame — so the calculator was asserting a configuration it had never been told
about, and a player on vanilla OpenTTD got wrong numbers with nothing on screen to explain
why.

The year was worse: three of them. `CalcSettings.priceYear` (1950) decided prices under
inflation, `SearchParams.year` (1938) decided the buy menu on the optimizer and the supply
tab, and `ConsistPage` kept a `useState(1950)` of its own that did not survive a reload. The
same game, entered on two tabs, answered from two different years — and an imported savegame
set only the first of the three, so a game loaded from 1975 kept showing the 1950 catalogue.

Both are the same mistake: state that describes one thing kept in more than one place, or
asserted without being known.

## Decision

**Nothing is assumed.** Every NewGRF set is off by default. A calculator that has been told
nothing computes vanilla OpenTTD — the game as it ships.

**One year for the whole calculator.** `CalcSettings.priceYear` is it. The tabs keep their
year fields, because that is where the year is needed while working, but the fields edit the
one setting; `SearchParams.year` and the catalogue's local state are gone.

Both reach players who already have settings stored: persist keeps a saved value ahead of a
default, so a migration rewrites the sets rather than leaving half the users on the old
assumption. It cannot distinguish "agreed with the old default" from "chose the same thing",
and that is accepted — two switches, or one savegame import, bring the sets back.

## Consequences

- The FIRS chains and supply tabs are hidden by default, because their set is off. The way
  back is the settings, where all three sets now stand together, or an import, which switches
  on whatever the game runs.
- Every test that silently relied on Iron Horse being on had to say so. `settings-effect.test.ts`
  states the sets in its baseline: with none on, most of its cases measure nothing, because
  the settings they exercise need those sets' vehicles and cargos to have an effect at all.
- `CalcSettings.priceYear` keeps its name though it now decides the buy menu too: the field
  travels inside the savegame snapshot, and bumping that schema drops every stored game
  rather than migrating it. The label and the hint were corrected instead.
- The year is edited by one rule (`components/useYearField.ts`), used by all five year fields.
  It commits on blur, on Enter and on unmount — a tab is left by clicking a link, which some
  browsers do not focus — and it applies no range of its own, because an imported game may
  sit in any year the game allows.
- A savegame import now decides both: the year for every tab, and which sets are on, including
  switching off a set the file does not carry.

## Alternatives considered

- **Leave the defaults on and let the import correct them.** Rejected: it only helps players
  who import a savegame. Everyone else is shown a game that was guessed for them, and the
  guess is wrong for anyone playing vanilla.
- **Change the default for new users only, leaving stored settings alone.** Rejected: two
  behaviours in the field, and the calculator would go on asserting the old guess for exactly
  the users who have used it longest.
- **Keep the years separate and have the import write all three.** Rejected: it puts the
  divergence back the moment anyone edits a year by hand, which is what the tabs are for.

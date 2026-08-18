# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

New entries go under **Unreleased**; `make release VERSION=x.y.z` turns that section into a
released one, bumps `web/package.json`, commits and tags `vx.y.z`.

What the version numbers mean here (the app has no public API, so the rules are stated in terms
of what users see):

- **major** — the calculator produces different numbers for the same input on purpose (formula
  or game-mechanics correction), or persisted state in localStorage is dropped/reset.
- **minor** — a new tab, setting, dataset or language; a NewGRF version bump that changes data.
- **patch** — bug fixes, UI polish, translations, refactors with identical output.

## [Unreleased]

### Added

- **Best train** — `Interval` and `Transported` columns. The interval is the round trip
  shared by the trains the flow needs; the transported share is an estimate of the station
  rating (`station_cmd.cpp` `GetTargetRating`), which is what decides how much of an
  industry's output reaches the station at all — `(rating + 1) / 256`. Hover the cell for
  the breakdown (speed, time since last pickup, waiting cargo, train age).
- **Best train** — a `?` marker next to a vehicle that may not be on sale yet in the year you
  picked. The calculator works in years, the game in dates: a NewGRF sets the introduction day
  (Iron Horse spreads a generation across the year via `date(year, 1 + months_offset, 1)`) and
  the game then pushes it forward by a random 0…511 days (`engine.cpp` `StartupOneEngine`).
  Hovering the marker shows the earliest and the latest month the vehicle can show up.
  Below the table hint the same vehicles are listed as checkboxes: unticking one drops it from
  the search and everything is recalculated without it (kept in `ottd-tools-optimizer`, so a
  dropped vehicle stays listed and can be brought back), plus an `Include all again` button.
  One checkbox covers one buy-list entry: Iron Horse ships several models under a single name
  (Coil Carrier is covered / covered asymmetric / tarpaulin / uncovered plus a randomised one),
  so entries with the same name, capacity, length and introduction date are folded together and
  unticking one drops them all. Same-named entries that really differ carry their capacity.
- **Settings** — JGRPP `Randomise vehicle introduction dates`
  (`vehicle.vehicle_intro_randomisation`). Vanilla OpenTTD always randomises, JGRPP can turn it
  off, and the `?` markers follow the setting.
- Train data now carries `intro_month`, extracted for both Iron Horse and vanilla engines.

### Changed

- Buy price and yearly running cost now have a single implementation
  (`engine/costs.ts`: `trainBuyCost`, `trainRunningCostPerYear`, `consistMoney`). The formula
  used to be copied three times — consist stats, the optimizer and the catalogue table — so any
  correction had to land in three places to keep the tabs showing the same money. Numbers are
  unchanged.

- Shared vehicle and cargo icons live in `components/` instead of the catalogue page, so no tab
  imports from another tab's page file any more. Dead engine exports that nothing called
  (`accelSimulation`, `internalToKmh`, `yearTicks`, …) are gone — git history keeps them.

- **Route income** — the profitability block now runs on the same round-trip model as
  the optimizer (`engine/trip.ts`): the empty return leg is timed at the empty consist's own
  steady speed instead of doubling the loaded leg. Round trip gets shorter, trips per year and
  profit go up for any consist that runs below its speed limit when loaded; a consist carried
  over from the optimizer with "→" now shows identical figures on both tabs. A hand-entered
  trip time still sets the loaded leg; the empty leg scales by the speed ratio.

### Fixed

- Vanilla introduction years are computed from the real calendar date
  (`DAYS_TILL_ORIGINAL_BASE_YEAR + intro_days`) instead of `intro_days / 365`; the years come
  out the same, but the month is now exact.
- Russian cargo name for `HWAR` is now "Оборудование", the name the game shows, instead of the
  literal "Металлоизделия".
- **Best train** no longer scrolls the whole page: the shell is one viewport tall, the header
  and footer stay put and the results table takes the leftover height instead of the
  hand-tuned `calc(100vh - 280px)` it used before.

## [0.1.0] - 2026-08-17

First tagged release. Data: Iron Horse 4.29.0, FIRS 5.2.0, OpenGFX2 Classic 0.8.1.

### Added

- **Best train** — optimizer picking the best engine and consist for a task.
- **Consist builder** — full Iron Horse catalogue with power, tractive effort, weight,
  capacity, purchase price, running costs and top speed on flat and grade (realistic
  acceleration physics reproduced from OpenTTD sources).
- **Route income** — exact `GetTransportedGoodsIncome` reproduction with FIRS payment rates and
  the time-penalty curve, plus profitability of the built consist on that route.
- **FIRS chains** — interactive per-economy cargo-flow graph (graphviz WASM) with industry and
  cargo cards.
- **Settings** — game parameters named as in Advanced Settings (finance, transport, JGRPP
  specifics, Base Costs GRF multipliers, time mode) and calculator assumptions, persisted in
  localStorage; every setting is covered by `settings-effect.test.ts`.
- Iron Horse and FIRS can each be switched off — the calculation falls back to vanilla data.
- Warning that Iron Horse is incompatible with inflation (fatal GRF error in game).
- Russian and English UI, including cargo, unit and industry names.
- OpenGFX2 Classic graphics: vehicle sprites, cargo icons, and an OpenTTD-styled skin built
  from the base set's palette.
- Python pipeline importing Iron Horse, FIRS and OpenTTD sources directly (no NewGRF
  compilation) into committed JSON, with regression tests against known in-game values.

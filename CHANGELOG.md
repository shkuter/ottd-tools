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

- Published to GitHub Pages at https://shkuter.github.io/ottd-tools/. A `v*` tag (or a manual
  run of the workflow) builds `web/` and deploys it; the repository is now public under
  GPL-2.0-only, with data and artwork sources credited in the README.

### Fixed

- **Cargo icon no longer sits on top of the cargo name.** The bare-tag `input, select` rule in
  `index.css` shares the `app` cascade layer with the skin, so it overrode Mantine's own padding
  — including the space the library reserves for a field's sections. Every field with a section
  drew its text underneath: the cargo icon on the left, the dropdown chevron and the number
  stepper on the right. The skin now restates the padding from Mantine's variables, and each
  section is sized for what it holds — 20px for the 10px cargo icon, 24px for the dropdown's
  18px chevron — instead of the field's full height. Fields that were too narrow for the
  restored spacing grew to match: the wagon counter in the consist builder and the control
  column on the settings tab.
- **The catalogue's cargo filter draws its icon inside the field.** It was rendered as a
  sibling next to the dropdown, unlike the three other cargo pickers, which pass it as the
  field's left section.

## [0.6.0] - 2026-08-21

### Added

- **Search goal on the optimizer tab.** Next to "Profit" (the previous behaviour) there is now
  "Haul", which ranks rows by the cargo actually hauled per year. The haul goal searches every
  consist length and every fleet size from one train up to a "Trains at most" limit (4 by
  default), because a shorter interval lifts the station rating and a shorter consist runs more
  often. A fleet that cannot move what the station hands over stays in the output with its
  reduced haul and a marker. The goal needs a production figure to
  have a delivered share at all, so it is unavailable — and ignored by the engine — while
  production is 0.
- Absolute haul per year is shown as its own column under the haul goal; the share column stays.

### Changed

- **BREAKING** **Money follows what the station actually receives.** When production is stated,
  the flow is cut by the share the station forwards ((rating + 1) / 256, `station_cmd.cpp`)
  before the fleet divides it, instead of assuming the full output reaches the train. The same
  input now yields smaller money — the part the industry really hands over. The share cuts the
  flow, not the income on top of the load: a train that finds a full pile waiting earns on all
  of it. Consist length and physics are still computed on a full load (see
  `docs/adr/0001-delivered-share-cuts-money-only.md`).
- **BREAKING** **Money in the optimizer table covers the whole fleet.** Buy cost, running cost
  and yearly profit are stated for as many trains as the row shows, so rows with different fleet
  sizes compare directly. What the station offers is shared by the fleet as well: a train beyond
  what the industry can fill adds cost without adding cargo, so payback gets worse with fleet
  size and an equal haul is won by the smaller fleet. Both goals now sweep the fleet from one
  train up, so a small fleet that already clears everything the station forwards is found even
  when the full output would need more trains.
- **BREAKING** **The profit goal now sweeps the fleet to the limit too.** It used to stop at the
  smallest fleet that cleared what the station offers, on the assumption that further trains only
  add cost. With the delivered share in the model that assumption is wrong: more trains shorten
  the interval, which lifts the station rating, which lifts what the industry hands over. On coal
  in 1938 over 300 tiles at 500/month the tab showed a fleet of 4 earning 346 312 while a fleet of
  11 earns 474 769 — 37 % more. Both goals now evaluate every allowed fleet size and let the
  comparator decide, so "Trains at most" applies under both goals and is always visible.
- The route income tab is unchanged and keeps costing a single train on the full output, so its
  figures no longer match the optimizer once production is stated. The tab hint says so.
- The optimizer's capacity column is now **Cargo/trip**: it always showed what the train actually
  loads (the output piled up since its last visit), not the consist capacity — which is the figure
  after the slash. With the output now shared by the fleet, a partly loaded train is the normal
  case, so the old heading was actively misleading.
- The optimizer got roughly eight times faster without giving up any accuracy: consist physics is
  computed once per engine/wagon pair instead of once per candidate and cached between edits that
  cannot change it, station ratings are memoised, wagons that agree on every number the
  calculation reads are swept as one (142 wagons take coal in 2050, 14 of them differ), and the
  numeric fields feed the search through a 250 ms debounce. The table now draws the first 15 rows
  with a "show more" button — drawing fifty rows of sprites cost more than the search itself.
- The optimizer's three "transported" figures are named apart in the interface: **Delivered
  share** is the part of the output reaching the station, **Haul/yr** the cargo actually moved
  over a year, and **Haul** the search goal; the train count column is now **Fleet**, as the
  glossary calls it.

### Fixed

- **The consist builder catalogue listed every visual variant as its own row.** Iron Horse keeps
  a whole family of models behind one entry of the game's purchase list — Coil Carrier is
  covered / covered asymmetric / tarpaulin / uncovered plus a randomised one — and they differ
  only in the sprite. The catalogue now lists purchase entries instead of models: 1648 rows
  become 965 (engines are untouched, the vanilla set is unaffected). An entry is keyed by
  everything the calculation reads, so vehicles that merely look alike are merged while
  `Metro Coach` surface (23 t) and tube (21 t) stay apart, and the default cargoes only join
  the key in the one mode that reads them (Iron Horse with FIRS off). Grouping now lives in
  `engine/purchase.ts` and is shared with the optimizer's "doubtful vehicles" checkboxes, so
  the same vehicle stands for an entry everywhere. Saved consists keep working.
- The row comparison used "differs by more than 1" tolerances and was therefore not transitive:
  which of two near-equal consists won depended on the order they happened to be swept in, and a
  wagon costing more could survive at equal profit. Comparison keys are now rounded to whole
  units.
- The wagon a row showed depended on the order of the input data. Wagons identical to the
  calculation are swept as one representative, and that representative was whichever one the
  data happened to list first — so the same search over a differently ordered vehicle list
  swapped the wagon in every row for an identical twin. The representative is now picked by the
  same tie-break that decides a row, and rows tied on every number are ordered by identifiers
  rather than by sweep order.
- The optimizer's "→" button handed the route income tab the distance being typed rather than
  the one the row was computed for, so a row transferred within the 250 ms debounce window
  arrived with numbers no row had been priced at.
- Consists shorter than the station were skipped under the profit goal by comparing a consist
  against the industry's full output, while the rest of the model had moved to what the station
  actually offers. The check now asks whether a single train can fill the consist from what is
  offered — which is what decides whether more wagons still pay for themselves.
- Whether the haul goal was available followed the production field as it was typed rather than
  the production the shown rows were computed for, so within the debounce window the haul column
  could be labelled from a search made at production 0.

## [0.5.0] - 2026-08-20

### Fixed

- **BREAKING** **Station rating period follows the JGRPP day length.** The "transported" column
  in the optimizer scales the rating counter period (185 ticks, 2.5 days) by the day length
  factor. The game only advances that counter from `CallLandscapeTick()`, which JGRPP runs in
  the "full" tick of a day, so with a slowed-down economy a period lasts 2.5 days times the
  factor. The calculator counted 2.5 days regardless and reported far too low a share: on a
  save with factor 5 it promised 45% where the game delivered 72%. At a given day length factor
  the share now comes out higher than this calculator used to report; comparing different
  factors against each other is not monotonic, because the factor also moves the flow per game
  day, the trips per year and the consist the optimizer picks. Vanilla and JGRPP with factor 1
  are unaffected.

## [0.4.0] - 2026-08-19

### Added

- **Speed units (land)** — the settings tab now offers imperial (mph) and metric (km/h), named
  as in the game's Localisation settings. Every speed the calculator shows follows the choice:
  the vehicle catalogue, the consist stats, the optimizer table and the route income tab.
  Displayed speeds are derived from the game's internal speed unit exactly as the game derives
  them, so a fast Iron Horse engine reads 181 km/h like in the game, not the 180 a conversion
  of the rounded mph would give. Train data now carries that internal speed.

### Changed

- **Speeds are shown in km/h by default**, matching the game's own default
  (`locale.units_velocity`). Existing users see km/h until they pick imperial in the settings;
  no saved setting is lost and no calculated number changes.

## [0.3.0] - 2026-08-19

### Added

- **Import from a savegame** — load an OpenTTD or JGRPP save on the settings tab and the
  calculator lists how that game's settings differ from yours, applying them only once you
  confirm. Settings, the active NewGRF sets with their parameters, the game's year and its
  accumulated inflation all come out of the file; Iron Horse's wagon-capacity parameter and the
  FIRS economy come along with them. The file is read in the browser, in a worker, and never
  leaves it. All four savegame compressions are supported (none, zlib, xz, LZO); saves older
  than OpenTTD 12 store settings positionally and are rejected with a message saying so.
- Settings a save states that the calculator has no model for — maximum train length, wagon
  speed limits, braking model, industry cargo scale and a dozen more — are listed for
  information instead of being silently ignored.

### Changed

- **BREAKING** — **the Base Costs GRF running-cost multiplier is now three multipliers**, one per running class
  (steam, diesel, electric), because both the game and the base-cost sets scale those base
  prices separately. Iron Horse puts engines in the steam class and wagons in the diesel one,
  while vanilla electric engines use the third. A previously saved single multiplier migrates
  to all three, so existing settings keep producing the numbers they produced before.
- The Base Costs multiplier list now goes up to 64k, matching what the sets themselves offer.
- The interface is built on Mantine 9 — every tab, from the controls to the layout. The look is
  unchanged: Mantine reads the skin's own `--skin-*` tokens through a CSS-variables resolver,
  and the bevels are re-stated for its components in `skin-mantine.css`. Cascade layers
  (`@layer mantine, app`) keep the skin ahead of the library without a single `!important`.
- **Consist builder** — the catalogue no longer stops at the first 400 rows. All ~1650 vehicles
  matching the filter are reachable through the table's own pagination, and sorting, filters and
  the current page survive each other.
- **Route income** — the income-over-time chart is drawn by `@mantine/charts` instead of a
  hand-built SVG path; the dashed marker still reads "time → income" for the trip you entered.
- The catalogue and income tabs load with their own chunks, so `mantine-datatable` and
  `recharts` stay out of the initial download.

### Fixed

- **Starting year and price year accept any year the game does.** Both fields were capped at
  1920–2090, a range borrowed from the inflation model rather than from the setting itself, so
  a game started in 1860 could not be entered — or imported. They now span `MIN_YEAR`…`MAX_YEAR`
  as the game defines them, and emptying the field leaves the year alone instead of resetting it.

### Removed

- `@tanstack/react-table` and `input-switch-polyfill`: the table and the switches are Mantine's
  now. `mantine-react-table` was not an option — it has not been published since February 2025
  and its newest build wants Mantine 7.

## [0.2.0] - 2026-08-19

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

- **Settings** — `Starting year` (`game_creation.starting_year`, default 1950): the point the
  JGRPP "inflation from the start date" model counts its 170 years from.

### Changed

- **BREAKING (numbers)** — economy settings are now read the way the game reads them, so the
  same input can produce different figures than before:
  - defaults match the game's own defaults: `difficulty.vehicle_costs` and
    `construction_cost` are "low" (×6/8, not ×8/8) and `subsidy_multiplier` is ×3 (not ×2).
    Out of the box a Kirby Paul Tank costs £8,203 instead of £10,937. Difficulty settings
    already saved in localStorage are kept as they are — only a fresh browser sees the new
    defaults. (One saved value is rewritten: see the Base Costs entry below.)
  - wallclock timekeeping: an economy year is always 360 days
    (`DAYS_IN_ECONOMY_YEAR`, `timer_game_economy.h:52`) regardless of
    `economy.minutes_per_calendar_year`, which only stretches the calendar. Yearly running
    cost is charged against a fixed 365-day divisor (`train_cmd.cpp:4272`), so in wallclock it
    is now scaled by 360/365 instead of being counted over a full calendar year.
  - with inflation on, cargo payment now grows with it too
    (`initial_payment × inflation_payment`, `economy.cpp:790`). Income used to stay flat
    while costs rose, which made every route look ruinous in later years.
  - the Base Costs GRF multiplier list no longer offers "free (no costs)" — the game clamps
    the multiplier at 1/256 (`MIN_PRICE_MODIFIER`, `economy_type.h:228`). A saved zero is
    normalised to "unchanged" on load.
- Russian names of cargos and industries now match what the game shows. They used to be
  written by hand here, so more than half of them differed from the translation players
  actually run — `Billets & Blooms` was "Заготовки и блюмы" in the calculator and
  "Стальные заготовки" in game. 74 names changed. The dictionaries
  (`web/src/i18n/cargos.ru.json`, `industries.ru.json`) are generated by
  `pipeline/extract_firs_ru.py` from the Russian FIRS translation (ChronosXYZ/firs-ru, built
  on FIRS 5.2.0, pinned by `FIRS_RU_REF`) and from the game's own locale for the names FIRS
  leaves to the game and for the whole vanilla set; `make check-i18n` reports drift. Fixes on
  top of the translation — spelling, letter case and ё only — live in
  `pipeline/ru_overrides.json` and fail the build once upstream corrects them.
- Cargo dictionaries are keyed by cargo id instead of cargo label, so the two cargos sharing
  the `WOOD` label finally get their own names: vanilla "Древесина" and FIRS "Брёвна".
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

- Page components no longer compute anything themselves: the payment-decay chart is tabulated
  by `engine/income.ts` (`incomeCurve`), the FIRS chain walk lives in `features/firs/chains.ts`,
  the "which economy pays for this cargo" rule is `dataset.economyIdForCargo`, and "Reset
  everything" clears the stores through a single registry (`state/index.ts`) instead of a
  hard-coded list of localStorage keys. Same numbers, same chart, zero lint warnings.

- Pipeline: the Iron Horse / FIRS import dance (chdir → argv → sys.path → import) lives once
  in `common.bootstrap_iron_horse()` / `bootstrap_firs()`, JSON reads go through
  `common.load_json()`, `pipeline/requirements.txt` pins the venv, the empty `schemas/` stub is
  gone, and `extract_train_images.py` fails loudly when every render fails instead of exiting 0.

### Removed

- **Settings** — `Minutes per year` (`economy.minutes_per_calendar_year`). The game itself
  states it changes neither vehicle speed nor the economy model, and the calculator's economy
  year no longer depends on it, so it had nothing left to change — this project keeps only
  settings that move the numbers.

### Fixed

- Two industries could end up under one Russian name: `sawmill` takes its name from the game's
  locale, `timber_yard` from the FIRS translation, and both read "Лесопилка" — in the one
  economy that enables both, the chain graph drew two nodes nobody could tell apart. Generation
  now fails on a name shared inside an economy, naming both ids and the source each name came
  from, and `Timber Yard` is "Лесной склад" again (it takes wood products and makes supplies —
  a lumber yard, not a sawmill).
- A name fix in `ru_overrides.json` now reaches every source. Fixes used to be applied to the
  FIRS translation alone, so the names FIRS delegates to the game (`TTD_*`) and the whole
  vanilla set could not be corrected at all — and an attempt failed with a message blaming the
  wrong thing.
- `make verify` regenerates the data before checking it for drift. It used to compare the
  committed dictionaries against the sources first, so bumping a data pin failed the build on
  the very first target, before the target that would have regenerated them.
- The game checkout is pinned (`OPENTTD_REF`, currently 15.3) like every other data source and
  its version is recorded in `meta.json` and shown in the footer. It names 57 of the cargos and
  industries the calculator shows, yet it was cloned from master — so those names came from
  whatever revision each machine happened to fetch. `make data` also depends on
  `fetch-firs-ru`, so bumping the translation pin can no longer rebuild from a stale file.
- Type checking actually runs now. The habitual `tsc --noEmit` checked nothing — the root
  `tsconfig.json` only references the app and node projects and lists no files of its own — so
  two type errors had accumulated unnoticed: a readonly consist array in `engine/trip.ts` and
  the storage binding in the store reset test. `make verify` (which runs `tsc -b`) is green again.
- **Settings** — the `Starting year` field no longer accepts a value outside the range it
  advertises. Clearing the box read as year 0, which counted the full 170 years of inflation:
  prices jumped ×28.6 instead of staying flat.
- Inflation is looked up by whole years. A fractional year (a number input yields one readily)
  read past the table and turned every price, running cost and cargo payment into `NaN` —
  the optimizer then returned an empty list, since `NaN` is falsy.
- **FIRS chains** — the cargo card now shows the same payment rate as the route and optimizer
  tabs. It was the one place left reading the raw base rate, so with inflation on the same
  cargo showed two different figures under the same label.
- **Settings** — `Apply inflation from 1920 to 2090` (JGRPP) was a dead switch: both branches
  clamped the year to 2090, so the numbers never moved, and the meaning was inverted on top of
  that. Both models are implemented now: fixed dates run 1920…2090 whatever year the game
  starts in (inflation accrued before the start is applied when the game is created), while the
  switch turned off runs 170 years from the start year with no pre-start build-up
  (`economy.cpp:834-838, 1029-1035` in the patchpack). A price year earlier than the start of
  the game therefore carries no inflation at all.
- **Vanilla data** — the extractor read the `RVI` table with two columns swapped, so every
  vanilla engine was charged the diesel running-cost base and its power source was garbage;
  cargo labels were taken from the constant name (`OIL`, `PASSENGERS`) instead of the game's
  `CargoLabel` (`OIL_`, `PASS`), which left Iron Horse wagons unable to carry 27 of the 31
  vanilla cargos when FIRS is off. Both come from `vendor/openttd/src` now (`engines.h`,
  `cargo_type.h`). Along the way: climate-dependent wagons (`MCT_GRAIN_WHEAT_MAIZE`) list every
  cargo they take; monorail and maglev vehicles sit on their own `MONO`/`MAGLEV` track types
  instead of RAIL; original wagons never expire (`engine.cpp` forces `base_life = 0xFF`);
  Iron Horse's basecost shifts no longer apply to vanilla vehicles (Kirby Paul Tank is
  £10,937 to buy and £1,093/yr again).
- Vanilla introduction years are computed from the real calendar date
  (`DAYS_TILL_ORIGINAL_BASE_YEAR + intro_days`) instead of `intro_days / 365`; the years come
  out the same, but the month is now exact.
- Russian cargo name for `HWAR` is now "Оборудование", the name the game shows, instead of the
  literal "Металлоизделия".
- The name dictionaries are generated from the string ids the data itself declares, end to
  end: vanilla cargo names used to be matched back through their English display text, which
  silently lost a name whenever the text did not round-trip and aborted the whole run when two
  unrelated `STR_CARGO_PLURAL_*` strings happened to share one. `extract_vanilla.py` now
  records `str_plural` and the translation goes straight through it.
- A cargo or industry with no Russian name now fails `make data` instead of printing a warning
  and dropping the entry, which used to commit an incomplete dictionary with exit code 0.
  Two more cases that used to pass silently now stop the build: a cargo id shared by FIRS and
  the vanilla set whose two names disagree (the FIRS name — and any `ru_overrides.json` fix
  written for it — would have been overwritten), and an industry FIRS renames per economy
  (a dictionary keyed by industry id cannot hold both, so Russian and English would disagree).
- `pipeline/extract_firs_ru.py` parses its own flags: `--check` used to be matched by
  substring, so a typo (`--chek`) turned the read-only drift check into a silent rewrite of the
  committed dictionaries. A missing `vendor/firs-ru/russian.toml` and a missing dictionary now
  report what to run instead of raising a traceback, and the translation is stripped of lang
  markup and stray whitespace the same way the game's own locale already was.
- The FIRS chain graph resolves a cargo label through the dataset index that already exists
  instead of a copy of the label→id map baked into `cargos.ru.json` — the copy had to be kept
  in sync by a test of its own.
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

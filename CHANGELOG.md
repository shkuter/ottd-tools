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

- FIRS chains: the graph canvas takes the keyboard — one tab stop, arrows to walk from node
  to node (the canvas follows the cursor), Enter to pick, Escape to clear.
- FIRS chains: the graph is redrawn the way FIRS draws its own cargo-flow chart. Industry
  nodes carry the set's picture of the industry, cargo nodes are badges in the cargo's game
  colour and so are the edges; hub cargos are cloned beside each producer or consumer, "To
  Wharf"-style notes replace edges to the industries the set marks as wormholes, and the
  supply cargos are lines in the industry card instead of nodes — all of it from the tuning
  the economy ships (`cargoflow_graph_tuning`), not from a rule of ours. The graph sits on a
  canvas of fixed height with zoom, pan, fit and a node search; the cards of the selected
  node offer bridges to the Supply tab (per input) and to Route income (the cargo). Data gain
  the cargo colour per economy, the layout tuning, the industry pictures (two sizes) and the
  full game palette; the visual checks admit the whole palette inside the graph (ADR-0008).
- FIRS chains: a supply chain mode. Pick the industry you want to run and the tab walks its
  inputs upwards — the industries feeding it, the ones feeding those, and so on — and turns the
  walk into an ordered list of haulage tasks: what to bring, from where, to which industry, and
  how much of it over one supply window. The chain is carried further only by industries that
  convert what they are fed; a mine or a port is a leaf, since it takes deliveries for a
  production bonus rather than passing them on. An imported game marks each task supplied,
  standing unfed, or absent from the map, names the nearest source and the length of the leg,
  and orders the list by what is cheapest to build: legs inside one town first, then between
  towns, shortest first within each. Every row carries a bridge to the Supply tab, where the
  trains for that haul get picked.

### Changed

- FIRS chains: the wheel zooms by how far the gesture scrolled rather than by how many events
  it arrived in, so a trackpad no longer flies through the scales while a mouse notch still
  steps like the toolbar buttons; below half scale the nodes drop their text and are read by
  picture and colour, as the overview is meant to be.
- **BREAKING** Snapshots now carry the plot coordinates of each industry, which is what the
  leg lengths are measured from. An imported game has to be imported again: the snapshot
  schema version rises, and a stored one from an older version is dropped rather than
  migrated.

## [0.20.1] - 2026-09-05

### Fixed

- The up arrow of a count field did nothing while the field was empty. Those fields show a
  zero as an empty box, and the library steps an empty field to zero — so the click landed on
  the value the field already held. They now step to one, and an emptied year steps back to
  the year in force instead of to the year 0.
- Text shadows that disagreed with the game, found by the interface-elements page below: the
  warning sign, the "may not be on sale yet" mark, the sorted column heading and the axis
  figures of the chart were drawn flat where the game shades them, and the summary labels and
  the empty-list message carried a shadow where the game draws dimmed text flat.

### Changed

- A dropdown now opens as wide as its longest option, the way the game sizes its own lists —
  one line per option instead of a name wrapped over three. It opens from the left edge of its
  field, the way the game opens a list from the left edge of its button; it is never narrower
  than the field it belongs to, and on a window too narrow for the longest option the option
  wraps again rather than being cut off or running past the edge.
- An option that names a vehicle or a cargo shows its picture, as the game's own icon items do:
  the sprite of the engine in the corridor replacement list, the cargo icon in every cargo
  list. The picture sits in a column of its own, so the names all start at the same vertical,
  and the corridor's engine field is now wide enough to show the sprite and the whole name
  beside it.
- The interface-elements page (`/kit`, for whoever edits the look) now shows one of everything
  the app draws — panels, lists in the frame the tabs use, an empty list, settings rows,
  pagination, the income chart, every picture and every note — together with the states the
  skin paints separately. Controls and text still repeat in each window colour; the list and
  the chart are shown once, in the colour the picker names. A test holds the page against the
  app's own components, so one added without a specimen fails instead of going unchecked.

## [0.20.0] - 2026-09-04

### Added

- A **Network** tab, and the three panels that price the network itself moved onto it from
  Route income: infrastructure upkeep, corridor upgrade payback and signal density. Their
  figures are unchanged — what moved is where they are asked. The tab opens with a summary of
  what owning the network costs for a year, which line most of it goes on, and what to trim,
  ranked by the money each action saves; every figure in it is the one the panel below states,
  and only savings make the list. The corridor and signal panels still compute from the trip
  stated on Route income, which the tab names and links to; Route income points at the tab in
  return, and a company's network carried over from the Game tab lands there.
- Signal density: how far apart signals are worth standing on this line, how many the network
  is worth keeping, and what the extra ones cost a year. Under
  JGRPP's realistic braking the useful spacing follows the consist's braking distance, which
  is computed from the patchpack's own formulas; under the original model it falls back to the
  train's length, and the panel says why the answer is different.
- Two game settings behind the JGRPP switch: the train braking model
  (`vehicle.train_braking_model`) and the acceleration/braking scaling factor
  (`vehicle.train_acc_braking_percent`). Both are read from an imported savegame; only the
  braking half of the scaling factor reaches the calculation, as acceleration plays no part in
  the trip model.
- Corridor upgrade payback: what converting a stretch of track to another type — electrifying
  it, usually — adds to the yearly upkeep, what it changes for the trains, and the **load
  threshold**, the fewest trains at which it stops losing money every year. Capital is priced
  with the game's own conversion formula (`RailConvertCost`), so the panel also names the year
  the conversion pays for itself.
- Track construction prices (`PR_BUILD_RAIL`, `PR_CLEAR_RAIL`) and the railtype construction
  multiplier, extracted from both sets, with a Base Costs GRF multiplier of their own.
- Infrastructure upkeep: what a network costs to own per year — track by type, signals and
  stations — computed the way the game does it, with both growth models (vanilla
  `1 + IntSqrt(n)` and JGRPP's linear one), and shown as a panel of its own.
- Game settings for it: `Infrastructure maintenance` and `Linear maintenance growth`, both
  read from an imported savegame (a game with no linear-growth setting reads as the vanilla
  model), plus a Base Costs multiplier for the infrastructure base prices.
- Track type data now carries the upkeep multiplier of each railtype, extracted from the set
  (Iron Horse states it through `construction_cost`, which is what reaches the grf).
- **Enable wagon speed limits** joined the game settings. The game gates a wagon's own speed
  limit behind it (`train_cmd.cpp`: a vehicle caps the consist when it is not a wagon or the
  setting is on, wagon overrides aside), and the calculator applied wagon limits
  unconditionally — understating the speed of anyone playing with it off, and with it the
  round trip, the trips per year and the delivered share. It is on by default, as in the
  game, so figures are unchanged unless the setting is turned off. What decides is the kind
  of vehicle, not whether the track powers it: an electric engine under no wires makes no
  power and still caps the train.
- The consist summary now says what handed the train its speed limit — an engine, a wagon or
  the track — and names nothing when two of them sit at the same figure. A row in the picker
  whose wagons hold a faster engine back is flagged beside the wagon.
- An imported savegame now states what each of its companies owns — track by type, signals,
  station tiles, roads, tram track and canals — read off the map of the save. The game stores
  no such counters and rebuilds them by walking every tile on load
  (`sl/company_sl.cpp` AfterLoadCompanyStats), so the import walks the same tiles by the same
  rules, in both map layouts: JGRPP's single `WMAP` chunk and upstream's chunk per tile field.
  A map in a layout the import does not know leaves the counts absent rather than zero.
- The company card of the Game tab carries that network into the upkeep panel of Route
  income, marked as the game's figures like every other bridge, and says why it cannot when
  the map was not read. The yearly total on those counts matches the game's own
  infrastructure window to the rouble on both test savegames.

### Fixed

- The bridge arrow on the Game tab is no longer clipped: an action icon grows to the glyph it
  holds instead of being held to Mantine's square.

### Changed

- `economy.infrastructure_maintenance` moved from the informational list of an imported
  savegame into the settings that are carried over: the calculator now has a model for it.
- `vehicle.wagon_speed_limits` travels with an imported savegame instead of being listed as
  a read-only fact of the game: the calculator now has a model for it.
- **BREAKING** The stored snapshot's schema version rises, because a company now carries its
  network: a game imported with an earlier version is dropped and has to be imported again.
  Nothing else in the saved state is touched.

## [0.19.0] - 2026-09-02

### Removed

- **BREAKING** The xUSSR Railway Set is gone: its catalogue, sprites, Russian names,
  extractors and savegame recognition are all removed, leaving vanilla and Iron Horse. The
  set's sources are NML behind the C preprocessor, its upstream is abandoned, and four track
  labels had to be guessed rather than read — numbers the calculator could not stand behind.
  A saved choice of that roster migrates to vanilla, and the track selection resets with it;
  every other setting is kept. A savegame of such a game still imports, with the set
  unrecognised like any other unknown NewGRF.
- An already imported game of that roster is dropped from storage on load, the way a
  snapshot of an outdated schema is, with the same offer to load the savegame again;
  imported games of vanilla and Iron Horse are untouched.
- Mechanics that only that set fed: per-current-system speeds, capacity stated per cargo, the
  road-vehicle running-cost class, and the matching of vehicles from sets built as several
  GRFs. What vanilla and Iron Horse do state — power per source, powered/compatible masks,
  hidden tracks, LGV speed, per-track speed limits — is untouched, and their numbers are
  unchanged.

## [0.18.0] - 2026-08-30

### Added

- **Vehicles never expire** joined the game settings, where it switches the withdrawal off
  the way the game does; it used to be listed as a read-only fact of an imported game.

### Changed

- **BREAKING** The lists of vehicles now follow the game's own buy menu rather than a
  vehicle's stated dates. A model is offered for a year and a half longer than its stated
  model life on average, is not for sale for a year after it appears, and leaves the menu
  together with the rest of its variant series — the game ages a series by its head, and a
  head the player cannot buy starts ageing on the first day of the game. A vehicle the
  active cargo set leaves nothing to carry is not offered at all, as the game switches such
  a vehicle off entirely. Where the answer cannot be certain — the game rolls both the
  introduction date and the selling life out of the map's seed — the row carries a question
  mark saying which end of the vehicle's life the doubt is about.
- The xUSSR data now names the version of the set it was built from (`0.8-11-g3c6d382`)
  rather than a bare commit: the sources are fetched with the set's tags.
- An imported savegame now answers this for itself: the game stores per engine whether a
  company may buy it, and while the year being calculated is the game's own, the catalogue,
  the search and the supply list show exactly what that game sells.
- An imported savegame has to be loaded again after this release: it is now read for one more
  thing, and a snapshot taken before does not carry it.

## [0.17.0] - 2026-08-30

### Added

- xUSSR wagons carry the FIRS 5.2 cargo range. Upstream the set still declares the FIRS 4
  labels, so in Steeltown 18 cargoes had no wagon at all — ferroalloys, the entire steel
  range, concrete products, hardware and the rest — and the catalogue, agreeing with the
  game, could only offer an empty list. Data is now built from a fork that adds those
  labels, offered back upstream (George-VB/xussrset#257).
- **RUR**, the game's other rouble, joins the currency list: OpenTTD ships two, RUR at 50 to
  the pound and RUB at 80, and only RUB was offered.
- A savegame import now carries the display settings the game was played with — its currency
  and its speed units — listed as a group of their own beside the game and calculator
  settings. They change how the figures read, not what they are.

### Fixed

- Every sum in a game played on RUR read 1.6 times too high, since the calculator could only
  price it as RUB: a trip the game paid 2 300 p for was reported as 3 680.

## [0.16.0] - 2026-08-29

### Added

- The **xUSSR Railway Set** is a third train roster beside Iron Horse and vanilla: 926
  vehicles, 28 track types and the set's own capacity tables, extracted from its NML sources
  (`pipeline/extract_xussr.py`) and shown with its own buy-menu sprites and Russian names.
  Track types now carry the current systems they feed a vehicle with, so a dual-system engine
  makes its 25 kV figure under AC wires and its 3 kV figure under DC, exactly as the game
  computes them — and where the set states a speed per system as well, that follows the
  track too: the TGV Atlantique runs 300 km/h under 25 kV and 250 on DC. A wagon's capacity
  follows the cargo it carries, as the set states it, and an articulated vehicle is counted
  whole, the number its buy menu shows.
  Importing a savegame recognises the set and names every NewGRF it recognised above the list
  of proposed changes, and the trains of a saved game are matched to the catalogue by the GRF
  that defined them together with the id local to it — a set spread over several files needs
  both halves.
- Savegames compressed with zstd are read as well. JGR's Patchpack writes its autosaves that
  way, so the file that is already on disk can be imported instead of one saved by hand. The
  decoder is fetched only when a save is actually loaded, so it costs the rest of the app
  nothing.

### Changed

- **BREAKING** The "Iron Horse on/off" switch became a **train set** choice with three values
  (vanilla, Iron Horse, xUSSR): the sets swap the whole catalogue, the track table and the
  basecost shifts, so only one can be active. A saved setting migrates without losing the
  choice — the switch on becomes Iron Horse, off becomes vanilla — and the old field leaves
  the stored state. Rolling back to an earlier version of the app reads the vanilla default:
  the roster choice is lost, no other setting is.

### Fixed

- Running cost now takes the basecost shift of the vehicle's own running class. A set that
  states no shift for a class gets zero for it rather than a neighbouring class's shift, as
  the game does. No number moves on the data shipped today; the rule matters for sets that
  state shifts per class.
- A savegame whose compressed stream is damaged now reports that the file cannot be read.
  Only the LZO branch used to say so; the others let the decoder's own error through.

## [0.15.0] - 2026-08-29

### Added

- The track a route is built with is now a choice of its own, offered wherever a search runs
  (best train, consist builder, route income, industry supply) and in the settings, all
  writing to one place. It lists the track types of the active set, named as the game names
  them: plain and electrified rail, and with Iron Horse also narrow gauge, metro and high
  speed track. Where a set gives two types the same name, the picker tells them apart.
- Track types are extracted from the sets themselves — labels, speed limits, catenary, and
  which vehicles each type carries and powers — so a set that limits speed by track will cap
  trains without a code change.

### Changed

- **BREAKING** The "electrified line" switch is gone from both tabs that had one, and the
  consist builder's own track filter with it: what runs on a line follows from the track it
  is built with. An engine is offered where it draws power, a wagon where it fits the gauge —
  so a pure electric no longer appears on plain rail, and a diesel appears under the wires,
  as in the game. Saved state migrates: gauge families become track labels, and a saved
  "electrified" switch becomes electrified track.
- **BREAKING** Vehicles whose figures depend on the track now state them for the track
  chosen. An electro-diesel makes its diesel power away from the wires and its electric power
  under them; a high speed train runs at its high speed only on high speed track. Both used to
  be computed from a single figure regardless of the line.
- A consist keeping a vehicle the chosen track cannot carry now says so above its summary,
  naming the vehicle: the zeroes underneath are what the game would give it, and without a
  word they read as a broken calculation. The consist itself is left alone.
- Forecasts on the savegame tab read the track from the trains that run each route, since a
  save states the vehicles but not what they run on. An electric route is now forecast at the
  power it actually makes instead of at none.
- The vanilla catalogue stops folding electrified rail into plain rail, so its four track
  types — including monorail and maglev, which the settings offered but the catalogue could
  not show — are all reachable.

## [0.14.2] - 2026-08-27

### Fixed

- The thumb of a switch is the whole height of its track again. Two rules disagreed about it:
  one capped its height, the other set its top and bottom, and the cap won — leaving a button
  two thirds as tall as the track it slides along, which reads as a switch of a different kind
  rather than as a mistake. It now covers the track's bevel, the way the stepper of a number
  field covers the bevel of its plate.

## [0.14.1] - 2026-08-27

### Fixed

- The goal switch in the optimizer's filter row is as wide as its own options again. Held to a
  step of the width scale it clipped the last one in Russian — "Снабжение" wanted 255px of a
  189px field — and left a gap inside itself in English, where the three options filled 166 of
  the same 189. Which of the two happened depended on the language, so neither showed up in the
  other. A group of buttons is sized by the game from its labels, and now says so.
- A rendered-page check for text cut off by the box around it, in both languages. Every other
  check measures boxes, and a box of exactly the right size can still hide what stands inside
  it — which is how the clipped option went unnoticed.

### Changed

- The output field in the filter row is labelled "Output" rather than "Source output": the full
  name stays on the supply tab, where the column is wide enough to carry it.

## [0.14.0] - 2026-08-27

### Added

- Two icons of the game's own interface, extracted like the cargo ones: the subsidy button and
  the button for electrified track, standing in for switch labels that ran half a filter row
  long. They come with a new dataset, `vanilla_gui.json`, and with a decoder that reads chunked
  sprites and the Action 5 blocks a NewGRF lays over the game's sprite numbers — which is how
  the second icon is taken at all, since the base set does not hold it.
- Ten rendered-page checks: one weight throughout, one height for every control, nothing inside
  a control standing past its edges, one arrow, a filter row on one line and sized off the
  scale, a list that aligns its figures and its action, an underline that says which of the
  three kinds of clickable text this is, a page titled where every other one is, a panel that
  holds its content in both languages, and a chart on a dark plate with a graph in palette
  colours. Each was written after a defect that was plain on screen and invisible to the checks.

### Changed

- The controls are one height throughout, the height the game gives a widget: a line of text
  with the frame above and below it. Every kind of control used to take its height from the
  component library's own scale — a field stood at 36px, a segmented control at 31, a tab at 30,
  an icon button at 28 — so a row of them read as stepped whatever was done to their labels.
- A filter row is built from fields of one shape: the label above the control, the width off a
  scale of three steps counted in characters. Controls that were built the other way round — a
  group of buttons under a heading of its own, a switch with its label beside it, a field whose
  only clue was the placeholder inside it — are in that shape now, and the fields that had no
  label at all have one. A row that stood at five different heights stands on one line.
- Units of measurement moved out of the labels and the cells into the field and the column
  heading: "Station length" with "5 tiles" in the field, "Round trip, days" over a column of
  plain figures. A label carrying its unit in brackets ran half again as wide as the field
  under it, leaving a gap the eye reads as a mistake.
- Every column of figures is aligned right, not only the money ones, so the digits line up
  down the column. Vehicle names in the catalogue start at one place regardless of how long
  the sprite beside them is, and the button that acts on a row stands at the edge of the list.
- The gaps in a list come from the game's metrics: cells are spaced by half of hsep_wide, so
  neighbouring columns leave that interval between them rather than the three pixels they had.
- The two tabs that answer about industries wear the colours of the game's industry windows —
  brown for the chains, dark green for the supply list. Both had been the vehicle-purchase
  grey, and the two colour groups they now use were defined in the skin but worn by nothing.
- The chain graph is drawn in palette colours: graphviz still lays it out, but the white sheet,
  the pale nodes and the grey edges it writes into the SVG are overridden, and every exemption
  the rendered-page checks held for that chart is gone. Its layout is also tighter — graphviz
  spread a graph that size over some 2500 pixels of height, which is now about 1400.
- The income chart is drawn the way the game draws its own: a dark sunken field, a solid grid
  on both axes, a thick line in a palette colour, plain figures down the side — in the colour a
  dark plate is lettered in — with the currency named in the heading. The label on the marked
  trip moved under the field, where it no longer lands on whichever axis tick is behind it.
- Links are underlined. The palette gives coloured text a low contrast against the window, so
  colour alone left a link indistinguishable from the words around it — and a row of links in
  the footer indistinguishable from one another.
- One arrow throughout: the same chevron at the same size and in the same colour on a dropdown,
  on the stepper of a number field and as the mark on a sorted column. Each had been drawn by
  something else — a double chevron here, a single one there, a glyph of the font in the table
  header — and matching their boxes was not enough to make them look alike.
- A slash is written without spaces around it, both between two figures of one quantity
  ("144/144") and where it reads as "per" ("Profit/year"). The dictionaries had ten of each
  spelling, split along tab lines, and the same quantity was named "Income/trip" on one tab and
  "Income / trip" on another.
- `index.css` is gone; its rules live in `skin.css`, which is now the only place a rule of the
  skin can be. Seventeen classes had been described in both files, and the pages of one tab sat
  outside the cascade layer entirely, winning over the skin by nothing but position.
- The chart package's stylesheet is imported. Without it the marker in a chart tooltip was an
  `<svg>` with no size at all, which a browser draws at its default 300×150 — the tooltip then
  covered most of the chart. Its colour variables are pointed at the palette in the same move.

### Fixed

- An address no tab answers to lands on the first tab instead of leaving the shell standing
  around an empty page.
- A pinned column has a visible edge, so a value scrolled under it reads as scrolled rather
  than as cut off.
- The stepper of a number field is the height of the field it sits in, covering its bevel
  rather than sitting inside it, and the arrow inside each button is centred in it. Both were
  sized by the library and stood over the plate they belong to.
- The thumb of a switch is centred in its track. Two rules disagreed about its height — one
  capping it, one setting its top and bottom — and it ended up standing against the top edge
  with the whole of the gap underneath.
- The switch is no longer set in a heavier face than everything else, and neither is anything
  else: the library asks for 600 on several of its parts, and the rule saying otherwise had
  stopped matching them.
- A wide list no longer carries the page sideways with it: a grid column will not shrink below
  its content unless told it may, so the catalogue pushed the consist panel off the page.
- Text stays inside the panel it belongs to. A button's label is kept on one line by the
  library, and a line of that length in a 320px panel simply left it.
- The reading that follows the pointer along the income curve is a tooltip of the game like any
  other, and shows the day it stands on rounded rather than to fourteen decimals.

## [0.13.0] - 2026-08-26

### Changed

- **BREAKING**: every NewGRF set now starts switched off. The game loads no set of its own —
  a set comes from the savegame — so a calculator that has been told nothing about the
  player's game computes vanilla OpenTTD. A stored configuration is migrated to match rather
  than left as it was: the calculator cannot tell "agreed with the old default" from "chose
  the same thing", so anyone who plays with Iron Horse and FIRS switches them back on, or
  imports a savegame, which switches on whatever that game runs. Two tabs go with FIRS —
  FIRS chains and Industry supply — since neither has anything to answer without it; a link
  straight to one of them now lands on the main tab rather than on an empty page.
- **BREAKING**: the buy-menu year is one setting for the whole calculator. Best train, the
  catalogue and the supply tab used to keep a year each — and started from two different
  defaults, 1938 and 1950 — so the same game answered differently depending on the tab.
  The year fields stay where they are but edit the one setting, an imported savegame sets it
  once for everything, and the catalogue's year now survives a reload.
- The NewGRF section of the settings holds all three sets at one rank — Iron Horse, FIRS 5
  and Base Costs, which no longer has a section of its own — and what belongs to a set is
  shown as part of it: the wagon capacity parameter, the FIRS economy and the Base Costs
  multipliers are nested under their own switch instead of standing beside it. The capacity
  parameter moves there out of the calculation section, where it stood as a setting of its
  own though it does nothing without Iron Horse. Base Costs keeps its English name in both
  languages, the way the game leaves it.
- The year setting is now called "Calculation year" rather than "Price year": it decides the
  buy menu as well as the prices, and its hint said otherwise. Editing the year on a tab now
  counts as a settings change against an imported game, so the game tab reports the drift the
  way it does for any other setting.

### Fixed

- The warning about Iron Horse refusing to load with inflation showed on every tab whenever
  inflation was on, Iron Horse or not. With the sets off by default it was telling players
  computing vanilla — where inflation is an ordinary setting — to turn it off.
- Clearing the year field wrote a zero into the setting instead of leaving the previous year
  standing. An emptied number field reads back as an empty string, and `Number('')` is 0 — a
  year inside the game's range, so nothing rejected it. It affected both year fields on the
  settings tab.

## [0.12.0] - 2026-08-25

### Added

- Bridges from the game tab into the calculating ones: a route carries its consist, cargo,
  leg, load and source flow into Route income, or its cargo, leg and flow into Best train,
  and an industry carries one of its produced cargoes with last month's output. A bridge is
  offered only where the carry would be honest — an unmatched vehicle or a fleet built two
  different ways shuts the income bridge and says which, while the optimizer still takes the
  route because it picks a consist itself. The receiving tab notes where its figures came
  from until they are edited. All of it follows one rule the optimizer's table already set:
  a whole row travels by the arrow at its end, a single value travels by clicking the value
  — so a cargo is a link to "best train for it" wherever a cargo is listed.
- The snapshot now records which industries lie in a station's catchment, measured off the
  railway platforms the save stores (`train_station`) grown by the game's radius — the
  station's full extent is NOSAVE and never reaches the file. This is what the source flow of
  a bridge is summed from. **BREAKING**: it raises the snapshot schema version, so a game
  imported before this has to be imported once more.
- Savegame import now extracts the whole game network, not just the settings: trains with
  their consists (matched to the vehicle catalogue through the save's engine id mapping),
  routes as shared order lists, stations with waiting cargo and ratings, industries with
  their monthly production, towns, groups and companies. The snapshot is stored in the
  browser (IndexedDB, one record, schema-versioned) and survives a reload; one confirmation
  applies the settings and stores the snapshot. The file is read in a worker, which hands
  back a network already reduced — the savegame itself never reaches the page. Town names are regenerated from their saved
  seeds (English Original generator ported from the game), station names follow the UI
  language through the game's and FIRS's own suffix strings ("Londworth Furnace" /
  "Londworth Печь"). Nothing is shown for it yet beyond the import summary — the savegame
  tab arrives in a follow-up change.
- A tab for the imported game, titled with the savegame's file name and offered only once a
  savegame has been imported. It lists the routes of a company with their fleet, cargo and
  distance, and states the profit the game itself recorded last year beside the profit the
  calculator expects for the same route — fact next to forecast, with a note that the two
  count a year differently and are not meant to match. A row opens in place to show every
  stop, the trains of the fleet and where the forecast came from. Three further lists cover
  the trains (filtered by group, as the game's own train list is), the stations (waiting
  cargo and the ratings the game shows) and the industries (last month's production and how
  much of it was hauled away). A route the model cannot answer for — one stop, more than
  two, an unknown cargo, a consist the catalogue cannot fully match or has no room for this
  cargo in, or a fleet of differing consists — states that reason instead of a number.
  Forecasts are computed from the settings the savegame was imported with rather than the
  current ones, so editing the calculator afterwards does not silently restate them.
  "Reset everything" on the settings page now clears the imported game as well: it used to
  wipe localStorage only, leaving the savegame — the largest thing the calculator keeps of
  yours — in the browser. Every list names a cargo the way the rest of the calculator does,
  with its icon before the name.
- Industries of a game played without FIRS are now named, where they used to read "unknown
  industry": the base game's own table (`_origin_industry_specs`) orders the industry types
  a savegame stores, and its locale names them — the same route the vanilla cargo names
  already took, so Russian comes out as the game words it ("Угольная шахта").

### Changed

- The savegame reader is now covered by a real vanilla game as well as the JGRPP ones: the
  base-set path (no NewGRF at all, the old order pool, climate cargo slots) is asserted
  against a played savegame instead of a synthetic one. The import panel has component
  tests too, so "confirm applies and stores", "cancel writes nothing" and "settings already
  match" are checked rather than clicked through by hand.

- The skin is now checked in a browser as well as in the stylesheets: rendered-page checks run by
  `make check-visual` (part of `make verify`). They serve the built bundle, open it in
  Playwright's Chromium and assert about computed styles, which is the only way to catch the class
  of defect a stylesheet read as text cannot show: a rule whose selector matches nothing, a token
  frozen on the base theme, a shadow inherited from the theme carrier, or a colour that appears in
  no rule of ours at all. Covered so far: no colour outside the base set's palette, on `/kit` in
  every window colour group — dropdown, tooltip and notification included — and on every tab; the
  shadow on every colour but black and dimmed; the chosen dropdown option as a full-height black
  plate; an unavailable widget hatched in the shade of its own window; scrollbars painted from the
  palette, read off the pseudo-elements the skin colours them through; one vertical scrollbar per
  tab with sideways scrolling only where the spec allows it; and the window colour following the
  tab. Expected colours are read off the theme tokens and the allowed set from
  `opengfx2_palette.json`, so repainting a theme or re-extracting the base set moves the checks
  with it. Not part of `pages.yml`: publishing the site stays Node-only, and the browser is
  installed once by `npx playwright install chromium` rather than by `npm install`.

- The three lists — the optimizer's results, the vehicle catalogue and an industry's inputs —
  now behave alike: one sorting mechanism (three clicks per header, the third back to the tab's
  own order), one frame, one message where a filter left nothing, and pinned edge columns on the
  lists wide enough to scroll sideways. `mantine-datatable` is gone with them: the catalogue's
  chunk falls from 94.7 kB to 14.9 kB, the library's cascade layer leaves `layers.css`, and the
  skin no longer carries rules written for its markup. The catalogue keeps its pages of 50 and
  the optimizer its "show 15 more" — 50 ranked rows have nothing to page through, 167 filtered
  vehicles do — and the catalogue's sorting gains the third click and marks only the column it
  sorted by, the way the game marks its own list.

### Fixed

- The consist builder could not hold vanilla vehicles at all: the store looked ids up in the
  Iron Horse catalogue alone, so with Iron Horse switched off adding a vehicle did nothing
  and a saved consist came back empty after a reload.
- The lettering of a subtle button and the title of an alert or a notification went unshaded
  although both are drawn in a colour the game shades, while a disabled label and the footer
  carried a shadow although theirs are the two colours the game draws flat. Found by the new
  checks, which read the shadow off the rendered text rather than off the rule.
- `mantine-datatable` faded the edges of the catalogue's scroll area with a translucent black
  gradient — a colour the palette does not have, and an effect the game has no equivalent for.
- No list ever had the sticky header its stylesheet described. `overflow-x: auto` on the frame
  makes the browser compute `overflow-y: auto` as well, so the header stuck to a container that
  never scrolls vertically and moved away with the page. The rules are removed rather than
  repaired: keeping a header in view needs a list of fixed height with a scrollbar of its own,
  which the shell's "one document, one scrollbar" rule rules out.

## [0.11.0] - 2026-08-23

### Added

- The tab icon is the OpenTTD logo with the dollar sign traded for a steam locomotive and a
  `tools` wordmark set in the game's own interface font — the calculator is about trains, not
  about money. The SVG itself goes to browsers that take one, with 16, 32 and 180 pixel
  renderings cropped to the diamond, since the "OPEN TTD" banners turn to mush at that size.
- Interface-elements page at `/kit`, showing every control the skin styles in every window
  colour of the shell. It is not a tab and does not load with the rest: it exists so a change to
  the look can be checked on the whole set at once instead of one tab at a time.
- Window colours follow the tab, the way a window of the game is painted in the colour group of
  its kind: the settings tab is the game's mauve options window, the rest the grey
  vehicle-purchase window, with brown and dark green defined for the industry lists to come. The
  colour covers the whole page, header and footer included — the calculator is one window, and
  its tabs swap what is inside it rather than opening a window of another kind.
- Test that reads the stylesheets and fails on a colour outside the base set's palette, so a hex
  typed into a rule cannot quietly become a colour OpenTTD does not have.

### Changed

- Every interface colour is now the palette colour the game takes for the same job — down to the
  ones no stylesheet was setting. The library's own black and white went to switches and
  checkboxes as a text colour, and the native controls stacked under Mantine's artwork were left
  to the browser, which paints them pure white under color-scheme: dark. Neither white nor black
  is a colour the game has (TC_WHITE is #fcfcfc, TC_BLACK #101010). Sweeping the rendered page
  now turns up no colour outside the palette but one: the white sheet graphviz draws the FIRS
  chart on. Recharts' own #ccc grid and the SVG default black it hands to its groups are covered
  too, and the places that dimmed a palette colour with `opacity` — which mixes it with whatever
  is behind — now name a colour instead.
- The hatch that marks a control unavailable reaches the number field's stepper arrows and the
  catalogue's pager, which the library had been dimming rather than hatching. Text follows
  the game's own roles (`_string_colourmap`) with the black shadow that keeps a pale colour
  legible on a grey window; the interior of a sunken widget is lighter than the surface around
  it, as `DrawFrameRect` paints it; an edit box is the game's black plate with a yellow value; the
  selected item of a dropdown is a black plate with white lettering; a tooltip is pale yellow in
  a black frame; and an unavailable control is hatched with a checkerboard rather than just
  dimmed.
- The list header is no longer sticky. Sticking needs a scroll port to stick to, and with the
  page scrolling as one document the wrapper does not scroll vertically — while scrolling
  sideways still makes it a scroll container on both axes, so the header was anchored to a box
  that never moves. Sideways scrolling for wide tables is what that trade buys.
- The page is as long as its content and scrolls as one document. The shell no longer holds
  itself to one viewport with the header and footer pinned, and the lists, the FIRS chart and
  the side panels no longer carry scroll areas of their own — so there is one vertical scrollbar
  instead of two or three nested ones. Sideways scrolling stays where the content really is
  wider than its column.
- One interface scale for the whole skin: fonts, control heights, bevels and widget padding are
  the game's own unscaled metrics times a single factor (1.5), instead of sizes that answered to
  three different scales at once.
- The calculator's name is lettering on the window rather than a caption plate: the game fills a
  caption with the company colour, and there is no company here to take a colour from.
- Dimmed text is now a colour rather than a smaller size, matching how the game separates an
  explanation from a value.
- One font weight throughout, as the game has: its font ships a single face, so a bold heading,
  button or label was a browser-synthesised one, which smears a font whose pixels are meant to
  line up. Emphasis is carried by colour and size instead — the title of a warning takes the
  heading colour, and a figure that carries a verdict keeps its own.
- The text shadow follows the colour rather than the role, as the game does: everything but
  black and the dimmed grey gets one, so light body text on a dark window is shaded too. A tab
  is a link with `aria-current`, so the rule for links had also been shading buttons whose text
  is TC_BLACK.
- A hovered button is one shade darker instead of one lighter: lighter is the pressed fill, and
  the two states were telling apart only by the direction of the bevel. The game has no hover
  state to copy.
- The catalogue obeys the skin: `mantine-datatable` declares a cascade layer of its own, which
  was landing after ours and winning on layer order.
- Rules on bare `button`, `input`, `select` and `table` tags are gone; the skin styles components
  by their own classes. The number field's stepper arrows are visible again — the padding meant
  for buttons had been squeezing them to nothing.

### Fixed

- The selected item of a dropdown is the game's black plate again. The rule named a class that
  does not exist (`Select` renders `mantine-Select-option`) and an attribute Mantine never
  writes, so neither the plate nor the hover highlight was reaching the list; options are now
  addressed by `data-combobox-option`, and the chosen one by `data-checked`.
- The hatch that marks a control unavailable reaches disabled tabs, checkboxes and radios,
  which had been dimmed but not hatched, and it finally takes the colour of the widget it
  covers: the pattern lived in a variable, so it carried the colour of wherever that variable
  was declared and every override was dead.
- A dropdown item takes the padding the game gives it — horizontal only, so the black plate
  under the selected one covers the row's full height instead of sitting inside an asymmetric
  box. The tooltip and the segmented button take theirs from the right metric too.
- The text shadow no longer leaks onto black or dimmed lettering inherited from the window
  theme: buttons, tabs, dropdown fields, tooltips and field descriptions switch it back off.
- `make data-opengfx2` parses the GUI colour enum of OpenTTD 15.3 again; it expected the shape
  the master branch has, so it could not run against the pinned release.

## [0.10.0] - 2026-08-23

### Changed

- **BREAKING** Station rating now accounts for the cargo a fleet never gets round to. The
  estimate used to assume every visit cleared the platform and started the pile from zero, so a
  route whose fleet fell behind its source was rated as if it kept up. It now solves for the
  backlog the station settles at: a bigger pile costs rating, a lower rating means the industry
  hands over less, and less handed over is what lets the fleet catch up — the pile stops growing
  where what arrives between visits equals what one visit carries off, or where the game stops
  counting it. Rows whose fleet lags behind the flow show a lower delivered share and a lower
  rating on both the Best train and Route income tabs; routes whose fleet clears the flow are
  unchanged. Checked against a savegame: a coal mine at 405 t/month served by three 120 t
  consists reads 69 % transported in game, and the calculator now says 68 % where it used to
  promise 75 %. While a backlog stands the share is read off that balance — what a visit carries
  off against what the interval brings in — rather than off the rating step below it: a step is
  1/256 of the output, so choosing one would have had a larger industry hauled *less* by the
  same fleet.
- **BREAKING** The delivered share is now solved for rather than iterated towards. The estimate
  used to feed its own result back in five times, which converges only while the response stays
  gentle: on a large industry one penalty step moved the share further than the share moved the
  pile, so the loop oscillated and landed on the floor of 1/256. A source twice the size then
  read as hauled *half* as well by the same fleet. The share the loop returns never rises with
  the share it is given, so the two cross exactly once and that crossing is what the estimate
  now looks for. The crossing itself is the share, not the penalty step below it — a step is
  1/256 of the output, so reading the step would still have let a bigger source be hauled less,
  and would have marked a fleet carrying the whole flow as short of trains. Routes whose loop
  already converged keep their numbers to within a hundredth of a rating point.
- The rating breakdown in the optimizer names one more part: the swing across a penalty step.
  A station balances between two steps rather than on one, so the rating it settles at is the
  average of the two and the parts listed above it fall short — the line closes that gap, and
  appears wherever the gap survives rounding.
- The "fleet limited" flag now follows that backlog. Comparing what a fleet can carry against
  what the station offers no longer catches a fleet left behind, because the station settles at
  handing over exactly what the fleet does carry.
- Whether a route offers a full-load branch at all now follows the backlog too. A station that
  never empties has a load waiting at every visit, so waiting for a full one buys nothing. The
  old test — "the train is not leaving full" — could not tell that station from a source too
  slow to fill the train, and offered the branch on both.

## [0.9.0] - 2026-08-22

### Added

- Supply window: the optimizer now answers whether a fleet visits often enough to keep the
  receiving industry fed. FIRS remembers a delivery for 27 production cycles of 256 ticks, and
  an input that falls out of that window stops counting as supplied — a secondary then converts
  a smaller share of everything it is fed, and a primary or port loses a production bonus it
  earns by volume. A new column measures each row's interval against the window, names the
  fleet that would hold it, and says plainly that it counts the hauled cargo only. A third
  search goal, "Supply", ranks by the conversion the industry reaches and settles ties by
  profit, so it finds the cheapest way to keep the destination fed rather than the shortest
  interval. Where a cargo has several consumers, the destination is picked on the tab; the
  window, the pool thresholds (16 / 80 for mines and farms, 128 / 640 for ports) and the
  production bonuses come from the FIRS sources through the pipeline.
- Industry supply tab: one industry, every input of it at once. Pick the receiving industry,
  give each input a distance and the output of its source, and the tab runs the same sweep the
  Best-train tab runs — once per input — then adds the results up into the industry's own
  conversion. It names the input to fix first: the fleet that brings it inside the window,
  against the fleet limit set on the tab, or the fact that nothing in that year's buy menu can
  haul it at all. Inputs without a route stay visibly unset and the total says it is partial,
  rather than a figure computed from distances nobody gave. Primaries and ports get their pool
  instead: the volume the routes on the tab deliver across the window and the production level
  it earns. The conversion is computed from the real state of every input rather than taken
  from an optimizer row, which assumes the other inputs are fed by somebody else. Industries
  the calculator does not model, and industries that accept nothing, say so instead of showing
  a form. Like the catalogue and the income chart, the tab loads in a chunk of its own.
- The optimizer's result table sorts by any column: a click orders by it, a second reverses,
  a third returns the order the search produced. Sorting is a view over the rows the goal
  already ranked — it changes neither the set of rows nor their figures.

- The FIRS economy is a game setting now (Settings → NewGRF sets, under the FIRS toggle),
  applied to every tab at once. It decides which cargos exist rather than what they pay, so
  the active cargo set follows it: a game in Steeltown is offered its 62 cargos instead of all
  96 FIRS states, and a cargo the economy does not have is offered nowhere. An economy id the
  data no longer has — a future FIRS renaming one — falls back to Steeltown.

### Changed

- **BREAKING** The economy tabs on the FIRS chains tab and the economy select on the route
  income tab are gone, and with them the two persisted copies of the choice
  (`routeStore.economyId` and the whole `ottd-tools-firs` key). A saved choice is not migrated:
  every default was Steeltown already. What can change a figure is the cargo, not the rate —
  FIRS states the same rate for a cargo in every economy that has it. A cargo the chosen
  economy lacks gives way to the first one it does have where a tab needs a cargo to compute
  at all (route income, the optimizer), and is simply cleared where the choice is optional
  (the consist builder, whose capacity row then reads zero until a cargo is picked again).
- The payment rate comes from the economy in the settings instead of "the first economy that
  lists this cargo" (`economyIdForCargo` → `economyIdForPayment`), and a savegame's economy is
  imported as an ordinary game setting rather than through a path of its own.

## [0.8.0] - 2026-08-22

### Added

- The full-load branch adds an accumulation wait to the round trip: `max(physical round trip,
  fleet × capacity ÷ accumulation rate)` (`engine/waiting.ts`), and reads its own delivered
  share — a consist that stands for a full load visits the station less often, so its rating is
  lower and the industry hands it less. The load also ages while it is built up, so it pays
  less on delivery: cargo ages in the wagons only (`VehicleCargoList::AgeCargo`) and the game
  pays by the average age aboard — what piled up while the train was away is loaded in one go
  and ages the whole wait, the rest ages half of it. Assumes the flow splits evenly between
  the trains of a fleet; real consists bunch up and wait unevenly.
- The route income tab gained a source output field and a "wait for a full load" switch, plus
  rows for the accumulation wait, the delivered share and the cargo actually hauled per trip.
  Both are form state, not settings: the branch is a property of a route, not of the game.

### Changed

- **BREAKING** Routes are now costed in both loading branches — a consist that leaves with
  whatever accumulated, and one under a full-load order that leaves only when it is full — and
  the optimizer keeps whichever is better for the chosen goal. Rows where the order changes the
  outcome carry a mark saying which branch won and why the other is worse, so the calculator can
  now answer whether a full-load order is helping a route or holding it back. Same input, different
  rows: on routes the waiting branch wins, the numbers move.
  The new numbers are checked against a real game (Londworth Transport, June 1989): the branch
  that runs with what accumulated reproduces the station's monthly intake to within 2 % and the
  consist's running cost to within 0.03 %, while the round trip comes out 4 % short of the
  in-game timetable and the station rating ~4 points high. See the change's `design.md` for the
  recorded gaps; nothing was tuned to close them.

- The deployed site now counts pageviews through GoatCounter, to tell whether anyone finds
  and uses it. It is cookie-free and stores no personal data, so the site needs no consent
  banner, and it ignores localhost, so only the deployed copy reports. Counting is manual
  (`src/analytics.ts`) because the router swaps tabs without a page load, and because paths
  are reported without the deployment's base path: the dashboard lists `/income`, not
  `/ottd-tools/income`. Nothing is recorded until the site code in that module is registered
  on goatcounter.com.

### Fixed

- The interval column's tooltip stated the station-rating thresholds in days for an unslowed
  economy only. They now follow the JGRPP day length factor, where a rating period lasts that
  many times longer: 52.5 / 30 / 15 / 7.5 days become 262.5 / 150 / 75 / 37.5 at factor 5.

## [0.7.0] - 2026-08-21

### Added

- Published to GitHub Pages at https://shkuter.github.io/ottd-tools/. A `v*` tag (or a manual
  run of `make deploy`) builds `web/` and deploys it; the repository is now public under
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

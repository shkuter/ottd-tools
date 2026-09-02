# OTTD Tools

**[shkuter.github.io/ottd-tools](https://shkuter.github.io/ottd-tools/)**

*Читать по-русски: [Русский](README.ru.md).*

Calculator for OpenTTD, with optional support for the Iron Horse (Pony roster) and FIRS 5
NewGRF sets. Out of the box it computes vanilla OpenTTD: the calculator assumes nothing about
your game until you tell it — switch the sets on in the settings, or import a savegame and let
it read them off your game.

- **Best train** — the job first, the train second: distance, station length, cargo and
  industry output go in, and a swept catalogue comes back ranked by profit, haul or supply,
  fleet size and full-load order included.
- **Consist builder** — assemble a train from the full vehicle catalogue: power, tractive
  effort, weight, capacity, purchase price, running costs, top speed on flat/grade
  (realistic acceleration physics reproduced from OpenTTD sources).
- **Route income** — exact `GetTransportedGoodsIncome` reproduction with FIRS payment rates
  and time-penalty curve chart, plus profitability of the built consist on that route
  (profit per year / per train tile, payback) and what the network itself costs to own each
  year — track by type, signals and stations, as the game's infrastructure window bills them.
- **Industry supply** — every input of one industry at once: a fleet per input, the
  conversion they add up to, and the input to fix first.
- **FIRS chains** — interactive cargo-flow graph per economy (graphviz WASM), industry and
  cargo cards with input/output ratios.
- **Game** — import a savegame (JGRPP and vanilla, read in a worker, never leaves the
  browser) and the calculator reads your settings, trains, routes, stations and industries
  out of it. The tab lists your routes with the profit the game recorded last year beside the
  profit the calculator expects for the same route, and hands a route or a cargo over to the
  tabs above.
- **Settings** — the game's own Advanced Settings, named as the game names them, plus the
  assumptions the calculator makes. English and Russian throughout; cargo, industry and
  setting names come from the game's and FIRS's own locales, so what you read here is what
  you see in your game. The interface is skinned after an OpenTTD window, painted from the
  OpenGFX2 palette.

## Layout

- `pipeline/` — Python extractors: import Iron Horse and FIRS sources directly (no NewGRF
  compilation) and emit static JSON into `web/src/data/` + cargo icons into
  `web/public/icons/`. `extract_vanilla.py` also parses OpenTTD's own tables, so the
  calculator keeps working with either NewGRF set switched off, and `extract_opengfx2.py`
  reads the base set's GRF for vanilla sprites and the interface palette. Generated JSON is
  committed, so the web app builds without Python.
- `web/` — React 19 + Vite SPA on Mantine. Game formulas live in `web/src/engine/` as pure TS
  with vitest tests; the savegame reader is `web/src/savegame/`, UI tabs are
  `web/src/features/`.
- `docs/` — [ADRs](docs/adr/) for decisions worth their own record and notes for agents;
  [CONTEXT.md](CONTEXT.md) is the glossary. Feature planning lives in `openspec/`.
- `vendor/` — shallow clones of source repos (not committed, `make fetch`):
  [iron-horse](https://github.com/andythenorth/iron-horse) — vehicle data;
  [firs](https://github.com/andythenorth/firs) — industry/cargo data;
  [OpenTTD](https://github.com/OpenTTD/OpenTTD) — economy & physics formulas, locale;
  [OpenTTD-patches](https://github.com/JGRennison/OpenTTD-patches) — JGR's Patchpack,
  reference for patchpack-specific behaviour, pinned at the release players run.

## Commands

```sh
make fetch   # clone iron-horse (pinned tag), firs, openttd, openttd-patches into vendor/
make venv    # python venv + Pillow + Chameleon
make data    # regenerate JSON from vendor sources + validate
make check-i18n   # do the committed name dictionaries still match their sources?
make data-images  # render Iron Horse spritesheets + cut per-vehicle sprites
                  # (slow-ish)
make data-opengfx2  # vanilla sprites, cargo icons and the GUI palette from OpenGFX2 Classic
make dev     # vite dev server
make test    # pipeline regression tests + vitest formula tests
make check-visual  # open the built bundle in a browser and check how the skin renders
                   # (needs `cd web && npx playwright install chromium` once)
make build   # production build
make verify  # data + i18n check + test + rendered-page check (which builds)
make release VERSION=x.y.z  # close CHANGELOG's Unreleased, bump, commit and tag
make deploy  # republish the site from the current branch (a v* tag deploys on its own)
```

## Data update

Bump `IRON_HORSE_REF` / `FIRS_REF` / `OPENTTD_REF` / `OPENTTD_PATCHES_REF` in the
Makefile, **delete the matching
`vendor/` clone** (`make fetch` skips a directory that already exists), then
`make fetch && make data && make test`. Regression tests in `pipeline/tests/` pin known values
(checked against https://grf.farm/iron-horse/ docs) and will flag unexpected changes;
`make check-i18n` and the locale tests will flag names that need translating.

## Accuracy notes

- Money formulas use the GRF basecost shifts Iron Horse sets (engines ÷4, wagons ×2,
  running steam ÷4, diesel ÷16) on top of vanilla base prices.
- FIRS `price_factor` → NewGRF base payment: `price_factor × 2^21 / 51000` (NML conversion).
- Cargo payment time penalties are in transit periods of 2.5 game days, not days.
- Lengths are OpenTTD length units: a standard vehicle is 8 units — half a tile, so a tile
  is 16 (verified against the game).
- Inflation is off by default: Iron Horse refuses to load with inflation enabled.

- Loading speed is only stated in the data by Iron Horse, so a round trip on the game's own
  roster is reported without the stop under the crane or the chute. Every other number of
  the trip is unaffected: the stop is added to the journey, not computed from it.

## License

GPL-2.0-only — see [LICENSE](LICENSE). The calculator redistributes data and artwork derived
from GPL-2.0 projects, so the same terms cover this repository as a whole.

Derived material and its sources:

- Vehicle stats and buy-menu sprites — [Iron Horse](https://github.com/andythenorth/iron-horse)
  4.29.0, © andythenorth and contributors.
- Industry, cargo and economy data — [FIRS](https://github.com/andythenorth/firs) 5.2.0,
  © andythenorth and contributors.
- Vanilla vehicle/cargo tables, economy and physics formulas, savegame format, town and
  station name generators, Russian setting and cargo names —
  [OpenTTD](https://github.com/OpenTTD/OpenTTD) 15.3, © the OpenTTD team.
- Vanilla-mode vehicle sprites, cargo icons and the interface palette —
  [OpenGFX2 Classic](https://github.com/OpenTTD/OpenGFX2) 0.8.1, © the OpenGFX2 authors.
- Russian FIRS translation — [firs-ru](https://github.com/ChronosXYZ/firs-ru), a fork of
  FIRS 5.2.0.
- Tab icon — the [OpenTTD](https://github.com/OpenTTD/OpenTTD) logo (the diamond and its
  "OPEN TTD" banners), © the OpenTTD team; the locomotive silhouette in place of the dollar
  sign is AI-generated and the `tools` wordmark is set in OpenTTD's own interface font.

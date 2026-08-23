# OTTD Tools

**[shkuter.github.io/ottd-tools](https://shkuter.github.io/ottd-tools/)** — published from `master` on every `vX.Y.Z` tag.

Calculator for OpenTTD with the Iron Horse (Pony roster) and FIRS 5 NewGRF sets:

- **Consist builder** — assemble a train from the full Iron Horse catalogue: power, tractive
  effort, weight, capacity, purchase price, running costs, top speed on flat/grade
  (realistic acceleration physics reproduced from OpenTTD sources).
- **Route income** — exact `GetTransportedGoodsIncome` reproduction with FIRS payment rates
  and time-penalty curve chart, plus profitability of the built consist on that route
  (profit per year / per train tile, payback).
- **FIRS chains** — interactive cargo-flow graph per economy (graphviz WASM), industry and
  cargo cards with input/output ratios.

## Layout

- `pipeline/` — Python extractors: import Iron Horse and FIRS sources directly (no NewGRF
  compilation) and emit static JSON into `web/src/data/` + cargo icons into
  `web/public/icons/`. `extract_vanilla.py` also parses OpenTTD's own tables, so the
  calculator keeps working with either NewGRF set switched off. Generated JSON is committed,
  so the web app builds without Python.
- `web/` — React 19 + Vite SPA. Game formulas live in `web/src/engine/` as pure TS with
  vitest tests.
- `vendor/` — shallow clones of source repos (not committed, `make fetch`):
  [iron-horse](https://github.com/andythenorth/iron-horse) — vehicle data;
  [firs](https://github.com/andythenorth/firs) — industry/cargo data;
  [OpenTTD](https://github.com/OpenTTD/OpenTTD) — economy & physics formulas;
  [OpenTTD-patches](https://github.com/JGRennison/OpenTTD-patches) — JGR's Patchpack,
  reference for patchpack-specific behaviour.

## Commands

```sh
make fetch   # clone iron-horse (pinned tag), firs, openttd, openttd-patches into vendor/
make venv    # python venv + Pillow + Chameleon
make data    # regenerate JSON from vendor sources + validate
make data-images  # render Iron Horse spritesheets + cut per-vehicle sprites (slow-ish)
make dev     # vite dev server
make test    # pipeline regression tests + vitest formula tests
make build   # production build
make verify  # data + test + build
make deploy  # republish the site from the current branch (a v* tag deploys on its own)
```

## Data update

Bump `IRON_HORSE_REF` / `FIRS_REF` in the Makefile, re-checkout the tag in `vendor/`, then
`make data && make test`. Regression tests in `pipeline/tests/` pin known values
(checked against https://grf.farm/iron-horse/ docs) and will flag unexpected changes.

## Accuracy notes

- Money formulas use the GRF basecost shifts Iron Horse sets (engines ÷4, wagons ×2,
  running steam ÷4, diesel ÷16) on top of vanilla base prices.
- FIRS `price_factor` → NewGRF base payment: `price_factor × 2^21 / 51000` (NML conversion).
- Cargo payment time penalties are in transit periods of 2.5 game days, not days.
- Inflation is off by default: Iron Horse refuses to load with inflation enabled.

## License

GPL-2.0-only — see [LICENSE](LICENSE). The calculator redistributes data and artwork derived
from GPL-2.0 projects, so the same terms cover this repository as a whole.

Derived material and its sources:

- Vehicle stats and buy-menu sprites — [Iron Horse](https://github.com/andythenorth/iron-horse)
  4.29.0, © andythenorth and contributors.
- Industry, cargo and economy data — [FIRS](https://github.com/andythenorth/firs) 5.2.0,
  © andythenorth and contributors.
- Vanilla vehicle/cargo tables, economy and physics formulas, Russian setting and cargo names —
  [OpenTTD](https://github.com/OpenTTD/OpenTTD) 15.3, © the OpenTTD team.
- Vanilla-mode vehicle sprites, cargo icons and the interface palette —
  [OpenGFX2 Classic](https://github.com/OpenTTD/OpenGFX2) 0.8.1, © the OpenGFX2 authors.
- Russian FIRS translation — [firs-ru](https://github.com/ChronosXYZ/firs-ru), a fork of
  FIRS 5.2.0.
- Tab icon — the [OpenTTD](https://github.com/OpenTTD/OpenTTD) logo (the diamond and its
  "OPEN TTD" banners), © the OpenTTD team; the locomotive silhouette in place of the dollar
  sign is AI-generated and the `tools` wordmark is set in OpenTTD's own interface font.

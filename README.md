# OTTD Tools

Calculator for OpenTTD with the Iron Horse (Pony roster) and FIRS 5 NewGRF sets:

- **Consist builder** — assemble a train from the full Iron Horse catalogue: power, tractive
  effort, weight, capacity, purchase price, running costs, top speed on flat/grade
  (realistic acceleration physics reproduced from OpenTTD sources).
- **Route income** — exact `GetTransportedGoodsIncome` reproduction with FIRS payment rates
  and time-penalty curve chart.
- **FIRS chains** — interactive cargo-flow graph per economy (graphviz WASM), industry and
  cargo cards with input/output ratios.
- **Profitability** — consist + route + cargo combined into profit per year / per train tile.

## Layout

- `pipeline/` — Python extractors: import Iron Horse and FIRS sources directly (no NewGRF
  compilation) and emit static JSON into `web/src/data/` + cargo icons into
  `web/public/icons/`. Generated JSON is committed, so the web app builds without Python.
- `web/` — React 19 + Vite SPA. Game formulas live in `web/src/engine/` as pure TS with
  vitest tests.
- `vendor/` — shallow clones of source repos (not committed, `make fetch`).

## Commands

```sh
make fetch   # clone iron-horse (pinned tag), firs, openttd into vendor/
make venv    # python venv + Pillow + Chameleon
make data    # regenerate JSON from vendor sources + validate
make data-images  # render Iron Horse spritesheets + cut per-vehicle sprites (slow-ish)
make dev     # vite dev server
make test    # pipeline regression tests + vitest formula tests
make build   # production build
make verify  # data + test + build
```

## Data update

Bump `IRON_HORSE_REF` in the Makefile (and/or `git -C vendor/firs pull`), then
`make data && make test`. Regression tests in `pipeline/tests/` pin known values
(checked against https://grf.farm/iron-horse/ docs) and will flag unexpected changes.

## Accuracy notes

- Money formulas use the GRF basecost shifts Iron Horse sets (engines ÷4, wagons ×2,
  running steam ÷4, diesel ÷16) on top of vanilla base prices.
- FIRS `price_factor` → NewGRF base payment: `price_factor × 2^21 / 51000` (NML conversion).
- Cargo payment time penalties are in transit periods of 2.5 game days, not days.
- Inflation is off by default: Iron Horse refuses to load with inflation enabled.

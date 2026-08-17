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

### Fixed

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

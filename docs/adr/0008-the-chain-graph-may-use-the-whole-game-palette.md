# ADR-0008: Inside the chain graph, the whole game palette is allowed

- Status: accepted
- Date: 2026-09-05
- Change: `openspec/changes/redraw-firs-chain-graph`

## Context

The skin is checked on the rendered page: every colour on screen has to be one of the base
set's interface colours — the sixteen gradients and the named GUI colours, 133 in all. The
check is what keeps a library default or a browser stylesheet from slipping a foreign colour
into a window meant to look like the game's.

The chain graph paints cargos in their game colours: the palette index FIRS assigns each
cargo per economy, the one the game uses in station ratings and graphs. Those indexes are
drawn from the full 256-colour palette, and only 39 of the 65 FIRS uses fall inside the
interface subset. Quantising them to the nearest interface colour would make the graph lie
about the one thing its colours are for — matching the game and the set's documentation.

## Decision

Within the graph canvas, any colour of the game's palette (`game_palette.json`, all 256) is
admissible; outside it the interface subset holds as before. The colours the graph paints are
still the game's — the check is widened, not lifted: a colour outside the palette fails inside
the graph as anywhere else, and the exemption list stays empty.

## Consequences

- `game_palette.json` joins the data set, written from `table/palettes.h` by the vanilla
  extractor; cargo records carry a palette index per economy.
- The visual checks carry two admissible sets, keyed on the canvas subtree; the chart check
  for the graph names the skin's tokens plus the cargo colours of the set's economies.
- The badge lettering comes from the palette too — its darkest and lightest entries — so the
  rule holds without a special case for black and white.

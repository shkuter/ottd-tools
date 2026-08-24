# ADR-0003: The tables are ours, not a library's

- Status: accepted
- Date: 2026-08-24
- Change: `openspec/changes/unify-tables`

## Context

Three tabs listed rows three different ways. The optimizer built its table out of Mantine
`Table` with a `SortableTh` of its own (up to 23 columns, three-state sorting, "show 15 more"),
the catalogue used `mantine-datatable` (10 columns, two-state sorting, pages of 50, pinned first
and last column), and industry supply used a bare `Table` with no frame at all. Two sorting
implementations, two ways of paging, two sets of table CSS.

Unifying them meant choosing what the shared table is built on. `mantine-datatable` brings
pagination, `pinFirstColumn` / `pinLastColumn` and a sortable header for free, and the catalogue
already depended on it: 90 KB of its 94.7 KB chunk.

What it costs is less visible. It declares a cascade layer of its own, so `layers.css` has to
name it or the library outranks the skin by layer order — something no amount of specificity can
undo. It describes a table as a list of columns, which cannot express the optimizer's header,
where "Engine" and "Wagons" each span two columns. And it renders a scroll area whose edges fade
under a translucent black gradient, a thing the game does not have, which the skin already had
to switch off.

Of the three features bought, only the pins survive scrutiny: pagination was deliberately kept
different per tab — 50 ranked rows have nothing to page through, 167 filtered vehicles do — and
a sortable header is a click handler and a caret.

## Decision

The shared table is Mantine `Table` plus a small set of our own parts in
`web/src/components/table/`: a frame (border, horizontal scrolling, pinned edge columns, empty
state) and a `SortableTh`, with `sortRows` / `nextSort` generic over the row type. Each page
still writes its own rows. `mantine-datatable` is dropped from the dependencies, from
`layers.css` and from the skin.

Pinning is `position: sticky` on the edge cells; pagination is `Pagination` from
`@mantine/core`, which the skin already paints — `mantine-datatable` drew it with the same
component.

## Consequences

- The optimizer gains pinned edge columns, which it needed more than the catalogue did: with 23
  columns, scrolling right used to lose which row was which.
- The catalogue's sorting gains its third click ("back to the year"), because it now runs
  through the same `nextSort` as the optimizer, and its header carets follow the game — marked
  on the active column only, rather than on every sortable one.
- Table CSS lives in one place. It had been split between `index.css` and `skin-mantine.css`,
  both inside `@layer app`, at equal specificity: the skin won on import order, so the metrics
  in `index.css` were dead code that still read as the source of truth.
- No sticky header anywhere. The rules were there — `position: sticky; top: 0` on the header —
  but neither tab ever had one: `overflow-x: auto` on the wrapper makes the browser compute
  `overflow-y: auto` too, so the header sticks to a container that does not scroll vertically.
  Checked in a browser against the production build: scrolling the page moved the header by
  exactly the scroll distance on both tabs. The rules are removed rather than repaired —
  keeping a header in view would mean a fixed-height list with its own scrollbar, which is a
  change to how the pages read, not a fix.

## Alternatives considered

- **Move every tab onto `mantine-datatable`.** Rejected: its column model has no place for the
  optimizer's spanning headers, and the library would still sit in a layer the skin has to
  fight, for pagination two of the three tabs do not want.
- **Leave the tables as they are and unify only the behaviour.** Rejected: sorting would stay
  implemented twice, and every skin rule would keep being written twice — once for our markup,
  once for the library's.
- **Give the tables a fixed height so the header can stick.** Rejected here, kept as an option:
  it is closer to the game, where a list is a window of fixed height with its own scrollbar, but
  it changes how every page reads and belongs in a change of its own.

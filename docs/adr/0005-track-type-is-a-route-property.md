# ADR-0005: The track type is a property of the route, not a filter on the vehicles

- Status: accepted
- Date: 2026-08-28
- Change: `openspec/changes/track-type-axis`

## Context

The calculator kept several unrelated answers to "what track does this route run on": a coarse
family filter `calc.trackType` (RAIL / NG / METRO) on the settings tab, an "electrified line"
flag stored twice over — once per tab that searches for consists, in the optimizer's store and
again in the industry supply store — and a local family filter on the consist builder. None of
them is what the game asks. In the game a route runs on a **railtype**: a labelled track kind
that states a speed limit, which vehicles it powers and which it merely carries. The precise
labels are already extracted per vehicle (`track_types`, `lgv_capable`, `speed_lgv_*`) but no
calculation reads them — an electro-diesel is indistinguishable from a plain diesel, an HST's
higher speed on LGV track never applies, and vanilla's electric railtype is collapsed into RAIL.

Two facts from the sources shaped the decision. Vanilla and Iron Horse railtypes state **no
speed limit** (`max_speed = 0` throughout) — there the track *raises* speed instead, via Iron
Horse's `speed_on_lgv`. The xUSSR Rails Set the user is moving towards is the opposite: a grid
of track types whose speed limits (60–250 km/h) and electrification systems are the whole
point. A model serving both has to make speed and power a function of the chosen track.

## Decision

The **track type** becomes one axis of the route: a single global choice of railtype, its
control repeated on the computing tabs, all writing the same store. An engine is offered only
where it is **powered**; a wagon needs only to be **compatible**. Effective speed is
`min(vehicle speed on this track, track speed limit)`, where "on this track" selects
`speed_on_lgv` on LGV railtypes; engine power follows the power source the track feeds, so a
dual-power engine loses its electric figure away from the wires. Both copies of the
electrification flag and the consist builder's local filter are absorbed by the choice —
"plain RAIL" *is* an unelectrified line — and are removed by migrating all three stores.
Railtype data (labels, powered/compatible sets, limits) comes from the extractors, vanilla +
Iron Horse now; the xUSSR sets arrive later as data under the same schema.

## Consequences

- Persisted `calc.trackType` values migrate from families to railtype labels (NG → NAAN,
  METRO → MTRO, MAGLEV → MGLV); the flag's own fields leave both tab stores, and a saved
  flag carries into the choice (RAIL + flag → ELRL) as a one-off cross-store step, since the
  flag was never stored beside the track type it qualified.
- Vanilla stops collapsing ELRL into RAIL, so monorail and maglev — offered by the settings
  tab but unreachable through the consist builder's own filter — are reachable through the
  shared choice that replaces that filter.
- Railtype masks are normalised on extraction: NewGRF lists the *other* types a type relates
  to and leaves itself implied, while the vanilla table spells itself out. The extractor adds
  the type to its own masks; without that, narrow gauge and metro would admit no vehicle at
  all — the kind of emptiness that reads as "no vehicles exist yet" rather than as a bug.
- Track construction and maintenance costs, and the curve-speed bonus, stay out of the model:
  the calculator knows the route's distance, not its geometry (ADR-0004 cuts the same way —
  no hand-entered track speed limit either; limits come from the set's data or not at all).
  **Superseded for the costs by [ADR-0006](0006-owning-track-costs-what-the-player-counted.md):**
  they are in the model, priced from counts the player states rather than from geometry the
  calculator would have to infer. The curve-speed bonus stays out.
- `purchaseKey()` and the catalogue keep grouping by **track family** — the family stays in
  the data as what Iron Horse states speeds and capacities by; it just no longer stands in
  for the track type.

## Alternatives considered

- **A per-tab choice, each tab holding its own.** Rejected for the reason ADR-0002 removed the per-tab
  economy: two tabs disagreeing about the line they price is a bug, not a feature. Repeating
  the control while sharing the store keeps the convenience without the disagreement.
- **Keeping `allowElectric` beside the track type.** Rejected: it is the same question asked
  twice, and the pair admits contradictions (an electrified narrow-gauge flag on a set that
  has no such track).
- **A hand-entered speed limit for sets the calculator has no data for.** Rejected under
  ADR-0004: the calculator assumes nothing it cannot read from data, and a guessed limit
  poisons every number downstream while looking authoritative.

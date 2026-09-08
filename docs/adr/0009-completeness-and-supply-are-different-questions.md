# ADR-0009: Chain completeness and supply are different questions

- Status: accepted
- Date: 2026-09-08
- Change: `openspec/changes/add-chain-completeness`

## Context

The FIRS tab already answers one question about a chain: pick a target, and the "supply chain"
list says what has to be hauled into it, with the imported game marking each task `supplied`,
`idle` or `absent` (`gameChain.ts`). A second question was asked of the same screen — whether
the map the generator made can support a chain at all. On a compact map a secondary can stand
with no producer of its inputs anywhere, and no amount of track will fix that.

Both questions read the same two things — the industries of the savegame and the edges of the
economy — and both end up saying "this industry is not producing". The temptation was to fold
them into one verdict per industry, with the routes of the save as one more input: an industry
would be complete when its inputs exist *and* something hauls them.

They are not the same question. "Nothing hauls iron ore here" is a job for the player and is
fixed with a train. "There is no iron ore mine on this map" is a property of the map, fixed
only by funding an industry or by playing elsewhere. A single word covering both would report
a buildable route and an unbuildable one identically, and the ordering that makes the supply
list useful — cheapest leg first — is meaningless for a gap no leg can close.

## Decision

Completeness is computed from **what stands on the map**, and from nothing else. Routes,
stations and vehicles of the savegame are not read by it; distances are not measured. It
produces three lists — **chain gaps** (an industry whose inputs cannot be had here at all),
**dead ends** (an industry whose output nothing on this map accepts) and a separate note about
the supply cargoes — and it lives beside the supply chain list, not inside it, with the two
linked rather than merged.

The measure is the **reachable share**, not a present/absent flag: FIRS states "any three of
five" as five inputs of ratio 3 against a ceiling of 8, so `conversion()` — the function the
supply tab already uses — answers how much of its output an industry can reach here. A
producer counts only if it is itself **workable**, solved bottom-up until it stops changing.

## Consequences

- Two lists on one tab say "this industry is idle" for different reasons, and the interface has
  to keep them apart in wording, not only in position. The glossary carries the split
  (`CONTEXT.md`, "Chain completeness"): **supplied** is about what the player built,
  **workable** about what the generator placed.
- Completeness needs an imported savegame and states nothing without one — there is no hand-
  entered industry list. A map the player has not imported is not a map the calculator can
  reason about, and inventing an input for it would be a second source of truth for the same
  fact.
- Supply cargoes (`ENSP`, `FMSP`, `WELD`, `SEAL`) are excluded from the graph and are reported
  as their own line rather than as gaps: a mine without them runs, just slower — but a map with
  no port has none of them for anyone, which is a fact of the same size as a gap.
- Industries from other GRFs (`catalogueId === null`) can produce a cargo the analysis will
  call unavailable. The lists are still shown, with a note that they may be incomplete —
  ADR-0004 forbids the silent version, and hiding the whole block over one foreign industry
  throws away the part that is right.

## Alternatives considered

- **One verdict per industry, routes included.** Rejected as above: it merges a problem a train
  solves with one a train cannot, and loses the ordering that makes each list actionable.
- **Present/absent per input instead of the reachable share.** Rejected because it misreads the
  set: an appliance factory fed by three of its five inputs runs at full output in game, and
  would have been reported as broken.
- **Counting an industry as a source because it stands on the map, whether or not it can run.**
  Rejected: a map with no mine at all would then look healthy on every floor above steel, with
  the gap visible in one row while the whole upper chain stands idle.

# ADR-0007: The chain graph's layout tuning comes from FIRS, not from us

- Status: accepted
- Date: 2026-09-05
- Change: `openspec/changes/redraw-firs-chain-graph`

## Context

A cargo-flow graph of a FIRS economy is not readable on its own. Steeltown has 43
industries, 62 cargos and close to two hundred edges; laid out as a plain graph it is a web,
and the hub cargos — slag, steel ingots, acid — gather ten edges into one node each.

FIRS solves this for its documentation with hand-written tuning in every economy
(`cargoflow_graph_tuning` in `src/economies/*.py`): which cargos are drawn again beside each
producer or consumer, which industries are "wormholes" that no edge reaches and the badge names
instead ("To Wharf"), which cargos are supplies and go into the industry card as a line, and
how the ranks and clusters sit. None of it is derived; all of it is a judgement of the set's
author about what reads well.

The alternative was a rule of our own — clone a cargo above some number of edges, hide an
industry above some fan-in — with a threshold to pick and a look that drifts from what the
player already knows from grf.farm.

## Decision

The graph is laid out with the tuning the set ships, read by the extractor and handed to the
page as data. An economy that ships no tuning is drawn without clones and without wormholes —
exactly as FIRS draws it. The calculator adds no rule of its own on top.

## Consequences

- The picture matches FIRS's own chart, and a FIRS update that re-tunes an economy changes
  ours with `make data`, without a decision on our side.
- The set's vocabulary — clone, wormhole, supply cargo — is our vocabulary (`CONTEXT.md`).
- A simpler economy stays a simpler picture; nobody tunes it by hand here. The place to
  improve a layout is upstream.
- Supply cargos (farm and engineering supplies, welding consumables, seals) are lines in an
  industry card, not nodes: the extractor takes the list from FIRS's `doc_helper`, and the
  old hard-coded exclusion list is gone.

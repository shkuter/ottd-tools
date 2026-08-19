# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase. This repo is **single-context**: one `CONTEXT.md` at the root, one `docs/adr/`.

## Before exploring, read these

- **`CLAUDE.md`** at the repo root — the standing brief: architecture, commands, critical
  invariants (basecost shifts, FIRS price factors, length units), versioning rules.
- **`CONTEXT.md`** at the repo root, if it exists — the domain glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`openspec/specs/`** — capability specs kept by the OpenSpec workflow; the closest thing this
  repo has to written requirements. `openspec/changes/` holds in-flight proposals.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get
resolved.

## File structure

```
/
├── CLAUDE.md                 ← standing brief (already present)
├── CONTEXT.md                ← glossary, created lazily
├── docs/
│   ├── adr/
│   │   └── 0001-....md
│   └── agents/               ← this configuration
├── openspec/                 ← specs and in-flight changes
├── pipeline/                 ← Python extractors
└── web/                      ← React SPA (engine/, features/, state/, i18n/)
```

There is no `CONTEXT-MAP.md` and no per-context `src/<context>/docs/adr/` — this is a
single-package repo, so system-wide decisions all live in `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary
explicitly avoids.

Game-domain terms (consist, cargo, wagon, refit, basecost shift, transit period) follow OpenTTD /
Iron Horse / FIRS usage — those upstream sources are the authority, not our paraphrases. In
Russian-language output, cargo and industry names come from `web/src/i18n/*.ru.json`, which is
generated: never invent a translation by hand.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

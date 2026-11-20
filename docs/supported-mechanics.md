# Supported mechanics

POKIE's authored mechanics are finite, validated Blueprint data. This page maps the supported
families; field-level interfaces and limits live in the linked documents. It is an implementation
guide, not a certification.

| Family | Support |
| --- | --- |
| Free games and retriggers | Zero and additive grants, retrigger policies and free-game session state — see [free games](free-games.md). |
| Hold&Win | Flat and entry-bet awards, lock coordinates, reset and exhaustion — see [game session](game-session.md). |
| Jackpots | Fixed and accumulating pools, contribution, award and reset — see [game session](game-session.md). |
| Bet modes | Base, ante and explicit purchase status — see [game session](game-session.md). |
| Screen modifiers and wild variants | Expanding, sticky, restricted, multiplier, transform and reel rules — see [authored wilds](math-modeling.md#authored-wilds-and-screen-modifiers). |
| Cascades, respins and collections | All seven nonempty combinations with bounded terminal/progression behavior — see [feature chains with limits](feature-chains.md). |
| Weighted bonus outcomes | Finite outcome tables with weights, payout units and duration — see [weighted bonus](weighted-bonus.md). |
| Resizable grids and geometry | Generated, visible and evaluated screen ownership — see [resizable grid](resizable-grid.md). |
| Artifacts and interchange | Generated TypeScript/CJS packages, PAR workbooks, extraction and WASM — see [game packages](game-packages.md). |
| Simulation and replay | Seeded simulation, reports, round records and audit replay — see [simulation](simulation.md) and [round records](round-records.md). |

Custom executable code, arbitrary callbacks and unsupported compositions remain explicit extension
boundaries. They are not implied by a supported authored family.

## Advanced declared-model analysis

The advanced declared-model boundary records each source/mechanic connector, initial-state and numeric
assumptions, supported checks, all-path termination semantics and unsupported persistent state.
Blueprint runtime handlers are reused; custom executable fidelity is never inferred from descriptor
completeness. Exhausted analysis budgets remain unknown, distinct from runtime respin caps and cascade
limit rejection. CLI/Studio/definition diff retain the same report and witnesses.

The ordinary lines/ways/clusters math kernel is shared between generated Node and WASM.
ABI 3.0 uses one i32 stop per reel, supports models above the former 30-bit total and binds exact
executable bytes to the effective model and component descriptor. Fractional components multiply
before addition; ways/clusters retain selected-group aggregation. Portable consumers still expose
amount-only analytics, without invented feature events. See
[WASM limits and continuation](wasm-compatibility-boundary.md).

## Portable feature execution

Portable feature execution is exercised by the saved native public-runtime and browser suites.
They generate real packages and artifacts, compile all generated TypeScript, and use fresh root ESM
and `require(esm)`, browser and wasm exports. Independent amounts, screens, feature progress,
settlement, selected identity, JSON restoration, replay and next RNG are checked at meaningful
boundaries.

This does not widen incompatible compositions, custom code/services, PAR geometry, or paid-grid
outcome-library/Stake targets. See [the current WASM boundary](wasm-compatibility-boundary.md).

PAR fidelity coverage reopens actual XLSX workbooks for every existing mechanic, bounded
progression composition, modifier and weighted bonus in the authored catalogues, using exact/weighted
reel sequences and fractional bets. Represented hashes, Game Model view and seeded
runtime/restoration are checked together. Empty optional arrays canonicalize to absence; empty
paytable symbol maps are represented by symbol-only rows. Geometry/custom mechanics/unknown policies
are rejected rather than treated as lossless.

PAR lossless eligibility also excludes ignored headerless data, duplicate columns, unknown or
duplicate Meta keys and ignored Meta columns, even when the represented math hash matches. Studio draft
re-export keeps the server's byte-bound import history across restart; unprepared/edited drafts or an
ineligible import cannot restore a lossless claim. Import and re-export do not implicitly save the
draft.

## Certification pack preparation

certification pack preparation adds versioned certification pack sections through the existing builder/verifier,
trusted model rules and field coverage, statistics and executable audit replay when
explicitly supplied. Formats are JSON, console text, Markdown, HTML and local selectable-text PDF.
Partial/custom/unknown model trusted source remains visible. Outcome-only certification packs cannot establish
originating rules; SDK/fairness evidence is explicitly unavailable. YAML is optional and
unimplemented. This is assessment preparation, not certification. See
[the certification pack interface](certification-pack.md).

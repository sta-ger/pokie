# Mechanics and support

## Authored math

Blueprint supports declared lines, ways, clusters, mixed evaluation, scatter awards, free games, bet modes, geometry, wild variants, modifiers, jackpots and bounded progression features such as cascade, respins, collection and weighted bonus. Support is composition-specific. Missing paytable entries and explicit zero payouts/grants retain distinct authored meaning; fractional stakes such as 0.05, 7.5 and 1e-7 must not be rounded away.

The current [authored workflow catalog](../../src/generated/AuthoredWorkflowSupportCatalog.ts), [bounded mechanics guide](../../docs/bounded-mechanics.md), [weighted bonus guide](../../docs/weighted-bonus.md) and [launch support matrix](../../docs/v2-completion/launch-mechanics-support.md) describe field/composition limits. The catalog, source planner and actual preflight are authoritative; historical receipts do not grant capabilities.

## Format support

| Source / surface | Current authority and supported use | Limits beside the workflow |
| --- | --- | --- |
| Blueprint | Editable authored declarations; validation, generated Node runtime and supported build targets | Recognized model does not guarantee every target; unsupported compositions return diagnostics |
| Custom TypeScript package | Its executable session and declared capabilities; CLI/Studio can load it directly | Complete declared model is needed for extraction; descriptor completeness alone does not establish executable fidelity or tuning permission |
| Native Outcome Library | Stored weighted outcomes, exact native distribution and seeded selection | Distribution is only the retained library, not necessarily the originating game's logical rounds; cannot reconstruct authored reels/code |
| Stake | Native books/events and uint64 decimal-string weights with mode cost | Tiny positive probabilities retain integer precision; only compatible POKIE exports can reconstruct a POKIE library; native-only tuned candidates are inspect/analysis authority |
| Canonical PAR | Readback of represented cells/declarations with byte-bound provenance | Lossless status rejects unknown/ignored data, unsupported geometry/mechanics and stale provenance; import does not save a Studio draft |
| Canonical WASM | Integrity-bound component and declared ABI/runtime capabilities; supported authored features and whole sequences | Sidecar binding is required; legacy manifest-only components are inspection-only; custom code/services are not compiled; serve is unavailable |
| Optimizer | Source-specific finite tunables and an explicit supported population | Execution, extraction or generic capability labels do not authorize edits; advanced stateful populations remain unsupported |

## Reel design versus execution

`pokie reel generate BLUEPRINT --seed 28` previews declared `reelStripGeneration` constraints. The Blueprint must contain generated-reel specifications; a plain literal model is not such an input. `--apply` explicitly pins strips into authored data; `--out NEW_FILE` selects a separate saved Blueprint. Inspect diagnostics for impossible counts, adjacency or gaps and change the constraints rather than assuming a partial solution succeeded. [Reel generation guide](../../docs/reel-strip-generation.md).

[Whole-sequence reels](weighted-sequences.md) choose a complete alternative at runtime and are not materializable by a single-strip operation. [Extraction](extraction.md) and [optimization](optimization.md) likewise retain their own authority requirements. [Interop](interop.md) describes conversion and numeric-fidelity boundaries.

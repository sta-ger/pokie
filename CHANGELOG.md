# Changelog

## 2.0.0

- Math-first JavaScript/TypeScript runtime with a local Studio for authoring, validating, simulating and building games.
- `GameBlueprint` JSON as the main game-design format, with `create`, `edit` and `init` workflows.
- `pokie build` converts a game design into a TypeScript game package, an outcome library, a Stake Engine export, a PAR workbook or a WASM build.
- Authored free games, bet modes, Hold & Win, jackpots, cascades, resizable grids, weighted bonuses and screen modifiers.
- Seeded simulation, parallel workers, adaptive early stop, exact weighted-outcome analysis and finite math optimization.
- One public vocabulary: `GameBlueprint.info`, `RoundRecord`, `CertificationPack`, `FeatureChains`, `OutcomeLibraryFolder` and `ExternalExport*`. On-disk indexes use `index.json`; POKIE-produced Stake exports use `pokie-info.json`.
- Round records, reproducible replay, audit records, commit-reveal fairness proofs and certification packs.
- Single ESM library build and declarations, with Node `require(esm)` compatibility; ESM-only browser, WASM and player subpaths.
- Local/reference HTTP server with replaceable session storage and wallet connectors. Not a casino backend or RGS.
- Release checks audit both the repository lockfile and the installed tarball; all dependency overrides were removed, and unresolved development-tooling advisories are reported rather than hidden.
- Directory publication uses `mv --exchange` where available and a same-directory rename fallback elsewhere, so replacing an existing build output no longer requires GNU coreutils 9.5+.
- Documentation is user-facing only; the package no longer ships contributor, testing or frontend implementation guides.
- PAR workbooks use `@xlvane/exceljs`, a dependency-light ExcelJS-compatible API. POKIE 2.0 requires Node >=22.12.0.

Independent RNG certification, regulatory compliance and production operator integration remain outside POKIE's scope.

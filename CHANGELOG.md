# Changelog

## 2.0.0

- Math-first JavaScript/TypeScript runtime with a local Studio for authoring, validating, simulating and building games.
- `GameBlueprint` JSON as a first-class source format, with `create`, `edit` and `init` workflows.
- Canonical `pokie build SOURCE --target TARGET` conversions for Blueprints, TypeScript packages, Outcome Libraries, Stake Engine adapters, PAR workbooks and WASM modules.
- Authored free games, bet modes, Hold & Win, jackpots, cascades, resizable grids, weighted bonuses and screen modifiers.
- Seeded simulation, parallel workers, adaptive early stop, exact weighted-outcome analysis and finite math optimization.
- Round artifacts, deterministic replay, audit records, commit-reveal fairness proofs and certification evidence bundles.
- Single ESM library build and declarations, with Node `require(esm)` compatibility; ESM-only browser, WASM and player subpaths.
- Local/reference HTTP server with replaceable session storage and wallet ports. Not a casino backend or RGS.
- Release checks audit both the repository lockfile and the installed tarball; unresolved development-tooling advisories are reported rather than hidden with overrides or vendored forks.
- Documentation is user-facing only; the package no longer ships contributor, testing or frontend implementation guides.
- PAR workbooks use the maintained `exceljs-community` 4.6.1 fork so the published production dependency tree contains no known vulnerable package.

Independent RNG certification, regulatory compliance and production operator integration remain outside POKIE's scope.

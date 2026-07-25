# POKIE Documentation

**POKIE** is a server-side video slot game logic framework for JavaScript/TypeScript. This folder is the API
reference: what every class/interface does, its constructor and methods, and how to configure or replace it.

For installation and a quick taste of the API, see the [main README](../README.md). For end-to-end example games,
see [pokie-examples](https://github.com/sta-ger/pokie-examples).

**Scope:** POKIE is a game-logic library, not a casino backend — it doesn't ship an RGS, a real wallet/ledger
system, a compliance/audit platform, a key-management service, or a timestamping authority. It computes what a
round's outcome and win are, and provides deterministic, independently verifiable tooling on top of that (replay,
weighted-outcome analysis, provably-fair commit-reveal proofs); wiring any of it into an account, currency, or
compliance system is left to the integrating backend. The one exception is `pokie serve`/`pokie dev` (see
[CLI](cli.md), item 18 below): an explicitly **experimental, dev/reference-only** HTTP transport with a
replaceable, in-memory-by-default `SessionRepository` and `WalletPort` — useful for local development and
previewing a game, but neither a substitute for a real backend nor RGS-grade in any sense.

## Contents

1. **[Getting Started](getting-started.md)** — install, create a session, play a round, read the results.
2. **[Game Session & Configuration](game-session.md)** — `GameSession`/`GameSessionConfig` (bet, credits, generic
   play loop) and `VideoSlotSession`/`VideoSlotConfig` (symbols, wilds, scatters, reels).
3. **[Reels & Symbol Sequences](reels-and-sequences.md)** — `SymbolsSequence` (a reel strip), `SymbolsCombination`
   (a spin result), the combination generators (fixed, variable-height, resizable), RNGs, and
   `SymbolsCombinationsAnalyzer` (grid analysis and transform utilities).
4. **[Paylines & Line Patterns](paylines-and-patterns.md)** — line definitions (grid shapes), line patterns
   (left-to-right / right-to-left / scattered matching), and presets.
5. **[Paytable & Win Calculation](paytable-and-wins.md)** — `Paytable`, `VideoSlotWinCalculator`, the line/scatter/
   cluster/value/ways win calculators, and per-symbol wild substitution.
6. **[Free Games](free-games.md)** — `VideoSlotWithFreeGamesSession`/`VideoSlotWithFreeGamesConfig` and how a free
   games (bonus) round is tracked and paid out.
7. **[Resizable Grid](resizable-grid.md)** — `VideoSlotWithResizableGridSession` and per-reel height changes between
   rounds, for features that grow or shrink the grid.
8. **Bet Modes** (`src/session/videoslot/betmode/`) — `BetMode.runtimeType` (`"base"`/`"ante"`/`"buyFeature"`) is an
   opt-in, all-or-nothing runtime-semantics contract on top of the otherwise purely-declarative `BetMode`
   metadata: an `"ante"` mode's `costMultiplier` is an always-applied extra stake, a `"buyFeature"` mode forces
   entry into `mechanics.freeGames` for its own configured `forcedFreeGames` count. `VideoSlotWithBetModesSession`
   composes this over any existing session (via `ForcedFeatureEntryHandling`/`PerModeForcedFeatureEntryHandler`),
   `GameBlueprintValidator` enforces "opt in completely, never half-specified," and a mode's own `targetRtp` flows
   through to `pokie sim --mode`/`SimulationReportBuilder` for per-mode RTP-deviation reporting (see
   [Simulation](simulation.md) below) and round-trips through [PAR Sheet](cli.md#workbook-format) import/export.
9. **Hold & Win / Lock & Spin** (`src/session/videoslot/holdandwin/`) — `VideoSlotWithHoldAndWinSession` composes a
   respin-until-board-full-or-exhausted collect-and-lock feature onto any existing session, the same
   decoration-not-inheritance shape [Free Games](free-games.md) already uses, rendering locked positions back
   onto each respin's grid via the generic `SymbolOverlayTransformer` primitive and folding the final locked set
   into one payout via `HoldAndWinPayoutAggregating`.
10. **Jackpots** (`src/session/videoslot/jackpot/`) — `VideoSlotWithJackpotSession` composes fixed/local/progressive
    jackpot pools (`JackpotPoolRepresenting` — `FixedJackpotPool`/`AccumulatingJackpotPool`, "local" vs.
    "progressive" is purely a matter of whether a pool instance is shared across sessions, never a different
    class) onto any existing session via pluggable `JackpotContributing`/`JackpotTriggering`/`JackpotAwarding`
    strategies, transparently forwards the wrapped session's own stake/simulation-category signals, and reports
    per-pool award/contribution statistics (`getJackpotPoolStatistics()`) merged correctly across parallel
    simulation workers and chunked runs.
11. **[Simulation](simulation.md)** — `Simulation`/`SimulationConfig`, RTP/volatility/hit-frequency statistics, play
    strategies for driving targeted or bulk simulation runs, the pluggable base/freeGames/custom-category
    feature-level breakdown behind `pokie sim`'s `breakdown` field, worker-thread parallelism via
    `pokie sim --workers`, opt-in convergence/adaptive early stop (`ParallelSimulationRunOptions.convergence`,
    evaluated independently per worker for determinism — see `pokie sim`'s
    [adaptive early stop flags](cli.md#adaptive-early-stop-convergence)), and per-`--mode`
    breakdown/comparison reporting for a multi-bet-mode game.
12. **[Network Serialization](serialization.md)** — turning a session's state into plain-data payloads for a game
    client.
13. **[Round Artifacts](round-artifacts.md)** — `RoundArtifact`/`RoundStepArtifact`, the canonical hashable record
    of a completed round built from already-computed runtime state (no second calculation path), the standard
    `PokieJsonRoundArtifactProjector` JSON projection with a stable content hash, and `RoundArtifactValidator`.
14. **[Weighted Outcome Library](weighted-outcome-library.md)** — `WeightedOutcomeLibrary`, a canonical, hashable
    enumeration of every possible round outcome (each a `RoundArtifact` plus its exact weight), and
    `WeightedOutcomeLibraryAnalyzer`'s exact — no Monte Carlo — RTP/hit-frequency/variance/payout-distribution
    statistics.
15. **[Extension Points](extension-points.md)** — every injectable collaborator in the library, in one table, plus
    `AbstractVideoSlotSessionDecorator` for writing a session wrapper without re-implementing every passthrough
    method.
16. **[Modeling Slot Math with POKIE](math-modeling.md)** — a worked walkthrough of using POKIE to balance RTP,
    hit frequency, and volatility.
17. **[Game Packages](game-packages.md)** — the `PokieGame` contract, `pokie.entry` package.json convention, and
    `loadPokieGame`/`isPokieGame` for loading an external game as a standalone npm package.
18. **[CLI](cli.md)** — `pokie build <config.json>`, which generates a working game package straight from a JSON
    `GameBlueprint` (reels, symbols, paylines, paytable, reel strips — literal, weighted, or build-time generated
    via `reelStripGeneration` and `ReelStripGenerator`), no compile step required; `pokie
    create <name>` (new directory) and `pokie init` (existing project), which scaffold
    a minimal game package; `pokie sim <packageRoot>`, which runs a simulation against one and reports
    RTP/hit-frequency/max-win; `pokie validate <packageRoot>`, which checks the `PokieGame` contract without
    playing it; `pokie inspect <packageRoot>`, which prints a generated package's provenance (game, blueprint
    hash, source, timestamp, `pokie` version) from `package.json`/`build-info.json` without running it; `pokie
    report <simulationReportJson>`, which renders a `pokie sim --out` report as Markdown or
    HTML; `pokie diff <leftReportJson> <rightReportJson>`, which compares two `pokie sim --out` reports;
    `pokie replay <packageRoot>`, which best-effort replays one round (by seed + round index) as a JSON artifact;
    `pokie serve <packageRoot>` (experimental), which starts a local/dev JSON HTTP server over a package — not a
    casino backend or RGS; `pokie client <packageRoot>` (experimental), a universal browser preview UI talking to
    a running `pokie serve`; `pokie dev <packageRoot>` (experimental), which runs both together; `pokie par
    import <input.xlsx>`, which imports a PAR sheet XLSX workbook (symbols, literal reel strips, paytable,
    paylines, available bets, win model, mechanics, and bet modes) into a `GameBlueprint` JSON file; `pokie par
    export <config.json>`, which exports a `GameBlueprint` back to a PAR sheet XLSX workbook; `pokie stakeengine
    export <config.json>`, which exports one or more `WeightedOutcomeLibrary` JSON files to the Stake Engine
    math-sdk static file format; `pokie stakeengine import <stakeDir>`, which imports one back; `pokie stakeengine
    analyze <stakeDir>`, which validates and computes exact weighted statistics over any Stake Engine outcome
    directory with no `pokie-manifest.json` required; `pokie
    outcomelibrary build <config.json>`, which builds a canonical Outcome Library Bundle from one or more
    `WeightedOutcomeLibrary` JSON files; `pokie outcomelibrary validate <bundleDir>`, which validates one; `pokie
    certification build <bundleDir> <config.json>`, which builds a certification/evidence bundle on top of an
    Outcome Library Bundle; `pokie certification verify <certDir>`, which verifies one against its live source
    bundle; `pokie fairness seed-commit <serverSeed.txt>`/`commit`/`reveal`/`verify`, the full Provably Fair
    commit-reveal CLI workflow (see item 26 below); and `pokie`/`pokie studio` (experimental), a local GUI
    covering most of the commands above (Create/Init, the Mechanics Editor, Outcome Libraries, PAR Sheet,
    Certification, Provably Fair, Stake Engine export, Deployment, Runtime, Replay, Simulation) — see
    [`studio-frontend.md`](studio-frontend.md) for its own React + Mantine frontend stack and dev workflow.
19. **[Reel Strip Generation](reel-strip-generation.md)** — `ReelStripGenerator`, generating a reel strip's fixed
    symbol sequence under constraints (exact counts, minimum/maximum circular distance, max run length, forbidden/
    required adjacency and exact-sequence patterns — directed/reversed matching, wrap-around — locked positions)
    either from exact counts or from proportional `symbolWeights` (via
    `LargestRemainderReelStripSymbolWeightsConverter`), and `ReelStripAnalyzer` for inspecting any strip. A
    design-time tool, separate from the runtime spin path.
20. **[Pre-Generated Runtime](pregenerated-runtime.md)** — `WeightedOutcomeSelector`, drawing a single round
    deterministically from a `WeightedOutcomeLibrary` (seed/RNG-injected, no game calculation path involved),
    `buildPreGeneratedRoundResult`/`PreGeneratedRoundResultValidator` for the runtime result this produces,
    `PreGeneratedRoundResultProjector` for its public/internal response split, `PreGeneratedRoundReplayer` for
    exact (not best-effort) reconstruction of a past round, and `PreGeneratedSpinCommandHandler`/
    `PokieDevServer`'s additive `/pregenerated-sessions` routes for serving it over HTTP with idempotency.
21. **[Stake Engine Export](stake-engine-export.md)** — exporting a canonical `WeightedOutcomeLibrary` (one per
    bet mode) to the real Stake Engine math-sdk static file format (`index.json`, per-mode lookup CSV, zstd-
    compressed JSONL books), `StakeEngineRoundEventsProjector`'s generic `RoundArtifact` → Stake "events"
    mapping, and `StakeEngineExporter`/`StakeEngineExportValidator`.
22. **[Stake Engine Import](stake-engine-import.md)** — reconstructing a `WeightedOutcomeLibrary` back from a
    Stake Engine export directory via `StakeEngineImporter`/`StakeEngineRoundEventsImporter`, the disclosed
    lossy-vs-lossless boundary (`roundId`/win breakdown/`provenance.pokieVersion` are substituted, everything
    else round-trips exactly), and the real round-trip property: import then re-export reproduces byte-identical
    Stake output.
23. **[Stake Engine Standalone](stake-engine-standalone.md)** — reading, validating, and computing exact weighted
    statistics over **any** Stake Engine outcome directory, with no `pokie-manifest.json` involved at any point:
    `StakeEngineOutcomeSourceReader` normalizes `index.json`/CSV/books into canonical `StakeEngineOutcomeRecord`
    DTOs (deliberately not a `RoundArtifact`/`WeightedOutcomeLibrary`), `StakeEngineStandaloneValidator` checks
    structure/cross-file consistency, and `StakeEngineStandaloneAnalyzer` computes `rtp`/`hitFrequency`/variance/
    payout-distribution plus a pluggable-classifier-driven event breakdown (`StakeEngineEventClassifying`) — see
    `pokie stakeengine analyze <stakeDir>`.
24. **[Outcome Library Bundle](outcome-library-bundle.md)** — the canonical, streaming-friendly on-disk
    persistence format for a `WeightedOutcomeLibrary` (a small manifest, a small per-mode index, one streaming
    JSONL outcomes file per mode), with a writer that never buffers a whole mode's outcomes as one string, a
    reader with full-streaming/single-outcome-random-access/weighted-draw/whole-library modes, and the one
    shared `loadWeightedOutcomeLibraryFromBundle` loader both the pre-generated runtime and the Stake Engine
    exporter use.
25. **[Certification/Evidence Bundle](certification-evidence-bundle.md)** — building a deterministic evidence
    package on top of an Outcome Library Bundle (game/library hashes, provenance, exact weighted metrics, the
    source bundle's own deep-validation diagnostics, and deterministically sampled/individually verifiable
    `RoundArtifact` records), with `CertificationEvidenceBundleBuilder`/`Validator`/`Verifier` and
    `pokie certification build`/`pokie certification verify`.
26. **[Provably Fair](provably-fair.md)** — a commit-reveal proof for a single round drawn from an Outcome
    Library Bundle: `FairnessServerSeedCommitment` (published before `clientSeed`/`nonce` are known),
    `FairnessCommitment` (the round commitment, pinning `clientSeed`/`nonce`/library/mode before selection),
    `FairnessRoundProof` (the revealed round, deterministically drawn via a pinned-snapshot HMAC-SHA256 byte
    stream and bound to its commitment via `commitmentHash`), and `FairnessCommitmentValidator`/
    `FairnessRoundProofValidator`/`Verifier` for independently checking one, with the full CLI workflow
    `pokie fairness seed-commit`/`commit`/`reveal`/`verify`. POKIE provides these deterministic/verifiable
    primitives only — it is not an RGS, wallet, compliance platform, key-management service, or timestamping
    authority (see this file's own "Scope" note above).
27. **[External Adapter SDK](external-adapter-sdk.md)** — a generic set of contracts (`ExternalDeploymentTarget`,
    `ExternalRoundProjector`, `ExternalArtifactGenerator`, `ExternalArtifactValidator`,
    `ExternalDeploymentDiagnostic`, an optional `ExternalDeploymentRuntimeAdapter` transport contract) for
    deploying a `WeightedOutcomeLibrary` to an external format/RGS-style target, orchestrated end to end by
    `ExternalDeploymentService` (descriptor validation → compatibility validation → projection → generation →
    artifact validation → optional diagnostic → optional delivery, stopping at the first error or caught
    exception). The three built-in validators always run in full and can never be replaced — only an *additive*
    extra validator per stage is accepted — and projection (`RoundArtifact` → target format) is the service's
    own job, never the generator's, which is why `ExternalArtifactGenerator` only ever receives already-projected
    plain JSON. Plus `ExternalDeploymentTargetRegistry` (descriptor-validated, duplicate/case-collision-safe,
    identity-frozen registration) and one fully working local-filesystem example target,
    `createLocalJsonExternalDeploymentTarget` (atomic delivery, deterministic path-safe file naming). Ships no
    private RGS integration; implement the contracts directly for a real target.

## Core concepts at a glance

| Concept | Where |
|---|---|
| Placing bets, tracking credits, "can I play another round" | `GameSession` / `GameSessionConfig` |
| Reel strips, spinning, random symbol windows | `SymbolsSequence`, `SymbolsCombinationsGenerator` |
| Payline shapes and match rules | `LinesDefinitionsDescribing`, `LinesPatternsDescribing` |
| Payouts and what actually won | `Paytable`, `VideoSlotWinCalculator` |
| Free spins / bonus rounds | `VideoSlotWithFreeGamesSession`, `VideoSlotWithFreeGamesConfig` |
| Grids that grow/shrink between rounds | `VideoSlotWithResizableGridSession`, `GridResizeHandling` |
| Ante bet / buy-the-feature runtime semantics, per-mode target RTP | `BetMode.runtimeType`, `VideoSlotWithBetModesSession` |
| Respin-and-collect features (Hold & Win / Lock & Spin) | `VideoSlotWithHoldAndWinSession`, `SymbolOverlayTransformer` |
| Fixed/local/progressive jackpot pools | `VideoSlotWithJackpotSession`, `JackpotPoolRepresenting` |
| Bulk RTP testing, targeted scenario capture | `Simulation`, play strategies |
| Opt-in adaptive early stop once RTP estimation has converged | `ParallelSimulationRunOptions.convergence`, `pokie sim --rtp-tolerance` |
| Sending round results to a client | `net/` serializers, wired into `pokie serve` via `PokieGame.getSessionSerializer()` |
| A sequence of stages within one round (cascades, multi-pick bonuses, ...) | `MultiStageRoundSessionSerializer`, `CascadeSessionSerializer` |
| Loading an external game package by convention | `PokieGame`, `loadPokieGame` |
| Generating a game package straight from a JSON blueprint (no compile step) | `pokie build <config.json>` CLI |
| Importing/exporting a GameBlueprint as a PAR sheet XLSX workbook | `pokie par import <input.xlsx>` / `pokie par export <config.json>` |
| Scaffolding a new game package | `pokie create <name>` / `pokie init` CLI |
| Running a quick RTP/hit-frequency report from the CLI | `pokie sim <packageRoot>` |
| Rendering a sim report as Markdown/HTML | `pokie report <simulationReportJson>` |
| Comparing two sim reports (e.g. before/after a config change) | `pokie diff <leftReportJson> <rightReportJson>` |
| Best-effort replay of a single round (by seed + round index) | `pokie replay <packageRoot>` |
| Local/dev JSON HTTP server over a package (experimental) | `pokie serve <packageRoot>` |
| Browser preview UI for a running `pokie serve` (experimental) | `pokie client <packageRoot>` |
| `pokie serve` + `pokie client` together, with a browser auto-opened (experimental) | `pokie dev <packageRoot>` |
| Local GUI (React + Mantine) covering create/build/validate/sim/replay/serve/deploy (experimental) | `pokie` / `pokie studio [path]`, see [`studio-frontend.md`](studio-frontend.md) |
| Generating a reel strip's symbol sequence under constraints (design-time, not runtime spin) | `ReelStripGenerator`, `ReelStripAnalyzer` |
| Canonical, hashable, storage/audit-grade record of a completed round | `RoundArtifact`, `buildRoundArtifactFromSession`, `PokieJsonRoundArtifactProjector` |
| Exact (no Monte Carlo) RTP/volatility/payout-distribution over every possible outcome | `WeightedOutcomeLibrary`, `buildWeightedOutcomeLibrary`, `WeightedOutcomeLibraryAnalyzer` |
| Exporting a `WeightedOutcomeLibrary` to the Stake Engine math-sdk static file format | `pokie stakeengine export <config.json>`, `StakeEngineExporter` |
| Importing a `WeightedOutcomeLibrary` back from a Stake Engine export directory | `pokie stakeengine import <stakeDir>`, `StakeEngineImporter` |
| Validating/analyzing any Stake Engine outcome directory with no `pokie-manifest.json` required | `pokie stakeengine analyze <stakeDir>`, `StakeEngineOutcomeSourceReader`, `StakeEngineStandaloneAnalyzer` |
| Streaming, canonical on-disk persistence for a `WeightedOutcomeLibrary` (no full-library-in-memory load) | `pokie outcomelibrary build <config.json>`, `OutcomeLibraryBundleWriter`/`OutcomeLibraryBundleReader` |
| Deterministic evidence package (metrics, diagnostics, sampled rounds) on top of an Outcome Library Bundle | `pokie certification build <bundleDir> <config.json>`, `CertificationEvidenceBundleBuilder`/`Validator`/`Verifier` |
| Commit-reveal Provably Fair proof for a single round, independently verifiable against its commitment and a live Outcome Library Bundle | `pokie fairness seed-commit`/`commit`/`reveal`/`verify`, `computeFairnessServerSeedCommitment`, `computeFairnessCommitment`, `FairnessRoundProofBuilder`/`Validator`/`Verifier` |
| Deploying a `WeightedOutcomeLibrary` to a pluggable external format/RGS-style target | `ExternalDeploymentService`, `ExternalDeploymentTargetRegistry`, `ExternalDeploymentCompatibilityValidator`, `createLocalJsonExternalDeploymentTarget` |

Every class implements one or more of `*Describing`/`*Determining` (read), `*Setting` (write), and `*Representing`/
`*Handling` (both) interfaces. Depend on the narrowest one your code actually needs.

## Contributing to POKIE itself

The rest of this folder is the API reference for using the published `pokie` package. If you're working on POKIE's
own source instead, see [`testing.md`](testing.md) for how the test suite is organized (fast/integration/packaging/
release lanes) and how to run it.

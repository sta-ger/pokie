# P9-06 independent cold developer receipt — finding

## Candidate and isolation

- Candidate: `f8737bcbafa436aea5e0b1f9b93b4514491b3710` (checkout HEAD before and after the run).
- Launcher: `node ./dist/cli/pokie.js`; Studio launched from this checkout exactly as `node ./dist/cli/pokie.js --no-open`, never through `node_modules/.bin/pokie`.
- Host: Node `v24.18.0`, npm `11.16.0`. Candidate CLI asset: `dist/cli/pokie.js`, 2,900 bytes, mtime `2026-10-08 23:22:04 +0000`.
- Fresh state: workspace `/tmp/p9-06-valera-aH1ktU/workspace`, supplied project `/tmp/p9-06-valera-aH1ktU/existing project/sample-slot.blueprint.json`, browser profile `/tmp/p9-06-valera-aH1ktU/profile-fresh`, and child-only `HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` below that temporary root. The supplied Blueprint was copied from public `examples/blueprints/sample-slot.blueprint.json`.
- Until freezing the observations below, the collector read only the task charter, public README, public `docs/cli.md`, and public CLI help—not source, tests, prior audit records, or the correction ledger.

## Frozen cold exploration

Commands ran serially in the stated working directory; successful commands emitted no stderr. The eight-command CLI band took 12.5 s wall time in the host runner. Its per-command shell clock was unusable (`date +%s%3N` printed non-epoch values), so that instrumentation limitation is retained rather than fabricated as a product timing.

| Working directory and command | terminal observation | exit |
| --- | --- | --- |
| candidate root: `node ./dist/cli/pokie.js --help` | Listed Studio Home/project entry points, `create`, `build`, `validate`, `sim`, `replay`, and next workflow choices. | 0 |
| candidate root: `node ./dist/cli/pokie.js creat` | `Unknown command "creat". Did you mean \`create\`? Run \`pokie create --help\` for usage.` A post-freeze, affected no-write retest measured 3.761 s real time (3.116 s user, 0.741 s sys). | 1 (documented recovery branch) |
| workspace: `node <candidate>/dist/cli/pokie.js create tiny --random --seed 73 --out 'tiny game.blueprint.json'` | Created `Tiny` (`id: tiny`), generator `1.1.0`, strategy `default-line-pay`; printed its reproducible command. | 0 |
| workspace: `... validate 'tiny game.blueprint.json'` | `valid yes`; `No issues found.` | 0 |
| workspace: `... build 'tiny game.blueprint.json' --target wasm --out 'tiny game.wasm'` | `Build running: Staging portable WASM component`; published `tiny game.wasm`. | 0 |
| workspace: `... 'tiny game.wasm'`; then `... validate 'tiny game.wasm'` | Inspection identified a compatible canonical component with `runtime.play`, `runtime.serialize`, `runtime.replay`, and integrity `sha256:27860667c6b02876b5cb394739870bf999eec7756ea1a9775db01555bf06b4b8`; validation was valid. | 0; 0 |
| workspace: `... run 'tiny game.wasm' --seed valera-73` | `POKIE WASM round 1: draw=0.8682386232540011 seed=valera-73`. | 0 |
| workspace: `... sim 'tiny game.wasm' --rounds 6 --workers 1 --seed valera-73 --format json`; then `... replay 'tiny game.wasm' --round 6 --seed valera-73` | Simulation: 6 rounds, total bet 6, total win 4. Replay: round 6, total bet 6, total win 4, sequence 6, draw count 35. The same-seed/round comparison held. | 0; 0 |

Frozen question and answer: public help made the tiny create/build/validate and canonical WASM run/sim/replay route discoverable; a spaced output path was accepted end-to-end. The typo route supplied public recovery. The timing weakness above is not a product observation.

## Rendered Studio receipt

Studio Home rendered at `http://127.0.0.1:3200/#/home/design` with **Start a game**, **Projects**, **Design Your Game**, and a valid starter model. In **Projects**, the visible supplied path was checked, identified as a Game design, added, and opened. The rendered route was `#/project/%2Ftmp%2Fp9-06-valera-aH1ktU%2Fexisting%20project%2Fsample-slot.blueprint.json/overview`; Overview displayed Sample Slot, its location, and `Valid — no issues found.` This is rendered UI evidence, not an HTTP asset-fetch inference.

The same Studio session then rendered these local terminals:

- **Play:** `New Play session` then `Spin` completed one round: `You won 1.00`, total win `1.00`, line 2.
- **Simulation:** rounds changed from visible default `10000` to `1`; `Run Simulation` completed `1/1` rounds with RTP `0.00%`, correctly warning about no seed and a noisy one-round estimate.
- **Replay:** `Load` prepared round 1; distinct `Run again` rendered `queued — 0/1 rounds`, then `completed — 1/1 rounds`. Local result recorded replay job `facb547e84d84c09b19a74ab26f2debc`, full inspectability/exportability, and total win `3.00`.
- **Outcome library:** Build/Export warned that exact enumeration (184,528,125 combinations) exceeded the cap; its visible Outcome library **Build** completed bounded coverage (5,000 estimated items, 5,120,000 estimated bytes) into isolated `outcomeLibrary`.

## Observed finding: P9-VALERA-PROGRAMMER

Immediately after the successful Outcome library build, the enabled **Stake Engine export** Build control showed `Status: Ready to build` and plan `materialize materializeRuntime → materialize generateOutcomeLibrary → publish publish`. One activation was made. No pending/job lifecycle was rendered; its action-local terminal was:

```
The prepared conversion graph is stale or invalid; prepare a new plan before executing it.
```

This blocks public Studio Stake export after its stated Outcome-library prerequisite succeeded. No retry was sent. The concrete observed root cause is a stale/invalid prepared conversion graph on the dependent Stake export card after Outcome Library materialization: the UI does not refresh or execute its previously-ready plan.

| action-correlation field | rendered evidence |
| --- | --- |
| action | `Build/Export` → `Stake Engine export` → enabled `Build` |
| ready state | `Status: Ready to build`, with the three-stage plan and bounded-coverage prerequisite |
| accepted state | enabled Build activation was accepted; no pending/job record was exposed for this operation |
| terminal state | card-local immediate error quoted above |

## Closure and hygiene

There is no observed closure or clean-state affected retest for this P1: repeating Build would duplicate the unresolved export request and no correction was supplied in this candidate. Independent reachable branches above completed; package/full gates remain deferred. Studio and browser were shut down normally, temporary output trees were not retained in Git, and this receipt is the sole evidence payload.

## Implementer correction — P9-VALERA-PROGRAMMER

The independent receipt above remains the frozen observation of `f8737bcb`; the following is supplementary implementer regression evidence, not an independent browser rerun or replacement receipt.

- Reproduced on base `0b1981ab` using `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeStakeHandoff.test.tsx` (exit 1, 13.155 s). A fresh Blueprint with 100,000 raw combinations published the real default 5,000-sample bounded Outcome Library. Its dependent rendered Stake card's first Build displayed exactly `The prepared conversion graph is stale or invalid; prepare a new plan before executing it.` No retry was issued.
- Cause: `ExportDeployTab` refreshed prepared artifact operations after the advanced Generate action, but not after the ordinary Outcome library Build card completed. The managed library changed the registry's authoritative graph from generation to reuse, while Stake retained the earlier generation handle. The registry's drift rejection was correct.
- Correction: both successful Outcome publication paths invalidate visible artifact previews in the same update as their terminal result, then fetch replacement server plans. Dependent Build controls stay disabled until those plans arrive. Registry graph, source and destination guards remain authoritative; no retry or alternate executor was added.
- Focused retest: `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeStakeHandoff.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx` exited 0: 2 suites, 54 tests, 107.311 s. The new regression uses rendered cards over real Studio HTTP, registry generation/selection/graph validation and Stake publication; only dashboard runtime loading is substituted to avoid package preparation. It delays the actual replacement preview to verify disabled Build, then activates Stake Build once, verifies a new operation handle, a successful durable terminal, the published Stake manifest and borrowed-library provenance, and unchanged prerequisite manifest bytes. Existing tests retain advanced generation, cancellation, conflicts and recovery coverage. The command policy rejected an attempted Jest name filter before execution (exit 126); the complete two-file run above supplies the passing evidence.
- Compiler check: `npm run typecheck` exited 0 and included `npm run typecheck-studio-client`; the Studio compiler was not repeated separately.

| acceptance / accumulated finding | current evidence |
| --- | --- |
| Cold public help, create/build/validate, deterministic WASM run/sim/replay, spaced paths and typo recovery | Frozen serial CLI commands, exits and questions above; retained without another full candidate installation or collection. |
| Studio Home and supplied existing-project startup | Frozen rendered receipt above; retained. |
| P1: dependent Stake Build fails after ordinary bounded Outcome Build | Exact pre-fix failure and post-fix real-service rendered regression described above; one activation publishes Stake using the refreshed reuse plan. |
| Failure/disabled behavior and persisted result | Replacement-preview delay disables Build; existing conflict/cancellation/recovery regressions pass; Stake output and preserved prerequisite manifest are read from disk. |
| Exact committed candidate independent affected retest / consuming production boundary | Controller-owned. The changed production file is consumed by the Studio client compiler and Vite browser bundle. The designated Studio production build (`npm run build-studio-client`, listed under `orchestrator_required_gates` as `build:studio-client`) and independent browser rerun remain with the orchestrator under the bounded repair policy; no build, packaging, full or coverage gate was launched by the implementer. |

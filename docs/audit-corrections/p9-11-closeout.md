# P9-11 candidate-consuming handoff

This is implementation tooling for immutable brief
`27dfbbbd2ef5279d13929ad878c30b00d0ec40e9c4d40553a19284b8416c6a5c`,
on base `bd86dced40a10f6212518b14db951d03c7fb744f`. The task report supplies
the implementation commit. No normal candidate archive/install, external
browser driver/freeze, final smoke or release receipt was supplied to this
worker. Those proofs remain **pending**, not failed product observations.
The [README index](README.md) joins the six defects, five personas and lifecycle
to their retained original records and regression authorities.

The controller prepares one normal production build/pack and real npm install
in its owned release boundary. Both packaging suites accept
`POKIE_P911_CANDIDATE_HANDOFF=<absolute JSON>` and
`POKIE_P911_CANDIDATE_HANDOFF_SHA256=<externally pinned digest>`; the packaging
smoke also retains its existing `POKIE_PACK_SMOKE_*` receipt/archive/candidate
bindings. Do not simultaneously set the P8 handoff. These P9 branches reuse the
archive/installation, preserving the existing installed CLI, npx, API/assets,
ESM/CJS, public workflow, worker, WASM and semantic-failure assertions. Scratch
consumers borrow node_modules and remove only their own directories. The
packaging worker fixture now resolves POKIE from this same installation rather
than checkout dist. Default standalone/P8 packaging paths remain available;
the controller must select the P9 handoff before its one gate to avoid redundant
candidate builds/packs. Do not invoke a P8 readiness wrapper for P9.

The externally pinned handoff JSON has these fields (paths and SHA values are
actual controller values, never values synthesized by the closeout runner):

```text
schemaVersion: 1
kind: p9-11-candidate-handoff
campaignId: pokie-phase-9-audit-corrections
candidateId: exact 40-character source commit
candidateTreeId: exact Git tree object
packageName: pokie
packageVersion: exact package version
archivePath, archiveSha256, executableSha256
installationRoot: existing real npm installation
buildReceipt: { path, sha256 }
installReceipt: { path, sha256 }
browserDriver: { path, sha256 }
```

Both receipts include `issuer`, `receiptId`, `candidateId`, `candidateTreeId`,
`archiveSha256`, `executableSha256`, `exitCode: 0`, `resourcesDrained: true`.
Build receipt kind is `p9-11-normal-build-pack`, with production NODE_ENV in
`environment`, and either `buildCommand: "npm run build"`,
`packCommand: "npm pack --ignore-scripts"`, or the normal prepack pair
`buildCommand: "prepack:npm run build"`, `packCommand: "npm pack"`.
Install receipt kind is `p9-11-npm-install`, with `installationRoot` and
`command: "npm install <archive>"`; retain the real argv/stdout/stderr in the
controller receipt, not just that normalized command label. Trust comes from
the externally pinned receipt/handoff, not a self-declared issuer.

The reader authenticates Git ancestry/tree, protected product/build inputs,
clean checkout, package declaration, canonical archive projection, all installed
executable bytes (including unexpected files), real package/bin location and
native public subpath resolution. The existing archive parser now bounds each
foreground tar operation. Explicit evidence/tooling descendant paths are
listed by `authenticateP911Tree`; no completed-step evidence path is exempted.
This equivalence is not authority to rewrite prior records or skip post-merge
checks. Changed product bytes invalidate affected observations.

The controller invokes, without rebuilding or publishing:

```sh
node scripts/p9-11-corrective-closeout.mjs --handoff /absolute/controller-handoff.json --sha256 CONTROLLER_PINNED_SHA256 --run-root /absolute/fresh-closeout-run
```

Run with Node 24+ (native TypeScript type stripping for the existing deterministic
fixture, and native zstd), tar and the controller's authenticated rendered driver.
The driver is a Node program accepting `--request <JSON> --result <JSON>`.
Each request supplies only that scenario's identity, candidate/bin/install,
fresh profile and exact action coverage. It contains no other persona's state,
hidden findings or expected reactions. This is supplementary verification;
the driver must not restart or coach the retained cold exploration.

The fixed public runner exercises five scenarios outside Jest/source aliases:
production Node/WASM builders and loader; sequence-zero JSON replay;
the original `portable-fixture` hash
`ced06d52f4f2d54e798e22b31834fea226a58c537bab5f117333f19ca213131b`
through installed direct and in-process default Worker protocol, plus separate
opt-in trace/tape budgets; real UInt64 weights and installed registered
report/inspect/diff; installed canonical CLI help/rejection/Outcome/Stake/PAR.
No compiler/npm command is launched by this runner. The sixth destination
scenario and all five short persona smokes consume the controller's rendered
driver. Stake also requires the recognized-source rendered Overview on the same
prepared real source at `<profile>/workspace/rare-stake`.

For each rendered result, require `kind: p9-11-rendered-result`, request `id`,
`candidateId`, `archiveSha256`, `profileId`, `profileRoot`, `driverSha256`,
the exact action IDs in `P911_RENDERED_COVERAGE`, and served HTML/JS/CSS
`{path, sha256, status:200, type}` matching the archive. Each action has
`classification: action`, `outcome: passed`, a nonempty action-local `observed`
text and a pinned `receipt`. Each receipt is `p9-11-action-observation`, carrying
that exact ID, candidate/archive/profile/driver, classification/outcome/observed.
Finding, blocked, unreached, duplicate, missing or contradictory coverage fails.
The exported validator additionally requires raw destination sentinel/race
values (Design build's rejected body is HTTP 200 with `status:error`), one Stake
build and identical prerequisite manifest hashes, selected/reopened replay
identity, same durable job through reload/reconnection, producer settled-round
accounting/local limits, exact positive Studio Stake metrics, and graphic
native same-card painted focus after layout settles, with a pinned image.
Computed outline style alone cannot pass. Reuse the existing image budget;
the controller must inspect the image, not infer visual judgment from these
mechanical checks. Precise field names are in `validateActionCoverage`.

Each scenario/persona gets separate workspace, HOME, XDG config/data/cache,
Documents, browser profile, registry/jobs/runtime-cache locations. The driver
launches the supplied installed bin from that workspace, inherits the isolated
environment, uses the supplied browser directory and scopes any explicit stores
to that profile. Registry/jobs/cache defaults under isolated config remain
isolated as well. It must follow reachable dialogs to truthful terminal states,
release resources, and retain action receipts/images outside the disposable
profile. The controller still authenticates the retained independent originals,
clean-state affected retests and required full P909/P910 executions; a local
Markdown prerequisite or skipped P910 rendered case cannot replace those.

The runner executes exactly six repros and five smokes, sequentially, with no
retry and a 180-second maximum per public/rendered command. Every driver/public
child uses the existing signed spawn-time ownership hook and bounded process
tree/resource drainage. SIGINT/SIGTERM propagate cancellation. Failure records
retain phase, stdout/stderr, exit/signal/deadline/cancel and drainage results.
Own profile removal is awaited on every exit path. Successful `checks.json` is
written only after assertions, final candidate/driver authentication and cleanup;
it explicitly says campaign acceptance is pending. It neither approves nor
implements integration, push, publication, Drive or campaign completion.
Compiler groups in npmPackSmoke abort siblings on failure and await all outcomes;
Studio stop now has a local cooperative/escalation deadline and stdio drain.
The packaging archive and success receipt are retained only after cleanup.

| Acceptance row | Worker evidence / remaining controller proof |
| --- | --- |
| Exact six production repros, lifecycle and unsupported limits | Fixed installed runner plus existing focused regressions; candidate-bound run pending. WASM subset/separate JS evaluator and packing rejection, safe-number Stake IDs/payouts, exact aggregate weights/bounded decimals and distinct native bundle limits remain in [WASM boundary](../wasm-compatibility-boundary.md) and [Stake boundary](../stake-engine-standalone.md). Existing invalid play, later/legacy/empty/malformed continuation, worker tape/trap/cancel/dispose and Studio failed-output contracts are retained. |
| All five authentic initial passes/material finding closure and short final smokes | Original persona documents remain unchanged; README uses latest dispositions, including graphic supersession. External record authentication, candidate final smokes and original-authenticated P909/P910 remain pending. Retain oversized-round rejection/corrected request, terminal cleanup, rare-event and cancellation receipts/tests; do not repeat long workloads or the P8 matrix. |
| One release boundary/exact tree/integration/publication/Drive/ownership/history | Authenticated shared handoff supported by both packaging suites; bounded cleanup contracts pass local tests. Single official gate, real packaging assertions, exact post-merge/integration/push/publication, Drive upload/read-back and controller campaign-state completion remain pending. No external process/service/campaign state was altered. |

Permitted worker verification (foreground only; packaging/browser/gates omitted):

```sh
npm run test:targeted -- tests/scripts/p9-11-corrective-closeout.test.mjs tests/scripts/pc-20-release-completion.test.mjs tests/scripts/pc-20-ownership-snapshot.test.mjs tests/scripts/p8-05-release-handoff.test.mjs
npm run test:targeted -- tests/scripts/p9-11-corrective-closeout.test.mjs tests/project/wasm/WasmRuntimeParity.golden.test.ts tests/project/wasm/WasmRuntimeApi.test.ts tests/project/wasm/WasmRuntimeCompactState.test.ts tests/project/wasm/WasmRuntimeWorker.test.ts tests/stakeengine/standalone/StakeEngineOutcomeSourceReader.test.ts tests/stakeengine/standalone/StakeEngineStandaloneAnalyzer.test.ts tests/cli/commands/ReportCommand.test.ts tests/cli/studio/StudioDestinationWorkflow.integration.test.ts
npm run typecheck
```

The first harness run exposed test-fixture errors (Jest resolution interception
and omitted fixture archive path); those were repaired. Subsequent lifecycle
run passed 4 suites / 42 tests; runtime/API/destination run passed 9 suites /
189 tests. After adding explicit pre-cancellation/deadline receipt checks and
native resolution/worker binding, the lifecycle set passed 4 suites / 44 tests.
Root typecheck includes Studio once. Changed TypeScript is also
checked by the normal commit hook. Fixture-only lifecycle/driver results are
contract tests, never persona observations or acceptance receipts. No original
report, image, transcript, checkpoint, campaign record or historical receipt
was removed or rewritten.

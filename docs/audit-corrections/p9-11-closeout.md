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

## P9-11 shared-candidate and cleanup review repair

Both packaging consumers now use Node's native ESM loader under their actual
CommonJS Jest transform. Their focused handoff tests authenticate a pinned
fixture archive/installation, consume its unchanged archive and borrowed bin,
reject a changed pin, and remove only the scratch consumer. The shared fixture
is synthetic contract coverage, never a normal candidate or independent proof.
The existing installed CLI/npx, semantic failure, Studio/assets, public imports
and worker assertions remain intact.

Packaging Studio children, parallel compilers and closeout scenario/driver
children now launch through the existing signed ownership runner. The retained completion drains identified descendants
after root exit and awaits a locally bounded stdio close notification acquired
at launch. An incomplete resource ledger, missing stdio closure, execution
failure or deadline blocks receipt retention. Focused regressions cover root
exit before descendants, detached descendants, inherited open stdout/stderr,
SIGTERM escalation, sibling compiler failure, unrelated-process preservation
and cleanup failure without a success receipt.

This review repair's required foreground check is the complete three-file set:

```sh
npm run test:targeted -- tests/packaging/P805ValeraProgrammer.test.ts tests/packaging/npmPackSmoke.test.ts tests/scripts/p9-11-corrective-closeout.test.mjs
```

The committed work report records its final outcome and the changed-file ESLint
hook result. Mandatory P9-CORRECTIVE-CLOSEOUT, authentic retained-original
verification, all five isolated final persona smokes and independent image
inspection remain pending. The single release gate/packaging boundary, exact
post-merge verification, develop integration/push/publication, Drive round-trip
and campaign completion remain controller-owned and pending. No prior completed
step evidence has changed; no substitute independent transcript was collected.

## P9-11 authenticated producer integration

The saved independent preflight correctly identified a missing producer: the
reader and closeout could only consume records, and the synthetic test fixture
was the only local constructor. The new controller-only entry point is
[`scripts/p9-11-produce-candidate.mjs`](../../scripts/p9-11-produce-candidate.mjs).
The implementer does not invoke this command. The controller invokes it once
on the committed exact candidate, before the packaging consumers and bounded
closeout. It does not run a release gate, integrate, push, publish or collect
independent persona observations.

The controller supplies and externally pins a JSON configuration:

```text
schemaVersion: 1
kind: p9-11-producer-config
campaignId: pokie-phase-9-audit-corrections
issuer: controller identity
candidateId: exact committed HEAD
candidateTreeId: that commit's tree
repositoryDirectory: absolute clean candidate checkout
outputDirectory: absolute fresh directory outside that checkout
browserDriver: { path: absolute independent rendered-driver module, sha256: controller-pinned digest }
timeoutMs: optional per-command deadline, 1..180000 (default 180000)
```

```sh
node scripts/p9-11-produce-candidate.mjs --config /absolute/producer-config.json --sha256 CONTROLLER_PINNED_CONFIG_SHA256
```

The producer runs exactly `npm run build` with `NODE_ENV=production`, then
`npm pack --ignore-scripts --json --pack-destination <fresh-archive-directory>`,
then `npm install --omit=dev --no-audit --no-fund -- <that-archive>` in the
fresh shared installation. It removes inherited npm lifecycle/package context
and Node/Jest options from these commands. Every command uses the existing
spawn-time ownership runner, bounded descendant drainage and awaited stdio
closure. SIGINT/SIGTERM cancel the active command. There is no retry, existing
dist fallback, copied-package fallback or test fixture in the production path.

Source commit/tree, clean exact HEAD and driver bytes are checked before launch,
after each command and before delivery. The packed declaration must equal the
committed source declaration. Command receipts retain real argv, cwd,
production environment, stdout/stderr, terminal/deadline/cancellation and
ownership results. The native candidate reader verifies the resulting archive,
executable projection, installed bytes and public resolutions before the
producer delivers `handoff.json`. The candidate reader now also requires the
pinned regular rendered-driver file, so neither packaging consumer can accept
a driverless handoff. A precise `failed.json` retains the failing phase and
command results; failure prevents handoff delivery and preserves this run's
logs, ownership ledgers and archive/install for diagnosis. Existing output
directories are rejected without overwriting previous receipts.

`delivery.json` and the single JSON stdout result provide the exact candidate,
tree, archive path/digest, executable digest, installation and pinned `handoff`
reference, an `environment` object containing both `POKIE_P911_CANDIDATE_HANDOFF`
and `POKIE_P911_CANDIDATE_HANDOFF_SHA256`, and the exact `closeout` command/argv.
The controller passes that environment into its one release/packaging boundary;
it binds the delivered archive digest as that boundary's
`candidatePackageSha256`. Both packaging suites then consume this same
archive/install. Their shared selector accepts the release runner's empty P8
handoff variable, rejects a real competing P8 handoff, and rejects partial P9
delivery instead of falling back to rebuilding. To invoke the
bounded verifier, append `--run-root <absolute-fresh-closeout-directory>` to
the delivered closeout argv. No producer/build/install command is added to the
verifier. The controller pins the delivered reference at this transport
boundary; a self-declared issuer alone is not authentication.

The rendered driver remains an independently supplied executable, pinned in
the controller configuration. The producer authenticates and delivers its
reference; it does not invent rendered observations or substitute the P8
Cartesian collector. Its required actions, images, served-asset hashes,
fresh-profile isolation and terminal cleanup are the existing closeout contract
above. Authentic original P909/P910 evidence, all six installed repros, five
short final smokes, independent image review, the single release boundary,
post-merge checks, publication and Drive round-trip remain pending controller
execution. Synthetic producer tests demonstrate contract behavior only.

This repair's permitted foreground checks are the producer/closeout whole-file
contract tests (including the packaging consumers' shared native selector) and
root typecheck. The bounded command policy rejects Jest name-filter arguments;
the attempted filtered packaging command did not launch Jest. Full packaging
execution and the existing two native-ESM consumer tests remain controller-owned:

```sh
npm run test:targeted -- tests/scripts/p9-11-produce-candidate.test.mjs tests/scripts/p9-11-corrective-closeout.test.mjs
npm run typecheck
```

## P9-11 rendered adapter installation

The committed single-file implementation is
[`scripts/p9-11-rendered-driver.mjs`](../../scripts/p9-11-rendered-driver.mjs).
Its neutral profile/display dependencies are the same controller-owned helpers
used by the assigned persistent adapter. Offline `--describe` loads neither
helper and launches no browser, Studio or workflow. It declares exactly seven
implemented itineraries, matching `P911_RENDERED_COVERAGE`; admission is not
action evidence. The focused regression exercises every branch and rejects
partial coverage and failed observations.

The original installation handoff named
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-9a681260c6a73825/current.mjs`.
That historical location and its receipts remain unchanged. Current passing
collection used a later external adapter with additional repairs; the
[current reconciliation below](#verified-driver-source-reconciliation) identifies
its exact path/pin and the corrected committed implementation. Future controller
installation must pin the actual installed bytes and authenticate that path/pin
through `controller-candidate-handoff`. The worker must not modify the external
harness or reuse a historical pin for different bytes. Existing producer,
packaging-consumer and closeout identity contracts remain required. No admission
receipt, fixture or source-aware test replaces independent collection.

The driver accepts only the consumer's absolute authenticated request/result
paths, verifies its own byte pin and exact requested coverage before launching,
uses an OS-assigned fresh CDP port, and isolates browser/application/workspace
state under the supplied profile. Input uses native Tab/Enter/typing and design
tab arrows, plus a hit-tested native pointer action for mobile section navigation.
DOM/CDP inspection locates targets and observes results without invoking React handlers
or fabricating DOM state. Public HTTP calls observe persisted state and exercise
the actual Design preview/publication race. Public CLI smoke calls use only the
supplied installed bin. Served HTML/JS/CSS hashes come from actual fetched
production assets after the itinerary.

Action receipts/transcripts and bounded screenshots are retained beside the
result, outside the disposable profile. The common-card focus receipt retains
running and settled bounds plus viewport and a PNG hash; paint is checked against
actual decoded screenshot pixels. The controller still makes the independent
visual judgment. Local child cleanup tracks closure at launch, drains surviving
groups even after root exit and bounds inherited-stdio closure independently of
the scenario deadline. Cleanup failure prevents a successful result file; the
outer signed closeout supplies complete descendant/resource receipts. None of
these implementation mechanics closes an original frozen P909/P910 obligation
or a release/publication/Drive acceptance row without its actual controller run.


## Current-Studio driver repair handoff

Finding `706091c10ac6f4a8` supersedes the earlier source-aware claim that an
ordinary Blueprint Outcome artifact card supplies these itineraries. Studio
intentionally exposes one configurable generator for runnable sources. Both
persona routes now submit that generator once, authenticate its own terminal
and saved sample provenance, and open its output using **Inspect library**.
Programmer retains both the post-generation Blueprint operation refresh and
the opened library's new prepared Stake operation. One native-library Stake
Build consumes the identified source without modifying its manifest. Its
public `publish`/`none` provenance is retained accurately, rather than being
mistaken for the separate automatic managed `reuse`/`borrowed` policy. No
artifact card or alternate submission route was introduced.

Browser launch uses the helper's environment, including required launcher
HOME; Studio storage uses the isolated application profile. Chromium user-data
and disk-cache paths are unique per persona. Play and both simulations record
explicit inputs, actual submitted bodies, and read-back results. Overview
presentation success requires the actual table's nonzero rare-event values.

Graphic collection has exactly four image/contact-sheet writes. The Home
sheet includes sections and the expanded Design Build form at 1100×800,
900×700 and 390×844. The project sheet includes Overview and Build/Export at
the same sizes. The third image captures the running common JobCard. The
fourth retains settled focus at 1100×800 before resize and at 390×844 after
settling, without changing focus ownership. Panel metadata binds viewport,
route, local geometry and sheet offset; paint checks use retained PNG pixels.
The controller must independently review readability and visual quality.
These assertions do not grant visual acceptance or replace frozen P909/P910
observations.

The directly affected whole files passed together (62 tests); root typecheck
also passed, including the Studio compiler once:

```sh
npm run test:targeted -- tests/scripts/p9-11-rendered-driver.test.mjs tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeStakeHandoff.test.tsx
npm run typecheck
```

The startup negative tests launch bounded fixture executables through the real
`main` boundary and remove their temporary records; they do not launch the
controller's browser or establish acceptance. Other tests execute selectors
against explicit DOM states and a real Studio HTTP generator/Stake workflow,
not a universally successful evaluation stub. See the current
[finding-to-proof ledger](README.md#p9-11-current-studio-rendered-driver-correction).

The controller must install/pin these exact committed bytes at its existing
persistent driver boundary, deliver the normal shared candidate, run independent
retests/collection and review the four graphic sheets. Exact-candidate six-repro
and five-persona evidence, original authenticated P909/P910 execution, official
release/packaging, exact integration/push/publication, Drive and full external
cleanup receipts remain pending. This is an implementation work handoff;
neither P9-11 nor the campaign is marked complete by it.

### Native producer and dependent Stake correction

The preceding direct native-library publication check is superseded as
programmer acceptance proof. The repaired itinerary preserves deterministic
configurable-generation checks, then uses the existing public automatic
`POST /api/project/artifacts/build` Outcome target to establish the compatible
managed prerequisite. It refreshes Build/Export on the original Blueprint,
submits that card's prepared Stake operation exactly once and verifies its
own terminal, `reuse/borrowed` selected prerequisite and unchanged manifest.
The closeout contract rejects direct-library `publish/none`, changed project
identity, stale/substituted operations and sibling terminal jobs.

Producer navigation now starts at the selected design tab and uses native
ArrowRight to Paytable. Selection, the associated visible panel and its real
editable field are checked before saving. The extracted production Tab helper
is exercised against native tab stops; the old Tab-only route fails without
adding focusability or directly focusing the requested unreachable target.
DOM keyboard fixtures are regression checks, not browser observations.

The three directly affected whole files passed together (**3 suites / 95
tests**); root typecheck also passed, including the Studio compiler once.
The component suite emitted React `act` warnings while passing. Exact permitted
command outcomes belong to the committed work report.
See the [repair ledger](README.md#p9-11-native-producer-and-dependent-stake-repair).
Existing deterministic-input, presentation, image-budget, isolation and
cleanup checks remain required. All exact-candidate collection, independent
persona/image acceptance, authenticated P909/P910 and official lifecycle
obligations listed above remain **pending controller execution**. Completed
step evidence is preserved, and this handoff does not close P9-11.

## Scope-criterion-1 packet handoff

Continue from `98a3096f6c1cad9287aafcc3c95ea04a63c8ced4`; the production
corrections and historical observations are retained. The reader now records
native ESM as well as CommonJS installed resolutions, rejecting entries outside
the authenticated real-file archive projection. Successful `checks.json` adds
`candidateIdentity` (source/tree, package, archive, installation/bin/resolutions,
build/install/driver receipt pins) and the original handoff reference.
Each result links a pinned `resultReceipt` and `processReceipt`, with the
authenticated served assets for rendered results. Final authentication rejects
changed identity; result/process pins are re-read after profile cleanup, so
cleanup or subsequent work cannot silently substitute an earlier observation.
Failures retain their exact phase and publish no successful checks.

The focused harness regression verifies both native resolution conditions,
complete identity/receipt joins, changed final source/tree/package/installation/
ESM/receipt identity, and changed result/process bytes during cleanup. Existing
precise scenario failure, deadline, cancellation and cleanup-failure contracts
remain mandatory. Synthetic fixtures establish these contracts only. The
[packet proof index](README.md#p9-11-scope-criterion-1-packet-retained-production-proof-bindings)
joins the six unchanged production scenarios to their receipts without inventing
current collection. The controller still owns normal packaging and independent
rendered reruns; no official gate, build/pack/install, publication or external
workflow is authorized for this worker beyond the named focused tests' existing
foreground test compilers. The 20 permitted whole-file paths from this packet's
targeted list passed together: **20 suites / 419 tests**, exit 0. The focused
closeout file separately passed **33 tests** after correcting one test fixture's
process-receipt filename. Direct and default Worker snapshots measured 130,
137 and 139 bytes at zero, 10,000 and 100,000 rounds; timing records impose no
machine-dependent threshold. Runtime/Studio failure and cancellation, public
registered CLI/report, rare-probability presentation and destination-race
regressions remained green.

`tests/packaging/npmPackSmoke.test.ts` remains explicitly pending controller
execution. The command policy rejected the proposed test-name filter with
`POKIE implementation policy: test argument must name a test file`; no filtered
packaging check ran, and no real packaging boundary was attempted. The work
report lists the complete 20-path command and this exclusion. This is the
instruction's controller-owned packaging exception, not a passed packaging
test or a fabricated acceptance receipt. Only the two `.mjs` readers/runners,
their `.mjs` regression and these current-step documents changed; no TypeScript
compiler or browser bundle consumes changed production files in this packet.

## Verified driver source reconciliation

Reviewer finding `ccfb6d8d71bd8c14` was traced on task baseline
`7118490f402a7320b36b01d63c747cd975e24e0e` against the read-only authenticated
reference at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-e55cfffeb5c8ef54/current.mjs`.
Its bytes rehash to
`e59b0016e731e759bd9068f130cd02cfef44aa74b689194f240297f803686338`.
That external implementation supplied the passing collection indexed in the
[current README entry](README.md#2026-10-10-authenticated-p9-11-corrective-closeout).
The repository implementation at the baseline did not reproduce those bytes or
all their transitions. The current correction repairs the portable single file;
operation/navigation helpers live in that file, so installation adds no new
external module dependency. The existing profile/display helpers remain unchanged.

| Accumulated driver divergence | Current implementation and focused closure |
| --- | --- |
| Selection incorrectly counted as comparison | Load the selected record, wait for its enabled Reproduce action, activate it once, assert the rendered exact-match terminal and exactly one actual `/api/project/replays` POST. Fixtures separate loading from comparison and reject disabled, missing, duplicated or nonterminal submission. |
| Stale generation preflight | Mark before editing; wait for the successful response matching base/sampled/5000 and the deterministic coverage seed, a nonempty token and rendered ready controls. Submit once; assert HTTP 202, matching inputs/token, own rendered/persisted job and manifest. Stale, failed, absent-token and drifted-token fixtures fail. Both generator callers remain covered. |
| Refreshed disclosures disappear | Null-safe bounded state observation waits for a current disclosure, activates a collapsed control once and observes expansion. Open disclosures are preserved; missing/replaced controls cannot become success. Both artifact cards and the public generator use this helper. |
| Dirty Design holds an Open | Follow the visible Leave confirmation once for the already-activated opening; await its requested project result without reissuing Open. Both recognized Stake opening and same-project replay reopening are covered. |
| Transient navigation absence/phone drawer | Home uses its actual section ID; desktop waits for the actual project ID without activating a hidden toggle. Phone opens a visible collapsed drawer once, or retains an open drawer, then scrolls/hit-tests one native pointer action. Route, selected NavLink and the project's own rendered terminal must all agree. Delayed, missing and occluded fixtures cannot fabricate reachability. |
| Prior keyboard, dependent Stake, determinism, presentation, images and cleanup findings | Preserve Paytable arrows/native focus, original Blueprint dependent Stake submission/borrowed manifest, explicit seeds/bet/rounds/workers, rendered rare percentages, four image/contact-sheet budget, isolated browser launch environment, PNG paint checks and bounded drainage. Whole-file driver/closeout regressions retain exact coverage/action classification and failure contracts. |

The changed driver is consumed directly by native Node offline admission and
controller CDP collection, then authenticated by the existing producer,
candidate reader and closeout. It changes no TypeScript, generated package or
Vite input. No compiler/build/packaging command is required in this bounded
repair. The directly affected whole-file command passed **2 suites / 122 tests**, exit 0:

```sh
npm run test:targeted -- tests/scripts/p9-11-rendered-driver.test.mjs tests/scripts/p9-11-corrective-closeout.test.mjs
```

The controller must independently review these new driver bytes and pin the
actual installed file for any future handoff. The existing accepted aggregate
`3be5fee19f4b345a04c5b05e44052c5d2f9008099ba6aec92092dd864cd72d0e`, P909/P910
receipt `227aae219f12178099ab504a`, archive, served assets, isolated profiles,
action/process receipts and four independently reviewed graphic sheets remain
at their original locations and attributed to their original product candidate
`b932e86c0113d0219a82362b392d6123ca0780f6` and external driver. No receipt is
rewritten or relabelled as a run of this corrected source. Accepted product,
browser and visual proofs are reused; this repair requests no new cold
exploration, repeated passing browser suites, repackaging or official gates.

For immutable criterion 1, the retained normal-candidate six-repro proof and
unsupported-capability register remain authoritative. For criterion 2, the five
retained independent cold observations, affected retests, isolated final smokes
and current accepted P909/P910/image disposition remain authoritative; prior
pending paragraphs above are chronological records superseded by the current
README entry. For criterion 3, official release/packaging lifecycle, exact
integration/push/publication, Drive round-trip and campaign completion remain
controller-owned and pending. The controller retains its independent three-file
driver/closeout/producer matrix. This implementation commit closes the assigned
source-parity repair, not the campaign state machine; all external and completed
prerequisite evidence remains unchanged.

# P9 correction and reviewed product status register

P9-11 implementation baseline: `bd86dced40a10f6212518b14db951d03c7fb744f`.
Immutable campaign brief: `27dfbbbd2ef5279d13929ad878c30b00d0ec40e9c4d40553a19284b8416c6a5c`.
The [bounded closeout handoff](p9-11-closeout.md) describes the single normal
candidate/archive/install and precise command/driver contracts. **Final packed
candidate, supplementary persona smokes and release acceptance are pending
controller execution**. Local focused tests are regression evidence, not an
installed-candidate, independent browser, publication or Drive receipt.

| Criterion / original reproduction | Correction and retained regression authority | Exact candidate command/action and required observed result | Retained proof / current disposition |
| --- | --- | --- | --- |
| 1: Node/WASM first and subsequent spin | [Original two-reel seed `"0"`, constructor consumption correction](rng-replay.md); [production package parity regression](../../tests/project/wasm/WasmRuntimeParity.golden.test.ts) | `node-wasm-first-subsequent`: actual generated entry through installed public loader/builders, first four unrewound rounds, screens/payouts/credits/RNG; strip lengths 2 and 3 | Original record retained; final `<run>/node-wasm-first-subsequent.public.json` and process receipt pending |
| 1: Serialized sequence-zero replay | [Initial-state and continuation correction](rng-replay.md); [fresh/advanced receiver and repeated replay regression](../../tests/project/wasm/WasmRuntimeApi.test.ts) | `serialized-zero-replay`: JSON initial snapshot consumes no draw; first round and continuation match on fresh/advanced receivers and with siblings | Original record retained; final public/process receipts pending |
| 1: Bounded long state | [Original fixture, metrics and compact-v2 correction](compact-wasm-state.md); [10000/100000-round and separate trace/tape authority](../../tests/project/wasm/WasmRuntimeCompactState.test.ts) | `bounded-long-state`: same existing deterministic fixture through installed `pokie/wasm`, matching direct/default in-process Worker protocol at 0/10000/100000, compact fields/bytes/counters; separately bounded tape/trace, observed timings | Historical timing receipts retained; local regression passed (130–139 bytes); final candidate public/process receipts pending. In-process protocol is not Worker transport proof |
| 1: 2^64-total Stake analytics | [Real input, BigInt/probability correction and limits](stake-probabilities.md); [reader](../../tests/stakeengine/standalone/StakeEngineOutcomeSourceReader.test.ts), [analyzer](../../tests/stakeengine/standalone/StakeEngineStandaloneAnalyzer.test.ts), [public Report implementation](../../tests/cli/commands/ReportCommand.test.ts) | `stake-uint64-total`: installed reader/analyzer and registered `report`, JSON readback, positive `2^-64`, RTP/variance/deviation and nonzero formatting; recognized-source rendered Overview | Historical authority retained; final public/rendered/process receipts pending. Internal `stakeengine`/`outcome-source` commands are not public proof |
| 1: Canonical CLI | [Original public export correction and inventory](canonical-cli.md); [registered command regression](../../tests/cli/CanonicalArtifactCli.integration.test.ts), [coverage map](cli-coverage-map.json) | `canonical-cli`: installed root/recursive help, removed export exits 1 without artifact/stdout, all six targets advertised, Outcome/Stake/PAR publication/readback and retained nested `par export` | Prior preview/conflict/cancellation/ownership regressions retained; final public/process receipts pending |
| 1: Occupied destination and recovery | [Original finding F and complete correction ledger](destination-ux.md); [real API occupancy-race regression](../../tests/cli/studio/StudioDestinationWorkflow.integration.test.ts), [rendered panel regression](../../tests/cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel.test.tsx) | `occupied-destination`: rendered Design → Build Package, actionable error without overwrite, sentinel unchanged, edited/browsed new path publishes; real preview/build occupancy race rejects | Prior omitted/relative/sidecar/companion/registration-cleanup proofs retained; final rendered/process receipts pending |
| 2: Programmer | [Cold charter](valera-programmer-charter.md), [initial chronology, corrections and independent Stake handoff retest](valera-programmer.md) | One isolated short CLI/startup/canonical + Outcome Library → Stake smoke; plan refresh, exactly one Build, own completed terminal, borrowed prerequisite, unchanged manifest | Latest retained handoff result passed; external originals still require controller authentication. Final `programmer` smoke pending |
| 2: Mathematician | [Cold model/PAR/replay observations and cancellation closure](valera-mathematician.md); [focused authority](../../tests/cli/P907ValeraMathematician.integration.test.ts) | One saved-model/PAR result and unambiguous native-library replay selection with seed/mode/time/record identity, exact selected comparison and reopening | Recorded cancellation/recovery closure supersedes earlier driver-timing inconclusive results; retain rare-event/cancel receipts. Final `mathematician` smoke pending |
| 2: Producer | [Independent natural edit/validate/save/play journey, frozen hashes and two images](valera-producer.md) | One small saved design, valid structure, one settled round, useful next actions and truthful local deployment/certification limits | Retained natural journey passed; no expansion to every feature. Final `producer` smoke pending |
| 2: UI/UX | [Independent recovery chronology and local-test authentication caveat](valera-ui-ux.md) | One bounded same-ID job across reload/reconnection, no duplicate submission, truthful terminal/result, recovery/focus and project isolation | Local P909 document prerequisite does not authenticate its external original. Original-authenticated complete P909 and final `ui-ux` smoke pending |
| 2: Graphic designer | [Append-only supersession and latest settled-layout independent retest](valera-graphic-designer.md#2026-10-10-independent-affected-retest--settled-terminal-focus-closure) | Common JobCard retains native focus and painted visible outline after Review/report/Recent runs settle; affected Home/project/build/job presentation, no stolen focus | Latest recorded candidate `ecc43ee3c87be95acd0887fb79e63a7c9d7e1b4a` closes the affected visual findings; earlier terminal-focus closure was superseded. Original-authenticated complete P910 and final `graphic-designer` smoke pending; skip is not acceptance |
| 3: Exact release lifecycle | [Controller handoff and closure ledger](p9-11-closeout.md); [real packaging assertions](../../tests/packaging/npmPackSmoke.test.ts), [installed bin/npx authority](../../tests/packaging/P805ValeraProgrammer.test.ts), [existing ownership/lifecycle authority](../../scripts/pc-20-release-completion.mjs) | One controller release/packaging boundary reuses pinned archive/install, exact post-merge tree, develop integration/push/publication, authenticated Drive upload/read-back, all owned children drained, only this campaign completed | All external release receipts pending. Runner `checks.json` explicitly leaves campaign acceptance pending; it cannot approve, publish or complete a campaign |

### 2026-10-10 independent P9-11 recovery observation

The verifier authenticated the clean candidate checkout at
`6a4c5cfad9687d2c338538d009e4f7104f78ad26` (the requested candidate and
HEAD).  It ran one new Studio instance from this checkout through
`node ./dist/cli/pokie.js --no-open`, with fresh application storage and a
fresh browser profile.  The retained runtime transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-45c1dc3bb3a294f9/run-2026-10-10T11-31-04-879Z/transcript.json`
(`sha256:1663f0b5a31901545a0c8586c1a65ab173643a47bee140029afac3ae9dff1da3`);
the independently inspected rendered round image is
`1-observation.png` beside it
(`sha256:4ed609ce302af457ac19382a62e4678acac8d0f67a710c73772a5fb30e547f6a`).

The observed public path created the valid starter game, accepted and saved
it, started a new Play session, and accepted one Spin.  That same action
settled locally as “Round complete — no win this round” with credits `999`,
payout `0.00`, and a visible reel result; the image confirms that rendered
terminal state.  The Build/Export surface then rendered a ready TypeScript
Game Package card, an empty output-directory field, its resolved default
path, and a Build action.  No product error was rendered in these reached
steps.  A pointer activation of an idempotent navigation control initially
left its local view unchanged; one native-key retry on the focused control
reached Build/Export, so it is retained as driver interaction history, not a
product finding.

This does **not** close a P9-11 row.  No controller-pinned
`p9-11-candidate-handoff` (normal production archive, npm installation,
build/install receipts, and authenticated rendered driver) was supplied in
the assigned runtime evidence, and no such handoff was present for this
candidate in the inspected runtime handoff records.  Consequently the six
installed corrective repros, occupied-destination sentinel/recovery, five
complete isolated persona smokes, original P909/P910 execution receipts,
focus-after-settle proof, served-asset binding, and closeout cleanup receipts
remain pending controller-authenticated collection.  This record preserves
only the bounded fresh-profile observation and does not relabel older
findings, tests, or historical evidence.

Every final proof joins `candidateId`, `candidateTreeId`, archive SHA-256,
executable projection SHA-256, installed resolutions and served asset hashes
through the controller-pinned handoff. `<run>` is the fresh controller-owned
receipt directory, not an existing or fabricated archive. Link its authentic
receipts here after execution; do not duplicate transcripts/images, erase
superseded observations, or relabel earlier candidates. Evidence/tooling-only
descendants must pass the explicit Git equivalence check; product/build-input
changes require affected proofs again. All five original persona records and
their chronological dispositions remain in their linked documents unchanged.

### 2026-10-10 P9-11 continuation authentication

The current verifier authenticated `51a81cc352c1082ebf339f5e1fb9b4d4b8b0bedb`
as a clean evidence-only descendant of product candidate
`6a4c5cfad9687d2c338538d009e4f7104f78ad26`: its only candidate-to-HEAD path
change is this README. It rechecked the persistent P9-11 harness, its retained
transcript and image checksums, and the bounded controller runtime/hand-off
records. No `p9-11-candidate-handoff`, pinned normal archive, real npm
installation, build/install receipt, or authenticated rendered-driver receipt
for this candidate is present. The independently inspected retained image does
show the local completed Spin described above, but cannot establish any missing
installed corrective scenario, five-persona smoke, P909/P910 execution,
settled-focus comparison, served-asset binding, or closeout cleanup. Those
rows therefore remain pending collection from the controller-authenticated
handoff; no replacement archive, public launch, official gate, or publication
was created in this continuation.

The historical status register below is retained. Its prior pending wording
describes the earlier review; the index above states P9-11's current obligations.

### 2026-10-10 P9-11 closeout handoff preflight

The current independent verifier authenticated clean evidence descendant
`fd262c4d0d009a633ec00a0366073e4c7fc5297e` against product candidate
`6a4c5cfad9687d2c338538d009e4f7104f78ad26` (candidate tree
`25566a638f7f25e6e87035018ad5e136b26b3efc`).  The candidate-to-HEAD diff is
only this README.  It then inspected the assigned persistent harness at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-45c1dc3bb3a294f9`:
the retained interactive child (`pid 2194074`) is no longer running, and no
handoff JSON, receipt JSON, or rendered-driver module exists at the named
handoff-record boundary (harness depth two).  No `POKIE_P911_*` delivery
variable is present.

The exact candidate consumer command, `node scripts/p9-11-corrective-closeout.mjs`,
exited `1` before launch with: `Usage: node scripts/p9-11-corrective-closeout.mjs
--handoff <absolute-json> --sha256 <controller-pinned-digest> --run-root
<fresh-directory>`.  This is an offline preflight rejection, not a rendered
Studio action.  Its source boundary is explicit: `scripts/p9-11-candidate.mjs`
only reads an absolute pinned `p9-11-candidate-handoff` and requires its normal
archive, production build receipt, npm-install receipt, and installation;
`scripts/p9-11-corrective-closeout.mjs` consumes that authenticated result and
then requires the handoff's hashed `browserDriver`.  Neither module produces
those controller records.  The sole matching local constructor is
`tests/testUtils/createP911CandidateFixture.mjs`, whose leading contract says
it is a synthetic archive/install fixture and never acceptance evidence; its
test-only receipt issuer and mocked driver cannot supply this candidate.

Consequently no archive path/SHA, executable SHA, installation root,
controller build/install receipt, or authenticated rendered driver is
available for the exact candidate.  The verifier did not synthesize any of
them, invoke a public workflow, replay the already retained Studio observation,
or run an official gate.  This leaves every installed corrective scenario and
persona smoke not reached.  The actionable integration defect is the absent
controller-to-closeout producer handoff at the consumer boundary above; a
controller-produced, pinned normal archive/install and driver are required
before the current checklist can be executed.

### P9-11 producer integration repair (controller execution pending)

The saved preflight remains unchanged above. Its exact missing-arguments
failure was reproduced on this task's HEAD before editing. The production
[`producer`](../../scripts/p9-11-produce-candidate.mjs) now creates the normal
build/pack/npm-install receipts and candidate handoff, authenticates the
controller-pinned rendered driver, and delivers the handoff pin and environment
consumed by both packaging suites and the corrective closeout. The
[invocation and transport contract](p9-11-closeout.md#p9-11-authenticated-producer-integration)
identifies the one controller-owned producer run; no build or packaging work is
added to the verifier.

The [producer contract regression](../../tests/scripts/p9-11-produce-candidate.test.mjs)
traces delivery into the native installed-package reader and rejects missing or
changed driver pins, dirty/wrong source, repeated output, precise build/pack/npm
installation failures, stale installed bytes and undrained processes/stdio.
The [closeout regressions](../../tests/scripts/p9-11-corrective-closeout.test.mjs)
retain the exact six repro/five persona action classification and accumulated
descendant/stdio cleanup obligations. Both native-ESM packaging handoff consumers
remain covered by their focused existing tests. These synthetic checks are
implementation evidence only. Actual producer delivery, candidate-bound six
repros/five final smokes, authentic originals including P909/P910, independently
reviewed settled-focus images and served-asset/cleanup receipts remain pending
controller collection. Release, exact integration/push/publication, Drive
round-trip and campaign completion remain pending as well. No completed-step
report, image, transcript, checkpoint or receipt was rewritten or removed.

### 2026-10-10 P9-11 evidence-locator correction

This evidence-only finalization retains the preceding P9-11 verdict unchanged:
the exact product candidate is
`3cddf327fe4c9aa9310f578bc9a59f71bea0c67a`, and the authenticated
controller delivery required to run the six corrective repros and five persona
smokes is still absent. No workflow, build, test, Studio launch, or product
change was performed for this correction.

The retained evidence locator for this verifier result is this README only.
The previously reported `scripts/p9-11-produce-candidate.mjs`,
`scripts/p9-11-candidate.mjs`, and
`scripts/p9-11-corrective-closeout.mjs` paths are product source references,
not evidence paths, and are deliberately omitted from the corrected evidence
index. Historical source-provenance discussion above remains descriptive; it
does not turn those source files into retained proof.

### 2026-10-10 P9-11 controller delivery and bounded closeout attempt

The controller supplied and pinned the closeout driver at
'/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-94e3b3bca933a5b9/current.mjs'
with SHA-256
'9fe7fc4eb8e0524a9de2efadf44b873906ffd107f70f3c9a5c0c2dd1dee893d0'.
Its one controller-owned normal build/pack/install delivery is at
'/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-94e3b3bca933a5b9/controller-candidates/3cddf327fe4c9aa9310f578bc9a59f71bea0c67a-9fe7fc4eb8e0524a9de2efadf44b873906ffd107f70f3c9a5c0c2dd1dee893d0/output';
the handoff digest is
'b1d37ce229087413c358f3fde774fdf749c0b7ff78cec9dd9af8d5ce157882d4',
the normal archive digest is
'36361323e16e1952be188a24a99f931d7de6531e2c755195eb3e5aa0b4d2aaf3',
and the executable projection digest is
'87c3126fc08566c2e8fe5b4e34c1cf958ae61a14d6f3c4558832150cbc616a6b'.
The handoff reader authenticated candidate
'3cddf327fe4c9aa9310f578bc9a59f71bea0c67a', its installed public
resolutions, and the current clean evidence-only descendant.

The verifier ran the reviewed closeout once at
'/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-94e3b3bca933a5b9/closeout-2026-10-10T12-26-00Z'.
Its complete installed public node-wasm-first-subsequent,
serialized-zero-replay, bounded-long-state, and stake-uint64-total
subcommands exited 0 with every owned process tree and stdio stream drained.
Before the required rendered Stake observation, the pinned driver launched
Studio from the installed package but its default Chromium command failed to
expose CDP; the closeout's retained failed.json records terminal exit 1, the
exact child command, and complete cleanup. This is a driver bootstrap failure,
not a rendered product action or a product finding. The same persistent driver
was repaired to select /usr/bin/chromium-browser, but its bytes consequently
no longer match the delivered pin and no second closeout, build, install,
browser launch, official gate, or publication was attempted.

Thus the four passed installed subcommands are retained partial collection
only. The rendered Stake row, occupied-destination scenario, canonical CLI
completion, all five persona smokes, P909/P910, focus/image review,
served-asset binding, and full cleanup closeout remain not reached pending a
new controller pin for the repaired driver. No candidate product defect was
observed or inferred.

### 2026-10-10 P9-11 controller-delivery recovery: rendered-driver boundary

The exact product identity remains `3cddf327fe4c9aa9310f578bc9a59f71bea0c67a`;
this clean evidence descendant has HEAD
`d98fe27499ae7bc17fa94ea609327a581bcc6d26`. The controller rebound the one
existing normal archive/install (archive SHA-256
`36361323e16e1952be188a24a99f931d7de6531e2c755195eb3e5aa0b4d2aaf3`) to
the repaired persistent driver without rebuilding or installing again. Four
bounded closeout runs were made with fresh application and browser profiles.
The installed public `node-wasm-first-subsequent`, `serialized-zero-replay`,
`bounded-long-state`, and `stake-uint64-total` subcommands passed with owned
children drained on each run.

The earlier CDP-bootstrap observation is superseded: the final run reached a
real Studio transition. `Create game` was enabled on the starter-design page,
rendered its saving/opening pending state, then settled once at the new
project's Overview with `project-open-materialization · Completed`. The
independently inspected terminal screenshot is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-94e3b3bca933a5b9/closeout-2026-10-10T13-30-00Z/stake-uint64-total-create-game.png`
(SHA-256 `429bca23588c5a85080766e4a5f45b318b6984d9b5ded5986934de27d76344e4`);
the compact transition transcript is beside it at
`stake-uint64-total.rendered.transcript.json` (SHA-256
`5f638dcfce4142adb997fe9154de4fab6f920d68e14ec92bc9596552f3b1b219`). The
final closeout failure receipt is `failed.json` in that same directory
(SHA-256 `132881d044c284bd0cf7ea2f4cc7c9eddb4b2acdbd01898088065c3ea308a252`).

No product defect was observed in this reached transition. The closeout remains
incomplete because the supplied current driver has no implemented,
action-local itinerary from that Overview into the required Stake recognition,
occupied-destination recovery, or five persona rows. It stopped before
claiming any of those outcomes; no action receipt, focus judgment, or campaign
acceptance was synthesized. The next verifier-owned repair is to add those
visible, per-request journeys to the same driver, pin it through the controller
handoff, and continue only from the first missing rendered row.

### 2026-10-10 P9-11 bounded controller-closeout continuation

Product identity remains `3cddf327fe4c9aa9310f578bc9a59f71bea0c67a`; this
evidence-only descendant remains clean. The controller rebound the existing
normal archive/install (archive SHA-256
`36361323e16e1952be188a24a99f931d7de6531e2c755195eb3e5aa0b4d2aaf3`) to
the repaired persistent driver without a verifier build, pack, or install.
Each retained closeout below used fresh application and browser profiles.

At `closeout-2026-10-10T14-30-00Z`, the installed public
`node-wasm-first-subsequent`, `serialized-zero-replay`, `bounded-long-state`,
and `stake-uint64-total` commands exited `0` with all owned process and stdio
resources drained. The rendered driver then used the visible `Your projects`
import form to check and add that same-profile `rare-stake` export, opened its
`Game export` Overview, and activated `Build/Export`. Its action-local
transcript is `stake-uint64-total.rendered.transcript.json` in that run
directory. The closeout rejected this partial result only because the driver's
served-asset receipt initially named the root and API response rather than the
archive's `dist/cli/studio-client/{index.html,assets/...}` files. The bytes
matched; the driver was corrected before another launch.

The two latest fresh-profile Stake import probes (`14-50-00Z` and `15-00-00Z`)
retained an accepted visible `Check game` activation but no rendered recognition
terminal or local rendered error before their bounded acceptance probes
expired. This is driver/readiness-inconclusive, not a product finding. The
current driver also has no implemented action-local itinerary for the pending
occupied-destination and five-persona rows, so no complete closeout, P909/P910
execution, focus assessment, or campaign acceptance is claimed. The compact
failure/transcript records under the assigned harness preserve the commands,
candidate/archive identities, terminal exit and cleanup; no generated runtime
payload is committed here.

### 2026-10-10 P9-11 controller-closeout retry: shared display repair

The candidate product identity remains `3cddf327fe4c9aa9310f578bc9a59f71bea0c67a`.
The persistent controller-pinned driver was repaired in place so the neutral
child-owned display is passed to both installed Studio and Chromium; its new
SHA-256 is `ff5aca6ed1cdebd7cf3398740be8a12985b926a82ad88d8ab80c6d8ac5f1f34f`.
The controller rebound the existing authenticated archive/install to that exact
driver without a verifier build, pack, or install. The resulting handoff is
`controller-candidates/3cddf327fe4c9aa9310f578bc9a59f71bea0c67a-ff5aca6ed1cdebd7cf3398740be8a12985b926a82ad88d8ab80c6d8ac5f1f34f/output/handoff.json`
with SHA-256 `8fd55b88f23679d583b872575d02e3c280bbbc0358d4adec689920923da81436`.

One bounded closeout at `closeout-2026-10-10T15-30-00Z` reused that delivery.
Its installed public `node-wasm-first-subsequent`, `serialized-zero-replay`,
`bounded-long-state`, and `stake-uint64-total` commands all exited 0 with
process trees, resources, and stdio drained. The first rendered Stake import
then reached the visible `Check game` action, but no action-local recognized,
registered, or error terminal rendered before its bounded acceptance probe
expired. `failed.json` and `stake-uint64-total.rendered.transcript.json` in
that run retain the exact command, candidate/archive/profile identities, exit
1, and drained child ledger. This is a driver/readiness-inconclusive result,
not a product finding: no rendered product error or false success claim was
observed. The outstanding occupied-destination and five-persona itineraries
remain not reached; no focus/image acceptance, P909/P910 closeout, official
gate, publication, or campaign acceptance is claimed.

### 2026-10-10 P9-11 bounded driver inspection: destination producer absent

The exact product identity remains `3cddf327fe4c9aa9310f578bc9a59f71bea0c67a`;
this evidence-only descendant was `f72acb76648774cdc248cec13d1ea9972938ae74`
before this bounded evidence append. The controller's retained normal
archive/install was inspected without a build, pack, install, official gate, or
consolidated closeout. The controller inspection envelope authenticated the
same archive SHA-256
`36361323e16e1952be188a24a99f931d7de6531e2c755195eb3e5aa0b4d2aaf3` and
reported that the persistent driver still implements only
`stake.recognized-studio`; it did not grant collection admission.

One fresh-profile inspection of the missing `occupied-destination` itinerary
then activated the public `Create game` control exactly once. Its local
pending save/open state settled at the public Overview with
`project-open-materialization · Completed`; the retained compact transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-94e3b3bca933a5b9/inspection-2026-10-10T13-18-00Z/occupied-destination.rendered.transcript.json`.
The rendered Overview offered `Build/Export`, but not the required
`BlueprintBuildPanel` `Build Preview` / `Build Package` controls or their
destination input. This is not a selector or browser-readiness conclusion:
the current candidate's `HomePage.tsx` always renders its public
`BlueprintEditorPage` with `guided`, while `BlueprintEditorPage.tsx` mounts
`BlueprintBuildPanel` only under `!guided`. The only Home recovery producer for
the otherwise-hidden panel is a retained `design-build` job; the fresh public
flow created only `project-open-materialization` and therefore produced no
such record.

Consequently the closeout consumer's required
`destination.design-build` action has no authentic public producer in the
fresh-profile candidate workflow. No fake action receipt, controller receipt,
driver coverage declaration, or product terminal was created. The required
occupied-destination row and all dependent closeout rows remain not reached;
the actionable correction is to expose or authentically produce the
`design-build` recovery path, then repair and repin the persistent driver
before another closeout admission.

### 2026-10-10 P9-11 corrected reachability-report boundary

This is a report-format correction only. The retained finding remains a P1
against product candidate `3cddf327fe4c9aa9310f578bc9a59f71bea0c67a`; no
public workflow, build, test, Studio launch, or product/test edit occurred.
The evidence descendant was clean before this bounded README append. The
report's reachability proof is: required control `BlueprintBuildPanel`'s
rendered `Build Preview` / `Build Package` destination controls; entry paths
checked `Home Design: Create game → public Overview → Build/Export` and
`Home retained-job recovery: design-build`; rendered evidence
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-94e3b3bca933a5b9/inspection-2026-10-10T13-18-00Z/occupied-destination.rendered.transcript.json`;
and source paths
`cli/studio-client/src/components/home/HomePage.tsx` and
`cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx`.
The source boundary is that `HomePage` mounts the public editor with `guided`,
while `BlueprintEditorPage` mounts `BlueprintBuildPanel` only when `!guided`;
the only retained recovery branch for `design-build` requires an already
existing design-build job. A fresh public `Create game` produces only
`project-open-materialization`, so it cannot produce that prerequisite. This
is source-backed reachability proof, not an invented action correlation or a
driver timeout.

Reviewed against the P9-05 task base `aeec51e8ee09df6f6ef8b2273120fa61ae794822` and its focused correction.
Observed implementation, historical agreement/deferral, and release scope are separate columns. Documenting
an outstanding finding does not close it or introduce a milestone to implement all these directions.
“Not found” means absent from the reviewed source/capability surfaces, not proof of a historical deferral.

| Direction | Observed implementation | Agreement / historical decision | Release scope certainty and evidence |
| --- | --- | --- | --- |
| Canonical artifact CLI | Implemented; public artifact production uses `build --target`, with nested `par export` retained | P9-04 correction | [Canonical CLI evidence](canonical-cli.md); public `export` was removed |
| Valera Programmer cold CLI workflow | P9-06 executable scenario and WASM sim/replay help correction | Bounded independent first-time developer audit | [Correction ledger and supplementary transcript](valera-programmer.md); independent installation/browser receipts remain controller-owned, not claimed by the implementer |
| Compact WASM continuation and RNG replay | Implemented bounded continuation and explicit trace/replay primitives | P9-02 compact state / P9-01 RNG/replay corrections | [Compact state](compact-wasm-state.md), [RNG/replay](rng-replay.md); no universal mechanics equivalence claim |
| Stake exact aggregate weights/probabilities | Implemented exact BigInt weight accounting and bounded decimal probability presentation | P9-03 correction | [Stake probabilities](stake-probabilities.md); numeric ID/payout limits remain below |
| Studio destination truthfulness (finding F) | Product correction: new/empty directory recovery, current-preview authorization, repeat/default resolution, and protected file companions | P9-05 accepted new-artifact policy | [Destination closure ledger](destination-ux.md); independent browser proof is controller-owned and pending, not claimed here |
| WASM mechanics / calculation path | Partial: module-generated packed stops plus a separate JS win evaluator; supported line-win subset only | P9-05 truthfulness correction | [Shipped boundary](../wasm-compatibility-boundary.md), [builder](../../src/project/WasmArtifactBuilder.ts), [evaluator](../../src/wasm/PokieWasmRuntime.ts); no full-mechanics compiler or one shared calculation path |
| Math Targeting/Optimization | Agreed but **not implemented** in the reviewed repository | Agreement supplied by the immutable campaign brief; repository absence does not establish deferral | **Unconfirmed release scope**; no post-v2 deferral inferred. [Manual math workflow](../math-modeling.md) measures and iterates rather than optimizes targets automatically |
| Explicit overscan model | **Not found** | No historical deferral established | Unconfirmed; [Blueprint](../../src/generated/GameBlueprint.ts) reel strips/rows and resizable grids do not supply an explicit overscan model |
| Feature analytics | **Partial** | No full completion or new deferral claimed | [Accumulator](../../src/simulation/SimulationAccumulator.ts), [report](../../src/reporting/SimulationReport.ts), [outcome-event analysis](../../src/stakeengine/standalone/StakeEngineStandaloneAnalyzer.ts) provide aggregates, breakdowns, and weighted classified events; not complete feature analytics |
| Certification dossier | **Partial** | Evidence bundle workflow implemented; complete dossier not established | [Builder](../../src/certification/CertificationEvidenceBundleBuilder.ts), [validator](../../src/certification/CertificationEvidenceBundleValidator.ts), [verifier](../../src/certification/CertificationEvidenceBundleVerifier.ts), [CLI/Studio documentation](../certification-evidence-bundle.md) are engineering evidence primitives |
| Blueprint mechanics authoring | **Partial** | No all-mechanics completion or new deferral claimed | [Schema](../../src/generated/GameBlueprint.ts) and [editor](../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx) support win models, freeGames, and bet modes; not every composable runtime mechanic |
| Generic math-definition diff | **Partial** | No arbitrary-model comparison completion claimed | [Report differ](../../src/diff/SimulationReportDiffer.ts), [Outcome/Stake source differ](../../src/project/diffOutcomeSourceProjects.ts), [DiffCommand](../../cli/commands/DiffCommand.ts) compare defined report/source contracts, not arbitrary math definitions |
| Generic reachability checker | **Partial** | No generic mechanics/state checker completion claimed | [Blueprint validator](../../src/generated/GameBlueprintValidator.ts) checks referenced symbols against reel strips/generation/weights and paytable; limited symbol/reel/paytable coverage |
| Stake numeric IDs / raw integer payouts | Implemented **safe-number subset**, not complete UInt64 | Existing format boundary preserved | Nonnegative safe numbers bounded by `Number.MAX_SAFE_INTEGER` = **9007199254740991**. [ID parser](../../src/stakeengine/internal/parseStakeEngineOutcomeId.ts), [payout conversion](../../src/stakeengine/internal/convertRatioToStakeUnits.ts). Standalone positive UInt64 weights and exact BigInt aggregate totals are separate [contracts](../stake-engine-standalone.md) |
| YAML / PDF formats | **Not found** in reviewed authored/report capabilities | No new formats or historical deferral inferred | Existing Blueprint JSON, report JSON/Markdown/HTML, and PAR workbook support: [ReportCommand](../../cli/commands/ReportCommand.ts), [PAR exchange](../cli.md). These do not imply YAML authoring or PDF reports |
| Docs site / playground | Absent; explicitly deferred | **Explicit v2 deferral** in [historical closeout](../v1.3-closeout-report.md#deferred-to-v20) | Preserve that historical decision; current Markdown docs are not the site/playground |
| True cross-store atomicity | Not implemented; compensation/reconciliation exist | **Explicit v2 deferral** in [historical closeout](../v1.3-closeout-report.md#deferred-to-v20) | [Spin handling boundary](../cli.md#failure-handling-is-best-effort-compensation-not-a-transaction); compensation is not a transaction across wallet/session/idempotency stores |
| Cloud / private RGS | **Hypotheses**, not implemented products | No release commitment established | Local serve/dev and [External Adapter SDK](../external-adapter-sdk.md) are existing primitives, not evidence of Cloud or private RGS |

Property-based tests and golden-output snapshots are implemented, as the immutable
[historical v1.3 closeout](../v1.3-closeout-report.md#below-priority-infrastructure-gaps--resolved) records.
The maintained CLI “What's next” summary now reflects that history. Earlier campaign evidence and the closeout
are retained unchanged; this register does not retroactively change their candidate identities or conclusions.


### P9-11 guided Design package reachability repair (independent retest pending)

The saved destination-producer finding and its transcript locator above are
preserved. Source tracing on task HEAD `a7ec4d73de2b2e10b09eaa8cdf26c285f8006562`
confirmed the exact defect before editing: Home always selected `guided`, and
`!guided` excluded the build panel even after opening advanced options. Create
game still saves and opens Overview; that project-opening job could not create
the required Design build recovery record.

Home → Start a game → Show advanced options now mounts the existing
BlueprintBuildPanel with its editable/browsable destination, Build Preview and
Build Package. A fresh validated draft can produce a Design package without a
saved source or retained job. The same panel handles retained Design build
recovery, restores its captured output directory, and requires explicit
submission. PAR export recovery restores its draft without putting a workbook
file path into the package output directory. The primary Create game path and
workspace Build/Export remain available.

The traced production path is editor → existing API client → StudioServer's
build-preview/build handlers → StudioBlueprintService's prepared planner and
GamePackageGenerator. No alternate writer or job producer was introduced.
Guided publication requires current successful validation, applied JSON, no
source drift and no pending save/open; Preview stays read-only. The server
retains structural validation, source/internal-directory and occupied-output
protection, cancellation, registration rollback and durable Home job ownership.
The real HTTP regression publishes the fresh draft, reads its completed
`design-build` job and exact captured request, rejects repeat publication without
changing package bytes, and publishes a new destination.

| Accumulated finding / immutable acceptance row | Current correction authority and remaining proof |
| --- | --- |
| Missing fresh producer and retained Design build recovery | [Routed Home controls, occupied-path/new-path result and explicit recovery](../../tests/cli/studio-client/src/components/home/HomePage.test.tsx); [guided invalid/error/JSON/source-drift guards](../../tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.guidedBuild.test.tsx); [real HTTP sentinel/race and persisted job](../../tests/cli/studio/StudioDestinationWorkflow.integration.test.ts). Product correction implemented; installed rendered `destination.design-build` and subsequent exact coverage remain pending controller collection. |
| Shared-candidate CommonJS import and packaging descendant/stdio drainage | Existing native loader branches and launch ownership preserved; [closeout cleanup and failure-receipt regressions](../../tests/scripts/p9-11-corrective-closeout.test.mjs) pass. Both real packaging suites remain controller-owned consuming boundaries. |
| Missing authenticated producer handoff | Existing producer integration preserved; [producer delivery/pin/reuse/failure contract](../../tests/scripts/p9-11-produce-candidate.test.mjs) passes. Prior authenticated delivery remains historical; these changed product bytes require a new exact-candidate delivery. |
| All six public corrective repros on one normally built/packed candidate | Existing six-row index and exact action coverage above remain authoritative. Local destination regressions pass; all six installed-candidate proofs remain pending the new controller candidate. No historical runtime/Stake/canonical receipt is relabelled. |
| Five independent personas, initial observations, affected retests and P909/P910 | All original documents and dispositions preserved. Five isolated final smokes and authenticated P909/P910 obligations remain pending controller execution. |
| Inspectable images, transition-local focus bounds, served assets and cleanup | Existing closeout action-versus-finding/image/asset/drain validators preserved and focused contract tests pass. Actual independently inspected rendered receipts remain pending. |
| Single release/packaging boundary, integration/push/publication and Drive round-trip | Controller-owned and pending. Wider roadmap gaps retain their previous truthful status; this implementation report does not complete the campaign. |

Foreground checks: routed Home, BlueprintBuildPanel, guided creation, sectioned
editor, guided build safety and real HTTP destination suites all pass on the
final source; producer and closeout contract suites pass. Root `npm run typecheck`
passes and includes `typecheck-studio-client` once. Initial new-test fixture
mistakes (starter version and a raw-error display expectation) were corrected
before the passing results. Existing sectioned-editor tests emit React `act`
warnings but pass. The Studio production bundle (`npm run build-studio-client`),
normal build/pack/install, independent browser/CLI closeout and official gates
were not run by this bounded worker; they remain controller-owned checks on
the committed SHA. No prior evidence was rewritten, removed or recollected.

### P9-11 Design draft identity and recovery isolation repair

Review of `b4e4bb5ff3da5c732b54c74e276564fe5f1c1ca3` (finding
`f7014303e1a68ec0`) found fabricated unsaved-source provenance and recovery that
could discard dirty content or inherit another draft's state. The prior
reachability observations and all completed-step evidence above remain intact.

Design build and PAR export now use a content-bound durable draft identity when
no source file was supplied, while publication receives no source path. A valid
unsaved design named `blueprint` previews and builds into its missing or empty
default directory. Real source paths retain their safety and provenance contracts.
Home confirms dirty recovery before its route transition; standalone editor and
stored-draft recovery also confirm before replacement. Cancellation preserves
form/JSON content and the recovery slot. Recovery invalidates prior source and
Load/Save responses, removes previous drift, overwrite authority and unrelated
PAR provenance, and retains unsaved status. Its destination belongs to the
recovered draft and clears on New/Load; selecting the same retained job again
reconstructs it without publishing automatically.

| Saved failure | Current product regression authority |
| --- | --- |
| Unsaved `blueprint` source-self failure and fabricated provenance, including sibling PAR export | [Real HTTP default, durable request/provenance, real-source/internal guards and occupancy race](../../tests/cli/studio/StudioDestinationWorkflow.integration.test.ts); [existing publication and registration rollback contracts](../../tests/cli/studio/blueprint/StudioBlueprintService.test.ts). |
| Dirty form/JSON silently replaced by retained recovery | [Routed cancellation/confirmation and retained storage](../../tests/cli/studio-client/src/components/home/HomePage.test.tsx); [standalone job/stored-draft cancellation](../../tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.guidedBuild.test.tsx); [existing navigation guard contracts](../../tests/cli/studio-client/src/designNavigationGuard.test.tsx). |
| Recovery inherits old source drift, late responses, overwrite/PAR authority or destination | [Drift, outstanding source/Load/Save/managed-save responses, exact save payload and New/Load destination reset](../../tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.guidedBuild.test.tsx); routed same-job recovery after New in Home's regression above. |

The bounded worker ran these five whole files together through `test:targeted`
(136 tests passed), root `npm run typecheck` (including the Studio compiler once),
and the clone's changed-file ESLint commit hook. Earlier new-test assertions were
corrected for existing API payloads, preview diagnostics and modal visibility
before the passing run. Existing navigation tests emit React `act` warnings.
The source correction is handed off in its `[P9-11]` commit; it does not provide
new packed-candidate or rendered receipts. The six exact-candidate corrective
repros, five isolated persona final smokes and authenticated P909/P910 obligations,
production bundle/build/package boundaries, release/integration/push/publication,
Drive round-trip and campaign completion remain pending controller-owned work,
as indexed above. Prior loader/producer/drainage corrections remain unchanged.

### P9-11 asynchronous draft replacement isolation repair

Finding `45fafbdbee49e426` against `31e1d7977f7198d41511f04490cceca08158b833`
was traced through the shared reset, every New/Load/Undo/PAR/recovery caller,
the panel's preview/publication callbacks and both save paths. Delayed-response
regressions reproduced the old panel submitting after unmount and attaching A's
build to recovered B or a New/Load replacement before the correction.

Panel cleanup now invalidates preview authorization and suppresses abandoned
panel effects. An event-time draft check also rejects continuations before
remount cleanup runs; the parent checks the submitting identity before attaching
a snapshot or revalidating. Submitted requests are not aborted or cancelled:
StudioServer's existing durable operation still records the truthful terminal.
Ordinary edits preserve the draft identity and compare against the exact submitted
blueprint. Cancelling the deferred guided save clears its timer reference and
releases its unsubmitted activation's guard. Real Save/managed-save requests keep
that guard until their own finalizer settles.

| Saved failure | Current product regression authority |
| --- | --- |
| Stale fallback/advisory preview and late publication after recovery, New/Load or unmount | [Delayed editor replacements](../../tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.guidedBuild.test.tsx); [unmount, event-time identity and same-draft comparison](../../tests/cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel.test.tsx). Replacement validation, destination, snapshot and restore controls remain isolated; no cancellation is sent for submitted work. |
| Cancelled deferred action locks saving or unlocks another request | Controlled timers in the guided-build file cover recovery and pending Load, subsequent Create game/Save, another replacement during a real Save, and both submitted save paths. |

The two directly affected whole files pass together (51 tests); root
`npm run typecheck` includes the Studio compiler. The clone policy rejected the
standalone Studio typecheck before launch, so the allowed root command supplies
that compiler boundary. The controller retains the complete sibling reviewer
matrix. All prior evidence and loader/producer/cleanup/source/recovery corrections
remain intact. Six installed-candidate repros, five independent final persona
smokes, authenticated P909/P910 execution, the production build/package boundary
and release/integration/push/publication/Drive lifecycle remain pending
controller execution; this source repair does not close those evidence rows.

### 2026-10-10 P9-11 exact-candidate closeout adapter preflight

The independent verifier authenticated product candidate and initial HEAD
`af890c80dde5ab1cf0c85db41fb78cdc7508c3a3` (tree
`e048ab4772c962baf7e4f8296f3a79d580454e2a`) with a clean worktree.  It did
not launch Studio, build, pack, install, invoke an official gate, or publish.

The assigned persistent adapter
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-9a681260c6a73825/current.mjs`
was inspected through its non-launch command:

```text
node "$POKIE_VERIFIER_HARNESS_WORKSPACE/current.mjs" --describe
{"schemaVersion":1,"kind":"verifier-driver-capabilities","coverage":{"stake-uint64-total":["stake.recognized-studio"]}}
exit 0
```

This is a deterministic offline adapter rejection, not a rendered product
observation.  `scripts/p9-11-corrective-closeout.mjs` requires rendered action
coverage for `occupied-destination` and each of the five persona IDs in addition
to Stake.  In contrast, the assigned adapter has a successful result branch only
for `request.id === "stake-uint64-total"`; its other-ID branch terminates with
`no implemented visible itinerary for <id>`.  Thus it cannot produce the
consumer's required action receipts for the exact six-repro/five-persona run.

No `POKIE_P911_CANDIDATE_HANDOFF`/`POKIE_P911_CANDIDATE_HANDOFF_SHA256` delivery
was exported for this invocation.  The candidate reader in
`scripts/p9-11-candidate.mjs` correctly refuses to substitute one: it requires
an absolute pinned handoff containing the normal archive, production build and
install receipts, installation, and hashed driver.  The sole producer,
`scripts/p9-11-produce-candidate.mjs`, can create that handoff only from a
controller-pinned producer configuration and driver; neither was supplied here.
No synthetic receipt, archive, installation, driver authentication, or rendered
action record was created.

The correction boundary is therefore the controller-to-closeout rendered-driver
adapter: implement all required visible itineraries in the retained current
driver, pin that repaired driver with a controller-produced exact-candidate
handoff, then continue from the first missing row.  All acceptance work remains
not reached; this preflight neither repeats nor changes any historical product
finding or final-smoke disposition.

### 2026-10-10 P9-11 controller-handoff recovery preflight

This supersedes only the old statement that no controller adapter was supplied;
it preserves the earlier preflight and does not convert it into candidate
acceptance.  The controller supplied the bounded
`controller-candidate-handoff` adapter and the verifier used its prescribed
non-collection calls against the same persistent driver.  The worktree was
clean at evidence descendant `cec20a0497b092bb613752af3a1a8396363f642d`, and
`af890c80dde5ab1cf0c85db41fb78cdc7508c3a3` is its Git ancestor.  Product
identity remains the latter candidate SHA.

The exact retained commands and terminal diagnostics are:

```text
sha256sum <harness>/current.mjs
53f6aa21ca57e8c28f3bbfc695d01d92b08f42690fa366c4ddb2f9b785b33ef4

controller-candidate-handoff --inspect-existing <harness>/current.mjs 53f6…ef4
exit 1: driver inspection requires an intact retained candidate delivery; no producer launched

controller-candidate-handoff <harness>/current.mjs 53f6…ef4
exit 1: driver preflight incomplete; inspect <harness>/driver-preflights/
53f6aa21ca57e8c28f3bbfc695d01d92b08f42690fa366c4ddb2f9b785b33ef4-
14d84e3424854c318a87a9f26395eabb.json; repair the same current.mjs
itineraries before consolidated closeout: occupied-destination, programmer,
mathematician, producer, ui-ux, graphic-designer.
```

That authenticated preflight record retains the complete required and declared
coverage maps, the `--describe` exit result, and `product_acceptance:
not-observed`.  Its declared map contains only
`stake-uint64-total/stake.recognized-studio`; it has no claim for the six named
missing rows.  No delivery directory, archive, installation, build receipt,
install receipt, or installed public binary exists beneath the controller's
candidate root for this pin.

The actual producer/consumer boundary was traced without scanning runtime
history: `candidate_handoff.py:_driver_preflight` reads
`P911_RENDERED_COVERAGE` from
[`scripts/p9-11-corrective-closeout.mjs`](../../scripts/p9-11-corrective-closeout.mjs),
then runs `current.mjs --describe` before it can create its exact-candidate
source worktree or invoke
[`scripts/p9-11-produce-candidate.mjs`](../../scripts/p9-11-produce-candidate.mjs).
The producer has not failed and no receipt is missing through a product defect:
it has deliberately not run because the candidate-consuming renderer lacks the
required itinerary implementations.  `--inspect-existing` can only expose an
already delivered archive and correctly refuses when that producer output is
absent.  The closeout's consumer validation rejects partial coverage and cannot
accept a synthetic action receipt.

Accordingly, no public workflow launch, Studio launch, build, pack, install,
official gate, publication, browser artifact, or rendered action was performed
in this recovery preflight.  The next verifier-owned action is to repair the
same persistent driver's six visible itineraries, truthfully declare precisely
that implemented coverage, obtain a new controller pin/delivery, and then
collect the one sequential closeout.  Until that happens, the full
exact-candidate closeout criterion remains not reached.

### P9-11 complete rendered adapter implementation repair

Finding `5cafd64253cf60ae` was traced on task HEAD `50fc31d0` against the
retained `53f6aa21…b33ef4-14d84e34…95eabb.json` preflight named above. The
assigned external `current.mjs` has only the Stake result branch and its offline
coverage declaration has only `stake.recognized-studio`. The six missing IDs
therefore reject controller admission before the normal producer can run. The
previous preflights, transcripts, images and all completed-step evidence remain
unchanged; none is relabelled as an observation of this correction.

The committed portable replacement is
[`scripts/p9-11-rendered-driver.mjs`](../../scripts/p9-11-rendered-driver.mjs).
It has executable branches for all seven rendered request IDs and declares
exactly the consumer's full `P911_RENDERED_COVERAGE` in its offline `--describe`.
Every branch begins in its own fresh profile, consumes the supplied installed
bin, performs native keyboard/input actions and checks its own HTTP responses,
rendered terminal and persisted bytes before writing action receipts. It does
not build, pack, install, publish, rerun a broad readiness matrix, or promote a
finding/unreached/blocked result into passed coverage. The Stake branch now
checks the recognized source's actual public Studio analysis, including rare
moments, against its same-profile public scenario rather than substituting CLI
analysis as a Studio observation.

| Accumulated failure / immutable row | Current closure authority and pending consuming proof |
| --- | --- |
| Missing occupied-destination itinerary / fresh Design producer | Native Home advanced Design controls, occupied Preview and guarded Build activation, original sentinel readback, edited new-path Preview/publication and durable job, then public preview/publication occupancy race with a second sentinel. Existing source/recovery/draft-identity protections are preserved. Installed rendered execution remains pending. |
| Missing programmer itinerary / stale dependent Stake plan | Public startup help and canonical PAR build/readback; ordinary Outcome library Build; replacement generate→reuse plan with changed operation identity; exactly one Stake submission, its own completed job/output, borrowed prerequisite provenance and unchanged manifest hash. Existing real-service handoff regressions remain authoritative for the retained bounded-generation defect. Final independent smoke remains pending. |
| Missing mathematician itinerary / durable replay selection | Saved model/PAR bytes; native-library draw with seed; exact rendered Recent row ID/seed/mode/time; explicit selected-record comparison; same durable record after closing/reopening the library. Final independent smoke remains pending. |
| Missing producer itinerary / actual local result | Native Paytable edit persisted in the saved design, structural validation, one settled real Spin with wallet accounting, retained round image, useful next action and observed local-only/non-certification language. Final independent smoke remains pending. |
| Missing UI/UX itinerary / P909 obligation | One actual-progress job through reload and visible offline/reconnection, one submission, own completed report, native recovery focus with viewport bounds, second-project isolation and original-project job readback. This is the short final smoke; controller authentication/execution of the original frozen P909 obligation remains pending and cannot be replaced by it. |
| Missing graphic itinerary / P910 obligation | Native Home sections, project/build/running-job images, native Cancel focus, exact common-card object retained into terminal, Review/report/Recent-runs layout settling, local bounds/viewport and actual PNG outline pixels, then a second settled focus check. Independent image judgment and authenticated original P910 execution remain pending. |
| Earlier native shared-install loader, packaging cleanup, producer integration, unsaved source/recovery and asynchronous draft replacement defects | Existing native-ESM consumers, signed launch ownership/drainage, pinned normal producer and guarded coherent draft replacement remain in their established production call paths. No alternate writer, submission route or dependency default was introduced. Producer/closeout contract regressions pass; the real package/build consuming boundary remains controller-owned. |
| Exact six-repro/five-profile candidate, historical originals, release/publication/Drive and complete owned-resource drainage | Original six public scenarios, exact handoff reader and consumer validators remain unchanged. The driver retains action-local receipts and screenshots outside ephemeral profiles, hashes actual served assets, drains launch-owned groups and inherited stdio before writing its result; the enclosing signed closeout additionally authenticates and drains all owned descendants/resources. Actual candidate delivery, collection, official lifecycle and campaign completion remain pending controller execution. |

Worker verification: root `npm run typecheck` passed, including the Studio
compiler once. The complete directly relevant command passed **3 suites / 69
tests**:

```sh
npm run test:targeted -- tests/scripts/p9-11-rendered-driver.test.mjs tests/scripts/p9-11-corrective-closeout.test.mjs tests/scripts/p9-11-produce-candidate.test.mjs
```

These are implementation contracts, never acceptance receipts. They exercise
every implemented branch against the exact consumer coverage/classification,
rejected publication, changed sentinels/manifests, stale plans, incorrect
provenance/accounting, duplicate/isolation failures, missing/clipped/stolen
focus, unpainted PNGs, root-before-descendant cleanup and inherited-stdio failure.
The first run's two test-fixture mistakes (a completed CLI help action before an
unreachable later control, and an incorrectly positioned fixture outline) were
corrected before the passing run. Concurrent verification was rejected by the
clone policy before Jest launch; the passing commands ran sequentially.

The external persistent harness is outside this task's writable scope. The
worker has committed its single-file replacement here; the controller must
install these exact bytes at the **same assigned `current.mjs` path**, obtain
its new SHA-256 pin and run its admission/normal producer once. No external
driver, pin, delivery, archive, installation or receipt was edited or fabricated
by this worker. See the [controller installation boundary](p9-11-closeout.md#p9-11-rendered-adapter-installation).
This implementation handoff does not mark P9-11 or the campaign complete.


### P9-11 current-Studio rendered driver correction

Reviewer finding `706091c10ac6f4a8` / `sha256:609cbdcd048a9523` was traced
against `3c0661a0274d16892db0500736ee7c1dd0ac15e8`. The preceding adapter
implementation entry describes that historical implementation, not runnable
acceptance. This correction supersedes its obsolete Outcome-card route and
five-image collection contract; retained observations and completed-step
artifacts are unchanged.

| Failed row | Corrected implementation and focused proof | Acceptance still pending |
| --- | --- | --- |
| Programmer/mathematician absent Outcome artifact controls | Both use the configurable generator, explicit sample/seed, its own completed job and manifest readback, then **Inspect library**. No Blueprint Outcome registry card is restored. The real-service Outcome-to-Stake test now follows these controls and reaches its own successful Stake terminal. | Same-candidate independent persona smokes. |
| Refreshed Stake plan and borrowed manifest | The Blueprint's prepared operation refreshes after generation. Inspect opens the exact generated library; its new Stake plan binds that source and is submitted once. Native-library conversion truthfully reports `route: publish`, `disposition: none` (no managed prerequisite allocation). Its plan identifies the caller-owned library consumed read-only, and the original manifest hash remains unchanged. This does not claim configurable samples satisfy the different automatic managed-library policy or relabel `publish` as `reuse`. Existing managed-reuse regression authorities are unchanged. | Independent action-local source/operation/output and manifest receipts. |
| Browser launcher HOME overwritten | Studio receives persona HOME/XDG/Documents; Chromium retains the controller helper's launch environment and has persona-specific user-data and disk-cache directories. Real executable startup fixtures exercise `main`, readiness, environment/argv, stale-request rejection, bounded failure and drainage. | Actual controller browser launch and collection. |
| Uncontrolled Play/simulation inputs | Explicit Play seed/bet and simulation seed/rounds/workers are checked against actual POST bodies. Play checks recorded round provenance/accounting; both simulations check durable job requests and report inputs. Generator input checks also reach the saved manifest. | Installed-candidate results and retained receipts. |
| API-only rare-event presentation assertion | Actual Overview table headers/mode/cells must contain positive, numerically matching RTP and hit-frequency percentages before `stake.recognized-studio` is recorded. Correct API metrics cannot mask missing/zero/wrong rendered values. | Independent recognized-source Overview observation. |
| Missing expanded Home form, viewports and excessive graphic images | Four lossless contact sheets: Home sections plus expanded Design Build at 1100×800, 900×700, 390×844; project Overview plus Build/Export at those sizes; running job; settled common card at 1100×800 and 390×844. Panel-local route/viewport/bounds and offsets accompany images. Native roving tabs return before resize, phone navigation opens normally, and the first settled focus observation is retained before resize without refocusing the card. Both settled panels require actual outline pixels. | Independent image inspection and authenticated original P910 execution; no visual approval inferred from tests. |
| Permissive DOM/describe-only tests | DOM-backed itineraries reject absent/disabled controls, wrong inputs, persisted/rendered-value failures and incomplete exact action/classification coverage. Executable startup uses real short-lived test children; the HTTP component test uses a real generated runtime, generator, planner, writer and persisted jobs. | Controller's independent reviewer matrix and exact-candidate execution. |

Permitted foreground verification passed **2 whole suites / 62 tests**, and
root typecheck passed (including the Studio compiler once):

```sh
npm run test:targeted -- tests/scripts/p9-11-rendered-driver.test.mjs tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeStakeHandoff.test.tsx
npm run typecheck
```

Test fixtures are implementation checks, removed after use, never independent
verification transcripts. The worker ran no real browser collector, candidate
build/pack, official gate, publication or external-harness mutation. Earlier
producer/authentication, native packaging loaders, descendant drainage,
source-identity and guarded draft-replacement corrections remain unchanged.
All six exact public repros, five isolated final smokes, authenticated original
P909/P910 obligations and image judgment still require the controller's pinned
normal candidate. Release/packaging, post-merge checks, integration/push,
publication, Drive read-back and campaign completion remain controller-owned
and pending. The [installation boundary](p9-11-closeout.md#p9-11-rendered-adapter-installation)
requires a new pin for this committed driver before that collection.

### P9-11 native producer and dependent Stake repair

The reviewer findings `P9-11-PRODUCER-ROVING` and
`P9-11-DEPENDENT-STAKE` supersede the acceptance claims in the preceding
driver ledger. Its direct native-library `publish/none` workflow is valid
functionality, but cannot prove the original Blueprint's dependent handoff.
Historical observations and completed-step receipts remain intact.

| Finding | Bounded implementation and regression proof | Controller acceptance still pending |
| --- | --- | --- |
| Inactive Paytable is unreachable with Tab | [Rendered driver](../../scripts/p9-11-rendered-driver.mjs) focuses the selected design tab, uses ArrowRight, verifies Paytable selection and its visible associated panel, then reaches that panel's payout field with native Tab. [Driver tests](../../tests/scripts/p9-11-rendered-driver.test.mjs) exercise the production focus helper with sequential tab stops and native tab-key handlers: Tab-only and wrong-panel routes fail; no target is made focusable to pass the test. | Fresh Home on the pinned installed candidate; independent native keyboard and saved-design observation. |
| Programmer switches projects before dependent Build | The public automatic Outcome build establishes a compatible prerequisite after the configurable sample check. The original Blueprint's Build/Export card refreshes to `reuse`, submits its new prepared operation once, and must reach its own successful terminal with selected `borrowed` provenance and identical prerequisite manifest bytes. [Real-service handoff test](../../tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeStakeHandoff.test.tsx) covers the disabled replacement plan and first Build. No duplicate Outcome artifact card is restored. | Same-candidate isolated programmer smoke and action-local operation, terminal, provenance and byte receipts. |
| Direct publication accepted as dependent proof | [Closeout contract](../../scripts/p9-11-corrective-closeout.mjs) binds original Blueprint identity, distinct refreshed/submitted operation, own terminal job, managed reuse and selected borrowed prerequisite. [Contract tests](../../tests/scripts/p9-11-corrective-closeout.test.mjs) reject `publish/none`, project switches, stale operations, sibling terminals, duplicate submissions and altered manifests. | Independent contract consumption and mandatory reviewer retest. |

The bounded foreground checks for this repair passed: the three whole files
above through `npm run test:targeted` (**3 suites / 95 tests**), plus root
`npm run typecheck` (including the Studio compiler once). The component suite
emitted React `act` warnings while passing. The committed worker report supplies
the exact command outcomes. Unchanged deterministic inputs, rare
Overview presentation, four-sheet image budget, isolation, candidate delivery
and bounded cleanup assertions remain in their existing regression authorities.

Implementation coverage does not close immutable criteria 1–3. Exact-candidate
six-repro collection, five independent final persona smokes, authenticated
P909/P910 execution, image review, official release/packaging, post-merge
checks, develop integration/push/publication, Drive round-trip and controller
cleanup/completion receipts remain **pending controller execution**. The
controller must install and pin the new driver bytes before collecting them.

### 2026-10-10 P9-11 exact-candidate corrective closeout finding

Product identity is `a54db9890a70b0f6ecb1cfe73eafa85b56c08bab`; this report
was produced from its clean evidence-only descendant
`b0311dfbd8053fe7b040621c0424527075b8f7e2`. The controller-authenticated
normal archive/install was reused without another build or install (archive
SHA-256 `0d4a7fc50984b2f7c06a430fae7f86cdb582d3c640a0e345d0d138c20038d3fa`).
The final controller handoff pin was
`18331dd3b97aab24222c00172f9f3133475fb4ed28a7dfd3fb72a50beecddd44` and
the repaired persistent driver SHA-256 was
`d478b2b714c11dd51116e1f8255346819606bbc02f2530fa7af9b26b5035dd74`.

The bounded final closeout reached and cleanly drained the installed public
`node-wasm-first-subsequent`, `serialized-zero-replay`, `bounded-long-state`,
and `stake-uint64-total` scenarios. Its isolated rendered Stake observation
also passed: Studio opened the real recognized export and rendered non-zero
`2^-64` metrics. The retained runtime result checksum is
`22d24df362782c5ec9536a2c5f049815ec0ca772c2e0f97eff82abed5bb85aca`; its
action-receipt checksum is
`2a67ceae61abeee4a1c2a01ab9320d5d23df845b6ee83f4de11b5433daa15d20`.

`canonical-cli` then failed before any remaining scenario or persona smoke:
the installed public help advertises `help [command]` beneath `certification`,
but the exact command `pokie certification help --help` exited `1` with the
Certification usage/error instead of successful nested help. The complete
bounded failure receipt is retained only in the assigned runtime harness at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-11-bcb0e775c099475e/final-complete-closeout-a54db9890a70b0f6ecb1cfe73eafa85b56c08bab-d478b2b714c11dd51116e1f8255346819606bbc02f2530fa7af9b26b5035dd74/failed.json`
(SHA-256 `615f173bf931dafe5d3b6ebabbe5cf24cf77f67bc8f4f1f9b7a9ddb1187e60ae`).
All owned processes, resources, and stdio were drained.

This is a candidate-owned CLI defect, not a browser-driver result: the public
closeout consumer at `scripts/p9-11-corrective-scenarios.mjs:214-221` obtains
the advertised verbs and invokes every nested help command. The installed
consumer is projected from `cli/commands/CertificationCommand.ts:87-125`,
whose `run()` assigns verb diagnostics only for `build` and `verify` before
translating the remaining Commander error into the no-command usage failure.
The Commander factory supplies the visible `help` command at
`cli/commands/internal/CommanderCliAdapter.ts:24-25`. The defect blocks the
required all-six-corrective-scenarios row; occupied-destination and all five
persona smokes are not reached. No visual disposition, controller gate,
publication, or acceptance result is claimed.

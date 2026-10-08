# P9-05: Studio destination correction

Candidate base: `aeec51e8ee09df6f6ef8b2273120fa61ae794822`.
Changed product/test content fingerprint (SHA-256 of sorted path, NUL, bytes, NUL;
all changed `src/`, `cli/`, and `tests/` files, including the new integration test):
`09e671946a27a7f314e3ee90c8d1eb1ab9cedc3d3479a62a3d9e91734b4e63e4`.
The task's committed-result report identifies the final commit and command outcomes.

## Original finding and trace

Finding F supplied in the immutable brief says the rendered Blueprint build UI authorizes overwrite
while the backend refuses an occupied directory. On the recorded base, this read-only command confirmed
both branches in the actual panel (lines 328 and 334):

```sh
git show aeec51e8ee09df6f6ef8b2273120fa61ae794822:cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel.tsx | rg -n 'Rebuild and overwrite|create/update files|confirmIfDestination'
```

The branch text was `Rebuild and overwrite it?` and `Building will create/update files there. Continue?`.
The same fallback also invoked `doBuild()` for described non-ok previews. The shared guard,
`assertArtifactDestinationAvailable`, rejects files and nonempty directories. Earlier
[P5 destination evidence](../phase5-post-audit/evidence/02-blueprint-build-destination.txt) and
[workflow observations](../phase5-post-audit/evidence/05-blueprint-build-destination-workflow.txt)
were read as prior history and remain unchanged; they are not current-candidate browser proof.

## Closure ledger and focused observations

| Requirement | Correction and observed focused check |
| --- | --- |
| Occupied destination, actionable recovery | Both overwrite confirmations removed; editable path and host Browse remain. Panel tests refuse preview conflicts with no build call/Confirm button, then successfully publish to another destination |
| New/empty versus files/unsafe/unreadable | Preview reports distinct states and diagnostics through the unchanged prepared-publication guard. Tests cover empty/new directories, zero-byte and populated files, source/self/descendant, symlink aliases, protected roots, and unreadable directories |
| Invalid/stale/concurrent checks | Only current successful available previews authorize build. Tests cover invalid/load-error/network responses, sourcePath/Blueprint/output edits, out-of-order same-identity requests, and duplicate Build clicks |
| Default/relative/picker/repeated output | HTTP builds resolve omitted output to the preview's manifest-id destination; relative paths resolve consistently. Tests build with omitted output, refuse its repeat unchanged, and send the host picker selection to preview/build |
| Provenance and dirty source | Prior snapshot survives conflicts/failures; building does not invoke source-save bookkeeping. Restored/retained-destination panel checks keep the prior artifact and unbuilt-change notice; Home and Design PAR tests cover recovery/dirty state |
| Advisory preview and occupancy race | Real HTTP test previews a missing path, writes a sentinel before build, and observes refusal with identical bytes; retry to a new path succeeds |
| Neighboring Build/Export, PAR, WASM | Build/Export still disables conflict previews and presents the server's specific preflight detail; its generic label no longer asserts that every conflict is directory content. HTTP Design PAR refuses an existing zero-byte workbook even with legacy overwrite=true; fresh export succeeds. Real artifact service/registry checks refuse existing WASM files, sidecars, and PAR import companions without mutation |
| Cancellation/registration/cleanup | Existing generator/service/WASM tests retain staging, cancellation, rollback and registration checks. Added Blueprint service checks retain borrowed empty directories on registration failure, preserve unrelated user content on cleanup failure, expose that failure, and leave pre-cancelled output empty |
| WASM product truth | Shared browser-safe boundary prose feeds product contract, CLI inspection/registry descriptors, dashboard and Build/Export. Focused checks reject unsupported sources and permit corrected retry; exactly 30 stop bits executes through the file runtime and 31 bits emits no module/sidecar. Golden tests cover the supported subset only |
| Wider status truth | [Status register](README.md) separates implementation, agreement/deferral and release scope. Essential limitations also live in npm-shipped top-level docs; no history was rewritten |

The real HTTP fixture uses a worktree-local temporary directory and a loopback Studio server with local
job storage. Its occupied sentinel bytes are `[0, 255, 37, 10]`; after refusal the directory contains only
`sentinel.bin` with identical bytes. The empty destination receives `dist/index.js` and the other generated
package files; a repeat leaves those bytes unchanged. The raced destination retains only its sentinel;
`recovered` receives a successful package. The fixture removes only its own temporary directory after
stopping the server. These are API/filesystem observations, not browser screenshots.

## Verification commands

All required tests are named explicitly here and in the committed-result report. Each command runs in the
foreground; no official gate, packaging smoke, production build or P8 matrix is run by the implementer.
Root typecheck includes the Studio compiler; it is not run a second time independently.

```sh
npm run test:targeted -- tests/cli/BuildCommand.test.ts tests/cli/WasmWorkflow.integration.test.ts tests/cli/commands/ParCommand.test.ts tests/cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx tests/cli/studio-client/src/components/home/HomePage.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.wasmWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts tests/cli/studio/StudioArtifactBuildService.test.ts tests/cli/studio/StudioDestinationWorkflow.integration.test.ts tests/cli/studio/blueprint/StudioBlueprintService.test.ts tests/cli/studio/previewBuildDestination.test.ts tests/generated/GamePackageGenerator.test.ts tests/project/WasmArtifactBuilder.test.ts tests/project/wasm/WasmRuntimeParity.golden.test.ts tests/project/wasm/assessWasmPackagingPreflight.test.ts
npm run typecheck
```

## Independent host rerun — destination conflict and recovery

The candidate is `83757c4c8968226ee342e332ec7fb5f188629fc0`; the checkout used for this evidence was
its clean evidence-only descendant `fd64d3975d9cc3a5a564743811f3339cef9f970e` (the only descendant
change is this report). At 2026-10-08T20:21Z, a fresh profile and fixture were created beneath the assigned
runtime harness. Studio was launched from this source checkout with
`node ./dist/cli/pokie.js --no-open --port 34968`, not the self-dependency in `node_modules`; Chromium
drove only the rendered UI.

Bounded transcript:

```text
LAUNCH candidate Studio at http://127.0.0.1:34968
CLICK Create game
CLICK Build/Export
INPUT TypeScript Game Package Output directory = occupied-fixture
OBSERVE TypeScript Game Package: Status: Choose a different destination;
  Destination unavailable. Choose a different destination; Build will not overwrite it.
OBSERVE its Build control disabled and no Confirm/overwrite control
INPUT TypeScript Game Package Output directory = recovered-output
OBSERVE TypeScript Game Package: Status: Ready to build; Build enabled
CLICK TypeScript Game Package Build
OBSERVE its rendered terminal: Built to recovered-output
```

This is the real Blueprint-derived TypeScript Game Package card in the public `Build/Export` workspace.
The occupied fixture started with only `sentinel.bin`, bytes `00ff250a`, SHA-256
`8b3a89a2ae3f00c5ebf4ffefa94b01f8dce8502f547a90d25022772a9be61762`. After the card's rendered conflict
preflight it still had exactly that one 4-byte file with the same checksum. The card offered its editable
destination field and Browse recovery, not overwrite; `Confirm` was absent.

The recovery activation created job `a506aca60f62431da59dcac56cc4d2fb` for target `tsPackage`, with the
selected `recovered-output` path. Its durable record is `completed` with summary `Artifact build completed.`
The same card rendered `Built to /home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-05-26eaf594439e99cb/p9-destination-oBBpf5/recovered-output.`
The produced `dist/index.js` exists (SHA-256
`c13283e3916ffd0747b095ed631eddc147887e1475f1bd564663686e65b896f5`). The only retained screenshot is the
occupied-destination refusal (SHA-256 `907f7c7e4babd15a5e63e5077ce161d654f7bc1d0a4789a5f61900309702d7c1`);
it remains in the runtime harness, not Git. The runtime receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-05-26eaf594439e99cb/p9-destination-result.json`
(SHA-256 `ec79ac468637bf85d3eccb506fc13521f11ec4dbf9f82d9605a202f011656434`). Its card-local wait predicate
timed out after the UI had already rendered the terminal success above; that harness observation is not a
product error. Its process-state record says `gracefully-stopped`; the Studio and Chromium processes owned
by the run were stopped.

## Destination-hint review correction

The review of `80131e853d03e59b0611ec8558a8098ac2ac430f` found that the neighboring card's
rendered recovery and success still carried PathInput's missing-input error and advice to select an
existing location. The receipt above remains evidence of that **Build/Export card** interaction;
it does not establish coverage of BlueprintBuildPanel's **Build Preview / Build Package** controls.
Its transcript, candidate identity, sentinel observations and output path are retained unchanged.

PathInput now defaults to existing-input semantics and accepts an explicit `pathPurpose="destination"`.
For destinations, a structured filesystem-browse `reason: "absent"` produces only the resolved-path
hint, without an existence claim or publication authorization. This hint remains truthful after writing.
Permission, wrong-type, broken-link, symlink-escape, invalid-path and network errors still render;
the existing request sequence still rejects stale responses. Artifact preview and execution guards
continue to own availability and safety checks, including occupied files, empty directories and races.

The caller audit covers all PathInput fields: Blueprint package output, every Build/Export artifact
target, Design PAR export, Blueprint save/save-before-New, and certification output use destination
semantics. Blueprint load/open, PAR import, Home project import/relocation, certification source bundles,
and provably-fair source bundles retain existing-input semantics. Blueprint save replacement remains
its separate confirmed-save contract; destination hints do not change it. Artifact descriptions explicitly
require new file paths or new/empty package directories and never offer overwrite.

| Accumulated finding | Current correction / retained evidence |
| --- | --- |
| Default destination policy | Unchanged reviewed fix: generator resolution is used by preview, direct service and HTTP; path-shaped IDs are rejected before publication. Existing HTTP/service/generator regressions remain in place |
| WASM reader stop budget | Unchanged reviewed fix: integrity-consistent direct-reader/runtime fixtures exercise exactly 30 and over-30 total bits, independently of builder rejection |
| Register attribution / product boundaries | Correct P9-01/P9-02/P9-03 attribution and maintained WASM/status boundaries remain intact; completed-step evidence is untouched |
| P9-DESTINATION-HINT | Four whole-file suites pass with actual absent browse responses: default/explicit Blueprint output, repeat refusal and recovery with prior provenance retained, six Build/Export artifact targets including PAR/WASM, and Design PAR export. Existing PAR-import errors, other resolver diagnostics and stale-response protection are also exercised |
| P9-DESTINATION-UX | **Pending controller-owned Blueprint panel verification.** The neighboring-card receipt above is retained with its actual scope. Component checks do not substitute for the rendered session |

This correction ran only the four directly affected files (127 tests passed) and the root typecheck
(passed, including its Studio compiler):

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/common/PathInput.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx
npm run typecheck
```

The controller must exercise the actual BlueprintBuildPanel on the committed correction. If the guided
Design view needs a recovery entry, Home's retained `design-build` job action restores its captured
`sourcePath`, `blueprint` and `destinationPath`; the editor renders that same panel after validation.
Use its **Build Preview** and **Build Package** controls to observe occupied refusal, verify the sentinel
bytes are unchanged, then choose a new/empty output and observe terminal publication to that actual path.
Check the resolved-path guidance during preview and after success for contradictory missing-target advice.
Record the candidate identity, interactions and filesystem results through the controller/verifier;
this implementation iteration created no browser transcript or replacement receipt.

## Independent host recovery verification — workflow unreachable

At 2026-10-08T21:31Z, the verifier ran a new isolated browser profile against exact clean candidate
`15ced3d769aa65bb4dab612eabe9670c18ca72c5`, launching the candidate build as
`node ./dist/cli/pokie.js --no-open --port 36568`. The bounded runtime receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-05-65775708a0e92433/p9-destination-result.json`
(SHA-256 `85eaaec8d633e331ef38504a1f1937744e977e33dd74ae275624ba8176c22c78`); it is runtime evidence, not
committed payload. Its concise rendered transcript is:

```text
LAUNCH http://127.0.0.1:36568
READY Design exact-panel={Build Preview:false, Build Package:false, Output directory:false}
BOUNDARY BlueprintBuildPanel unreachable: guided public Design has no panel; Home has no design-build recovery job
```

The public Design page rendered enabled `Create game`, but neither required BlueprintBuildPanel control
nor its output-directory field. Its same fresh Home entry rendered `home_jobs: []`, so no authentic
`design-build` recovery action existed. The immediately preceding fresh profile did activate `Create game`
once and reached a Workspace; it likewise did not produce a design-build record. No job record or router
state was fabricated, so the occupied-output and successful-publication portions could not be activated.

This is candidate-owned, not a browser readiness conclusion: [HomePage](../../cli/studio-client/src/components/home/HomePage.tsx)
has the only production `<BlueprintEditorPage guided />` mount. In
[BlueprintEditorPage](../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx),
the ordinary panel is guarded by `!guided`; the guided exception requires `recoveryRequest.blueprint`,
which Home supplies only from an already-retained `design-build` job. Thus no public entry can create the
first prerequisite job needed to expose these controls. Studio and Chromium owned by both launches stopped;
no screenshots or generated artifacts were retained.

The controller-owned complete-file receipt at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/43cc08726523a6edee4bdd4e/result.json`
is candidate-bound and clean before/after. Its full stdout/stderr logs have SHA-256
`b5c89e1d946f2900369cc5f557c30a6724a007e69c373ce862e301749a8ff609` and
`a5cb5e9c23a0c82d69ed90acc224e316f243335b25ab8b3c32e65cc9b15f0083`; the terminal summary is
3 suites passed, 40 tests passed. The test receipt does not substitute for the missing rendered panel path.

## Public Design build entry correction

The implementer traced the same failure at repair base `36d5a883`: Home still mounted only the guided
editor; its ordinary Build panel required `!guided`, and its recovery-only panel required a retained
request. Opening advanced options could not expose either control in a fresh session. The independent
receipts and transcripts above remain unchanged, with their original candidates and observed scope.

Fresh `/home/design` now exposes the existing BlueprintBuildPanel through **Show advanced options (file
and JSON tools)**. This same panel handles retained build requests, whose destination is restored by
the existing recovery flow. No job injection, extra route, alternate builder or automatic publication
is introduced. Guided builds require current successful validation, no unresolved source drift, and no
unapplied JSON edit. A validation block arriving during destination preflight also prevents publication.
Build Preview remains read-only. Build Package retains the last successful artifact and leaves source
dirty tracking intact; Create game continues to save and open the design's workspace.

| Accumulated criterion | Repair closure / current source evidence |
| --- | --- |
| P9-DESTINATION-UX public panel entry | Routed Home tests start with an empty job list and no recovery state, reveal exactly one Build Package and Build Preview, refuse occupied output without a build call, then publish the chosen new/empty output. Existing retained-build and PAR recovery tests exercise the same Home entry |
| Original F destination safety and provenance | Complete BlueprintBuildPanel suite retains invalid/stale/concurrent/conflict checks. HTTP workflow tests invoke the real service, retain occupied/raced sentinel bytes, publish new/empty destinations, and refuse repeat builds unchanged. Fresh guided tests keep successful provenance across disclosure toggles and preserve an unsaved pre-build edit through publication |
| P9-DESTINATION-HINT | Fresh guided tests use a structured absent-path browse error for new output and observe no missing-input advice beside successful publication. Explicit destination semantics in Build/Export, Design PAR, save and certification remain intact; source/open/import controls retain existing-input semantics |
| Default destination policy | Preview and direct service still call resolveGamePackageDestination; HTTP keeps omitted output omitted at publication. The complete HTTP suite rejects all six saved path-shaped ID forms without publication and accepts explicitly chosen new/empty output |
| WASM reader and capability truth | Existing WasmRuntimeApi direct-reader/runtime fixture still tests integrity-consistent [15, 16] stop widths against the accepted [15, 15] boundary. WASM_EXECUTION_BOUNDARY still feeds product descriptors, Build/Export and dashboard; README/CLI retain the separate evaluator, supported subset, rejected mechanics, 30-bit budget and conversion limits. These unchanged WASM suites were not rerun in this bounded repair |
| Status register and history | Register retains P9-01 RNG/replay, P9-02 compact state and P9-03 Stake attribution, all partial/not-found/agreed/deferred/hypothesis distinctions, safe-number limits and unconfirmed Math Optimization release scope. Completed-step evidence is untouched |

Permitted foreground regression command (3 suites, 43 tests passed):

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/home/HomePage.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel.test.tsx tests/cli/studio/StudioDestinationWorkflow.integration.test.ts
npm run typecheck
```

Root typecheck passed and includes typecheck-studio-client. The production browser build, complete reviewer matrix
and independent bounded browser rerun are controller-owned. For that rerun, use fresh Home Design ->
Show advanced options -> the actual BlueprintBuildPanel Output directory / Build Preview / Build Package
controls; follow occupied refusal through selected new/empty output success and inspect the sentinel.
The routed tests above use the fetch seam; the HTTP checks use the real service/filesystem. Neither is
represented as a new independent browser receipt, and the historical neighboring-card receipt keeps
its actual scope. No new screenshots or browser transcript were collected by this repair.

## Independent P9-05 verifier — exact candidate `d04a6ddc`

At 2026-10-08T22:29Z, an independent fresh-profile Studio session verified clean candidate
`d04a6ddc41578cc1f900d257e01225ca5f1e6db5` before and after the run. Studio was launched from this
checkout as `node ./dist/cli/pokie.js --no-open`; the run did not use the installed self-dependency,
create a job, or inject route state. The runtime-only, candidate-bound receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-05-b61bbfaa4bfc2f2b/p9-destination-result.json`.
It records the following concise rendered transcript:

```text
READY fresh Home Design; ACTION Show advanced options (file and JSON tools)
TERMINAL BlueprintBuildPanel Output directory, Build Preview, and Build Package controls rendered
INPUT Output directory = occupied-fixture; ACTION Build Preview
TERMINAL occupied-destination recovery; POST /api/home/blueprints/build-preview -> 200
INPUT Output directory = recovered-output; ACTION Build Preview
TERMINAL selected new destination preview; POST /api/home/blueprints/build-preview -> 200
ACTION Build Package; POST /api/home/blueprints/build -> 201
TERMINAL Last built rendered recovered-output
```

The occupied fixture began with only `sentinel.bin` containing bytes `[0,255,37,10]`; after the
rendered recovery it still contained only that file, with SHA-256
`8b3a89a2ae3f00c5ebf4ffefa94b01f8dce8502f547a90d25022772a9be61762`. No overwrite/confirm control
was rendered. The fresh preview offered no contradictory existing-target advice; the package appeared
at the exact rendered `recovered-output` path, including `dist/index.js`, and its terminal presentation
also offered no contradictory missing-target guidance. The two permitted runtime screenshots are retained
only by checksum: occupied recovery `3be14aea99f915a6d730cdc8c29bebaa135d819885995041c73ecc8001005014`
and recovered publication `b2f87ec81b26973ef0eac7a90906c50fa2210bb71526fb562e163138671880d9`.
Owned Studio and Chromium processes stopped; no runtime profile, fixture, screenshot, harness, or raw log
is committed.

The controller-owned whole-file receipt
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/16d8ec4aacfff016a29e9683/result.json`
is also bound to this exact clean candidate before and after execution. Its terminal Jest summary is
**7 passed suites / 117 passed tests** for the seven requested files. Full runtime logs remain external;
their SHA-256 values are stdout
`23c43827e39befebd1ee5123b323f46eb4e2fb669d3cccf102bb8a8da99f9a51` and stderr
`3f515c20e4df2b6eb5f0fc71c114b639f6f341243e80c18a14054a09a1dc5563`.

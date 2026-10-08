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

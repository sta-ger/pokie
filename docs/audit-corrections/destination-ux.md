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

## Controller-owned rendered verification — pending

No real browser session, interaction transcript, or screenshot is claimed in this implementer record.
The instruction explicitly assigns independent browser/CLI reruns and forbidden builds to the controller,
and permits submission of the committed product correction with missing machine-owned evidence. Component
rendering and HTTP tests above do not substitute for that proof.

The controller must run one bounded Studio session on the reported commit: enter an occupied fixture
path, invoke Build Preview/Build Package and observe the conflict with editable/Browse recovery and no overwrite
action; compare sentinel bytes before/after; choose a new or empty directory; invoke Build Package and observe
the successful terminal publication at that actual path, retaining the previous artifact. Record the exact
candidate SHA, foreground launch commands, interactions, response/terminal observations, and filesystem
checks here with at most two screenshots. No project/viewport/state matrix is requested. This record is
an explicit pending verification handoff, not a fabricated action, finding, or completed browser receipt.

# P6-16 cross-surface integration verification

Reviewed at product commit `b89e6f79`. This is a bounded replay of the
Phase-6 user paths, not a new release record. The retained browser records
remain the real rendered-control proof; the current checkout was then tested
at each runtime boundary listed below.

| User path and old-path boundary | Real browser/CLI record | Current checkout proof |
| --- | --- | --- |
| New, edit, save, restart; managed registry conflict and relocation | `docs/evidence/p6-02-registry-lifecycle`, `docs/evidence/p6-05-game-model-artwork-real-workflow` | `BlueprintEditorWorkflow.integration`, `StudioFullWorkflow.integration`, and `ProjectTargetResolver` pass. The registry evidence records one restored managed row after restart, not a duplicate alias. |
| Artwork and Reel Strip Modeler | `docs/evidence/p6-05-game-model-artwork-real-workflow`, `docs/evidence/p6-06-reel-modeler-real-studio-e2e` | `BlueprintEditorWorkflow.integration` passes; the retained controls save the same Blueprint and show it again after a fresh Studio restart. |
| Player, Play, selected modes, Simulation, and Replay | `docs/evidence/p6-08-canonical-player-runtime-parity`, `docs/evidence/p6-09-play-mode-runtime/current-head-4e649c5e-20260817`, `docs/phase6-final-polishing/p6-15-browser-verification` | `SpinCommandHandler`, `SpinCommandHandlerReconciliation`, and `StudioFullWorkflow.integration` pass. The `pokie-examples` UI test passed through its `pokie/client/player` import, and rejects its former bespoke `#reels` grid. |
| Build, Outcome to Stake, TypeScript-package parity, and XLSX | `docs/evidence/P6-11`, `docs/evidence/p6-07-native-build-export-real-studio` | `ArtifactBuilderRegistry`, `OutcomeLibraryGenerateWorkflow.integration`, `StakeEngineExportRegistryWorkflow.integration`, and `ParSheetRoundTrip.integration` pass. The registry is the shared builder path; no Blueprint-to-Stake bypass is present. |
| Server settlement and idempotency | `docs/evidence/p6-09-play-mode-runtime` (saved finding and its corrected replay) | `SpinCommandHandler` and `SpinCommandHandlerReconciliation` pass, including persistent and one-shot bet-mode capture, wallet settlement, retry, and reconciliation boundaries. |

The saved P6-09 finding was traced on this checkout before this review:
`SpinCommandHandler.playAndSettle()` captures the selected mode before
`session.play()`, passes it in the one full-capture request, and
`captureRoundPokieSessionState()` forwards that value to
`buildRoundArtifactFromSession()`. The deterministic regression covers base,
ante, one-shot buy-feature, and the following base spin with their charged
stakes. This is the sole artifact construction path for that server workflow;
there is no UI-only provenance fallback.

The review also found a material browser quality defect in all three Studio
modal title surfaces: a nested `Title` rendered a heading inside Mantine's
modal `h2`, emitting a hydration/DOM-nesting error. The modal now owns the
only heading, with its supplied title rendered as text. Regression assertions
verify the New Blueprint and server-filesystem-browser titles have no nested
heading; the same correction covers the payline-preset modal.

Current focused checks passed:

```text
POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples npm run test:targeted --
  tests/cli/BlueprintEditorWorkflow.integration.test.ts
  tests/cli/StudioFullWorkflow.integration.test.ts
  tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts
  tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts
  tests/cli/ParSheetRoundTrip.integration.test.ts
  tests/project/ArtifactBuilderRegistry.test.ts
  tests/project/ProjectTargetResolver.test.ts
  tests/server/spin/SpinCommandHandler.test.ts
  tests/server/spin/SpinCommandHandlerReconciliation.test.ts
# 9 suites, 115 tests passed

POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples npm run test:targeted --
  tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.save.test.tsx
  tests/cli/studio-client/src/components/common/PathBrowseModal.test.tsx
# 6 and 7 tests respectively passed

POKIE_EXAMPLES_PATH=/home/stager/Work/sta-ger/pokie-examples npm run test:targeted --
  /home/stager/Work/sta-ger/pokie-examples/tests/ui.test.ts
# 1 suite, 11 tests passed

npm run typecheck
# root and Studio TypeScript programs passed
```

No P0/P1 or further material P2 issue was confirmed in this slice. No
compatibility alias, changelog, release checklist, generated output, or
additional evidence archive was added.

## Independent host verification — 2026-08-19

Verifier checkout: `7a02b9251362bc24b097514707bb0fe161c2d88a`.

The first required complete file was run once, using its checked-in real
code-first fixture lifecycle. The persisted request names
`tests/cli/StudioArtifactBuildService.test.ts`; the candidate contains that
file at `tests/cli/studio/StudioArtifactBuildService.test.ts`.

```text
npm run test:targeted -- tests/cli/studio/StudioArtifactBuildService.test.ts
# FAILED: 1 suite; 16 passed, 2 failed, 18 total
# Blueprint -> Stake: expected build status "ok"; received "error".
# Code-first tsPackage -> Stake: expected build status "ok"; received "error".
```

The code-first case ran `pokie init --no-prepare`, then the fixture's real
`npm install` and `npm run build`. Its permitted local dependency runner uses
the candidate checkout's installed packages, so this exercised the public
package lifecycle without a registry dependency. Jest removed the temporary
fixture directory after the run. Per the bounded-verification rule, no later
required files were run after this material Build failure.

## Correction replay — 2026-08-19

The implementation code remains based on
`7a02b9251362bc24b097514707bb0fe161c2d88a`; the only intervening commit before
this replay retained the finding above. The failure was reproduced under the
task command-policy shim: its nested fixture `npm install` was rejected before
the code-first project could be prepared. Replaying the two complete files in
the permitted Node/npm verifier environment let the checked-in local-dependency
runner perform its required real `npm install` and `npm run build`.

```text
node --max-old-space-size=512 ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath \
  tests/cli/studio/StudioArtifactBuildService.test.ts
# PASS: 1 suite, 18 tests. Blueprint -> Stake wrote index.json and registered
# its managed Outcome Project; code-first init -> install -> build -> Outcome
# -> Stake wrote pokie-manifest.json with base and ante modes.

node --max-old-space-size=512 ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath \
  tests/project/ArtifactBuilderRegistry.test.ts
# PASS: 1 suite, 23 tests. The shared registry materialized the real tsPackage,
# preserved runtime modes, and exported Stake through the registered Outcome
# prerequisite.
```

This is a verifier-environment correction, not a Studio artifact-build product
failure: no production path was changed.

## Independent required-path replay — 2026-08-19 (finding)

Candidate: `0bf37b82648edc16d3a82a9e737e70d03a36cd3b`.
Verifier runtime: Node `v18.19.1` (zlib `1.3`).  All six persisted request
paths were supplied once as literal `--runTestsByPath` arguments to the
checked-in Jest runner; no test, Studio, browser, workflow, or product source
was modified and this failing interaction was not retried.

```text
node --max-old-space-size=512 ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath <six required paths>
# FAIL: 6 suites; 35 passed tests, 6 failed tests.
# PaylinePresetsModal.test.tsx: ENOENT (the required path is absent on candidate).
# BlueprintEditorPage.save, PathBrowseModal, ProjectDashboardPage.gameModelWorkflow:
#   setup aborts in undici: webidl.util.markAsUncloneable is not a function.
# StudioArtifactBuildService: 16 passed, 2 failed (Stake result status "error").
# ArtifactBuilderRegistry: 4 Stake tests fail: zlib.zstdCompressSync is not a function.
```

The code-first fixture did begin its real `pokie init --no-prepare` lifecycle
and printed the generated package's real `npm install` / `npm run build` next
step, but the missing Node 22+ APIs prevented a green fixture-to-Stake result.
Accordingly, this invocation cannot independently confirm the requested
Blueprint or TypeScript Outcome-to-Stake behavior. The absence of a named
required test file is also a current-candidate verification defect. No
generated fixture or raw log was retained.

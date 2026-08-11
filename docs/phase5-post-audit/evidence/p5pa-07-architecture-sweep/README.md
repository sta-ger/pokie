[← Back to campaign README](../../README.md)

# `P5PA-07`: bounded source-level architecture sweep and remediation — evidence

**Base SHA:** `ec64cc549989180e3b72f5c621323c58ddef60ed` (`merge task task/P5PA-06-20260811015812 (implementation
d333a60b925f)`), working tree clean before this step's own changes.

## Scope swept

Per this step's own instruction, read current source end-to-end (not an older report's word) across every area
named: `src/project` (`ProjectCapabilities.ts`, `GameModelProjection`/`buildProjectGameModel.ts`,
`ArtifactBuilderRegistry.ts` and its five concrete builders, `OutcomeSourceProjectAnalyzer.ts`,
`resolveOutcomeLibraryModeName.ts`), `cli/studio` (`StudioServer.ts`, `StudioPlayService.ts`,
`StudioRoundRecorder.ts`, `StudioReplayExecutionService.ts`, `StudioArtifactBuildService.ts`), `cli/studio-client`
(hooks, `PlayTab`/`SimulationTab`/`ReplayTab`/`ExportDeployTab`/`ProjectDashboardPage`, `domain/interpret/Replay.ts`,
`domain/interpret/ExportDeployTargets.ts`), and `cli/commands/InitCommand.ts` plus its
`cli/scaffold`/`cli/materialize`/`cli/prepare` collaborators, for each of the categories this step's own
acceptance criteria name: duplicated execution paths, hardcoded project-type switches diverging from
`PROJECT_TYPE_CAPABILITIES`, first-item/first-mode assumptions, stale Runtime/server/deployment or pre-release
routes, frontend game math, silent degradation, and TODO/stub/placeholder branches.

## What was checked and ruled out (false positive / already covered / not a defect)

- **`[0]`-indexing sites** (`useDeploymentManager.ts:157-164,224-228,311`, `StudioBlueprintService.ts:444`,
  `ReelCommand.ts:280,289`) — each either guarded by an explicit `.length === 1` check before firing, or indexing
  into a genuinely single-entry array constructed on the same line, never a many-choices-collapsed-to-first
  pattern. `resolveOutcomeLibraryModeName.ts` (the `P5PA-04` fix) already owns every real multi-mode
  Play/Simulation/Replay/Overview call site; no new caller bypasses it — every CLI command that samples an
  outcome-library project (`ReplayCommand`, `ServeCommand`, `SimCommand`, `CertificationCommand`) requires an
  explicit `--mode` and errors rather than defaulting silently.
- **Hardcoded `project.type === "..."` switches** (`grep`'d across `src/project`, `cli/studio`, `cli/commands`,
  `cli/materialize`) — every one checked either matches `PROJECT_TYPE_CAPABILITIES`/`describeUnsupportedProjectOperation`
  exactly (`OutcomeSourceProjectAnalyzer.ts`, `buildProjectGameModel.ts`, `StudioServer.ts`, `StudioPlayService.ts`,
  `materializeRuntimePackage.ts`) or is a narrower, correctly-scoped behavioral branch unrelated to capability
  gating (e.g. `ProjectsPanel.tsx:124`'s error-message wording, `EditCommand.ts:143`'s blueprint-vs-package wizard
  routing). `ArtifactBuilderRegistry.ts`'s `TARGET_OPERATION`/`UNSUPPORTED_NOTES` maps are derived once from the
  same `PROJECT_TYPE_CAPABILITIES` contract, not independently authored, and its own tests already assert `wasm`
  truthfully reports no supported source.
- **Stale Runtime/deployment routes** — `StudioRoundSource`'s `"live"`/`"pre-generated"` union members
  (`StudioRoundRecorder.ts:9`) are explicitly documented as vestigial from the removed Runtime tab, kept only so a
  pre-removal recorded round still type-checks; nothing in current source produces or branches on them. Dead but
  inert, not a reachable divergence — left as-is, consistent with this campaign's own "no product code changed for
  a non-defect" convention. `RuntimePackageResolution`/`materializeRuntimePackage.ts` is an unrelated, current
  concept (the CLI's own blueprint-materialization boundary), not a reference to the removed product surface.
- **Frontend game math** — every numeric game-outcome display checked (`SimulationSummaryCard.tsx`,
  `RoundArtifactInspector.tsx`, `PaytableView.tsx`, `GameModelSections.tsx`) renders server-supplied
  `RoundArtifact`/`report` fields verbatim; `PaytableView.tsx` explicitly documents it never derives or recomputes
  a payout table client-side. No independent client-side win/RTP/payout computation exists.
- **Silent degradation** — every `catch` reviewed in `src/project/internal/*` recognizer functions
  (`isPokieTsPackageDirectory`, `looksLikeGameBlueprintFile`, `looksLikeParWorkbookFile`,
  `isOutcomeLibraryBundleDirectory`) is a documented "recognize, don't validate" contract returning a plain
  non-match on read failure, not a silent substitution of a wrong value for a real one.
- **TODO/FIXME/HACK/XXX/"not implemented"/stub/placeholder** — none in non-test source under `src/project`,
  `cli/studio`, `cli/studio-client`, or in `RoundRecorder`/`Replay`/`ArtifactBuilderRegistry`/`OutcomeSource`/
  `InitCommand.ts` specifically. The only "placeholder" hits are legitimate UI input placeholders and one
  documented future-extension-point card (`ExportDeployTargets.ts:206`), not a stub branch.

## Confirmed finding: `GamePackageMergeConflictError` mixed path separator (P3)

Already found and evidenced twice before in this campaign (`P5PA-01`'s `evidence/12-pokie-init-portability.txt`
§5, carried forward untouched through `P5PA-06`'s own "out of scope, left as-is" close-out) but never fixed:
`cli/scaffold/GamePackageMergeConflictError.ts` built its error message with a raw template-literal
`` `${projectRoot}/package.json` `` — a hardcoded forward slash — instead of `path.join(projectRoot,
"package.json")`, the same way every other real filesystem/display path in `cli/scaffold`/`cli/prepare` is built
(verified this round is still true by re-reading the file at this step's own base SHA before editing it: line 23
was still the raw template literal). On a real Windows host this is the one path in the entire `init`/scaffold/
prepare surface that would render a mixed-separator path (`C:\Users\me\game/package.json`) in a thrown error
message — display-only, never used for an actual file operation (the real read/write always goes through
`path.join` elsewhere in `GamePackageMerger.ts`), so no functional or security consequence, consistent with its
prior **P3** classification.

**Fix:** `cli/scaffold/GamePackageMergeConflictError.ts` now imports `path` and builds the message with
`path.join(projectRoot, "package.json")`, matching every other path construction in this same file's own
collaborators. No other behavior changed — `conflicts`/`projectRoot`/the surrounding sentence text are untouched.

**Regression coverage:** added
`tests/cli/scaffold/GamePackageMerger.test.ts`'s `"names the conflicting file with the platform's own path
separator, not a hardcoded forward slash"` case, asserting the thrown message contains
`path.join(projectRoot, "package.json")` (not a hand-typed forward-slash string) — this is meaningful on any
platform (on POSIX, `path.join` also produces the same forward-slash string, so the test's value is in pinning
the *construction* to `path.join`, the same convention this file's own future edits should keep following, not in
a Windows-only assertion this Linux sandbox couldn't otherwise make).

Ran, real, unmocked, in the foreground:

```
$ node_modules/.bin/jest --config jest.config.mjs tests/cli/scaffold/GamePackageMerger.test.ts tests/cli/commands/InitCommand.test.ts
PASS pokie tests/cli/commands/InitCommand.test.ts (8.965 s)
PASS pokie tests/cli/scaffold/GamePackageMerger.test.ts

Test Suites: 2 passed, 2 total
Tests:       44 passed, 44 total

$ node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json
(exit 0, zero diagnostics)

$ node_modules/.bin/eslint cli/scaffold/GamePackageMergeConflictError.ts tests/cli/scaffold/GamePackageMerger.test.ts
(exit 0, zero findings)
```

No CLI/browser rerun beyond the above: this is a non-behavioral, display-text-only correction inside an
already-thrown error path (a merge conflict a real `pokie init` run genuinely hits when re-run against a
pre-existing, incompatible `package.json`) — the existing `InitCommand.test.ts` case
`"propagates a GamePackageMergeConflictError from the merger untouched"` and `GamePackageMerger.test.ts`'s own
five `"conflicting POKIE-owned fields"` cases already exercise the real merge-conflict workflow end to end; this
step added the one assertion that was missing (the message's own path construction) rather than duplicating that
coverage.

## Boundary

This step adds no product, mechanic, Runtime/Deployment surface, alternate editor/player/builder, or pre-release
compatibility shim. The one change is a display-text correction inside an existing, already-thrown error path.
Everything else swept above was read, classified, and — where already a false positive or an intentional,
documented boundary — left untouched, consistent with this campaign's own protocol (§2 of the campaign README):
no entry is classified without a real, current source read this round.

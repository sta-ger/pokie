# PC-18 independent host verification — driver inconclusive

Candidate code SHA: `938d6bfe61f13ff2dd80f1f984b2d4706bfa8646`.
This evidence-only commit is its descendant; it contains no product-code change.

## Retained complete-file boundary

The controller-verified serialized command ran once on the candidate with all
eleven required files:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 60 tests passed**. The candidate was built with
`npm run build-cli` before the first public launch. This recovery did not rerun
either already-passing command.

## Fresh public Studio recovery runs

All four permitted recovery launches used a new Studio registry and Chromium
profile and started the source-checkout candidate only with:

```text
node ./dist/cli/pokie.js --no-open
```

The first three runs repaired bounded driver faults (a stale cancellation-sheet
assumption and an omitted label helper) without a rendered product error. The
fourth clean journey rendered these action-local observations:

```text
Create game -> Created in Studio; Editable; Valid
Play -> New Play session -> Spin -> Spinning… -> Round complete
Simulation Run -> queued — 0/10000 -> Cancel -> Confirm
  -> Cancelled after 0.2s — 3000/10000 rounds completed
  -> Configure -> Run Simulation -> queued — 0/10000
  -> RTP 106.48%; 10000/10000 rounds; Duration 0.2s
Replay -> Recent Simulation -> selected starter-slot v0.1.0 -> Load
  -> Loaded replay (Source: Recreated -- recent simulation; Ready)
  -> Run again
```

For that exact final `Run again` activation, the immediately preceding local
state rendered `Ready -- plays a fresh session forward`; no queued/job record,
local completion, or action-local error rendered during the bounded semantic
wait. The still-rendered control remained `Run again`. This does not meet the
action-correlation contract for a finding and leaves Replay terminal, Outcome
Library-to-Stake handoff, source drift, cross-project behavior, and
caller-owned-destination safety unreached. It is a driver/instrumentation
inconclusive result, not a product failure.

No generated projects, browser profiles, output trees, harness source, raw
logs, or screenshots are retained.

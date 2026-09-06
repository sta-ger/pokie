# PC-18 independent host verification — driver inconclusive

Candidate code SHA: `938d6bfe61f13ff2dd80f1f984b2d4706bfa8646`.
This evidence commit is documentation-only and is its descendant.

## Complete-file test boundary

The required serialized command was run exactly once, with all eleven requested
files, on this candidate checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 60 tests passed**. The candidate was then built once with
`npm run build-cli`.

## Fresh public Studio launches

Two clean, isolated Studio/browser-profile launches used only the candidate
build command:

```text
node ./dist/cli/pokie.js --no-open
```

The first repaired the retained case-sensitive selector defect and rendered:

```text
Create game -> Starter Slot (Created in Studio; Editable; Valid)
Play -> New Play session -> Spin -> Spinning…
Simulation -> Run Simulation -> queued — 0/10000 -> Cancel -> Confirm
Simulation -> Cancelled after 0.2s — 3000/10000 rounds completed
```

The second launch repaired the tab/Recent-Simulation interaction assumptions.
It rendered a complete Play terminal and the same Simulation action lifecycle:

```text
Spin -> Spinning… -> Round complete — no win this round.
Run Simulation -> queued — 0/10000 -> Cancel -> Confirm
RTP 102.38%; 10000/10000 rounds; Duration 0.3s
```

Thus the exact cancellation action was accepted, but its local terminal was a
completed simulation, not a rendered failure. The harness had still waited
only for the cancellation terminal and stopped before the remaining Replay,
Outcome Library, Stake, source-drift, cross-project, and cleanup checks. This
is a harness-control-flow limitation after a rendered success, not a product
finding. No generated project, browser profile, raw log, harness source, or
output tree is retained.

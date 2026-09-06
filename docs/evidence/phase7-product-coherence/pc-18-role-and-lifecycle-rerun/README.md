# PC-18 independent host verification — candidate `58ca0d02717e2c16b2be5d869f021f9c34453d99`

2026-09-06 UTC. This evidence is bounded to the exact candidate. It retains no
generated projects, Studio registries, browser profiles, harness, raw log, or
automation source.

## Whole-file impact suite

Ran exactly once as one complete-file invocation:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed**. The candidate was then rebuilt with
`npm run build` before Studio verification.

## Fresh visible Studio runs

Both permitted fresh runs used the candidate CLI exactly as
`node ./dist/cli/pokie.js --no-open`, with newly isolated HOME, Studio registry,
and Chromium profile. The first run reached: Recommended starter → Create game
→ saved, valid `Starter Slot` workspace → New Play session → one settled round
with an inspectable round artifact → Simulation configuration. Its rendered text
included `Round complete — no win this round.`

The first run ended on a driver-only selector mismatch: the rendered label was
`Rounds *`, while the harness required `Rounds`. The harness was repaired in
place before the second fresh run. The second run repeated the successful
create/save/workspace/Play journey and rendered Simulation state
`queued — 0/1 rounds — elapsed 0.0s`. Its state waiter incorrectly matched the
static empty-history text `No completed simulations yet` as a terminal state,
then attempted navigation while the operation was still pending. No Studio
error, compatibility/provenance failure, unsafe destination, or other product
symptom was rendered. The launch limit prohibits a third run, so generation,
Stake handoff, cancellation/retry, drift, late-destination, and cross-project
branches were not independently completed in this invocation.

This is a driver/readiness-inconclusive verification, not a product finding.

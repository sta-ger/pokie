# PC-18 independent host verification — candidate `114ccedbda05d61deb8f350de910bb726b1339c5`

2026-09-06 UTC. This commit retains only this concise current-candidate
transcript. No generated project, outcome, browser profile, registry, harness,
raw log, or screenshot is retained.

## Whole-file impact suite

The required files were run once, together, sequentially:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed**. The candidate was then built before
the public Studio run.

## Fresh rendered Studio preflight

Studio was launched from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`, using a fresh registry and Chromium
profile. In one clean visible journey, Recommended starter → Create game
saved `Starter Slot`; Close project → Projects → Open reopened the saved,
editable valid project. A Play session produced a settled round; one-round
Simulation completed; and Replay completed a full, inspectable round artifact.
PAR export also completed to its caller-owned default destination.

On that same Studio-created, reopened Blueprint, Build/Export showed a ready
preflight for managed Outcome Library generation: exact enumeration, 1024 raw
combinations, expected work 1024. The rendered `Generate exact outcome library
(base)` action accepted its single click and then reported:

```text
Generating this outcome library failed. Check the settings above and try again.
If it continues, reopen the project and retry.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

The rendered Stake Engine route explicitly requires that compatible Outcome
Library (`materializeRuntime → generateOutcomeLibrary → publish`), so it cannot
complete from this clean Studio project. This is a reproducible rendered product
error, not a wait, selector, browser, or driver observation. It blocks the
requested managed Outcome Library and Stake workflow; dependent lifecycle
variants were not reached. No second outcome-generation request was issued.

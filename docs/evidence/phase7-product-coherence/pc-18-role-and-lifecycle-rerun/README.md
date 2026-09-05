# PC-18 independent host verification — candidate `1077df75047471f863e7b11cc35df9583b26a63d`

2026-09-05 UTC. This evidence commit is a descendant of the stated candidate
and contains no product or test changes. Generated projects, registries,
profiles, full logs, scripts, and screenshots are excluded.

## Required impact suite

The required whole-file command ran once, sequentially, on this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 55.579 seconds. `npm run build-cli`
then completed before Studio was launched.

## Fresh public-workflow recovery transcript

Four new Studio profiles and registries were launched from this source checkout
exactly as `node ./dist/cli/pokie.js --no-open`. Each began at `Design Your
Game`, used `Create game`, and visibly reported a newly managed, valid
`Starter Slot` Blueprint.

In every launch, the rendered player journey reached `Start Play` → `New Play
session` → `Spin` → `Round complete — no win this round`. Simulation then ran
to a visible terminal result (10,000/10,000 rounds; recorded RTPs included
95.46%, 103.80%, 107.52%, and 99.82%). The repaired Replay interaction showed
the rendered Replay screen, including the product's truthful best-effort
reproducibility wording and its distinction between a fresh forward replay and
a recorded result.

The first fresh run stopped while Game Model still rendered `Loading game
model…`; the second waited for the local loaded state but selected an overly
broad page-level `Edit`; the third discovered the Reels action was below the
viewport; and the final run scrolled it into view but the geometry-only
association selected the visible Paytable `Edit`. The intended literal-reel
editor, Outcome Library cancellation/fresh-preflight retry, dependent Stake
export, and stale/cross-project/switching/cleanup lifecycle variants therefore
were not reached. No rendered product error occurred, and no unconfirmed
interaction is treated as a product defect.

This is bounded **driver-inconclusive** evidence. The controller-owned harness
and diagnostic PNGs remain outside this evidence directory; no screenshot is
retained because none represents the uncompleted lifecycle boundary.

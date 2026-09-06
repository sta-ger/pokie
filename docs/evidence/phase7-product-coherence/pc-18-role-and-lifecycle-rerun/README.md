# PC-18 independent host verification — candidate `d5a57549ff764416298fb4b8fa0273e8cd975ec1`

2026-09-06 UTC. This evidence is limited to the exact candidate: no generated
project, registry, browser profile, harness, screenshot, raw log, build output,
product change, or test change is retained.

## Whole-file impact suite

The candidate ran the reviewer-required complete command, sequentially:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 55.473 seconds. `npm run build-cli`
then completed before either Studio launch.

## Fresh public-workflow recovery

The persistent repaired harness made two fresh-profile, fresh-registry launches
from this checkout only with `node ./dist/cli/pokie.js --no-open`.

1. The clean `Design Your Game` page visibly rendered the Recommended starter
   with enabled `Create game` and no product error. The prior guard inspected
   `body.innerText`, which cannot contain native input values, then incorrectly
   tried the absent starter chooser. The harness was repaired in place to query
   the visible native inputs directly.
2. The repaired fresh journey recognized the in-place Recommended starter,
   clicked `Create game`, and visibly reached the saved `Starter Slot` workspace
   (`Overview`, `Game Model`, `Play`, `Simulation`, `Replay`, `Build/Export`,
   `Close project`). No rendered product error occurred. Its project-close wait
   was too broad: existing workspace text satisfied `/Projects/` and `/Open/`
   before the close transition, so it attempted no duplicate action and then
   failed to find an `Open` control. The remaining role and lifecycle actions
   were therefore not reached within the fixed two-launch budget.

This is **inconclusive (selector)**, not a product finding: the observed
failure is a harness semantic-state predicate and no rendered/reproducible
product symptom was observed. The retained harness now records the complete
ordered role/lifecycle checklist and preserves both repaired selectors for a
future bounded recovery.

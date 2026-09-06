# PC-18 independent host verification — inconclusive

Candidate SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.

## Required complete-file command

The verifier started the prescribed serial command once, with all 11 files in
one invocation, and did not start a concurrent or duplicate Jest process:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Its host-side wrapper did not retain a final exit record, so this run is not
used as a passing test assertion. The candidate CLI was then built before the
Studio attempt.

## Rendered Studio attempt

Fresh Studio registries and Chromium profiles were used. Studio was launched
from this checkout only with `node ./dist/cli/pokie.js --no-open`.

The first UI-driver pass stopped before an action because its expected
`Design a game` control was not rendered; the visible start page instead
already contained the recommended editable game and its `Create game` button.
The one safe retry repaired that selector and rendered these product states:

1. `Create game` was accepted.
2. Studio rendered `Valid — no issues found.`
3. Studio rendered `Your game was saved. Opening its workspace…`.

The driver then falsely treated the validation text as workspace readiness and
looked for a non-rendered `Play` control before the route transition completed.
There was no rendered product error. Because the permitted launches were
exhausted, this is driver/readiness-inconclusive, not a product finding. No
claim is made here about Play, Simulation, Replay, Outcome Library, Stake,
source-drift, destination, cross-project, cancellation, recovery, or cleanup
variants.

No generated projects, runtime profiles, browser data, automation source,
screenshots, or raw logs are retained. This README is the only retained proof.

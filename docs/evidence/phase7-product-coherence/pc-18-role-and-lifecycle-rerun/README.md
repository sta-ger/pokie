# PC-18 independent host verification — finding

Candidate product SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.
This evidence commit changes this README only.

## Complete-file verification

On the exact detached candidate, one sequential complete-file command passed:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts

Test Suites: 11 passed, 11 total
Tests:       59 passed, 59 total
```

## Rendered public workflow

The candidate was built, then fresh Studio was started exactly with
`node ./dist/cli/pokie.js --no-open` using a new XDG registry and a new Chromium
profile. Visible Studio created the Recommended `Starter Slot`, closed it, and
reopened the single registered project. One Play spin reached `Round complete —
no win this round`; a 10,000-round Simulation reached its report (`RTP 104.46%`);
and Replay loaded the recorded Play spin as a full, inspectable, exportable
round artifact.

In Build/Export, immediately before activation, Outcome Library preflight
rendered `Exact enumeration: 1024 raw combinations; expected work 1024` and
the enabled control was `Generate exact outcome library (base)`. That one user
action rendered its terminal state:

```text
Generating this outcome library failed. Check the settings above and try again.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

No pending job or later success was rendered. The same page therefore left
Stake Engine export behind its required generated Outcome Library, despite
showing a ready preflight route. Cancellation/retry, source-drift,
late-destination, stale/cross-project, and cleanup flows beyond that generated
library prerequisite are not reachable in the public UI. Runtime profiles,
registries, project directories, logs, and outputs were cleaned; no generated
artifacts or raw logs are retained.

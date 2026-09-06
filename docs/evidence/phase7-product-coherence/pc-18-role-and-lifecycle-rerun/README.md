# PC-18 independent host verification — inconclusive

Candidate product SHA: `141d746e9b8727b46e5d919c8235e0f178c9695c`.

## Complete-file verification

The required files were executed together, sequentially, from this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts

Test Suites: 11 passed, 11 total
Tests:       59 passed, 59 total
Snapshots:   0 total
Time:        55.623 s
```

This bounds the reviewer-requested role, lifecycle, planner, interoperability,
CLI/Studio-parity, context, recovery, and cleanup suites on the exact candidate.

## Fresh public Studio launch

After `npm run build-cli`, a fresh registry and Chromium profile launched Studio
from this checkout with exactly:

```text
node ./dist/cli/pokie.js --no-open
```

The visible Studio UI reached `Starter Slot · Overview`; the Recommended starter
was selected, the project was closed to `Projects`, and the starter was opened
again. The visible navigation then reached `Starter Slot · Play`.

The inherited Xvfb environment supplied no usable visual text/screenshot or
accessibility readback for the Play control's local ready, accepted, and terminal
states. The driver therefore could not correlate a Play activation with its own
rendered result. Per the verification contract, no product defect is claimed and
the remaining Play/Simulation/Replay/Outcome/Stake/cancellation/recovery
workflow is not reached. No generated project, profile, registry, output tree,
raw log, or automation source was retained as repository evidence.

## Harness-recovery follow-up

The persistent fresh-profile harness was repaired to use the checkout's CDP
dependency and to query visible controls by semantic prefix. A new clean Studio
launch from the candidate build rendered the ready-to-edit starter directly:

```text
Design Your Game
Start with the ready-to-edit starter game …
Create game
```

This establishes that the public first action is the rendered `Create game`
control, rather than the earlier harness's guessed `Recommended`/`Create
Project` label. The next fresh-profile execution activated that corrected action,
but the host-side driver execution was terminated before it emitted its action
transcript or a local dashboard/terminal observation. Thus it supplies no
correlatable product outcome. No finding is claimed; the remaining public
missions and lifecycle variants remain not reached for a driver reason.

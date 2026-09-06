# PC-18 independent host verification — inconclusive

Candidate product SHA: `141d746e9b8727b46e5d919c8235e0f178c9695c`.
This evidence-only descendant changes this README, not product code.

## Retained complete-file verification

The candidate-bound command below was rechecked from retained evidence and had
already passed all complete files: 11 suites, 59 tests.

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

## Four fresh public Studio recovery launches

Each launch used a new registry and Chromium profile, and launched the source
checkout's candidate build only:

```text
node ./dist/cli/pokie.js --no-open
```

The repaired persistent harness began every fresh journey at `Create game` and
continued through `Play` → `New Play session` → `Spin` (local `Reset Play
session` terminal), `Replay` → `Load` (local `Run again` terminal),
`Build/Export` → `Generate exact outcome library (base)`, then `Close project`
(rendered `Projects` terminal). It used the valid default generator state; a
separate visible `Stake=1` entry did not enable `Check compatibility`.

For the exact visible `Run Simulation` action, the local ready state was the
enabled `Run Simulation` control and its accepted state was rendered `Cancel`.
After `Cancel` → `Confirm`, Studio displayed a local request error while
retaining `Cancel`, but rendered no created/queued operation ID and no terminal
result for that action. The script did not repeat that request.

For the exact visible outcome-generation action, the local ready state was
enabled `Generate exact outcome library (base)`, and its local terminal control
was `Show Generation diagnostic`. Opening that idempotent diagnostic rendered
the action-local message that generation failed. It rendered neither a created
job ID nor a correlatable terminal result with an operation ID. The Stake card
then truthfully remained disabled and stated that no compatible Outcome Library
and no registered remote destination were available. Thus Stake handoff,
provenance, stale/cross-project diagnostics, and caller-owned-destination
terminals could not be reached through enabled public controls.

These rendered errors cannot be product findings under the v2 action-correlation
contract because neither pollable action exposed the required operation ID. The
bounded external transcript is retained only outside the repository (SHA-256
`1f81879fcdd2ad577b68e554f62c3c9cccacaa0038e99dead9e58c6600f80a7f`).
No profile, registry, generated project/output tree, automation source, raw log,
or screenshot is committed. The four temporary Studio projects from this
invocation were moved to the system trash after the public `Close project`
cleanup transition.

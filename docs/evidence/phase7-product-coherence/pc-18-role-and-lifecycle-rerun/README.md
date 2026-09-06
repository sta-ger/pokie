# PC-18 independent host verification — driver inconclusive

Candidate product SHA: `6f9fa507792db28df6917b3b9f66436a1b9dcd8d`.
This evidence commit is its descendant: `92cc2596c5b85121b5e2e721ee698072580c2af0`.

## Retained complete-file suite

The candidate-bound retained evidence remains present and records that this
single serial command passed all 11 required complete files (59 tests):

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Per the recovery contract, that already-passing command was not duplicated.
The candidate CLI was rebuilt successfully with `npm run build-cli` before the
fresh Studio rerun.

## Fresh public Studio recovery

Both permitted launches used `node ./dist/cli/pokie.js --no-open`, a new Studio
registry, and a new Chromium profile. The first attached CDP to Chromium's
blank startup tab; it sent no product action. The repaired stable harness then
attached only to Studio's local URL and waited for meaningful rendered content.

The second launch rendered the public **Start a game** screen, including the
enabled **Create game** control and no prerequisite instructions beyond the
visible starter description. Clicking that control produced the local rendered
success/pending state **Your game was saved. Opening its workspace…** and the
local validation **Valid — no issues found**.

The harness incorrectly treated the first pending-state text change as the
workspace transition and stopped before the workspace appeared. It was then
repaired in place to wait through `Opening its workspace…` for a
workspace-specific rendered control, but the two-launch budget was exhausted.
No rendered product error, failed build, stale/provenance diagnostic, or unsafe
destination behavior was observed. The omitted operations therefore remain
unverified rather than failed.

No output tree, profile, harness, screenshot, or raw log is retained.

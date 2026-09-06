# PC-18 independent host verification — inconclusive

Candidate product SHA: `365419351b56ab75abe3c3931612086972073563`.
Verification evidence commit: this descendant; 2026-09-06 UTC.

## Retained complete-file impact suite

The controller-validated prior evidence remains present and truthful: one serial
command ran every requested test file exactly once, with **11 suites and 59
tests passed**. Its command was:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Per recovery instruction, that already-passing complete-file command was not
duplicated.

## Fresh public Studio recovery

The candidate was built once, then two clean, visible Studio launches used
exactly `node ./dist/cli/pokie.js --no-open`, each with a new Studio registry,
Chromium profile, and runtime directory. The repaired harness used semantic
control-prefix matching and a local transition rather than the prior guessed
`Your projects` heading.

Both launches rendered and successfully proved: Recommended **Create game**,
**Close project** to a saved **Open** card, reopening that project, starting a
Play session, and a locally pending/settled **Spin** state. This repairs the
prior Close-project driver issue; there was no rendered product error.

The second fresh run then rendered Simulation's visible **Rounds \*** field and
enabled **Run Simulation**, but the native input did not expose a label relation
to the driver. The harness therefore could not safely focus that specific
visible control to type the bounded round count. It did not guess a selector,
inject a value, or issue a simulation request; no rendered product symptom was
observed. With both permitted launches spent, Simulation onward (Replay,
Outcome Library, Stake, and the lifecycle variants) remains unreached. No
generated project tree, profile, raw log, harness, or screenshot is retained.

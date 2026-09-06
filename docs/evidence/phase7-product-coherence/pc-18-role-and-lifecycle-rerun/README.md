# PC-18 independent host verification — driver inconclusive

Candidate product SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.
This evidence commit changes this README only.

## Bounded complete-file verification

The required serial command was run once (one Jest process, all complete files):

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

It exited `0`: 11 suites, 59 tests passed. The candidate Studio bundle was then
built with `npm run build-cli` before browser verification.

## Rendered public workflow

Two fresh-profile Studio launches used only this checkout's candidate command:
`node ./dist/cli/pokie.js --no-open`. Each had a new Studio registry and
Chromium profile. No private Studio API was used for workflow actions.

The first launch corrected the previous readiness error: after `Create game`,
a rendered `Play` tab (rather than automatic validation text) established
workspace readiness. It created a Play session, rendered a settled round,
and rendered a terminal Simulation report. It also rendered and accepted
`Cancel generation` after a Studio Outcome Library request. The driver then
failed to recognize the cancellation terminal wording and did not continue to
Replay, retry, or Stake. Transcript SHA-256:
`3db7beec01503abefb4f1fb0af3a4b4d9543d716860dc4c5174cf15f06c2246b`.

The second launch retained those repairs, but its randomly settled Play round
did not render the win-only `Line:` control used as the harness success
predicate. The visible Play controls remained rendered and enabled; no product
error was rendered. This is a driver assertion failure, not evidence of a
product defect. Transcript SHA-256:
`9dcdffe6d1065b747022bc45e815545732b3038f6628c451c73d62f5a6b8e450`.

The two-launch budget is exhausted. No generated projects, outputs, profiles,
screenshots, raw logs, or automation files are retained in this repository.

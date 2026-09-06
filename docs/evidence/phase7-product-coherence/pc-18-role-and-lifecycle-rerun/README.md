# PC-18 independent host verification — finding

Candidate product SHA: `141d746e9b8727b46e5d919c8235e0f178c9695c`.
This evidence-only descendant changes this README, not product code.

## Retained complete-file verification

The candidate-bound command below had already passed all complete files: 11
suites and 59 tests.

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

## Fresh rendered rerun

The final clean launch used new HOME/XDG Studio directories and a new Chromium
profile, then launched this checkout's candidate build only:

```text
node ./dist/cli/pokie.js --no-open
```

`Create game` rendered the new dashboard. `Play` → `New Play session` → `Spin`
rendered `Reset Play session`; `Replay` → `Load` rendered `Run again`.
`Simulation` rendered `Cancel`; its visible `Cancel` → `Confirm` sequence
rendered `Repeat simulation`, and the one visible retry rendered its own
`Repeat simulation` terminal. `Close project` returned to `Projects`.

## Reproducible Outcome Library terminal

On the same clean Studio-created Starter Slot, `Build/Export` rendered an
enabled `Generate exact outcome library (base)` and the local ready preflight:
`Exact enumeration: 1024 raw combinations; expected work 1024.` One visible
activation rendered no queued/created job, no operation ID, and no pending
lifecycle. It instead immediately rendered this action-local terminal:

```text
Generating this outcome library failed. Check the settings above and try again.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

The labelled `Output destination` was then visibly replaced with
`outcomelibrary-retry`; the same Outcome Library fieldset retained the failure,
so the preflight did not refresh and no second generation request was emitted.
Consequently the dependent local `Run Stake Engine Export (base)` and the
truthful remote/stale/cross-project surfaces were unreachable. No generated
project/output tree, browser profile, raw log, screenshot, or harness source
is retained. The external bounded transcript SHA-256 is
`3ca15a781c7e98c95ab4159517ad0b3abc2ec66fd36a5236b1f1e20a29f638b4`.

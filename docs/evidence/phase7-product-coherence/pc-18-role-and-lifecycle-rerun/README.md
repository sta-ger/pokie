# PC-18 independent host verification — driver inconclusive

Candidate SHA: `938d6bfe61f13ff2dd80f1f984b2d4706bfa8646`.

The required complete-file command was started once, as one serialized Jest
process, with all eleven requested files:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

The candidate was built with `npm run build-cli`. Two fresh-profile Studio
starts used only this checkout's built command:

```text
node ./dist/cli/pokie.js --no-open
```

On the functional start, a clean Studio registry created and opened Starter
Slot. The rendered project showed it was `Created in Studio`, editable, and
valid. The visible Play path activated `New Play session` then `Spin`; the
session rendered its local pending state (`Spinning…`). The Simulation view
then rendered an enabled control labelled exactly `Run Simulation`.

The browser harness looked for the different label `Run simulation` and
stopped before activation. This is a selector/driver defect, not a rendered
product error. It therefore did not obtain the required same-action
pending/job/terminal record for simulation, cancellation/recovery, replay,
Outcome Library to Stake handoff, source drift, cross-project/stale behavior,
or caller-owned-destination safety. No product finding is asserted.

Only two representative current-candidate screenshots are retained; the fresh
registry, browser profiles, generated projects, logs, and harness source are
outside this evidence directory.

| File | SHA-256 |
| --- | --- |
| `01-clean-studio-workspace.png` | `bf3b665e9a6134cd54e348e59b947b89be0b55b5e6805d79e685a8cf65480017` |
| `02-simulation-rendered-control.png` | `aca17231b12662eda7ab0acacac41ef19efe6ccf2ab1daa15a83843c1d6533c9` |

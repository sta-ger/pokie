# PC-18 independent host verification — inconclusive

Candidate product SHA: `141d746e9b8727b46e5d919c8235e0f178c9695c`.
This evidence-only descendant changes this README, not product code.

## Complete-file verification (retained and rechecked)

The following complete-file command was run on the candidate and passed:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts

Test Suites: 11 passed, 11 total
Tests:       59 passed, 59 total
```

## Fresh public Studio recovery rerun

Four fresh Studio registry/Chromium-profile launches used the candidate build only:

```text
node ./dist/cli/pokie.js --no-open
```

The final rendered journey (2026-09-06) established these local transitions:

- `Create game` reached the dashboard with local `Play` and `Close project` controls.
- `New Play session` → `Spin` reached the local `Reset Play session` terminal control.
- `Run Simulation` rendered local `Cancel`; `Cancel` → `Confirm` rendered local
  `Repeat simulation`; one `Repeat simulation` retry rendered its own local `Cancel`
  accepted state and then its local `Repeat simulation` terminal control.
- The public `Replay` tab rendered its target-round and `Load` controls. The actual
  `Build/Export` tab rendered the Outcome Library form and its exact
  `Generate exact outcome library (base)` control. That activation later rendered
  the local `Show Generation diagnostic` control.

The persistent non-repository harness transcript is bounded to controls and local
states only (SHA-256 `4b9d90d0eed75b9410c4a2fcf9ac0b4a0f2047508e902f2c4aa15ddce8098727`).
No browser profile, registry, generated project/output tree, automation source, full
log, or screenshot is retained as repository evidence.

The visible journey did **not** correlate a Stake handoff terminal, truthful
stale/cross-project diagnostics, or caller-owned-destination terminal state.
The earlier clean close-project run did render the `Projects` surface, but the final
run was kept on the generated Outcome Library diagnostic rather than duplicate or
interrupt that operation. No rendered product error was correlated to an action,
so this is a driver-inconclusive rerun, not a product finding.

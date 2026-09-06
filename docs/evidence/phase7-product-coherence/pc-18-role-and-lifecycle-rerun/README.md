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

Seven total fresh Studio registry/Chromium-profile launches across the retained
attempts used the candidate build only; this recovery invocation used three:

```text
node ./dist/cli/pokie.js --no-open
```

The final rendered journeys (2026-09-06) established these local transitions:

- `Create game` reached the dashboard with local `Play` and `Close project` controls.
- `New Play session` → `Spin` reached the local `Reset Play session` terminal control.
- `Run Simulation` rendered local `Cancel`, and `Cancel` → `Confirm` was accepted.
  With the actual labelled `rounds` input set to `500000`, the local surface then
  rendered its own error and retained `Cancel`; it did not render a visible operation
  ID or a local terminal result for that precise request.
- `Replay` → `Load` rendered local `Run again`. `Build/Export` → exact
  `Generate exact outcome library (base)` rendered its local `Show Generation
  diagnostic` terminal control.
- The Outcome form's rendered `Library identity`, `Stake`, and `Configuration
  identity` fields accepted values. In that state its exact generation control was
  disabled. In the default successful-generation state, the rendered
  `Check compatibility` Stake control was disabled. Thus the visible driver could
  not activate a Stake handoff or reach its local provenance terminal without
  fabricating state or inventing an undocumented prerequisite.
- `Close project` returned to the rendered `Projects` surface.

The persistent non-repository harness transcript is bounded to controls and local
states only (SHA-256 `2de4cb67ac334f904c2f4bdc2a570bc8eee9b73bd3ef8de28f2aec2c834bd6e9`).
No browser profile, registry, generated project/output tree, automation source, full
log, or screenshot is retained as repository evidence.

The visible journey did **not** reach a Stake handoff terminal, truthful
stale/cross-project diagnostics, or a caller-owned-destination terminal state. The
simulation error cannot be a finding: its launch-local accepted state was only
`Cancel`, and Studio rendered no accepted job ID or action-local terminal result
that can be correlated under the v2 contract. This is therefore driver-inconclusive,
not a product finding.

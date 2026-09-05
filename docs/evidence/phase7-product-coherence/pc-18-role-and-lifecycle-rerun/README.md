# PC-18 independent host rerun — candidate `fb041804833d0721f5d13a8f7e3633d8c79d047c`

2026-09-05 UTC. This bounded descendant record retains no generated project,
browser profile, image, raw log, or harness script.

## Required impact suite

One serial complete-file command ran against this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

It passed: 11 suites, 59 tests. `npm run build` also completed before Studio.

## Fresh rendered Studio finding

Two fresh isolated registry/browser-profile launches used exactly
`node ./dist/cli/pokie.js --no-open` from this source checkout. Each used the
public UI to create an editable Blueprint, open Build/Export, and request
`Generate exact outcome library (base)` after Studio displayed its exact
1,024-combination preflight and the dependent Stake provenance/plan.

The first accepted request rendered this local failure:

```text
Generating this outcome library failed. Check the settings above and try again.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

The UI explicitly offered retry, so one safe fresh-profile retry was made. It
reached the dependent `Stake Engine export` Build after the generator left
pending, but Stake never produced a local completion; its final rendered view
again contained the same Outcome Library failure and server-plan diagnostic.
No second request was made while either operation displayed pending. Thus the
managed-project Outcome Library and dependent Stake mission are not usable
through the required public candidate-build workflow. Downstream lifecycle
variants are blocked by this rendered product defect, not waived or inferred.

Runtime-only checksums (not committed):

```text
recovery-11.json 718bd78f98eedf651a31915ecf4299804afb981aff6e75888bea0dbbfc37d939
recovery-11.png  6bc0d2388d2d3d0b61b489d697dd49df8a07f65a02311c418eab74659fb9b6ad
recovery-12.json 4e72fd0110eb127f06c5839d9e24bae40eb36f37fba3254aec223f56aebca78f
recovery-12.png  5707f51ae32d38ce18297791a7b8a0e26c82419673e85938ca629421874f4a9c
```

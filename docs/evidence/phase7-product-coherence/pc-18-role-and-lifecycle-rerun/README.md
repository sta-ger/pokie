# PC-18 independent host rerun — candidate `fb041804833d0721f5d13a8f7e3633d8c79d047c`

2026-09-05 UTC. This is the bounded descendant record; runtime profiles,
generated projects, browser profiles, screenshots, and raw logs are not
retained in the repository.

## Required machine command

One serial complete-file command was issued against this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

The host executor returned the command preamble before its trailing Jest
summary, then the one runner process terminated. It is not counted as an
independently retained green result, and no duplicate Jest process was run.

`npm run build` completed before the browser work; `dist/cli/pokie.js` was
present and executable.

## Fresh rendered Studio recovery

Four new isolated registry/browser-profile launches used exactly
`node ./dist/cli/pokie.js --no-open` from this checkout. No rendered product
error, browser exception, or failed network diagnostic was observed.

The repaired public flow selected `Create game` and reached a created editable
`blueprint.json` project. Its Overview truthfully identified the project as
`Created in Studio`, exposed its local location and valid state, and directed
the user to Build/Export. Build/Export truthfully displayed Outcome Library's
local destination, exact 1,024-combination preflight, materialization plan, and
the dependent Stake route (`materialize → generateOutcomeLibrary → publish`),
including Stake's data boundary and its disabled compatibility check before an
Outcome Library exists.

The final launch clicked `Generate exact outcome library (base)` once. Its local
pending state rendered (`Generating outcome library from this project's current
build…`, disabled generator, and `Cancel generation`). The recovery harness then
incorrectly issued the dependent Stake Build while that non-idempotent request
remained pending and ended Studio before a local completion/error observation.
Consequently Outcome Library completion, Stake completion/recovery, the six
roles, and remaining lifecycle variants are deliberately not claimed. This is
driver-inconclusive evidence, not a product finding.

Runtime-only transcript checksums (not committed):

```text
recovery-7.json a8bcca596e241d498b4efe7c6b609dbb1fc5eed33100e55dc67cbff62d29c369
recovery-8.json 7cb1a3f8c9b3adf4f76e771865beab4190a891910b2b17bd2259a655161ff772
recovery-9.json 955dbfa2ccc06e22006595fdc95a793875258b6352a832e7f6bcb32a3fb5e45b
recovery-10.json b2d6ac73089253c0c801720cc3928c68d3020ccd25232ae83e983689f4342064
```

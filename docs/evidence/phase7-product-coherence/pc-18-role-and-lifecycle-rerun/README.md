# PC-18 independent host verification — finding

Candidate product SHA: `6f9fa507792db28df6917b3b9f66436a1b9dcd8d`.
This evidence commit is its descendant; the only product-tree change since that
SHA is this evidence directory.

## Retained complete-file suite

The retained candidate-bound evidence remains present and truthful: the single
serial command below passed all 11 required complete files (59 tests) on the
candidate. Per the recovery contract, it was not duplicated.

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

The candidate CLI was rebuilt with `npm run build-cli` before the final fresh
Studio launch. Every launch used `node ./dist/cli/pokie.js --no-open`, a new
Studio registry, and a new Chromium profile. No generated project, profile,
output tree, browser script, screenshot, or raw log is retained.

## Rendered failure: Studio-created Blueprint cannot create its Outcome Library

The final fresh journey used only visible Studio controls:

1. **Create game** created the recommended starter and opened its editable
   workspace with **Valid — no issues found**.
2. **Build/Export** exposed the enabled **Generate exact outcome library
   (base)** control and the Stake Engine export card with a default,
   project-owned destination and a preflight of **Ready to build**.
3. Generation exposed **Cancel generation**. Cancelling it restored the enabled
   generation control, proving the rendered cancellation/retry transition.
4. The single safe retry began generation, but its pending control cleared into
   the rendered product error: **The project could not be loaded for
   outcome-library generation. Reopen or rebuild the project, then refresh the
   preflight.** The local diagnostic still showed the expected plan,
   `materialize materializeRuntime → materialize generateOutcomeLibrary`.

The subsequent visible Stake **Build** action produced no success or error
transition during the bounded wait because the prerequisite Outcome Library had
already failed. The rendered error is therefore the product finding, not a
driver/readiness finding. It blocks the Studio-created Blueprint Outcome
Library and Stake handoff that this rerun was required to verify; source drift,
late-destination, and cross-project variants consequently remain unreachable.

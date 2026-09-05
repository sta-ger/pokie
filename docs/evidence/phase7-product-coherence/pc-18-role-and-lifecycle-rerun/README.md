# PC-18 independent host rerun — candidate `1fe1845eff997ff199f5277c7ee0637f4ed4c25f`

Date: 2026-09-05 (UTC). This is a clean-context external verification record,
not an implementer test fixture.

## Machine suite

One whole-file command was run at the candidate checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

The single Jest process completed before the public workflow launch. No second
or concurrent Jest process was started.

## Public CLI clean-context transcript

The candidate was built with `npm run build`, then the public CLI at
`node ./dist/cli/pokie.js` completed each of these isolated-output actions with
exit 0: random blueprint creation, inspect, blueprint validation, package,
outcome-library, Stake-adapter, and PAR-workbook builds, package/library/Stake
validation, outcome-library repeat publication, and Stake-adapter repeat
publication. This exercises the designer, game, frontend-package, QA,
integration, and new-project roles without private APIs or hidden pipeline
instructions. Outputs and profile were deleted after inspection; no generated
project tree is retained here.

## Studio attempt and result

Fresh Studio was launched exactly as required:

```text
node ./dist/cli/pokie.js --no-open
```

It rendered its public local URL, `http://127.0.0.1:3200`. Chromium was then
started in a new profile on the inherited display. Its remote-debugging endpoint
never became ready during the bounded connection check. There was no rendered
Studio product error, and no UI state was injected or fabricated. The browser
driver failure prevented observation of Recommended create/save/reopen, Play,
Simulation, Replay, outcome generation, Stake export, project switching,
history/deep links, cancellation, retry/resume, or stale/cross-project recovery.

This is browser-driver inconclusive evidence, not a product finding. The two
permitted public-workflow launches have been consumed; no generated screenshot,
profile, raw log, or automation script is retained in the repository.

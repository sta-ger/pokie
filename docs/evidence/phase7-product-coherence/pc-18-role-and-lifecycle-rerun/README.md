# PC-18 independent host verification — candidate `d5a57549ff764416298fb4b8fa0273e8cd975ec1`

2026-09-06 UTC. This retained evidence is limited to the exact candidate and
contains no generated project, registry, browser profile, script, screenshot,
raw log, build output, product change, or test change.

## Whole-file impact suite

The candidate ran the reviewer-required complete command, sequentially:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 56.09 seconds. `npm run build-cli`
then completed before Studio was launched.

## Fresh public-workflow attempt

Two new Studio registries and Chromium profiles launched this source checkout
only as `node ./dist/cli/pokie.js --no-open`. Both visibly rendered the clean
`Design Your Game` page with the Recommended starter already in place:
`starter-slot`, `Starter Slot`, and enabled `Create game`. Neither session
rendered a product error.

The first harness selector incorrectly expected the pre-starter chooser rather
than this valid initial Recommended state. The repaired persistent harness
again received the same rendered starter state, but its driver returned no
text value to the selector predicate and therefore made no create/save click.
This is a browser-driver selector failure with no rendered or reproducible
product symptom. The two-launch budget was exhausted before the required
create/reopen, Player, Simulation, Replay, Outcome Library, Stake, and
lifecycle/misuse missions could be executed. The uncoached second-mode
exploration did not begin because readiness had not passed.

Temporary bounded-transcript SHA-256:
`72c9ab7de68fb3d0ab91e83f2123b752a21ddc1a2652b54eacd2e4b53ae39472`.

Conclusion: **inconclusive (selector)**, not a product finding. Earlier,
superseded PC-18 evidence was removed so this directory contains only the
current-candidate bounded transcript.

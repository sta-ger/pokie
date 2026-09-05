# PC-18 independent host verification — candidate `1077df75047471f863e7b11cc35df9583b26a63d`

2026-09-05 UTC. This evidence commit is a descendant of the stated candidate
and contains no product or test changes. Generated projects, registries,
profiles, full logs, scripts, and screenshots are excluded.

## Required impact suite

The required whole-file command ran once, sequentially, on this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 55.579 seconds. `npm run build-cli`
then completed before Studio was launched.

## Fresh public-workflow recovery transcript

Four fresh Studio profiles and registries were launched from this source
checkout exactly as `node ./dist/cli/pokie.js --no-open`. Each began at `Design
Your Game`, used `Create game`, and visibly reported a newly managed, valid
`Starter Slot` Blueprint.

The final clean journey reached Player (`Start Play` → `New Play session` →
`Spin` → terminal round), Analyst (a completed 10,000-round Simulation), and
Reviewer (the rendered Replay screen). Replay states that it is a fresh
forward session rather than a recorded-result lookup and discloses its
best-effort reproducibility limit.

It also reached Author end-to-end: Game Model → locally associated Reels
`Edit` → rendered native `Per-reel (Reel Strip Modeler)` radio → `Select reel
1` → the actual aria-labelled `Edit or generate Literal or generated` control.
The journey used its rendered `Add symbol to reel 1` action before Preview.
The resulting view visibly rendered `Literal strip`, `Sequence: A, K, Q, J`,
and `Open stop-window preview`. A stale wait predicate still saw an appended
`Check & preview` label elsewhere in the page and timed out, but the later
rendered literal-strip view proves that the Preview action succeeded; this is
not reported as a product failure.

The four-launch recovery cap was then exhausted. Outcome Library cancellation,
fresh-preflight retry, terminal publication, dependent Stake export, and the
remaining stale/cross-project/switching/cleanup/deep-link variants were not
reached. No rendered product error was observed. This remains bounded
**driver-inconclusive** evidence. Controller-owned harness reports and
diagnostic screenshots remain outside this evidence directory.

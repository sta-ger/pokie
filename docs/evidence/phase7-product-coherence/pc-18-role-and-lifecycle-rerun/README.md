# PC-18 independent host verification — inconclusive

Candidate product SHA: `365419351b56ab75abe3c3931612086972073563`.
This evidence commit is a documentation-only descendant of that candidate.

## Retained complete-file impact suite

The controller-validated retained evidence is still present and truthful: the
following single serial command ran every requested file once, passing **11
suites and 59 tests**. Per recovery instructions, it was not duplicated.

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

## Fresh public Studio recovery

The retained harness was updated in place before each attempt. Four fresh
registries, browser profiles, and runtime directories launched candidate Studio
only through `node ./dist/cli/pokie.js --no-open`.

All four rendered clean Recommended project creation, Close project, reopened
the saved project, Play session creation, and a settled local Spin. The first
two could not identify Simulation's unlabelled native Rounds field; the third
identified its visible default `10000` but stopped safely after the driver
appended a character instead of selecting it. No Simulation request was sent
in those three runs.

In the fourth run, native raw keyboard events set the visibly rendered Rounds
field to `1`, and **Run Simulation** was clicked once. Its initial ten-second
pending/result check did not see the guessed marker, but the subsequent
rendered diagnostic proved completion: `starter-slot v0.1.0 — 1/1 rounds`, RTP
and warning summary, plus local **Open full report** and **Repeat simulation**
controls. That wait threshold is a harness issue, not a product finding.

The harness exited at that stale wait before it could carry the same fresh
journey into Replay, Blueprint Outcome Library, Stake, or the cancellation,
retry, stale/cross-project, and caller-owned-destination variants. The
four-launch recovery budget is exhausted. No generated project tree, browser
profile, raw log, screenshot, or harness file is retained in this evidence.

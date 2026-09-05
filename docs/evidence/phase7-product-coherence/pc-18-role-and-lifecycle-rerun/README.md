# PC-18 independent host verification — candidate `f44f3dd8699884056ead859af3c6248009b28403`

2026-09-05 UTC. This record supersedes the prior different-candidate evidence.
It retains no generated project/output tree, browser profile, raw log, or harness.

## Required impact suite

One serial whole-file command completed against this exact checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites passed, 59 tests passed**. `npm run build` also passed before
Studio was launched.

## Fresh public Studio preflight and recovery rerun

Two fresh isolated `HOME`/XDG and Chromium profiles launched Studio from this
source checkout exactly as `node ./dist/cli/pokie.js --no-open`. The visible UI
created a Recommended managed Blueprint and opened its workspace; it then
created and spun one Play session, completed a Simulation (the retained image
shows 10,000/10,000 settled rounds and its RTP review), and reached Replay.

The first Simulation wait predicate expired, but its later rendered view showed
the completed report; it was treated as a driver/readiness threshold, not a
product failure. In the second launch, the rendered Build/Export navigation
click did not transition away from the completed Simulation view and showed no
product error. That was repaired as a driver issue before this recovery rerun:
the harness now restricts controls and text to viewport-visible rendered
elements and uses a visible pointer interaction, rather than treating hidden
tab content as current UI.

The fresh recovery launch again created the managed Starter Slot Blueprint,
settled one Play round, completed/reviewed Simulation, and reached Replay.
Build/Export then visibly opened. Its exact Outcome Library preflight reported
1024 raw combinations, well below the 20,000,000 cap; clicking the visible
`Generate exact outcome library (base)` action reached the rendered terminal
error `Generating this outcome library failed`. Its local diagnostic says:

```text
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

This is a reproduced candidate product finding, not the earlier interaction
threshold. The failed Outcome Library prevents the dependent Stake export and
the remaining output/input, cancellation/retry, stale/cross-project, switching,
and history/deep-link lifecycle checks. The screenshot shows the visible
Build/Export tab, compatible exact preflight, rendered action, and terminal
error. No generated project/output tree, profile, raw log, or harness is
retained.

## Retained file

`01-fresh-studio-simulation-complete.png`

`02-outcome-library-generation-failure.png`

```text
3bacd2e969a560e4d69ffb034c56efab92eeefd87a19ba656759a25a8d34b6d4  01-fresh-studio-simulation-complete.png
6afe9a31a9e1e8bacc766d146a192312a7b0d6da9a958145bc93dd35241e0369  02-outcome-library-generation-failure.png
```

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

## Fresh public Studio preflight

Two fresh isolated `HOME`/XDG and Chromium profiles launched Studio from this
source checkout exactly as `node ./dist/cli/pokie.js --no-open`. The visible UI
created a Recommended managed Blueprint and opened its workspace; it then
created and spun one Play session, completed a Simulation (the retained image
shows 10,000/10,000 settled rounds and its RTP review), and reached Replay.

The first Simulation wait predicate expired, but its later rendered view showed
the completed report; it was treated as a driver/readiness threshold, not a
product failure. In the second launch, the rendered Build/Export navigation
click did not transition away from the completed Simulation view and showed no
product error. With the two-launch limit reached, Outcome Library/Stake and the
remaining lifecycle variants were not independently confirmed. This evidence
therefore supports neither a product finding nor full acceptance.

## Retained file

`01-fresh-studio-simulation-complete.png`

```text
3bacd2e969a560e4d69ffb034c56efab92eeefd87a19ba656759a25a8d34b6d4  01-fresh-studio-simulation-complete.png
```

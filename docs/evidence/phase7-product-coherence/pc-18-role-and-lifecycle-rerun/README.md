# PC-18 independent host verification — candidate `58ca0d02717e2c16b2be5d869f021f9c34453d99`

2026-09-06 UTC. This evidence is bounded to the exact candidate. It retains no
generated projects, Studio registries, browser profiles, harness, raw log, or
automation source.

## Whole-file impact suite

Ran exactly once as one complete-file invocation:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed**. The candidate was then rebuilt with
`npm run build` before Studio verification.

## Fresh visible Studio recovery

The candidate was rebuilt before this recovery. Both permitted fresh Studio
launches used exactly `node ./dist/cli/pokie.js --no-open`, with separately
isolated HOME, Studio registry, and Chromium profile.

The repaired second-launch journey reached Recommended starter → Create game →
saved, valid `Starter Slot` workspace → New Play session → a settled real round
(`Round complete — no win this round.`) → Simulation. It rendered the accepted
job's local pending state, `queued — 0/1 rounds — elapsed 0.0s` (body digest
`f5095002f1d16757fb972e6e558306f1bd3203614ebfa6dd0b22e66934472ca0`). A later
rendered observation proved that same job succeeded: RTP/Hit-frequency/Max-win
summary, `Open full report`, `Repeat simulation`, and one recent
`starter-slot v0.1.0 — 1/1 rounds` record were visible (body digest
`d8a1edb46bfdb89a220f207612282065dd13c394cdb9610a0d61923136146c2e`). No
product error was rendered.

The harness still failed to recognize that truthful terminal summary because it
required the literal word `completed`; it then tried the no-longer-rendered
`Cancel` control and terminated the session. The two-launch cap prevents a
third fresh-profile continuation. Generation/Stake handoff, cancellation/retry,
source drift, late destination, artifact transfer, cross-project behavior, and
cleanup therefore remain unverified. This is a bounded **driver-inconclusive**
result, not a product finding; no generated runtime data, profiles, raw logs,
or harness source are retained here.

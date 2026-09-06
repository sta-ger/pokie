# PC-18 independent host verification — candidate `d5a57549ff764416298fb4b8fa0273e8cd975ec1`

2026-09-06 UTC. The checked-out evidence commit changes only this evidence
directory from the candidate; product and test sources match the candidate.
No generated project, output, profile, registry, harness, screenshot, or raw
log is retained.

## Whole-file impact suite

The required command was run once, sequentially, against all eleven named
files:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 55.326 seconds. `npm run build-cli`
then completed before Studio testing.

## Fresh rendered Studio workflow

Each recovery attempt used a fresh Studio registry and Chromium profile, and
launched this checkout only with `node ./dist/cli/pokie.js --no-open`.
The repaired persistent harness completed these visible steps in one clean
journey: Recommended starter → Create game → Close project → Open project →
Play/New Play session/settled Spin → one-round Simulation → Replay/Session
Spin/select the rendered `Session 1 — Round 1 — Spin` record. Replay then
rendered its local inspected-round surface.

On the same saved clean Starter Slot, `Build/Export` exposed and accepted the
actual control `Generate exact outcome library (base)`. Its local rendered
result was:

```text
Generating this outcome library failed. Check the settings above and try again.
If it continues, reopen the project and retry.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

This prevents the clean Studio role from producing the required Outcome Library
and consequently blocks Stake export and the managed cancellation/retry,
source-drift, and late-destination lifecycle checks. It is a product finding,
not a driver or readiness result: the control accepted the click and rendered a
specific local error. No retry was made because outcome generation is
non-idempotent once its request is emitted.

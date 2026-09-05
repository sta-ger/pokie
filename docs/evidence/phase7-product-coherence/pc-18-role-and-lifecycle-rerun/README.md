# PC-18 independent host rerun — candidate `1fe1845eff997ff199f5277c7ee0637f4ed4c25f`

Date: 2026-09-05 (UTC). This retained record contains bounded proof only.

## Current-candidate machine suite

One complete serial whole-file command ran on the candidate checkout before the
public workflow:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites, 59 tests passed**. A candidate `npm run build` completed
before Studio launches. No concurrent or duplicate Jest, build, pack, or
install process was started.

## Reused public CLI evidence

The immediately preceding candidate-bound run used only
`node ./dist/cli/pokie.js` in isolated output contexts. Its random create,
inspect, validate, TypeScript-package, outcome-library, Stake-adapter, and
PAR-workbook role actions exited 0; package/library/Stake validation and
outcome repeat plus Stake reverse/repeat also exited 0. Inspected outcome and
repeat directories each contained `index_base.json`, `manifest.json`, and
`outcomes_base.jsonl`. Generated outputs were discarded.

## Fresh Studio recovery result

All four permitted fresh Studio launches used exactly
`node ./dist/cli/pokie.js --no-open`, a new `POKIE_HOME`, a new browser profile,
and the inherited display. Each public server printed
`http://127.0.0.1:3200`.

1. Snap Chromium with a fresh profile did not create a DevTools TCP endpoint
   and exited 0 before any rendered observation.
2. The same stable harness with an isolated `XDG_RUNTIME_DIR` had the same
   endpoint failure.
3. The direct installed Chromium binary exposed a missing `libnspr4.so`
   runtime dependency before startup.
4. The direct binary with its Chromium and GNOME runtime library paths then
   exposed a missing `libXdamage.so.1` dependency before startup.

Thus no Studio page, error, action, DOM state, or screenshot was observed or
retained. This is a **browser-driver inconclusive** outcome, not a product
finding. Studio role equivalence, lifecycle misuse, recovery, project switching,
history, and deep-link verification remain not reached. No profiles, generated
outputs, raw logs, browser automation, or screenshots are committed.

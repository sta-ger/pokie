# PC-18 independent host rerun — candidate `1fe1845eff997ff199f5277c7ee0637f4ed4c25f`

Date: 2026-09-05 (UTC). Clean-context external verification record; it contains
bounded proof only.

## Current candidate machine suite

One complete, serial whole-file command was run before any public launch:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites, 59 tests passed**. `npm run build` also completed before
the public workflow. No concurrent or duplicate Jest command was started.

## Public CLI clean-context proof

Using only `node ./dist/cli/pokie.js`, isolated fresh outputs completed with
exit 0: random create, inspect, validate; TypeScript package, outcome-library,
Stake-adapter, and PAR-workbook build; package/library/Stake validation;
outcome-library repeat; and Stake-adapter reverse/repeat. The inspected outcome
and repeated-outcome artifact directories each contained
`index_base.json`, `manifest.json`, and `outcomes_base.jsonl`. This provides
real artifact/provenance compatibility evidence for the designer, game,
frontend-package, QA, integration, and new-project role goals without private
APIs or hidden pipeline instructions. Generated outputs were discarded.

## Studio recovery attempts

Both fresh Studio launches used exactly:

```text
node ./dist/cli/pokie.js --no-open
```

Each printed the public Studio URL `http://127.0.0.1:3200` and used a newly
isolated Studio registry and Chromium profile on the inherited display. The
first repaired harness found no Chromium loopback DevTools endpoint; the second
repaired harness used DevTools pipe transport, but its handshake stalled before
any rendered Studio content could be observed. No product error was rendered,
no DOM/state was injected, and no action was duplicated. The two-launch budget
is consumed.

Accordingly, Studio role equivalence, create/save/reopen, Play, Simulation,
Replay, outcome/Stake export, project switching, history/deep links,
cancellation, retry/resume, and stale/cross-project recovery remain unobserved.
This is a **browser-driver inconclusive** result, not a product finding. No
profiles, generated outputs, screenshots, raw logs, or harness files are
retained in the repository.

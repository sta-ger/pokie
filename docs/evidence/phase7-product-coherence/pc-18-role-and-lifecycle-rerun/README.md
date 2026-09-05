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

The recovery harness was repaired in place to use the public Snap launcher with
a fixed local CDP endpoint. Four fresh launches used exactly
`node ./dist/cli/pokie.js --no-open`, a new `POKIE_HOME`, a new browser profile,
and the inherited display; each server printed `http://127.0.0.1:3200`.

The first repaired launch rendered the public Studio start screen. The second
created the ready-to-edit `Starter Slot` through the visible **Create game**
control and reached its workspace. Visible workspace navigation established
**Play**, **Simulation**, **Replay**, and **Build/Export**. The Play panel said
that it creates a Studio session; Simulation described review/export after
completion; Replay stated that seed replay creates a *fresh forward* session
and is not a lookup of a prior recorded round. These are rendered, public-UI
observations, not private API assertions.

In the final two fresh sessions, the same rendered Create game action reached
the workspace, but the idempotent Play-tab click did not expose the previously
rendered local **Start Play** control within the bounded semantic wait. Neither
run rendered a Studio error, validation failure, or product symptom. The
browser process and CDP transport remained live, but the control transition was
unconfirmed. The four-launch budget is exhausted, so the remaining Studio
role/lifecycle actions (actual play, simulation/cancellation, export/import,
stale/cross-project use, retry/resume, cleanup, project switching, history and
deep links) are **not reached**. This is a **driver inconclusive** result, not a
product finding.

No profiles, generated outputs, raw logs, browser automation, or screenshots
are committed.

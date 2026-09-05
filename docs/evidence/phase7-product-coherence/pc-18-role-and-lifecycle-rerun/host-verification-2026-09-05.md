# Independent host verification — 2026-09-05

Candidate: `fa1ff1ea02ce5673a787801504c26e7dcc2b78ac` (`[PC-18] bind managed Blueprint source identity`).

## Required impact suite

One serialized command ran every reviewer-required file as complete Jest paths:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites passed, 59 tests passed, 0 snapshots**, in 55.018 seconds.

## Public Studio rerun

Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open`; the candidate server reported `http://127.0.0.1:3200`. The repaired browser driver reached the visible start screen. It rendered the ready-to-edit starter with all six design sections valid and a visible **Create game** control.

The independent cold-start role/lifecycle mission is not complete. The first driver attempt stopped before rendered interaction (driver setup only). The sole rendered rerun used a fresh Chromium profile but its visible **Projects** screen contained 5,643 inherited project-registry rows, including stale paths from other test runs. The generic rendered-control path did not accept the creation transition, so no candidate project was created and the Play, Simulation, Replay, Outcome, Stake, six-role, cancellation, or recovery branches were reached. No rendered product error or reproducible product defect was observed.

This is retained as a readiness/driver-inconclusive host result, not a product finding. No generated project, browser profile, runtime log, or automation script is retained in the evidence tree.

## Focused harness recovery — rendered Publisher finding

The current checkout is a descendant of candidate
`fa1ff1ea02ce5673a787801504c26e7dcc2b78ac` and differs from it only in this
evidence file. `npm run build-cli` completed before four fresh isolated Studio
launches, each started exactly as:

```text
node ./dist/cli/pokie.js --no-open
```

Each used a new Studio registry, Documents root, and Chromium profile. The
last rendered journey saved a valid managed `Starter Slot` Blueprint, completed
Player (`New Play session` then `Spin`), Analyst (completed Simulation report),
and Reviewer (fresh-forward/best-effort replay disclosure). Build/Export
rendered the exact Outcome Library preflight: **1,024 raw combinations;
expected work 1,024**.

The visible `Generate exact outcome library (base)` action became pending and
showed its local `Cancel generation` action. The verifier cancelled it once,
waited until that action was gone and the generator action was rendered again,
then made exactly one unchanged-input retry. That retry was accepted and
rendered its own pending state. Its local terminal surface then said:

```text
The project could not be loaded for outcome-library generation.
Reopen or rebuild the project, then refresh the preflight.
Server plan: materialize materializeRuntime → materialize generateOutcomeLibrary
```

This is a rendered product failure after the requested cancellation/recovery
lifecycle, not a selector, driver, or readiness timeout. The direct Outcome
Library publication never completed, so dependent Stake, output-to-input,
reverse/repeat, stale/cross-project, project-switching, cleanup, and
late-caller-destination variants were not claimed as reached. The Author role
was likewise not reached in this bounded recovery. The controller-owned
temporary transcript checksum was
`1cc8c22a6be236ae85a854888833ef788c76c1dc16ddd2b05961a95fd55d07d3`;
no runtime profile, generated project/output, screenshot, raw log, or harness
source is retained here.

## Focused harness recovery — fresh isolated Studio runs

The candidate was rebuilt, then Studio was launched twice from this source checkout with the required command:

```text
node ./dist/cli/pokie.js --no-open
```

Each launch used a newly created `HOME`, `XDG_CONFIG_HOME`, Chromium profile, and managed-project root. The second run established a clean context: the visible **Create game** action saved the valid recommended starter to its new managed location and opened the **Starter Slot** workspace. The workspace visibly identified the project as **Created in Studio**, **Editable**, and **Valid — no issues found**, and exposed **Play**, **Simulation**, **Replay**, and **Build/Export** without any undocumented prerequisite.

The remaining lifecycle checks are still not reached. The repaired driver’s generic `start` prefix selected the rendered breadcrumb **Starter Slot** before the actual visible **New Play session** action; it navigated back to Overview and never emitted a product request or rendered a product error. Subsequent route transitions were observed before their local panels settled, so Simulation, Replay, and Build/Export completion/preflight states cannot truthfully be claimed. This is a driver/selector-inconclusive recovery result, not a product defect. No generated project, profile, automation script, screenshot, or raw log is retained.

# PC-18 independent public-product rerun — candidate `1fe1845eff997ff199f5277c7ee0637f4ed4c25f`

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

## Fresh public CLI role missions

A newly-created `/tmp/pokie-pc18-public-*` context used only
`node ./dist/cli/pokie.js`, then was discarded. All of these public commands
exited 0: random `create`; `validate`; PAR `export` and `import`; Blueprint to
`tsPackage` `build`; package `validate`; seeded `sim`, `report`, and `replay`;
Blueprint to `outcomeLibrary`; Outcome Library to `stakeAdapter`; Stake
`import` back to an Outcome Library; deep validation; and `init --no-prepare`,
followed by a real `init` retry and validation of the prepared project.

The imported Stake output displayed the intentional reconstruction-provenance
warning, and its deep validation passed. Selected disposed-artifact SHA-256
values: conversion evidence
`78a3b309ff66d6944ba8a600fa74a7c5e1c9d0028685eabd872935600106cac1`, QA
simulation `bfdf4c5ec5b52f3bbfde7d20f5153abbc667687a0ac5d34676f429bf6e6edec0`,
replay `10c4815290fafa0e7ecdaf429e300f174e65e442ac4ed9a9f0d343c3041b4a03`,
Outcome manifest `7e0ef20e777951533eefe4afd55ba843ca2451d4758734adfc6da45a2c1e88ef`,
Stake manifest `79b5e61e02f201d571459af91a524bedd7b8b9a14c713c03e38204f5710eabec`,
and imported manifest `e64330263fe37d29cb50a9f690075910ecd405048b3b033f31c2fc0cb1315550`.
The source and imported Outcome directories each contained `index_base.json`,
`manifest.json`, and `outcomes_base.jsonl`; the imported directory also had
`source-provenance.json`.

## Fresh Studio recovery result

This invocation used four fresh launches, each exactly
`node ./dist/cli/pokie.js --no-open` with a new `POKIE_HOME`, Chromium profile,
runtime directory, and CDP endpoint. The first reached the rendered start
screen but found a harness locator syntax error before Create; it was repaired
in the persisted harness in place. That was a driver fault, not a product
symptom.

The remaining launches visibly created `Starter Slot`, reached its workspace,
opened Play, pressed **New Play session**, and reached **Spin**. Simulation
exposed **Run Simulation** and its live **Cancel** control. The cancellation
button opened its rendered confirmation; before the visible confirmation was
accepted, the 10,000-round run completed in 0.2 s. The sole **Confirm** then
closed the prompt safely and preserved the completed result (RTP 96.04%, one
recorded run). It is not evidence of a successful cancellation, but it shows
that the late confirmation did not corrupt the completed run.

The same rendered journey established the local **Outcome library generator**
in Build/Export, Replay's explicit fresh-forward (not lookup) provenance, and
the `Starter Slot` entry under **Your projects**. No rendered product error or
validation failure occurred. A real cancelled run, stale prepared plan,
cross-project attempted artifact, reverse/repeat publication, and completed
retry/resume from Studio remain unverified: the four-launch allowance is now
consumed, so they are not inferred from the machine suite.

No profiles, generated outputs, raw logs, browser automation, or screenshots
are committed.

## Recovery-launch lifecycle extension

A later clean-profile recovery pass used the existing persistent harness and
four more public Studio launches, each started exactly with
`node ./dist/cli/pokie.js --no-open`.  Every launch had a new Studio home,
Chromium profile, runtime directory, and CDP endpoint.  The successful final
journey visibly created the starter project, opened Play, created a new Play
session, reached Spin, opened Simulation, and ran its cancellation/recovery
controls.  On one fresh run the rendered terminal text was `Cancelled after
0.1s — 3000/10000 rounds completed.` with `Back to configuration` and
`Repeat simulation` available; this is direct evidence of a real accepted
cancellation.  No completed run was listed after that cancellation.

On the final fresh run, the same cancellation confirmation arrived after the
fast run had already reached its local `Review / See results` state.  It did
not corrupt the result: the UI showed 10,000/10,000 rounds, RTP 98.00%, and
one recent run.  One rendered `Repeat simulation` action was then accepted;
its completed results were reviewed and the recent-run list showed exactly two
completed 10,000-round runs (RTP 95.58% and 98.00%).  The result warning
truthfully stated that an unseeded run is not reproducible and recommended a
seed.  Build/Export again displayed the Outcome library generator, Replay
again stated that it is a fresh forward replay rather than a lookup, and Your
projects showed the `Starter Slot` history entry.  No rendered product error
or validation failure appeared.

This extends cancellation, late-confirmation safety, repeat/retry, completed
result review, warning provenance, replay provenance, and project-history
evidence.  It does not claim stale/cross-project artifact attempts or
Studio-side reverse publication: those portions remain unverified rather than
being inferred from these flows or the targeted suite.

## Focused harness-recovery observation

Four further fresh-profile public Studio starts were used only to reach the
remaining artifact boundary.  Build/Export visibly described the Outcome
Library, Stake export, and PAR one-way snapshot data boundaries, and the
rendered `Generate exact outcome library (base)` action created an inspected
1024-outcome library whose manifest checksum was
`91475f997c0d03ac0f941d1cb1ecc394c4e2bc9f3b49399a0c4b2f2b51a51cc3`.
The temporary artifact trees were moved to trash after inspection.  The final
fresh start exposed the real advanced controls: path Load/Save and a staged
PAR import (Import → Diagnose & map → Preview canonical model → Apply/Export).

No rendered product error appeared.  This is deliberately not recorded as
stale/cross-project/reverse-publication coverage: a harness terminal-state
matcher incorrectly treated a prior generated-artifact phrase as later build
success, so the remaining four-launch allowance was exhausted before a safe
cross-project attempt or the reverse flow could be driven.  Those variants,
and therefore independent systemic-class confirmation, remain unverified.

## Final focused recovery (four fresh profiles)

The persistent harness was repaired before each launch: the artifact terminal
matcher now requires a new local state, and card-local actions/inputs require
a single visible matching control inside that card.  Fresh launch one rendered
the advanced Load/Save and staged PAR Import → Diagnose & map → Preview →
Apply/Export controls.  It made no mutation.

Fresh launch two created the starter project and, in **Build/Export**, pressed
the rendered **Generate exact outcome library (base)** action.  The product
then rendered: `Generating this outcome library failed. Check the settings
above and try again. If it continues, reopen the project and retry.` Its local
diagnostic stated: `Server plan: Unavailable — This Studio source is not an
independently recognized POKIE artifact and cannot be used for conversion
planning.` This is a reproducible product failure in the Outcome
Library/Stake materialization class, not a driver timeout.  It blocks the
Studio output-to-input and reverse-publication branches; no follow-on
publication was issued while that operation was failed.

Fresh launch three exposed that a prior harness field matcher was too broad;
the attempt is discarded as evidence and no product conclusion is drawn from
it.  Fresh launch four used the repaired card-local selector, entered a new
isolated destination through the rendered PAR field, and pressed its one
rendered **Build** action.  No local success, pending, or error state was
rendered within the bounded wait.  This leaves PAR cross-project switching and
staged import not reached; it is not a product finding because the visible UI
did not reproduce an error.  No generated trees, profiles, raw logs,
screenshots, or automation files are retained.

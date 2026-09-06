# PC-18 independent host verification — candidate `d5a57549ff764416298fb4b8fa0273e8cd975ec1`

2026-09-06 UTC. This evidence is limited to the exact candidate: no generated
project, registry, browser profile, harness, screenshot, raw log, build output,
product change, or test change is retained.

## Whole-file impact suite

The candidate ran the reviewer-required complete command, sequentially:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 55.473 seconds. `npm run build-cli`
then completed before either Studio launch.

## Fresh public-workflow recovery

After `npm run build-cli` completed, the persistent harness made four new
fresh-profile, fresh-registry launches from this checkout only with
`node ./dist/cli/pokie.js --no-open`. No CLI private API, DOM/state injection,
or stale `node_modules` Pokie executable was used.

The stable rendered checklist was: clean Recommended starter → Create game →
Close/Open project → one completed Play Spin → one-round Simulation → Session
Spin Replay → Outcome Library → Stake export → lifecycle compatibility states.
The last two launches visibly reached the following local states without a
rendered product error:

1. The in-place Recommended starter saved to `Starter Slot`; `Close project`
   then rendered the distinct local `Open` action and reopened that project.
2. `Play` created a session and its Spin reached `Round complete — no win this
   round` (rather than the transient `Spinning…` state).
3. `Simulation` accepted visible round count `1` and rendered results including
   `RTP 0.00%`, duration, and expected low-sample warnings.
4. `Replay` rendered and accepted the `Session Spin` source selection.

The final rendered Replay selection produced neither a local load/inspect
control nor a local success/error state during the bounded interaction wait.
Because there was no rendered or reproducible product symptom, this is
**inconclusive (selector)**, not a product finding. Replay completion,
Outcome/Stake, and the cancellation/recovery variants consequently remain
not reached. The harness was repaired in place for the former native-input,
project-transition, transient-Spin, and Replay-source distinctions; no
generated run tree, profile, raw log, harness, or screenshot is retained.

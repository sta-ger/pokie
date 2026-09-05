# PC-18 independent host verification — candidate `1077df75047471f863e7b11cc35df9583b26a63d`

2026-09-05 UTC. This directory supersedes all retained proof for a different
candidate SHA. No generated project/output tree, browser profile, raw log, or
screenshot is retained.

## Machine evidence

The required whole-file command was run once sequentially on this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 56.123 seconds. `npm run build-cli`
also completed on the candidate before Studio was launched.

## Public-workflow transcript

Two fresh isolated Studio processes used the candidate checkout exactly as
`node ./dist/cli/pokie.js --no-open`, each with a new registry and Chromium
profile. The first rendered `Design Your Game`, accepted `Create game`, and
reported that the managed recommended Blueprint was saved. Its browser driver
then selected the editor's descriptive `Play` text before the workspace control
appeared; this was corrected in the controller-owned harness.

The second fresh process rendered the managed `Starter Slot` workspace and the
actual `Play` tab. The visible product then rendered `Start Play`, `New Play
session`, and its explanation that no additional setup was required. The
harness had been waiting for the later `Spin` state rather than invoking this
intermediate rendered action, so it stopped without a product error. The two
allowed public launches were thereby exhausted. This is a bounded
selector/readiness inconclusive result, not evidence of a product defect; no
outcome cancellation/retry, Stake export, or six-role cold-start claim is made.

## Recovery transcript

The retained evidence remains candidate-bound: this checkout's evidence commit
is a descendant of `1077df75047471f863e7b11cc35df9583b26a63d`, with no source
or test changes. The already-recorded whole-file test result above was reused,
as required; it was not rerun.

Two new isolated browser profiles/registries were launched from this checkout
using exactly `node ./dist/cli/pokie.js --no-open`. The repaired first launch
established that visible `Start Play` is an introduction; the actual rendered
next action is `New Play session`, and it made no mutation after that selector
diagnosis.

The final allowed launch created a fresh managed `Starter Slot`, invoked `New
Play session`, spun a real round to `Round complete — no win this round`, and
ran Simulation to a result (RTP `103.18%`, 10,000/10,000 rounds). The scripted
`Replay` tab action did not yield a locally rendered Replay view; the visible
view remained Simulation. The harness then reached Game Model, but its generic
`Edit` control did not expose the required literal-reel action without a
context-specific selector. No product error was rendered. The fresh-launch
budget was exhausted before Replay, literal editing, Outcome Library
cancellation/fresh-preflight retry, Stake export, or lifecycle variants.

This is driver/selector-inconclusive evidence, not a product finding: one
unconfirmed idempotent tab interaction is not a reproducible rendered failure.
Browser profiles, registries, full reports, and screenshots remain outside the
evidence directory. The diagnostic screenshot was not retained; SHA-256:
`48e780978400f936fa38dd637179503cd03d5fd9c274f6aeeb6341b0731a0c54`.

# PC-18 independent host verification — candidate `1077df75047471f863e7b11cc35df9583b26a63d`

2026-09-05 UTC. This evidence commit is a descendant of the stated candidate
and contains no product or test changes. Generated projects, registries,
profiles, full logs, scripts, and screenshots are excluded.

## Required impact suite

The required whole-file command ran once, sequentially, on this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 55.579 seconds. `npm run build-cli`
then completed before Studio was launched.

## Fresh public-workflow recovery transcript

Four fresh Studio profiles and registries were launched from this source
checkout exactly as `node ./dist/cli/pokie.js --no-open`. Each began at `Design
Your Game`, used `Create game`, and visibly reported a newly managed, valid
`Starter Slot` Blueprint.

The final clean journey reached Player (`Start Play` → `New Play session` →
`Spin` → terminal round), Analyst (a completed 10,000-round Simulation), and
Reviewer (the rendered Replay screen). Replay states that it is a fresh
forward session rather than a recorded-result lookup and discloses its
best-effort reproducibility limit.

It also reached Author end-to-end: Game Model → locally associated Reels
`Edit` → rendered native `Per-reel (Reel Strip Modeler)` radio → `Select reel
1` → the actual aria-labelled `Edit or generate Literal or generated` control.
The journey used its rendered `Add symbol to reel 1` action before Preview.
The resulting view visibly rendered `Literal strip`, `Sequence: A, K, Q, J`,
and `Open stop-window preview`. A stale wait predicate still saw an appended
`Check & preview` label elsewhere in the page and timed out, but the later
rendered literal-strip view proves that the Preview action succeeded; this is
not reported as a product failure.

## Publisher recovery finding

Four further clean-profile launches used the same candidate build and the
single repaired harness. The first reached the actual Build/Export main view;
the following three performed the rendered Outcome Library lifecycle without
duplicating a pending request:

1. Create the managed `Starter Slot` Blueprint, open Build/Export, and accept
   the displayed exact preflight (1,024 combinations).
2. Start `Generate exact outcome library (base)`, observe its local
   `Cancel generation` pending action, and cancel it once.
3. After the pending action disappeared, retry the unchanged visible inputs.

The retry did not publish an Outcome Library. One clean run rendered
`Generating this outcome library failed` with the local diagnostic: `Server
plan: Unavailable — This Studio source is not an independently recognized
POKIE artifact and cannot be used for conversion planning.` Another rendered
the recovery error: `The project, configuration, destination, or bound
preflight changed before publication. Refresh the preflight, review the
destination, then generate again.` These are product-local error states, not
driver waits. Therefore the requested cancellation → fresh-preflight →
unchanged-input retry lifecycle cannot reach terminal Outcome Library
publication from a clean Studio project.

The dependent `Stake Engine export` remained independently reachable. Its
rendered result said `Built to .../stakeAdapter`, displayed the executed
`materialize → generateOutcomeLibrary → publish` plan, recorded managed
provenance (`starter-slot@0.1.0`, configuration SHA-256, exact, `managed-v1`),
and reported 1,024 published items. This does not repair the failed direct
Outcome Library recovery path.

The retained impact suite is still the 11-suite/59-test green whole-file run
recorded above. The role, replay-provenance, and literal-preview observations
above remain valid; the publisher failure means the full six-role and
lifecycle checklist is not accepted. A representative rendered-error capture
was retained only in the controller-owned harness; SHA-256:
`26daf6e904fb851bb061a6edf965a14b2397b62dbe3da0d831f5a79103dabb10`.
No generated projects, outputs, browser profiles, scripts, logs, or images
are committed here.

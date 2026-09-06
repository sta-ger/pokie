# PC-18 independent host verification — finding

Candidate product SHA: `58ca0d02717e2c16b2be5d869f021f9c34453d99`.
Evidence commit: `2c426c852069f9a431273e8d7269a05b621e1322` (evidence-only
descendant of that product SHA). 2026-09-06 UTC.

## Whole-file impact suite

Ran once as one complete-file invocation:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: 11 suites / 59 tests passed.

## Fresh rendered Studio result

Four newly isolated Studio/browser-profile launches used exactly
`node ./dist/cli/pokie.js --no-open`. Each independently completed Recommended
starter creation, a real Play round, a submitted one-round Simulation (local
pending `queued — 0/1 rounds`, followed by its RTP/Hit-frequency/Max-win
summary and `1/1 rounds` record), and Replay before Build/Export.

On the public `Generate exact outcome library (base)` control, each applicable
run rendered this local error after the control accepted the request:

```text
Generating this outcome library failed.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

This blocks the reviewer-required Studio-created Blueprint Outcome Library
generation and therefore its Stake handoff, lifecycle variants, and cleanup.
It is a product finding, not a readiness threshold: the error is visibly
rendered after a clean Studio-created project. No retry was made for the same
non-idempotent generation request. A final fresh run did click the separate,
locally scoped `Outcome library` Build action, but its card showed no terminal
state before the bounded wait; that selector/readiness result is not a second
product finding.

Bounded rendered-body SHA-256s (runtime/profile data deliberately excluded):

```text
simulation pending: f5095002f1d16757fb972e6e558306f1bd3203614ebfa6dd0b22e66934472ca0
first reproduced generation failure: 7469ff129d94c778ab9449afd21b6d1166aefc05e6037cea9273c41342795502
latest reproduced generation failure: d41d1b950e768573555d7c6706221b88d9f540692b7f155ca23a834a53f555f6
```

No generated project/output tree, Studio registry, browser profile, harness,
raw log, screenshot, PID file, or automation source is retained in this
evidence directory.

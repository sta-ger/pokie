# PC-18 host-side verification — candidate `fb041804833d0721f5d13a8f7e3633d8c79d047c`

Date: 2026-09-05 UTC. This replaces superseded candidate evidence; it retains
only bounded current-candidate proof.

## Machine verification

`npm run test:targeted --` ran the complete required file set in one serial
Jest invocation on the candidate: `PC18RoleMissions.integration.test.ts`,
`PC18LifecycleParity.integration.test.ts`,
`PC18ProductAcceptance.browser.test.tsx`,
`ArtifactInteroperabilityTorture.integration.test.ts`,
`PC17CliStudioParity.integration.test.ts`,
`StudioArtifactInteroperabilityTorture.integration.test.ts`,
`PC16StudioContextLifecycle.browser.test.tsx`,
`PC16StudioProductSweep.browser.test.tsx`,
`PC17ProductSemanticAudit.browser.test.tsx`,
`ArtifactConversionPlanner.test.ts`, and `ManagedOutcomeProjectService.test.ts`.

Result: **11 suites passed; 59 tests passed; 0 failures**. Candidate `npm run
build` also completed before any Studio attempt.

## Public Studio readiness attempt

Two permitted fresh-profile launches used exactly:

```text
node ./dist/cli/pokie.js --no-open --port 0
```

Both listeners started on loopback and Chromium visibly rendered `Opening
Studio…`. The second run was after repairing the first harness navigation
error in place. Neither displayed a Studio product error, semantic success,
nor an actionable Home control before the bounded readiness wait elapsed.
No action was emitted against an operation, no generated project or output was
retained, and no third launch was started.

This is a browser/readiness limitation, not product-failure evidence. As a
result, the fresh managed Blueprint, Outcome Library, Stake, role-mission, and
lifecycle UI criteria were not reached and are not inferred from the passing
machine suite.

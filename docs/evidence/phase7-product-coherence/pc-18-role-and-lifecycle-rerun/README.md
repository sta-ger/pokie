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

The retained candidate-bound run reports **11 suites passed; 59 tests passed;
0 failures**. This recovery invocation also issued the same one-process
complete-file command; its runner processes terminated, but the host executor
did not return the trailing Jest summary for independent retention. Candidate
`npm run build` completed before the recovery Studio attempts.

## Public Studio recovery attempts

Two fresh-profile launches used exactly:

```text
node ./dist/cli/pokie.js --no-open --port 0
```

The first recovery harness repaired the former navigation race and waited for a
semantic Home action, but still looked for the obsolete `Create Project` label.
The second, fresh run added bounded console/network diagnostics and showed no
Studio error, exception, or failed request. Its rendered Home screen reached
`#/home/design`, showed valid Game basics, Layout, Symbols, Reels, Paytable,
and Bets, and exposed the real action `Create game` (alongside `Start a game`
and `Projects`). It did not expose `Create Project`.

The second rendered observation proves Studio did become ready, so the earlier
wait threshold is not a product finding. The two-launch budget was exhausted
before the repaired selector could be driven through `Create game`, managed
Blueprint, Outcome Library, Stake, and lifecycle variants. No non-idempotent
operation was emitted, no project/output tree was retained, and no third launch
was started. This is a selector-limited inconclusive result, not product-failure
evidence; the public role and lifecycle criteria are therefore not inferred from
the machine suite.

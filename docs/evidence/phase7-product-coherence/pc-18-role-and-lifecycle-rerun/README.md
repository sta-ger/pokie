# PC-18 independent host verification — finding

Candidate product SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.
The checkout is a documentation-only descendant of that product tree; this
commit changes this README only.

## Complete-file verification

One sequential complete-file command passed on that candidate product tree:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts

Test Suites: 11 passed, 11 total
Tests:       59 passed, 59 total
```

## Rendered public workflow

After rebuilding the candidate CLI, a fresh Studio launch used exactly
`node ./dist/cli/pokie.js --no-open`, a new XDG registry, and a new Chromium
profile. Visible Studio created Recommended `Starter Slot`, closed and reopened
the only registered project, completed one Play spin (`You won 4.00`), completed
a 10,000-round Simulation (RTP `105.92%`), and loaded that spin in Replay as a
`Full` and `Exportable` recorded round artifact.

The local Outcome Library action was correlated as follows:

- Ready state: preflight rendered `Exact enumeration: 1024 raw combinations;
  expected work 1024` and enabled `Generate exact outcome library (base)`.
- Accepted state: the just-activated action immediately rendered its
  server-classified generation response; no pending job state was rendered.
- Terminal state: the same generator card rendered the error below. No later
  rendered success was present, so Generate, Outcome Build, and Stake Build were
  not repeated.

```text
Generating this outcome library failed. Check the settings above and try again.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

The fresh project directory nevertheless contained the just-written
`outcomelibrary/outcomes_base.jsonl`, `manifest.json`, and `index_base.json`;
all runtime, registry, profile, project, output, and temporary-log paths were
then removed. Thus a Studio-created Blueprint has a ready visible route but
reports its primary Outcome Library operation as failed after producing local
output. Stake's route requires that generated library, so cancellation/retry,
source-drift, late-destination, stale/cross-project, and cleanup variants past
this prerequisite were not safely reachable in the public UI.

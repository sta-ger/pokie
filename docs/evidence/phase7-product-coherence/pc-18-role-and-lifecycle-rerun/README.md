# PC-18 independent host verification — finding

Candidate product SHA: `0bee2c1d89220785698608d19dad2c10d65e39cb`.
This evidence commit changes this README only.

## Complete-file command

The required eleven-file `npm run test:targeted -- <all files>` command was
started once against an exact detached candidate worktree after its dependencies
were made available. Its retained terminal stream did not contain a final Jest
summary, so this document makes no pass claim for that run.

## Rendered public workflow

A fresh built candidate Studio was started with exactly
`node ./dist/cli/pokie.js --no-open` and driven in visible Chromium. The
Recommended game was created and opened; a Play round settled, the 10,000-round
Simulation reached its terminal report, and Replay reached a full, inspectable,
exportable recreated-round artifact.

In Build/Export, Outcome Library preflight rendered `Exact enumeration: 1024
raw combinations; expected work 1024`. The user action `Generate exact outcome
library (base)` then rendered this terminal error:

```text
Generating this outcome library failed. Check the settings above and try again.
Server plan: Unavailable — This Studio source is not an independently
recognized POKIE artifact and cannot be used for conversion planning.
```

Stake Engine export remained blocked behind that same generated Outcome Library
prerequisite. Thus the Studio-created Outcome Library, Stake handoff,
cancellation/retry, stale/cross-project, and cleanup variants cannot pass this
candidate's prerequisite boundary. No generated profiles, projects, outputs,
raw logs, or screenshots are retained.

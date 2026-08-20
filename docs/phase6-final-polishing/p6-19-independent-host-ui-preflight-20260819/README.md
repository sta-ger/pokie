# P6-19 independent host UI preflight — finding

Candidate: `e8c5871ebf439b2fcb894016a6cd72debeae56d5`  
Runtime: Node `v22.23.2` (candidate requirement: `^20.19.0 || >=22.12.0`)  
Date: 2026-08-19 (Europe/Warsaw)

This was the first, fresh-profile public Studio readiness preflight. The default
Design Game screen describes its starting model as the recommended playable
model. Without reading product documentation or source, the host clicked
**Create Project**, observed a successful save of `starter-slot-6`, opened the
visible **Projects** view, and selected that newest project’s **Open** action.

The rendered Studio UI then displayed: “The blueprint file could not be
completed. Try again. If it continues, choose the location again and retry.”
This is a reproducible product symptom, not an automation-only failure. It
blocked the required reopened-workspace checks: Play round, one-round
Simulation, Replay, outcome generation, Stake export, artwork, and
reels/stacks. No material cold-start question arose before the blocker, so none
required remediation; the second uncoached exploration launch was not run
because readiness did not pass.

Evidence:

- `01-recommended-project-saved.png` — visible save confirmation.
- `02-reopen-failure.png` — visible failure after reopening through Projects.


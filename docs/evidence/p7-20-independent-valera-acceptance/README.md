# P7-20 independent Valera public CLI acceptance

Candidate: `eb97b3769732e023ea1fbe3bfbede61e9a4a2729`.

Verified from the candidate build on 2026-08-26 with public CLI help and
documented commands. `create --random` (seed `20260826`) produced a valid
Blueprint; dry-run and real TypeScript-package builds succeeded. The resulting
package completed `inspect`, `validate`, seeded `sim`, `report`, `diff`, and
package `replay`. Its bounded Outcome Library passed deep validation and then
completed `sample`, outcome replay/simulation/report/diff, Stake export and
generic import. Direct PAR export/import, reel preview, certification
build/verify, and the full fairness seed-commit/commit/reveal/verify flow also
succeeded. Help was exercised for every public top-level command and its
documented nested commands.

Studio was started from this checkout with `node ./dist/cli/pokie.js --no-open`
using a fresh profile. In the rendered UI, the Recommended model was created,
saved, closed and reopened. One Play round settled, a one-round Simulation
completed, and a Replay completed with an inspectable round artifact. Exact
Outcome generation completed (1,024 outcomes, 100.78% RTP), followed by a
successful Stake Engine export (four files). No rendered product error was
observed in these flows.

`init --no-prepare` was also checked as its documented scaffold-only mode; its
subsequent validation correctly reported an unloaded entry because dependencies
and build output are intentionally deferred by that flag. It is not recorded
as a product finding.

# P7-05 independent host rerun — incomplete browser portion

Candidate: `c1b3436654695d1bc12eb37e6fc9574f3f216f4e`.

The required single serial command named all fourteen persisted test files. All
14 suites passed (1,453 tests). Jest printed its normal open-handle warning and
then remained CPU-bound after the passing summary; the already-complete runner
was terminated before the candidate build or Studio were started.

From one fresh temporary root, the public candidate CLI built and structurally
read back every supported matrix cell with an explicit destination:

| Cell | Readback kind |
| --- | --- |
| blueprint → tsPackage | POKIE game package |
| blueprint → outcomeLibrary | Outcome Library |
| blueprint → stakeAdapter | Stake Engine export |
| tsPackage → outcomeLibrary | Outcome Library |
| tsPackage → stakeAdapter | Stake Engine export |
| outcomeLibrary → outcomeLibrary | Outcome Library |
| outcomeLibrary → stakeAdapter | Stake Engine export |
| stakeAdapter → stakeAdapter | Stake Engine export |
| parWorkbook → parWorkbook | PAR workbook |

Each cell also completed a default-destination `--dry-run`; every printed
default destination was absent afterwards. The temporary tsPackage first
reported its documented missing dependency. Its normal registry preparation
could not fetch `pokie@^1.3.0` because that version is not published; a
temporary no-save install of this exact candidate checkout then prepared that
package and both tsPackage-source cells completed.

Studio was launched once from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`. A fresh browser rendered the public Design
Game screen, loaded the temporary Blueprint by its visible `Load from path`
input (including the rendered resolved path and `Valid — no issues found`), and
created a managed Starter Slot Workspace showing the visible `Build/Export`
tab. The browser driver could not subsequently reach the Build/Export cards:
its restored route remained at a partial Workspace shell and a later fresh
session did not render the home workflow, with no rendered Studio error. No
Studio artifact build, conflict/unsafe-destination action, or cancellation was
therefore claimed by this rerun.

Harness-recovery update (2026-08-25): the candidate was rebuilt successfully.
A fresh Studio was then launched from this source checkout with exactly
`node ./dist/cli/pokie.js --no-open`; a fresh Chromium profile rendered Design
Game, accepted the visible `Create Project` action, rendered the Workspace and
its `Build/Export` tab, and showed artifact cards including `TypeScript Game
Package` and `Stake Engine export`. The harness's card-scoping selector failed
before it could issue a Build request. No product error was rendered and no
build request was accepted, so this is selector-inconclusive rather than a
product finding. The four-launch allocation for this invocation was exhausted
by the preceding driver-recovery probes and this one full workflow run.

Focused continuation update (2026-08-25): the retained test result and CLI
matrix observations were checked in place and not rerun. The candidate was
rebuilt once. Four fresh-profile Studio launches then used only
`node ./dist/cli/pokie.js --no-open`. The repaired rendered path reached the
actual **Show advanced options (JSON mode, load/save by path)** control,
entered a newly-created temporary Blueprint through its visible **Load from
path** field, clicked **Load**, and observed **Valid — no issues found.**
Loading an existing Blueprint truthfully changes the next visible primary
action from `Create Project` to `Save Project`; the last bounded launch
identified that local control before reaching Workspace. No Studio artifact
request or rendered product error appeared. This is a selector/readiness gap,
not a product failure; no further launch is permitted in this invocation.

Only this concise account, the structured summary, and the bounded recovery
transcript are retained; temporary projects, browser profiles, logs, generated
artifacts, and the uncommitted browser harness are outside the repository
evidence payload.

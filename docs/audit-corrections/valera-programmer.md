# P9-06: bounded Valera Programmer CLI correction

## Evidence boundary and candidate

This is the implementer's correction and supplementary executable transcript, **not independent cold
exploration acceptance**. No P9-06 collector finding or receipt was supplied in this clone. Independent
installation/browser exploration, frozen observations and affected independent retests remain
controller/verifier work under the bounded implementer policy. Do not send this ledger or the scenario
test to the collector; supply only the [ordinary task charter](valera-programmer-charter.md), candidate
metadata, public README/docs/help and the ordinary existing project. No completed prerequisite evidence
was changed.

The initial executable observation used revision `6b953aec22ded21609634b952e53d7edb080e67a`, staged
candidate SHA-256 `59c9927d622c77c128781570fa3fb29b995e848d5bd4a7ee5829f9db9f5f5783`, Node `v24.18.0`,
npm `11.16.0`. `compileP906Candidate` compiles ESM/CJS/CLI and the real Vite Studio assets; preparation
copies these outputs, public docs and the resolved production dependency closure to a fresh
`node_modules/pokie`, and links `node_modules/.bin/pokie`. The supplied ordinary `Existing Project`
resolves `pokie` to that candidate's CJS entry in ordinary Node, outside Jest's source mapping. This
local copy is reproducible test preparation, not an npm archive/install verification claim.
The worker resolver is explicitly copied into all three consumed compiler outputs (`dist/esm`,
`dist/cjs`, and CLI's `dist/src`), with candidate byte-readback assertions. Standalone preparation
therefore supplies the CLI-local copy instead of borrowing it from another test's prior compilation.
Preparation shares P805/canonical CLI's compiler lock. The standalone producer/readback regression
passed in 85.25 seconds after this correction.

The launcher was below the owned `node_modules/.cache/pokie-tmp/pokie-p906-*/node_modules/.bin/pokie`.
All commands ran from its fresh `workspace`, except the explicitly noted project launches. Child-only
HOME, XDG config/cache/Documents and TMPDIR isolated registry and materialization state. A sandbox
`xdg-open` exited normally; the test fetched the printed Studio URL and real hashed JavaScript asset
over HTTP. Browser interaction remains independently verifiable. No global executable, registry version,
existing user state or repeated npm installation was used.

The scenario writes its current supplementary stdout/stderr/status/timing and candidate identity to
`node_modules/.cache/p906-scenario.json`. It is disposable current-step test output, not an independent
receipt; the concise original observations below are retained when the test reruns.

## Severity / reproduction / closure ledger

| ID | Origin and severity | Frozen reproduction / question | Correction and closure |
| --- | --- | --- | --- |
| P906-H1 | Implementer executable observation; material P2 discoverability candidate, independent severity unassigned | `pokie sim --help` (exit 0, 1739 ms) says “Run a simulation against a POKIE game package” and its positional lists package/outcome-library only. `pokie replay --help` (exit 0, 1761 ms) describes outcome-library/package replay and omits WASM. Question: does this supported artifact work with sim/replay, and which seeds/rounds compare? | Both real command descriptions/positionals now include canonical WASM and Blueprint; root help inherits these descriptions. Per-command help names the real WASM seed defaults, explicit-seed comparison, cumulative replay totals and unsupported options. Usage diagnostics include WASM examples. README and CLI docs agree with existing capability-derived inspect actions and build help. Owner help tests, root usage test and P906 real-bin help assertions cover closure. |
| P906-T1 | Explicit harness obligation; source-grounded, not an independent product finding | The shared compiler helper bounded lock waiting but not compiler execution. A Jest timeout cannot stop synchronous compilation. | Finite subprocess deadline; timeout/nonzero exit fails without retry and releases the lock. On this Linux task host the compiler process group, including owned children, is killed on failure. Focused real-child tests cover failure, timeout, no late child output, lock release and subsequent recovery. |

No independent P0/P1/material P2 closure is claimed without controller findings. The observed product
gap above is corrected; a source concern or a green supplementary test is not an independent receipt.
Replay `--out`'s existing JSON-plus-destination stdout is documented, not silently changed. Broader
P9-05 mechanics and platform boundaries remain as recorded in the [status register](README.md).

The shared helper's callers were traced: fixture runtime setup, real runtime reload, Init workflow,
PC18 role missions, P805, canonical CLI, GamePackagePreparer, Blueprint materialization (including
offline), StudioServer and Studio artifact integration. Their command vectors, locks, force/reuse
policy and output requirements remain in their existing owners. Newly created required outputs are
removed on compiler failure; pre-existing output is preserved. The helper's default subprocess limit
is two minutes; P906 additionally bounds each individual compiler/build command.
Process-group cleanup requires a positive owned child PID: a spawn failure's PID 0 must never target
the caller's group. The missing-compiler regression retains ENOENT, releases the lock and permits a
subsequent successful build.

## Supplementary original command transcript

Paths below are relative to the fresh workspace; arguments containing spaces were single, correctly
quoted argv values. Successes had empty stderr. These are real executable observations, not mocks.

| Commands / context | Observable terminal result | Exit / elapsed |
| --- | --- | --- |
| `pokie --help`; `create --help`; `build --help` | Public Home/project entry points and create/build options; no top-level export/private Studio verb | 0 / 1677, 1827, 1829 ms |
| Bare `pokie`, cwd `Existing Project` | Printed `http://127.0.0.1:3200`; app and hashed JS served; Home context, empty initial registry/recent list; Home open loaded supplied project and registered it | SIGINT shutdown 0 / 2083 ms |
| `pokie . --no-open --port 0`, cwd `Existing Project`; `pokie "Existing Project" --no-open --port 0`, cwd workspace; option-only `pokie --no-open --port 0`, cwd project | Three real printed URLs served Studio and loaded the correct project; registration survived restart | SIGINT shutdown 0 / 2020, 1995, 1974 ms |
| `pokie create "Tiny Game" --random --seed 906 --out "Tiny Game.json"`; `pokie validate "Tiny Game.json"` | Created deterministic supported Blueprint; valid yes | 0 / 1739, 1775 ms |
| `pokie build "Tiny Game.json" --target parWorkbook --out "Tiny Game.xlsx" --dry-run`; same without dry-run; `pokie inspect "Tiny Game.xlsx"` | Preview named output without publication; published/readable PAR workbook | 0 / 1868, 1809, 1761 ms |
| `pokie build "Tiny Game.xlsx" --target blueprint --out "Imported Game.json"`; `pokie validate "Imported Game.json"`; `pokie par export --help` | Imported Blueprint readback retains reels/paytable and validates; nested PAR export remains public | 0 / 1798, 1740, 1780 ms |
| `pokie build "Tiny Game.json" --target wasm --out "Tiny Game.wasm"`; `pokie "Tiny Game.wasm"`; `pokie validate "Tiny Game.wasm"` | WASM and integrity sidecar created; positional inspects canonical component with run/sim/replay next actions; valid yes | 0 / 1783, 1788, 1756 ms |
| Twice `pokie run "Tiny Game.wasm" --seed p906-valera` | Both print `POKIE WASM round 1: draw=0.834266951540485 seed=p906-valera` | 0 / 1797, 1748 ms |
| `pokie sim "Tiny Game.wasm" --rounds 6 --workers 1 --seed p906-valera --format json`; twice `pokie replay "Tiny Game.wasm" --round 6 --seed p906-valera` | Simulation and replay both totalBet 6, totalWin 7. Replays equal excluding timestamp/duration: sequence 6, drawCount 35, credits 1001, rngState 1636970151 | 0 / 1838, 1779, 1768 ms |
| `pokie build "Tiny Game.json" --targte wasm --out "Failed Game.wasm"`; corrected `--target`; validate result | Failure: empty stdout, stderr `Unknown option "--targte". Usage: pokie build ...`; no artifact/sidecar. Correction publishes and validates | 1, 0, 0 / 1788, 1789, 1790 ms |
| Build again to occupied `"Tiny Game.wasm"`; sim with `--workers 2 --out disabled-report.json` | Failures have empty stdout; occupied artifact/sidecar unchanged; worker diagnostic says `--workers 1`; no disabled report or staging | 1, 1 / recorded per-command timings in test output |

## Focused verification and controller handoff

`tests/cli/P906ValeraProgrammer.integration.test.ts` executes the complete serial scenario against one
copied candidate, including real Studio Home/project startup, canonical PAR round trip, explicit-seed
sim/replay comparison, actual CLI statuses and protected output. It supplements independent discovery.
Each finite CLI command has a 15-second deadline; each supervised Studio session has a 15-second
deadline and awaits shutdown, failing after timeout rather than restarting. Candidate preparation is
bounded to 120 seconds, with individual compiler/build subprocesses bounded to 60 seconds.

Required verification is the named preflight test set, including P805/WASM/canonical/routing/Studio,
plus the new help/compiler regressions, and root `npm run typecheck` (which includes Studio typechecking).
No full/coverage/packaging/release gate is run by this implementation. The controller must retain the
installed-candidate identity and independent observations before assigning and closing independent
findings; subsequent retests use that corrected candidate and original small deterministic inputs.

The first corrected focused run passed all five suites / 101 tests (99.265 seconds): P906, SimCommand,
ReplayCommand, usageText and ensureCompiledTestOutput. Corrected candidate SHA-256 was
`8e41a974f1aa19fcd75e6f63ebc592ca5f2961d9507994c2675d6b4e9dbbc334`; sim/replay help both exited 0
(1812/1793 ms) and printed WASM defaults and matching-seed/round guidance. The fresh serial CLI commands
took 55.752 seconds; draws and cumulative totals remained unchanged. The saved baseline failures above
remain visible; the current cache transcript is refreshed on the committed-tree regression run.
Root `npm run typecheck` passed, including its Studio client compiler. Node's actual synchronous
process-group support was checked against the installed Node implementation after correcting the
TypeScript options declaration mismatch; no runtime fallback or timeout bypass was introduced.

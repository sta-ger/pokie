# P9-02: compact WASM continuation

Measured implementation revision: `0784f33e32338400926f4c114dbaeabd13eb6fd0` (on base
`ce408362`, after P9-01). Node `v24.18.0`, 2026-10-08, task clone. The two-reel
production-compatible canonical fixture is `portable-fixture`, SHA-256
`ced06d52f4f2d54e798e22b31834fea226a58c537bab5f117333f19ca213131b`.
Seed `compact-measurement`, bet 1, starting credits 1,000,000. Counts are paid
rounds; they exclude the two unpaid initialization draws and a separate
100-round warmup for each surface. Two repetitions start fresh streams.

Reproduce these focused measurements (no build/browser/packaging campaign):

```sh
npm run test:targeted -- tests/project/wasm/WasmRuntimeCompactState.test.ts
```

The timer starts after instantiation/session initialization; it includes the
awaited play loop, scalar payout aggregation, and three checkpoint snapshots
and their assertions/logging. Snapshots are sampled only at 0, 10,000 and
100,000; ordinary round results are discarded. Three direct snapshots are
retained for Worker parity comparison. Worker timing is **in-process protocol
execution**, not real Worker transport. UTF-8 bytes use `Buffer.byteLength`.
Elapsed times/throughput are observations, never pass thresholds or a portable
speedup claim. No GC-sensitive heap delta is used as allocation proof.

## Baseline and measurements

The immutable reviewer brief attributes finding D to 20,000 draws and
approximately 385,580 bytes at 10,000 rounds, before unpaid initialization was
added. That historical number is attributed, not claimed as an exact repeat
with an unspecified historical seed/ledger. Before changing this clone's
P9-01 HEAD, the same two-reel fixture/seed/bet/bankroll was actually played
10,000 times with the old runtime: **20,002 draws, 385,540 UTF-8 bytes,
1,014.836 ms**, no warmup, timer including final serialization. This is a
separate measured P9-01 baseline. Inspection confirmed
`draws: [...state.draws, ...currentDraws]`, plus a Worker continuation embedding
`JSON.stringify(draws)` and verifying the consumed seeded prefix per play.
Those baseline timings have different timing boundaries from the candidate.

| Surface | Repetition | Completed rounds | Serialized bytes | Elapsed ms | Rounds/s |
|---|---:|---:|---:|---:|---:|
| direct | 1 | 0 | 130 | 0.073 | — |
| direct | 1 | 10,000 | 137 | 160.776 | 62198 |
| direct | 1 | 100,000 | 139 | 1323.491 | 75558 |
| worker | 1 | 0 | 130 | 0.047 | — |
| worker | 1 | 10,000 | 137 | 192.872 | 51848 |
| worker | 1 | 100,000 | 139 | 1725.982 | 57938 |
| direct | 2 | 0 | 130 | 0.016 | — |
| direct | 2 | 10,000 | 137 | 129.393 | 77284 |
| direct | 2 | 100,000 | 139 | 1223.837 | 81710 |
| worker | 2 | 0 | 130 | 0.055 | — |
| worker | 2 | 10,000 | 137 | 171.874 | 58182 |
| worker | 2 | 100,000 | 139 | 1715.789 | 58282 |

Both streams paid 7,425 at 10,000 rounds and 75,019 at 100,000, with identical
checkpoint credits/RNG/continuation. The compact JSON schema has six fixed
fields: `schemaVersion: pokie.state.v2`, `seed`, `drawCount`, `sequence`,
`credits`, `rngState`. Scalar digit widths explain 130 → 137 → 139 bytes.
Legacy v1 complete history is validated on import and intentionally omitted
from v2; its RNG position and ledger remain authoritative. Existing canonical
artifact identifiers/bytes remain v1. See the
[public contract](../wasm-compatibility-boundary.md#portable-continuation-and-explicit-evidence-runtime-api-12).

Deterministic harness gates, for this fixed fixture/seed/bankroll:

- Exactly those six snapshot fields; <=192 bytes for seeded direct/default
  Worker state at all three checkpoints, <=384 for explicit-tape state.
- After 100,000 paid rounds: exactly 200,002 generated draws and 100,000 host
  restorations. Default Worker retains zero tape draws, with zero tape draw
  verifications and zero legacy-prefix verifications.
- Host payload byte counters <=`11 * 100001` (numeric seeded continuation);
  three sampled snapshots <=`3 * 192`. Counters record bytes of host snapshot
  clone/serialization and public snapshot serialization respectively, not
  total heap allocation. Restore clones the same bounded continuation; no
  prior-round buffer is carried forward. Together with fixed schema/retention
  and the tape verification counters, these expose the former growing-copy
  and prefix-rescan paths without machine-dependent time limits.
- Collector capacity 8 retains exactly 8 events / 16 draw values after 100,000
  rounds, drops 99,993 newest events, and leaves continuation/RNG unchanged.
  Default sessions install no collector. Disposal clears owned trace buffers;
  completed replay evidence remains explicitly caller-owned and bounded.

Collector opt-in was measured separately against an interleaved ordinary
session: 100,000 rounds **per session**, capacity 8, 139 continuation
bytes, 6581.436 ms, 30389 combined rounds/s. That
measurement includes a per-round parity assertion and has no warmup; it is
not a single-session performance comparison.

Explicit tape input was separately measured at 10,000 rounds: 321 bytes
of continuation, 20,002 owned input draws / 385,412 bytes of input JSON,
267.321 ms (setup/fingerprinting excluded). It retains that input once;
it does not make tape storage independent of supplied length. Diagnostics:
20,002 generated/verified draws, 10,000 restorations, **0 prefix rescans**,
1,932,057 cumulative host payload bytes (gate <=`256 * 10001`), one 321-byte
snapshot. Legacy numeric and tape-object imports may scan/validate history
once per import. v2 restore checks the fingerprint/cursor and seeded RNG
position in constant work using the mulberry32 state increment. Ordinary
seed-only Worker continuation owns no tape.

Caller-owned external trace copies/storage and explicit requested replay
round arrays are separate evidence/output budgets. CLI replay holds its
requested command/result batch. Studio replay hands off compact states
between bounded chunks; terminal descriptors contain only two compact
snapshots. Custom host `serializeState` can return arbitrary JSON and must
itself obey boundedness; nextRandom-only hosts still work live and report
clear restoration errors.

## Regression closure and compiler boundaries

| Requirement | Focused evidence |
|---|---|
| Compact default/direct/Worker, no accumulated prefix work | `WasmRuntimeCompactState.test.ts`: two 10k/100k repetitions, fixed schema/byte counters, explicit tape accounting and collector parity |
| Initialization/later snapshots, repeated/empty replay, before-final/state-after continuation, sibling isolation, RNG zero | `WasmRuntimeApi.test.ts` and `WasmRuntimeWorker.test.ts`: fresh/advanced hosts and owned continuation; nested snapshot detachment |
| Actual pre-P9-01 state, P9-01 initial/later state, seed-only empty descriptors, malformed/missing/unsupported state, Worker numeric/tape migration/exhaustion/mismatched draws | Named API, trace and Worker regressions; recoverable failures preserve settled state |
| Explicit evidence ordering, later attachment, overflow, completion/error/cancellation/disposal/replacement/traps | `WasmRuntimeTrace.test.ts` and Worker tests; concrete collector has no sink callbacks or asynchronous work queue |
| Unchanged string-seed Node outcomes, non-power-of-two strips, wild/scatter/all-wild rejection | `WasmRuntimeParity.golden.test.ts`: unchanged independent Node golden values; historical draw comparisons use bounded explicit trace |
| Real CLI simulation and JSON/--out replay; replay-only operation | `SimCommand.test.ts` (10k aggregate-only report), `ReplayCommand.test.ts`, `WasmWorkflow.integration.test.ts` |
| Real Studio Play/Replay transport, 10k aggregate simulation and chunked replay, compact downloads/durable job details | `WasmStudioWorkflow.integration.test.ts`: real HTTP paths, compact before/after snapshots, reloaded `FileStudioJobRepository` descriptor <=5k bytes |
| Queued/running cancellation, runtime/disposal failure, no active job/successful output, clean subsequent job | Studio integration plus existing simulation/replay service lifecycle suites; real compact runtime wrapped only to inject failure; cleanup failures remain observable |
| Public root/browser/wasm collector/type exports and dashboard advanced inspection | `tests/browser/WasmRuntimeApi.test.ts`, real HTTP dashboard WASM workflow component test |

All 13 scope-preflight test files passed together (274 tests) before the
implementation commit. `npm run typecheck` passed; it covers source/CLI and
invokes the separate Studio client compiler itself. The clone's changed-file
ESLint pre-commit hook passed for the TypeScript commit. Root ESM/CJS and
portable browser declarations share the existing source export barrels; no
new file/export mapping or integrity-bound artifact rewrite was needed.
Production builds, genuine Chromium/Worker reruns, packaging and official
gates remain controller verification under the bounded implementation policy.
Existing browser/benchmark source assertions now use explicit trace or RNG
position, but their broader campaigns were not run. Historical benchmark
baselines and P9-01 evidence are preserved.

Full bounded regression command:

```sh
npm run test:targeted -- tests/browser/WasmRuntimeApi.test.ts tests/cli/WasmWorkflow.integration.test.ts tests/cli/commands/ReplayCommand.test.ts tests/cli/commands/SimCommand.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.wasmWorkflow.test.tsx tests/cli/studio/WasmStudioWorkflow.integration.test.ts tests/cli/studio/replay/StudioReplayExecutionService.test.ts tests/cli/studio/simulation/StudioSimulationService.test.ts tests/project/wasm/WasmRuntimeApi.test.ts tests/project/wasm/WasmRuntimeCompactState.test.ts tests/project/wasm/WasmRuntimeParity.golden.test.ts tests/project/wasm/WasmRuntimeTrace.test.ts tests/project/wasm/WasmRuntimeWorker.test.ts
npm run typecheck
```

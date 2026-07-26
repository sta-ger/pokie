# Benchmarks

Informational performance baselines for POKIE itself (contributors, not consumers of the `pokie`
npm package). Run them with:

```sh
npm run bench
```

That runs the `pokie-benchmarks` Jest project (`benchmarks/**/*.bench.ts`) via `node --expose-gc`
(so the heap-delta numbers below are GC-settled, not noise from whatever happened to be garbage at
measurement time) and `--runInBand` (one process, no worker-pool contention skewing wall-clock).
Every file prints its own `[bench] ...` line to stdout with the numbers it measured.

## What's here

| File | Measures |
|---|---|
| `simulationThroughputAndMemory.bench.ts` | `AggregateSimulationRunner` rounds/sec and heap delta, in-process, for a representative trivial session. |
| `parallelWorkerComparison.bench.ts` | `ParallelSimulationRunner` throughput at `workers=1` vs `workers=4`, using real `worker_threads` (same compiled-worker-entry + `playable-game` fixture infrastructure as `tests/cli/commands/SimCommand.realWorkers.test.ts`). |
| `stakeEngineAnalysisAndDiff.bench.ts` | `StakeEngineStandaloneAnalyzer.analyze()` and `StakeEngineStandaloneAnalysisDiffer.diff()` timing over a 20,000-outcome synthetic mode. |
| `randomGameBlueprintGeneration.bench.ts` | `RandomGameBlueprintGenerator.generate()` average time across 500 seeds. |
| `simulationReportGeneration.bench.ts` | `SimulationReportBuilder.build()` plus `HtmlSimulationReportRenderer`/`MarkdownSimulationReportRenderer` `.render()` timing for a 100,000-round report. |

## Why these never assert a hard wall-clock/memory threshold

Every test above only asserts that the operation completed and produced finite, non-negative
numbers — never `expect(durationMs).toBeLessThan(...)`. Wall-clock time and heap usage vary with
the host machine (CPU, core count, memory pressure, whether it's a shared CI runner), so a fixed
threshold tight enough to catch a real regression is also tight enough to fail intermittently on a
slower box for no code reason — exactly the kind of flaky gate this repo's testing philosophy
avoids (see `docs/testing.md`). `parallelWorkerComparison.bench.ts` in particular can see
`workers=4` come out *slower* than `workers=1` on a machine with only one or two usable cores, since
thread-spawn overhead then outweighs any real parallelism — that's a real, expected outcome, not a
bug in the benchmark.

That's also why `pokie-benchmarks` is its own Jest project, never included in `npm test`,
`check:full`, `check:release`, or any other gate: these are baselines to read and compare by eye
(e.g. before/after a perf-sensitive change), not a pass/fail correctness check. If a genuinely
stable threshold is ever proven (e.g. from repeated measurements on the actual CI runner), it can be
added as a real assertion then — see `docs/testing.md`'s "Benchmarks" section.

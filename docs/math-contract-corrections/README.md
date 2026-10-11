# P10 math-contract corrections: candidate handoff

This campaign covers [fractional stake identity and scaling](fractional-bets.md)
and [authoritative Blueprint payouts](authoritative-paytable.md), including the
P10-02 repair for played-round free-game awards and omitted authored grant counts.
Only external audit **part 3/3** was supplied. Missing attachments were not verified.
Historical generated packages, saved sessions and outcome artifacts are not
automatically rewritten: rebuild packages and generate fresh outcome artifacts.

| Evidence boundary | Current status |
| --- | --- |
| P10-01/P10-02 implementation regressions | Recorded in the two linked documents; source-bound execution, not installed proof |
| P10-03 runner support | Focused commands below; hermetic lifecycle tests and existing source-bound regression support |
| Independent installed candidate | **Passed**: [P10-03 independent installed rerun](p10-03-independent-installed-rerun.md) authenticated and exercised one normally built, packed and isolated installation of `a9a0ead57276d8c7ebb06b7c0369b9f66000068f` |
| Official release and packaging | **Pending controller** `check:release`, which includes normal packaging smoke |
| Develop publication and Drive round-trip | **Pending controller lifecycle**; no local commit constitutes publication |

The [executable repro](../../scripts/math-contract-repro.mjs) retains complete
fixture constructors. The original shared test inputs remain at
[FractionalBetFixture.ts](../../tests/fixtures/math/FractionalBetFixture.ts) and
[AuthoritativePaytableFixture.ts](../../tests/fixtures/math/AuthoritativePaytableFixture.ts).
The executable has no source-runtime imports and does not build, pack or install
POKIE. It consumes one clean controller-produced installation serially.

Run from the candidate repository, using absolute paths:

```sh
node scripts/math-contract-repro.mjs \
  --candidate /absolute/controller-candidate.json \
  --compiler /absolute/existing-toolchain/node_modules/typescript/lib/tsc.js \
  --output /absolute/fresh-p10-independent-collection
```

The controller JSON supplies `candidateId`, `candidateTreeId`, `packageVersion`,
`archivePath`, `archiveSha256`, `installationRoot`, `buildCommand`, `packCommand`
and `installCommand`. Build/pack must describe the normal lifecycle (`npm run
build` plus `npm pack --ignore-scripts`, or `prepack:npm run build` plus `npm pack`);
installation is `npm install <archive>`. These are controller-provided provenance,
not newly produced build/gate receipts. The runner verifies the commit/tree,
archive digest, installed archive bytes, package name/version and native runtime
resolutions. The controller binds its normal build/install and gate records to
that same identity. Use an existing TypeScript toolchain with `@types/node`;
its path, version, executable digest and `--version` output are recorded.
Generated games link to this one installed POKIE; no registry fallback or
additional candidate installation is performed. The P10-03 host result is
recorded in the [independent installed rerun transcript](p10-03-independent-installed-rerun.md).

The serial collection checks:

- Literal AAA, BBB and AAABB fixtures via installed `GamePackageGenerator`,
  public generated package entries and `loadPokieGameRuntime`. CJS runs first;
  emitted TypeScript then compiles with its unmodified generated `tsconfig.json`,
  after deleting CJS output, and loads in a fresh package snapshot. Output digests
  distinguish both formats. No template evaluation, require mock or reference
  session alignment is used.
- Mixed numeric bets `[1, 0.01, 0.1, 1.5, 1e-7]`, each selected through normal
  play. Authored A/3=5 expects `5`, `0.05`, `0.5`, `7.5`, `5e-7`. Omitted B and
  omitted A/3 pay exactly zero without wins or hidden entries; explicit B/3=0
  remains present; B/3=2 pays twice the stake. Screens, sparse map keys/amounts,
  serialized win records and ordinary credits are inspected in both formats.
- A clearly identified reachable `[A,B]` variant through canonical installed
  `pokie build ... --target tsPackage` and `--target wasm`. Literal defect
  fixtures stay on the direct generator path; unreachable-symbol validation
  remains intact. Generated Node and supported line-game WASM compare initial
  RNG continuation, first and later rounds, JSON initial/later checkpoints,
  fresh-runtime restoration and replay. Payouts are independently calculated
  from the screen; RNG is never rewound to make two streams agree.
- Canonical `pokie build <generated-package> --target outcomeLibrary --exact`
  into a fresh destination, then `pokie report <bundle> --format json --out ...`.
  The generated game chooses its own default stake of 1. All eight unit-weight
  `[A,B]` outcomes and every artifact/step win record are read from the persisted
  bundle: only AAA wins, total win is 5 times stake, RTP is 5/8 and hit frequency
  is 1/8. There is no stake override or historical-bundle reuse.

Stake identities, map keys/values, screens and RNG states compare exactly.
Accumulated amounts and ratios use `32 * Number.EPSILON *
max(abs(expected), 1e-7)`; positive payouts cannot pass as zero. Credit-ledger
comparisons separately scale this budget to absolute ordinary credits, rather
than the replay recorder's MAX_SAFE_INTEGER bankroll.

`result.json` records candidate/package/compiler identity, entrypoints, commands,
exit codes, durations, expected/actual observations, completion IDs and cleanup
status. Fixture JSON, WASM/parity checkpoints, the persisted exact bundle and
public report are retained; invocation-owned scratch and loaded runtimes are
released. Assertion, compilation, loading, command, cancellation, cleanup or
incomplete-result failures produce nonzero exit and a failed result. Existing
collection directories are never overwritten. The shared installation is never
removed. An independent failure must be retained alongside at most one affected
retest; this runner has no automatic retry. The P10-03 installed result passed
without a retest; its command, timings and exact candidate/archive identities
are retained in the linked transcript. Preserve each record's original identity
if later commits differ.

Focused implementation checks (not release gates):

```sh
npm run test:targeted -- tests/scripts/math-contract-repro.test.mjs tests/generated/GamePackageGenerator.test.ts tests/project/WasmArtifactBuilder.test.ts tests/project/wasm/WasmRuntimeParity.golden.test.ts tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts tests/cli/commands/ReportCommand.test.ts
```

The initial six-suite support run passed **242 tests**, exit code 0 (16.266
seconds). After runner refinements and two additional lifecycle cases, the final
runner-only check passed **11 tests**, exit code 0 (0.350 seconds). Product source
and the five existing support suites were unchanged. The final committed-tree
bounded rerun is recorded in the worker report. These checks do not identify a
packed or independently installed candidate.

The hermetic runner test covers failures, cancellation of an actual owned child,
resource release, scratch cleanup, evidence preservation and incomplete results.
Existing generator/adapter/parity/workflow/report tests support the public APIs
used by the repro. They remain source-bound regressions. No TypeScript product
files changed in P10-03; the one normal build used to prepare the independent
installed package completed, but no official gate was launched by this worker.
Existing invalid/unavailable/unaffordable-command, atomic generation,
exact cancellation/resume/staging cleanup, serializer/repository/wallet, PAR,
Studio numeric display and P10-02 free-game regression coverage remain intact.

The controller owns one official `check:release` boundary and its normal
[packaging smoke](../../tests/packaging/npmPackSmoke.test.ts), followed by normal
integration/push to **product develop only**, exact remote SHA verification,
status publication and matching Drive round-trip. P9 candidate/persona tooling
and historical PC-20 npm publication are not alternate P10 lifecycles.

The [audit register](../audit-corrections/README.md), completed P8/P9 states and
historical evidence remain unchanged. Math Optimization, overscan, full WASM/one
calculation path, analytics, mechanics, certification, generic diff/reachability
and other recorded gaps remain outside this release scope. WASM collection is
supported line-game parity using the existing separate evaluator, as described
in the [compatibility boundary](../wasm-compatibility-boundary.md). This document
records the completed P10-03 machine-owned installed evidence, not early campaign
completion or a claim about wider roadmap coverage.

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
| P10-03 runner support | [Candidate-reader focused verification](p10-03-candidate-reader-targeted-verification.md) records the machine-owned three-file result on `6a150cd2c3efbf40d67f3625298f181a37e44bd2`; hermetic lifecycle tests and existing source-bound regression support remain retained |
| Independent installed candidate | **Passed**: the historical [P10-03 independent installed rerun](p10-03-independent-installed-rerun.md) remains for `a9a0ead57276d8c7ebb06b7c0369b9f66000068f`; the candidate-bound 2026-10-11 receipt below independently authenticates and exercises `5b1513e17e734909447b9520b879dee6b6ae42f3` |
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

## P10-03 candidate-bound installed receipt (2026-10-11)

Independent host verification started from the clean candidate
`5b1513e17e734909447b9520b879dee6b6ae42f3` (tree
`33db5e293bd3490eaa969a223b6b162be0decb4f`). One normal `npm run build`
exited 0 (101,871 ms), then one `npm pack --ignore-scripts --pack-destination
/tmp/p10-independent-GUxnDU` exited 0 (8,118 ms). The resulting `pokie@1.3.0` archive
had SHA-256 `cf2ba9914fc919badbdbe8cff46a3590b8f9e4b1e36dbf6645a31367ff9dd326`.
Exactly one isolated installation, outside the candidate checkout, used
`npm install --prefix /tmp/p10-independent-GUxnDU/installation
--ignore-scripts --no-audit --no-fund
/tmp/p10-independent-GUxnDU/pokie-1.3.0.tgz` (exit 0; 10,904 ms).

The installed-only consumer then ran (exit 0; 16,340 ms):

```sh
node scripts/math-contract-repro.mjs \
  --candidate /tmp/p10-independent-GUxnDU/candidate.json \
  --compiler "$PWD/node_modules/typescript/lib/tsc.js" \
  --output /tmp/p10-independent-GUxnDU/collection
```

It authenticated the candidate tree, archive and installed bytes before
resolving installed CJS, ESM, WASM and CLI entries. `result.json` completed all
12 required records with exit 0 and drained resources: fractional, omitted
symbol, omitted count, explicit zero and positive-control games in both CJS and
freshly recompiled generated TypeScript; Node/WASM initial/later replay; and
exact Outcome Library/report. The complete fixture constructors and assertions
are the committed `scripts/math-contract-repro.mjs`; executed fixture SHA-256s
were fractional `3420681487f83a2a3168aa3ab8b6189ae068f3dd6e5067fc746e769606d8eeaa`,
missing-symbol `20945838bc87b66e5872228def90820022c21efe41485fb10d965756869a8e7c`,
missing-count `da58af26e50a3a48c94c4260bdb9739ef464f7d11cc5eb0a98ef829d5b282bab`,
zero `4c7d402bf61624e2b8fe3395f021b21ebc20265cef2ffb8e46cb805bb751c103`,
positive `b85f01fa785fa9af414e9e3ed78dd56065c1abb3d98f9e9e1de30f504911c2dd`,
and reachable line game `0ce55b403d6108e16a3cb180aaea9d3c9bcacfbaf3137621cc195a43ebd443e5`.

For both generated formats, available bets remained numeric and actual/expected
were `0.01 × 5 = 0.05`, `1.5 × 5 = 7.5`, and `1e-7 × 5 = 5e-7`; omitted B/3
and A/3, and explicit B/3=0, paid exactly 0; authored B/3=2 paid twice stake.
Amounts used `32 * Number.EPSILON * max(abs(expected), 1e-7)` and separate
absolute-credit comparison. The one supported line-game session matched normal
Node/WASM play and initial/later serialized continuation without an RNG rewind.
The exact public CLI build/report produced eight unit-weight outcomes, only AAA
winning, total win 5 at stake 1, RTP 0.625 and hit frequency 0.125, with no
unauthored payout. Bounded retained-runtime checksums: WASM
`caec0883c51552e26b994517116210d68712252b13ee037f5ccd822912823621`, parity
checkpoint `91e1db308dbf455a4e98834d8a52b8f7af95da33ea13781b90802ac7c1db4570`,
Outcome manifest `407450c319e56e0c1fad31cdc3ea907abf288402b859a5c2440137884fc57462`,
and report `1ff00c65e3759b3e180723a78ffb53672f7e0e1870760de56d2afc2a8416f42c`.

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

# P9-03: preserve tiny standalone Stake probabilities

Implementation evidence for immutable brief `00a5f7f27606fa593124bcfa86a50496922a5f4f87ef8d69f1f020bf505db51f`,
independent finding C, on base `f06cc88952fc7f200becdacacb64ada7f153dba6` (2026-10-08).

## Exact reproduction

`StakeProbabilityTestFixtures.ts` writes a real directory without `pokie-manifest.json`.
`index.json` contains:

```json
{"modes":[{"name":"base","cost":1,"events":"books.jsonl.zst","weights":"lookup.csv"}]}
```

`lookup.csv` contains these exact rows, each followed by a newline:

```csv
0,18446744073709551615,0
1,1,200
```

The UTF-8 JSONL below, including a final newline, is compressed with Node's
`zlib.zstdCompressSync` into `books.jsonl.zst`:

```jsonl
{"id":0,"payoutMultiplier":0,"events":[]}
{"id":1,"payoutMultiplier":200,"events":[{"index":0,"type":"bonus"},{"index":1,"type":"bonus"}]}
```

IDs and payouts are safe numeric integers. The loss weight is UInt64 maximum; the win weight is 1.
The exact total is **18446744073709551616**, exceeding both UInt64 and the safe-number range.
The corresponding direct-call fixture deliberately mixes BigInt and numeric weights.

## Cause and correction

The original analyzer computed `(weight * 10^18) / totalWeight` using integer division before
conversion to Number. For the winning row this is zero. The initial whole-file analyzer run reproduced
that defect: the new positivity assertion received 0 (1 failed, 17 existing tests passed).
This was an artificial integer truncation, not unavoidable binary64 loss: binary64 represents 2^-64.

The corrected conversion forms at least 21 significant decimal digits of the exact BigInt ratio,
with scale determined by the numerator/denominator magnitudes, then converts once to Number.
It does not independently round large numerator and denominator into Number. Existing strict 0.1
and small-versus-scaled 970/25/5 equalities continue to pass.

Weights, totals, payout bucket sums, event occurrence weights, and count-weight products stay in
BigInt until their established display boundary. Individual UInt64 limits never limit aggregate sums.
The mean is anchored at the minimum payout ratio, preserving constant-payout zero variance without
cancelling a rare win when it appears first. Variance still sums weighted **centered squared deviations**;
it never subtracts raw second moments. Loss frequency is accumulated directly so rare losses survive.
Empty direct-call modes and nonfinite numeric calculations throw; a source with no modes is still empty.

## Expected and observed results

Let `p = 1 / 18446744073709551616 = 2^-64`. The real reader-to-CLI and direct-call tests assert
finiteness and strict positivity separately, followed by `abs(actual / expected - 1) <= 1e-12`.
The direct test also pins these actual binary64 values:

| Metric | Expected formula | Actual implementation result |
| --- | --- | --- |
| hitFrequency | p | 5.421010862427522e-20 |
| maxWinProbability | p | 5.421010862427522e-20 |
| rtp | 2p | 1.0842021724855044e-19 |
| variance | 4p(1-p) | 2.168404344971009e-19 |
| standardDeviation | sqrt(4p(1-p)) | 4.656612873077393e-10 |
| totalWeight | UInt64 maximum + 1 | "18446744073709551616" |
| loss bucket weight | UInt64 maximum | "18446744073709551615" |
| win bucket weight | 1 | 1 |

The displayed win probability is `"0.0000000000000000000542101086242752217003"`.
`displayFraction` caps all large-total fraction strings at **40 fractional digits**;
even 2^-64, which terminates after 64 places, is truncated at that boundary.
This is not an unlimited exact decimal. Integer bucket weights and total remain exact.
Small-total fraction numbers and numeric moments are binary64 approximations too.

Tests convert displayed probabilities to Number, reconstruct the mean and centered variance,
and compare them with the metrics using the same relative tolerance. They also compare deviation
squared with variance. A zeroWinFrequency rounded to 1 is allowed in this rare-win reproduction.
The rare-loss case independently proves a positive loss frequency. Repeated rare bonus events have
frequency p and average count 2p; dominant repeated events exercise count sums beyond UInt64.
Duplicated payout buckets preserve exact aggregate weights above UInt64. Reversed outcome order,
constant payouts, and dominant payouts with rare neighbors have dedicated regressions.

## Consumer closure ledger

| Acceptance surface | Final evidence |
| --- | --- |
| Direct analyzer, exact accounting, ordinary/repeating/scaled/mixed inputs, invalid and empty calls | Standalone analyzer and bounded property whole-file tests; deliberately rare unit weights supplement ordinary seeded distributions |
| Reader and validator boundaries | Reader whole-file tests accept weights 1/UInt64 maximum and safe maximum IDs/payouts; reject exact textual safe maximum + 1 and UInt64 maximum IDs/payouts independently in CSV and books; invalid weights and empty modes expose no modes |
| Safe payout reversal/fallback | Existing reader warning case, direct undefined-ratio fallback, and safe maximum boundary assertions retain ratio-not-representable warnings and nonInvertibleRatioCount |
| Real standalone CLI analyze | Manifest-less fixture produces positive summary metrics, parseable JSON stdout, and matching replaced --out JSON; unsafe ID/payout fixtures exit 1 with no successful analysis |
| Standalone diff | Real directory diffs retain p-sized values/deltas in summary, JSON and persisted files; tiny weight changes exit 0 without material warnings; tiny max-ratio warning values remain visible and a material change still exits 1 (invalid diffs retain their existing exit 2 tests) |
| Canonical project report and diff | OutcomeSourceProjectAnalyzer and diffOutcomeSourceProjects retain positive numbers and nonzero deltas, round-tripping through JSON |
| Outcome-source terminal/diff | Shared rendering uses exponential notation only when fixed decimals would become zero; both positive and negative deltas remain visible; changed valid outcome-source diffs retain exit 0 |
| Report Markdown/HTML/JSON | Real manifest-less report command verifies positive metrics in stdout and files, with JSON stdout matching persisted JSON |
| Studio server/context | Real HTTP route test opens a recognized Stake project and verifies context metrics/exact total; inspect and validate remain valid/diagnostic responses without analytics fields |
| Studio Overview/header interpretation | Real component/header tests preserve rare percentages, ordinary formatting, exact zero, error diagnostics and disabled Stake sampling; wire type reflects existing string totals and Stake maxRatio |
| Native in-memory ratios/features | Valid finite numeric weights 1e20 and 1 retain 1e-20 probabilities/features; no fixed-point cutoff exists in these implementations |
| Online JSONL, publication and deep validation | New online whole-file test cross-checks direct JSONL, in-memory analysis, writer manifest and deep validation at safe-integer total maximum; existing writer/validator whole-file cancellation/cleanup tests pass |
| Library/package boundaries | Existing root imports exercise reader/analyzer/differ/project APIs; no DTO widening for external IDs/payouts, export change, barrel edit, package export or schema change; root typecheck covers library/server/CLI and invokes the Studio compiler |

Project resolution keeps its existing requirement for recognized POKIE provenance. The project, outcome-source
command and Studio fixtures add the existing minimal recognition marker; standalone reader/analyze and the
report-command reproduction remain manifest-less. The marker does not cache or alter these statistics.

Native persisted bundles require safe-integer weights **and totals**, so their minimum positive probability
is approximately 1/Number.MAX_SAFE_INTEGER, rather than the standalone UInt64 reproduction's p.
The online/publication test respects that contract. In-memory native analytics accept finite positive numeric
weights. Existing native writer/deep-validator cancellation tests still close resources, remove private
staging/spool files, and preserve an existing destination. No standalone cancellation API was added.

Stake IDs and raw payoutMultiplier values remain **nonnegative safe-integer numbers** in CSV and books.
No test or correction claims complete UInt64 ID/payout support. Unsafe textual fixtures are written directly
before JSON parsing can round them; import/export/native formats and root numeric/string result types retain
their established contracts. ESM/CJS library/declaration emission, CLI compilation, and Studio browser compilation
are the consuming production boundaries. This step permits focused tests/typecheck only; packaging, production
builds, release gates and independent browser reruns remain controller work.

## Whole-file verification

The bounded command below passed all **17 suites / 379 tests**. The root `npm run typecheck` passed,
including its built-in `typecheck-studio-client`; the Studio compiler was not separately duplicated.
Changed TypeScript also passes the installed ESLint pre-commit hook. No official gate was run.

```sh
npm run test:targeted -- \
  tests/cli/commands/OutcomeSourceCommand.test.ts \
  tests/cli/commands/ReportCommand.test.ts \
  tests/cli/commands/StakeEngineCommand.analyze.test.ts \
  tests/cli/commands/StakeEngineCommand.diff.test.ts \
  tests/cli/studio-client/src/components/project/OutcomeSourceOverview.test.tsx \
  tests/cli/studio/OutcomeSourceProjectRoutes.test.ts \
  tests/project/OutcomeSourceProjectAnalyzer.test.ts \
  tests/stakeengine/standalone/StakeEngineOutcomeSourceReader.test.ts \
  tests/stakeengine/standalone/StakeEngineStandaloneAnalyzer.test.ts \
  tests/stakeengine/standalone/StakeEngineStandaloneAnalyzerPropertyInvariants.test.ts \
  tests/weightedoutcome/WeightedOutcomeLibraryAnalyzer.test.ts \
  tests/weightedoutcome/WeightedOutcomeLibraryValidator.test.ts \
  tests/weightedoutcome/buildWeightedOutcomeLibrary.test.ts \
  tests/weightedoutcome/bundle/OutcomeLibraryBundleValidator.test.ts \
  tests/weightedoutcome/bundle/OutcomeLibraryBundleWriter.test.ts \
  tests/weightedoutcome/bundle/internal/computeOnlineWeightedOutcomeLibraryAnalysis.test.ts \
  tests/weightedoutcome/computeWeightedOutcomeLibraryFeatureBreakdown.test.ts
npm run typecheck
```

# Fractional stakes: P10-01

Baseline: `57e647f6ece57089904d566adbab2cfdbaa06002`. Only audit **part 3/3**
was supplied in the campaign brief. No `independent-review.md` exists in this
clone; missing attachments were not read or reconstructed.

## Complete reproduction

The shared `tests/fixtures/math/FractionalBetFixture.ts` describes this input:

```json
{
  "manifest": {"id": "math-probe", "name": "Math probe", "version": "0.1.0"},
  "reels": 3,
  "rows": 1,
  "symbols": ["A", "B"],
  "wilds": [],
  "scatters": [],
  "paylines": [[0, 0, 0]],
  "reelStrips": [["A"], ["A"], ["A"]],
  "paytable": {"A": {"3": 5}, "B": {"3": 2}},
  "availableBets": [0.01]
}
```

Generate an actual package using `GamePackageGenerator("1.3.0")`, load its
published entrypoint, then `createSession({seed: "0"})`, `setBet(stake)`,
assert `getBet()`, `play()`, and inspect `getWinAmount()`. Seed is the **string**
`"0"`, not numeric `0`. Repeat with one configured stake per package:

| Stake | Baseline generated CJS payout, observed | Corrected expected/actual CJS and compiled TS payout |
| --- | --- | --- |
| 1 | 5 | 5 |
| 0.01 | 0 | 0.05 |
| 0.1 | 0 | 0.5 |
| 1.5 | 5 | 7.5 |
| 1e-7 | 5 | 5e-7 |

The direct core intake was also run with the original conversions restored:
`new Paytable([stake], ["A"], [], 3); setPayoutForSymbol("A", 3, 5)`.
Observed baseline `{bets:[0], payout:0}` at `0.01` and `{bets:[1], payout:5}`
at `1.5`; corrected results are `{bets:[0.01], payout:0.05}` and
`{bets:[1.5], payout:7.5}`. Baseline targeted tests failed as expected.

`getAvailableBets` and the all-bets setter now convert complete numeric keys
with `Number`. Match-count parsing stays integer-based. No payout rounding,
cents conversion, RNG change, or new direct-Paytable validation was added.
Blueprint validation now requires finite positive stakes; duplicate warnings
remain warnings. Authored Blueprint/PAR payouts remain multipliers, while
runtime paytable maps contain stake-scaled amounts.

## Runtime evidence and boundaries

The mixed variant replaces every literal strip with `["A", "B"]`, leaving
all other fields unchanged. It has eight equally weighted stop tuples: AAA
pays 5x, BBB pays 2x, and the other six pay zero. This is also the validated
WASM fixture: the original all-A intake is rejected by the existing
`blueprint-reelstrips-missing-symbol` rule because B is unreachable. The
direct generator reproduction does not substitute for Blueprint validation.

For string seed `"0"`, baseline CJS and compiled TS mixed screens after the
constructor's three draws were recorded as `BBB, BAA, AAB, BBB, BBB, AAB,
AAA, BAB`. Their RNG states are respectively `3289482349, 194245196,
1393975339, 2593705482, 3793435625, 698198472, 1897928615, 3097658758`.
Corrected entrypoints assert those exact records at every representative stake
without stream rewinds or reference alignment. Screen payouts are calculated
independently from this one-line fixture, and each round checks credit movement.

Exact enumeration uses each real generated **single-stake** package and its
`createExactEnumerationSession` through `generateExactWeightedOutcomeLibrary`.
No `options.stake` override is used to disguise runtime bet selection. Tests
assert all eight distinct screens, unit weights, total weight 8, six losses,
artifact stake, totalWin, and multiplier; weighted total win is `7 * stake`.
Existing cancellation/resume and staging-cleanup cases run in the same file.

Production WASM artifacts built from that mixed Blueprint match loaded generated
sessions for selected stake, first/subsequent screens, payout, credits, and RNG
continuation at all five stakes. JSON state after round four restores in a
fresh runtime; four subsequent rounds and replay match uninterrupted play.
Invalid, unavailable, and unaffordable commands leave serialized state unchanged.
Every acquired runtime is disposed, loaded package leases are released, and
new temporary fixtures are removed through failure-safe cleanup. Existing WASM
worker cancellation/disposal cases and integer/string-seed goldens are retained.
WASM parity here covers supported line mechanics and its hybrid stop/evaluator
implementation, not unsupported ways, clusters, or free-games mechanics.

`ReplayRecorder` executes the loaded single-stake mixed package for eight rounds
and checks its final screen and accumulated totalBet/totalWin. Its
`MAX_SAFE_INTEGER` bankroll cannot establish sub-cent credit precision.

Stake identity, keys, screens, RNG state, integer outcomes, and payouts computed
in the same operation order use exact comparisons to `multiplier * stake`.
Accumulated amounts and derived ratios use an explicit error budget:
`32 * Number.EPSILON * max(abs(expected), 1e-7)` (approximately `7.11e-22`
at the floor). Credit comparisons use the ledger scale, about `7.11e-12`
at 1000 credits. The small-stake payout/ratio and accumulation tolerances
cannot accept a zero winning payout. This is JavaScript number arithmetic,
not decimal/arbitrary-precision arithmetic or a guarantee against underflow.

Core regressions cover defaults, zero/fractional multipliers, repeated all-bets
updates, independent selected-bet updates, mixed stakes, detached maps, missing
payouts, and JSON import/export. Serializer and FileSessionRepository tests
exercise real winning fractional sessions and persisted paytable/bet/win data.
The server spin regression checks successful fractional settlement and a later
unavailable selection without live-session, wallet, or repository mutation.
Direct sessions retain their unavailable-bet fallback; Studio request validation
rejects nonfinite inputs before dispatch.

Source tracing confirms that CLI Blueprint/PAR builds use
`TsPackageArtifactBuilder` and Studio uses `GamePackageGenerator`; CJS and TS
share `renderBuiltGameModule` configuration order (bets before symbols/paytable).
Line/scatter/ways/cluster calculators consume the numeric stake through Paytable.
GameSession/VideoSlot/free-games config delegates, serializers, state capture,
and PAR/Blueprint mappings preserve numeric values. Studio BetsList and form
operations retain numbers; shared player selection uses `Number(value)`.
No separate UI payout path or config lifecycle redesign was needed.

Generated CJS is loaded via package metadata and emitted `src/index.ts` is
compiled with the TypeScript compiler's `transpileModule`, diagnostics checked,
written to a separate file and loaded independently. Jest binds generated
`require("pokie")` to candidate source. This proves generated-package execution;
it does **not** prove an installed npm archive. Installed-package verification,
packaging, release checks, and official gates belong to the controller.

## Named bounded verification

```sh
npm run test:targeted -- tests/generated/GameBlueprintValidator.test.ts tests/generated/GamePackageGenerator.test.ts tests/net/Serialization.test.ts tests/parsheet/mapping/AvailableBetsSheetMapper.test.ts tests/project/wasm/WasmRuntimeParity.golden.test.ts tests/project/wasm/WasmRuntimeWorker.test.ts tests/server/session/FileSessionRepository.test.ts tests/server/spin/SpinCommandHandler.test.ts tests/session/DefaultGameSession.test.ts tests/session/videoslot/DefaultVideoSlotSessionPaytableData.test.ts tests/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.test.ts
npm run typecheck
```

Baseline probes used the named core and generated files before the correction.
The final bounded run exited zero: **11 files, 358 tests passed**. Root
typecheck exited zero, including the Studio client. No official gate, broad suite, packaging,
workflow, or release verification is claimed here.

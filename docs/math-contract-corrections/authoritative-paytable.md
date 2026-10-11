# Authoritative Blueprint payouts: P10-02

Baseline: `aa601aec` (P10-01 integrated). This correction concerns rebuilt
Blueprint packages and the existing adapters that consume them. It does not
rewrite direct-library demo defaults or introduce another Blueprint evaluator.

## Complete reproductions

Generate each model with `new GamePackageGenerator("1.3.0").generate(model, cwd)`.
Load the resulting directory through `loadPokieGameRuntime`, which resolves
`package.json`'s `pokie.entry` / `main` / `exports` to `dist/index.js`. Call
`createSession({seed: "0"})`, `setBet(1)`, then `play()`. Inspect the selected bet,
visible matrix, paytable map, winning lines, total win and credits. Release the
runtime lease in `finally`. The seed here is a string, not numeric zero.

Missing symbol:

```json
{
  "manifest": {"id": "authored-missing-symbol", "name": "Authored missing symbol", "version": "1.0.0"},
  "reels": 3,
  "rows": 1,
  "symbols": ["A", "B"],
  "wilds": [],
  "scatters": [],
  "paylines": [[0, 0, 0]],
  "availableBets": [1],
  "reelStrips": [["B"], ["B"], ["B"]],
  "paytable": {"A": {"3": 5}}
}
```

Missing count:

```json
{
  "manifest": {"id": "authored-missing-count", "name": "Authored missing count", "version": "1.0.0"},
  "reels": 5,
  "rows": 1,
  "symbols": ["A", "B"],
  "wilds": [],
  "scatters": [],
  "paylines": [[0, 0, 0, 0, 0]],
  "availableBets": [1],
  "reelStrips": [["A"], ["A"], ["A"], ["B"], ["B"]],
  "paytable": {"A": {"5": 10}, "B": {"5": 2}}
}
```

Before the correction both public packages were observed paying `1` instead of
`0`. The first acquired an unauthored `B/3` entry; the second acquired `A/3` and
other default counts. Both regressions were run against the baseline before the
assembly edit: ten failing cases across five stakes, with 67 existing/control
cases passing. The corrected expectations are zero, no win records, no hidden
entries, and credits moving from 1000 to 999 at stake 1. For explicit-zero and
positive controls use the three-reel B fixture with respectively
`A:{3:5}, B:{3:0}` and `A:{3:5}, B:{3:2}`.

| Selected stake | Baseline omitted-symbol/count win | Corrected omitted/explicit-zero win | Authored B/3 positive control |
| --- | --- | --- | --- |
| 1 | 1 | 0 | 2 |
| 0.01 | 0.01 | 0 | 0.02 |
| 0.1 | 0.1 | 0 | 0.2 |
| 1.5 | 1.5 | 0 | 3 |
| 1e-7 | 1e-7 | 0 | 2e-7 |

The actual generated CJS and independently transpiled emitted `src/index.ts`
are both loaded and exercised. Their normal and exact-session entrypoints must
have identical maps and results. These tests bind generated `require("pokie")`
to candidate source; they do not claim installed npm archive verification.

The literal all-B fixture deliberately goes through direct GamePackageGenerator.
Validated adapters correctly reject its unreachable authored A. Their variants
use reachable `[A,B]` strips and inject the reproduction screen through the
package's existing exact-session entrypoint. Reachability validation remains
unchanged. Supported WASM variants also use reachable strips.

## Root cause and assembly contract

`setAvailableSymbols` rebuilds VideoSlotConfig's convenience paytable. Previously
`createConfig` then overlaid authored entries on `config.getPaytable()`, leaving
unmentioned symbols and counts populated. Both emitted module formats share
this function, and the managed Blueprint-to-Outcome VM executes that template.

The assembly now constructs `new Paytable(config.getAvailableBets())`, populates
only Blueprint entries with the existing all-bets setter, and installs it with
`setPaytable` after `setAvailableSymbols`. Every numeric stake key survives,
including fractional and exponential notation. Authored values are multipliers;
runtime map values are `multiplier * bet`. Zero is retained as an explicit key,
while missing keys remain absent and payout lookup returns zero. Matching does
not fall back to a shorter award. No random draws or setter ordering changed.

An empty construction has one empty symbol map per configured stake. Populate
new symbol/count entries with the all-bets setter; the selected-bet setter and
count enumeration still require an existing symbol map. This correction does
not broaden sparse-map APIs. Detached import/export behavior remains intact.

`new Paytable(bets, symbols, wilds, reels)`, default VideoSlotConfig,
`setAvailableSymbols`, and hand-authored create/init scaffolds retain their
convenience awards. Those games choose their own payout contract. An intentional
free-game grant now counts landed configured scatters independently of monetary
winning-scatter records. Omitting scatter money therefore keeps feature grants
without emitting a fictitious monetary win. Positive scatter payouts and default
free-game behavior remain covered. Ante still changes stake cost, not payout
multipliers; a buy-feature purchase is one-shot and consumes its first forced
spin, with later free spins retaining the authoritative table.

## Validation, adapters, display and persistence

Validation admits finite nonnegative multipliers. Negative, nonnumeric and
nonfinite values remain errors, as do empty tables, malformed structures and
unreachable references. Missing-symbol and missing-base-payout warnings remain
warnings; their suggestions explicitly allow intentional omission without
inserting a payout. Economic quality warnings consider positive awards, so an
all-zero table is not described as inflating RTP or hit frequency. Explicit zero is visible in model/editing projections and
survives asynchronous authoring validation. Recovery uses a negative payout,
then returns to a valid draft without changing Create-button behavior.

The consumer audit found these existing routes:

- CLI build and Studio build use ArtifactBuilderRegistry/TsPackageArtifactBuilder
  and GamePackageGenerator. Play/simulation/replay/dev/serve materialize the same
  generated package via BlueprintProjectMaterializer/RunnableArtifactMaterializer.
- PAR import/export use ParSheetImporter/Exporter and PaytableSheetMapper. Sparse
  counts and zeros round-trip unchanged, and the imported model generates and
  plays through the existing package generator. Blueprint save/load preserves
  the same authored table. Validation failure precedes publication and preserves
  existing destinations.
- BlueprintStakeOutcomeLibraryWorkflow supplies the public runtime constructors
  (now including Paytable) to the shared rendered module in its VM. Registry,
  managed conversions and Studio outcome jobs reach that workflow or the same
  materialized-package exact generator. No alternate interpreter was added.
- Network initial payloads expose only authored stake-scaled entries. Round
  payloads and FileSessionRepository persisted state contain no unauthored wins.
  Game Model and payout editing display authored multipliers, not runtime amounts.

For the tiny exact model use three `[A,B]` strips, one row/line, bet 1 and
`A:{3:5}`. All eight grids have unit weight. AAA wins 5; AAB, ABA, ABB, BAA, BAB,
BBA and BBB win zero with empty win records. Weighted total win is 5 and RTP is
`5/8`. At stake b the weighted total is `5*b`, with unchanged RTP. Adding
`B:{3:0}` preserves those results and its explicit zero map entry. With five
`[A,B]` strips and `A:{5:10}, B:{5:2}`, all 32 records are inspected: only AAAAA
and BBBBB win, for total `12*b` and RTP `12/32`; every shorter prefix pays zero.
The managed workflow persists/reopens its eight-grid bundle, checks each artifact
and the manifest/report against independent totals, then verifies compatible
reuse and version-incompatible regeneration.

## Compatibility and retained evidence

Existing generated files, saved sessions and outcome artifacts are not
automatically rewritten. Rebuild Blueprint packages with the corrected runtime;
regenerate outcome artifacts before using them as evidence of corrected math.
Historical reports and prior campaign evidence remain unchanged.

BlueprintProjectMaterializer keys include exact Blueprint content, POKIE version,
schema/build-contract version and supplied runtime identity. The default direct
materializer identity is only the version; replacing code in place at the same
version does **not** invalidate that cache. CLI installations supply an
installation identity; callers using the default must use a fresh cache or new
runtime identity/version when rebuilding with unpublished code. This correction
does not change the JSON schema or content hash to disguise a runtime change.

Managed Outcome reuse compares game/version, config hash, artifact POKIE version
and generation provenance/policy. A version upgrade rejects the old bundle;
unchanged content and the same POKIE version may still reuse historical math.
For a same-version development replacement, explicitly generate a fresh bundle
using the prepared generation route instead of compatible reuse, with a fresh
destination. Do not present old matching bundles as newly regenerated results or
delete prior completed-step evidence to obtain a clean-looking directory.

WASM keeps its separate evaluator and zero-fallback authored lookups. Parity
checks cover supported line/scatter payouts with omissions, zero and positive
awards at every representative stake. Existing seeded continuation, restoration,
replay and rejected-command immutability checks remain. Ways, clusters, free games
and bet modes remain outside the supported WASM subset; see
[the compatibility boundary](../wasm-compatibility-boundary.md).

Implementation verification uses only the twenty targeted files named by the
P10-02 scope and `npm run typecheck` (including the Studio compiler once). Existing
atomic package publication/conflict/cleanup, exact cancellation/resume/source
mismatch, managed rollback, P10-01 fractional and P9 seed/golden/replay tests are
retained and run. No packaging campaign or official gate was launched. The
runtime correction and its bounded regressions form one reviewable commit.

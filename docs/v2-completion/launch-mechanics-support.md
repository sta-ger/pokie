# Launch mechanics workflow register — V2C-15 candidate

This register covers mandatory authored workflows. It does not replace
`GameMechanicCompatibilityCatalog`, which describes random strategies. The
machine-readable authority is
[`AUTHORED_WORKFLOW_SUPPORT_CATALOG`](../../src/generated/AuthoredWorkflowSupportCatalog.ts).
Each of its 324 cells carries the variant, concrete positive and negative
assertions, data fixture, full exact/negative Jest test titles and focused test
owner. Additional cases name variant-specific edge, rejection and expiry tests. Fixed mandatory-family and 36-ID
expectations in `WeightedBonusAuthoring.test.ts` prevent deleting a family/row
from making completeness pass.

Candidate execution and independent acceptance are distinct. Every row below
has an implemented path and fixtures; current candidate execution is recorded
in [V2C-15](V2C-15.md). Independent approval and controller gates remain **open**
for every cell until those authorities record acceptance. Historical
[V2C-12](V2C-12.md), [V2C-13](V2C-13.md), and [V2C-14](V2C-14.md) receipts are
preserved, and are not current-candidate execution evidence.

## Cell assertions and fixture owners

| Cell | Observable contract |
| --- | --- |
| C — core | Exact payout/stake, grants, duration/expiry and attribution for the row's configured variant. |
| V — schema | Malformed fields/identities, unsupported evaluators and conflicting progression owners reject before mutation/publication. |
| E — editor | Rendered Home Form/JSON and Project edits preserve zeros, malformed drafts and references; explicit Apply/save/build. |
| B — build | Equivalent generated CJS/recompilable TS, retained rules/identity; failed/occupied destinations are protected. |
| R — runtime/restore | Interrupted continuation, next RNG, original denomination, rollback/retry and duplicates settle once. |
| S — simulation/report | Actual stake/payout; snapshots, chunks, independent workers and public report observations. |
| X — extraction | Descriptor/rebuild equality; opaque custom reasons block lossy publication without session advancement. |
| P — PAR | Actual XLSX export/import/rebuild retains effective rules and rejects invalid imported values. |
| A — replay | Seeded/exact audit preserves canonical feature events and rejects incompatible model/state. |

Fixture/owner groups (references now use complete declared test titles, with
the row identifying the parameterized case; no generic substring is coverage):

- **M**: `tests/v2/fixtures/ExistingMechanicsGame.ts`,
  `tests/v2/ExistingMechanicsAuthoring.test.ts`; the exact generated lifecycle case asserts zero and additive
  grants, lock/reset/exhaustion awards, jackpot resets and base/ante/purchase
  behavior per applicable row. F1–F9 continuation/ownership regressions remain. Editor owner: `BlueprintEditorPage.existingMechanics.test.tsx`.
- **W**: `examples/blueprints/wild-<variant>.blueprint.json`,
  `tests/v2/WildModifierAuthoring.test.ts`; negative fields/coordinates/factors,
  custom evaluators/callbacks, Hold&Win conflicts, invalid expiry and overflow.
  Editor owner: `BlueprintEditorPage.wildModifiers.test.tsx`.
- **D**: `tests/v2/fixtures/BoundedMechanicsGame.ts`,
  `tests/v2/CascadeCollectionAuthoring.test.ts`; negative direct constructor/
  rendering combinations, malformed policies, unreachable progress and bound
  exhaustion. Editor owner: `BlueprintEditorPage.cascadeCollection.test.tsx`.
- **Q**: `tests/v2/fixtures/WeightedBonusGame.ts`,
  `tests/v2/WeightedBonusAuthoring.test.ts`; parameterized negative weight,
  total, ID/effect ambiguity, target, context, payout/duration, schema/state,
  owner/geometry and artifact-target boundaries. Editor owner:
  `BlueprintEditorPage.weightedBonus.test.tsx`.

All editor owners live under
`tests/cli/studio-client/src/components/blueprintEditor/`.
Q also owns fixture-driven real CLI/Studio/XLSX and worker/fresh-process durable
checks. Existing public player, report, artifact inspector, Play and Replay
component suites assert presentation of that same Q selection.

## Complete supported variant/composition map

Each cell below names its fixture/owner group and contract above; there are no
omitted workflow surfaces. The source register provides each fully qualified
cell-to-fixture/negative/owner mapping. **Mapped** means implementation coverage;
acceptance remains open as described above.

| Variant | Mandatory family/composition | C | V | E | B | R | S | X | P | A |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| free-games | Free games / zero grants / additive retrigger | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| modes | Free games + base/ante/explicit purchases | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| hold-flat | Hold&Win flat awards, lock/reset/exhaustion | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| hold-flat-modes | Hold&Win flat awards, lock/reset/exhaustion + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| hold-bet | Hold&Win bet awards, lock/reset/exhaustion | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| hold-bet-modes | Hold&Win bet awards, lock/reset/exhaustion + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-base | fixed Jackpot + base | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-base-modes | fixed Jackpot + base + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-freeGames | fixed Jackpot + freeGames | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-freeGames-modes | fixed Jackpot + freeGames + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-holdAndWin | fixed Jackpot + holdAndWin flat awards | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-holdAndWin-modes | fixed Jackpot + holdAndWin flat awards + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-holdAndWin-bet | fixed Jackpot + holdAndWin bet awards | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| fixed-holdAndWin-bet-modes | fixed Jackpot + holdAndWin bet awards + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-base | accumulating Jackpot + base | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-base-modes | accumulating Jackpot + base + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-freeGames | accumulating Jackpot + freeGames | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-freeGames-modes | accumulating Jackpot + freeGames + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-holdAndWin | accumulating Jackpot + holdAndWin flat awards | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-holdAndWin-modes | accumulating Jackpot + holdAndWin flat awards + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-holdAndWin-bet | accumulating Jackpot + holdAndWin bet awards | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| accumulating-holdAndWin-bet-modes | accumulating Jackpot + holdAndWin bet awards + BetMode | M-C | M-V | M-E | M-B | M-R | M-S | M-X | M-P | M-A |
| modifier-expanding | expanding: attributed wins, evaluated coordinates, ordered rules and expiry; lines/ways/clusters | W-C | W-V | W-E | W-B | W-R | W-S | W-X | W-P | W-A |
| modifier-sticky | sticky: attributed wins, evaluated coordinates, ordered rules and expiry; lines/ways/clusters | W-C | W-V | W-E | W-B | W-R | W-S | W-X | W-P | W-A |
| modifier-restricted | restricted: attributed wins, evaluated coordinates, ordered rules and expiry; lines/ways/clusters | W-C | W-V | W-E | W-B | W-R | W-S | W-X | W-P | W-A |
| modifier-multiplier | multiplier: attributed wins, evaluated coordinates, ordered rules and expiry; lines/ways/clusters | W-C | W-V | W-E | W-B | W-R | W-S | W-X | W-P | W-A |
| modifier-transform | transform: attributed wins, evaluated coordinates, ordered rules and expiry; lines/ways/clusters | W-C | W-V | W-E | W-B | W-R | W-S | W-X | W-P | W-A |
| modifier-reel | reel: attributed wins, evaluated coordinates, ordered rules and expiry; lines/ways/clusters | W-C | W-V | W-E | W-B | W-R | W-S | W-X | W-P | W-A |
| bounded-cascade | cascade; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| bounded-respins | respins; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| bounded-collection | collection; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| bounded-cascade-collection | cascade-collection; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| bounded-respins-collection | respins-collection; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| bounded-cascade-respins | cascade-respins; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| bounded-cascade-respins-collection | cascade-respins-collection; bounded terminal/progression, threshold/cap/carry/reset as configured | D-C | D-V | D-E | D-B | D-R | D-S | D-X | D-P | D-A |
| weighted-bonus | Stable table/outcome/context; eligible frequency, payout units and finite duration | Q-C | Q-V | Q-E | Q-B | Q-R | Q-S | Q-X | Q-P | Q-A |

Free games retain missing/zero grants and additive retriggers. Hold&Win retains
flat/entry-bet awards, lock coordinates, reset and exhausted terminal payment.
Fixed/accumulating jackpots retain contribution, award and reset. Mode fixtures
execute base, ante and explicit purchase lifecycle where a free-game target is
configured. Modifier fixtures retain expanding/sticky/restricted substitutes,
multiplier attribution, ordered transforms/reel replacements, expiry and the
supported evaluator paths. All seven bounded compositions retain exact terminal
and interrupted/restored behavior. Q adds finite outcomes without replacing any
of those owners or suppressing a required family.

Unsupported **compositions** and artifact targets are explicit boundaries, not
family deferrals. See [weighted bonus contracts](../weighted-bonus.md). Arbitrary
callbacks/dynamic targets remain custom-only with descriptor path/code/reason;
inspection and supported custom execution remain available, and lossy extraction
is blocked. These custom-only boundaries do not substitute for a launch row.

## F3 surface reconciliation

The original generic negative anchor did not prove PAR, extraction or replay
rejection. It has been replaced by per-variant `catalogue surface rejection
boundaries` cases in the four existing focused suites. Those cases call the
ordinary public boundaries (shared test fixture helper in
`tests/v2/fixtures/ExistingMechanicsGame.ts`), with distinct assertions:

| Surface | Exact case in the source register | Negative case assertion |
| --- | --- | --- |
| Core | M: `exact grants, locks, awards, reset and mode lifecycle`; W: evaluator workflow with numeric payout/screen/attribution; D: `exact terminal budget and collection awards`; Q: `known-answer` evaluator cases | Invalid mechanics cannot construct the generated game; family-specific unsupported evaluators/compositions remain linked separately. |
| Schema | The row's existing validation/workflow case | Unknown mechanics is a validation error; modifier/bounded/bonus malformed and composition matrices remain linked. |
| Editor | M/W/D: each row's `Home JSON retains catalogue rules and blocks invalid publication`; Q: `Home Form/JSON preserves identity, units, zero mass and malformed drafts without saving` | Real validation blocks Create, retains invalid JSON and makes no write; existing Project/Home control tests retain field diagnostics and explicit Save/Apply. |
| Build | Existing generated CJS/TypeScript workflow (D also identity/delivery equivalence; Q known answers) | Invalid definitions create no output; occupied destination retains original contents. |
| Runtime/restore | Existing fresh-instance continuation workflow; D now restores all seven compositions after first acceptance; Q fresh ordinary/explicit handlers | Invalid nested RNG leaves the session unchanged. Q additionally rejects coordinated duration, missing identity evidence and descending consumed contexts. |
| Simulation/report | M actual Studio runner and downloads; W/D existing CLI/Studio workflows; Q snapshot/chunk/legacy/worker statistics | Unfunded sessions accept no requested plays, retain executable/RNG state and report zero actual rounds, stake and payout. |
| Extraction | Existing complete extraction and seeded rebuild comparison | Malformed descriptor yields no publishable Blueprint, returns diagnostics and creates no session. |
| PAR | Existing real XLSX import/hash/rebuild comparison | A mutated real workbook returns `parsheet-mechanics-invalid` with error severity; Q also retains field-specific malformed-weight diagnostics. |
| Replay | Existing seeded/canonical audit workflows (Q and D include real CLI/Studio verification) | Changed paytable/model rejects exact audit replay before session creation; Q also rejects tampered retained selection evidence. |

Every M row now has a generated exact lifecycle fixture. The free-game path
asserts the explicit zero grant, entry grant 2, additive retrigger 2→4 and bank
0.3. Hold&Win asserts budget 2/1/2/1/0, locked coordinates, terminal flat 6 or
entry-bet 0.3 payout and subsequent clearing. Applicable jackpot rows assert
actual-stake contribution, two awards and pool reset; mode rows assert base,
ante and one-shot purchases. W cases assert factor 2 or 6 and exact payouts
for lines/ways/clusters; ordered transform/expansion/sticky expiry cases are
linked where applicable. D cases assert all seven exact budgets and awards,
with separate existing cap/carry/zero-reset, no-trigger/no-retrigger and winning
cascade terminal/exhaustion cases linked explicitly. Q retains both known
outcomes, no-trigger and zero-effect cases, configured/observed frequency and
all declared rejection boundaries.

The register test enforces all 36 fixed IDs, ten mandatory families and nine
surfaces, and resolves full test declarations with the TypeScript parser. This
checks reference integrity; executed behavioral assertions provide coverage.
Neither parsed references nor historical receipts establish acceptance.
Current repair execution and independent/controller decisions remain in
[V2C-15](V2C-15.md); all acceptance cells are still open.

V2C-16 adds shared bounded analytics to the existing supported simulation rows,
without expanding mechanic compositions or target support. Duration counts executed
feature subrounds; cascade delivery stages remain separate. Parent/child lifecycle
summaries may overlap, while the canonical base/feature/jackpot monetary partition
is additive. Native outcome events do not prove lifecycle; WASM lacks canonical
component/lifecycle evidence. See [formulas and support boundaries](../simulation.md#feature-analytics-aggregates-v2c-16).

V2C-17 report projection: canonical lifecycle evidence supports entry/retrigger/completion distributions; arbitrary custom event names and flattened artifact categories do not. Native outcome artifacts support observed components but no canonical lifecycle. Ordinary arithmetic WASM has no feature attribution; V2C-21 feature-aware artifacts expose the shared canonical lifecycle and selection observations. Supported configured features with no entries are displayed as unobserved, separately from unsupported attribution and legacy missing analytics. Empirical confidence/adaptive precision is not exact RTP or proof of rare-event coverage; low-evidence diagnostics use completed usable samples rather than the requested budget.

V2C-18 adds read-only canonical definition comparison across the existing authored
reel/variant, paytable, bet-mode, geometry and mechanics contracts (free games,
hold-and-win, jackpots, modifiers, cascade, respins, collection, weighted bonus).
CLI and Studio use one differ and authoritative readers. This introduces no
payout caps or new mechanics. Custom executable fidelity and undeclared custom
max-win policy remain explicit limitations; PAR/WASM/outcome-only boundaries are
listed in [math-modeling.md](../math-modeling.md#canonical-definition-comparison-v2c-18).

## Advanced declared-model analysis (V2C-19)

The [V2C-19 boundary](V2C-19.md) records each source/mechanic adapter, initial-state
and numeric assumptions, supported checks, all-path termination semantics and
unsupported persistent state. Blueprint runtime handlers are reused; custom
executable fidelity is never inferred from descriptor completeness. Exhausted
analysis budgets remain unknown, distinct from runtime respin caps and cascade
limit rejection. CLI/Studio/definition diff retain the same report and witnesses.

V2C-20 shares the ordinary lines/ways/clusters math kernel between generated Node and canonical WASM.
ABI 2.0 uses one i32 stop per reel, supports models above the former 30-bit total and binds exact executable
bytes to the effective model and component descriptor. Fractional components multiply before addition;
ways/clusters retain selected-group aggregation. Portable consumers still expose amount-only analytics,
without invented feature events. See [WASM limits and continuation](../wasm-compatibility-boundary.md).
Independent controller review and workflow verification are recorded separately in [the V2C-20 receipt](V2C-20.md).

## Portable feature execution (V2C-21)

All 36 rows above now have a WASM execution cell owned by
`tests/v2/WasmFeatureParity.test.ts` and its native public-runtime consumer.
The matrix freezes the 22 existing-mechanic IDs, six modifier IDs, seven bounded
IDs and weighted-bonus ID. It generates real packages and artifacts, compiles
all generated TypeScript, and uses fresh root CJS/ESM, browser and wasm exports.
Independent amounts, screens, feature progress, settlement, selected identity,
JSON restoration, replay and next RNG are checked at meaningful boundaries.

Additional cells cover all modifier/evaluator/denomination pairs, declared
modifier/free-game/purchase/jackpot/weighted combinations, full-board Hold&Win,
both bonus payout units/zero duration, exact cascade terminal delivery, binary64
weighted mass and projected/fractional viewports with hidden wilds/scatters.
The public matrix contains 137 cells, including weighted Hold&Win, all seven
bounded combinations and weighted bonus through their supported evaluators, plus
known weighted cascade refill/draw accounting. Every catalogue row and four
representative weighted models have bounded 128-play restore loops. Executable snapshots
retain current progress and one delivery, with no completed-round history.

This adds supported portable cells; it does not widen incompatible compositions,
custom code/services, PAR geometry, or paid-grid outcome-library/Stake targets.
See [the current WASM boundary](../wasm-compatibility-boundary.md) and
[the candidate receipt](V2C-21.md). Independent approval and controller gates are
separate from implementation test evidence.

V2C-26 PAR fidelity coverage reopens actual ExcelJS workbooks for every existing
mechanic, bounded progression composition, modifier and weighted bonus in the
authored catalogues, using exact/weighted reel sequences and fractional bets.
Represented hashes, Game Model projection and seeded runtime/restoration are checked
together. Empty optional arrays canonicalize to absence; empty paytable symbol maps
are represented by symbol-only rows. Geometry/custom mechanics/unknown policies are
rejected rather than certified lossless. Independent public-candidate CLI verification
and controller gates are separately required; source tests are not that approval.

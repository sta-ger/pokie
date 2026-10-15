# Launch mechanics workflow register — V2C-15 candidate

This register covers mandatory authored workflows. It does not replace
`GameMechanicCompatibilityCatalog`, which describes random strategies. The
machine-readable authority is
[`AUTHORED_WORKFLOW_SUPPORT_CATALOG`](../../src/generated/AuthoredWorkflowSupportCatalog.ts).
Each of its 324 cells carries the variant, observable assertion, exact fixture,
negative fixture and focused test owner. Fixed mandatory-family and 36-ID
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

Fixture/owner groups (the exact fixture anchor is the row ID in the public
machine-readable cell):

- **M**: `tests/v2/fixtures/ExistingMechanicsGame.ts`,
  `tests/v2/ExistingMechanicsAuthoring.test.ts`; negative fixture “rejects
  conflicts and unknown fields” plus F1–F9 continuation, identity and ownership
  regressions. Editor owner: `BlueprintEditorPage.existingMechanics.test.tsx`.
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

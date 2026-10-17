[← Back to docs index](README.md)

# Modeling Slot Math with POKIE

This is manual modeling, measurement, and iteration. Math Targeting/Optimization is an agreed direction
without an implementation in the reviewed repository; release scope remains unconfirmed. Reel strips,
visible rows, and resizable grids do not supply an explicit overscan model. Blueprint schema/editor mechanics
authoring covers win models, free games, and bet modes, but remains partial relative to composable runtime
mechanics. Blueprint symbol/reel/paytable reachability checks are limited checks, not generic mechanics/state
reachability. See the [status register](audit-corrections/README.md).

A worked walkthrough of using POKIE to balance RTP, hit frequency, and volatility for a video slot's math model.

## The vocabulary

- **RTP (Return to Player)** — the percentage of wagered money players can expect to recoup over time (e.g. 93%
  means, on average, 93 credits return for every 100 wagered).
- **Hit frequency** — how often a round produces any win at all (e.g. 0.62 means roughly 62% of rounds pay
  something).
- **Volatility** — low volatility means frequent, smaller wins; high volatility means rarer, bigger wins. Measured
  via the standard deviation of round payouts.

A slot's math model is defined by four things, all configurable on `VideoSlotConfig`
(see [Game Session & Configuration](game-session.md)): available symbols, reel symbol sequences, the paytable, and
the payline definitions.

## Step 1 — configure the game

```ts
import {VideoSlotConfig, VideoSlotSession, SymbolsSequence, Paytable, LeftToRightLinesPatterns} from "@fromstan/pokie";

const config = new VideoSlotConfig();
config.setReelsNumber(5);
config.setReelsSymbolsNumber(3);
config.setAvailableSymbols(["9", "10", "J", "Q", "K", "A", "W", "S"]);
config.setWildSymbols(["W"]);
config.setScatterSymbols(["S"]);
```

## Step 2 — design the reel strips

Reel strip composition is the main RTP/volatility lever: rarer symbols on the strip pay more but hit less often.
Build one `SymbolsSequence` per reel — either an exact count per symbol, or a weighted distribution:

```ts
const symbolsNumbers = {"9": 20, "10": 20, "J": 15, "Q": 15, "K": 7, "A": 6, "S": 5};

const sequences = new Array(config.getReelsNumber())
    .fill(0)
    .map(() => new SymbolsSequence().fromNumbersOfSymbols(symbolsNumbers).shuffle());

config.setSymbolsSequences(sequences);
```

`fromNumbersOfSymbols` takes an exact count per symbol; `fromSymbolsWeights` takes percentages (which must sum to
100) plus a target strip length. See [Reels & Symbol Sequences](reels-and-sequences.md) for the full API and its
gotchas (the `from*` builders replace strip contents rather than append to them).

## Step 3 — reduce or expand paylines

Fewer paylines concentrate the same total bet into fewer, more impactful winning positions; more paylines smooth out
variance. Presets and custom definitions are covered in
[Paylines & Line Patterns](paylines-and-patterns.md) — e.g. dropping to 5 hand-picked lines via
`CustomLinesDefinitions`, or starting from `LinesDefinitionsFor5x3`'s 25 preset lines and trimming it down.

## Step 4 — set the paytable

```ts
const paytable = new Paytable(config.getAvailableBets(), ["9","10","J","Q","K","A"], ["W"], 5);
paytable.setPayoutForSymbol("A", 5, 15); // 5-of-a-kind "A" pays 15x bet, across every available bet
config.setPaytable(paytable);
```

See [Paytable & Win Calculation](paytable-and-wins.md) for the full payout data model, and for cluster/value/ways
win styles if your game isn't fixed-payline-based.

## Step 5 — compute the exact theoretical RTP

For strip sizes small enough to enumerate exhaustively, `SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations`
gives you every possible reel-stop combination, so you can compute RTP exactly rather than statistically:

```ts
import {SymbolsCombinationsAnalyzer, SymbolsCombination, VideoSlotWinCalculator} from "@fromstan/pokie";

const allCombinations = SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations(
    config.getSymbolsSequences(),
    config.getReelsSymbolsNumber(),
);

const winCalculator = new VideoSlotWinCalculator(config);
const bet = config.getAvailableBets()[0];

// dedupe identical grids (different reel stops can render the same visible symbols) so
// calculateWin only runs once per unique grid, weighted by how often it actually occurs
const uniqueCombinations = SymbolsCombinationsAnalyzer.getUniqueCombinationsWithWeights(allCombinations);
const combinationProbability = SymbolsCombinationsAnalyzer.getCombinationProbability(config.getSymbolsSequences());

let expectedWinPerBet = 0;
for (const {combination, weight} of uniqueCombinations) {
    winCalculator.calculateWin(bet, new SymbolsCombination().fromMatrix(combination));
    expectedWinPerBet += (winCalculator.getWinAmount() / bet) * weight * combinationProbability;
}

const theoreticalRtp = expectedWinPerBet;
```

This is combinatorially expensive — cost is the product of every reel strip's length (see
[Reels & Symbol Sequences](reels-and-sequences.md)) — so keep strips short while iterating on the model, and treat
this as a precision check rather than something you re-run on every tweak.

## Step 6 — validate with a Monte Carlo simulation

Once the theoretical RTP looks right, confirm it holds up under realistic random play using
[Simulation](simulation.md):

```ts
import {Simulation, SimulationConfig} from "@fromstan/pokie";

const session = new VideoSlotSession(config);

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(100_000);

const simulation = new Simulation(session, simulationConfig);
simulation.run();

simulation.getAverageRtp();               // should converge close to theoreticalRtp
simulation.getHitFrequency();             // how often rounds pay anything
simulation.getPayoutsStandardDeviation(); // volatility indicator
```

If the simulated RTP diverges noticeably from the theoretical one, or hit frequency/volatility don't match the
target player experience, go back to steps 2–4: adjust symbol distribution on the reel strips, tweak paytable
payouts, or change how many paylines are active — then re-run steps 5–6 until the numbers land where you want them.

## Weighted whole sequences

For variant `v` of reel `r`, a joint variant/stop event has probability
`weight[v] / sum(weights) / length[v]`. POKIE currently requires equal variant
lengths within each reel, so its joint enumeration assigns the variant's exact
integer relative weight to each circular stop. Lengths may differ between reels.
Across independent reels the joint event mass is the product of those weights.

`SymbolsCombinationsAnalyzer.getWeightedCombinations()` returns grid probabilities;
`getCombinationProbability()` rejects weighted inputs because there is no single
uniform tuple probability. Outcome-library generation sweeps the same ordered
variant/stop events, merges mass for identical grids in memory or disk partitions,
and evaluates each grid through the existing forced-session seam. A deduplicated
artifact does not claim one arbitrary variant ID for several possible sources.
Exact source identity includes all authored IDs, arrays, weights and ordering,
including zero-weight alternatives; incompatible checkpoints are rejected.

A tiny fixture uses a 1:3 all-A/all-B reel, an exact all-A reel, and a two-A line
paying four times stake. Its exact RTP is `1/4 * 4 = 1`. Seeded runtime and sampled
libraries use the same distribution. Positive numeric probability underflow is an
explicit exact-analysis/export boundary, while runtime selection retains exact
binary64 weight ratios. See [the reel contract](reels-and-sequences.md#weighted-whole-sequence-reels).

## Authored wilds and screen modifiers

`GameBlueprint.mechanics.modifiers` is finite data with two ordered arrays:
`wilds` declares `{symbol, substitutes?, factor?}` and `rules` declares the
catalogue below. Wild symbols must also appear in `blueprint.wilds`. Omitted
`substitutes` means unrestricted substitution; `[]` forbids it. An omitted
factor means 1; an explicit 0 suppresses that component's payout.

| Catalogue variant | Rule / declaration | Playable Blueprint |
| --- | --- | --- |
| Expanding wild | `expand`, `symbol`, trigger `positions` | `examples/blueprints/wild-expanding.blueprint.json` |
| Sticky wild | `sticky`, `symbol`, acquisition `positions`, integer `lifetime` | `examples/blueprints/wild-sticky.blueprint.json` |
| Restricted wild | Wild `substitutes` array | `examples/blueprints/wild-restricted.blueprint.json` |
| Multiplier wild | Wild nonnegative finite `factor` | `examples/blueprints/wild-multiplier.blueprint.json` |
| Symbol transform | `transform`, `from`, `to`, target `positions` | `examples/blueprints/wild-transform.blueprint.json` |
| Reel fill | `reel`, `symbol`, `reels`, empty `positions` | `examples/blueprints/wild-reel.blueprint.json` |

Every rule has a unique nonempty `id`, `space` and explicit `positions` array.
Positions are integer `[reel,row]` pairs in `generated`, `visible` or `evaluated`
space. Invalid domain coordinates fail validation. Valid cells outside evaluation
are ignored: they cannot transform, trigger expansion or acquire sticky state.
`reel` is unconditional and requires `space: "evaluated"`; its unique `reels`
indexes select whole evaluated columns. All effects preserve generated dimensions,
geometry tags and cells outside evaluation.

The execution order is generate → run rules in array order in the evaluated
window → evaluate → apply wild factors to each component → aggregate → settle.
A rule sees the screen produced by earlier rules. Expansion tests its listed
cells and fills each triggered reel's evaluated rows. Later writes win. Duplicate
positions, identities, wild declarations, unknown fields/symbols and unsupported
compositions are errors. There is no implicit object-key order or hidden trigger.
Initialization and result reads do not execute rules or draw modifier randomness.

Each line, ways or cluster component is multiplied by the product of factors at
its **unique winning coordinates**, once per position. The ways product applies
to the complete component (including its ways count), not separately to each
way. Separate winning lines each receive their own factors. Losing cells and
scatter components contribute no factors. Overflow fails before settlement.
Existing evaluator target selection is retained: all-wild lines have no regular
target and pay zero even when a wild has an own paytable entry; ways excludes wild
paytable targets. A mixed line pays its regular target's entry. For `[A,W2,W3]`,
restrictions to A, paytable A/3 = 10, factors 2 and 3, and bet 0.05, payout is
`0.05 × 10 × 2 × 3 = 3`.

Sticky acquisition occurs at its rule's position in the ordered sequence, after
earlier rules. It retains that rule's wild and factor identity, reapplies it at
the same point in each subsequent step, then decrements its lifetime. Lifetime
includes acquisition; a retained cell is not refreshed while retained. Its last
application has remaining 0 and is then removed; a later step can acquire again.
Later rules may overwrite the current screen without rewriting the retained
identity. Counters advance per executed step across paid spins, free continuations
and mode changes, not per logical round or response. New sessions start empty;
failed evaluation/settlement and duplicate delivery cannot commit another advance.

All six variants compose with line, ways and cluster win models, exact/weighted
reel sources, supported geometry, free games, bet modes and jackpots. Hold & Win
and value evaluators are explicitly unsupported with these declarations. Canonical WASM
preserves these supported modifier contracts. Persistent sticky rules block independent-spin exact
outcome enumeration and its downstream conversions; stateless rules use the same
session payout path during enumeration. Custom callbacks retain their custom
capability/extraction boundary. See [serialization](serialization.md) and
[the implementation evidence record](v2-completion/V2C-13.md).

## Bounded authored mechanics (V2C-14)

See [cascades, respins and collections](bounded-mechanics.md) for the declarative
contracts, supported compositions, authoring/build/extraction/PAR workflow,
logical-round accounting, continuation and durability boundaries.

## Weighted bonus authoring

See [finite weighted bonus outcomes](weighted-bonus.md) for selection identity,
payout/duration units, authoring/interchange, restoration/replay, statistics and
custom-rule/target boundaries. The [launch support register](v2-completion/launch-mechanics-support.md)
maps every mandatory family separately from arbitrary custom callbacks.

## Canonical definition comparison (V2C-18)

`compareMathDefinitions(left, right, {signal})` and `MathDefinitionSourceReader`
read definitions; `MathDefinitionDiffer.diff(leftSnapshot, rightSnapshot)` is the
pure comparison boundary. These are exported from the generated package root
for ESM and CJS. Source readers run on the server, not in the browser. They do
not construct sessions, advance continuations, repair tables, call custom
`getConfigHash`, or consume a session's RNG. Authored reel generation uses the
existing deterministic materializer and its own generation RNG. Existing config
hashes and payout engines are unchanged.

Inputs may be paths, resolved projects, caller-owned `PokieGame` objects, or
`{kind: "blueprint", model, location?}`. Blueprint JSON, package model descriptors,
PAR import and integrity-bound canonical WASM readers supply data. Display
projections and reel preview samples are never definition authorities. Package
extraction releases its own snapshots; caller games and unrelated leases remain
caller-owned. Both reads settle and all owned cleanup completes before returning,
including either-side failures and cancellation. Cancellation never returns an
identical result; snapshot cleanup failure remains a failed result.

### Version 1 machine contract

The result contains `schemaVersion: 1`, `comparisonKind: "math-definition"`,
`scope: "declared-effective-model"`, `status`, `left`, `right`, and `changes`.
Statuses are `identical`, `different`, `partial`, `unsupported`, `invalid`,
`failed`, and `cancelled`. Only two complete supported snapshots can be
`identical` or `different`. An empty supported subset does not prove equality.
Each source carries identity (kind, location when available, descriptor and
Blueprint schema versions), support, complete known authored/effective JSON,
field authority evidence, bounded diagnostics and comparison limits.

A change has an RFC 6901 JSON Pointer `path`, `classification`, `mathematical`,
`seededTraceImpact`, and `before` / `after`. Paths escape `~` as `~0` and `/` as
`~1`; array indices are zero-based. Changes sort by pointer using code-unit
ordering. Object insertion order is ignored. Optional `context` identifies
reels, variant IDs, mode IDs, symbols/match counts, weighted-bonus table/outcome
and feature IDs, selection context and sampling contract.

Each side is either `{present: false, provenance: ...}` or
`{present: true, value: <exact JSON value>, provenance: ...}`. Missing values are
never serialized as null or zero. Provenance records authority, authored
presence/value, and `authored`, `effective`, `defaulted` or `unknown` status.
For package inputs, authored presence means presence in the supplied descriptor
declaration, not recovered pre-build authoring instructions. Original authoring
that the generated package discarded remains unavailable.
Numeric equality is exact binary64 equality, without integer coercion, rounding
or probability tolerance. Stakes such as `0.05`, `7.5`, `1e-7`, zero weights and
tiny positive weights survive JSON serialization. Non-finite numbers, accessors,
cycles, unsafe keys and oversized direct data are rejected explicitly.

Classifications are `mathematical`, `representation`, `provenance`, `order`, and
`validation`. Authored default omission versus explicit default is retained as a
representation change even when effective values agree. Missing payout/grant
versus explicit zero, and missing versus empty symbol tables, remain visible
without asserting a payout change. Generated effective reels and authoring
instructions are separate: changing metadata or generation representation can
change hash-derived materialized strips, in which case the strip changes are
mathematical. With literal reels held fixed, mode labels and descriptive `targetRtp`,
paylines ignored by ways/cluster evaluators, and omitted modifier wild `factor`
versus explicit `1` remain visible representation changes without mathematical CI
failure. All-exact `reelSequences` and literal `reelStrips` are compared as the
same effective ordered strips, at `/reelStrips/...`, with provenance mapped back
to the original sequence symbols. The snapshots retain their declarations, and
the authored pass retains representation additions/removals. Mixed/weighted
sequences retain variant IDs, weights and selection ordering. Actual wild
multipliers, sequence positions and payout amounts remain mathematical.
For generated/Blueprint modes with no `runtimeType` anywhere, `costMultiplier`
and `isDefault` are metadata; an explicit runtime mode contract retains executable
cost/default changes. Custom descriptors without that generated contract do not
establish that their costs are inert.
Generated packages cannot recover discarded generation instructions.

Ordered arrays are retained. Permutations are `order` changes, with a separate
mathematical flag; reel positions, modifier execution and cumulative weighted
selection retain their operational ordering. The `symbols` inventory is a
membership declaration: reordering the same inventory is a non-mathematical
`order` change. Deterministic generated strips are still compared independently,
so raw-hash effects from inventory or metadata edits remain mathematical. `seededTraceImpact` conservatively
flags ordering that can affect seeded execution, without claiming every seed
changes. This comparison does not prove distribution equivalence for reordered
models. Whole-sequence selection retains `logical-round-v1` /
`binary64-integer-ratios-v1`; weighted bonus retains `triggered-paid-entry` and
`integer-cumulative-u32-v1`. Grants, durations, maximum duration, reset/retrigger
policy, target references, payout units and forced free games are compared even
when current payouts agree.

Authority evidence accepts equivalent dotted (`betModes.0.costMultiplier`),
numeric bracket (`betModes[0].costMultiplier`) and RFC 6901 pointer
(`/betModes/0/costMultiplier`) paths; `$` or an empty path denotes the root.
Matching uses complete segments. A dot denotes nesting, so `paytable.A` never
covers the distinct symbol `A.B`. Literal property names can use JSON-string
brackets (`paytable["A.B"].3`) or escaped pointers (`/paytable/A.B/3`). Extraction
keeps existing simple dotted paths and uses JSON-string brackets for ambiguous
literal keys. Unsupported ancestors override exact/default evidence at every
descendant; default filtering and normalization use the same path identity.

Provenance is compared at containers as well as leaves, including empty objects
and arrays. Retained all-exact sequence declarations also retain authority-only
changes at `/reelSequences`, individual reels, `type`, and `symbols`, even though
mathematical values compare through effective strips. Recorded absent symbol
tables, payout entries and omitted feature fields retain their own provenance
changes with `present: false` on both sides. This never supplies missing values. A container authority change has its own pointer even when child
fields have independent authority. A child representation change that already
discloses adding/removing a default declaration avoids redundant parent entries.

Diagnostic paths use JSON Pointers, with `""` for the root. Source validator dotted
paths and numeric/JSON-string brackets are adapted at the comparison boundary; already
escaped pointers remain unchanged. Missing validator paths use the same field
fallback as extraction (or the root when no field is known). Exact normalized
`(path, code, severity, message)` copies are deduplicated, preserving all distinct
messages/severities and deterministic ordering. Custom diagnostics should supply
pointers for property names containing dots or brackets.
Validation changes are grouped at `/validation/<escaped diagnostic path>/<code>`.
When each side has at most one diagnostic in a group, changed severity/message
retains that key. If either side has multiple distinct diagnostics, the key adds
`/<escaped canonical diagnostic JSON>` as a deterministic identity; unchanged
identities cancel, while removals/additions remain explicit. Colliding messages
are never overwritten or guessed to be edits of each other. Both sources retain
all distinct diagnostics with stable `code`, `severity`, `path`, and `message`. Invalid authored fields remain visible;
normalization failures do not substitute a sampled or invented model.

### Max-win declaration and custom boundary

The comparison boundary accepts `maxWinPolicy` on a direct Blueprint input
wrapper or a version 1 package descriptor. It is comparison evidence, not a
Blueprint payout-cap setting and not a new runtime cap:

```ts
maxWinPolicy: {
    type: "declared",
    value: 10000,
    unit: "bet-multiple", // or "currency"
    scope: "logical-round", // or "paid-entry"
    authority: "declared custom payout collaborator"
}
```

`{type: "none", scope, authority}` establishes a declared absence;
`{type: "unknown", authority}` marks an unknown policy. The generated runtime
has no payout cap, so its absent declaration resolves to `none` with framework
authority. An undeclared custom policy is `unknown`, making the result partial.
Observed report `maxWin`, library maxima and equal hashes never substitute for a
policy declaration. Declared value/unit/scope changes are mathematical;
authority-only changes are representation/provenance information. Unknown extra
policy fields and malformed policies are rejected.

Comparison completeness does not grant conversion eligibility. Extraction retains a
valid declared max-win policy for comparison, but emits no `blueprint` or
`blueprintHash` for `declared` or explicitly `unknown` policies; its separate
`conversionDiagnostics` explains `max-win-policy-not-representable`. Artifact
planning and publication refuse these conversions, including intermediate
Blueprints for package/PAR/WASM builds. A declared `none` policy permits the
existing conversion contract. No payout cap is added.

A custom descriptor declares representable behavior; it cannot prove arbitrary
executable fidelity. Unsupported collaborators, unknown fields, absent descriptors,
incompatible versions, throwing getters and asynchronous rejection retain explicit
boundaries. Unsupported field authority overrides defaults and exact evidence at
all descendants. Unknown fields retain declarations without fabricated effective
defaults or asserted mathematical changes; provenance traversal includes array
elements in modifiers, variants and modes. Known partial fields are still compared. PAR comparison covers only
what its importer represents and carries conversion diagnostics/limits. Canonical
WASM compares its effective symbol inventory, strips, payouts, paylines and win model with partial status because
original authoring omissions/default choices are unavailable. Legacy WASM metadata
and outcome-only artifacts cannot reconstruct a definition. These limitations
cannot be upgraded to equality by matching report totals or matching subsets.

### Advanced declared-model validation

Use `AdvancedModelValidator.validate({kind: "blueprint", model}, {limits, signal})`
or `AdvancedModelSourceValidator.validate(source, {limits, signal})` for explicit
asynchronous reachability, all-path termination and invariant analysis. A finite
`kind: "declared-transitions"` table can retain reachable state/transition and
cycle witnesses; its completeness is an explicit assumption, not a proof of the
code which supplied it. Reports distinguish pass, violation and unknown checks,
structural validity, operational status, assumptions, budgets and executable
fidelity. Exhausted frontiers/depth and cancellation are inconclusive.

Blueprint analysis enumerates attainable circular windows and positive-weight
alternatives and exercises existing runtime handlers. It preserves fractional
stakes and authored missing/zero payouts and grants. Additive free-game grants
can violate all-path termination even when almost-sure termination is possible;
no probability claim follows from a cycle with an exit. Respins retain their
lifetime cap; cascade bound failures are explicit. Collection currency state is
closed over reachable entry values; persistent jackpot/modifier state and
lifetime wallet/counter overflow retain limitations. Max-win declarations are
checked in their declared units/scope and never install an enforcement cap.
See [the full source/mechanic boundary](v2-completion/V2C-19.md).

See [finite same-type math optimization](optimization.md) for MathTarget units, policy validation, supported tuning contracts, locks, evidence and explicit candidate publication.

# Finite weighted bonus outcomes

`mechanics.weightedBonus` authors one finite table, independently of whole reel
sequences, build-time symbol weights, and stored WeightedOutcomeLibrary artifacts.
See [the runnable example](../examples/blueprints/weighted-bonus.blueprint.json)
and [launch workflow coverage](v2-completion/launch-mechanics-support.md).

The table declares `id`, `context: "triggered-paid-entry"`, a symbol/count
`trigger`, a `feature: {id, type: "bonus-respins", maxDuration}`, and an ordered
`outcomes` array. Each outcome declares `id`, `weight`, `targetId`, `payout`,
`payoutUnits` (`currency` or `bet-multiple`), and `duration`.

- IDs use lowercase ASCII letters, digits and hyphens, start with a letter, and
  contain at most 64 characters. Reserved object names are forbidden. Comparison
  is exact; whitespace/case variants are rejected, never normalized or merged.
- Weights are nonnegative safe integers whose sum is in `[1, 2^32]`. Zero weights
  remain in authoring, interchange and reports but cannot be selected. Missing,
  fractional, negative, nonfinite and oversized values fail validation.
- Outcome IDs are unique. Duplicate effects (target, payout, units and duration)
  must be combined into one outcome; different IDs do not resolve that ambiguity.
- `targetId` must match the configured feature ID. Payout is finite and
  nonnegative. Duration and maximum duration are integers in `[0, 90]`, and each
  outcome's duration must not exceed that maximum. Zero payout and duration are
  meaningful authored values.

Selection happens after the paid entry's ordinary screen evaluation, only when
its symbol-count trigger holds. The shared session RNG supplies an unsigned
32-bit draw. Rejection sampling removes the remainder above the largest multiple
of the total weight, then the table's declared cumulative intervals choose
exactly one outcome. This introduces no floating-point truncation of positive
mass. The example has intervals `[0,1)` and `[1,4)` with configured probabilities
1/4 and 3/4; its third outcome has zero mass.

The selected payout is added once on the entry. Currency amounts are wallet
currency; bet multiples use the entry denomination. Duration counts **additional
bonus respins**, excluding the entry. Each respin costs zero, retains the entry
bet and pays through the ordinary lines/ways/clusters evaluator. Respins never
select again or retrigger. A nontriggered entry draws no bonus outcome.

For the example at numeric seed `0` and bet `0.05`, the entry selects `large`,
awards `0.25` plus the ordinary `0.10`, then executes two respins paying `0.10`
each: stake `0.05`, total win `0.55`. Numeric seed `31` selects `small`, pays
`3` currency plus `0.10`, and executes no respins. Initial screen generation
uses the ordinary RNG path; inspecting or serializing that screen never selects
a bonus. Numeric and string seeds retain their existing distinct semantics.

## Authoring, execution and restoration

Studio Home exposes the table in Form's Bets section and in JSON Apply. Project
Game Model exposes the same editor under Mechanics. Editing a feature ID
explicitly updates matching outcome targets; symbol renaming updates the trigger,
and removing a referenced symbol is blocked with its field path. Invalid drafts
remain recoverable and prevent build/save. Applying JSON, saving and building
retain their existing explicit operations.

Generated CJS and recompilable TypeScript, public package descriptors, Blueprint
and real XLSX interchange preserve the complete table and ordered identities.
Direct library construction uses `BoundedVideoSlotSession` with
`{weightedBonus: table}`; it shares the existing rollback, progression, settlement
and RNG owner. `validateWeightedBonus` is also available for data-only checks.
`selectWeightedBonus` is the pure selection boundary for a validated definition
and an existing RNG; it does not execute or settle a feature.

Canonical executable state retains selected table/outcome/model/context,
remaining and executed duration, entry bet, cumulative outcome/completion counts,
pending context and implicit entry counter, alongside the base RNG state.
Restoration validates all of these before changing nested state. Explicit runtime
round IDs define contexts; direct play allocates an implicit paid-entry context.
Continuation reuses that context. Direct callers supplying contexts must use
fresh IDs; active-context replacement and immediate consumed-context reuse reject.
Use `SessionRuntime` or serving commands for retained request idempotency.

Stepwise/composite delivery, durable fresh-handler recovery and direct play use
the same progression. Duplicate commands and delivery-only frames do not draw
or count again. Failed uncommitted steps roll back effects, money, counters and
RNG; committed prefixes remain available for continuation and settle once.
Public network data exposes `boundedMechanics.weightedBonus`; canonical artifacts
retain the corresponding `boundedMechanics` feature event. Public Play/Replay
views show selected table/outcome/context and duration. Exact audit replay binds
that identity and configuration instead of silently resampling tampered state.

## Statistics and boundaries

`weightedBonus` statistics expose configured weight/probability separately from
actual count/frequency. The denominator is eligible selections, never deliveries
or simulation spins. Unobserved and zero-weight outcomes remain distinct.
Session accessors are cumulative; runners subtract the opening snapshot.
`completed` counts features completed in the observed window; `incomplete` is
selections minus completions, explicitly labelled **net of carried tails**.
A negative value means a restored/carried feature completed without being
selected in that window. Adjacent chunk merges reconcile that signed boundary;
logical sampling separately reports carried and unfinished subrounds.

Snapshots, independent workers, merged chunks, cancellation checkpoints, Studio
history/downloads and JSON/Markdown/HTML reports retain these fields. Different
model identities cannot be merged. Each worker owns its own selection state.
Cancelled jobs retain observed prefixes without publishing a completed report.

Supported composition is the undecorated standard-geometry base with its ordinary
lines, ways or clusters evaluator; weighted whole reel sequences remain supported
and maintain separate counters. Other progression owners (`freeGames`, Hold&Win,
cascade/respins/collections), modifiers, jackpot, modes and custom geometry cannot
be combined with this table. Those standalone launch families retain their own
supported workflows. Unsupported combinations reject before build or drawing.

Canonical WASM preserves this selection/payout/duration contract through the shared session runtime. Independent-grid
outcome-library generation and downstream Stake conversion lack an exact
enumeration capability for it and must fail before final publication. Build a
TypeScript package, Blueprint or PAR workbook to preserve these rules.

Arbitrary callbacks, dynamic target selection and opaque wrappers are outside
this finite schema. Packages must retain explicit `PackageModelDescriptor.unsupported`
path/code/reason diagnostics. Inspection keeps unrelated sections available and
does not run a session to guess custom behavior. Existing custom runtime
capabilities remain usable; resemblance to a built-in class does not certify
restoration or exact extraction. Lossy Blueprint publication remains blocked.

### Restoration observation and direct context rule

Restoration binds the selected identity **and** `executed`/`remaining` to the
last accepted observation. Conserving their sum is insufficient: changing
`0/2` to `1/1` against an unchanged entry observation is corrupt state. Explicit
logical delivery checks the last mathematical subround's canonical event;
ordinary delivery checks the retained serialized bounded-mechanic observation
(or full-capture artifact). Retained copies must agree. These checks precede
fresh session creation, RNG advancement and repository/wallet effects.

For direct weighted-bonus sessions, a fresh `implicit:N` request must exceed
the last consumed implicit counter. Thus consuming `implicit:20` then asking
for `implicit:1` rejects before either nested request or state changes. The
next automatic entry is `implicit:21`. Active continuations reuse their entry
context, and pending requests can be captured/restored without drawing.

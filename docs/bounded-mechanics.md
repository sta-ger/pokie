# Authored cascades, respins and collections

`mechanics.cascade`, `mechanics.respins` and `mechanics.collection` are finite
contracts, implemented by `BoundedVideoSlotSession` using the existing slot,
cascade evaluator, grid transformer and runtime command boundaries. The seven
nonempty combinations are listed in `AUTHORED_BOUNDED_MECHANIC_CATALOG` and have
examples in `examples/blueprints/bounded-*.blueprint.json`.

```json
{
  "cascade": {"maxCascades": 10},
  "respins": {
    "trigger": {"symbolId": "C", "minimumCount": 1},
    "grant": 2,
    "retrigger": "reset",
    "maxRespins": 8
  },
  "collection": {
    "symbolId": "C", "contribution": 1, "threshold": 4, "cap": 5,
    "reset": "subtract-threshold", "payout": 10
  }
}
```

## Order and denomination

A paid entry charges the selected bet once. One accepted subround generates its
screen and resolves any cascades. Winning positions are deduplicated before
removal; survivors retain their order. Each refill draws a complete next screen
from the same owned generator and takes the first N symbols from each reel,
where N is that reel's removed count. Weighted whole-sequence selection is held
for the logical round, including refills and respins; reel stops still advance
the seeded RNG. The final losing evaluation is retained as a mathematical step.

After cascading, collection occurs **once per accepted subround**, counting the
collection symbol on the final screen. Intermediate cascade screens do not
contribute. The increment is `count * contribution`; it is added, checked for
finite arithmetic, then capped. If the capped value reaches the threshold,
exactly one configured award is added and the value becomes zero or has one
threshold subtracted, according to `reset`. A carry may remain at/above threshold
when the cap is large; a subsequent accepted subround can trigger again, even
with zero new contribution. There is no loop that repeatedly awards within one
subround. Contribution and payout are nonnegative **wallet currency units**;
threshold/cap use the same units. They never multiply the current bet, so changing
the next paid bet cannot reprice an accumulated balance. Explicit zero awards
and contributions are supported; threshold must be positive and cap >= threshold.

Respins inspect that same final screen after collection. Entry grants `grant`
respins. A continuation executes at zero stake, pays its own evaluated win plus
any collection award immediately, and decrements the remaining count. `none`
ignores continuation triggers. `reset` resets the remaining count to `grant`,
clipped by the unused lifetime budget `maxRespins - executed`. At the lifetime
bound the chain completes successfully with zero remaining respins, even when
the last screen triggers. Grants and executed respins are distinct observations.
Changing the bet during the chain is rejected. There is no retained-cell or
banked terminal-payout variant in this contract.

For example, three C cells contributing 1, threshold 4 and cap 5 produce values
3, 1, 0, 3, 1, 0 with awards 0, 10, 10, 0, 10, 10. The cap discards excess before
the threshold is subtracted. Changing the second bet from 0.05 to 7.5 changes
paytable awards, while the collection award remains 10.

## Bounds and support

| Surface / composition | Support |
| --- | --- |
| Cascade, respins, collection, all combinations with each other | Yes |
| Line, ways, cluster evaluation; literal/generated reels and weighted whole sequences | Yes |
| Standard rectangular geometry, explicit missing/zero payouts, fractional stakes | Yes |
| Free games, Hold & Win, jackpots, bet modes, screen modifiers, nonstandard geometry with these new rules | Rejected before execution |
| Opaque generators, custom evaluator callbacks or config subclasses in the bounded adapter | Rejected; use a custom session with its own complete codec instead |
| Canonical WASM and paid-grid outcome-library / Stake conversion | Rejected before publication |
| Blueprint JSON / guided Studio form, generated CJS/TS, extraction and XLSX PAR | Yes |
| CLI / Studio Play, simulations, report formats/downloads and audit replay | Yes |

`maxCascades` is an integer from 1 through 100 and counts **winning removals**.
A losing evaluation immediately after the last permitted removal completes the
cascade. A further winning evaluation rejects the accepted subround and restores
its RNG, collection and credits; no partial cascade is settled. The lower-level
resolver still offers its explicit `stop` policy for custom callers, which
retains exhausted/incomplete evidence. Authored cascades always use rejection.

`maxRespins` is an integer from 1 through 90; `grant` is in [1, maxRespins]. The
largest authored round contains 91 accepted subrounds and at most 9,191
mathematical deliveries (100 winning cascades plus one terminal evaluation per
subround). This fits the existing 10,000 delivery-retention limit. Composite
execution defaults to a 1,000-advance batch; if still pending, continue with the
returned round ID/cursor through the same command API. Do not submit another
paid entry. Exact retries return their original result; foreign/stale/skipped
cursors and altered selections or identities are rejected before effects.
`SessionRuntime.release()` retires execution and clears owned live delivery data;
durable result stores retain their original historical results.

## State, replay and failure boundaries

The `bounded-mechanics` executable schema owns `value`, `remaining`, `executed`,
`entryBet` and the nested seeded-video-slot snapshot, including resolved reel
selections/RNG. Entire nested state is validated before restoring any component.
Collection value survives completed paid rounds. Calculation/overflow, capture,
serialization and persistence rejection restore the uncommitted subround.
Cancellation before acceptance changes nothing; cancellation during composite
execution retains the accepted prefix and its continuation.

Cascade deliveries are saved mathematical artifacts, not additional calculations
or settlements. Feature observations include meaningful zeros for collection
value/cap/threshold/contribution/trigger/reset/payout, respin progress and cascade
counts. Canonical artifacts and their public projection preserve these in
`boundedMechanics` events. Play, history and artifact-only Replay interpret the
same event. Restoring an executable snapshot does not manufacture a historical
win; durable state/artifacts and original retry results own that historical
output. Reading, serializing, extracting and replaying do not advance a live RNG,
wallet or collection.

Use `SpinCommandHandler` with `SqliteTransactionalRoundStore` for the reference
atomic settlement boundary, or the existing external reconciliation store with
compatible durable wallet ports. File-session restoration also requires
compatible wallet, result and recovery ports: a session JSON file alone does not
make settlement atomic. Studio Play remains process-only; reset starts a new
session. Durable process continuation belongs to public runtime storage, not a
Studio reset.

## Simulation units

Requested rounds and progress count accepted subrounds. For bounded mechanics,
`logicalRoundMetrics` uses completed logical rounds for hit frequency, payout
histograms, maximum payout/frequency, means, variance and confidence/convergence
calculations. `logicalRounds.steps` records accepted subround duration, separately
from cascade mathematical steps and transport deliveries. Reports preserve these
fields with `sampling.unit = completed-logical-round`; `rounds` is completed
logical rounds, `sampling.acceptedSubrounds` is actual accepted plays, and
`excludedSubrounds` identifies observed unfinished or restored tails without a
locally observed paid entry. `carriedSubrounds` identifies a completed sample's
prefix retained from an earlier runner on the same session. Monetary totals/RTP
include all actually observed stakes and payouts, even unfinished tails; means
and distributions include completed samples only.

Recent Simulation replay selects an accepted **subround** from 1 through
`sampling.acceptedSubrounds`; its selector and server guard use this range, while
the report continues to display completed logical-round metrics. Recorded audit
replay can verify an interrupted prefix or a completed logical round. A standalone
collection has no interruptible chain; its audit captures a threshold crossing
from a previously accumulated partial balance.

Snapshots and merges retain logical sample moments without retaining screens or
an array of all outcomes. Chunks reuse one session and its unfinished accounting.
A restored bare executable tail without its observed entry is excluded from
completed-sample metrics. Cancellation errors expose `observedPrefix` statistics;
Studio retains that prefix in the cancelled job. Worker cancellation reports the
last received worker checkpoints, not unobserved work after a checkpoint.
Cancelled jobs remain cancelled, without a completed report or resumable worker.

Each parallel worker has an independent seeded session trajectory: collections
are neither shared nor split between workers. A worker can stop with an
unfinished tail, which is excluded from completed samples. Different worker
counts therefore change trajectories and are not expected to reproduce a
single-session run. Confidence calculations use logical-round sample moments;
collections can correlate successive rounds, so these intervals are descriptive
sample estimates, not a claim of independent rounds or certification.

## Public workflow

Build an example with `pokie build examples/blueprints/bounded-collection.blueprint.json
--target tsPackage --out <new-or-empty-directory>`, then use the existing
`validate`, `sim`, `report`, `replay` and `serve` commands. `pokie` opens Studio
Home; `pokie <project>` opens the Project. Form/JSON edits remain recoverable
drafts until explicit Apply/Save. Building and PAR conversion do not implicitly
save the authored source. Supported intermediate conversions remain owned by
`build SOURCE --target TARGET`; there is no top-level export command.

Library users can construct `BoundedVideoSlotSession(config, seededGenerator,
rules, statelessCalculator)` directly. Generated packages provide matching
configuration hashes, descriptors, serializers and state schemas. Browser users
can import the bounded contracts/session and cascade serializer from
`@fromstan/pokie/browser`. Package extraction reads represented rules without
executing a session. New-only mechanics choose the PAR configuration-JSON sheet;
unknown/duplicate rules and opaque extraction retain explicit diagnostics.

[← Back to docs index](README.md)

# Network Serialization

The `net/` package turns a session's state into plain-data payloads suitable for sending to a game client (e.g. as
JSON over an API). There's no single `serialize(session)` entry point — every serializer exposes exactly two
methods:

```ts
getInitialData(session): <X>InitialNetworkData   // full snapshot — send once, e.g. on session start
getRoundData(session): <X>RoundNetworkData        // just what changes per round — send after every spin
```

## Layering

```
GameSessionSerializer            → GameInitialNetworkData / GameRoundNetworkData
  ↳ VideoSlotSessionSerializer            → + VideoSlot*NetworkData
      ↳ VideoSlotWithFreeGamesSessionSerializer  → + free-games fields
```

Each "WithFreeGames"/"VideoSlot" serializer takes the corresponding base serializer as an injected, defaulted
constructor dependency and **delegates rather than duplicates**: it calls the base serializer's
`getInitialData`/`getRoundData` and spreads the result, adding only its own incremental fields. The DTOs mirror this
with plain TypeScript intersections (`&`) — no field renaming or overriding, purely additive.

## Data shapes

```ts
type GameRoundNetworkData = { credits: number; bet: number };
type GameInitialNetworkData = { availableBets: number[] } & GameRoundNetworkData;

type GameWithFreeGamesRoundNetworkData = {
    freeGamesNum?: number; freeGamesSum?: number; freeGamesBank?: number; wonFreeGamesNumber?: number;
} & GameRoundNetworkData;

type VideoSlotRoundNetworkData = {
    reelsSymbols: string[][];
    totalWin?: number;
    winningPositions?: number[][];
    winningLines?: Record<string, WinningLineNetworkData>;
    winningScatters?: Record<string, WinningScatterNetworkData>;
    winningClusters?: Record<string, WinningClusterNetworkData>;
    winningValues?: Record<string, WinningValueNetworkData>;
    winningWays?: Record<string, WinningWayNetworkData>;
    winEvaluationResult?: WinEvaluationResultNetworkData;
} & GameRoundNetworkData;

type VideoSlotInitialNetworkData = {
    availableSymbols: string[];
    reelsNumber: number;
    reelsSymbolsNumber: number;
    paytable: Record<number, Record<string, Record<number, number>>>;
    linesDefinitions: Record<string, number[]>;
} & GameInitialNetworkData & VideoSlotRoundNetworkData;
```

`WinningLineNetworkData`/`WinningScatterNetworkData`/`WinningClusterNetworkData`/`WinningValueNetworkData`/
`WinningWayNetworkData` are the plain-data mirrors of `WinningLineDescribing`/`WinningScatterDescribing`/
`WinningClusterDescribing`/`WinningValueDescribing`/`WinningWayDescribing` (see
[Paytable & Win Calculation](paytable-and-wins.md)) — same fields, plain data instead of getters.
`WinEvaluationResultNetworkData` is the unified round breakdown for reporting/replay/debug: total win, winning
positions, per-type component arrays, and metadata.
`VideoSlotWithFreeGamesInitialNetworkData`/`VideoSlotWithFreeGamesRoundNetworkData` add no fields of their own —
they're pure type intersections of the video-slot and free-games shapes above.

## What each serializer populates

| Serializer | Adds (round) | Adds (initial, on top of round) |
|---|---|---|
| `GameSessionSerializer` | `credits` ← `getCreditsAmount()`, `bet` ← `getBet()` | `availableBets` ← `getAvailableBets()` |
| `VideoSlotSessionSerializer` | `reelsSymbols` ← `getSymbolsCombination().toMatrix()`; `totalWin`/`winningPositions`/`winEvaluationResult` ← `getWinEvaluationResult()`; legacy `winningLines`/`winningScatters`/`winningClusters`/`winningValues`/`winningWays` are still emitted as non-empty compatibility fields | `availableSymbols`, `reelsNumber`, `reelsSymbolsNumber`, `paytable` ← `getPaytable().toMap()`, `linesDefinitions` (hand-built by iterating `getLinesDefinitions().getLinesIds()`) |
| `VideoSlotWithFreeGamesSessionSerializer` | `freeGamesNum`/`freeGamesSum`/`freeGamesBank` ← `getFreeGamesNum/Sum/Bank()`; `wonFreeGamesNumber` ← `getWonFreeGamesNumber()` | (nothing extra — just base-init ∪ own round data) |

```ts
import {VideoSlotWithFreeGamesSession, VideoSlotWithFreeGamesSessionSerializer} from "@fromstan/pokie";

const session = new VideoSlotWithFreeGamesSession();
session.play();

const serializer = new VideoSlotWithFreeGamesSessionSerializer();

const initialPayload = serializer.getInitialData(session); // send once
const roundPayload = serializer.getRoundData(session);      // send after each spin
```

Example `roundPayload`:

```json
{
  "credits": 10480,
  "bet": 20,
  "reelsSymbols": [["A","K","Q"],["Q","S","10"],["S","A","K"],["J","Q","S"],["K","A","10"]],
  "winningLines": {
    "1": {
      "definition": [1,1,1,1,1], "pattern": [1,1,1,1,1], "symbolId": "A", "lineId": "1",
      "symbolsPositions": [0,0,1], "wildSymbolsPositions": [], "winAmount": 100
    }
  },
  "winningScatters": {
    "S": { "symbolId": "S", "symbolsPositions": [[1,1],[2,0],[3,2]], "winAmount": 200 }
  },
  "freeGamesNum": 0, "freeGamesSum": 3, "freeGamesBank": 0, "wonFreeGamesNumber": 3
}
```

`initialPayload` additionally includes `availableBets`, `availableSymbols`, `reelsNumber`, `reelsSymbolsNumber`,
`paytable`, and `linesDefinitions` (e.g. `{"1": [1,1,1,1,1], "0": [0,0,0,0,0], ...}`).

## Multi-stage rounds

Some mechanics don't fit "one round, one screen, one win" — a cascade (tumble) round replays several
remove-refill steps before settling, a pick-a-prize bonus reveals several picks, a ladder bonus climbs several
levels. `MultiStageRoundSessionSerializer<TSession, TStage, TBaseRoundData, TBaseInitialData>` is the generic
foundation for that shape — **not tied to video slots or cascades specifically**:

```ts
type MultiStageRoundNetworkData<TStage = unknown> = {
    stages: TStage[];
};

abstract class MultiStageRoundSessionSerializer<TSession, TStage, TBaseRoundData, TBaseInitialData> {
    constructor(baseSerializer: {getInitialData(session): TBaseInitialData; getRoundData(session): TBaseRoundData});

    getInitialData(session: TSession): TBaseInitialData & MultiStageRoundNetworkData<TStage>;
    getRoundData(session: TSession): TBaseRoundData & MultiStageRoundNetworkData<TStage>;

    protected abstract getStages(session: TSession): TStage[];
}
```

Same "inject a defaulted base serializer, spread its output" convention as every other serializer in this
chain — it just also attaches `stages`, computed by whatever `getStages()` a concrete mechanic implements. A
third-party game defines its own `TStage` shape and subclasses this directly for a mechanic this framework has
never heard of (a pick bonus, a ladder, ...) without changing anything in `pokie` itself.

### Cascading games

`CascadeSessionSerializer<T>` is the ready-made `MultiStageRoundSessionSerializer` for cascade/tumble mechanics,
built on top of `VideoSlotSessionSerializer`. There's no built-in "cascade session" class in this framework —
`CascadingSpinResolver` (see [Paytable & Win Calculation](paytable-and-wins.md)) is a reusable utility a *custom*
session wires into its own `play()`, keeping the resulting `CascadeResult`. The entire integration surface is one
optional, feature-detected interface:

```ts
interface CascadeResultProviding<T = string> {
    getCascadeResult(): CascadeResult<T>;
}
```

Any session implementing `VideoSlotSessionHandling<T> & CascadeResultProviding<T>` works with
`CascadeSessionSerializer` as-is:

```ts
import {CascadeSessionSerializer} from "@fromstan/pokie";

const serializer = new CascadeSessionSerializer();
const roundPayload = serializer.getRoundData(session); // session implements CascadeResultProviding
```

```ts
type CascadeStepNetworkData<T = string> = {
    screen: T[][];                                  // grid before this step's removals
    winEvaluationResult: WinEvaluationResultNetworkData<T>;
    removedPositions: number[][];
    refillSymbols: T[][];
    metadata: Record<string, unknown>;
    rngInfo: Record<string, unknown>;
    debugInfo: Record<string, unknown>;
};

type CascadeRoundNetworkData<T = string> = {
    initialScreen: T[][];
    finalScreen: T[][];
    totalCascadeWin: number;
    cascadeMetadata: Record<string, unknown>;
    cascadeRngInfo: Record<string, unknown>;
    cascadeDebugInfo: Record<string, unknown>;
} & VideoSlotRoundNetworkData<T> & MultiStageRoundNetworkData<CascadeStepNetworkData<T>>;
```

Example `roundPayload` for a two-step cascade:

```json
{
  "credits": 995, "bet": 5,
  "reelsSymbols": [["K","A","A"],["Q","K","Q"],["J","K","Q"]],
  "totalWin": 45,
  "initialScreen": [["A","A","A"],["A","K","Q"],["A","K","Q"]],
  "finalScreen": [["K","A","A"],["Q","K","Q"],["J","K","Q"]],
  "totalCascadeWin": 45,
  "cascadeMetadata": {"totalSteps": 1}, "cascadeRngInfo": {}, "cascadeDebugInfo": {"cascadeStepCount": 1},
  "stages": [
    {
      "screen": [["A","A","A"],["A","K","Q"],["A","K","Q"]],
      "winEvaluationResult": {"totalWin": 45, "winningPositions": [[0,0],[0,1],[0,2],[1,0],[2,0]], "lineWins": [], "scatterWins": [], "clusterWins": [], "valueWins": [], "waysWins": [], "metadata": {}},
      "removedPositions": [[0,0],[0,1],[0,2],[1,0],[2,0]],
      "refillSymbols": [["K"],["Q"],["J"]],
      "metadata": {"cascadeStepIndex": 0}, "rngInfo": {}, "debugInfo": {"multiplierBreakdown": []}
    }
  ]
}
```

`stages` is an **empty array, not omitted**, for a round with no cascades — a client can always safely check
`stages.length` without a presence check first.

## Internal/debug data (`getInitialDebugData`/`getRoundDebugData`)

Everything documented above — `getInitialData()`/`getRoundData()`'s output, on every serializer in this file — is
**public, client-safe data**: it's what `pokie serve` sends by default (see
[`pokie serve` → Public vs. internal/debug responses](cli.md#public-vs-internal-debug-responses)). `GameSessionSerializing`
additionally has two optional, feature-detected methods for data that should never reach a client by default —
RNG seeds, individual reel stops, evaluator traces, anything worth inspecting locally but not worth shipping:

```ts
export interface GameSessionSerializing {
    getInitialData(session): GameInitialNetworkData;
    getRoundData(session): GameRoundNetworkData;
    getInitialDebugData?(session): Record<string, unknown>;
    getRoundDebugData?(session): Record<string, unknown>;
}
```

Neither is implemented by any serializer this package ships (`GameSessionSerializer`, `VideoSlotSessionSerializer`,
`VideoSlotWithFreeGamesSessionSerializer`, `CascadeSessionSerializer`) — implementing them is entirely opt-in for a
custom serializer:

```ts
class MySessionSerializer extends VideoSlotSessionSerializer {
    override getRoundDebugData(session: MySession): Record<string, unknown> {
        return {rngSeed: session.getLastRngSeed(), reelStops: session.getLastReelStops()};
    }
}
```

`pokie serve` captures whatever these return the same way it captures `getInitialData()`/`getRoundData()`'s own
output (see `captureInitialPokieSessionState`/`captureRoundPokieSessionState`), but only ever surfaces it under a
response's `internal.debugData` — and only when a request explicitly asks for it (`?debug=1`). It is never merged
into the public response, regardless of what a serializer's own `getInitialData()`/`getRoundData()` output already
contains.

## Notes

- **`winningLines`/`winningScatters`/`winningClusters`/`winningValues`/`winningWays` are genuinely conditional** —
  omitted entirely from the payload when there are no wins of that kind (not present as empty objects).
- **`winEvaluationResult` is the preferred consumer-facing payload** for runtime/replay/reporting. The legacy
  `winningLines`/`winningScatters`/`winningClusters`/`winningValues`/`winningWays` fields remain for compatibility.
- **Legacy custom calculators remain serializable.** If a session is backed by an older calculator without
  `getWinEvaluationResult()`, the session adapts its legacy total so `totalWin` and `winEvaluationResult.totalWin`
  still reflect the real win amount.
- **The free-games round fields are typed optional (`?`) but always populated** by the concrete
  `VideoSlotWithFreeGamesSessionSerializer` — the optionality exists because the underlying interface is meant to be
  reusable by non-video-slot free-games mechanics too.
- **Winning-entry payloads duplicate their own key** (e.g. `winningLines["1"].lineId === "1"`) — convenient for
  clients that flatten/iterate the values without needing the parent key, at the cost of redundancy.
- **`linesDefinitions`/`paytable` are initial-only** — cache them from `getInitialData` on session start; they're
  never repeated in `getRoundData`.
- **`CascadeSessionSerializer`'s `rngInfo`/`debugInfo`/`cascadeRngInfo`/`cascadeDebugInfo` fields are still part of
  the *public* payload**, despite their names — they're plain fields on `getRoundData()`/`getInitialData()`'s own
  output (populated from `CascadeResult`/`CascadeStep`'s own optional constructor arguments, which default to `{}`
  when a session never populates them), not the new opt-in [internal/debug
  data](#internaldebug-data-getinitialdebugdatagetrounddebugdata) above. A cascade-based game that wants to keep
  genuinely internal data (an actual RNG seed, say) out of the public response should populate it via the new
  `getInitialDebugData`/`getRoundDebugData` hooks instead of `CascadeResult`'s `rngInfo`/`debugInfo` constructor
  arguments.

## Executable repository records

Storage `version` is an optimistic revision, independent of `identity.gameId`, `compatibilityVersion`,
`stateSchemaVersion` and optional `modelHash`. Generated definitions expose their authoritative blueprint
hash. Hand-authored definitions use their manifest id/version, or explicitly declare
`getSessionCompatibility(): {version, stateSchemaVersion}`. This is the author's compatibility promise,
not an invented hash of arbitrary code. Change it whenever math, construction context or the codec changes.
The default compatibility schema version is `"1"`. The selected game must declare
`PokieGame.getSessionStateSchema()` without constructing a session. Persisted `stateSchema` records that
composition but cannot choose the validator. Built-in schemas check required RNG, resolved reel strips and
nested base fields before construction; a seeded schema can also declare `reels` and `symbols` to validate
model dimensions and the symbol alphabet. Generated games declare these constraints from their blueprint.
Custom schemas require the selected game's nonmutating `validateSessionState(state, context)`; a missing
validator rejects even if the record claims `{kind: "custom"}`. Records without identity are rejected as `incompatible-state`;
this workflow does not migrate historical snapshots or silently reset them.
`getSessionCommandCapabilities(context)` additionally declares the supported model selections without
construction or RNG draws. Repository validation uses this declaration or process-local authority
captured from a trusted primed session, including for HTTP reads, cached results and direct reconciliation.
Persisted capability lists may restrict the trusted set but may never expand it; the current bet and captured
mode must belong to those lists. Each subsequent round retains the validated lists in persisted, cached
and captured recovery snapshots; successful play and recovery never broaden them back to model capabilities.
A record claiming durable recovery without declarations is `incompatible-state`;
a live-only record without retained authority is `restoration-unsupported`. Forged selections are
`corrupt-state`. Existing `getManifest()`/`createSession()` packages remain playable through their primed
live session without adding methods. Initial capture marks them `live-only` when either declaration is
absent; trusted live schema checks never authorize reconstruction. Initial creation and direct session
callers retain their constructor defaults.

Capture initial state with the game as the fifth argument to `captureInitialPokieSessionState`. The record
owns the construction context (including numeric versus string seeds), resolved model identity, nominal bet,
settled balance, command capabilities, and `featureState`. The wallet remains authoritative for the
balance used during real settlement. `featureState` contains private executable RNG/counter/bank/mode state
and the actual resolved reel strips. Restoring a seeded built-in session replaces constructor-generated
reels with those strips, then restores the RNG. Other model settings are reconstructed by the game's
compatible factory; custom stateful configurations require their own complete codec.
`screen`, `win`, `initialPayload` and `roundPayload` own the last observable snapshot separately from a newly
constructed display screen. Reconstruct once, restore the recorded post-constructor RNG before the next
round, and never replay earlier rounds. Public serializers do not expose `featureState` or private RNG state.

| Composition | Automatic durable restoration |
| --- | --- |
| Plain `GameSession` with supported resolved config and `NoWinAmount` | Complete base bet/credits, empty codec |
| `VideoSlotSession` with built-in seeded generator bound to its config, stateless calculator and base session | Resolved JSON symbol reels, seeded RNG, bet and credits |
| Built-in free-games decorator around that session | Nested resolved reels/RNG, counters, bank and last grant |
| Built-in bet-mode decorator around a supported base | Nested base and selected mode |
| Default Math.random, secure/custom generators, other decorators, stateful injected collaborators | Live-only unless a custom complete codec explicitly opts in |

`SessionStateRestoring.isSessionStateRestorable()` is an explicit promise of a complete codec, together with
`toSessionState()`, `fromSessionState()` and nonmutating `validateSessionState(state)`. Method presence alone makes no durability claim. A custom codec
must validate its opaque JSON payload and required nested fields and restore the resolved model and every
collaborator that affects future rounds. Declare the authoritative schema on the game and additionally expose
`PokieGame.validateSessionState(state, context)` for nonmutating validation before construction/recovery. Subclasses
and custom decorators must make their own complete-state promise; inheriting an incomplete base codec is
insufficient. A game without a game-level schema declaration remains playable with a primed live session,
but its new captures are `live-only`. Seeded base state requires both its RNG snapshot and resolved reels;
free and mode state require nested base state. Unserializable symbols and generators bound to another
configuration do not receive the built-in restoration promise. Automatic configuration certification
requires exact built-in `GameSessionConfig`, `VideoSlotConfig` or `VideoSlotWithFreeGamesConfig` compositions,
with built-in paytables, paylines/patterns and resolved symbol sequences. It checks the outer free-game
configuration as well as its base. Built-in line/scatter/cluster/ways calculators must use the session's
certified configuration; class identity alone does not certify their injected dependencies. Custom paytables,
configuration subclasses and calculators with untracked value maps or callbacks stay live-only. Their
live execution and injection semantics remain available. A complete custom session codec can explicitly
capture these collaborators' state, validate it through the selected game and restore it before the next round.
Invalid counters, nonfinite/negative banks and invalid seeded RNG snapshots are rejected.

Partial state requires the selected game's explicit `validateLiveSessionState` policy; the marker alone does
not relax required fields or schema matching. Generated/scaffolded policies require complete RNG/reels when
a seed is supplied and allow a partial object for unseeded play. Built-in video-slot partial state is an object
that may omit RNG/reels together (an unseeded capture is `{}`), while any fields present remain validated
against the selected schema. Free-game and bet-mode envelopes still require their counters/selection and
nested base object. An absent built-in feature snapshot is corrupt. Custom state always invokes the game's
validator, including when absent. A game may explicitly provide `validateLiveSessionState(state, context)`
for its partial snapshot; otherwise `validateSessionState` applies. Neither a partial snapshot nor a
live-only marker authorizes reconstruction. Games without an executable codec can retain observable-only
live records with schema and command authority captured from their trusted primed object, plus structural
snapshot checks. A trusted built-in session with a complete codec still requires complete snapshot fields;
only an unsupported live collaborator permits the built-in partial policy. With declared command authority,
completed retries can also recover without the live
object. Without that declaration, losing the object rejects retries as well as new rounds before recovery
writes. New rounds after loss of unsupported live state remain unsupported.

Versioned caches bind to both the committed revision and detached record bytes. Alternating handlers
reconstruct after another writer advances the record. In-memory repositories and retry results detach
values on read and write, so caller mutation is not a save. File records distinguish absence (ENOENT),
malformed JSON/envelopes/semantic state (`SessionStateCorruptError`) and operational reads
(`SessionStateReadError`). File atomic replacement does not add cross-process locking.

Stable command outcomes are `invalid-command`, `incompatible-state`, `corrupt-state`, `not-found`,
`restoration-unsupported`, `storage-error`, `settlement-error`, `execution-error`, `conflict`, `blocked` and `recovery-required`. `played` is published
only after persistence. Corruption/incompatibility require operator repair or explicitly starting another
session; clients retain the last settled view and never automatically reset or retry those failures.
Current state, both snapshots and scalar fields of cached results, and captured recovery results all pass
these checks before publication or reconciliation writes. A validated already-computed live-only operation
can recover from its retained operation log without constructing or playing a session. A new round after
loss of that live object still returns `restoration-unsupported`. Direct `SpinReconciliationService` callers
must supply the selected game as the final constructor argument; omitting it requires manual recovery.
This does not grant reconciliation ownership or replace durable wallet settlement proof.

Durable game-state recovery alone does not preserve the default in-memory wallet, idempotency store,
operation log or Studio active-session registry across a process restart.

Trusted live snapshot validation distinguishes missing custom captures from required built-in children.
It derives this distinction from constructed composition, never from a stored schema, capability list
or `executionState` flag. Opaque legacy custom captures remain finite serializable data; they are not
durable codecs. Free-game counters, banks and nested built-in snapshots remain required. Every retained
bet-mode node is checked against the selected game's declared modes or that live node's trusted modes,
including current state and both states of cached/captured results, before publication or recovery writes.

The trusted composition policy follows constructed children across the public ESM and CommonJS
module instances; constructor identity in the host is not composition authority. An injected RNG
whose capture is finite opaque data can continue in its primed live session without adopting the
built-in seeded numeric codec. This does not certify reconstruction: loss of live authority refuses
new commands and undeclared-codec recovery before construction or recovery writes. Complete seeded
children and declared codecs retain their existing strict validation. At each retained built-in mode
node, the selected mode must also satisfy any applicable validated stored capability restriction.

The plain built-in `GameSession` retains its strict empty executable codec. Existing subclasses with
`toSessionState(): {round: number}` and `fromSessionState(state: {round: number}): this` keep those
signatures through the public ESM/CJS declarations. An inherited base codec does not describe their
custom state: without an explicit complete codec they capture a custom, opaque, live-only snapshot.
An unchanged package can play that subclass through direct execution, primed repository commands,
HTTP and Studio without new declarations. Losing its trusted live state refuses reconstruction and
undeclared-codec recovery before construction or recovery writes.

## Generated, visible and evaluated coordinates

Viewport presentation and required internal coordinate evidence: see [the coordinate contract and adapter support matrix](v2-completion/V2C-03.md).

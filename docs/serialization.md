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
import {VideoSlotWithFreeGamesSession, VideoSlotWithFreeGamesSessionSerializer} from "pokie";

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
import {CascadeSessionSerializer} from "pokie";

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

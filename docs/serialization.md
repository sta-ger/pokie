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
    winningLines?: Record<string, WinningLineNetworkData>;
    winningScatters?: Record<string, WinningScatterNetworkData>;
    winningClusters?: Record<string, WinningClusterNetworkData>;
    winningValues?: Record<string, WinningValueNetworkData>;
    winningWays?: Record<string, WinningWayNetworkData>;
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
`VideoSlotWithFreeGamesInitialNetworkData`/`RoundNetworkData` add no fields of their own — they're pure type
intersections of the video-slot and free-games shapes above.

## What each serializer populates

| Serializer | Adds (round) | Adds (initial, on top of round) |
|---|---|---|
| `GameSessionSerializer` | `credits` ← `getCreditsAmount()`, `bet` ← `getBet()` | `availableBets` ← `getAvailableBets()` |
| `VideoSlotSessionSerializer` | `reelsSymbols` ← `getSymbolsCombination().toMatrix()`; `winningLines`/`winningScatters` ← `getWinningLines()`/`getWinningScatters()`, **only added if non-empty**; `winningClusters`/`winningValues`/`winningWays` ← `session.getWinningClusters?.()` etc., same non-empty rule — **but stock `VideoSlotSession` never implements these three optional methods**, so they're omitted even when cluster/value/ways calculators are wired into the win calculator, unless you serialize a session that forwards them (see below) | `availableSymbols`, `reelsNumber`, `reelsSymbolsNumber`, `paytable` ← `getPaytable().toMap()`, `linesDefinitions` (hand-built by iterating `getLinesDefinitions().getLinesIds()`) |
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

## Notes

- **`winningLines`/`winningScatters`/`winningClusters`/`winningValues`/`winningWays` are genuinely conditional** —
  omitted entirely from the payload when there are no wins of that kind (not present as empty objects).
- **`winningClusters`/`winningValues`/`winningWays` need a session that implements the corresponding optional
  getter.** Stock `VideoSlotSession` doesn't, regardless of what's wired into its `VideoSlotWinCalculator` — see
  [Paytable & Win Calculation](paytable-and-wins.md#reading-clustervalueways-results-from-a-session) for the
  decorator pattern that makes these three fields actually appear in the payload.
- **The free-games round fields are typed optional (`?`) but always populated** by the concrete
  `VideoSlotWithFreeGamesSessionSerializer` — the optionality exists because the underlying interface is meant to be
  reusable by non-video-slot free-games games too.
- **Winning-entry payloads duplicate their own key** (e.g. `winningLines["1"].lineId === "1"`) — convenient for
  clients that flatten/iterate the values without needing the parent key, at the cost of redundancy.
- **`linesDefinitions`/`paytable` are initial-only** — cache them from `getInitialData` on session start; they're
  never repeated in `getRoundData`.

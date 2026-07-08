[← Back to docs index](README.md)

# Resizable Grid

For features where the grid's shape is persistent state that changes based on round outcomes rather than being
redrawn randomly every spin — e.g. a feature that grows the grid by one row per win, or resets it after a bonus.
Contrast with [`VariableHeightSymbolsCombinationsGenerator`](reels-and-sequences.md#variableheightsymbolscombinationsgenerator-a-random-height-every-round),
which redraws a random height every round instead of persisting an explicit one.

## `GridResizeHandling`

```ts
interface GridResizeHandling<T = string> {
    getNextReelsHeights(session: VideoSlotSessionHandling<T>, currentHeights: number[]): number[];
}
```

What "the grid resizes" means for a given game — grow every round, grow only after a loss, shrink back after a
bonus, resize based on a collected token count, stay fixed — is entirely up to your implementation. There is no
default implementation shipped: returning `currentHeights` unchanged is the no-op case. Implement this yourself and
inject it into `VideoSlotWithResizableGridSession`.

## `VideoSlotWithResizableGridSession`

Wraps a session built around a `ResizableSymbolsCombinationsGenerator` and, after each round, asks the injected
`GridResizeHandling` what the next round's per-reel heights should be.

```ts
constructor(
    baseSession: VideoSlotSessionHandling<T>,
    generator: ResizableSymbolsCombinationsGenerator<T>,
    gridResizeHandling: GridResizeHandling<T>,
)

play(): void                        // plays baseSession, then applies gridResizeHandling's result to generator
getReelsHeights(): number[]         // current per-reel heights
```

The **same** `ResizableSymbolsCombinationsGenerator` instance must be passed to both the base session's construction
and here — mirrors how `VideoSlotWithFreeGamesSession` shares its `combinationsGenerator`/`winCalculator` with its
`baseSession`. `getReelsHeights` isn't part of `VideoSlotSessionHandling` — callers already hold this concrete type,
since they had to construct the shared generator themselves.

A resize only takes effect starting from the round *after* the one that triggered it — `play()` applies the base
session's round first, then computes and stores the next heights.

```ts
import {
    GridResizeHandling,
    ResizableSymbolsCombinationsGenerator,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotWinCalculator,
    VideoSlotWithResizableGridSession,
} from "pokie";

const config = new VideoSlotConfig();
config.setReelsNumber(5);

const generator = new ResizableSymbolsCombinationsGenerator(config, [3, 3, 3, 3, 3]); // start at 3 rows each
const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

const growOnWin: GridResizeHandling = {
    getNextReelsHeights: (session, currentHeights) =>
        session.getWinAmount() > 0 ? currentHeights.map((h) => Math.min(h + 1, 7)) : currentHeights,
};

const session = new VideoSlotWithResizableGridSession(baseSession, generator, growOnWin);

session.play();
session.getReelsHeights(); // [4,4,4,4,4] if the first round won, unchanged otherwise
```

See [Extension Points](extension-points.md) for `AbstractVideoSlotSessionDecorator`, the base
`VideoSlotWithResizableGridSession` itself extends, if you need to wrap a session with additional behavior of your
own on top of grid resizing.

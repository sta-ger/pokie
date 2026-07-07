[← Back to docs index](README.md)

# Paylines & Line Patterns

Two independent concerns combine to decide whether a payline wins:

- **Line definition** (`LinesDefinitionsDescribing`) — a **shape on the grid**: one row index per reel, e.g.
  `[1,1,1,1,1]` for the flat middle row, or `[0,1,2,1,0]` for a V-shape. Keyed by a `lineId` (string).
- **Line pattern** (`LinesPatternsDescribing`) — a **0/1 mask over reel columns**, e.g. `[1,1,1,0,0]`. Given the
  symbols a definition picked out along a line, the pattern says which columns must match for that to count as a
  win — anchored left, anchored right, or scattered anywhere.

The same pattern set is tried against every line definition in a config — definitions describe geometry, patterns
describe matching/direction rules. See [Paytable & Win Calculation](paytable-and-wins.md) for exactly how they
combine during `calculateWin`.

## Line definitions

```ts
interface LinesDefinitionsDescribing {
    getLineDefinition(lineId: string): number[];
    getLinesIds(): string[];
}
```

- **`HorizontalLines(reelsNumber, reelsSymbolsNumber)`** — auto-generates one flat-row definition per row
  (`definitions[y] = [y, y, ..., y]`). **Special case:** if `reelsSymbolsNumber === 3`, rows 0 and 1 are swapped
  after generation, so line id `"0"` is the **middle** row and `"1"` is the **top** row (classic slot convention
  where "line 1" runs through the middle). For any other row count, line ids map straight to row index.
- **`CustomLinesDefinitions`** — hand-authored paylines:
  ```ts
  setLineDefinition(lineId: string, definition: number[]): this  // chainable
  getLineDefinition(lineId: string): number[]                    // [] if unset
  getLinesIds(): string[]
  fromMap(map: Record<string, number[]>): this   // deep-cloned in
  toMap(): Record<string, number[]>              // deep-cloned out
  ```
- **`LinesDefinitionsFor3x3` / `LinesDefinitionsFor5x3` / `LinesDefinitionsFor5x4`** — static preset tables (not
  parametrized generators) of commonly-seen payline layouts: 11, 25, and 16 lines respectively, built from
  recognizable shape families (flat, V, M/W arch, staircase, zigzag, notch). These aren't a single official industry
  spec — every real provider ships their own table — but `LinesDefinitionsFor5x3` in particular follows the
  widely-circulated "standard 20/25-line" reference used across countless real 5×3 games, extended with a few
  asymmetric half-staircase lines (common once a game goes past ~20 lines). `LinesDefinitionsFor3x3` is actually
  *complete* for its grid: with only 3 reels, it contains every symmetric (mirror-image) line shape possible — 3
  flat + 2 full diagonals + all 6 single-reel notch variants — there's nothing sensible left to add.
  `LinesDefinitionsFor5x4` follows the same shape families as the 5×3 table, but a V spanning all 4 rows can't
  physically fit in 5 reels (2 steps each side of center only reaches 2 rows away), so its V/staircase shapes split
  into "3-of-4-rows" and "all-4-rows" variants — the full-grid staircases only became possible to add for that
  reason. Use these when your grid size matches exactly; otherwise use `HorizontalLines` or `CustomLinesDefinitions`.
- **`WaysDefinitions(reelsNumber, reelsSymbolsNumber)`** — models "ways to win" instead of fixed paylines: every
  possible row combination across reels counts as a line (a symbol anywhere in each reel matches). Line ids here are
  just array indices, not meaningful identifiers, and the definition count is `reelsSymbolsNumber ** reelsNumber`
  (e.g. 4 rows × 5 reels = 1024 — the classic "1024 ways" games). Pair with `LeftToRightLinesPatterns` for the usual
  ways convention (match from reel 1). Watch the combinatorial growth for larger grids.

```ts
import {CustomLinesDefinitions} from "pokie";

const lines = new CustomLinesDefinitions()
    .setLineDefinition("0", [1, 1, 1, 1, 1])  // straight middle line
    .setLineDefinition("1", [0, 1, 2, 1, 0]); // V shape
```

## Line patterns

```ts
interface LinesPatternsDescribing { toArray(): number[][]; }
```

- **`LeftToRightLinesPatterns(reelsNumber, minimumWinningSymbols = 2)`** — contiguous runs anchored to reel 1,
  longest-first. For `reelsNumber=5`: `[1,1,1,1,1] → [1,1,1,1,0] → [1,1,1,0,0] → [1,1,0,0,0]`.
- **`RightToLeftLinesPatterns(reelsNumber, minimumWinningSymbols = 2)`** — same idea, mirrored, anchored to the last
  reel.
- **`ScatteredLinesPatterns(size, minimumWinningSymbols = 2)`** — symbols can match anywhere on the line, in any
  position, as long as at least `minimumWinningSymbols` positions match. Generates all `2^size` binary masks and
  keeps those with enough 1s set.

`minimumWinningSymbols` defaults to `2` for all three — but the *effective* minimum-to-win also depends on which
counts your `Paytable` actually has payouts for (see [Paytable & Win Calculation](paytable-and-wins.md)); changing
one without the other can silently shift what counts as a win.

```ts
import {LeftToRightLinesPatterns} from "pokie";

new LeftToRightLinesPatterns(5).toArray();
// [[1,1,1,1,1],[1,1,1,1,0],[1,1,1,0,0],[1,1,0,0,0]]
```

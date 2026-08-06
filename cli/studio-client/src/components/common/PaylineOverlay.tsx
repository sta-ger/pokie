import type {RoundArtifactWin} from "../../api/types";
import {ScreenTable} from "./ScreenTable";

// A "line" win's own metadata bag (see src/session/videoslot/winevaluation/LineWinComponent.ts) carries
// "definition" -- the winning line's own full row-per-reel shape (WinningLineDescribing.getDefinition()),
// i.e. the whole configured payline the win evaluator matched against, not just the reels that actually
// matched (that subset is what winningPositions -- see WinningPositionsOverlay -- already covers).
// RoundArtifactWin.metadata carries no discriminated type client-side (same untyped bag every metadata
// read in this client works from -- see RoundWinsTable's own STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY
// convention), so this only ever trusts a "definition" that's actually shaped like one: an array with
// exactly one row index per reel on this screen. Anything else -- absent (every non-"line" win type: ways,
// cluster, scatter, value, jackpot, legacy, a Stake Engine import's synthetic aggregate), malformed, or
// sized for a different reel count -- falls back to "no path for this win", never a fabricated line.
function resolveLineDefinition(win: RoundArtifactWin, reelCount: number): readonly number[] | undefined {
    const raw = win.metadata["definition"];
    if (!Array.isArray(raw) || raw.length !== reelCount || !raw.every((row) => typeof row === "number")) {
        return undefined;
    }
    return raw;
}

// Every reel/row cell any win's own full payline definition passes through -- a superset of that same
// win's winningPositions whenever the line's matched run is shorter than the whole configured line (e.g.
// a wild-assisted 3-of-5 match still defines a 5-reel line).
export function resolvePaylinePositions(wins: readonly RoundArtifactWin[] | undefined, reelCount: number): readonly (readonly number[])[] {
    if (!wins) {
        return [];
    }
    return wins.flatMap((win) => {
        const definition = resolveLineDefinition(win, reelCount);
        return definition ? definition.map((row, reelIndex): readonly number[] => [reelIndex, row]) : [];
    });
}

// The shared "screen, with whatever configured payline(s) a step's line win(s) matched against traced
// out" overlay -- a thin wrapper over ScreenTable, same shape as WinningPositionsOverlay but for the
// line's own full path rather than just the cells that won. Renders the plain grid, with nothing traced,
// when none of `wins` is a "line" win carrying a usable definition -- most win models (ways, clusters,
// scatter) never have one, and that's not a diagnostic gap, just a different win shape. See WinOverlay for
// the composite that layers this alongside WinningPositionsOverlay on one shared grid.
export function PaylineOverlay({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return <ScreenTable screen={screen} paylinePositions={resolvePaylinePositions(wins, screen.length)} />;
}

import type {RoundArtifactWin} from "../../api/types";
import {ScreenTable} from "./ScreenTable";

// Union of every position a round/step's own wins actually landed on -- straight from
// RoundArtifactWin.winningPositions (already computed server-side by the game's own win evaluation, never
// re-derived here) -- an aggregate win (see RoundArtifactInspector's own isAggregateWin) contributes no
// positions at all, which is exactly right: there's nothing on the screen to point at for one.
function collectWinningPositions(wins: readonly RoundArtifactWin[] | undefined): readonly (readonly number[])[] {
    return wins ? wins.flatMap((win) => win.winningPositions) : [];
}

// The shared "screen, with whatever won on it highlighted" presentation every round-inspection surface
// (Replay, Session Spin, an Outcome Source draw) renders a round's screen through -- a thin wrapper over
// ScreenTable that resolves the win-position overlay from the round/step's own wins, so every consumer
// gets the same highlighting for free instead of each re-deriving or omitting it. `wins` is optional: a
// non-artifact Runtime round (see RoundSummary's own fallback) or a Replay "find a round" candidate has a
// screen but no per-position win detail at all, so this renders the same plain grid ScreenTable always
// has for that case -- never a fabricated highlight.
export function GameScreenView({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return <ScreenTable screen={screen} highlightedPositions={collectWinningPositions(wins)} />;
}

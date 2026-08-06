import type {RoundArtifactWin} from "../../api/types";
import {resolvePaylinePositions} from "./PaylineOverlay";
import {ScreenTable} from "./ScreenTable";
import {resolveWinningPositions} from "./WinningPositionsOverlay";

// The shared "screen, with every win-derived overlay this round/step's own wins actually support"
// presentation every round-inspection surface (Replay, Session Spin, an Outcome Source draw) renders a
// round's screen through -- see GameScreenView, its own thin public alias. Composes
// WinningPositionsOverlay's own resolver (which cells actually won) and PaylineOverlay's own resolver
// (which cells a matched line's full configured path passes through) onto a single ScreenTable render,
// rather than mounting either overlay's own standalone component twice over the same grid -- both overlays
// read straight off the round/step's own RoundArtifactWin data, never deriving a position or a payline
// shape that isn't already present on a win.
export function WinOverlay({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return (
        <ScreenTable
            screen={screen}
            highlightedPositions={resolveWinningPositions(wins)}
            paylinePositions={resolvePaylinePositions(wins, screen.length)}
        />
    );
}

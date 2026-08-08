import {deriveWinHighlightsFromRoundArtifactWins} from "../../../../client/player/videoSlotRoundView";
import type {RoundArtifactWin} from "../../api/types";
import {ScreenTable} from "./ScreenTable";

// The shared "screen, with every win-derived overlay this round/step's own wins actually support"
// presentation every round-inspection surface (Play, Replay, sampled rounds, Outcome Library) renders a
// round's screen through -- see GameScreenView, its own thin public alias. Resolves which cells actually
// won and which cells a matched line's full configured path passes through via
// deriveWinHighlightsFromRoundArtifactWins -- the exact same win-highlight contract
// cli/client/player's own applyPersistentHighlights/renderWinHighlightsList render VideoSlot's own
// response-derived highlights from (see that module's own doc comment), so Studio's RoundArtifact wins
// and cli/client's/pokie-examples' VideoSlotRoundResponse wins are both adapted onto one shared
// presentation rather than each having its own independent "what's highlighted" derivation. Never derives
// a position or a payline shape that isn't already present on a win.
export function WinOverlay({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    const highlights = deriveWinHighlightsFromRoundArtifactWins(wins ?? [], screen.length);
    return (
        <ScreenTable
            screen={screen}
            highlightedPositions={highlights.flatMap((highlight) => highlight.positions)}
            paylinePositions={highlights.flatMap((highlight) => highlight.paylinePositions ?? [])}
        />
    );
}

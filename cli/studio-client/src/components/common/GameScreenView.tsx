import type {RoundArtifactWin} from "../../api/types";
import {WinOverlay} from "./WinOverlay";

// The shared "screen, with whatever won on it highlighted" presentation every round-inspection surface
// (Play, Replay -- recorded/recreated/simulation-sampled rounds -- Runtime Session Tools, an Outcome
// Source draw) renders a round's screen through -- a thin public alias for WinOverlay (which composes
// WinningPositionsOverlay's win-position highlight and PaylineOverlay's matched-line path onto one shared
// grid), kept under its own established name since every existing caller already imports
// "GameScreenView" for exactly this "screen, with wins" contract. This is Studio's own canonical player:
// the counterpart to cli/client/player (used by cli/client/main.ts and pokie-examples) for the one thing
// that's genuinely different here -- RoundArtifact is a game-generic shape (any win type, any game),
// where cli/client/player's own VideoSlotRoundResponse is one game family's specific wire format -- see
// cli/client/player/index.ts's own doc comment for why that keeps them two canonical players, not one
// with a gap. Kept singular within Studio itself: every one of the surfaces above renders through this
// exact component, never a page-local re-presentation of the same screen/win data -- proven by
// RoundArtifactInspector.test.tsx's own "Cross-surface round presentation parity" suite (component-level)
// and ProjectDashboardPage.playWorkflow.test.tsx's own "canonical player parity" suite (through Play's
// real session/spin workflow).
export function GameScreenView({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return <WinOverlay screen={screen} wins={wins} />;
}

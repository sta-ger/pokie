import type {RoundArtifactWin} from "../../api/types";
import {WinOverlay} from "./WinOverlay";

// The shared "screen, with whatever won on it highlighted" presentation every round-inspection surface
// (Play, Replay -- recorded/recreated/simulation-sampled rounds -- Runtime Session Tools, an Outcome
// Source draw) renders a round's screen through -- a thin public alias for WinOverlay, kept under its own
// established name since every existing caller already imports "GameScreenView" for exactly this "screen,
// with wins" contract. WinOverlay itself resolves what's highlighted via
// cli/client/player's own deriveWinHighlightsFromRoundArtifactWins -- the same shared win-highlight
// presentation cli/client/main.ts and pokie-examples render a VideoSlotRoundResponse's own wins through
// (see cli/client/player/index.ts's own doc comment) -- so this is Studio's own React/Mantine rendering of
// that one shared contract, not a second, independently-derived player. Kept singular within Studio
// itself: every one of the surfaces above renders through this exact component, never a page-local
// re-presentation of the same screen/win data -- proven by RoundArtifactInspector.test.tsx's own
// "Cross-surface round presentation parity" suite (component-level) and
// ProjectDashboardPage.playWorkflow.test.tsx's own "canonical player parity" suite (through Play's real
// session/spin workflow, proving it reaches the exact same deriveWinHighlightsFromRoundArtifactWins
// entrypoint cli/client/player's own fixture-round test calls directly).
export function GameScreenView({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return <WinOverlay screen={screen} wins={wins} />;
}

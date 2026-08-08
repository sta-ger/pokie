import type {RoundArtifactWin} from "../../api/types";
import {CanonicalPlayerView} from "./CanonicalPlayerView";

// The shared "screen, with whatever won on it highlighted" presentation every round-inspection surface
// (Play, Replay -- recorded/recreated/simulation-sampled rounds, Session Spin -- an Outcome Source draw)
// renders a round's screen through -- a thin public alias for CanonicalPlayerView, kept
// under its own established name since every existing caller already imports "GameScreenView" for exactly
// this "screen, with wins" contract. CanonicalPlayerView itself mounts cli/client/player's own DOM
// functions directly (see its own doc comment) -- the identical grid/highlight/hover-list rendering
// cli/client/main.ts and pokie-examples mount a VideoSlotRoundResponse's own wins through (see
// cli/client/player/index.ts's own doc comment), not a second, independently-rendered player. Kept
// singular within Studio itself: every one of the surfaces above renders through this exact component,
// never a page-local re-presentation of the same screen/win data -- proven by
// RoundArtifactInspector.test.tsx's own "Cross-surface round presentation parity" suite (component-level)
// and ProjectDashboardPage.playWorkflow.test.tsx's own "canonical player parity" suite (through Play's
// real session/spin workflow, proving it reaches the exact same cli/client/player DOM functions
// tests/cli/client/player/renderPlayer.test.ts's own fixture-round test calls directly).
export function GameScreenView({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return <CanonicalPlayerView reelsSymbols={screen} wins={wins} />;
}

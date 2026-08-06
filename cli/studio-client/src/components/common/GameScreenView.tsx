import type {RoundArtifactWin} from "../../api/types";
import {WinOverlay} from "./WinOverlay";

// The shared "screen, with whatever won on it highlighted" presentation every round-inspection surface
// (Replay, Session Spin, an Outcome Source draw) renders a round's screen through -- a thin public alias
// for WinOverlay (which composes WinningPositionsOverlay's win-position highlight and PaylineOverlay's
// matched-line path onto one shared grid), kept under its own established name since every existing
// caller already imports "GameScreenView" for exactly this "screen, with wins" contract.
export function GameScreenView({screen, wins}: {screen: string[][]; wins?: readonly RoundArtifactWin[]}) {
    return <WinOverlay screen={screen} wins={wins} />;
}

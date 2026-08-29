import type {RoundArtifactWin} from "../../api/types";
import type {FeatureCounter, LineDefinitionView, PaytableView} from "../../../../client/player";
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
export function GameScreenView({
    screen,
    wins,
    credits,
    totalWin,
    payoutMultiplier,
    paytable,
    featureCounters,
    lines,
    availableBets,
    currentBet,
    onSelectBet,
    availableModeIds,
    currentModeId,
    onSelectMode,
}: {
    screen: string[][];
    wins?: readonly RoundArtifactWin[];
    credits?: number;
    totalWin?: number;
    payoutMultiplier?: number;
    paytable?: PaytableView;
    featureCounters?: FeatureCounter[];
    lines?: LineDefinitionView[];
    availableBets?: number[];
    currentBet?: number;
    onSelectBet?: (bet: number) => void;
    availableModeIds?: string[];
    currentModeId?: string;
    onSelectMode?: (modeId: string) => void;
}) {
    return (
        <CanonicalPlayerView
            reelsSymbols={screen}
            wins={wins}
            credits={credits}
            totalWin={totalWin}
            payoutMultiplier={payoutMultiplier}
            paytable={paytable}
            featureCounters={featureCounters}
            lines={lines}
            availableBets={availableBets}
            currentBet={currentBet}
            onSelectBet={onSelectBet}
            availableModeIds={availableModeIds}
            currentModeId={currentModeId}
            onSelectMode={onSelectMode}
        />
    );
}

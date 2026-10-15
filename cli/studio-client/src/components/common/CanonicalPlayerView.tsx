import type {LogicalRoundDelivery} from "../../../../../src/runtime/projectLogicalRound.js";
import {useLayoutEffect, useRef} from "react";
import {
    createPlayerRoundElements,
    deriveWinHighlightsFromRoundArtifactWins,
    renderPlayerRound,
    type FeatureCounter,
    type GenericRoundArtifactWin,
    type LineDefinitionView,
    type PaytableView as PaytableViewData,
} from "../../../../client/player";
import {useActiveSymbolArtwork} from "./SymbolPresentation";

// The one place Studio's round-inspection surfaces (Play, Replay -- recorded/recreated/simulation-
// sampled rounds, Session Spin -- an Outcome Source draw) actually mount cli/client/player's
// own renderPlayerRound entrypoint, via refs -- not a second, independently-maintained React/Mantine
// re-presentation of the same screen/wins/paytable/bets/modes/features data (see this repo's own
// cli/client/main.ts and pokie-examples' src/ui/ui.ts for the two other consumers of that exact module).
// React only mounts Player's container elements and re-invokes that idempotent entrypoint when props
// change; it never composes individual player sections. Only a win's own already-computed
// winningPositions/metadata.definition are read (via deriveWinHighlightsFromRoundArtifactWins) -- no win,
// line, or feature outcome is calculated here.
//
// A section only mounts at all when its caller actually has that data -- RoundArtifact carries no
// paytable/bets/modes/feature-counter fields today (see PaytableView.tsx's own doc comment for the same
// story about paytable specifically), so those sections are simply absent for every current Studio
// caller, the same honest "not available" default cli/client/player's own renderBetInfo/renderModeInfo
// already apply when a session never reports more than one choice.
export function CanonicalPlayerView({
    reelsSymbols,
    logicalRound,
    wins,
    visibleRowCoverage,
    paytable,
    featureCounters,
    lines,
    availableBets,
    currentBet,
    onSelectBet,
    availableModeIds,
    currentModeId,
    onSelectMode,
    credits,
    totalWin,
    payoutMultiplier,
}: {
    reelsSymbols: string[][];
    logicalRound?: LogicalRoundDelivery;
    visibleRowCoverage?: readonly number[];
    wins?: readonly GenericRoundArtifactWin[];
    paytable?: PaytableViewData;
    featureCounters?: FeatureCounter[];
    lines?: LineDefinitionView[];
    availableBets?: number[];
    currentBet?: number;
    onSelectBet?: (bet: number) => void;
    availableModeIds?: string[];
    currentModeId?: string;
    onSelectMode?: (modeId: string) => void;
    credits?: number;
    totalWin?: number;
    payoutMultiplier?: number;
}) {
    const displayedScreen = logicalRound?.currentStep ? logicalRound.currentStep.screen.map(reel => [...reel]) as string[][] : reelsSymbols;
    const displayedWins = logicalRound?.currentStep?.wins ?? wins;
    const displayedWin = logicalRound?.currentStep?.totalWin ?? totalWin;
    // A saved cascade delivery can show a zero-win step after its subround was already settled.
    // Normalize that step's win to the entry bet, never to the caller's aggregate artifact ratio.
    const displayedMultiplier = logicalRound?.currentStep
        ? logicalRound.currentStep.totalWin / logicalRound.entry.bet
        : payoutMultiplier;
    const displayedCoverage = logicalRound?.currentStep?.visibleRowCoverage ?? visibleRowCoverage;
    const artwork = useActiveSymbolArtwork();
    const playerRootRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!playerRootRef.current) {
            return;
        }
        const highlights = deriveWinHighlightsFromRoundArtifactWins(displayedWins ?? [], displayedScreen.length);
        const elements = createPlayerRoundElements(playerRootRef.current);
        if (logicalRound?.currentStep) {
            const winLabel = elements.totalWinRow?.querySelector("dt");
            const multiplierLabel = elements.payoutMultiplierRow?.querySelector("dt");
            if (winLabel) winLabel.textContent = "Step win";
            if (multiplierLabel) multiplierLabel.textContent = "Step win / entry bet";
        }
        renderPlayerRound(
            elements,
            {
                credits,
                totalWin: displayedWin,
                payoutMultiplier: displayedMultiplier,
                formatTotalWin: (value) => value.toFixed(2),
                formatPayoutMultiplier: (value) => value.toFixed(2),
                reelsSymbols: displayedScreen,
                visibleRowCoverage: displayedCoverage,
                highlights,
                featureCounters,
                lines,
                paytable,
                availableBets,
                currentBet,
                onSelectBet,
                availableModeIds,
                currentModeId,
                onSelectMode,
                artworkUrlForSymbol: (symbolId) => {
                    const reference = artwork[symbolId];
                    return reference === undefined ? undefined : `/api/project/symbol-artwork?path=${encodeURIComponent(reference)}`;
                },
            },
        );
    }, [artwork, availableBets, availableModeIds, credits, currentBet, currentModeId, featureCounters, lines, onSelectBet, onSelectMode, paytable, displayedMultiplier, displayedScreen, displayedWin, displayedCoverage, displayedWins, logicalRound?.currentStep]);

    return <div ref={playerRootRef} />;
}

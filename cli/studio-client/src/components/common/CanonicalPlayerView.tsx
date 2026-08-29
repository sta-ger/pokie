import {Table} from "@mantine/core";
import {useLayoutEffect, useRef} from "react";
import {
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
    wins,
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
    const artwork = useActiveSymbolArtwork();
    const gridRef = useRef<HTMLDivElement>(null);
    const winsSectionRef = useRef<HTMLDivElement>(null);
    const winsListRef = useRef<HTMLDivElement>(null);
    const linesListRef = useRef<HTMLDivElement>(null);
    const featuresRef = useRef<HTMLDListElement>(null);
    const betInfoRef = useRef<HTMLDivElement>(null);
    const modeInfoRef = useRef<HTMLDivElement>(null);
    const paytableHeadRef = useRef<HTMLTableRowElement>(null);
    const paytableBodyRef = useRef<HTMLTableSectionElement>(null);
    const creditsRef = useRef<HTMLElement>(null);
    const totalWinRef = useRef<HTMLSpanElement>(null);
    const payoutMultiplierRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        if (
            !gridRef.current ||
            !winsSectionRef.current ||
            !winsListRef.current ||
            !linesListRef.current ||
            !featuresRef.current ||
            !betInfoRef.current ||
            !modeInfoRef.current ||
            !paytableHeadRef.current ||
            !paytableBodyRef.current ||
            (credits !== undefined && !creditsRef.current) ||
            (totalWin !== undefined && !totalWinRef.current) ||
            (payoutMultiplier !== undefined && !payoutMultiplierRef.current)
        ) {
            return;
        }
        const highlights = deriveWinHighlightsFromRoundArtifactWins(wins ?? [], reelsSymbols.length);
        renderPlayerRound(
            {
                ...(creditsRef.current ? {credits: creditsRef.current} : {}),
                ...(totalWinRef.current ? {totalWin: totalWinRef.current} : {}),
                ...(payoutMultiplierRef.current ? {payoutMultiplier: payoutMultiplierRef.current} : {}),
                gridContainer: gridRef.current,
                winsSection: winsSectionRef.current,
                winsList: winsListRef.current,
                linesList: linesListRef.current,
                features: featuresRef.current,
                betInfo: betInfoRef.current,
                modeInfo: modeInfoRef.current,
                paytableHead: paytableHeadRef.current,
                paytableBody: paytableBodyRef.current,
            },
            {
                credits,
                totalWin,
                payoutMultiplier,
                formatTotalWin: (value) => value.toFixed(2),
                formatPayoutMultiplier: (value) => value.toFixed(2),
                reelsSymbols,
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
    }, [artwork, availableBets, availableModeIds, credits, currentBet, currentModeId, featureCounters, lines, onSelectBet, onSelectMode, paytable, payoutMultiplier, reelsSymbols, totalWin, wins]);

    return (
        <div className="pokie-player" aria-label="Game player">
            <Table.ScrollContainer className="pokie-player-grid-scroll" minWidth={200}>
                <div ref={gridRef} />
            </Table.ScrollContainer>
            <dl hidden={credits === undefined && totalWin === undefined && payoutMultiplier === undefined}>
                {credits !== undefined && <><dt>Credits</dt><dd ref={creditsRef} /></>}
                {totalWin !== undefined && (
                    <>
                        <dt>Total win</dt>
                        <dd>
                            <span ref={totalWinRef} /> {payoutMultiplier !== undefined && <span>(<span ref={payoutMultiplierRef} />x)</span>}
                        </dd>
                    </>
                )}
            </dl>
            <div ref={winsSectionRef} hidden>
                <div ref={winsListRef} />
            </div>
            <div ref={linesListRef} hidden={lines === undefined || lines.length === 0} />
            <dl ref={featuresRef} hidden={featureCounters === undefined || featureCounters.length === 0} />
            <div ref={betInfoRef} hidden={availableBets === undefined || availableBets.length === 0} />
            <div ref={modeInfoRef} hidden={availableModeIds === undefined || availableModeIds.length === 0} />
            <Table.ScrollContainer className="player-paytable-scroll" minWidth={200} hidden={paytable === undefined}>
                <Table className="player-paytable" withColumnBorders>
                    <Table.Thead>
                        <tr ref={paytableHeadRef} />
                    </Table.Thead>
                    <tbody ref={paytableBodyRef} />
                </Table>
            </Table.ScrollContainer>
        </div>
    );
}

import {Table} from "@mantine/core";
import {useLayoutEffect, useRef} from "react";
import {
    applyPersistentHighlights,
    renderBetInfo,
    renderFeatureCounters,
    renderLineDefinitionsList,
    renderModeInfo,
    renderPaytable,
    renderReelsGrid,
    renderWinHighlightsList,
    renderWinsSection,
} from "../../../../client/player/renderPlayer";
import {
    deriveWinHighlightsFromRoundArtifactWins,
    type FeatureCounter,
    type GenericRoundArtifactWin,
    type LineDefinitionView,
    type PaytableView as PaytableViewData,
} from "../../../../client/player/videoSlotRoundView";

// The one place Studio's round-inspection surfaces (Play, Replay -- recorded/recreated/simulation-
// sampled rounds -- Runtime Session Tools, an Outcome Source draw) actually mount cli/client/player's
// own DOM functions, via refs -- not a second, independently-maintained React/Mantine re-presentation of
// the same screen/wins/paytable/bets/modes/features data (see this repo's own cli/client/main.ts and
// pokie-examples' src/ui/ui.ts for the two other consumers of that exact same module -- see
// cli/client/player/index.ts's own doc comment). Every render* call below is the literal function a
// browser-side game client calls; React's own job here is only mounting the container elements those
// functions render into and re-invoking them (idempotent -- each clears its own container first) when
// props change, never re-implementing what they draw. Only a win's own already-computed
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
}) {
    const gridRef = useRef<HTMLDivElement>(null);
    const winsSectionRef = useRef<HTMLDivElement>(null);
    const winsListRef = useRef<HTMLDivElement>(null);
    const linesListRef = useRef<HTMLDivElement>(null);
    const featuresRef = useRef<HTMLDListElement>(null);
    const betInfoRef = useRef<HTMLDivElement>(null);
    const modeInfoRef = useRef<HTMLDivElement>(null);
    const paytableHeadRef = useRef<HTMLTableRowElement>(null);
    const paytableBodyRef = useRef<HTMLTableSectionElement>(null);

    useLayoutEffect(() => {
        if (!gridRef.current) {
            return;
        }
        const highlights = deriveWinHighlightsFromRoundArtifactWins(wins ?? [], reelsSymbols.length);
        renderReelsGrid(gridRef.current, reelsSymbols);
        applyPersistentHighlights(gridRef.current, highlights);
        if (winsSectionRef.current) {
            renderWinsSection(winsSectionRef.current, highlights.length > 0);
        }
        if (winsListRef.current) {
            renderWinHighlightsList(winsListRef.current, gridRef.current, highlights);
        }
    }, [reelsSymbols, wins]);

    useLayoutEffect(() => {
        if (linesListRef.current && gridRef.current && lines) {
            renderLineDefinitionsList(linesListRef.current, gridRef.current, lines);
        }
    }, [lines]);

    useLayoutEffect(() => {
        if (featuresRef.current && featureCounters) {
            renderFeatureCounters(featuresRef.current, featureCounters);
        }
    }, [featureCounters]);

    useLayoutEffect(() => {
        if (betInfoRef.current && availableBets) {
            renderBetInfo(betInfoRef.current, availableBets, currentBet, onSelectBet ?? (() => undefined));
        }
    }, [availableBets, currentBet, onSelectBet]);

    useLayoutEffect(() => {
        if (modeInfoRef.current && availableModeIds) {
            renderModeInfo(modeInfoRef.current, availableModeIds, currentModeId, onSelectMode ?? (() => undefined));
        }
    }, [availableModeIds, currentModeId, onSelectMode]);

    useLayoutEffect(() => {
        if (paytableHeadRef.current && paytableBodyRef.current && paytable) {
            renderPaytable(paytableHeadRef.current, paytableBodyRef.current, paytable);
        }
    }, [paytable]);

    return (
        <div>
            <Table.ScrollContainer minWidth={200}>
                <div ref={gridRef} />
            </Table.ScrollContainer>
            <div ref={winsSectionRef} hidden>
                <div ref={winsListRef} />
            </div>
            {lines !== undefined && lines.length > 0 && <div ref={linesListRef} />}
            {featureCounters !== undefined && featureCounters.length > 0 && <dl ref={featuresRef} />}
            {availableBets !== undefined && availableBets.length > 0 && <div ref={betInfoRef} />}
            {availableModeIds !== undefined && availableModeIds.length > 0 && <div ref={modeInfoRef} />}
            {paytable !== undefined && (
                <Table.ScrollContainer minWidth={200}>
                    <Table withColumnBorders>
                        <Table.Thead>
                            <tr ref={paytableHeadRef} />
                        </Table.Thead>
                        <tbody ref={paytableBodyRef} />
                    </Table>
                </Table.ScrollContainer>
            )}
        </div>
    );
}

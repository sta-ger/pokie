import {Button, Select, Text, TextInput} from "@mantine/core";
import {ReactNode, useEffect, useState} from "react";
import {deriveAvailableBetModeIds, deriveAvailableBets, deriveBetModeId} from "../../../../client/player";
import {describeRuntimeActionError} from "../../domain/runtimeActionError";
import type {PlaySessionView} from "../../hooks/usePlaySession";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RoundSummary} from "../common/RoundSummary";

// Studio's own -- and only -- game mode: Play never starts a server, never shows a host/port/server URL,
// and is never represented as a product POKIE game server/RGS workflow. "New session"/"Reset" both
// materialize/load the project as needed and create a real session directly in Studio's own backend
// (StudioPlayService, see its own doc comment) -- TS loads the normal runtime and the game's own live RNG
// plays for real, with no separate session-storage/API setup for this tab to expose. Every spin's result
// renders through the exact same RoundSummary/RoundArtifactInspector/GameScreenView chain the Replay
// tab's other sources already use, complete with a real, hashable RoundArtifact -- never a Play-local
// re-presentation of the same screen/win/feature data, and never an embedded copy of the canonical
// player pointed at a live game server.
export function PlayTab({
    session,
    sessionId,
    onNewSession,
    onSpin,
    onFindAnyWin,
    onFindSymbolWin,
    onFindFreeGames,
    availableModes,
}: {
    session: PlaySessionView;
    sessionId: string | undefined;
    onNewSession: (seed?: string, modeName?: string) => void;
    onSpin: (bet?: number, mode?: string) => void;
    onFindAnyWin: () => void;
    onFindSymbolWin: (symbolId: string) => void;
    // The canonical shared "custom scenario" control -- StudioPlayService.findFreeGames()'s own doc
    // comment. Always rendered, same as Find any win/Find symbol win: a game that doesn't support free
    // games reports that honestly once clicked (errorNotice below), rather than this tab guessing ahead
    // of time which games do.
    onFindFreeGames: () => void;
    // The current project's own real outcome-library modes (see ProjectDashboardPage's own
    // outcomeLibraryModes doc comment) -- undefined for an ordinary game-backed project, which has no
    // notion of an outcome-library mode at all. When present, New session/Reset draw against whichever
    // of these real modes is selected below, never the manifest's own first mode by default silently.
    availableModes?: string[];
}) {
    const [seed, setSeed] = useState("");
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
    const [selectedMode, setSelectedMode] = useState<string | null>(null);
    const [selectedBet, setSelectedBet] = useState<string | null>(null);
    const [selectedBetMode, setSelectedBetMode] = useState<string | null>(null);
    // Defaults the picker to the first real mode the moment the list becomes available -- PlayTab mounts
    // before the project header's own outcome-source report necessarily has, so availableModes can go
    // from undefined to populated after this component's own first render, not just at mount.
    useEffect(() => {
        if (selectedMode === null && availableModes !== undefined && availableModes.length > 0) {
            setSelectedMode(availableModes[0]);
        }
    }, [availableModes, selectedMode]);
    const loading = session.status === "loading";
    // The game's own real symbol list -- present on session/spin/find-scenario responses alike (see
    // StudioPlayService.buildSessionView()'s own doc comment) -- undefined until the first "ok" response,
    // never a placeholder/invented list in the meantime.
    // A transient action failure/loading state carries the last confirmed server session.  Keep its
    // controls and completed round in view so Retry is genuinely recoverable rather than forcing the
    // designer to reconstruct context that the failed request never invalidated.
    const preservedSession = "previousSession" in session ? session.previousSession : undefined;
    const activeSession = session.status === "ok" ? session.session : preservedSession;
    const availableSymbols = activeSession?.availableSymbols;
    // These values are the session serializer's direct projection of the canonical Project/Game Model;
    // Play never invents a bet or a mode from an artifact/result.  They are refreshed from the returned
    // session after every spin, which is particularly important for a consumed one-shot buyFeature.
    const availableBets = deriveAvailableBets(activeSession?.availableBets);
    const availableBetModes = deriveAvailableBetModeIds(activeSession?.availableBetModeIds);
    const currentBet = typeof activeSession?.bet === "number" ? activeSession.bet : undefined;
    const currentBetMode = deriveBetModeId(activeSession?.betModeId);

    useEffect(() => {
        if (currentBet !== undefined) {
            setSelectedBet(String(currentBet));
        }
    }, [currentBet, activeSession?.sessionId]);
    useEffect(() => {
        if (currentBetMode !== undefined) {
            setSelectedBetMode(currentBetMode);
        }
    }, [currentBetMode, activeSession?.sessionId]);

    // "no-active-project"/"not-found" are already plain, specific messages -- shown as-is. "error"/
    // "blocked" carry the underlying server's own raw text (a caught exception's message, or a game's
    // own `canPlayNextGame()`-blocked reason) -- run through the shared describeRuntimeActionError
    // classifier, so a network hiccup, a materialization failure, or a plain "can't play right now" all
    // read as subject-specific status + remediation copy instead of an internal message verbatim.
    let errorNotice: ReactNode;
    if (session.status === "error") {
        errorNotice = <ErrorState message={describeRuntimeActionError(session.subject ?? "This session", session.message)} />;
    } else if (session.status === "blocked") {
        errorNotice = <ErrorState message={describeRuntimeActionError("This spin", session.message)} />;
    } else if (session.status === "not-found" || session.status === "no-active-project") {
        errorNotice = <ErrorState message={session.message} />;
    }

    const seedField = (
        <TextInput
            label="Seed (optional)"
            description="A given seed always plays out the same way -- genuine input to the game's own RNG, not cosmetic."
            value={seed}
            onChange={(event) => setSeed(event.currentTarget.value)}
            mb="sm"
            style={{maxWidth: 320}}
        />
    );

    // Only rendered for a resolved "outcomeLibrary"/"stakeAdapter" project (availableModes present) --
    // an ordinary game-backed project has no notion of an outcome-library mode, so New session/Reset
    // never passes one for it at all.
    const modeField = availableModes !== undefined && availableModes.length > 0 && (
        <Select
            aria-label="Outcome library mode"
            label="Outcome library mode"
            description="Which real outcome-library mode a new Play session draws against. This is separate from a game's runtime bet mode."
            data={availableModes}
            value={selectedMode}
            onChange={setSelectedMode}
            allowDeselect={false}
            mb="sm"
            style={{maxWidth: 320}}
        />
    );

    if (sessionId === undefined) {
        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Play prepares this game for a real round and creates a session in Studio. Nothing else needs to be set up.
                </Text>
                {loading && <LoadingState label="Starting…" />}
                {errorNotice}
                <PageSection legend="Start Play">
                    {modeField}
                    <AdvancedDisclosure detail="seed">
                        {seedField}
                    </AdvancedDisclosure>
                    <QuickActions>
                        <Button loading={loading} onClick={() => onNewSession(seed.trim() || undefined, selectedMode ?? undefined)}>
                            New Play session
                        </Button>
                    </QuickActions>
                </PageSection>
            </div>
        );
    }

    // "Has an actual round been played yet" can't be read off `session.screen` -- no current
    // GameSessionSerializer (video-slot or otherwise) ever publishes a field literally named "screen" (a
    // video slot's own public payload calls it "reelsSymbols", and that field is already present on the
    // very first, pre-spin session view too -- see VideoSlotSessionSerializer.getInitialData(), which
    // merges its own getRoundData() in). `debug.artifact`/`debug.artifactUnavailableReason` are the one
    // pair StudioPlayService only ever attaches from a real spin's capture (never from session creation --
    // see StudioPlayService.projectRoundArtifact()'s own doc comment), and Play always requests "full"
    // capture, so exactly one of the two is present on every spun round regardless of the underlying
    // game's serializer shape.
    const playedRound =
        activeSession !== undefined && (activeSession.debug?.artifact !== undefined || activeSession.debug?.artifactUnavailableReason !== undefined)
            ? activeSession
            : undefined;

    return (
        <div>
            <PageSection legend="Play">
                {availableBets.length > 0 && (
                    <Select
                        aria-label="Bet"
                        label="Bet"
                        description="Available bets come from this session's game model."
                        data={availableBets.map((bet) => ({value: String(bet), label: bet.toFixed(2)}))}
                        value={selectedBet}
                        onChange={setSelectedBet}
                        allowDeselect={false}
                        mb="sm"
                        style={{maxWidth: 240}}
                    />
                )}
                {availableBetModes.length > 0 && (
                    <Select
                        aria-label="Bet mode"
                        label="Bet mode"
                        description="A buy-feature mode applies to this spin only; after a successful purchase, the returned session shows its persistent mode."
                        data={availableBetModes}
                        value={selectedBetMode}
                        onChange={setSelectedBetMode}
                        allowDeselect={false}
                        mb="sm"
                        style={{maxWidth: 320}}
                    />
                )}
                <QuickActions>
                    <Button loading={loading} onClick={() => onSpin(selectedBet === null ? undefined : Number(selectedBet), selectedBetMode ?? undefined)}>
                        Spin
                    </Button>
                </QuickActions>
            </PageSection>

            <PageSection legend="Scenarios">
                <Text size="sm" c="dimmed" mb="sm">
                    Scenario searches use real settled spins and leave their final round in this Play session.
                </Text>
                <QuickActions>
                    <Button variant="default" loading={loading} onClick={onFindAnyWin}>
                        Find any win
                    </Button>
                    <Button
                        variant="default"
                        loading={loading}
                        disabled={!selectedSymbol}
                        onClick={() => selectedSymbol !== null && onFindSymbolWin(selectedSymbol)}
                    >
                        Find symbol win
                    </Button>
                    <Button variant="default" loading={loading} onClick={onFindFreeGames}>
                        Find free games
                    </Button>
                </QuickActions>
                <Select
                    aria-label="Symbol"
                    label="Symbol"
                    description={
                        availableSymbols !== undefined && availableSymbols.length > 0
                            ? "The symbol Find symbol win searches for in a real, already-evaluated win."
                            : "Find symbol win is unavailable because this game does not expose selectable symbols."
                    }
                    placeholder={availableSymbols !== undefined && availableSymbols.length > 0 ? "Choose a symbol" : "No symbols available"}
                    data={availableSymbols ?? []}
                    value={selectedSymbol}
                    onChange={setSelectedSymbol}
                    disabled={availableSymbols === undefined || availableSymbols.length === 0}
                    mb="sm"
                    style={{maxWidth: 240}}
                />
            </PageSection>

            <PageSection legend="Session">
                {modeField}
                <AdvancedDisclosure detail="seed">
                    {seedField}
                </AdvancedDisclosure>
                <QuickActions>
                    <Button variant="default" loading={loading} onClick={() => onNewSession(seed.trim() || undefined, selectedMode ?? undefined)}>
                        Reset Play session
                    </Button>
                </QuickActions>
            </PageSection>

            {errorNotice}

            {loading && <LoadingState label="Spinning…" />}
            {!loading && (playedRound === undefined ? <EmptyState message="No round played yet -- Spin to play." /> : <RoundSummary session={playedRound} />)}
        </div>
    );
}

import {Button, Select, Text, TextInput} from "@mantine/core";
import {ReactNode, useEffect, useState} from "react";
import {describeRuntimeActionError} from "../../domain/runtimeActionError";
import type {PlaySessionView} from "../../hooks/usePlaySession";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
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
    onSpin: () => void;
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
    const availableSymbols = session.status === "ok" ? session.session.availableSymbols : undefined;

    // "no-active-project"/"not-found" are already plain, specific messages -- shown as-is. "error"/
    // "blocked" carry the underlying server's own raw text (a caught exception's message, or a game's
    // own `canPlayNextGame()`-blocked reason) -- run through the shared describeRuntimeActionError
    // classifier, so a network hiccup, a materialization failure, or a plain "can't play right now" all
    // read as subject-specific status + remediation copy instead of an internal message verbatim.
    let errorNotice: ReactNode;
    if (session.status === "error") {
        errorNotice = <ErrorState message={describeRuntimeActionError("This session", session.message)} />;
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
            description="Which real mode of this outcome library New session/Reset draws against."
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
                    Play prepares this project (materializing a Blueprint into a runnable package first if
                    needed) and creates a real session directly in Studio&apos;s own backend -- no server,
                    host, port, or separate API to set up.
                </Text>
                {modeField}
                {seedField}
                {loading && <LoadingState label="Starting…" />}
                {errorNotice}
                <QuickActions>
                    <Button loading={loading} onClick={() => onNewSession(seed.trim() || undefined, selectedMode ?? undefined)}>
                        New session
                    </Button>
                </QuickActions>
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
        session.status === "ok" && (session.session.debug?.artifact !== undefined || session.session.debug?.artifactUnavailableReason !== undefined)
            ? session.session
            : undefined;

    return (
        <div>
            <QuickActions>
                <Button loading={loading} onClick={onSpin}>
                    Spin
                </Button>
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
                <Button variant="default" loading={loading} onClick={() => onNewSession(seed.trim() || undefined, selectedMode ?? undefined)}>
                    Reset
                </Button>
            </QuickActions>
            {modeField}
            {seedField}
            {availableSymbols !== undefined && availableSymbols.length > 0 && (
                <Select
                    aria-label="Symbol"
                    label="Symbol"
                    description="The symbol Find symbol win searches for -- a real spin's own already-computed win, never predicted."
                    placeholder="Choose a symbol"
                    data={availableSymbols}
                    value={selectedSymbol}
                    onChange={setSelectedSymbol}
                    mb="sm"
                    style={{maxWidth: 240}}
                />
            )}

            {errorNotice}

            {loading && <LoadingState label="Spinning…" />}
            {!loading && (playedRound === undefined ? <EmptyState message="No round played yet -- Spin to play." /> : <RoundSummary session={playedRound} />)}
        </div>
    );
}

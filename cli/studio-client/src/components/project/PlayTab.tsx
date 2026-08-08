import {Button, Select, Text, TextInput} from "@mantine/core";
import {ReactNode, useState} from "react";
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
}: {
    session: PlaySessionView;
    sessionId: string | undefined;
    onNewSession: (seed?: string) => void;
    onSpin: () => void;
    onFindAnyWin: () => void;
    onFindSymbolWin: (symbolId: string) => void;
}) {
    const [seed, setSeed] = useState("");
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
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

    if (sessionId === undefined) {
        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Play prepares this project (materializing a Blueprint into a runnable package first if
                    needed) and creates a real session directly in Studio&apos;s own backend -- no server,
                    host, port, or separate API to set up.
                </Text>
                {seedField}
                {loading && <LoadingState label="Starting…" />}
                {errorNotice}
                <QuickActions>
                    <Button loading={loading} onClick={() => onNewSession(seed.trim() || undefined)}>
                        New session
                    </Button>
                </QuickActions>
            </div>
        );
    }

    const playedRound = session.status === "ok" && session.session.screen !== undefined ? session.session : undefined;

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
                <Button variant="default" loading={loading} onClick={() => onNewSession(seed.trim() || undefined)}>
                    Reset
                </Button>
            </QuickActions>
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

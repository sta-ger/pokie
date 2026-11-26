import {Alert, Badge, Button, Group, Select, Text, TextInput} from "@mantine/core";
import {ReactNode, useEffect, useMemo, useState} from "react";
import {deriveAvailableBetModeIds, deriveAvailableBets, deriveBetModeId} from "../../../../client/player";
import type {PlayScenarioSummary} from "../../api/apiClient";
import {describeRuntimeActionError} from "../../domain/runtimeActionError";
import {formatCount} from "../../domain/formatCount";
import {useConfirm} from "../../hooks/useConfirm";
import type {PlaySessionView} from "../../hooks/usePlaySession";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RoundSummary} from "../common/RoundSummary";
import {GameScreenView} from "../common/GameScreenView";
import {describeRuntimeSessionScreen} from "../../domain/interpret/Runtime";

// The public status text is for a game-math author, not a runtime implementer: "step"/"part" are
// internal delivery terms. A mathematical spin and the screen it produced are what the player sees.
function describeRoundProgress(round: {
    status: "pending" | "completed" | "exhausted";
    mathematicalCursor: number;
    cursor: number;
    totalStake: number;
    totalPayout: number;
}): string {
    let label: string;
    if (round.status === "completed") {
        label = "This paid round is complete";
    } else if (round.status === "pending") {
        label = "This paid round is in progress";
    } else {
        label = "This paid round stopped at its bound";
    }
    const payoutLabel = round.status === "pending" ? "payout so far" : "total payout";
    return `${label}: ${formatCount(round.mathematicalCursor, "spin")}, ${formatCount(
        round.cursor,
        "screen",
    )}; total stake ${round.totalStake}, ${payoutLabel} ${round.totalPayout}`;
}

function describeScenarioSummary(summary: PlayScenarioSummary): {title: string; text: string} {
    const searched = `${formatCount(summary.attemptedSpins, "spin")} (maximum ${formatCount(summary.maximumSpins, "spin")})`;
    let target: string;
    if (summary.operation === "find-symbol-win") target = `a win for symbol ${summary.symbolId ?? "(unknown)"}`;
    else if (summary.operation === "find-free-games") target = "free games";
    else target = "a winning round";
    const details = [
        `Searched ${searched} at bet ${summary.bet ?? "the current bet"}`,
        summary.win === undefined ? undefined : `final win ${summary.win.toFixed(2)}`,
        summary.credits === undefined ? undefined : `credits now ${summary.credits.toFixed(2)}`,
    ].filter((part): part is string => part !== undefined);
    return {
        title: `Found ${target}`,
        text: `${details.join("; ")}. The matching round is shown below.`,
    };
}

function describePendingAction(action: "newSession" | "spin" | "findAnyWin" | "findSymbolWin" | "findFreeGames"): string {
    switch (action) {
        case "newSession":
            return "Starting Play session…";
        case "findAnyWin":
            return "Searching real paid spins for a win…";
        case "findSymbolWin":
            return "Searching real paid spins for that symbol…";
        case "findFreeGames":
            return "Searching real paid spins for free games…";
        default:
            return "Spinning a real round…";
    }
}

// The pre-spin half of a Play session. Some serializers expose their initial reels, others only expose
// the session's real starting credits/bets; in both cases the author should see what will be charged
// before pressing Spin instead of an empty card. This is presentation only -- it never invents credits
// or a bet list the session did not report.
function PlaySessionSetup({
    credits,
    availableBets,
    selectedBet,
    onSelectBet,
    availableModes,
    selectedMode,
    onSelectMode,
    symbols,
}: {
    credits?: number;
    availableBets: number[];
    selectedBet?: number;
    onSelectBet: (bet: number) => void;
    availableModes: string[];
    selectedMode?: string;
    onSelectMode: (mode: string) => void;
    symbols?: string[];
}) {
    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                No round played yet — choose a bet and press Spin. Your bet is charged when the round starts.
            </Text>
            <Group gap="lg" align="flex-start">
                <div>
                    <Text size="xs" c="dimmed">Credits</Text>
                    <Text fw={600}>{credits === undefined ? "—" : credits.toFixed(2)}</Text>
                </div>
                <div>
                    <Text size="xs" c="dimmed">Total bet</Text>
                    {availableBets.length === 0 ? (
                        <Text fw={600}>{selectedBet ?? "—"}</Text>
                    ) : (
                        <Group gap={4}>
                            {availableBets.map((value) => (
                                <Button
                                    key={value}
                                    size="xs"
                                    variant={value === selectedBet ? "filled" : "default"}
                                    aria-label={`Select bet ${value}`}
                                    aria-pressed={value === selectedBet}
                                    onClick={() => onSelectBet(value)}
                                >
                                    {value}
                                </Button>
                            ))}
                        </Group>
                    )}
                </div>
                {availableModes.length > 0 && (
                    <Select
                        label="Bet mode"
                        aria-label="Bet mode"
                        data={availableModes}
                        value={selectedMode ?? null}
                        onChange={(value) => {
                            if (value !== null) onSelectMode(value);
                        }}
                        allowDeselect={false}
                        size="xs"
                        style={{minWidth: 180}}
                    />
                )}
            </Group>
            {symbols !== undefined && symbols.length > 0 && (
                <Text size="xs" c="dimmed" mt="sm">
                    Symbols in this game: {symbols.join(", ")}. The first Spin deals the reels.
                </Text>
            )}
        </div>
    );
}

// Studio's own -- and only -- game mode: Play never starts a server, never shows a host/port/server URL,
// and is never represented as a product POKIE game server/RGS workflow. "New session"/"Reset" both
// runtime/load the project as needed and create a real session directly in Studio's own backend
// (StudioPlayService, see its own doc comment) -- TS loads the normal runtime and the game's own live RNG
// plays for real, with no separate session-storage/API setup for this tab to expose. Every spin's result
// renders through the exact same RoundSummary/RoundRecordInspector/GameScreenView chain the Replay
// tab's other sources already use, complete with a real, hashable RoundRecord -- never a Play-local
// re-presentation of the same screen/win/feature data, and never an embedded copy of the canonical
// player pointed at a live game server.
export function PlayTab({
    session,
    sessionId,
    scenarioSummary,
    onNewSession,
    onSpin,
    onFindAnyWin,
    onFindSymbolWin,
    onFindFreeGames,
    availableModes,
    onRestore,
}: {
    session: PlaySessionView;
    sessionId: string | undefined;
    scenarioSummary?: PlayScenarioSummary;
    onNewSession: (seed?: string, modeName?: string) => void;
    onSpin: (bet?: number, mode?: string, delivery?: "stepwise" | "composite") => void;
    onFindAnyWin: (bet?: number, mode?: string) => void;
    onFindSymbolWin: (symbolId: string, bet?: number, mode?: string) => void;
    // The canonical shared "custom scenario" control -- StudioPlayService.findFreeGames()'s own doc
    // comment. Always rendered, same as Find any win/Find symbol win: a game that doesn't support free
    // games reports that honestly once clicked (errorNotice below), rather than this tab guessing ahead
    // of time which games do.
    onFindFreeGames: (bet?: number, mode?: string) => void;
    // The current project's own real outcome-library modes (see ProjectDashboardPage's own
    // outcomeLibraryModes doc comment) -- undefined for an ordinary game-backed project, which has no
    // notion of an outcome-library mode at all. When present, New session/Reset draw against whichever
    // of these real modes is selected below, never the manifest's own first mode by default silently.
    availableModes?: string[];
    onRestore?: (state: unknown) => void;
}) {
    const confirm = useConfirm();
    const [checkpoint, setCheckpoint] = useState("");
    const [pendingAction, setPendingAction] = useState<"newSession" | "spin" | "findAnyWin" | "findSymbolWin" | "findFreeGames">("newSession");
    const [checkpointError, setCheckpointError] = useState<string>();
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
    const [delivery, setDelivery] = useState<"stepwise" | "composite">("stepwise");
    const loading = session.status === "loading";
    // The game's own real symbol list -- present on session/spin/find-scenario responses alike (see
    // StudioPlayService.buildSessionView()'s own doc comment) -- undefined until the first "ok" response,
    // never a placeholder/invented list in the meantime.
    // A transient action failure/loading state carries the last confirmed server session.  Keep its
    // controls and completed round in view so Retry is genuinely recoverable rather than forcing the
    // designer to reconstruct context that the failed request never invalidated.
    const preservedSession = "previousSession" in session ? session.previousSession : undefined;
    const activeSession = session.status === "ok" ? session.session : preservedSession;
    const pendingRound = activeSession?.logicalRound?.status === "pending";
    // Play sessions live in the browser while a feature is in progress. A reload starts a fresh
    // session, so warn before a free-game round silently disappears. Completed rounds remain in
    // Replay -> Session Spin; this guard is only for an unfinished paid round.
    useEffect(() => {
        if (!pendingRound) return undefined;
        const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeUnload);
        return () => window.removeEventListener("beforeunload", warnBeforeUnload);
    }, [pendingRound]);
    const availableSymbols = activeSession?.availableSymbols;
    // These values are the session serializer's direct projection of the canonical Project/Game Model;
    // Play never invents a bet or a mode from an roundrecord/result.  They are refreshed from the returned
    // session after every spin, which is particularly important for a consumed one-shot buyFeature.
    const availableBets = useMemo(
        () => deriveAvailableBets(activeSession?.availableBets),
        [activeSession?.availableBets],
    );
    const availableBetModes = useMemo(
        () => deriveAvailableBetModeIds(activeSession?.availableBetModeIds),
        [activeSession?.availableBetModeIds],
    );
    const currentBet = typeof activeSession?.bet === "number" ? activeSession.bet : undefined;
    const currentBetMode = deriveBetModeId(activeSession?.betModeId);
    const scenarioCapabilities = activeSession?.scenarioCapabilities;
    const findAnyWinReason = scenarioCapabilities?.findAnyWin;
    const findSymbolWinReason = scenarioCapabilities?.findSymbolWin;
    const findFreeGamesReason = scenarioCapabilities?.findFreeGames;

    // Derive submit/render values immediately, including the first render of a replacement.
    // Transient states retain the same accepted session, so they cannot erase pending intent.
    const defaultBet =
        currentBet !== undefined && (availableBets.length === 0 || availableBets.includes(currentBet))
            ? currentBet
            : availableBets[0];
    const bet = selectedBet !== null && availableBets.includes(Number(selectedBet)) ? Number(selectedBet) : defaultBet;
    const defaultMode =
        currentBetMode !== undefined && availableBetModes.includes(currentBetMode)
            ? currentBetMode
            : availableBetModes[0];
    const mode =
        selectedBetMode !== null && availableBetModes.includes(selectedBetMode) ? selectedBetMode : defaultMode;
    useEffect(() => {
        setSelectedBet((previous) => {
            if (previous !== null && availableBets.includes(Number(previous))) return previous;
            return defaultBet === undefined ? null : String(defaultBet);
        });
    }, [activeSession, availableBets, defaultBet]);
    useEffect(() => {
        // An accepted play may consume a one-shot purchase even if its returned default is unchanged.
        setSelectedBetMode((previous) => {
            if (currentBetMode !== undefined && availableBetModes.includes(currentBetMode)) return currentBetMode;
            if (previous !== null && availableBetModes.includes(previous)) return previous;
            return availableBetModes[0] ?? null;
        });
    }, [activeSession, availableBetModes, currentBetMode]);

    // "no-active-project"/"not-found" are already plain, specific messages -- shown as-is. "error"/
    // "blocked" carry the underlying server's own raw text (a caught exception's message, or a game's
    // own `canPlayNextGame()`-blocked reason) -- run through the shared describeRuntimeActionError
    // classifier, so a network hiccup, a materialization failure, or a plain "can't play right now" all
    // read as subject-specific status + remediation copy instead of an internal message verbatim.
    let errorNotice: ReactNode;
    if (session.status === "error") {
        errorNotice =
            session.subject === "Checkpoint restore" ? (
                <ErrorState
                    message="Checkpoint restore failed. Supply a valid checkpoint from this WASM build and matching version, then retry the restore. Your last confirmed session is preserved."
                    detail={session.message}
                />
            ) : (
                <ErrorState message={describeRuntimeActionError(session.subject ?? "This session", session.message)} />
            );
    } else if (session.status === "blocked") {
        errorNotice = <ErrorState message={describeRuntimeActionError("This spin", session.message)} />;
    } else if (session.status === "not-found" || session.status === "no-active-project") {
        errorNotice = <ErrorState message={session.message} />;
    }

    const deliveryField = activeSession?.logicalRoundDeliverySupported && (
        <Select
            label="Round playback"
            aria-label="Round playback"
            description="Step by step lets you inspect every screen. Whole round finishes the remaining screens in one click — useful for checking free games."
            value={delivery}
            data={[
                {value: "stepwise", label: "Step by step"},
                {value: "composite", label: "Whole round in one click"},
            ]}
            onChange={(value) => setDelivery(value === "composite" ? "composite" : "stepwise")}
            disabled={loading}
            style={{maxWidth: 360}}
        />
    );
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
    const mathPreviewBadge = (
        <Badge
            color="gray"
            variant="light"
            title="The grid, bets and wins are real. Artwork and sound are not part of this local math preview; add PNG symbol art in Game design → Symbols for a more realistic screen."
        >
            Math preview
        </Badge>
    );
    const mathPreviewNotice = (
        <Text size="xs" c="dimmed" mb="sm">
            Math preview: the grid, bets and wins are real; artwork and sound are not. Use a built game, not this
            screen, when you need a stakeholder demo.
        </Text>
    );

    // Only rendered for a resolved "outcomeLibrary"/"stakeAdapter" project (availableModes present) --
    // an ordinary game-backed project has no notion of an outcome-library mode, so New session/Reset
    // never passes one for it at all.
    const modeField = availableModes !== undefined && availableModes.length > 0 && (
        <Select
            aria-label="Outcome table mode"
            label="Outcome table mode"
            description="Which real outcome-table mode a new Play session draws against. This is separate from a game's runtime bet mode."
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
                    Play is ready. Start a session, then press Spin to play a real round in Studio. Starting a session
                    does not place a bet. No game server or extra setup is needed. A page reload starts a fresh Play
                    session; earlier spins stay available under Replay → Played rounds.
                </Text>
                {activeSession?.logicalRound && (
                    <Text size="sm">{describeRoundProgress(activeSession.logicalRound)}</Text>
                )}
                {pendingRound && (
                    <Text size="xs" c="dimmed">
                        This in-progress paid round is browser-local: reloading the page starts a new Play session.
                        Completed rounds stay available under Replay → Played rounds.
                    </Text>
                )}
                {loading && <LoadingState label="Starting…" />}
                {errorNotice}
                <PageSection legend="Play session" action={mathPreviewBadge}>
                    {mathPreviewNotice}
                    {modeField}
                    {deliveryField}
                    <AdvancedDisclosure detail="seed">{seedField}</AdvancedDisclosure>
                    <Text size="xs" c="dimmed" mb="sm">
                        A seed is optional. Recorded spins without one can still be audit-replayed; set a seed if you
                        want a seeded forward replay later.
                    </Text>
                    <QuickActions>
                        <Button
                            loading={loading}
                            onClick={() => {
                                setPendingAction("newSession");
                                onNewSession(seed.trim() || undefined, selectedMode ?? undefined);
                            }}
                        >
                            Start playing
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
    // see StudioPlayService.projectRoundRecord()'s own doc comment), and Play always requests "full"
    // capture, so exactly one of the two is present on every spun round regardless of the underlying
    // game's serializer shape.
    const playedRound =
        activeSession !== undefined &&
        (activeSession.debug?.artifact !== undefined || activeSession.debug?.artifactUnavailableReason !== undefined)
            ? activeSession
            : undefined;
    const visibleScreen = activeSession === undefined ? [] : describeRuntimeSessionScreen(activeSession) ?? [];
    let roundResult: ReactNode;
    if (playedRound !== undefined) {
        roundResult = (
            <RoundSummary
                session={playedRound}
                selectedBet={bet}
                selectedBetMode={mode}
                availableBets={availableBets}
                availableModeIds={availableBetModes}
                onSelectBet={(bet) => setSelectedBet(String(bet))}
                onSelectBetMode={setSelectedBetMode}
            />
        );
    } else if (activeSession !== undefined) {
        roundResult =
            visibleScreen.length === 0 ? (
                <PlaySessionSetup
                    credits={activeSession.credits}
                    availableBets={availableBets}
                    selectedBet={bet}
                    onSelectBet={(bet) => setSelectedBet(String(bet))}
                    availableModes={availableBetModes}
                    selectedMode={mode}
                    onSelectMode={setSelectedBetMode}
                    symbols={activeSession.availableSymbols}
                />
            ) : (
                <div>
                    <GameScreenView
                        logicalRound={activeSession.logicalRound}
                        sequenceSelections={activeSession.sequenceSelections}
                        sequenceStatistics={activeSession.sequenceStatistics}
                        screen={visibleScreen}
                        visibleRowCoverage={
                            Array.isArray(activeSession.visibleRowCoverage)
                                ? (activeSession.visibleRowCoverage as number[])
                                : undefined
                        }
                        credits={activeSession.credits}
                        availableBets={availableBets}
                        currentBet={bet}
                        onSelectBet={(bet) => setSelectedBet(String(bet))}
                        availableModeIds={availableBetModes}
                        currentModeId={mode}
                        onSelectMode={setSelectedBetMode}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                        No round played yet — this is the session&apos;s starting screen. Press Spin to play.
                    </Text>
                </div>
            );
    } else {
        roundResult = <EmptyState message="No round played yet — Spin to play." />;
    }

    let spinButtonLabel = "Spin";
    if (activeSession?.logicalRound?.status === "pending") {
        spinButtonLabel = delivery === "composite" ? "Finish whole round" : "Continue round";
    }

    return (
        <div>
            <PageSection legend="Play" action={mathPreviewBadge}>
                {mathPreviewNotice}
                {deliveryField}
                <QuickActions>
                    <Button
                        loading={loading}
                        onClick={() => {
                            setPendingAction("spin");
                            onSpin(bet, mode, delivery);
                        }}
                    >
                        {spinButtonLabel}
                    </Button>
                    {activeSession?.logicalRound?.status === "pending" && delivery === "stepwise" && (
                        <Button
                            variant="default"
                            loading={loading}
                            onClick={() => {
                                setPendingAction("spin");
                                onSpin(bet, mode, "composite");
                            }}
                        >
                            Finish whole round
                        </Button>
                    )}
                </QuickActions>
                {activeSession?.logicalRound?.status === "pending" && delivery === "stepwise" && (
                    <Text size="sm" c="dimmed" mb="sm">
                        Tip: press “Finish whole round” or choose “Whole round in one click” above to finish free games
                        without pressing Continue for every screen.
                    </Text>
                )}
                {errorNotice}
                {activeSession?.logicalRound && (
                    <Text size="sm">{describeRoundProgress(activeSession.logicalRound)}</Text>
                )}
                {pendingRound && (
                    <Text size="xs" c="dimmed">
                        This in-progress paid round is browser-local: reloading the page starts a new Play session.
                        Completed rounds stay available under Replay → Played rounds.
                    </Text>
                )}
                {loading && <LoadingState label={describePendingAction(pendingAction)} />}
                {(!loading || playedRound !== undefined) && roundResult}
            </PageSection>

            {onRestore && (
                <PageSection legend="WASM checkpoint">
                    <TextInput
                        label="JSON checkpoint"
                        value={checkpoint}
                        onChange={(event) => setCheckpoint(event.currentTarget.value)}
                    />
                    <Button
                        disabled={loading || !checkpoint.trim()}
                        onClick={() => {
                            try {
                                const state: unknown = JSON.parse(checkpoint);
                                setCheckpointError(undefined);
                                onRestore(state);
                            } catch {
                                setCheckpointError(
                                    "Supply valid checkpoint JSON. The current session is preserved after a rejected restore.",
                                );
                            }
                        }}
                    >
                        Restore checkpoint
                    </Button>
                    {activeSession?.debug?.stateAfter !== undefined && (
                        <Button onClick={() => setCheckpoint(JSON.stringify(activeSession.debug!.stateAfter))}>
                            Copy current checkpoint to input
                        </Button>
                    )}
                    {checkpointError && <Text role="alert">{checkpointError}</Text>}
                </PageSection>
            )}
            <PageSection legend="Session">
                {modeField}
                <AdvancedDisclosure detail="seed">{seedField}</AdvancedDisclosure>
                <QuickActions>
                    <Button
                        variant="default"
                        loading={loading}
                        onClick={() => {
                            const reset = (): void => {
                                setPendingAction("newSession");
                                onNewSession(seed.trim() || undefined, selectedMode ?? undefined);
                            };
                            if (pendingRound) {
                                confirm(
                                    "Reset the Play session? The in-progress paid round and its current screens will be discarded. Completed rounds remain in Replay → Played rounds.",
                                    reset,
                                );
                                return;
                            }
                            reset();
                        }}
                    >
                        Reset Play session
                    </Button>
                </QuickActions>
            </PageSection>

            <PageSection legend="Scenarios">
                <Text size="sm" c="dimmed" mb="sm">
                    Scenario searches play real paid spins at the selected bet until they find a match, up to 2,000
                    spins. Every paid spin is charged to Play credits; free spins are not. The final round stays in this
                    Play session.
                </Text>
                {scenarioSummary && (() => {
                    const summary = describeScenarioSummary(scenarioSummary);
                    return (
                        <Alert
                            color="teal"
                            variant="light"
                            title={summary.title}
                            mb="sm"
                            role="status"
                            data-pokie-scenario-summary
                            data-pokie-scenario-operation={scenarioSummary.operation}
                        >
                            <Text size="sm">{summary.text}</Text>
                        </Alert>
                    );
                })()}
                <QuickActions>
                    <Button
                        variant="default"
                        loading={loading}
                        disabled={findAnyWinReason !== undefined}
                        title={
                            findAnyWinReason ??
                            "Plays real spins at the selected bet until a win is found; up to 2,000 spins are charged."
                        }
                        onClick={() => {
                            setPendingAction("findAnyWin");
                            onFindAnyWin(bet, mode);
                        }}
                    >
                        Find any win
                    </Button>
                    <Button
                        variant="default"
                        loading={loading}
                        disabled={findSymbolWinReason !== undefined || !selectedSymbol}
                        title={
                            findSymbolWinReason ??
                            "Plays real spins at the selected bet until the chosen symbol wins; up to 2,000 spins are charged."
                        }
                        onClick={() => {
                            if (selectedSymbol === null) return;
                            setPendingAction("findSymbolWin");
                            onFindSymbolWin(selectedSymbol, bet, mode);
                        }}
                    >
                        Find symbol win
                    </Button>
                    <Button
                        variant="default"
                        loading={loading}
                        disabled={findFreeGamesReason !== undefined}
                        title={
                            findFreeGamesReason ??
                            "Plays real spins at the selected bet until free games trigger; up to 2,000 spins are charged."
                        }
                        onClick={() => {
                            setPendingAction("findFreeGames");
                            onFindFreeGames(bet, mode);
                        }}
                    >
                        Find free games
                    </Button>
                </QuickActions>
                {findSymbolWinReason === undefined && selectedSymbol === null && (availableSymbols?.length ?? 0) > 0 && (
                    <Text size="xs" c="dimmed" mt="xs">
                        Choose a symbol below to enable Find symbol win.
                    </Text>
                )}
                {(findAnyWinReason !== undefined ||
                    findSymbolWinReason !== undefined ||
                    findFreeGamesReason !== undefined) && (
                    <Text size="sm" c="dimmed" mt="sm">
                        {[findAnyWinReason, findSymbolWinReason, findFreeGamesReason]
                            .filter((reason): reason is string => reason !== undefined)
                            .join(" ")}
                    </Text>
                )}
                <Select
                    aria-label="Symbol"
                    label="Symbol"
                    description={
                        availableSymbols !== undefined && availableSymbols.length > 0
                            ? "The symbol Find symbol win searches for in a real, already-evaluated win."
                            : "Find symbol win is unavailable because this game does not expose selectable symbols."
                    }
                    placeholder={
                        availableSymbols !== undefined && availableSymbols.length > 0
                            ? "Choose a symbol"
                            : "No symbols available"
                    }
                    data={availableSymbols ?? []}
                    value={selectedSymbol}
                    onChange={setSelectedSymbol}
                    disabled={availableSymbols === undefined || availableSymbols.length === 0}
                    mb="sm"
                    style={{maxWidth: 240}}
                />
            </PageSection>
        </div>
    );
}

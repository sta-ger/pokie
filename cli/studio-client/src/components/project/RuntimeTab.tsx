import {Alert, Anchor, Badge, Button, Checkbox, List, NumberInput, Select, SegmentedControl, Table, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import type {StartRuntimeOptions} from "../../api/apiClient";
import type {StudioRuntimeSessionView} from "../../api/types";
import type {RuntimeHistoryEntry, RuntimeLastSpin} from "../../hooks/useRuntimeManager";
import {useConfirm} from "../../hooks/useConfirm";
import {
    describeDebugAvailability,
    describeRetryRequest,
    describeRuntimeScreen,
    extractAdditionalRoundFields,
    type RecentSpinsListView,
    type RuntimeSessionResultView,
    type RuntimeSpinResultView,
    type RuntimeStateView,
} from "../../domain/interpret/Runtime";
import {describeRuntimeActionError} from "../../domain/runtimeActionError";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {ScreenTable} from "../common/ScreenTable";

type StartFormValues = {host: string; port: string; debug: boolean; repositoryMode: "memory" | "file"; seed: string};
type RestoreMethod = "new" | "restore";
type Session = RuntimeSessionResultView | RuntimeSpinResultView;

function readOptions(values: StartFormValues): StartRuntimeOptions {
    return {
        host: values.host.trim() || undefined,
        port: values.port.trim() === "" ? undefined : Number(values.port),
        debug: values.debug,
        repositoryMode: values.repositoryMode,
        seed: values.seed.trim() || undefined,
    };
}

function runtimeStateLabel(state: RuntimeStateView): string {
    if (state.status === "running") {
        return `running at ${state.baseUrl}`;
    }
    return state.status;
}

function formatFieldValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (value === null || value === undefined) {
        return "—";
    }
    return JSON.stringify(value);
}

function describeRoundEntry(entry: StudioRuntimeSessionView): string {
    return (
        `Round ${entry.studioRound ?? "?"} in session ${entry.sessionId} — credits ${entry.credits.toFixed(2)}, win ${(entry.win ?? 0).toFixed(2)}` +
        (entry.studioRequestId ? `, request ${entry.studioRequestId}` : "") +
        (entry.studioRecordedAt ? `, ${new Date(entry.studioRecordedAt).toLocaleString()}` : "")
    );
}

// The Inspect panel's core view for a selected round (either the just-played one or one picked from
// history below) -- a readable balance/bet/win/screen breakdown plus whatever extra public fields the
// game's own serializer returned (see extractAdditionalRoundFields's own doc comment for why that's the
// entire "feature progress" story), with the raw public/internal JSON tucked behind Advanced details,
// same convention as RoundArtifactInspector in the Replay & Debug tab.
function RoundSummary({session}: {session: StudioRuntimeSessionView}) {
    // studioRequestId/studioRound/studioRecordedAt/studioSource are all Studio's own bookkeeping (see
    // StudioRuntimeSessionView's own doc comment), never part of the game's actual public response --
    // excluded here alongside `debug` so "Public response" stays an honest dump of what the game server
    // itself returned.
    const {
        debug,
        studioRequestId: _studioRequestId,
        studioRound: _studioRound,
        studioRecordedAt: _studioRecordedAt,
        studioSource: _studioSource,
        ...publicFields
    } = session;
    const additional = extractAdditionalRoundFields(session);
    const hasAdditional = Object.keys(additional).length > 0;

    return (
        <div>
            {session.win !== undefined && session.win > 0 ? (
                <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />} title="Round complete" mb="md">
                    You won {session.win.toFixed(2)}.
                </Alert>
            ) : (
                <Text size="sm" c="dimmed" mb="md">
                    Round complete — no win this round.
                </Text>
            )}

            <Table withRowBorders={false} mb="sm">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Session id</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{session.sessionId}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Round</Table.Th>
                        <Table.Td>{session.studioRound ?? "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Credits</Table.Th>
                        <Table.Td>{session.credits.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Bet</Table.Th>
                        <Table.Td>{session.bet !== undefined ? session.bet.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Win</Table.Th>
                        <Table.Td>{session.win !== undefined ? session.win.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {session.screen && <ScreenTable screen={describeRuntimeScreen(session.screen) ?? []} />}

            {hasAdditional && (
                <PageSection legend="Additional round data">
                    <Table withRowBorders={false}>
                        <Table.Tbody>
                            {Object.entries(additional).map(([key, value]) => (
                                <Table.Tr key={key}>
                                    <Table.Th>{key}</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{formatFieldValue(value)}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </PageSection>
            )}

            <AdvancedDisclosure detail="raw JSON, debug data">
                <Text size="sm" fw={600} mb={4}>
                    Public response
                </Text>
                <CodeBlock>{JSON.stringify(publicFields, null, 2)}</CodeBlock>
                <Text size="sm" fw={600} mt="sm" mb={4}>
                    Debug response
                </Text>
                {debug === undefined ? (
                    <Text size="sm" c="dimmed">
                        Debug mode is disabled for this runtime — restart it with debug mode on to see internal/debug data.
                    </Text>
                ) : (
                    <CodeBlock>{JSON.stringify(debug, null, 2)}</CodeBlock>
                )}
            </AdvancedDisclosure>
        </div>
    );
}

// Every non-"ok" settled outcome a spin can produce, in plain language -- distinct from a generic
// ErrorState so "insufficient funds"/"stale version" read as what they are, not a bare server message.
// `onCreateNew`/`onReloadSession` give each state its own obvious next action. Shown right under the
// Spin button itself (this is live feedback on the action just taken), never inside the Inspect panel
// below, which is about a *selected round*'s data, not the in-flight status of the last request.
//
// `blocked`/`conflict`'s own `message` is the underlying game server's raw 400/409 `error` body (see
// StudioRuntimeManager.translateSpinResult()) -- e.g. `Session "sess-1" cannot play the next round
// (canPlayNextGame() returned false).` or `Session "sess-1" version mismatch: expected version 1, but the
// current version is 2.` -- exposing internal method/session-version detail no player-facing UI should lead
// with. The hand-authored title+action already carries the actionable "what happened, what to do" story, so
// the raw body only ever appears tucked behind the same AdvancedDisclosure convention as RoundSummary's own
// raw JSON, never as the Alert's primary text.
function SpinOutcome({session, onCreateNew, onReloadSession}: {session: Session; onCreateNew: () => void; onReloadSession: () => void}) {
    if (session.status === "not-found") {
        return <ErrorState message="Unknown session id." />;
    }
    if (session.status === "not-running") {
        return <ErrorState message="Runtime is not running — start it first." />;
    }
    if (session.status === "error") {
        // Not necessarily a spin specifically -- a re-create/reload issued while a previous session is
        // still tracked (its network-exception catch never resets `sessionId`, see useRuntimeManager's
        // own createSession()/loadSession()) settles right here too, alongside a genuine spin failure.
        return <ErrorState message={describeRuntimeActionError("This request", session.message)} />;
    }
    if (session.status === "blocked") {
        return (
            <RecoveryNotice
                title="Can't play this round"
                message={
                    <>
                        <Text size="sm" mb="xs">
                            This session can&apos;t play another round right now -- for example, insufficient balance for the bet, or a game rule
                            blocking play until an in-progress feature finishes.
                        </Text>
                        <AdvancedDisclosure detail="server message">
                            <Text size="sm">{session.message}</Text>
                        </AdvancedDisclosure>
                    </>
                }
                actionLabel="Create a new session"
                onAction={onCreateNew}
            />
        );
    }
    if (session.status === "conflict") {
        return (
            <RecoveryNotice
                title="Session changed elsewhere"
                message={
                    <>
                        <Text size="sm" mb="xs">
                            This session was updated by another request since it was last loaded here, so this spin was refused instead of
                            overwriting those changes.
                        </Text>
                        <AdvancedDisclosure detail="server message">
                            <Text size="sm">{session.message}</Text>
                        </AdvancedDisclosure>
                    </>
                }
                actionLabel="Reload session"
                onAction={onReloadSession}
            />
        );
    }
    return null;
}

export function RuntimeTab({
    state,
    running,
    session,
    sessionId,
    lastSpin,
    onRefresh,
    onStart,
    onStop,
    onRestart,
    onCreateSession,
    onLoadSession,
    onSpin,
    onRepeatSpin,
    history,
    recentSpins,
    recentSpinsError,
    onRefreshRecentSpins,
}: {
    state: RuntimeStateView;
    running: boolean;
    session: Session;
    sessionId: string | undefined;
    lastSpin: RuntimeLastSpin;
    onRefresh: () => void;
    onStart: (options: StartRuntimeOptions) => void;
    onStop: () => void;
    onRestart: (options?: StartRuntimeOptions) => void;
    onCreateSession: (seed?: string, initialBalance?: number) => void;
    onLoadSession: (id: string) => void;
    onSpin: (requestId?: string, expectedVersion?: number) => void;
    onRepeatSpin: () => void;
    history: RuntimeHistoryEntry[];
    recentSpins: RecentSpinsListView;
    recentSpinsError: string | undefined;
    onRefreshRecentSpins: () => void;
}) {
    const confirm = useConfirm();
    const navigate = useNavigate();
    const startForm = useForm<StartFormValues>({
        mode: "uncontrolled",
        initialValues: {host: "", port: "", debug: false, repositoryMode: "memory", seed: ""},
    });

    // Runtime is a workspace, not a wizard: every panel below is reachable at any time (no forced
    // Create -> Play -> Inspect -> Continue -> Debug order, no step gating other than "is there a
    // session/round to act on"), and the same session can cycle through Play/Inspect/Debug indefinitely.
    // `showSessionSwitcher` merely toggles the create/restore controls' visibility -- true whenever
    // there's no session to show a card for instead, and reopenable any time via "Create or restore a
    // different session" even while one is already active.
    const [showSessionSwitcher, setShowSessionSwitcher] = useState(true);
    const [restoreMethod, setRestoreMethod] = useState<RestoreMethod>("new");
    const [createSeed, setCreateSeed] = useState("");
    const [createInitialBalance, setCreateInitialBalance] = useState("");
    const [restoreSessionId, setRestoreSessionId] = useState("");
    const [manualRequestId, setManualRequestId] = useState("");
    const [manualExpectedVersion, setManualExpectedVersion] = useState<number | string>("");

    // The round Inspect/Retry/Debug all act on -- either the round just played (auto-selected the moment
    // its spin settles, see the settle effect below) or one explicitly picked from "Round history"
    // further down. A plain StudioRuntimeSessionView either way (a history entry and a freshly settled
    // spin's own `session.session` are the exact same shape), so either source can be selected
    // interchangeably with no adapting.
    const [selectedRound, setSelectedRound] = useState<StudioRuntimeSessionView | undefined>(undefined);

    // Which in-flight action a "loading" -> settled session transition belongs to -- set right when the
    // user triggers create/load/spin, consumed once that request actually settles. This is what lets the
    // settle effect below tell "a session was just created/loaded" (collapse the switcher, nothing to
    // auto-select yet) apart from "a round was just spun" (auto-select it, refresh round history) --
    // both share the same `session` state slot. Correct regardless of stale responses (a discarded stale
    // response never touches `session`, so this effect only ever fires for the most recent request -- see
    // useRuntimeManager's own sessionRequestIdRef).
    const pendingActionRef = useRef<"create" | "load" | "spin" | undefined>(undefined);
    const prevSessionStatusRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const status = session.status;
        const wasLoading = prevSessionStatusRef.current === "loading";
        const nowSettled = status !== "loading" && status !== "idle";
        if (wasLoading && nowSettled && pendingActionRef.current !== undefined) {
            if (pendingActionRef.current === "spin") {
                if (status === "ok") {
                    // `session.session` is whatever the server's own spin response carries -- Studio's
                    // real StudioRuntimeManager.spin() always stamps `studioRequestId` onto it (see that
                    // method's own doc comment), but this must stay correct even against a response that
                    // doesn't, since the request id actually used for this spin is already known
                    // client-side regardless (see useRuntimeManager.spin()'s own lastSpin bookkeeping,
                    // set before the request is even sent).
                    setSelectedRound({...session.session, studioRequestId: session.session.studioRequestId ?? lastSpin.requestId});
                }
                // Round history refreshes automatically after every spin attempt (not just an "ok" one) --
                // Continue's own list, and Replay & Debug's "Session Spin" find method, both read the same
                // GET /api/project/runtime/spins data, so a just-played round shows up in either without
                // the user having to remember to click Refresh.
                onRefreshRecentSpins();
            } else {
                setShowSessionSwitcher(false);
            }
            pendingActionRef.current = undefined;
        }
        prevSessionStatusRef.current = status;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.status]);

    // A session change -- a genuinely different session loaded, a fresh one created, or the runtime
    // stopped/restarted (sessionId reset to undefined either way, see useRuntimeManager's own
    // resetSession()) -- must never leave a manual spin override, or a round selection, from the
    // *previous* session lying around to silently apply to the next one. Reopens the session switcher
    // once there's no session left to show a card for instead.
    const prevSessionIdRef = useRef<string | undefined>(sessionId);
    useEffect(() => {
        if (prevSessionIdRef.current === sessionId) {
            return;
        }
        prevSessionIdRef.current = sessionId;
        setManualRequestId("");
        setManualExpectedVersion("");
        setSelectedRound(undefined);
        if (sessionId === undefined) {
            setShowSessionSwitcher(true);
            pendingActionRef.current = undefined;
        }
    }, [sessionId]);

    // Stop/Restart never observably passes `state.status` through "loading" for stop() specifically
    // (see useRuntimeManager.stop()'s own implementation), so this can't reuse the session-settle
    // pattern above -- instead handleStop()/handleRestart() below arm this ref right when the user
    // triggers either action, and this effect fires the refresh once `state.status` next settles,
    // regardless of what intermediate values it passed through. The server's own recentSpins ring
    // buffer is already cleared on every teardown path (see StudioRuntimeManager.stopServerIfAny()); this
    // is what makes the *frontend's* cached copy catch up to that, instead of continuing to show a
    // previous runtime instance's rounds as if they still applied.
    const pendingRuntimeSpinsRefreshRef = useRef(false);
    useEffect(() => {
        const settled = state.status === "stopped" || state.status === "running" || state.status === "failed" || state.status === "error";
        if (pendingRuntimeSpinsRefreshRef.current && settled) {
            pendingRuntimeSpinsRefreshRef.current = false;
            onRefreshRecentSpins();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.status]);

    function handleStop(): void {
        confirm("Stop the running runtime server?", () => {
            pendingRuntimeSpinsRefreshRef.current = true;
            setSelectedRound(undefined);
            onStop();
        });
    }

    function handleRestart(options?: StartRuntimeOptions): void {
        pendingRuntimeSpinsRefreshRef.current = true;
        setSelectedRound(undefined);
        onRestart(options);
    }

    // Server Refresh re-reads runtime status from the server -- a genuinely different runtime instance (or
    // the same one in a different state) can come back, so any round selected against whatever was showing
    // before must not linger as if it still applied.
    function handleServerRefresh(): void {
        setSelectedRound(undefined);
        onRefresh();
    }

    // The restore-session picker's own Refresh re-reads the recent-spins list a round selection may have
    // been drawn from (see handleRefreshHistory's own doc comment for the same reasoning) -- cleared here
    // too rather than left pointing at a round the refreshed list may no longer even contain.
    function handleRefreshRecentSessions(): void {
        setSelectedRound(undefined);
        onRefreshRecentSpins();
    }

    // The Debug panel's own truthful recovery action when the runtime is up but wasn't started with
    // debug mode on (see describeDebugAvailability's own doc comment) -- restarts with the same
    // host/port/session-storage mode (the only prior settings this component can still see once running,
    // since `state` carries no seed), flipping debug on. A configured default seed, if any, is lost by
    // this specific action -- the caption next to its button says so rather than silently dropping it.
    function handleRestartWithDebug(): void {
        if (state.status !== "running") {
            return;
        }
        handleRestart({host: state.host, port: state.port, repositoryMode: state.repositoryMode, debug: true});
    }

    function handleCreateSession(): void {
        pendingActionRef.current = "create";
        setSelectedRound(undefined);
        onCreateSession(createSeed.trim() || undefined, createInitialBalance.trim() === "" ? undefined : Number(createInitialBalance));
    }

    function handleLoadSession(id: string): void {
        pendingActionRef.current = "load";
        setSelectedRound(undefined);
        onLoadSession(id);
    }

    // The "requestId/idempotency UX without technical noise" requirement: every ordinary spin is
    // automatically idempotency-protected (a fresh requestId, so a network-level retry can never double-
    // spin) and optimistic-locking-protected (the session's own last-known sessionVersion, so a spin
    // against state that changed elsewhere surfaces as a clear "conflict" instead of silently overwriting
    // it) -- entirely silent by default. "Advanced spin options" below is the escape hatch for a user who
    // wants to override either by hand (e.g. to deliberately provoke/demonstrate a conflict).
    function handleSpin(): void {
        pendingActionRef.current = "spin";
        setSelectedRound(undefined);
        const expectedVersion = session.status === "ok" ? session.session.sessionVersion : undefined;
        onSpin(crypto.randomUUID(), expectedVersion);
    }

    function handleAdvancedSpin(): void {
        pendingActionRef.current = "spin";
        setSelectedRound(undefined);
        onSpin(manualRequestId.trim() || undefined, manualExpectedVersion === "" ? undefined : Number(manualExpectedVersion));
    }

    function handleRefreshHistory(): void {
        // Refreshing the very list a round selection was drawn from can make that selection stale (the
        // round may have scrolled out of the bounded ring buffer, or simply no longer be the entry the
        // user meant) -- cleared here rather than left silently pointing at whatever the refreshed list
        // happens to still contain. Never called from the automatic post-spin refresh above, which is
        // deliberately refreshing *around* a selection this same settle just made.
        setSelectedRound(undefined);
        onRefreshRecentSpins();
    }

    function handleRetry(detail: {requestId: string; expectedVersion: number | undefined}): void {
        pendingActionRef.current = "spin";
        setSelectedRound(undefined);
        if (detail.requestId === lastSpin.requestId && detail.expectedVersion === lastSpin.expectedVersion) {
            onRepeatSpin();
            return;
        }
        onSpin(detail.requestId, detail.expectedVersion);
    }

    const recentSessionIds = recentSpins.status === "loaded" ? Array.from(new Set(recentSpins.entries.map((entry) => entry.sessionId))) : [];
    const sessionRounds = recentSpins.status === "loaded" ? recentSpins.entries.filter((entry) => entry.sessionId === sessionId) : [];

    const sessionReachable = sessionId !== undefined;

    const retryDetail = describeRetryRequest({
        sessionId,
        baseUrl: state.status === "running" ? state.baseUrl : undefined,
        lastSpin,
        selectedRound,
    });
    const debugAvailability = describeDebugAvailability({
        sessionReachable,
        selectedRound,
        debugEnabled: state.status === "running" ? state.debug : undefined,
    });

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Starts a local `pokie serve`-equivalent HTTP server for this project, in-process -- never a subprocess --
                so you can create sessions and spin against it the same way an external client would. Create or restore a
                session, play rounds, inspect and retry/debug any of them, any number of times -- there&apos;s no fixed
                order to work through.
            </Text>

            <PageSection legend="Server">
                <form onSubmit={startForm.onSubmit((values) => onStart(readOptions(values)))}>
                    <QuickActions>
                        <TextInput label="Host (optional)" placeholder="127.0.0.1" {...startForm.getInputProps("host")} key={startForm.key("host")} />
                        <NumberInput label="Port (optional)" min={0} step={1} {...startForm.getInputProps("port")} key={startForm.key("port")} />
                        <Checkbox
                            label="Debug mode"
                            mt={24}
                            {...startForm.getInputProps("debug", {type: "checkbox"})}
                            key={startForm.key("debug")}
                        />
                        <Select
                            label="Session storage"
                            data={[
                                {value: "memory", label: "In-memory (default)"},
                                {value: "file", label: "File (survives a restart)"},
                            ]}
                            {...startForm.getInputProps("repositoryMode")}
                            key={startForm.key("repositoryMode")}
                        />
                        <TextInput label="Default seed (optional)" {...startForm.getInputProps("seed")} key={startForm.key("seed")} />
                    </QuickActions>
                    <QuickActions>
                        <Button type="submit" disabled={running} loading={state.status === "loading"}>
                            Start
                        </Button>
                        <Button color="red" variant="light" disabled={!running} onClick={handleStop}>
                            Stop
                        </Button>
                        <Button variant="default" onClick={() => handleRestart()} loading={state.status === "loading"}>
                            Restart
                        </Button>
                        <Button variant="default" onClick={handleServerRefresh}>
                            Refresh
                        </Button>
                    </QuickActions>
                </form>

                <Text mt="sm">{runtimeStateLabel(state)}</Text>
                {state.status === "error" && <ErrorState message={describeRuntimeActionError("The runtime server", state.message)} />}
                {state.status === "failed" && <ErrorState message={describeRuntimeActionError("The runtime server", state.error)} />}
                {state.status === "loading" && <LoadingState />}
                {state.status === "running" && (
                    <div>
                        {state.preGenerated && (
                            <Alert color="blue" variant="light" icon={<IconCircleCheck size={16} />} title="Running against a pre-generated outcome library" mb="sm">
                                <Text size="sm">
                                    Create Session / Spin below draw from library &quot;{state.preGenerated.libraryId}&quot; (hash{" "}
                                    <span style={{overflowWrap: "anywhere"}}>{state.preGenerated.hash}</span>) instead of live RNG play.
                                    Loading a session by id isn&apos;t supported in this mode.
                                </Text>
                            </Alert>
                        )}
                        <Table withRowBorders={false} mb="sm">
                            <Table.Tbody>
                                <Table.Tr>
                                    <Table.Th>Host</Table.Th>
                                    <Table.Td>{state.host}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Port</Table.Th>
                                    <Table.Td>{state.port}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Base URL</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{state.baseUrl}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Session storage</Table.Th>
                                    <Table.Td>{state.repositoryMode}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Debug mode</Table.Th>
                                    <Table.Td>{state.debug ? "on" : "off"}</Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                        <Anchor href={state.baseUrl} target="_blank" rel="noreferrer">
                            Open runtime endpoint in a new tab
                        </Anchor>
                    </div>
                )}
            </PageSection>

            <PageSection legend="Current session">
                {!running && <EmptyState message="Start the runtime server above first." />}

                {running && sessionReachable && (
                    <div>
                        <Text size="sm" c="dimmed" mb="sm">
                            Session {sessionId}
                            {session.status === "ok" ? ` — credits ${session.session.credits.toFixed(2)}` : ""}
                        </Text>
                        <QuickActions>
                            <Button onClick={handleSpin} loading={session.status === "loading"}>
                                Spin
                            </Button>
                            <Button variant="default" onClick={() => setShowSessionSwitcher((value) => !value)}>
                                {showSessionSwitcher ? "Hide create/restore" : "Create or restore a different session"}
                            </Button>
                        </QuickActions>
                        {session.status === "loading" && <LoadingState label="Spinning…" />}
                        <SpinOutcome
                            session={session}
                            onCreateNew={() => {
                                setShowSessionSwitcher(true);
                                setRestoreMethod("new");
                            }}
                            onReloadSession={() => sessionId && handleLoadSession(sessionId)}
                        />

                        <AdvancedDisclosure detail="request id, expected version">
                            <QuickActions>
                                <TextInput
                                    label="Request id override (optional)"
                                    description="Overrides the automatic idempotency id -- a repeated request id is treated as a retry of the same spin instead of a new one."
                                    value={manualRequestId}
                                    onChange={(event) => setManualRequestId(event.currentTarget.value)}
                                />
                                <NumberInput
                                    label="Expected session version override (optional)"
                                    description="Overrides the automatic optimistic-locking check -- the spin is refused as a conflict if the session's version doesn't match this."
                                    min={1}
                                    step={1}
                                    value={manualExpectedVersion}
                                    onChange={setManualExpectedVersion}
                                />
                                <Button variant="default" loading={session.status === "loading"} onClick={handleAdvancedSpin}>
                                    Spin with overrides
                                </Button>
                            </QuickActions>
                        </AdvancedDisclosure>
                    </div>
                )}

                {running && (!sessionReachable || showSessionSwitcher) && (
                    <div>
                        <SegmentedControl
                            value={restoreMethod}
                            onChange={(value) => setRestoreMethod(value as RestoreMethod)}
                            data={[
                                {label: "New session", value: "new"},
                                {label: "Restore existing", value: "restore"},
                            ]}
                            mb="md"
                            aria-label="Create or restore method"
                        />

                        {!sessionReachable && session.status === "error" && (
                            <ErrorState message={describeRuntimeActionError("This request", session.message)} />
                        )}
                        {!sessionReachable && session.status === "not-found" && <ErrorState message={session.message} />}
                        {!sessionReachable && session.status === "not-running" && <ErrorState message={session.message} />}

                        {restoreMethod === "new" && (
                            <QuickActions>
                                <TextInput
                                    label="Seed (optional, overrides the server's default)"
                                    value={createSeed}
                                    onChange={(event) => setCreateSeed(event.currentTarget.value)}
                                />
                                {state.status === "running" && state.preGenerated && (
                                    <NumberInput
                                        label="Initial balance"
                                        description="A pre-generated session starts at 0 credits unless funded here"
                                        value={createInitialBalance}
                                        onChange={(value) => setCreateInitialBalance(String(value))}
                                    />
                                )}
                                <Button loading={session.status === "loading"} onClick={handleCreateSession}>
                                    Create Session
                                </Button>
                            </QuickActions>
                        )}

                        {restoreMethod === "restore" && (
                            <div>
                                <QuickActions>
                                    <TextInput
                                        label="Session id"
                                        description="Required to load an existing session"
                                        value={restoreSessionId}
                                        onChange={(event) => setRestoreSessionId(event.currentTarget.value)}
                                    />
                                    <Button
                                        loading={session.status === "loading"}
                                        disabled={restoreSessionId.trim() === ""}
                                        onClick={() => handleLoadSession(restoreSessionId.trim())}
                                    >
                                        Load Session
                                    </Button>
                                </QuickActions>

                                <Text size="sm" fw={600} mt="md" mb={4}>
                                    Or pick a recent session
                                </Text>
                                <QuickActions>
                                    <Button variant="default" size="xs" onClick={handleRefreshRecentSessions}>
                                        Refresh
                                    </Button>
                                </QuickActions>
                                {recentSpinsError && (
                                    <ErrorState message={describeRuntimeActionError("The recent sessions list", recentSpinsError)} />
                                )}
                                {recentSessionIds.length === 0 ? (
                                    <EmptyState message="No recent sessions yet in this Studio session." />
                                ) : (
                                    <List listStyleType="none" spacing={4}>
                                        {recentSessionIds.map((id) => (
                                            <List.Item key={id}>
                                                <Anchor
                                                    component="button"
                                                    type="button"
                                                    onClick={() => handleLoadSession(id)}
                                                    style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                                >
                                                    {id}
                                                </Anchor>
                                            </List.Item>
                                        ))}
                                    </List>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </PageSection>

            <PageSection legend="Inspect round">
                {selectedRound === undefined ? (
                    <EmptyState message="Spin a round, or pick one from round history below, to inspect it here." />
                ) : (
                    <RoundSummary session={selectedRound} />
                )}
            </PageSection>

            <PageSection legend="Round history for this session">
                <QuickActions>
                    <Button variant="default" size="xs" onClick={handleRefreshHistory}>
                        Refresh
                    </Button>
                </QuickActions>
                {recentSpinsError && <ErrorState message={describeRuntimeActionError("The round history", recentSpinsError)} />}
                {!sessionReachable && <EmptyState message="Create or restore a session first." />}
                {sessionReachable && sessionRounds.length === 0 && <EmptyState message="No rounds played yet this session." />}
                {sessionReachable && sessionRounds.length > 0 && (
                    <List listStyleType="none" spacing={4}>
                        {sessionRounds.map((entry) => {
                            const isSelected =
                                selectedRound !== undefined &&
                                selectedRound.sessionId === entry.sessionId &&
                                (selectedRound.studioRound ?? selectedRound.studioRequestId) === (entry.studioRound ?? entry.studioRequestId);
                            return (
                                // `studioRound` (Studio's own session-local round index, see
                                // StudioRuntimeSessionView's own doc comment) is what makes this key stable
                                // across a refresh -- unlike the array index it replaces, it never shifts
                                // when a newer round is unshifted onto the front of the list, and it stays
                                // unique within one session even once an idempotent retry of the same
                                // requestId has been deduplicated into it. Falling back to studioRequestId
                                // covers an entry that predates studioRound.
                                <List.Item key={`${entry.sessionId}-${entry.studioRound ?? entry.studioRequestId ?? "unknown"}`}>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        aria-current={isSelected ? "true" : undefined}
                                        onClick={() => setSelectedRound(entry)}
                                        style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                    >
                                        {describeRoundEntry(entry)}
                                    </Anchor>
                                    {isSelected && (
                                        <Badge ml="xs" size="sm" variant="light">
                                            Selected
                                        </Badge>
                                    )}
                                </List.Item>
                            );
                        })}
                    </List>
                )}
            </PageSection>

            <PageSection legend="Retry & Debug">
                {retryDetail.status === "unavailable" ? (
                    <EmptyState message={retryDetail.reason} />
                ) : (
                    <div>
                        <Table withRowBorders={false} mb="sm">
                            <Table.Tbody>
                                <Table.Tr>
                                    <Table.Th>Session</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{retryDetail.sessionId}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Round</Table.Th>
                                    <Table.Td>{retryDetail.round ?? "—"}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Request id</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{retryDetail.requestId}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Expected session version</Table.Th>
                                    <Table.Td>{retryDetail.expectedVersion ?? "— (none sent)"}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Recorded at</Table.Th>
                                    <Table.Td>{retryDetail.recordedAt ? new Date(retryDetail.recordedAt).toLocaleString() : "—"}</Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                        <Text size="sm" c="dimmed" mb="sm">
                            {retryDetail.idempotencyNote}
                        </Text>
                        <CodeBlock>{retryDetail.command}</CodeBlock>
                        <QuickActions>
                            <Button
                                mt="sm"
                                variant="default"
                                loading={session.status === "loading"}
                                onClick={() => handleRetry({requestId: retryDetail.requestId, expectedVersion: retryDetail.expectedVersion})}
                            >
                                Retry this request
                            </Button>
                        </QuickActions>
                    </div>
                )}

                <PageSection legend="Debug this round">
                    {debugAvailability.status === "blocked" && debugAvailability.canRestartWithDebug && (
                        <RecoveryNotice
                            title="Debug mode is off"
                            message={
                                <>
                                    {debugAvailability.reason} Restarting with debug mode on resets the runtime (any in-memory sessions and its
                                    configured default seed are lost) — sessions using file storage survive the restart.
                                </>
                            }
                            actionLabel="Restart with debug mode on"
                            onAction={handleRestartWithDebug}
                        />
                    )}
                    {debugAvailability.status === "blocked" && !debugAvailability.canRestartWithDebug && (
                        <EmptyState message={debugAvailability.reason} />
                    )}
                    {debugAvailability.status === "ready" && (
                        <QuickActions>
                            <Button
                                variant="default"
                                onClick={() =>
                                    navigate("/project/replay", {
                                        state: {findMethod: "spin", sessionId, requestId: debugAvailability.requestId},
                                    })
                                }
                            >
                                Debug this round in Replay &amp; Debug
                            </Button>
                        </QuickActions>
                    )}
                </PageSection>

                <PageSection legend="Request/response history">
                    {history.length === 0 ? (
                        <EmptyState message="No requests yet this session." />
                    ) : (
                        <List size="sm" spacing={2}>
                            {history.map((entry, index) => (
                                <List.Item key={index}>
                                    {entry.timestamp} — {entry.action}: {entry.summary}
                                </List.Item>
                            ))}
                        </List>
                    )}
                </PageSection>
            </PageSection>
        </div>
    );
}

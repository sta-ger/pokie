import {Alert, Anchor, Button, Checkbox, Collapse, List, NumberInput, Select, SegmentedControl, Stepper, Table, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useDisclosure} from "@mantine/hooks";
import {IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import type {StartRuntimeOptions} from "../../api/apiClient";
import type {StudioRuntimeSessionView} from "../../api/types";
import type {RuntimeHistoryEntry, RuntimeLastSpin} from "../../hooks/useRuntimeManager";
import {useConfirm} from "../../hooks/useConfirm";
import {
    describeRuntimeScreen,
    extractAdditionalRoundFields,
    type RecentSpinsListView,
    type RuntimeSessionResultView,
    type RuntimeSpinResultView,
    type RuntimeStateView,
} from "../../domain/interpret/Runtime";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
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

// The Inspect-round step's core view for a settled "ok" session -- a readable balance/bet/win/screen
// breakdown plus whatever extra public fields the game's own serializer returned (see
// extractAdditionalRoundFields's own doc comment for why that's the entire "feature progress" story),
// with the raw public/internal JSON tucked behind Advanced details, same convention as
// RoundArtifactInspector in the Replay & Debug tab.
function RoundSummary({session}: {session: StudioRuntimeSessionView}) {
    const [advancedOpened, {toggle: toggleAdvanced}] = useDisclosure(false);
    const {debug, ...publicFields} = session;
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

            <Text size="sm" mt="sm">
                <Anchor component="button" type="button" onClick={toggleAdvanced}>
                    {advancedOpened ? "Hide" : "Show"} advanced details (raw JSON, debug data)
                </Anchor>
            </Text>
            {advancedOpened && (
                <PageSection legend="Advanced details">
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
                </PageSection>
            )}
        </div>
    );
}

// Every non-"ok" settled outcome the Inspect-round step can show, in plain language -- distinct from a
// generic ErrorState so "insufficient funds"/"stale version" read as what they are, not a bare server
// message. `onCreateNew`/`onReloadSession` give each state its own obvious next action.
function RoundOutcome({session, onCreateNew, onReloadSession}: {session: Session; onCreateNew: () => void; onReloadSession: () => void}) {
    if (session.status === "not-found") {
        return <ErrorState message="Unknown session id." />;
    }
    if (session.status === "not-running") {
        return <ErrorState message="Runtime is not running — start it first." />;
    }
    if (session.status === "error") {
        return <ErrorState message={session.message} />;
    }
    if (session.status === "blocked") {
        return (
            <div>
                <Alert color="orange" variant="light" title="Can't play this round" mb="sm">
                    {session.message}
                </Alert>
                <QuickActions>
                    <Button variant="default" onClick={onCreateNew}>
                        Create a new session
                    </Button>
                </QuickActions>
            </div>
        );
    }
    if (session.status === "conflict") {
        return (
            <div>
                <Alert color="orange" variant="light" title="Session changed elsewhere" mb="sm">
                    {session.message}
                </Alert>
                <QuickActions>
                    <Button variant="default" onClick={onReloadSession}>
                        Reload session
                    </Button>
                </QuickActions>
            </div>
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
    onCreateSession: (seed?: string) => void;
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

    const [activeStep, setActiveStep] = useState(0);
    const [restoreMethod, setRestoreMethod] = useState<RestoreMethod>("new");
    const [createSeed, setCreateSeed] = useState("");
    const [restoreSessionId, setRestoreSessionId] = useState("");
    const [advancedSpinOpened, {toggle: toggleAdvancedSpin}] = useDisclosure(false);
    const [manualRequestId, setManualRequestId] = useState("");
    const [manualExpectedVersion, setManualExpectedVersion] = useState<number | string>("");

    // Which step a settled session response should land on -- set by whichever action (create/load/spin)
    // just kicked off a request, consumed once that request actually settles. Keeps the auto-advance
    // correct regardless of which of the three actions triggered it, and regardless of stale responses
    // (a discarded stale response never touches `session`, so this effect only ever fires for the most
    // recent request -- see useRuntimeManager's own sessionRequestIdRef). A settled *spin* (target step
    // 2, the only step handleSpin/handleAdvancedSpin ever target) additionally refreshes round history
    // automatically -- "Continue session"'s own list, and Replay & Debug's "Session Spin" list, both
    // read the same GET /api/project/runtime/spins data, so a just-played round shows up in either
    // without the user having to remember to click Refresh.
    const pendingAdvanceStepRef = useRef<number | undefined>(undefined);
    const prevSessionStatusRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const status = session.status;
        const wasLoading = prevSessionStatusRef.current === "loading";
        const nowSettled = status !== "loading" && status !== "idle";
        if (wasLoading && nowSettled && pendingAdvanceStepRef.current !== undefined) {
            if (pendingAdvanceStepRef.current === 2 && status === "ok") {
                onRefreshRecentSpins();
            }
            setActiveStep(pendingAdvanceStepRef.current);
            pendingAdvanceStepRef.current = undefined;
        }
        prevSessionStatusRef.current = status;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.status]);

    // A session change -- a genuinely different session loaded, a fresh one created, or the runtime
    // stopped/restarted (sessionId reset to undefined either way, see useRuntimeManager's own
    // resetSession()) -- must never leave a manual spin override typed for the *previous* session lying
    // around to silently apply to the next one. When the session is gone entirely, the Stepper itself no
    // longer makes sense to leave parked on Play/Inspect/Continue (all of which already gate on
    // sessionReachable and degrade to an EmptyState, but jumping back to step 0 -- and clearing whatever
    // advance was still pending for the runtime instance that just went away -- is the honest reflection
    // of "there's nothing to continue anymore").
    const prevSessionIdRef = useRef<string | undefined>(sessionId);
    useEffect(() => {
        if (prevSessionIdRef.current === sessionId) {
            return;
        }
        prevSessionIdRef.current = sessionId;
        setManualRequestId("");
        setManualExpectedVersion("");
        if (sessionId === undefined) {
            setActiveStep(0);
            pendingAdvanceStepRef.current = undefined;
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
            onStop();
        });
    }

    function handleRestart(): void {
        pendingRuntimeSpinsRefreshRef.current = true;
        onRestart();
    }

    function handleCreateSession(): void {
        pendingAdvanceStepRef.current = 1;
        onCreateSession(createSeed.trim() || undefined);
    }

    function handleLoadSession(id: string): void {
        pendingAdvanceStepRef.current = 1;
        onLoadSession(id);
    }

    // The "requestId/idempotency UX without technical noise" requirement: every ordinary spin is
    // automatically idempotency-protected (a fresh requestId, so a network-level retry can never double-
    // spin) and optimistic-locking-protected (the session's own last-known sessionVersion, so a spin
    // against state that changed elsewhere surfaces as a clear "conflict" instead of silently overwriting
    // it) -- entirely silent by default. "Advanced spin options" below is the escape hatch for a user who
    // wants to override either by hand (e.g. to deliberately provoke/demonstrate a conflict).
    function handleSpin(): void {
        pendingAdvanceStepRef.current = 2;
        const expectedVersion = session.status === "ok" ? session.session.sessionVersion : undefined;
        onSpin(crypto.randomUUID(), expectedVersion);
    }

    function handleAdvancedSpin(): void {
        pendingAdvanceStepRef.current = 2;
        onSpin(manualRequestId.trim() || undefined, manualExpectedVersion === "" ? undefined : Number(manualExpectedVersion));
    }

    const recentSessionIds = recentSpins.status === "loaded" ? Array.from(new Set(recentSpins.entries.map((entry) => entry.sessionId))) : [];
    const sessionRounds = recentSpins.status === "loaded" ? recentSpins.entries.filter((entry) => entry.sessionId === sessionId) : [];

    const sessionReachable = sessionId !== undefined;
    const inspectReachable = session.status !== "idle" && session.status !== "loading";

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Starts a local `pokie serve`-equivalent HTTP server for this project, in-process -- never a subprocess --
                so you can create sessions and spin against it the same way an external client would.
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
                        <Button variant="default" onClick={handleRestart} loading={state.status === "loading"}>
                            Restart
                        </Button>
                        <Button variant="subtle" onClick={onRefresh}>
                            Refresh
                        </Button>
                    </QuickActions>
                </form>

                <Text mt="sm">{runtimeStateLabel(state)}</Text>
                {state.status === "error" && <ErrorState message={state.message} />}
                {state.status === "failed" && <ErrorState message={state.error} />}
                {state.status === "loading" && <LoadingState />}
                {state.status === "running" && (
                    <div>
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
                            </Table.Tbody>
                        </Table>
                        <Anchor href={state.baseUrl} target="_blank" rel="noreferrer">
                            Open runtime endpoint in a new tab
                        </Anchor>
                    </div>
                )}
            </PageSection>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Create or restore session" description="Start playing" />
                <Stepper.Step label="Play" description="Spin" disabled={!sessionReachable} />
                <Stepper.Step label="Inspect round" description="See the result" disabled={!inspectReachable} />
                <Stepper.Step label="Continue session" description="Keep playing" disabled={!sessionReachable} />
                <Stepper.Step label="Debug" description="Advanced" />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    {!running && <EmptyState message="Start the runtime server above first." />}
                    {running && (
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

                            {restoreMethod === "new" && (
                                <QuickActions>
                                    <TextInput
                                        label="Seed (optional, overrides the server's default)"
                                        value={createSeed}
                                        onChange={(event) => setCreateSeed(event.currentTarget.value)}
                                    />
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
                                            value={restoreSessionId}
                                            onChange={(event) => setRestoreSessionId(event.currentTarget.value)}
                                        />
                                        <Button
                                            loading={session.status === "loading"}
                                            onClick={() => restoreSessionId.trim() && handleLoadSession(restoreSessionId.trim())}
                                        >
                                            Load Session
                                        </Button>
                                    </QuickActions>

                                    <Text size="sm" fw={600} mt="md" mb={4}>
                                        Or pick a recent session
                                    </Text>
                                    <QuickActions>
                                        <Button variant="default" size="xs" onClick={onRefreshRecentSpins}>
                                            Refresh
                                        </Button>
                                    </QuickActions>
                                    {recentSpinsError && <ErrorState message={recentSpinsError} />}
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
                </div>
            )}

            {activeStep === 1 && (
                <div>
                    {!sessionReachable && <EmptyState message="Create or restore a session first." />}
                    {sessionReachable && (
                        <div>
                            <Text size="sm" c="dimmed" mb="sm">
                                Session {sessionId}
                                {session.status === "ok" ? ` — credits ${session.session.credits.toFixed(2)}` : ""}
                            </Text>
                            <QuickActions>
                                <Button onClick={handleSpin} loading={session.status === "loading"}>
                                    Spin
                                </Button>
                            </QuickActions>
                            {session.status === "loading" && <LoadingState label="Spinning…" />}

                            <Text size="sm" mt="sm">
                                <Anchor component="button" type="button" onClick={toggleAdvancedSpin}>
                                    {advancedSpinOpened ? "Hide" : "Show"} advanced spin options (request id, expected version)
                                </Anchor>
                            </Text>
                            <Collapse expanded={advancedSpinOpened}>
                                <QuickActions>
                                    <TextInput
                                        label="Request id override (optional)"
                                        value={manualRequestId}
                                        onChange={(event) => setManualRequestId(event.currentTarget.value)}
                                    />
                                    <NumberInput
                                        label="Expected session version override (optional)"
                                        min={1}
                                        step={1}
                                        value={manualExpectedVersion}
                                        onChange={setManualExpectedVersion}
                                    />
                                    <Button variant="default" loading={session.status === "loading"} onClick={handleAdvancedSpin}>
                                        Spin with overrides
                                    </Button>
                                </QuickActions>
                            </Collapse>
                        </div>
                    )}
                </div>
            )}

            {activeStep === 2 && (
                <div>
                    {session.status === "idle" && <EmptyState message="Spin a round to see its result here." />}
                    {session.status === "loading" && <LoadingState />}
                    {session.status === "ok" && <RoundSummary session={session.session} />}
                    {session.status !== "idle" && session.status !== "loading" && session.status !== "ok" && (
                        <RoundOutcome
                            session={session}
                            onCreateNew={() => {
                                setActiveStep(0);
                                setRestoreMethod("new");
                            }}
                            onReloadSession={() => sessionId && handleLoadSession(sessionId)}
                        />
                    )}
                </div>
            )}

            {activeStep === 3 && (
                <div>
                    {!sessionReachable && <EmptyState message="Create or restore a session first." />}
                    {sessionReachable && (
                        <div>
                            <QuickActions>
                                <Button onClick={() => setActiveStep(1)}>Spin again</Button>
                                <Button variant="default" onClick={() => setActiveStep(0)}>
                                    Switch session
                                </Button>
                            </QuickActions>
                            <PageSection legend="Round history for this session">
                                <QuickActions>
                                    <Button variant="default" size="xs" onClick={onRefreshRecentSpins}>
                                        Refresh
                                    </Button>
                                </QuickActions>
                                {recentSpinsError && <ErrorState message={recentSpinsError} />}
                                {sessionRounds.length === 0 ? (
                                    <EmptyState message="No rounds played yet this session." />
                                ) : (
                                    <List size="sm" spacing={2}>
                                        {sessionRounds.map((entry, index) => (
                                            <List.Item key={index}>
                                                credits {entry.credits.toFixed(2)}, win {(entry.win ?? 0).toFixed(2)}
                                                {entry.debug?.requestId ? `, request ${entry.debug.requestId}` : ""}
                                            </List.Item>
                                        ))}
                                    </List>
                                )}
                            </PageSection>
                        </div>
                    )}
                </div>
            )}

            {activeStep === 4 && (
                <div>
                    <QuickActions>
                        <Button variant="default" disabled={!sessionReachable || lastSpin.requestId === undefined} onClick={onRepeatSpin}>
                            Retry last request (same request id)
                        </Button>
                        <Button
                            variant="default"
                            disabled={!sessionReachable || lastSpin.requestId === undefined}
                            onClick={() =>
                                navigate("/project/replay", {state: {findMethod: "spin", sessionId, requestId: lastSpin.requestId}})
                            }
                        >
                            Debug this round in Replay &amp; Debug
                        </Button>
                    </QuickActions>
                    <PageSection legend="Request/Response History">
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
                </div>
            )}
        </div>
    );
}

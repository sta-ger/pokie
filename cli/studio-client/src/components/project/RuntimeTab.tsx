import {Anchor, Button, Checkbox, List, NumberInput, Select, Table, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useState} from "react";
import type {StartRuntimeOptions} from "../../api/apiClient";
import type {RuntimeHistoryEntry} from "../../hooks/useRuntimeManager";
import {useConfirm} from "../../hooks/useConfirm";
import {describeRuntimeScreen, type RuntimeSessionResultView, type RuntimeSpinResultView, type RuntimeStateView} from "../../domain/interpret/Runtime";
import {CodeBlock} from "../common/CodeBlock";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {ScreenTable} from "../common/ScreenTable";

type StartFormValues = {host: string; port: string; debug: boolean; repositoryMode: "memory" | "file"; seed: string};

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

function SessionPanel({session}: {session: RuntimeSessionResultView | RuntimeSpinResultView}) {
    if (session.status === "idle" || session.status === "loading") {
        return null;
    }
    if (session.status === "not-found") {
        return <ErrorState message="Unknown session id." />;
    }
    if (session.status === "not-running") {
        return <ErrorState message="Runtime is not running — start it first." />;
    }
    if (session.status === "error" || session.status === "blocked" || session.status === "conflict") {
        return <ErrorState message={session.message} />;
    }

    const {session: view} = session;
    const {debug, ...publicFields} = view;

    return (
        <div>
            <Table withRowBorders={false} mb="sm">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Session id</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{view.sessionId}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Session version</Table.Th>
                        <Table.Td>{view.sessionVersion ?? "(not versioned)"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Credits</Table.Th>
                        <Table.Td>{view.credits.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Bet</Table.Th>
                        <Table.Td>{view.bet !== undefined ? view.bet.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Win</Table.Th>
                        <Table.Td>{view.win !== undefined ? view.win.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {view.screen && (
                <PageSection legend="Screen">
                    <ScreenTable screen={describeRuntimeScreen(view.screen) ?? []} />
                </PageSection>
            )}

            <PageSection legend="Public response">
                <CodeBlock>{JSON.stringify(publicFields, null, 2)}</CodeBlock>
            </PageSection>

            <PageSection legend="Debug response">
                {debug === undefined ? (
                    <Text size="sm" c="dimmed">
                        Debug mode is disabled for this runtime — restart it with debug mode on to see internal/debug data.
                    </Text>
                ) : (
                    <CodeBlock>{JSON.stringify(debug, null, 2)}</CodeBlock>
                )}
            </PageSection>
        </div>
    );
}

export function RuntimeTab({
    state,
    running,
    session,
    onRefresh,
    onStart,
    onStop,
    onRestart,
    onCreateSession,
    onLoadSession,
    onSpin,
    onRepeatSpin,
    history,
}: {
    state: RuntimeStateView;
    running: boolean;
    session: RuntimeSessionResultView | RuntimeSpinResultView;
    onRefresh: () => void;
    onStart: (options: StartRuntimeOptions) => void;
    onStop: () => void;
    onRestart: (options?: StartRuntimeOptions) => void;
    onCreateSession: (seed?: string) => void;
    onLoadSession: (id: string) => void;
    onSpin: (requestId?: string, expectedVersion?: number) => void;
    onRepeatSpin: () => void;
    history: RuntimeHistoryEntry[];
}) {
    const confirm = useConfirm();
    const startForm = useForm<StartFormValues>({
        mode: "uncontrolled",
        initialValues: {host: "", port: "", debug: false, repositoryMode: "memory", seed: ""},
    });
    const [createSeed, setCreateSeed] = useState("");
    const [loadSessionId, setLoadSessionId] = useState("");
    const [spinRequestId, setSpinRequestId] = useState("");
    const [spinExpectedVersion, setSpinExpectedVersion] = useState<number | string>("");

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
                        <Button
                            color="red"
                            variant="light"
                            disabled={!running}
                            onClick={() => confirm("Stop the running runtime server?", onStop)}
                        >
                            Stop
                        </Button>
                        <Button variant="default" onClick={() => onRestart()} loading={state.status === "loading"}>
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

            <PageSection legend="Session Tools">
                <QuickActions>
                    <TextInput
                        label="Seed (optional, overrides the server's default)"
                        value={createSeed}
                        onChange={(event) => setCreateSeed(event.currentTarget.value)}
                    />
                    <Button
                        variant="default"
                        disabled={!running}
                        loading={session.status === "loading"}
                        onClick={() => onCreateSession(createSeed.trim() || undefined)}
                    >
                        Create Session
                    </Button>
                </QuickActions>
                <QuickActions>
                    <TextInput label="Existing session id" value={loadSessionId} onChange={(event) => setLoadSessionId(event.currentTarget.value)} />
                    <Button
                        variant="default"
                        disabled={!running}
                        loading={session.status === "loading"}
                        onClick={() => loadSessionId.trim() && onLoadSession(loadSessionId.trim())}
                    >
                        Load Session
                    </Button>
                </QuickActions>

                <SessionPanel session={session} />

                <QuickActions>
                    <TextInput label="Request id (optional)" value={spinRequestId} onChange={(event) => setSpinRequestId(event.currentTarget.value)} />
                    <NumberInput
                        label="Expected session version (optional)"
                        min={1}
                        step={1}
                        value={spinExpectedVersion}
                        onChange={setSpinExpectedVersion}
                    />
                    <Button
                        disabled={!running}
                        loading={session.status === "loading"}
                        onClick={() =>
                            onSpin(spinRequestId.trim() || undefined, spinExpectedVersion === "" ? undefined : Number(spinExpectedVersion))
                        }
                    >
                        Spin
                    </Button>
                    <Button variant="default" disabled={!running} loading={session.status === "loading"} onClick={onRepeatSpin}>
                        Repeat Same Request
                    </Button>
                </QuickActions>
            </PageSection>

            <PageSection legend="Request/Response History">
                {history.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No requests yet this session.
                    </Text>
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
    );
}

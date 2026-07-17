import {Anchor, Badge, Button, Group, List, NumberInput, Progress, SegmentedControl, Stepper, Table, Text, Textarea, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useDisclosure} from "@mantine/hooks";
import {useEffect, useRef, useState} from "react";
import {useLocation} from "react-router-dom";
import {buildReplayDownloadUrl} from "../../api/apiClient";
import type {RoundArtifactJson, StudioRuntimeSessionView, StudioSimulationReportListEntry} from "../../api/types";
import type {ReplayComparisonView, ReplayListView, ReplayProgressView, ReplayResultView} from "../../domain/interpret/Replay";
import type {ReportListView} from "../../domain/interpret/Reports";
import {describeRuntimeScreen, type RecentSpinsListView} from "../../domain/interpret/Runtime";
import {useConfirm} from "../../hooks/useConfirm";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RoundArtifactInspector} from "../common/RoundArtifactInspector";
import {ScreenTable} from "../common/ScreenTable";

export type ExpectedReplayState =
    | {status: "empty"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {
          status: "loaded";
          round: number;
          seed?: string;
          artifact?: RoundArtifactJson;
          artifactWarnings: string[];
          stateBefore?: unknown;
          stateAfter?: unknown;
      };

type FindMethod = "seedRound" | "artifact" | "spin" | "simulation";
type FindFormValues = {round: number; seed: string};

function downloadJsonBlob(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

// The Find -> Load -> Reproduce -> Inspect -> Export workflow. All data-fetching still lives in
// ProjectDashboardPage (useReplayPoll, the replay/recent-spins/recent-runs lists, the "expected artifact"
// fetch used for match/mismatch comparison) -- this component only owns which step is showing and the
// small transient Find-step selections (which method, which list entry, the pasted JSON text), same split
// SimulationTab already established.
export function ReplayTab({
    progress,
    result,
    error,
    onRun,
    onCancel,
    onRetry,
    listView,
    listError,
    onRefreshList,
    onInspectStored,
    onCompareStored,
    expected,
    onLoadExpectedFromPaste,
    onClearExpected,
    comparison,
    recentSpins,
    recentSpinsError,
    onRefreshRecentSpins,
    recentRuns,
    recentRunsError,
    onRefreshRecentRuns,
}: {
    progress: ReplayProgressView | undefined;
    result: ReplayResultView | undefined;
    error: string | undefined;
    onRun: (round: number, seed: string | undefined, keepExpected?: boolean) => void;
    onCancel: () => void;
    onRetry: () => void;
    listView: ReplayListView;
    listError: string | undefined;
    onRefreshList: () => void;
    onInspectStored: (id: string) => void;
    onCompareStored: (id: string) => void;
    expected: ExpectedReplayState;
    onLoadExpectedFromPaste: (raw: string) => void;
    onClearExpected: () => void;
    comparison: ReplayComparisonView | undefined;
    recentSpins: RecentSpinsListView;
    recentSpinsError: string | undefined;
    onRefreshRecentSpins: () => void;
    recentRuns: ReportListView;
    recentRunsError: string | undefined;
    onRefreshRecentRuns: () => void;
}) {
    const confirm = useConfirm();
    const form = useForm<FindFormValues>({mode: "uncontrolled", initialValues: {round: 1, seed: ""}});
    // The landing side of the Runtime tab's "Debug this round in Replay & Debug" link
    // (`navigate("/project/replay", {state: {findMethod: "spin"}})`) -- read once, at mount (this
    // component remounts fresh on every tab switch, same as every other tab -- see
    // ProjectDashboardPage's own doc comment), so it only ever affects the landing right after that
    // navigation, never a later in-page interaction.
    const initialFindMethod = (useLocation().state as {findMethod?: FindMethod} | null)?.findMethod ?? "seedRound";

    const [activeStep, setActiveStep] = useState(0);
    const [findMethod, setFindMethod] = useState<FindMethod>(initialFindMethod);
    const [pending, setPending] = useState<{round: number; seed?: string}>();
    const [artifactText, setArtifactText] = useState("");
    const [selectedSpin, setSelectedSpin] = useState<StudioRuntimeSessionView>();
    const [selectedSimEntry, setSelectedSimEntry] = useState<StudioSimulationReportListEntry>();
    const [simRound, setSimRound] = useState(1);
    const [spinAdvancedOpened, {toggle: toggleSpinAdvanced}] = useDisclosure(false);

    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const terminal = progress !== undefined && !active;

    // Auto-advances from Reproduce to Inspect the moment a run that was actually active goes terminal --
    // mirrors SimulationTab's own Run -> Review effect. Session Spin never populates `progress`, so this
    // never fires for that method (its Load step jumps straight to Inspect instead).
    const prevStatusRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const status = progress?.status;
        const wasActive = prevStatusRef.current === "queued" || prevStatusRef.current === "running";
        const nowTerminal = status === "completed" || status === "failed" || status === "cancelled";
        if (wasActive && nowTerminal) {
            setActiveStep(3);
        }
        prevStatusRef.current = status;
    }, [progress?.status]);

    function goToLoad(round: number, seed: string | undefined): void {
        setPending({round, seed});
        setActiveStep(1);
    }

    const inspectReachable = (findMethod === "spin" && selectedSpin !== undefined) || result !== undefined;
    const exportReachable = inspectReachable;

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Best-effort reproducibility: replay plays a fresh session forward from round 1 using the same seed, and
                matches exactly for deterministic games. A game whose logic doesn&apos;t depend solely on the seed (e.g. it
                reads external state) may not reproduce the original round.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Find" description="Locate a round" />
                <Stepper.Step label="Load" description="Confirm & validate" />
                <Stepper.Step label="Reproduce" description="Run the replay" disabled={findMethod === "spin"} />
                <Stepper.Step label="Inspect" description="See results" disabled={!inspectReachable} />
                <Stepper.Step label="Export" description="Download" disabled={!exportReachable} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <SegmentedControl
                        value={findMethod}
                        onChange={(value) => {
                            setFindMethod(value as FindMethod);
                            onClearExpected();
                        }}
                        data={[
                            {label: "Seed & Round", value: "seedRound"},
                            {label: "Replay Artifact", value: "artifact"},
                            {label: "Session Spin", value: "spin"},
                            {label: "Recent Simulation", value: "simulation"},
                        ]}
                        mb="md"
                        aria-label="Find method"
                    />

                    {findMethod === "seedRound" && (
                        <form onSubmit={form.onSubmit((values) => goToLoad(values.round, values.seed.trim() || undefined))}>
                            <QuickActions>
                                <NumberInput label="Round" min={1} step={1} required {...form.getInputProps("round")} key={form.key("round")} />
                                <TextInput label="Seed (optional)" {...form.getInputProps("seed")} key={form.key("seed")} />
                                <Button type="submit">Find</Button>
                            </QuickActions>
                        </form>
                    )}

                    {findMethod === "artifact" && (
                        <div>
                            <Textarea
                                label="Paste a replay artifact JSON (downloaded from Export)"
                                minRows={6}
                                autosize
                                maxRows={16}
                                value={artifactText}
                                onChange={(event) => setArtifactText(event.currentTarget.value)}
                                mb="sm"
                            />
                            <QuickActions>
                                <Button
                                    disabled={artifactText.trim() === ""}
                                    onClick={() => {
                                        onLoadExpectedFromPaste(artifactText);
                                        setActiveStep(1);
                                    }}
                                >
                                    Validate &amp; continue
                                </Button>
                            </QuickActions>

                            <PageSection legend="Or pick from Recent Replays to reproduce & compare">
                                <QuickActions>
                                    <Button variant="default" size="xs" onClick={onRefreshList}>
                                        Refresh
                                    </Button>
                                </QuickActions>
                                {listError && <ErrorState message={listError} />}
                                {listView.status === "empty" && <EmptyState message="No replays run yet." />}
                                {listView.status === "loaded" && (
                                    <List listStyleType="none" spacing={4}>
                                        {listView.entries.map((entry) => (
                                            <List.Item key={entry.id}>
                                                <Anchor
                                                    component="button"
                                                    type="button"
                                                    onClick={() => {
                                                        onCompareStored(entry.id);
                                                        setActiveStep(1);
                                                    }}
                                                    style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                                >
                                                    {entry.game?.id ?? "?"} round {entry.round} — {entry.status}
                                                </Anchor>
                                            </List.Item>
                                        ))}
                                    </List>
                                )}
                            </PageSection>
                        </div>
                    )}

                    {findMethod === "spin" && (
                        <div>
                            <QuickActions>
                                <Button variant="default" size="xs" onClick={onRefreshRecentSpins}>
                                    Refresh
                                </Button>
                            </QuickActions>
                            {recentSpinsError && <ErrorState message={recentSpinsError} />}
                            {recentSpins.status === "empty" && (
                                <EmptyState message="No spins recorded yet in this Studio session — start the runtime and spin a session first." />
                            )}
                            {recentSpins.status === "loaded" && (
                                <List listStyleType="none" spacing={4}>
                                    {recentSpins.entries.map((entry, index) => (
                                        <List.Item key={`${entry.sessionId}-${entry.debug?.requestId ?? "none"}-${index}`}>
                                            <Anchor
                                                component="button"
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSpin(entry);
                                                    setActiveStep(1);
                                                }}
                                                style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                            >
                                                session {entry.sessionId} — credits {entry.credits}, win {entry.win ?? 0}
                                                {entry.debug?.requestId ? `, request ${entry.debug.requestId}` : ""}
                                            </Anchor>
                                        </List.Item>
                                    ))}
                                </List>
                            )}
                        </div>
                    )}

                    {findMethod === "simulation" && (
                        <div>
                            <QuickActions>
                                <Button variant="default" size="xs" onClick={onRefreshRecentRuns}>
                                    Refresh
                                </Button>
                            </QuickActions>
                            {recentRunsError && <ErrorState message={recentRunsError} />}
                            {recentRuns.status === "empty" && <EmptyState message="No completed simulations yet." />}
                            {recentRuns.status === "loaded" && (
                                <List listStyleType="none" spacing={4} mb="sm">
                                    {recentRuns.entries.map((entry) => (
                                        <List.Item key={entry.id}>
                                            <Anchor
                                                component="button"
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSimEntry(entry);
                                                    setSimRound(1);
                                                }}
                                                style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                            >
                                                {entry.game.id} v{entry.game.version} — seed {entry.seed ?? "(none)"}, {entry.actualRounds} rounds,{" "}
                                                {new Date(entry.startedAt).toLocaleString()}
                                            </Anchor>
                                        </List.Item>
                                    ))}
                                </List>
                            )}
                            {selectedSimEntry && (
                                <QuickActions>
                                    <NumberInput
                                        label="Round"
                                        min={1}
                                        max={selectedSimEntry.actualRounds}
                                        step={1}
                                        value={simRound}
                                        onChange={(value) => setSimRound(typeof value === "number" ? value : 1)}
                                    />
                                    <Button onClick={() => goToLoad(simRound, selectedSimEntry.seed)}>Find</Button>
                                </QuickActions>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeStep === 1 && (
                <div>
                    {findMethod === "spin" &&
                        (selectedSpin ? (
                            <div>
                                <Text size="sm" mb="sm">
                                    This is a live spin&apos;s actual recorded result — there&apos;s nothing to reproduce it against.
                                </Text>
                                <QuickActions>
                                    <Button onClick={() => setActiveStep(3)}>Continue to Inspect</Button>
                                </QuickActions>
                            </div>
                        ) : (
                            <EmptyState message="Pick a spin in the Find step first." />
                        ))}

                    {findMethod === "artifact" && (
                        <div>
                            {expected.status === "empty" && (
                                <EmptyState message="Paste a replay artifact or pick one from Recent Replays in the Find step first." />
                            )}
                            {expected.status === "loading" && <LoadingState label="Validating artifact…" />}
                            {expected.status === "error" && <ErrorState message={expected.message} />}
                            {expected.status === "loaded" && (
                                <div>
                                    <Text size="sm" mb="xs">
                                        Round {expected.round}, seed {expected.seed ?? "(none)"}.
                                    </Text>
                                    {expected.artifactWarnings.length > 0 && (
                                        <List size="sm" mb="sm">
                                            {expected.artifactWarnings.map((warning, index) => (
                                                <List.Item key={index}>{warning}</List.Item>
                                            ))}
                                        </List>
                                    )}
                                    <QuickActions>
                                        <Button
                                            onClick={() => {
                                                onRun(expected.round, expected.seed, true);
                                                setActiveStep(2);
                                            }}
                                        >
                                            Continue to Reproduce
                                        </Button>
                                    </QuickActions>
                                </div>
                            )}
                        </div>
                    )}

                    {(findMethod === "seedRound" || findMethod === "simulation") &&
                        (pending ? (
                            <div>
                                <Text size="sm" mb="sm">
                                    About to reproduce round {pending.round} with seed {pending.seed ?? "(none)"}.
                                </Text>
                                <QuickActions>
                                    <Button
                                        onClick={() => {
                                            onRun(pending.round, pending.seed);
                                            setActiveStep(2);
                                        }}
                                    >
                                        Continue to Reproduce
                                    </Button>
                                </QuickActions>
                            </div>
                        ) : (
                            <EmptyState message="Find a round first." />
                        ))}
                </div>
            )}

            {activeStep === 2 && (
                <div>
                    {progress === undefined && <EmptyState message="Nothing to reproduce yet." />}
                    {progress?.status === "failed" && error === undefined && <ErrorState message={progress.error ?? "Replay failed."} />}
                    {error && <ErrorState message={error} />}
                    {progress !== undefined && (
                        <div>
                            <Text size="sm" mb={4}>
                                {progress.status} — {progress.completedRounds}/{progress.round} rounds
                            </Text>
                            <Progress value={progress.percent} mb="sm" />
                            <QuickActions>
                                {active && (
                                    <Button color="red" variant="light" onClick={() => confirm("Cancel the running replay?", onCancel)}>
                                        Cancel
                                    </Button>
                                )}
                                {terminal && (
                                    <Button variant="default" onClick={onRetry}>
                                        Run again with the same parameters
                                    </Button>
                                )}
                                {terminal && (
                                    <Button variant="default" onClick={() => setActiveStep(3)}>
                                        View results
                                    </Button>
                                )}
                            </QuickActions>
                        </div>
                    )}
                </div>
            )}

            {activeStep === 3 && (
                <div>
                    {findMethod === "spin" && selectedSpin && (
                        <div>
                            <Table withRowBorders={false} mb="sm">
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Th>Game</Table.Th>
                                        <Table.Td style={{overflowWrap: "anywhere"}}>
                                            {selectedSpin.game.name} (id: &quot;{selectedSpin.game.id}&quot;, v{selectedSpin.game.version})
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Session</Table.Th>
                                        <Table.Td style={{overflowWrap: "anywhere"}}>{selectedSpin.sessionId}</Table.Td>
                                    </Table.Tr>
                                    {selectedSpin.debug?.requestId && (
                                        <Table.Tr>
                                            <Table.Th>Request id</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{selectedSpin.debug.requestId}</Table.Td>
                                        </Table.Tr>
                                    )}
                                    <Table.Tr>
                                        <Table.Th>Credits</Table.Th>
                                        <Table.Td>{selectedSpin.credits}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Bet</Table.Th>
                                        <Table.Td>{selectedSpin.bet ?? "—"}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Win</Table.Th>
                                        <Table.Td>{selectedSpin.win ?? 0}</Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>

                            {selectedSpin.screen ? (
                                <ScreenTable screen={describeRuntimeScreen(selectedSpin.screen) ?? []} />
                            ) : (
                                <Text size="sm" c="dimmed">
                                    No screen available.
                                </Text>
                            )}

                            {(selectedSpin.debug?.stateBefore !== undefined || selectedSpin.debug?.stateAfter !== undefined) && (
                                <PageSection legend="State before / after">
                                    {selectedSpin.debug?.stateBefore !== undefined && (
                                        <div>
                                            <Text size="sm" fw={600} mb={4}>
                                                Before
                                            </Text>
                                            <CodeBlock>{JSON.stringify(selectedSpin.debug.stateBefore, null, 2)}</CodeBlock>
                                        </div>
                                    )}
                                    {selectedSpin.debug?.stateAfter !== undefined && (
                                        <div>
                                            <Text size="sm" fw={600} mt="sm" mb={4}>
                                                After
                                            </Text>
                                            <CodeBlock>{JSON.stringify(selectedSpin.debug.stateAfter, null, 2)}</CodeBlock>
                                        </div>
                                    )}
                                </PageSection>
                            )}

                            <Text size="sm" mt="sm">
                                <Anchor component="button" type="button" onClick={toggleSpinAdvanced}>
                                    {spinAdvancedOpened ? "Hide" : "Show"} advanced details (raw JSON, debug data)
                                </Anchor>
                            </Text>
                            {spinAdvancedOpened && (
                                <PageSection legend="Advanced details">
                                    {selectedSpin.debug?.debugData && (
                                        <div>
                                            <Group gap="xs" mb={4}>
                                                <Text size="sm" fw={600}>
                                                    Debug data
                                                </Text>
                                                <Badge size="xs" variant="light">
                                                    game-provided, may include RNG/reel-stop data
                                                </Badge>
                                            </Group>
                                            <CodeBlock>{JSON.stringify(selectedSpin.debug.debugData, null, 2)}</CodeBlock>
                                        </div>
                                    )}
                                    <Text size="sm" fw={600} mt="sm" mb={4}>
                                        Full session view
                                    </Text>
                                    <CodeBlock>{JSON.stringify(selectedSpin, null, 2)}</CodeBlock>
                                </PageSection>
                            )}
                        </div>
                    )}

                    {findMethod !== "spin" && result?.artifact && (
                        <RoundArtifactInspector
                            artifact={result.artifact}
                            comparison={comparison}
                            stateBefore={result.stateBefore}
                            stateAfter={result.stateAfter}
                        />
                    )}

                    {findMethod !== "spin" && result && !result.artifact && (
                        <div>
                            <Table withRowBorders={false} mb="sm">
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Th>Game</Table.Th>
                                        <Table.Td style={{overflowWrap: "anywhere"}}>
                                            {result.game.name} (id: &quot;{result.game.id}&quot;, v{result.game.version})
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Round</Table.Th>
                                        <Table.Td>{result.round}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Seed</Table.Th>
                                        <Table.Td>{result.seed ?? "(none)"}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Total bet</Table.Th>
                                        <Table.Td>{result.totalBet.toFixed(2)}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Total payout</Table.Th>
                                        <Table.Td>{result.totalWin.toFixed(2)}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Timestamp</Table.Th>
                                        <Table.Td>{new Date(result.timestamp).toLocaleString()}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Duration</Table.Th>
                                        <Table.Td>{result.durationMs}ms</Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                            {result.screen ? (
                                <ScreenTable screen={result.screen} />
                            ) : (
                                <Text size="sm" c="dimmed">
                                    No screen available — this game&apos;s session doesn&apos;t expose a symbols combination.
                                </Text>
                            )}
                        </div>
                    )}

                    {findMethod !== "spin" && !result && <EmptyState message="Reproduce a round to inspect it." />}
                </div>
            )}

            {activeStep === 4 && (
                <div>
                    {findMethod === "spin" && selectedSpin && (
                        <QuickActions>
                            <Button variant="default" onClick={() => downloadJsonBlob(`spin-${selectedSpin.sessionId}.json`, selectedSpin)}>
                                Download JSON
                            </Button>
                        </QuickActions>
                    )}
                    {findMethod !== "spin" && result && (
                        <QuickActions>
                            <Anchor href={buildReplayDownloadUrl(result.id)} download>
                                Download JSON
                            </Anchor>
                        </QuickActions>
                    )}
                    {((findMethod === "spin" && !selectedSpin) || (findMethod !== "spin" && !result)) && (
                        <EmptyState message="Complete a replay to export it." />
                    )}
                </div>
            )}

            <PageSection legend="Recent Replays">
                <QuickActions>
                    <Button variant="default" onClick={onRefreshList}>
                        Refresh
                    </Button>
                </QuickActions>
                {listError && <ErrorState message={listError} />}
                {listView.status === "empty" && <EmptyState message="No replays run yet." />}
                {listView.status === "loaded" && (
                    <List listStyleType="none" spacing={4}>
                        {listView.entries.map((entry) => (
                            <List.Item key={entry.id}>
                                <Group gap="xs" wrap="wrap" align="baseline">
                                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                        {entry.game?.id ?? "?"} round {entry.round} — {entry.status}
                                    </Text>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        onClick={() => {
                                            setFindMethod("seedRound");
                                            onInspectStored(entry.id);
                                            setActiveStep(3);
                                        }}
                                    >
                                        Inspect
                                    </Anchor>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        onClick={() => {
                                            setFindMethod("artifact");
                                            onCompareStored(entry.id);
                                            setActiveStep(1);
                                        }}
                                    >
                                        Reproduce &amp; compare
                                    </Anchor>
                                </Group>
                            </List.Item>
                        ))}
                    </List>
                )}
            </PageSection>
        </div>
    );
}

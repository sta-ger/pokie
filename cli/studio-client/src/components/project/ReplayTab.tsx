import {Anchor, Button, List, NumberInput, Progress, Table, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import type {ReplayListView, ReplayProgressView, ReplayResultView} from "../../domain/interpret/Replay";
import {buildReplayDownloadUrl} from "../../api/apiClient";
import {useConfirm} from "../../hooks/useConfirm";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {ScreenTable} from "../common/ScreenTable";

type FormValues = {round: number; seed: string};

export function ReplayTab({
    progress,
    result,
    error,
    onRun,
    onCancel,
    onRerun,
    listView,
    listError,
    onRefreshList,
    onSelect,
}: {
    progress: ReplayProgressView | undefined;
    result: ReplayResultView | undefined;
    error: string | undefined;
    onRun: (round: number, seed: string | undefined) => void;
    onCancel: () => void;
    onRerun: () => void;
    listView: ReplayListView;
    listError: string | undefined;
    onRefreshList: () => void;
    onSelect: (id: string) => void;
}) {
    const confirm = useConfirm();
    const form = useForm<FormValues>({mode: "uncontrolled", initialValues: {round: 1, seed: ""}});

    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const terminal = progress !== undefined && !active;

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Best-effort reproducibility: replay plays a fresh session forward from round 1 using the same seed, and
                matches exactly for deterministic games. A game whose logic doesn&apos;t depend solely on the seed (e.g. it
                reads external state) may not reproduce the original round.
            </Text>

            <form onSubmit={form.onSubmit((values) => onRun(values.round, values.seed.trim() || undefined))}>
                <QuickActions>
                    <NumberInput label="Round" min={1} step={1} required {...form.getInputProps("round")} key={form.key("round")} />
                    <TextInput label="Seed (optional)" {...form.getInputProps("seed")} key={form.key("seed")} />
                    <Button type="submit">Run Replay</Button>
                </QuickActions>
            </form>

            {progress === undefined && <EmptyState message="No replay has been run yet." />}
            {progress?.status === "failed" && error === undefined && <ErrorState message={progress.error ?? "Replay failed."} />}
            {error && <ErrorState message={error} />}

            {progress !== undefined && (
                <div>
                    <Text size="sm" mb={4}>
                        {progress.status} — {progress.completedRounds}/{progress.round} rounds
                    </Text>
                    <Progress value={progress.percent} mb="sm" />
                    {active && (
                        <QuickActions>
                            <Button color="red" variant="light" onClick={() => confirm("Cancel the running replay?", onCancel)}>
                                Cancel
                            </Button>
                        </QuickActions>
                    )}
                </div>
            )}

            {terminal && (
                <QuickActions>
                    <Button variant="default" onClick={onRerun}>
                        Run again with the same parameters
                    </Button>
                </QuickActions>
            )}

            {progress?.status === "completed" && result && (
                <div>
                    <Table withRowBorders={false} mb="sm">
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Th>Game</Table.Th>
                                <Table.Td>
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

                    <Anchor href={buildReplayDownloadUrl(result.id)} download>
                        Download JSON
                    </Anchor>
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
                                <Anchor component="button" type="button" onClick={() => onSelect(entry.id)}>
                                    {entry.game?.id ?? "?"} round {entry.round} — {entry.status}
                                </Anchor>
                            </List.Item>
                        ))}
                    </List>
                )}
            </PageSection>
        </div>
    );
}

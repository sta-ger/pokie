import {Alert, Button, Group, SimpleGrid, Stack, Table, Text, Title} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import {
    cancelOutcomeLibraryGeneration,
    getExactMath,
    getOutcomeLibraryGenerationJob,
    OutcomeLibraryGenerationStartError,
    startOutcomeLibraryGeneration,
} from "../../api/apiClient";
import type {StudioExactMathContributionTable, StudioExactMathView, StudioOutcomeLibraryGenerateJobView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {ExactPayoutDistribution} from "../common/ExactPayoutDistribution";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";

const STAGE_LABELS: Record<string, string> = {
    generation: "Enumerating combinations",
    finalization: "Preparing outcomes",
    writing: "Writing the library",
    analyzing: "Analyzing outcomes",
    "building-index": "Indexing outcomes",
    serialization: "Serializing outcomes",
    validation: "Validating the library",
    publication: "Publishing the library",
};

function formatElapsed(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms)) return "—";
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function isTerminal(job: StudioOutcomeLibraryGenerateJobView): boolean {
    return job.status === "completed" || job.status === "failed" || job.status === "cancelled" || job.status === "recovery-required";
}

function jobError(job: StudioOutcomeLibraryGenerateJobView): string {
    const result = job.result;
    if (result !== undefined && "error" in result && typeof result.error === "string") return result.error;
    if (result !== undefined && "errors" in result && Array.isArray(result.errors)) return result.errors.map((issue) => issue.message).join("; ");
    return `Exact-math generation ended with status "${job.status}".`;
}

/**
 * Overview's exact-math card. Reads an already-computed compatible Outcome Library and offers an explicit
 * one-click generation when none exists. It never treats a sampled Simulation report as exact, and a
 * stale library is reported as stale rather than silently shown as current.
 */
export function ExactMathPanel({projectRoot, sourceRevision}: {projectRoot: string; sourceRevision?: string}) {
    const fetchImpl = useStudioApi();
    const [view, setView] = useState<StudioExactMathView | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [starting, setStarting] = useState(false);
    const [job, setJob] = useState<StudioOutcomeLibraryGenerateJobView>();
    const [notice, setNotice] = useState<string>();
    const loadGeneration = useRef(0);
    const pollGeneration = useRef(0);

    const load = (): void => {
        const generation = ++loadGeneration.current;
        setLoading(true);
        setError(undefined);
        getExactMath(fetchImpl)
            .then((next) => {
                if (generation === loadGeneration.current) setView(next);
            })
            .catch((failure: unknown) => {
                if (generation === loadGeneration.current) setError(errorMessage(failure));
            })
            .finally(() => {
                if (generation === loadGeneration.current) setLoading(false);
            });
    };

    useEffect(() => {
        setJob(undefined);
        setNotice(undefined);
        load();
        const loadToken = loadGeneration;
        const pollToken = pollGeneration;
        return () => {
            loadToken.current++;
            pollToken.current++;
        };
        // sourceRevision is intentional: an applied optimization changes the saved design, and keeping
        // an old exact result visible would falsely present it as current.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl, projectRoot, sourceRevision]);

    const poll = async (id: string): Promise<void> => {
        const generation = ++pollGeneration.current;
        for (;;) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000);
            });
            if (generation !== pollGeneration.current) return;
            let next: StudioOutcomeLibraryGenerateJobView;
            try {
                next = await getOutcomeLibraryGenerationJob(fetchImpl, id);
            } catch (failure) {
                if (generation === pollGeneration.current) {
                    setError(errorMessage(failure));
                    setStarting(false);
                }
                return;
            }
            if (generation !== pollGeneration.current) return;
            setJob(next);
            if (!isTerminal(next)) continue;
            setStarting(false);
            if (next.status === "completed") {
                setNotice("Exact Outcome Library generated. The figures below are exact for this saved design.");
                load();
            } else if (next.status === "cancelled") {
                setNotice("Exact-math generation was cancelled. The previous result, if any, is unchanged.");
            } else {
                setError(jobError(next));
            }
            return;
        }
    };

    const start = (): void => {
        setStarting(true);
        setError(undefined);
        setNotice(undefined);
        startOutcomeLibraryGeneration(fetchImpl, {generation: "exact"})
            .then((started) => {
                setJob(started);
                poll(started.id).catch((failure: unknown) => {
                    setStarting(false);
                    setError(errorMessage(failure));
                });
            })
            .catch((failure: unknown) => {
                setStarting(false);
                if (failure instanceof OutcomeLibraryGenerationStartError && failure.outcomeStatus === "requires-bounded") {
                    setError("This game's outcome space is too large for one-click exact enumeration. Use Build/Export → Outcome libraries to generate a sampled library, or raise the exact cap explicitly.");
                } else {
                    setError(errorMessage(failure));
                }
            });
    };

    const cancel = (): void => {
        if (job === undefined) return;
        cancelOutcomeLibraryGeneration(fetchImpl, job.id)
            .then(setJob)
            .catch((failure: unknown) => setError(errorMessage(failure)));
    };

    const active = job !== undefined && !isTerminal(job) && job.status !== "recovery-required";
    const progress = job?.progress;
    const elapsedMs = job?.durationMs ?? (job?.startedAt === undefined ? undefined : Date.now() - job.startedAt);
    const processedRaw = progress === undefined ? undefined : Number(progress.processedRawIndex);
    const totalRaw = progress === undefined ? undefined : Number(progress.progressTotal);
    const estimate = active && processedRaw !== undefined && totalRaw !== undefined && elapsedMs !== undefined && processedRaw > 0 && totalRaw > processedRaw
        ? formatElapsed((elapsedMs / processedRaw) * (totalRaw - processedRaw))
        : undefined;

    let body: React.ReactNode;
    if (loading && view === undefined) {
        body = <LoadingState label="Reading exact math…" />;
    } else if (view?.status === "ok") {
        const analysis = view.analysis;
        const contribution = view.contributions;
        body = (
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Exact, not sampled: all {view.outcomeCount.toLocaleString("en-US")} weighted outcomes of mode &quot;{view.modeName}&quot; were enumerated. The library is a fixed snapshot of this saved design.
                </Text>
                <SimpleGrid cols={{base: 2, md: 5}} spacing="sm">
                    <Metric label="Exact RTP" value={`${formatAnalysisNumber(analysis.rtp * 100, 4)}%`} />
                    <Metric label="Hit frequency" value={`${formatAnalysisNumber(analysis.hitFrequency * 100, 4)}%`} />
                    <Metric label="Volatility (std. dev.)" value={formatAnalysisNumber(analysis.standardDeviation, 4)} />
                    <Metric label="Max win (× bet)" value={formatAnalysisNumber(analysis.maxWin / view.stake, 4)} />
                    <Metric label="Outcomes" value={view.outcomeCount.toLocaleString("en-US")} />
                </SimpleGrid>
                <Text size="xs" c="dimmed">
                    Library {view.libraryId} · generated {view.generatedAt}{view.strategy === undefined ? "" : ` · ${view.strategy}`}
                </Text>
                <ExactPayoutDistribution buckets={analysis.payoutDistribution} />
                {(contribution.line.entries.length > 0 || contribution.symbol.entries.length > 0) && (
                    <AdvancedDisclosure label="line and symbol contributions">
                        <Text size="sm" c="dimmed" mb="xs">
                            Exact weighted contribution to RTP, using the same per-unit-stake scale as the RTP above. A round can contain several winning lines or symbols, so these rows overlap and must not be added together as an RTP decomposition.
                        </Text>
                        {contribution.line.entries.length > 0 && (
                            <>
                                <Text fw={600} size="sm" mt="xs">Line contributions</Text>
                                <ContributionTable entries={contribution.line.entries} />
                            </>
                        )}
                        {contribution.symbol.entries.length > 0 && (
                            <>
                                <Text fw={600} size="sm" mt="xs">Symbol contributions</Text>
                                <ContributionTable entries={contribution.symbol.entries} />
                            </>
                        )}
                        {view.contributionNote !== undefined && <Text size="xs" c="dimmed" mt="xs">{view.contributionNote}</Text>}
                    </AdvancedDisclosure>
                )}
                {view.contributionNote !== undefined && (contribution.line.entries.length === 0 && contribution.symbol.entries.length === 0) && (
                    <Text size="xs" c="dimmed">{view.contributionNote}</Text>
                )}
                <Group>
                    <Button variant="default" size="xs" onClick={start} loading={starting || active}>
                        Recompute exact math
                    </Button>
                </Group>
            </Stack>
        );
    } else if (view?.status === "missing" || view?.status === "stale") {
        const stale = view.status === "stale";
        body = (
            <Stack gap="sm">
                <EmptyState message={view.message} />
                {stale && <Text size="sm" c="dimmed">Generating again replaces the stale library with one computed from the current saved design.</Text>}
                <Group>
                    <Button onClick={start} loading={starting || active}>
                        {stale ? "Recompute exact math" : "Compute exact math"}
                    </Button>
                </Group>
                <Text size="xs" c="dimmed">
                    This writes an exact Outcome Library into the project&apos;s <code>outcomelibrary</code> folder. It can take a while for a large game; progress is shown below.
                </Text>
            </Stack>
        );
    } else if (view?.status === "error") {
        body = (
            <Stack gap="sm">
                <ErrorState message={view.message} />
                <Group>
                    <Button variant="default" size="xs" onClick={load} loading={loading}>Retry exact-math read</Button>
                    <Button variant="default" size="xs" onClick={start} loading={starting || active}>Compute exact math</Button>
                </Group>
            </Stack>
        );
    } else {
        body = <LoadingState label="Reading exact math…" />;
    }

    return (
        <PageSection legend="Exact math">
            <Title order={4}>Exact math for this saved design</Title>
            <Text size="sm" c="dimmed" mb="sm">
                Exact RTP and payout probabilities need one complete enumeration of the game design. Simulation is still an estimate; this card never presents a sampled report as exact.
            </Text>
            {error !== undefined && <ErrorState message={error} />}
            {notice !== undefined && <Alert color="green" mb="sm">{notice}</Alert>}
            {active && (
                <Alert color="blue" mb="sm" title="Generating exact outcomes">
                    <Text size="sm">
                        {STAGE_LABELS[job.lifecycleStage ?? ""] ?? job.lifecycleStage ?? "Working"} · {formatElapsed(elapsedMs)} elapsed
                        {progress === undefined ? "" : ` · ${Number(progress.processedRawIndex).toLocaleString("en-US")} / ${Number(progress.progressTotal).toLocaleString("en-US")} combinations`}
                        {estimate === undefined ? "" : ` · ETA ~${estimate}`}
                    </Text>
                    <Group mt="xs">
                        {!job.cancellationRequested && <Button color="red" variant="light" size="xs" onClick={cancel}>Cancel</Button>}
                        {job.cancellationRequested && <Text size="sm">Cancellation requested; waiting for safe cleanup.</Text>}
                    </Group>
                </Alert>
            )}
            {body}
        </PageSection>
    );
}

function Metric({label, value}: {label: string; value: string}) {
    return (
        <div>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={600}>{value}</Text>
        </div>
    );
}

function ContributionTable({entries}: {entries: StudioExactMathContributionTable["entries"]}) {
    return (
        <Table withRowBorders={false} aria-label="Exact line and symbol contributions">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Win</Table.Th>
                    <Table.Th>RTP contribution</Table.Th>
                    <Table.Th>Hit frequency</Table.Th>
                    <Table.Th>Outcomes</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {entries.map((entry) => (
                    <Table.Tr key={entry.key}>
                        <Table.Td>{entry.label}</Table.Td>
                        <Table.Td>{formatAnalysisNumber(entry.rtpContribution * 100, 4)}%</Table.Td>
                        <Table.Td>{formatAnalysisNumber(entry.hitFrequency * 100, 4)}%</Table.Td>
                        <Table.Td>{entry.outcomeCount.toLocaleString("en-US")}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}

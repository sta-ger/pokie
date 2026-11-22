import {JobObservationNotice} from "../common/JobObservationNotice";
import {OptimizationPreview} from "./OptimizationPreview";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {PageSection} from "../common/PageSection";
import {Alert, Button, Checkbox, Code, Group, NumberInput, Select, Stack, Table, Text, Textarea, TextInput, Title} from "@mantine/core";
import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from "react";
import {getGameModel, optimizationAction} from "../../api/apiClient";
import type {
    GameModelProjection,
    StudioJobView,
    StudioOptimizationRequest,
    StudioOptimizationResult,
    StudioOptimizationSupport,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import type {useProjectJobs} from "../../hooks/useProjectJobs";
import {useConfirm} from "../../hooks/useConfirm";
import {validateOptimizationRequest} from "../../../../../src/optimization/validateOptimizationRequest";
import {
    buildDefaultOptimizationRequest,
    defaultTargetForMetric,
    describeTunablePath,
    findOptimizationMetric,
    formatTunableValues,
    metricDisplayTolerance,
    metricDisplayValue,
    OPTIMIZATION_METRICS,
    optimizationDomainSize,
    parseTunableValues,
    paytablePath,
    paytableRowForPath,
    paytableRows,
    suggestedTunableValues,
} from "../../domain/optimizationRequest";

const OPTIMIZATION_STATUS_LABEL: Record<StudioJobView["status"], string> = {
    queued: "Queued",
    running: "Running",
    cancelling: "Cancelling",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    "recovery-required": "Recovery required",
};

const MAX_SEARCH_BUDGET = 1_000_000;
const MAX_EXACT_OUTCOMES = 1_000_000;

type OptimizationEvidence = NonNullable<StudioOptimizationResult["evidence"]>;

function OptimizationSummary({evidence}: {evidence: OptimizationEvidence}) {
    const targets = evidence.request.targets;
    const measured = evidence.measured;
    const sampled = evidence.strategy === "seeded-search-v1";
    return (
        <div>
            {sampled && <Text size="xs" c="dimmed" mb="xs">Measured values are the held-out assessment estimates; open the full mathematical evidence for intervals.</Text>}
            <Table withRowBorders={false} aria-label="Optimization target result">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Metric</Table.Th>
                        <Table.Th>Target</Table.Th>
                        <Table.Th>{sampled ? "Measured" : "Exact"}</Table.Th>
                        <Table.Th>Result</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {targets.map((target, index) => {
                        const option = findOptimizationMetric(target);
                        const value = sampled ? evidence.stochastic?.assessment?.targets[index]?.estimate : measured?.[index];
                        const targetValue = option === undefined ? target.value : metricDisplayValue(target, option);
                        let measuredValue: number | undefined;
                        if (value !== undefined) measuredValue = option === undefined ? value : value * option.scale;
                        let tolerance: number | undefined;
                        if (target.tolerance !== undefined) tolerance = option === undefined ? target.tolerance.value : metricDisplayTolerance(target, option);
                        let allowance: number | undefined;
                        if (target.tolerance !== undefined) allowance = target.tolerance.kind === "relative" ? Math.abs(target.value) * target.tolerance.value : target.tolerance.value;
                        const attained = value !== undefined && allowance !== undefined ? Math.abs(value - target.value) <= allowance : undefined;
                        let attainedLabel = "—";
                        if (attained !== undefined) attainedLabel = attained ? "attained" : "missed";
                        const suffix = option?.valueSuffix ?? "";
                        const toleranceSuffix = option?.toleranceSuffix ?? "";
                        return (
                            <Table.Tr key={index}>
                                <Table.Td>{option?.label ?? target.metric}{target.event ? ` (${target.event})` : ""}</Table.Td>
                                <Table.Td>{targetValue.toFixed(2)}{suffix}{tolerance === undefined ? "" : ` ± ${tolerance.toFixed(2)}${toleranceSuffix}`}</Table.Td>
                                <Table.Td>{measuredValue === undefined ? "—" : `${measuredValue.toFixed(4)}${suffix}`}</Table.Td>
                                <Table.Td>{attainedLabel}</Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
            {evidence.diff !== undefined && evidence.diff.length > 0 && (
                <Table withRowBorders={false} aria-label="Selected parameter changes" mt="sm">
                    <Table.Thead>
                        <Table.Tr><Table.Th>Selected change</Table.Th><Table.Th>Before</Table.Th><Table.Th>After</Table.Th></Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {evidence.diff.map((change) => (
                            <Table.Tr key={change.path}>
                                <Table.Td>{describeTunablePath(change.path)}</Table.Td>
                                <Table.Td>{String(change.before)}</Table.Td>
                                <Table.Td>{String(change.after)}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
        </div>
    );
}

function asNumber(value: string | number): number | undefined {
    if (value === "") return undefined;
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : undefined;
}

function TunableValuesInput({label, values, onCommit}: {
    label: string;
    values: readonly (number | string)[];
    onCommit: (values: number[]) => void;
}) {
    const formatted = formatTunableValues(values);
    const [draft, setDraft] = useState(formatted);
    const [error, setError] = useState<string>();
    useEffect(() => {
        setDraft(formatted);
        setError(undefined);
    }, [formatted]);
    if (values.some((value) => typeof value !== "number")) {
        return <Text size="xs" c="dimmed">{formatted} — edit non-numeric values in the expert JSON policy.</Text>;
    }
    return (
        <TextInput
            size="xs"
            aria-label={`Candidate values for ${label}`}
            description="Comma-separated finite numbers."
            value={draft}
            error={error}
            onChange={(event) => {
                setDraft(event.currentTarget.value);
                setError(undefined);
            }}
            onBlur={() => {
                const parsed = parseTunableValues(draft);
                if (parsed.error !== undefined || parsed.values === undefined) {
                    setError(parsed.error ?? "Enter at least one candidate value.");
                    setDraft(formatted);
                    return;
                }
                onCommit(parsed.values);
            }}
        />
    );
}

/** A form view over the same validated request document the expert editor exposes. */
export function OptimizationPanel({projectRoot, jobs, recoveryJob, sourceChange, onStarted, onApplied}: {
    projectRoot: string;
    jobs: ReturnType<typeof useProjectJobs>;
    recoveryJob?: {id?: string; request: StudioJobView["request"]};
    sourceChange?: {sourceRevision?: string};
    onStarted?: (sourceRevision: string) => void;
    onApplied?: () => void;
}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const runExplanationId = useId();
    const [text, setText] = useState(() => JSON.stringify(buildDefaultOptimizationRequest(), null, 2));
    const [model, setModel] = useState<GameModelProjection>();
    const [modelError, setModelError] = useState<string>();
    const [modelLoading, setModelLoading] = useState(true);
    const [supportSnapshot, setSupportSnapshot] = useState<{value: StudioOptimizationSupport; sourceChange: typeof sourceChange}>();
    const support = supportSnapshot?.sourceChange === sourceChange ? supportSnapshot?.value : undefined;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [destination, setDestination] = useState("");
    const [saved, setSaved] = useState<string>();
    const [applied, setApplied] = useState(false);
    const [undo, setUndo] = useState<string>();
    const [undoNotice, setUndoNotice] = useState<string>();
    const [started, setStarted] = useState<StudioJobView>();
    const [fieldFilter, setFieldFilter] = useState("");
    const [customField, setCustomField] = useState("");
    const generation = useRef(0);
    const edited = useRef(false);
    const controller = useRef<AbortController | undefined>(undefined);
    const resultRef = useRef<HTMLDivElement>(null);
    const lastResultJob = useRef<string | undefined>(undefined);

    useEffect(
        () => {
            setApplied(false);
            setSupportSnapshot(undefined);
            setStarted(undefined);
            setSaved(undefined);
            setError(undefined);
            setUndo(undefined);
            setUndoNotice(undefined);
            setBusy(false);
            setFieldFilter("");
            setCustomField("");
            edited.current = false;
            const invalidate = (): void => {
                generation.current++;
                controller.current?.abort();
            };
            return invalidate;
        },
        [projectRoot],
    );
    // Retire an old support/action response even when this panel stays mounted during Apply.
    // The dashboard owns this boundary so leaving Game Model cannot forget an accepted Save.
    useLayoutEffect(() => {
        generation.current++;
        controller.current?.abort();
        setSupportSnapshot(previous => sourceChange?.sourceRevision !== undefined && previous?.value.sourceRevision === sourceChange.sourceRevision
            ? {...previous, sourceChange} : undefined);
        setSaved(undefined);
        setBusy(false);
    }, [sourceChange]);
    useEffect(() => {
        const read = new AbortController();
        setModel(undefined);
        setModelError(undefined);
        setModelLoading(true);
        getGameModel(fetchImpl, undefined, read.signal)
            .then((projection) => {
                if (read.signal.aborted) return;
                setModel(projection);
                setModelLoading(false);
                if (!edited.current) {
                    const next = buildDefaultOptimizationRequest(projection);
                    setText(JSON.stringify(next, null, 2));
                }
            })
            .catch((failure: unknown) => {
                if (read.signal.aborted) return;
                setModelLoading(false);
                setModelError(failure instanceof Error ? failure.message : String(failure));
            });
        return () => read.abort();
    }, [fetchImpl, projectRoot, sourceChange?.sourceRevision]);
    const projectJobs = jobs.jobs;
    const job =
        projectJobs.find((item) => item.id === started?.id) ??
        started ??
        projectJobs.find((item) => item.id === recoveryJob?.id) ??
        projectJobs.find((item) => item.operation === "optimization");
    useEffect(() => {
        if (recoveryJob === undefined) return;
        generation.current++;
        controller.current?.abort();
        edited.current = true;
        setText(JSON.stringify(recoveryJob.request.request, null, 2) ?? "");
        setBusy(false);
        setSupportSnapshot(undefined);
        setStarted(undefined);
    }, [recoveryJob]);
    useEffect(() => {
        if (!edited.current && job?.request.request) {
            setText(JSON.stringify(job.request.request, null, 2));
            edited.current = true;
        }
    }, [job]);

    const parsed = useMemo((): {request?: StudioOptimizationRequest; error?: string} => {
        try {
            return {request: validateOptimizationRequest(JSON.parse(text))};
        } catch (failure) {
            return {error: failure instanceof Error ? failure.message : String(failure)};
        }
    }, [text]);
    const request = parsed.request;
    const target = request?.targets[0];
    const targetMetric = target === undefined ? undefined : findOptimizationMetric(target);
    const domainSize = request === undefined ? 0 : optimizationDomainSize(request.policy);
    const selectedPaths = request?.policy.tunables.map((tunable) => tunable.path) ?? [];
    const modelRows = paytableRows(model);
    const rowByPath = new Map(modelRows.map((row) => [paytablePath(row), row]));
    const writable = support?.writable;
    const writableSet = writable === undefined ? undefined : new Set(writable);
    const candidatePaths = [...new Set([
        ...(writable ?? modelRows.map(paytablePath)),
        ...selectedPaths,
    ])];
    const filter = fieldFilter.trim().toLowerCase();
    const filteredPaths = candidatePaths.filter((path) => {
        if (filter.length === 0) return true;
        return path.toLowerCase().includes(filter) || describeTunablePath(path).toLowerCase().includes(filter);
    });
    const visiblePaths = filteredPaths.slice(0, 200);

    let matchesRequest = false;
    try {
        matchesRequest =
            JSON.stringify(validateOptimizationRequest(JSON.parse(text))) === JSON.stringify(job?.request.request);
    } catch {
        /* Editable invalid input remains visible. */
    }
    const retainedResult = job?.result?.detail as StudioOptimizationResult | undefined;
    const active = job !== undefined && ["queued", "running", "cancelling"].includes(job.status);
    const currentRevision = support?.sourceRevision ?? sourceChange?.sourceRevision;
    const resultRevisions = [job?.request.sourceRevision, retainedResult?.evidence?.sourceRevision, retainedResult?.candidate?.sourceRevision]
        .filter((revision): revision is string => typeof revision === "string");
    const stale = !active && job !== undefined && (
        (currentRevision !== undefined && resultRevisions.some(revision => revision !== currentRevision)) ||
        (sourceChange !== undefined && (currentRevision === undefined || resultRevisions.length === 0))
    );
    const result = matchesRequest && !stale ? retainedResult : undefined;
    const discoveryUnresolved = started === undefined && (jobs.discoveryStatus === "pending" || jobs.discoveryStatus === "failed");
    useEffect(() => {
        if (result === undefined || job?.id === undefined || lastResultJob.current === job.id) return;
        lastResultJob.current = job.id;
        resultRef.current?.scrollIntoView({block: "nearest"});
    }, [job?.id, result]);

    const updateRequest = (mutate: (request: StudioOptimizationRequest) => void): void => {
        // Read the latest document inside the updater, not the last rendered copy: a blur and the next
        // click can arrive in one React batch, and the second edit must not overwrite the first.
        setText(current => {
            try {
                const next = validateOptimizationRequest(JSON.parse(current));
                mutate(next);
                return JSON.stringify(next, null, 2);
            } catch {
                return current;
            }
        });
        edited.current = true;
        generation.current++;
        controller.current?.abort();
        setBusy(false);
        setSupportSnapshot(undefined);
        setStarted(undefined);
        setApplied(false);
        setSaved(undefined);
        setError(undefined);
    };
    const updateTunables = (mutate: (request: StudioOptimizationRequest) => void): void => {
        updateRequest((next) => {
            const previousSize = optimizationDomainSize(next.policy);
            mutate(next);
            const nextSize = optimizationDomainSize(next.policy);
            if (next.policy.budget === previousSize || next.policy.budget === Math.min(previousSize, MAX_SEARCH_BUDGET)) {
                next.policy.budget = Math.min(nextSize, MAX_SEARCH_BUDGET);
            }
        });
    };
    const addTunable = (path: string): void => {
        updateTunables((next) => {
            if (next.policy.tunables.some((tunable) => tunable.path === path)) return;
            next.policy.tunables.push({path, values: suggestedTunableValues(path, model)});
        });
    };
    const removeTunable = (path: string): void => {
        updateTunables((next) => {
            next.policy.tunables = next.policy.tunables.filter((tunable) => tunable.path !== path);
        });
    };
    const setTunableValues = (path: string, values: number[]): void => {
        updateTunables((next) => {
            const tunable = next.policy.tunables.find((entry) => entry.path === path);
            if (tunable !== undefined) tunable.values = values;
        });
    };

    let runDisabledReason: string | undefined;
    if (parsed.error !== undefined) runDisabledReason = "Fix the policy JSON before checking or running.";
    else if (request === undefined || request.policy.tunables.length === 0) runDisabledReason = "Select at least one field to tune.";
    else if (active) runDisabledReason = "Wait for the active optimization to finish or cancel it before starting another.";
    else if (busy) runDisabledReason = "Wait for the current optimization request to finish.";
    else if (discoveryUnresolved) runDisabledReason = jobs.discoveryStatus === "failed"
        ? "Reattach to saved work before starting optimization."
        : "Checking for saved work before starting optimization.";
    else if (!support?.supported) runDisabledReason = support ? `Optimization is unavailable: ${support.reason}` : "Check tuning support for the current targets and policy before running optimization.";
    const supportDisabled = busy || active || parsed.error !== undefined || request === undefined || request.policy.tunables.length === 0;

    const action = async (kind: "support" | "start" | "save" | "apply"): Promise<void> => {
        if (kind === "start" && (discoveryUnresolved || !support?.supported)) return;
        if ((kind === "save" || kind === "apply") && stale) return;
        // A late model read must not replace the exact request this action is about to submit.
        edited.current = true;
        const current = ++generation.current;
        controller.current?.abort();
        controller.current = new AbortController();
        setBusy(true);
        setError(undefined);
        setSaved(undefined);
        setUndoNotice(undefined);
        try {
            const request = validateOptimizationRequest(JSON.parse(text));
            if (kind === "support") {
                const value = await optimizationAction<StudioOptimizationSupport>(
                    fetchImpl,
                    kind,
                    {request, expectedProjectRoot: projectRoot},
                    controller.current.signal,
                );
                if (current === generation.current) setSupportSnapshot({value, sourceChange});
            } else if (kind === "start") {
                const value = await optimizationAction<{job: StudioJobView}>(
                    fetchImpl,
                    kind,
                    {request, sourceRevision: support?.sourceRevision, expectedProjectRoot: projectRoot},
                    controller.current.signal,
                );
                if (current === generation.current) {
                    setApplied(false);
                    setStarted(value.job);
                    jobs.refresh();
                    if (support?.sourceRevision !== undefined) onStarted?.(support.sourceRevision);
                }
            } else {
                const value = await optimizationAction<{outputPath: string; warning?: string; undoId?: string; restored?: boolean}>(
                    fetchImpl,
                    kind,
                    {jobId: job?.id, request, destination, expectedProjectRoot: projectRoot},
                    controller.current.signal,
                );
                if (current === generation.current) {
                    setSaved(value.outputPath);
                    if (value.warning) setError(value.warning);
                    if (kind === "apply") {
                        setApplied(true);
                        setUndo(value.undoId);
                        setUndoNotice(undefined);
                        setSupportSnapshot(undefined);
                        onApplied?.();
                    }
                }
            }
        } catch (failure) {
            if (current === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            if (current === generation.current) setBusy(false);
        }
    };
    const undoApply = async (): Promise<void> => {
        if (undo === undefined) return;
        setBusy(true);
        setError(undefined);
        setUndoNotice(undefined);
        try {
            const value = await optimizationAction<{outputPath: string; warning?: string; restored?: boolean}>(
                fetchImpl,
                "undo",
                {undoId: undo, expectedProjectRoot: projectRoot},
            );
            setApplied(false);
            setUndo(undefined);
            setSupportSnapshot(undefined);
            setUndoNotice("Previous design values restored. Check tuning support and run a fresh optimization before applying again.");
            if (value.warning) setError(value.warning);
            onApplied?.();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy(false);
        }
    };
    const unreportedProgress = "Preparing optimization; waiting for execution progress.";
    const isMeasuredProgressValue = (value: number | string): boolean => typeof value === "number" || (/^[0-9]+$/).test(value);
    let jobStatusLine: string | undefined;
    if (job !== undefined) {
        const label = OPTIMIZATION_STATUS_LABEL[job.status] ?? job.status;
        jobStatusLine = `${stale ? "Historical optimization — " : ""}${label}`;
        if (active) {
            const progress = job.progress;
            if (progress !== undefined && isMeasuredProgressValue(progress.current) && isMeasuredProgressValue(progress.total)) {
                jobStatusLine += `: ${progress.current} / ${progress.total} ${progress.unit} ${progress.stage}${progress.message ? ` · ${progress.message}` : ""}`;
            } else if (progress !== undefined) {
                // Finalization/cancellation phases can carry non-numeric sentinels. Name the phase instead of
                // printing "indeterminate / indeterminate work".
                jobStatusLine += `: ${progress.stage}${progress.message ? ` · ${progress.message}` : ""}`;
            } else {
                jobStatusLine += `: ${unreportedProgress}`;
            }
        } else if (job.status === "completed") {
            jobStatusLine += " — review the verdict below.";
        } else {
            jobStatusLine += ".";
        }
    }

    return (
        <Stack mt="lg">
            <Title order={3}>Optimize math</Title>
            <Text size="sm">
                Choose a target, pick the fields to tune and their candidate values, then check the project&apos;s tuning support before running.
                Nothing is written until you explicitly apply a reviewed candidate.
            </Text>
            {parsed.error !== undefined && (
                <Alert color="red" role="alert" title="Policy JSON is invalid">
                    {parsed.error} Open the expert JSON policy at the bottom to repair it.
                </Alert>
            )}
            {modelLoading && <Text size="sm" c="dimmed">Loading the game model and current paytable…</Text>}
            {modelError !== undefined && (
                <Alert color="yellow" title="Game model unavailable">
                    The paytable could not be loaded, so field names and current values may be missing. {modelError}
                </Alert>
            )}

            {request !== undefined && (
                <>
                    <PageSection legend="Math target">
                        {target === undefined || targetMetric === undefined ? (
                            <Alert color="yellow">
                                This request&apos;s first target uses a metric or unit the compact form cannot edit. Use the expert JSON policy below.
                            </Alert>
                        ) : (
                            <Group align="end" grow>
                                <Select
                                    label="Metric"
                                    data={OPTIMIZATION_METRICS.map((option) => ({value: option.metric, label: option.label}))}
                                    value={targetMetric.metric}
                                    allowDeselect={false}
                                    onChange={(metric) => {
                                        const option = OPTIMIZATION_METRICS.find((entry) => entry.metric === metric);
                                        if (option === undefined) return;
                                        updateRequest((next) => {
                                            next.targets[0] = defaultTargetForMetric(option);
                                        });
                                    }}
                                />
                                <NumberInput
                                    label={`Target${targetMetric.valueSuffix === "" ? "" : ` (${targetMetric.valueSuffix})`}`}
                                    value={metricDisplayValue(target, targetMetric)}
                                    step={targetMetric.step}
                                    onChange={(value) => {
                                        if (value === "") return;
                                        const number = asNumber(value);
                                        if (number === undefined) return;
                                        updateRequest((next) => {
                                            next.targets[0].value = number / targetMetric.scale;
                                        });
                                    }}
                                />
                                <NumberInput
                                    label={`Tolerance${targetMetric.toleranceSuffix === "" ? "" : ` (± ${targetMetric.toleranceSuffix})`}`}
                                    value={metricDisplayTolerance(target, targetMetric)}
                                    step={targetMetric.step}
                                    min={0}
                                    onChange={(value) => {
                                        if (value === "") return;
                                        const number = asNumber(value);
                                        if (number === undefined) return;
                                        updateRequest((next) => {
                                            next.targets[0].tolerance = {kind: "absolute", value: number / targetMetric.scale};
                                        });
                                    }}
                                />
                            </Group>
                        )}
                        {targetMetric !== undefined && target?.tolerance?.kind === "relative" && (
                            <Text size="xs" c="dimmed">
                                This target currently uses a relative tolerance. Changing the tolerance here converts it to an absolute one.
                            </Text>
                        )}
                        {request.targets.length > 1 && (
                            <Text size="xs" c="dimmed">
                                This request contains {request.targets.length} targets. The form edits the first target; use the expert JSON policy for the rest.
                            </Text>
                        )}
                    </PageSection>

                    <PageSection legend="Fields to tune">
                        {candidatePaths.length === 0 ? (
                            <Text size="sm">No writable fields were discovered. Add a field path below or use the expert JSON policy.</Text>
                        ) : (
                            <>
                                {candidatePaths.length > 8 && (
                                    <TextInput
                                        label="Filter fields"
                                        placeholder="A × 3 or /paytable/A/3"
                                        value={fieldFilter}
                                        onChange={(event) => setFieldFilter(event.currentTarget.value)}
                                        mb="sm"
                                    />
                                )}
                                <Table.ScrollContainer minWidth={720}>
                                    <Table aria-label="Fields available for tuning">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th aria-label="Tune" />
                                                <Table.Th>Field</Table.Th>
                                                <Table.Th>Current</Table.Th>
                                                <Table.Th>Candidate values</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {visiblePaths.map((path) => {
                                                const tunable = request.policy.tunables.find((entry) => entry.path === path);
                                                const label = describeTunablePath(path);
                                                const row = rowByPath.get(path) ?? paytableRowForPath(model, path);
                                                const writableField = writableSet === undefined || writableSet.has(path);
                                                return (
                                                    <Table.Tr key={path}>
                                                        <Table.Td>
                                                            <Checkbox
                                                                aria-label={`Tune ${label}`}
                                                                checked={tunable !== undefined}
                                                                onChange={(event) => {
                                                                    if (event.currentTarget.checked) addTunable(path);
                                                                    else removeTunable(path);
                                                                }}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm">{label}</Text>
                                                            {label !== path && <Text size="xs" c="dimmed" style={{overflowWrap: "anywhere"}}>{path}</Text>}
                                                            {!writableField && <Text size="xs" c="red">The current tuning check does not list this field as writable.</Text>}
                                                        </Table.Td>
                                                        <Table.Td>{row === undefined ? "—" : row.payout}</Table.Td>
                                                        <Table.Td>
                                                            {tunable === undefined ? (
                                                                <Text size="xs" c="dimmed">Select to edit.</Text>
                                                            ) : (
                                                                <TunableValuesInput
                                                                    label={label}
                                                                    values={tunable.values}
                                                                    onCommit={(values) => setTunableValues(path, values)}
                                                                />
                                                            )}
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>
                                {filteredPaths.length > visiblePaths.length && (
                                    <Text size="xs" c="dimmed" mt="xs">
                                        Showing the first {visiblePaths.length} of {filteredPaths.length} fields. Refine the filter to narrow the list.
                                    </Text>
                                )}
                            </>
                        )}
                        <Group align="end" mt="sm">
                            <TextInput
                                label="Another writable field"
                                description="Raw JSON pointer; the tuning check will validate it."
                                placeholder="/paytable/A/3"
                                value={customField}
                                onChange={(event) => setCustomField(event.currentTarget.value)}
                            />
                            <Button
                                variant="default"
                                disabled={customField.trim().length === 0 || selectedPaths.includes(customField.trim())}
                                onClick={() => {
                                    const path = customField.trim();
                                    if (path.length === 0) return;
                                    addTunable(path);
                                    setCustomField("");
                                }}
                            >
                                Add field
                            </Button>
                        </Group>
                        {request.policy.tunables.length === 0 && (
                            <Text size="sm" c="red" mt="xs">Select at least one field before checking support.</Text>
                        )}
                    </PageSection>

                    <AdvancedDisclosure label="optimization policy">
                        <Group align="end" grow>
                            <NumberInput
                                label="Search budget"
                                description="Candidate evaluations"
                                value={request.policy.budget}
                                min={1}
                                max={MAX_SEARCH_BUDGET}
                                step={1}
                                onChange={(value) => {
                                    const number = asNumber(value);
                                    if (number === undefined) return;
                                    updateRequest((next) => {
                                        next.policy.budget = Math.max(1, Math.min(MAX_SEARCH_BUDGET, Math.floor(number)));
                                    });
                                }}
                            />
                            <NumberInput
                                label="Max exact outcomes"
                                description="Enumeration cap per candidate"
                                value={request.policy.maxOutcomes}
                                min={1}
                                max={MAX_EXACT_OUTCOMES}
                                step={1}
                                onChange={(value) => {
                                    const number = asNumber(value);
                                    if (number === undefined) return;
                                    updateRequest((next) => {
                                        next.policy.maxOutcomes = Math.max(1, Math.min(MAX_EXACT_OUTCOMES, Math.floor(number)));
                                    });
                                }}
                            />
                            <NumberInput
                                label="Stake"
                                value={request.policy.stake}
                                min={0.000001}
                                step={0.01}
                                onChange={(value) => {
                                    const number = asNumber(value);
                                    if (number === undefined || number <= 0) return;
                                    updateRequest((next) => {
                                        next.policy.stake = number;
                                    });
                                }}
                            />
                        </Group>
                        <Group align="end" grow mt="sm">
                            <TextInput
                                label="Seed"
                                description="Repeatable search identity"
                                value={request.policy.seed}
                                onChange={(event) => updateRequest((next) => {
                                    next.policy.seed = event.currentTarget.value;
                                })}
                            />
                            <TextInput
                                label="Mode"
                                description="Bet mode identity; usually base"
                                value={request.policy.mode}
                                onChange={(event) => updateRequest((next) => {
                                    next.policy.mode = event.currentTarget.value;
                                })}
                            />
                            <Select
                                label="Scope"
                                data={[
                                    {value: "paid-entry", label: "Paid entry"},
                                    {value: "logical-round", label: "Logical round"},
                                    {value: "native-outcomes", label: "Native outcomes"},
                                ]}
                                value={request.policy.scope}
                                allowDeselect={false}
                                onChange={(scope) => {
                                    if (scope === null) return;
                                    updateRequest((next) => {
                                        next.policy.scope = scope as typeof next.policy.scope;
                                    });
                                }}
                            />
                        </Group>
                        <Text size="xs" c="dimmed" mt="sm">
                            Strategy: {request.policy.strategy === "exact-finite-v1" ? "exact finite search" : request.policy.strategy}.
                            {request.policy.strategy !== "exact-finite-v1" && " The sampling policy and locks are edited in the expert JSON."}
                        </Text>
                        <Text size="sm" mt="xs">
                            Search space: {domainSize.toLocaleString()} candidate combination{domainSize === 1 ? "" : "s"} · budget: {request.policy.budget.toLocaleString()}.
                        </Text>
                        {domainSize > request.policy.budget && (
                            <Alert color="yellow" mt="xs">
                                The budget will evaluate at most {request.policy.budget.toLocaleString()} of {domainSize.toLocaleString()} combinations.
                                <Group mt="xs">
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() => updateRequest((next) => {
                                            next.policy.budget = Math.min(domainSize, MAX_SEARCH_BUDGET);
                                        })}
                                    >
                                        Use full search space
                                    </Button>
                                </Group>
                            </Alert>
                        )}
                    </AdvancedDisclosure>

                    <PageSection legend="Check and run">
                        <Text size="sm" c="dimmed" mb="sm">
                            Check support first. The server validates the selected paths, locks and target scope against this project before any candidate is evaluated.
                        </Text>
                        <Group>
                            <Button
                                disabled={supportDisabled}
                                onClick={() => {
                                    action("support");
                                }}
                            >
                                Check tuning support
                            </Button>
                            <Button
                                disabled={busy || active || discoveryUnresolved || !support?.supported}
                                aria-describedby={runDisabledReason ? runExplanationId : undefined}
                                onClick={() => {
                                    action("start");
                                }}
                            >
                                Run optimization
                            </Button>
                        </Group>
                        {support && (
                            <Alert color={support.supported ? "blue" : "yellow"} mt="sm">
                                {support.reason}
                                {support.writable !== undefined && (
                                    <Text size="sm">
                                        {support.writable.length.toLocaleString()} writable field{support.writable.length === 1 ? "" : "s"} discovered.
                                    </Text>
                                )}
                            </Alert>
                        )}
                        {active && (
                            <Button
                                mt="sm"
                                disabled={job.status === "cancelling" || jobs.pendingIds.includes(job.id)}
                                onClick={() => {
                                    jobs.cancel(job.id);
                                }}
                            >
                                Cancel optimization
                            </Button>
                        )}
                        {runDisabledReason && <Text id={runExplanationId} size="sm" mt="xs">{runDisabledReason}</Text>}
                    </PageSection>
                </>
            )}

            {jobStatusLine !== undefined && <Text role="status">{jobStatusLine}</Text>}
            {stale && <Alert color="yellow" role="alert">
                Stale optimization result — the saved design changed. Check tuning support and run a new optimization for the current design. Retained evidence remains available as history.
                {retainedResult && <details><summary>Historical optimization details</summary><Code block>{JSON.stringify(retainedResult, null, 2)}</Code></details>}
            </Alert>}
            {result && (
                <div ref={resultRef}>
                    <Text fw={600}>Verdict: {result.status}</Text>
                    {result.candidate && !["success", "attained"].includes(result.status) && <Alert color="yellow">Best-so-far candidate; targets are not approved. Saving keeps this result.</Alert>}
                    {result.diagnostics.length > 0 && <Alert color="red" role="alert">{result.diagnostics.map((item) => `${item.path}: ${item.message}`).join("; ")}</Alert>}
                    {result.evidence && <OptimizationSummary evidence={result.evidence} />}
                    {result.evidence && (
                        <AdvancedDisclosure label="full mathematical evidence">
                            <OptimizationPreview evidence={result.evidence} />
                            <details><summary>Full details and origin</summary><Code block>{JSON.stringify(result.evidence, null, 2)}</Code></details>
                        </AdvancedDisclosure>
                    )}
                </div>
            )}
            {job?.error && <Alert color="red" role="alert">{job.error}</Alert>}
            {job?.recovery && <Alert color="yellow" role="alert">Recovery ({job.recovery.action}): {job.recovery.reason}</Alert>}
            <JobObservationNotice discoveryStatus={jobs.discoveryStatus} connectionError={jobs.connectionError} actionError={jobs.actionError} onReattach={jobs.refresh} />
            {!applied && !job?.result?.provenance?.authoredApply && !job?.result?.provenance?.authoredUndo && result?.candidate && ["success", "attained", "inconclusive", "exhausted"].includes(result.status) && job?.status === "completed" && (
                <>
                    { ["blueprint", "parWorkbook", "tsPackage"].includes(result.candidate.type) && <Button disabled={busy} onClick={() => {
                        confirm("Apply these reviewed changes to the saved design? This writes the selected values to the project source.", () => {
                            action("apply").catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)));
                        }, undefined, {confirm: "optimization-apply-confirm", cancel: "optimization-apply-dismiss", operation: "optimization-apply"});
                    }}>Apply reviewed changes</Button>}
                    <TextInput
                        label="Save candidate to"
                        description="Copy the reviewed candidate to a separate destination instead of changing the source."
                        value={destination}
                        onChange={(event) => setDestination(event.currentTarget.value)}
                    />
                    <Button
                        disabled={busy || !destination.trim()}
                        onClick={() => {
                            action("save");
                        }}
                    >
                        Save reviewed candidate
                    </Button>
                </>
            )}
            {(applied || Boolean(job?.result?.provenance?.authoredApply)) && undoNotice === undefined && (
                <Alert color="green" title="Changes saved to the game design">
                    <Text size="sm">The reviewed values are now part of the saved design. Check support and run a fresh preview before applying again.</Text>
                    {undo !== undefined && (
                        <Group mt="xs">
                            <Button
                                size="xs"
                                variant="default"
                                disabled={busy}
                                onClick={() => {
                                    undoApply().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)));
                                }}
                            >
                                Undo applied changes
                            </Button>
                            <Text size="xs" c="dimmed">Available until the source changes or Studio restarts (15 minutes).</Text>
                        </Group>
                    )}
                </Alert>
            )}
            {undoNotice !== undefined && <Alert color="teal">{undoNotice}</Alert>}
            {!applied && job?.result?.provenance?.authoredUndo !== undefined && undoNotice === undefined && (
                <Alert color="gray">
                    This candidate was applied and then undone. Run a new optimization to review a fresh candidate before applying again.
                </Alert>
            )}
            {saved && <Alert color="green">Candidate saved: {saved}</Alert>}
            {error && (
                <Alert color="red" role="alert">
                    {error}
                </Alert>
            )}
            <AdvancedDisclosure label="expert JSON policy">
                <Text size="sm" c="dimmed" mb="sm">
                    The form above is a view over this request document. Editing it replaces the form values; invalid JSON disables the form.
                </Text>
                <Textarea
                    label="Optimization request JSON"
                    minRows={10}
                    value={text}
                    disabled={active}
                    onChange={(event) => {
                        edited.current = true;
                        generation.current++;
                        controller.current?.abort();
                        setBusy(false);
                        setText(event.currentTarget.value);
                        setSupportSnapshot(undefined);
                        setStarted(undefined);
                        setApplied(false);
                        setSaved(undefined);
                        setError(undefined);
                    }}
                />
            </AdvancedDisclosure>
        </Stack>
    );
}

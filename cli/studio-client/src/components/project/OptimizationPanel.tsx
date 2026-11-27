import {JobObservationNotice} from "../common/JobObservationNotice";
import {OptimizationPreview} from "./OptimizationPreview";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CollapsiblePageSection} from "../common/CollapsiblePageSection";
import {PageSection} from "../common/PageSection";
import {
    Alert,
    Button,
    Checkbox,
    Code,
    Group,
    NumberInput,
    Select,
    Stack,
    Table,
    Text,
    Textarea,
    TextInput,
    Title,
} from "@mantine/core";
import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from "react";
import {getExactMath, getGameModel, optimizationAction} from "../../api/apiClient";
import type {
    GameModelProjection,
    StudioExactMathView,
    StudioJobView,
    StudioOptimizationRequest,
    StudioOptimizationResult,
    StudioOptimizationSupport,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {isOptimizationResultStale} from "../../domain/optimizationResultFreshness";
import {describeCandidatePaytableSanityWarning} from "../../domain/optimizationCandidateSanity";
import {suggestNextTunableValue} from "../../domain/optimizationSuggestion";
import type {useProjectJobs} from "../../hooks/useProjectJobs";
import {useConfirm} from "../../hooks/useConfirm";
import {validateOptimizationRequest} from "../../../../../src/optimization/validateOptimizationRequest";
import {
    buildDefaultOptimizationRequest,
    defaultTargetForMetric,
    describeTunablePath,
    findOptimizationMetric,
    formatOptimizationDistance,
    formatOptimizationMetricValue,
    formatOptimizationTolerance,
    formatTunableValues,
    hasFreeGames,
    metricDisplayTolerance,
    metricDisplayValue,
    nearestOptimizationCandidate,
    OPTIMIZATION_METRICS,
    optimizationDomainSize,
    optimizationScopeLabel,
    optimizationTargetLabel,
    optimizationTunablePaths,
    parseTunableValues,
    recommendsWholeRoundScope,
    suggestedTunableValues,
    tunableCurrentValue,
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

const OPTIMIZATION_VERDICT_EXPLANATION: Partial<Record<StudioOptimizationResult["status"], string>> = {
    success: "A candidate within the requested tolerance was found.",
    attained: "A candidate within the requested tolerance was found.",
    infeasible: "No evaluated candidate met the requested tolerance.",
    exhausted: "No evaluated candidate met the requested tolerance within the search budget.",
    inconclusive: "The evidence is not conclusive. Review the candidate and measurements before applying.",
};

const MAX_SEARCH_BUDGET = 1_000_000;
const MAX_EXACT_OUTCOMES = 1_000_000;
const UNDO_TTL_MS = 15 * 60 * 1000;
const UNDO_STORAGE_PREFIX = "pokie.optimization.undo.";

type StoredUndo = {undoId: string; savedAt: number};
type OptimizationBackupView = {filename: string; path: string; content: string; sha256: string};

function downloadTextFile(filename: string, content: string): void {
    const blob = new Blob([content], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before releasing the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function undoStorageKey(projectRoot: string): string {
    return `${UNDO_STORAGE_PREFIX}${projectRoot}`;
}

// Keep the reviewed-apply receipt beyond a tab reload (a browser restart too, until the 15-minute
// server-side TTL expires). localStorage is safe here: it stores only the opaque server undo id and
// the local timestamp, never project content or a source value.
function readStoredUndo(projectRoot: string): StoredUndo | undefined {
    if (typeof localStorage === "undefined") return undefined;
    try {
        const raw = localStorage.getItem(undoStorageKey(projectRoot));
        if (raw === null) return undefined;
        const parsed = JSON.parse(raw) as Partial<StoredUndo>;
        if (
            typeof parsed.undoId !== "string" ||
            typeof parsed.savedAt !== "number" ||
            Date.now() - parsed.savedAt > UNDO_TTL_MS
        ) {
            localStorage.removeItem(undoStorageKey(projectRoot));
            return undefined;
        }
        return {undoId: parsed.undoId, savedAt: parsed.savedAt};
    } catch {
        return undefined;
    }
}

function storeUndo(projectRoot: string, undoId: string): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(
            undoStorageKey(projectRoot),
            JSON.stringify({undoId, savedAt: Date.now()} satisfies StoredUndo),
        );
    } catch {
        // A browser with storage disabled still has the in-memory undo for this mounted panel.
    }
}

function clearStoredUndo(projectRoot: string): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.removeItem(undoStorageKey(projectRoot));
    } catch {
        // Nothing else to clear.
    }
}

type OptimizationEvidence = NonNullable<StudioOptimizationResult["evidence"]>;

// Infeasible exact searches still have a measured value for every evaluated candidate; the top-level
// `measured` field only records the selected winner. Show the nearest measured value per target rather
// than a misleading em dash, while keeping the per-candidate evidence below authoritative.
function nearestMeasuredForTarget(
    evidence: OptimizationEvidence,
    targetIndex: number,
    requested: number,
): number | undefined {
    let best: {value: number; distance: number} | undefined;
    for (const evaluation of evidence.evaluations ?? []) {
        const raw = evaluation.measured?.[targetIndex];
        let value = Number.NaN;
        if (typeof raw === "number") value = raw;
        else if (typeof raw === "string") value = Number(raw);
        if (!Number.isFinite(value)) continue;
        const distance = Math.abs(value - requested);
        if (best === undefined || distance < best.distance) best = {value, distance};
    }
    return best?.value;
}

function OptimizationSummary({
    evidence,
    currentTunables,
    onUseSuggestion,
}: {
    evidence: OptimizationEvidence;
    currentTunables?: StudioOptimizationRequest["policy"]["tunables"];
    onUseSuggestion?: (path: string, value: number) => void;
}) {
    const [suggestionAdded, setSuggestionAdded] = useState<number>();
    const targets = evidence.request.targets;
    const measured = evidence.measured;
    const sampled = evidence.strategy === "seeded-search-v1";
    const firstTarget = targets[0];
    const scope = evidence.request.policy.scope;
    const nearest =
        firstTarget === undefined ? undefined : nearestOptimizationCandidate(firstTarget, evidence.evaluations ?? []);
    const tunables = evidence.request.policy.tunables;
    const suggestion =
        firstTarget !== undefined && evidence.strategy === "exact-finite-v1" && tunables.length === 1
            ? suggestNextTunableValue(tunables[0]!.path, firstTarget.value, evidence.evaluations ?? [])
            : undefined;
    return (
        <div>
            {sampled && (
                <Text size="xs" c="dimmed" mb="xs">
                    Measured values are the held-out assessment estimates; open the full mathematical evidence for
                    intervals.
                </Text>
            )}
            <Text size="xs" c="dimmed" mb="xs">
                Measured on: {optimizationScopeLabel(scope)}.
            </Text>
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
                        const assessed = sampled
                            ? evidence.stochastic?.assessment?.targets[index]?.estimate
                            : measured?.[index];
                        const value =
                            assessed ?? (sampled ? undefined : nearestMeasuredForTarget(evidence, index, target.value));
                        let allowance: number | undefined;
                        if (target.tolerance !== undefined) allowance =
                                target.tolerance.kind === "relative"
                                    ? Math.abs(target.value) * target.tolerance.value
                                    : target.tolerance.value;
                        const attained =
                            value !== undefined && allowance !== undefined
                                ? Math.abs(value - target.value) <= allowance
                                : undefined;
                        let attainedLabel = "—";
                        if (value !== undefined) attainedLabel = attained === true ? "within tolerance" : "outside tolerance";
                        return (
                            <Table.Tr key={index}>
                                <Table.Td>
                                    {optimizationTargetLabel(target, scope)}
                                    {target.event ? ` (${target.event})` : ""}
                                </Table.Td>
                                <Table.Td>
                                    {formatOptimizationMetricValue(target, target.value, 2)}
                                    {target.tolerance === undefined
                                        ? ""
                                        : ` ± ${formatOptimizationTolerance(target, target.tolerance.value, 2)}`}
                                </Table.Td>
                                <Table.Td>
                                    {value === undefined ? "—" : formatOptimizationMetricValue(target, value)}
                                </Table.Td>
                                <Table.Td>{attainedLabel}</Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
            {nearest !== undefined && firstTarget !== undefined && (
                <Alert color="yellow" variant="light" mt="sm">
                    Nearest evaluated candidate: #{nearest.index + 1}
                    {Object.keys(nearest.evaluation.parameters ?? {}).length === 0
                        ? ""
                        : ` (${Object.entries(nearest.evaluation.parameters ?? {})
                            .map(([path, value]) => `${describeTunablePath(path)}=${String(value)}`)
                            .join(", ")})`}
                    {" — "}
                    {formatOptimizationMetricValue(firstTarget, nearest.measured)}
                    {", deviation "}
                    {formatOptimizationDistance(firstTarget, nearest.distance)}
                </Alert>
            )}
            {suggestion !== undefined &&
                tunables[0] !== undefined &&
                (() => {
                    const path = tunables[0]!.path;
                    const currentTunable = currentTunables?.find((tunable) => tunable.path === path);
                    const alreadyListed = currentTunable?.values.some((value) => value === suggestion.value) ?? false;
                    const justAdded = suggestionAdded === suggestion.value;
                    let suggestionLabel = "Add to candidate values";
                    if (alreadyListed) suggestionLabel = "Already in candidate values";
                    else if (justAdded) suggestionLabel = "Added to candidate values";
                    return (
                        <Stack gap={4} mt="xs">
                            <Text size="sm">
                                Suggested next candidate:{" "}
                                <strong>
                                    {describeTunablePath(path)} = {String(suggestion.value)}
                                </strong>{" "}
                                — a linear estimate from the evaluated candidates. Re-run the exact search to confirm
                                it.
                            </Text>
                            {onUseSuggestion !== undefined && (
                                <Group gap="xs">
                                    <Button
                                        size="xs"
                                        variant="default"
                                        disabled={alreadyListed || justAdded}
                                        onClick={() => {
                                            onUseSuggestion(path, suggestion.value);
                                            setSuggestionAdded(suggestion.value);
                                        }}
                                    >
                                        {suggestionLabel}
                                    </Button>
                                    {(alreadyListed || justAdded) && (
                                        <Text size="xs" c="dimmed">
                                            Check settings and run again.
                                        </Text>
                                    )}
                                </Group>
                            )}
                        </Stack>
                    );
                })()}
            {evidence.diff !== undefined && evidence.diff.length > 0 && (
                <Table withRowBorders={false} aria-label="Selected parameter changes" mt="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Selected change</Table.Th>
                            <Table.Th>Before</Table.Th>
                            <Table.Th>After</Table.Th>
                        </Table.Tr>
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

function TunableValuesInput({
    label,
    values,
    onCommit,
}: {
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
        return (
            <Text size="xs" c="dimmed">
                {formatted} — edit non-numeric values in the expert JSON policy.
            </Text>
        );
    }
    return (
        <TextInput
            size="xs"
            aria-label={`Candidate values for ${label}`}
            description="Comma- or space-separated. Use a dot for decimals (8.5); a comma starts the next candidate."
            value={draft}
            error={error}
            onChange={(event) => {
                const next = event.currentTarget.value;
                setDraft(next);
                setError(undefined);
                // Commit a valid list on change, not only on blur: clicking "Check settings"
                // immediately after typing must use the new candidates. Waiting for blur alone can
                // lose the first click while the input re-renders.
                const parsed = parseTunableValues(next);
                if (parsed.error === undefined && parsed.values !== undefined) onCommit(parsed.values);
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

function optimizationScopeColor(paidScopeAfterFeatures: boolean, scope: string | undefined): "yellow" | "blue" | "gray" {
    if (paidScopeAfterFeatures) return "yellow";
    if (scope === "logical-round") return "blue";
    return "gray";
}

/** A form view over the same validated request document the expert editor exposes. */
export function OptimizationPanel({
    projectRoot,
    jobs,
    recoveryJob,
    sourceChange,
    refreshKey,
    exactMathRefreshKey,
    onStarted,
    onApplied,
}: {
    projectRoot: string;
    jobs: ReturnType<typeof useProjectJobs>;
    recoveryJob?: {id?: string; request: StudioJobView["request"]};
    sourceChange?: {sourceRevision?: string};
    /** Bumped when an authored change (save/apply/undo) is committed, even when no revision is returned. */
    refreshKey?: number;
    /** Bumped when the exact-math card finishes generating; refreshes only the current-RTP hint. */
    exactMathRefreshKey?: number;
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
    const [exactMath, setExactMath] = useState<StudioExactMathView>();
    const [supportSnapshot, setSupportSnapshot] = useState<{
        value: StudioOptimizationSupport;
        sourceChange: typeof sourceChange;
    }>();
    const support = supportSnapshot?.sourceChange === sourceChange ? supportSnapshot?.value : undefined;
    const [busy, setBusy] = useState(false);
    const [busyAction, setBusyAction] = useState<"support" | "start" | "save" | "apply" | "undo">();
    const [error, setError] = useState<string>();
    const [destination, setDestination] = useState("");
    const [saved, setSaved] = useState<string>();
    const [applied, setApplied] = useState(false);
    const [appliedRevision, setAppliedRevision] = useState<string | undefined>(undefined);
    const [undo, setUndo] = useState<string | undefined>(() => readStoredUndo(projectRoot)?.undoId);
    const [undoNotice, setUndoNotice] = useState<string>();
    const [backup, setBackup] = useState<OptimizationBackupView>();
    const [started, setStarted] = useState<StudioJobView>();
    const [fieldFilter, setFieldFilter] = useState("");
    const [customField, setCustomField] = useState("");
    const [showFieldPaths, setShowFieldPaths] = useState(false);
    const [fieldSelectionNotice, setFieldSelectionNotice] = useState<string>();
    const generation = useRef(0);
    const edited = useRef(false);
    const controller = useRef<AbortController | undefined>(undefined);
    const resultRef = useRef<HTMLDivElement>(null);
    const lastResultJob = useRef<string | undefined>(undefined);

    useEffect(() => {
        setApplied(false);
        setAppliedRevision(undefined);
        setSupportSnapshot(undefined);
        setStarted(undefined);
        setSaved(undefined);
        setError(undefined);
        setUndo(readStoredUndo(projectRoot)?.undoId);
        setUndoNotice(undefined);
        setBackup(undefined);
        setBusy(false);
        setBusyAction(undefined);
        setFieldFilter("");
        setCustomField("");
        setShowFieldPaths(false);
        setFieldSelectionNotice(undefined);
        edited.current = false;
        const invalidate = (): void => {
            generation.current++;
            controller.current?.abort();
        };
        return invalidate;
    }, [projectRoot]);
    // Retire an old support/action response even when this panel stays mounted during Apply.
    // The dashboard owns this boundary so leaving Game Model cannot forget an accepted Save.
    useLayoutEffect(() => {
        generation.current++;
        controller.current?.abort();
        setSupportSnapshot((previous) =>
            sourceChange?.sourceRevision !== undefined && previous?.value.sourceRevision === sourceChange.sourceRevision
                ? {...previous, sourceChange}
                : undefined,
        );
        setSaved(undefined);
        setBusy(false);
        setBusyAction(undefined);
    }, [sourceChange, refreshKey]);
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
    }, [fetchImpl, projectRoot, sourceChange?.sourceRevision, refreshKey]);
    useEffect(() => {
        const read = new AbortController();
        setExactMath(undefined);
        getExactMath(fetchImpl, read.signal)
            .then((view) => {
                if (!read.signal.aborted) setExactMath(view);
            })
            .catch(() => {
                if (!read.signal.aborted) setExactMath(undefined);
            });
        return () => read.abort();
    }, [fetchImpl, projectRoot, sourceChange?.sourceRevision, refreshKey, exactMathRefreshKey]);
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
    const scope = request?.policy.scope;
    const exactMathView = exactMath?.status === "ok" ? exactMath : undefined;
    // The initial request is built before the exact table may have loaded, so it can only fall back to
    // the highest authored award. Once evidence is available, re-seed an untouched request from the
    // event that actually contributes the most RTP. Any user edit wins: `edited.current` is set by every
    // request mutation and by Run/Apply.
    useEffect(() => {
        if (edited.current || model === undefined || exactMathView === undefined) return;
        setText(JSON.stringify(buildDefaultOptimizationRequest(model, exactMathView), null, 2));
    }, [exactMathView, model]);
    const exactPaidRtp = exactMathView?.analysis.rtp;
    const exactFreeGames = exactMathView?.freeGamesRtp?.status === "available" ? exactMathView.freeGamesRtp : undefined;
    const exactTotalRtp = exactFreeGames?.totalRtp;
    const domainSize = request === undefined ? 0 : optimizationDomainSize(request.policy);
    const selectedPaths = request?.policy.tunables.map((tunable) => tunable.path) ?? [];
    const freeGamesConfigured = hasFreeGames(model);
    // A request created before the feature was added can still say "paid-entry". Keep that explicit
    // choice, but do not let it masquerade as the game's RTP when the design now has free games.
    const paidScopeAfterFeatures = recommendsWholeRoundScope(scope ?? "paid-entry", freeGamesConfigured);
    const writable = support?.writable;
    const writableSet = writable === undefined ? undefined : new Set(writable);
    const candidatePaths = [...new Set([...(writable ?? optimizationTunablePaths(model)), ...selectedPaths])];
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
    // A save reports the freshest revision immediately; after a reload the Game Model projection carries
    // the same authored-source identity, so a retained job can still be recognized as historical.
    const currentRevision = sourceChange?.sourceRevision ?? model?.sourceRevision ?? support?.sourceRevision;
    const resultRevisions = [
        job?.request.sourceRevision,
        retainedResult?.evidence?.sourceRevision,
        retainedResult?.candidate?.sourceRevision,
    ].filter((revision): revision is string => typeof revision === "string");
    const authoredApply = job?.result?.provenance?.authoredApply as {sourceRevision?: unknown} | undefined;
    const authoredApplyRevision =
        typeof authoredApply?.sourceRevision === "string" ? authoredApply.sourceRevision : undefined;
    const hasApplied = applied || authoredApply !== undefined;
    // Apply records the revision it just wrote. Comparing the optimizer's *pre-Apply* revision with
    // the current source would mark every successful Apply stale; comparing the post-Apply revision
    // detects only a later edit. Older jobs without that revision are treated as unverifiable once a
    // current revision exists, rather than presenting their verdict as current.
    const stale =
        (job !== undefined || hasApplied) &&
        isOptimizationResultStale({
            active,
            hasApplied,
            appliedRevision: applied ? appliedRevision : authoredApplyRevision,
            currentRevision,
            resultRevisions,
            sourceChangePresent: sourceChange !== undefined,
        });
    const appliedToSource = hasApplied && !stale;
    // A previous completed result must not keep looking like the answer while a new search is
    // queued/running. Hide it for the duration, then show the new job's own result. This is the same
    // "don't present an old result as current" contract Exact math follows for a stale library.
    const result = matchesRequest && !stale && !active && busyAction !== "start" ? retainedResult : undefined;
    const candidateSanityWarning =
        result?.evidence === undefined
            ? undefined
            : describeCandidatePaytableSanityWarning(
                result.evidence.diff,
                model?.paytable.status === "available" ? model.paytable.data : undefined,
                model?.symbols.status === "available" ? model.symbols.data : undefined,
            );
    const sourceDiff = result?.evidence?.diff;
    const hasSourceDiff = sourceDiff !== undefined && sourceDiff.length > 0;
    // A success verdict can land on the value that is already authored. That is a valid answer, but it is
    // not an applicable change: do not offer "Apply" for a before === after receipt.
    const hasEffectiveSourceChange = sourceDiff?.some((change) => String(change.before) !== String(change.after)) ?? false;
    const discoveryUnresolved =
        started === undefined && (jobs.discoveryStatus === "pending" || jobs.discoveryStatus === "failed");
    useEffect(() => {
        if (result === undefined || job?.id === undefined || lastResultJob.current === job.id) return;
        lastResultJob.current = job.id;
        resultRef.current?.scrollIntoView({block: "nearest"});
    }, [job?.id, result]);

    const updateRequest = (mutate: (request: StudioOptimizationRequest) => void): void => {
        // Read the latest document inside the updater, not the last rendered copy: a blur and the next
        // click can arrive in one React batch, and the second edit must not overwrite the first.
        setText((current) => {
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
        setAppliedRevision(undefined);
        setSaved(undefined);
        setError(undefined);
    };
    const updateTunables = (mutate: (request: StudioOptimizationRequest) => void): void => {
        updateRequest((next) => {
            const previousSize = optimizationDomainSize(next.policy);
            mutate(next);
            const nextSize = optimizationDomainSize(next.policy);
            if (
                next.policy.budget === previousSize ||
                next.policy.budget === Math.min(previousSize, MAX_SEARCH_BUDGET)
            ) {
                next.policy.budget = Math.min(nextSize, MAX_SEARCH_BUDGET);
            }
        });
    };
    const addTunable = (path: string): void => {
        setFieldSelectionNotice(undefined);
        updateTunables((next) => {
            if (next.policy.tunables.some((tunable) => tunable.path === path)) return;
            next.policy.tunables.push({path, values: suggestedTunableValues(path, model)});
        });
    };
    const removeTunable = (path: string): void => {
        // An empty tunable list is not a valid optimization policy. Keep the compact form usable and
        // explain the constraint in the form itself instead of replacing it with a raw JSON error.
        if ((request?.policy.tunables.length ?? 0) <= 1) {
            setFieldSelectionNotice(
                "Keep at least one field selected. To switch fields, select the new field first and then clear this one.",
            );
            return;
        }
        setFieldSelectionNotice(undefined);
        updateTunables((next) => {
            next.policy.tunables = next.policy.tunables.filter((tunable) => tunable.path !== path);
        });
    };
    const resetOptimizationPolicy = (): void => {
        setText(JSON.stringify(buildDefaultOptimizationRequest(model), null, 2));
        setFieldSelectionNotice(undefined);
        edited.current = true;
        generation.current++;
        controller.current?.abort();
        setBusy(false);
        setSupportSnapshot(undefined);
        setStarted(undefined);
        setApplied(false);
        setAppliedRevision(undefined);
        setSaved(undefined);
        setError(undefined);
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
    else if (scope === "logical-round" && freeGamesConfigured && request.targets.some((item) => item.metric !== "rtp")) runDisabledReason =
            "Exact whole-round search supports RTP only. Choose Paid spin or a paid-spin metric, or use Simulation for whole-round estimates.";
    else if (discoveryUnresolved) runDisabledReason =
            jobs.discoveryStatus === "failed"
                ? "Reattach to saved work before starting optimization."
                : "Checking for saved work before starting optimization.";
    else if (support !== undefined && !support.supported) runDisabledReason = `Optimization is unavailable: ${support.reason}`;
    const supportDisabled =
        busy || active || parsed.error !== undefined || request === undefined || request.policy.tunables.length === 0;

    const action = async (kind: "support" | "start" | "save" | "apply"): Promise<void> => {
        if (kind === "start" && discoveryUnresolved) return;
        if ((kind === "save" || kind === "apply") && stale) return;
        // A late model read must not replace the exact request this action is about to submit.
        edited.current = true;
        const current = ++generation.current;
        controller.current?.abort();
        controller.current = new AbortController();
        setBusy(true);
        setBusyAction(kind);
        setError(undefined);
        setSaved(undefined);
        setUndoNotice(undefined);
        if (kind === "apply") setBackup(undefined);
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
                // Run is not gated behind a separate "check permissions" click. If the user has not
                // checked settings yet, validate them now and then start the same request; a known
                // unsupported request still stops with the real reason.
                let effectiveSupport = support;
                if (effectiveSupport === undefined) {
                    effectiveSupport = await optimizationAction<StudioOptimizationSupport>(
                        fetchImpl,
                        "support",
                        {request, expectedProjectRoot: projectRoot},
                        controller.current.signal,
                    );
                    if (current !== generation.current) return;
                    setSupportSnapshot({value: effectiveSupport, sourceChange});
                }
                if (!effectiveSupport.supported) throw new Error(`Optimization is unavailable: ${effectiveSupport.reason}`);
                const value = await optimizationAction<{job: StudioJobView}>(
                    fetchImpl,
                    kind,
                    {request, sourceRevision: effectiveSupport.sourceRevision, expectedProjectRoot: projectRoot},
                    controller.current.signal,
                );
                if (current === generation.current) {
                    setApplied(false);
                    setAppliedRevision(undefined);
                    setStarted(value.job);
                    jobs.refresh();
                    onStarted?.(effectiveSupport.sourceRevision);
                }
            } else {
                const value = await optimizationAction<{
                    outputPath: string;
                    warning?: string;
                    undoId?: string;
                    restored?: boolean;
                    appliedSourceRevision?: string;
                    backup?: OptimizationBackupView;
                }>(
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
                        setAppliedRevision(value.appliedSourceRevision);
                        setUndo(value.undoId);
                        setBackup(value.backup);
                        if (value.undoId === undefined) clearStoredUndo(projectRoot);
                        else storeUndo(projectRoot, value.undoId);
                        setUndoNotice(undefined);
                        setSupportSnapshot(undefined);
                        onApplied?.();
                    }
                }
            }
        } catch (failure) {
            if (current === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            if (current === generation.current) {
                setBusy(false);
                setBusyAction(undefined);
            }
        }
    };
    const undoApply = async (): Promise<void> => {
        if (undo === undefined) return;
        setBusy(true);
        setBusyAction("undo");
        setError(undefined);
        setUndoNotice(undefined);
        try {
            const value = await optimizationAction<{outputPath: string; warning?: string; restored?: boolean}>(
                fetchImpl,
                "undo",
                {undoId: undo, expectedProjectRoot: projectRoot},
            );
            setApplied(false);
            setAppliedRevision(undefined);
            setUndo(undefined);
            clearStoredUndo(projectRoot);
            setSupportSnapshot(undefined);
            setUndoNotice(
                "Previous design values restored. Check settings and run a fresh optimization before applying again.",
            );
            if (value.warning) setError(value.warning);
            onApplied?.();
        } catch (failure) {
            const message = failure instanceof Error ? failure.message : String(failure);
            setError(message);
            if ((/no longer available|Source changed since the optimization|expires after 15 minutes/i).test(message)) {
                setUndo(undefined);
                clearStoredUndo(projectRoot);
            }
        } finally {
            setBusy(false);
            setBusyAction(undefined);
        }
    };
    const unreportedProgress = "Preparing optimization; waiting for execution progress.";
    const isMeasuredProgressValue = (value: number | string): boolean =>
        typeof value === "number" || (/^[0-9]+$/).test(value);
    let jobStatusLine: string | undefined;
    if (job !== undefined) {
        const label = OPTIMIZATION_STATUS_LABEL[job.status] ?? job.status;
        if (appliedToSource) {
            jobStatusLine =
                "Applied — the reviewed values are now part of the saved design. The earlier evidence is below.";
        } else {
            jobStatusLine = `${stale ? "Historical optimization — " : ""}${label}`;
            if (active) {
                const progress = job.progress;
                if (
                    progress !== undefined &&
                    isMeasuredProgressValue(progress.current) &&
                    isMeasuredProgressValue(progress.total)
                ) {
                    jobStatusLine += `: ${progress.current} / ${progress.total} ${progress.unit} ${progress.stage}${
                        progress.message ? ` · ${progress.message}` : ""
                    }`;
                } else if (progress !== undefined) {
                    // Finalization/cancellation phases can carry non-numeric sentinels. Name the phase instead of
                    // printing "indeterminate / indeterminate work".
                    jobStatusLine += `: ${progress.stage}${progress.message ? ` · ${progress.message}` : ""}`;
                } else {
                    jobStatusLine += `: ${unreportedProgress}`;
                }
            } else if (job.status === "completed") {
                let suffix = " — review the verdict below.";
                if (job.result?.provenance?.authoredUndo !== undefined) {
                    suffix = " — historical result, collapsed below.";
                } else if (stale) {
                    suffix = " — historical result; check settings and rerun for the current design.";
                }
                jobStatusLine += suffix;
            } else {
                jobStatusLine += ".";
            }
        }
    }

    const historicalResult = job?.result?.provenance?.authoredUndo !== undefined;
    const verdictBody = result ? (
        <>
            <Text fw={600}>Verdict: {result.status}</Text>
            {OPTIMIZATION_VERDICT_EXPLANATION[result.status] !== undefined && (
                <Text size="sm" c="dimmed">
                    {OPTIMIZATION_VERDICT_EXPLANATION[result.status]}
                </Text>
            )}
            {result.candidate && !["success", "attained"].includes(result.status) && (
                <Alert color="yellow">Best-so-far candidate; targets are not approved. Saving keeps this result.</Alert>
            )}
            {["success", "attained"].includes(result.status) && result.evidence?.strategy === "exact-finite-v1" && (
                <Text size="xs" c="dimmed">
                    Exact search selects the first candidate within the requested tolerance, in the listed order. Put
                    preferred values first or tighten the tolerance to control which candidate is selected.
                </Text>
            )}
            {["infeasible", "exhausted"].includes(result.status) && result.evidence?.strategy === "exact-finite-v1" && (
                <Alert color="yellow" role="status">
                    No candidate met the target. The evidence below lists every evaluated candidate’s exact value; widen
                    the candidate values or tolerance, or add more fields to tune, then run again.
                </Alert>
            )}
            {["success", "attained"].includes(result.status) && hasSourceDiff && !hasEffectiveSourceChange && (
                <Alert color="blue" role="status">
                    The current saved values already satisfy this target, so there is nothing to apply. Widen the
                    target, change a candidate value or tune another field if you want to explore a different design.
                </Alert>
            )}
            {result.diagnostics.length > 0 && (
                <Alert color="red" role="alert">
                    {result.diagnostics.map((item) => `${item.path}: ${item.message}`).join("; ")}
                </Alert>
            )}
            {result.evidence && (
                <OptimizationSummary
                    evidence={result.evidence}
                    currentTunables={request?.policy.tunables}
                    onUseSuggestion={(path, value) => {
                        const tunable = request?.policy.tunables.find((entry) => entry.path === path);
                        if (tunable === undefined) return;
                        const values = [
                            ...tunable.values.filter(
                                (entry): entry is number => typeof entry === "number" && Number.isFinite(entry),
                            ),
                            value,
                        ];
                        setTunableValues(
                            path,
                            values.filter((entry, index) => values.indexOf(entry) === index),
                        );
                    }}
                />
            )}
            {candidateSanityWarning !== undefined && (
                <Alert color="yellow" variant="light" title="Paytable sanity check">
                    <Text size="sm">{candidateSanityWarning}</Text>
                </Alert>
            )}
            {result.evidence && (
                <AdvancedDisclosure label="full mathematical evidence">
                    <OptimizationPreview evidence={result.evidence} />
                    <details>
                        <summary>Full details and origin</summary>
                        <Code block>{JSON.stringify(result.evidence, null, 2)}</Code>
                    </details>
                </AdvancedDisclosure>
            )}
        </>
    ) : undefined;

    return (
        <Stack mt="lg">
            <Title order={3}>Optimize math</Title>
            <Text size="md">
                Pick a target and candidate values, review the settings, then run. The search evaluates only the values
                you list, and nothing is written until you apply a reviewed candidate.
            </Text>
            {parsed.error !== undefined && (
                <Alert color="red" role="alert" title="Optimization settings need attention">
                    <Text size="sm">
                        The optimization policy is incomplete. Keep at least one field selected, or restore the
                        default settings and choose fields again.
                    </Text>
                    <Group mt="xs">
                        <Button size="xs" variant="default" onClick={resetOptimizationPolicy}>
                            Restore default settings
                        </Button>
                    </Group>
                    <AdvancedDisclosure label="technical details">
                        <Code block>{parsed.error}</Code>
                    </AdvancedDisclosure>
                </Alert>
            )}
            {modelLoading && (
                <Text size="sm" c="dimmed">
                    Loading the game model and current paytable…
                </Text>
            )}
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
                                This request&apos;s first target uses a metric or unit the compact form cannot edit. Use
                                the expert JSON policy below.
                            </Alert>
                        ) : (
                            <Group align="end" grow>
                                <Select
                                    label="Metric"
                                    data={OPTIMIZATION_METRICS.map((option) => ({
                                        value: option.metric,
                                        label: option.label,
                                    }))}
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
                                    label={`Target${
                                        targetMetric.valueSuffix === "" ? "" : ` (${targetMetric.valueSuffix})`
                                    }`}
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
                                    label={`Tolerance${
                                        targetMetric.toleranceSuffix === ""
                                            ? ""
                                            : ` (± ${targetMetric.toleranceSuffix})`
                                    }`}
                                    value={metricDisplayTolerance(target, targetMetric)}
                                    step={targetMetric.step}
                                    min={0}
                                    onChange={(value) => {
                                        if (value === "") return;
                                        const number = asNumber(value);
                                        if (number === undefined) return;
                                        updateRequest((next) => {
                                            next.targets[0].tolerance = {
                                                kind: "absolute",
                                                value: number / targetMetric.scale,
                                            };
                                        });
                                    }}
                                />
                            </Group>
                        )}
                        {targetMetric !== undefined && target !== undefined && (
                            <Text size="xs" c="dimmed" mt={4}>
                                Targeting {optimizationTargetLabel(target, scope ?? "paid-entry")}. Tolerance is in
                                percentage points (pp); 1 pp is one hundredth of the displayed percentage.
                            </Text>
                        )}
                        {freeGamesConfigured && (
                            <>
                                <Select
                                    label="Rounds measured"
                                    description="Which rounds the target measures. Paid spin and whole paid round are different numbers when free games are configured."
                                    data={[
                                        {value: "paid-entry", label: optimizationScopeLabel("paid-entry")},
                                        {value: "logical-round", label: optimizationScopeLabel("logical-round")},
                                    ]}
                                    value={scope}
                                    allowDeselect={false}
                                    mt="sm"
                                    onChange={(nextScope) => {
                                        if (nextScope === null) return;
                                        updateRequest((next) => {
                                            next.policy.scope = nextScope as typeof next.policy.scope;
                                        });
                                    }}
                                />
                                <Alert
                                    color={optimizationScopeColor(paidScopeAfterFeatures, scope)}
                                    variant="light"
                                    mt="sm"
                                    title={
                                        paidScopeAfterFeatures
                                            ? "This target still measures paid-spin RTP"
                                            : "Free games change the RTP scope"
                                    }
                                >
                                    <Text size="sm">
                                        {paidScopeAfterFeatures
                                            ? "This game has free games. The target below currently measures only the paid entry spin, while players experience whole-round RTP. Switch the scope before tuning the number players see."
                                            : "Paid-spin RTP counts only the paid spin. Whole-round RTP also counts free games and additive retriggers."}
                                        {exactPaidRtp !== undefined && exactTotalRtp !== undefined
                                            ? ` Current exact values: paid-spin ${(exactPaidRtp * 100).toFixed(
                                                4,
                                            )}%, whole-round ${(exactTotalRtp * 100).toFixed(4)}%.`
                                            : " Compute exact outcome table on Overview to see both current values here."}
                                    </Text>
                                    {paidScopeAfterFeatures && (
                                        <Button
                                            size="xs"
                                            mt="sm"
                                            variant="light"
                                            onClick={() => {
                                                updateRequest((next) => {
                                                    next.policy.scope = "logical-round";
                                                });
                                            }}
                                        >
                                            Use whole-round RTP
                                        </Button>
                                    )}
                                    <Text size="sm" mt={4}>
                                        Exact whole-round search supports RTP only. Use Simulation for whole-round
                                        volatility, largest observed win or hit frequency.
                                    </Text>
                                </Alert>
                            </>
                        )}
                        {targetMetric !== undefined && target?.tolerance?.kind === "relative" && (
                            <Text size="xs" c="dimmed">
                                This target currently uses a relative tolerance. Changing the tolerance here converts it
                                to an absolute one.
                            </Text>
                        )}
                        {request.targets.length > 1 && (
                            <Text size="xs" c="dimmed">
                                This request contains {request.targets.length} targets. The form edits the first target;
                                use the expert JSON policy for the rest.
                            </Text>
                        )}
                    </PageSection>

                    <CollapsiblePageSection
                        legend="Fields to tune"
                        detailsLabel="field list"
                        summary={
                            request.policy.tunables.length === 0
                                ? "No fields selected. Use the field list to choose paytable paths and candidate values."
                                : `${request.policy.tunables.length} field${
                                    request.policy.tunables.length === 1 ? "" : "s"
                                } selected: ${request.policy.tunables
                                    .map((tunable) => describeTunablePath(tunable.path))
                                    .join(", ")}. Candidate values are in the field list.`
                        }
                    >
                        {candidatePaths.length === 0 ? (
                            <Text size="sm">
                                No writable fields were discovered. Add a field path below or use the expert JSON
                                policy.
                            </Text>
                        ) : (
                            <>
                                <Text size="xs" c="dimmed" mb="sm">
                                    The default selection starts with the largest exact RTP contributor when exact
                                    math is available, otherwise the highest authored award. Review the selected
                                    field and candidates before running.
                                </Text>
                                {candidatePaths.length > 8 && (
                                    <TextInput
                                        label="Filter fields"
                                        placeholder="A, 3 symbols, 3 scatters, or a technical path"
                                        value={fieldFilter}
                                        onChange={(event) => setFieldFilter(event.currentTarget.value)}
                                        mb="sm"
                                    />
                                )}
                                <Checkbox
                                    label="Show technical field paths"
                                    checked={showFieldPaths}
                                    onChange={(event) => setShowFieldPaths(event.currentTarget.checked)}
                                    mb="sm"
                                />
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
                                                const tunable = request.policy.tunables.find(
                                                    (entry) => entry.path === path,
                                                );
                                                const label = describeTunablePath(path);
                                                const currentValue = tunableCurrentValue(path, model);
                                                const writableField =
                                                    writableSet === undefined || writableSet.has(path);
                                                return (
                                                    <Table.Tr key={path}>
                                                        <Table.Td>
                                                            <Checkbox
                                                                aria-label={`Tune ${label}`}
                                                                checked={tunable !== undefined}
                                                                title={
                                                                    tunable !== undefined &&
                                                                    request.policy.tunables.length === 1
                                                                        ? "At least one field must stay selected. Select another field before clearing this one."
                                                                        : undefined
                                                                }
                                                                onChange={(event) => {
                                                                    if (event.currentTarget.checked) addTunable(path);
                                                                    else removeTunable(path);
                                                                }}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm">{label}</Text>
                                                            {showFieldPaths && label !== path && (
                                                                <Text
                                                                    size="xs"
                                                                    c="dimmed"
                                                                    style={{overflowWrap: "anywhere"}}
                                                                >
                                                                    {path}
                                                                </Text>
                                                            )}
                                                            {!writableField && (
                                                                <Text size="xs" c="red">
                                                                    The current tuning check does not list this field as
                                                                    writable.
                                                                </Text>
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            {currentValue === undefined ? "—" : currentValue}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            {tunable === undefined ? (
                                                                <Text size="xs" c="dimmed">
                                                                    Select to edit.
                                                                </Text>
                                                            ) : (
                                                                <TunableValuesInput
                                                                    label={label}
                                                                    values={tunable.values}
                                                                    onCommit={(values) =>
                                                                        setTunableValues(path, values)
                                                                    }
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
                                        Showing the first {visiblePaths.length} of {filteredPaths.length} fields. Refine
                                        the filter to narrow the list.
                                    </Text>
                                )}
                            </>
                        )}
                        <Group align="end" mt="sm">
                            <TextInput
                                label="Advanced field path (optional)"
                                description="Most authors use the table above. Paste an advanced field path only for a field the table does not list; the tuning check validates it before use."
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
                        {fieldSelectionNotice !== undefined && (
                            <Alert color="yellow" variant="light" role="status" mt="sm">
                                {fieldSelectionNotice}
                            </Alert>
                        )}
                        {request.policy.tunables.length === 0 && (
                            <Text size="sm" c="red" mt="xs">
                                Select at least one field before checking support.
                            </Text>
                        )}
                        {request.policy.tunables.length === 1 && fieldSelectionNotice === undefined && (
                            <Text size="xs" c="dimmed" mt="xs">
                                Keep at least one field selected. To switch fields, select the new field first and then
                                clear this one.
                            </Text>
                        )}
                    </CollapsiblePageSection>

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
                                        next.policy.budget = Math.max(
                                            1,
                                            Math.min(MAX_SEARCH_BUDGET, Math.floor(number)),
                                        );
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
                                        next.policy.maxOutcomes = Math.max(
                                            1,
                                            Math.min(MAX_EXACT_OUTCOMES, Math.floor(number)),
                                        );
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
                                onChange={(event) =>
                                    updateRequest((next) => {
                                        next.policy.seed = event.currentTarget.value;
                                    })
                                }
                            />
                            <TextInput
                                label="Mode"
                                description="Bet mode identity; usually base"
                                value={request.policy.mode}
                                onChange={(event) =>
                                    updateRequest((next) => {
                                        next.policy.mode = event.currentTarget.value;
                                    })
                                }
                            />
                            <Select
                                label="Scope"
                                data={[
                                    {value: "paid-entry", label: "Paid entry"},
                                    {value: "logical-round", label: "Whole paid round (incl. free games)"},
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
                            Strategy:{" "}
                            {request.policy.strategy === "exact-finite-v1"
                                ? "exact finite search"
                                : request.policy.strategy}
                            .
                            {request.policy.strategy !== "exact-finite-v1" &&
                                " The sampling policy and protected fields are edited in the expert JSON."}
                        </Text>
                        <Text size="sm" mt="xs">
                            Search space: {domainSize.toLocaleString()} candidate combination
                            {domainSize === 1 ? "" : "s"} · budget: {request.policy.budget.toLocaleString()}.
                        </Text>
                        {domainSize > request.policy.budget && (
                            <Alert color="yellow" mt="xs">
                                The budget will evaluate at most {request.policy.budget.toLocaleString()} of{" "}
                                {domainSize.toLocaleString()} combinations.
                                <Group mt="xs">
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() =>
                                            updateRequest((next) => {
                                                next.policy.budget = Math.min(domainSize, MAX_SEARCH_BUDGET);
                                            })
                                        }
                                    >
                                        Use full search space
                                    </Button>
                                </Group>
                            </Alert>
                        )}
                    </AdvancedDisclosure>

                    <PageSection legend="Check and run">
                        <Text size="sm" c="dimmed" mb="sm">
                            Run checks these settings automatically. Use Check settings if you want to review the local
                            validation of the selected fields, protected fields and target scope before starting.
                        </Text>
                        <Group>
                            <Button
                                disabled={supportDisabled}
                                onClick={() => {
                                    action("support");
                                }}
                            >
                                Check settings
                            </Button>
                            <Button
                                disabled={busy || active || discoveryUnresolved || parsed.error !== undefined || request === undefined || request.policy.tunables.length === 0 || (support !== undefined && !support.supported)}
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
                                        {support.writable.length.toLocaleString()} writable field
                                        {support.writable.length === 1 ? "" : "s"} available;{" "}
                                        {request?.policy.tunables.length ?? 0} selected for this search.
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
                        {runDisabledReason && (
                            <Text id={runExplanationId} size="sm" mt="xs">
                                {runDisabledReason}
                            </Text>
                        )}
                    </PageSection>
                </>
            )}

            {jobStatusLine !== undefined && <Text role="status">{jobStatusLine}</Text>}
            {stale && (
                <Alert color="yellow" role="alert">
                    Historical optimization result — the saved design changed after this verdict. Check settings
                    and run a new optimization for the current design. Earlier evidence remains available as history.
                    {retainedResult && (
                        <details>
                            <summary>Historical optimization details</summary>
                            <Code block>{JSON.stringify(retainedResult, null, 2)}</Code>
                        </details>
                    )}
                </Alert>
            )}
            {busyAction === "apply" && (
                <Alert color="blue" role="status" aria-live="polite" title="Applying reviewed changes">
                    Saving the selected values to the game design. The saved model and exact-math freshness refresh when
                    the write completes.
                </Alert>
            )}
            {busyAction === "undo" && (
                <Alert color="blue" role="status" aria-live="polite" title="Restoring previous design values">
                    The previous design values are being restored. The saved model refreshes when the write completes.
                </Alert>
            )}
            {result &&
                verdictBody &&
                (historicalResult ? (
                    <details>
                        <summary>Historical optimization result — {result.status}</summary>
                        <div ref={resultRef}>{verdictBody}</div>
                    </details>
                ) : (
                    <div ref={resultRef}>{verdictBody}</div>
                ))}
            {job?.error && (
                <Alert color="red" role="alert">
                    {job.error}
                </Alert>
            )}
            {job?.recovery && (
                <Alert color="yellow" role="alert">
                    Recovery ({job.recovery.action}): {job.recovery.reason}
                </Alert>
            )}
            <JobObservationNotice
                discoveryStatus={jobs.discoveryStatus}
                connectionError={jobs.connectionError}
                actionError={jobs.actionError}
                onReattach={jobs.refresh}
            />
            {!hasApplied &&
                !job?.result?.provenance?.authoredUndo &&
                result?.candidate &&
                (!hasSourceDiff || hasEffectiveSourceChange) &&
                ["success", "attained", "inconclusive", "exhausted"].includes(result.status) &&
                job?.status === "completed" && (
                <>
                    {["blueprint", "parWorkbook", "tsPackage"].includes(result.candidate.type) && (
                        <Button
                            disabled={busy}
                            onClick={() => {
                                confirm(
                                    "Apply these reviewed changes to the saved design? This writes the selected values to the project source. A portable backup of the current source is written first.",
                                    () => {
                                        action("apply").catch((failure: unknown) =>
                                            setError(failure instanceof Error ? failure.message : String(failure)),
                                        );
                                    },
                                    undefined,
                                    {
                                        confirm: "optimization-apply-confirm",
                                        cancel: "optimization-apply-dismiss",
                                        operation: "optimization-apply",
                                    },
                                );
                            }}
                        >
                                Apply reviewed changes
                        </Button>
                    )}
                    <TextInput
                        label="Save candidate to"
                        description="Copy the reviewed candidate to a separate destination instead of changing the source."
                        value={destination}
                        onChange={(event) => setDestination(event.currentTarget.value)}
                    />
                    {!destination.trim() && (
                        <Text size="xs" c="dimmed">
                            Type a destination path to enable saving the reviewed candidate.
                        </Text>
                    )}
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
            {appliedToSource && undoNotice === undefined && (
                <Alert color="green" title="Applied — changes saved to the game design">
                    <Text size="sm">
                        The reviewed values are now part of the saved design. Check settings and run a fresh preview
                        before applying again.
                    </Text>
                    {undo !== undefined && (
                        <Group mt="xs">
                            <Button
                                size="xs"
                                variant="default"
                                disabled={busy}
                                onClick={() => {
                                    undoApply().catch((failure: unknown) =>
                                        setError(failure instanceof Error ? failure.message : String(failure)),
                                    );
                                }}
                            >
                                Undo applied changes
                            </Button>
                            <Text size="xs" c="dimmed">
                                Available for 15 minutes in this browser, including after a reload. A different browser,
                                a private window, or cleared site data cannot use it. If the design source changed after
                                applying, Undo will report that it is no longer valid.
                            </Text>
                        </Group>
                    )}
                </Alert>
            )}
            {undoNotice !== undefined && <Alert color="teal">{undoNotice}</Alert>}
            {backup !== undefined && (
                <Alert color="gray" variant="light" title="Portable pre-apply backup" mt="sm">
                    <Text size="sm">
                        Saved before the write to <code style={{overflowWrap: "anywhere"}}>{backup.path}</code>.
                    </Text>
                    <Group mt="xs">
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => downloadTextFile(backup.filename, backup.content)}
                        >
                            Download pre-apply backup
                        </Button>
                        <Button
                            size="xs"
                            variant="subtle"
                            onClick={() => {
                                navigator.clipboard?.writeText(backup.path).catch(() => undefined);
                            }}
                        >
                            Copy path
                        </Button>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                        This backup is independent of the browser-local Undo and survives a Studio restart.
                    </Text>
                </Alert>
            )}
            {!applied && job?.result?.provenance?.authoredUndo !== undefined && undoNotice === undefined && (
                <Alert color="gray">
                    This candidate was applied and then undone. Run a new optimization to review a fresh candidate
                    before applying again.
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
                    The form above is a view over this request document. Editing it replaces the form values; invalid
                    JSON disables the form.
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
                        setAppliedRevision(undefined);
                        setSaved(undefined);
                        setError(undefined);
                    }}
                />
            </AdvancedDisclosure>
        </Stack>
    );
}

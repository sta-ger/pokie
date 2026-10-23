import {JobObservationNotice} from "../common/JobObservationNotice";
import {OptimizationPreview} from "./OptimizationPreview";
import {Alert, Button, Code, Stack, Text, Textarea, TextInput, Title} from "@mantine/core";
import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {optimizationAction} from "../../api/apiClient";
import type {
    StudioJobView,
    StudioOptimizationRequest,
    StudioOptimizationResult,
    StudioOptimizationSupport,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import type {useProjectJobs} from "../../hooks/useProjectJobs";
import {validateOptimizationRequest} from "../../../../../src/optimization/validateOptimizationRequest";

const initialRequest: StudioOptimizationRequest = {
    targets: [{metric: "rtp", unit: "ratio", value: 0.95, tolerance: {kind: "absolute", value: 0.001}}],
    policy: {
        strategy: "exact-finite-v1",
        seed: "optimization-1",
        budget: 100,
        maxOutcomes: 100000,
        mode: "base",
        stake: 1,
        scope: "paid-entry",
        tunables: [{path: "/paytable/A/3", values: [1, 2, 3]}],
        locks: [],
    },
};
/** Policy form and operation cards consume the dashboard's same durable observations. */
export function OptimizationPanel({projectRoot, jobs, sourceChange, onStarted, onApplied}: {
    projectRoot: string;
    jobs: ReturnType<typeof useProjectJobs>;
    sourceChange?: {sourceRevision?: string};
    onStarted?: (sourceRevision: string) => void;
    onApplied?: () => void;
}) {
    const fetchImpl = useStudioApi();
    const [text, setText] = useState(JSON.stringify(initialRequest, null, 2));
    const [supportSnapshot, setSupportSnapshot] = useState<{value: StudioOptimizationSupport; sourceChange: typeof sourceChange}>();
    const support = supportSnapshot?.sourceChange === sourceChange ? supportSnapshot?.value : undefined;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [destination, setDestination] = useState("");
    const [saved, setSaved] = useState<string>();
    const [applied, setApplied] = useState(false);
    const [started, setStarted] = useState<StudioJobView>();
    const generation = useRef(0);
    const edited = useRef(false);
    const controller = useRef<AbortController | undefined>(undefined);
    useEffect(
        () => {
            setApplied(false);
            setSupportSnapshot(undefined);
            setStarted(undefined);
            setSaved(undefined);
            setError(undefined);
            setBusy(false);
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
    const projectJobs = jobs.jobs;
    const job =
        projectJobs.find((item) => item.id === started?.id) ??
        started ??
        projectJobs.find((item) => item.operation === "optimization");
    useEffect(() => {
        if (!edited.current && job?.request.request) {
            setText(JSON.stringify(job.request.request, null, 2));
            edited.current = true;
        }
    }, [job]);
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
    const action = async (kind: "support" | "start" | "save" | "apply"): Promise<void> => {
        if (kind === "start" && (discoveryUnresolved || !support?.supported)) return;
        if ((kind === "save" || kind === "apply") && stale) return;
        const current = ++generation.current;
        controller.current?.abort();
        controller.current = new AbortController();
        setBusy(true);
        setError(undefined);
        setSaved(undefined);
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
                const value = await optimizationAction<{outputPath: string; warning?: string}>(
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
    const unreportedProgress = active ? "Preparing optimization; waiting for execution progress." : "No execution progress recorded.";
    return (
        <Stack mt="lg">
            <Title order={3}>Optimize math</Title>
            <Text size="sm">
                Review the targets and changes, then explicitly apply authored Blueprint/PAR/declared package parameters or save a same-type artifact to a new destination.
            </Text>
            <Textarea
                label="Math targets and optimization policy (JSON)"
                minRows={8}
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
                }}
            />
            <Button
                disabled={busy || active}
                onClick={() => {
                    action("support");
                }}
            >
                Check tuning support
            </Button>
            {support && (
                <Alert color={support.supported ? "blue" : "yellow"}>
                    {support.reason}
                    {support.writable && <Text size="sm">Writable fields: {support.writable.join(", ")}</Text>}
                </Alert>
            )}
            <Button
                disabled={busy || active || discoveryUnresolved || !support?.supported}
                onClick={() => {
                    action("start");
                }}
            >
                Run optimization
            </Button>
            {active && (
                <Button
                    disabled={job.status === "cancelling" || jobs.pendingIds.includes(job.id)}
                    onClick={() => {
                        jobs.cancel(job.id);
                    }}
                >
                    Cancel optimization
                </Button>
            )}
            {job && (
                <Text role="status">
                    {stale && "Historical optimization — "}{job.status}: {job.progress ? <>
                        {job.progress.current} / {job.progress.total} {job.progress.unit} {job.progress.stage}
                        {job.progress.message && ` · ${job.progress.message}`}
                    </> : unreportedProgress}
                </Text>
            )}
            {stale && <Alert color="yellow" role="alert">
                Stale optimization result — the saved design changed. Check tuning support and run a new optimization for the current design. Retained evidence remains available as history.
                {retainedResult && <details><summary>Historical optimization evidence</summary><Code block>{JSON.stringify(retainedResult, null, 2)}</Code></details>}
            </Alert>}
            {result && (
                <>
                    <Text>Verdict: {result.status}</Text>
                    {result.candidate && !["success", "attained"].includes(result.status) && <Alert color="yellow">Best-so-far candidate; targets are not approved. Saving preserves this verdict.</Alert>}
                    {result.diagnostics.length > 0 && <Alert color="red" role="alert">{result.diagnostics.map((item) => `${item.path}: ${item.message}`).join("; ")}</Alert>}
                    {result.evidence && <>
                        <OptimizationPreview evidence={result.evidence} />
                        <details><summary>Full evidence and provenance</summary><Code block>{JSON.stringify(result.evidence, null, 2)}</Code></details>
                    </>}
                </>
            )}
            {job?.error && <Alert color="red" role="alert">{job.error}</Alert>}
            {job?.recovery && <Alert color="yellow" role="alert">Recovery ({job.recovery.action}): {job.recovery.reason}</Alert>}
            <JobObservationNotice discoveryStatus={jobs.discoveryStatus} connectionError={jobs.connectionError} actionError={jobs.actionError} onReattach={jobs.refresh} />
            {!applied && !job?.result?.provenance?.authoredApply && result?.candidate && ["success", "attained", "inconclusive", "exhausted"].includes(result.status) && job?.status === "completed" && (
                <>
                    { ["blueprint", "parWorkbook", "tsPackage"].includes(result.candidate.type) && <Button disabled={busy} onClick={() => {
                        action("apply");
                    }}>Apply reviewed changes to source</Button>}
                    <TextInput
                        label="Candidate destination"
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
            {(applied || Boolean(job?.result?.provenance?.authoredApply)) && <Alert color="green">Authored changes applied. Check support and run a fresh preview before applying again.</Alert>}
            {saved && <Alert color="green">Candidate saved: {saved}</Alert>}
            {error && (
                <Alert color="red" role="alert">
                    {error}
                </Alert>
            )}
        </Stack>
    );
}

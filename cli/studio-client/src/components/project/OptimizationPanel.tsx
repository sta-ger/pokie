import {Alert, Button, Code, Stack, Text, Textarea, TextInput, Title} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {optimizationAction} from "../../api/apiClient";
import type {
    StudioJobView,
    StudioOptimizationRequest,
    StudioOptimizationResult,
    StudioOptimizationSupport,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {useProjectJobs} from "../../hooks/useProjectJobs";
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
/** One shared policy form, available in runtime, native outcome and artifact dashboards. */
export function OptimizationPanel({projectRoot}: {projectRoot: string}) {
    const fetchImpl = useStudioApi();
    const [text, setText] = useState(JSON.stringify(initialRequest, null, 2));
    const [support, setSupport] = useState<StudioOptimizationSupport>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [destination, setDestination] = useState("");
    const [saved, setSaved] = useState<string>();
    const [started, setStarted] = useState<StudioJobView>();
    const generation = useRef(0);
    const edited = useRef(false);
    const controller = useRef<AbortController | undefined>(undefined);
    const jobs = useProjectJobs(fetchImpl, projectRoot, 0);
    useEffect(
        () => () => {
            generation.current++;
            controller.current?.abort();
        },
        [projectRoot],
    );
    const job =
        jobs.jobs.find((item) => item.id === started?.id) ??
        started ??
        jobs.jobs.find((item) => item.operation === "optimization");
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
    const result = matchesRequest ? (job?.result?.detail as StudioOptimizationResult | undefined) : undefined;
    const active = job !== undefined && ["queued", "running", "cancelling"].includes(job.status);
    const action = async (kind: "support" | "start" | "save"): Promise<void> => {
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
                    {request},
                    controller.current.signal,
                );
                if (current === generation.current) setSupport(value);
            } else if (kind === "start") {
                const value = await optimizationAction<{job: StudioJobView}>(
                    fetchImpl,
                    kind,
                    {request, sourceRevision: support?.sourceRevision},
                    controller.current.signal,
                );
                if (current === generation.current) {
                    setStarted(value.job);
                    jobs.refresh();
                }
            } else {
                const value = await optimizationAction<{outputPath: string}>(
                    fetchImpl,
                    kind,
                    {jobId: job?.id, destination},
                    controller.current.signal,
                );
                if (current === generation.current) setSaved(value.outputPath);
            }
        } catch (failure) {
            if (current === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            if (current === generation.current) setBusy(false);
        }
    };
    return (
        <Stack mt="lg">
            <Title order={3}>Optimize math</Title>
            <Text size="sm">
                Review a finite same-type candidate, then save it to a new destination. Authored source changes require
                a separate save or apply.
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
                    setSupport(undefined);
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
                disabled={busy || active || !support?.supported}
                onClick={() => {
                    action("start");
                }}
            >
                Run exact optimization
            </Button>
            {active && (
                <Button
                    disabled={job.status === "cancelling"}
                    onClick={() => {
                        jobs.cancel(job.id);
                    }}
                >
                    Cancel optimization
                </Button>
            )}
            {job && (
                <Text role="status">
                    {job.status}: {job.progress?.current ?? 0} / {job.progress?.total ?? "unknown"}{" "}
                    {job.progress?.unit ?? "work"}
                </Text>
            )}
            {result && (
                <>
                    <Text>Verdict: {result.status}</Text>
                    <Code block>{JSON.stringify(result.evidence ?? result.diagnostics, null, 2)}</Code>
                </>
            )}
            {result?.candidate && (
                <>
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
            {saved && <Alert color="green">Candidate saved: {saved}</Alert>}
            {error && (
                <Alert color="red" role="alert">
                    {error}
                </Alert>
            )}
        </Stack>
    );
}

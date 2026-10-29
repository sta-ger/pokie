import {Alert, Button, Stack, Text, Title} from "@mantine/core";
import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {checkNativePickerAvailability, getContext, openOutputFolder, revealOutputPath} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {useProjectJobs} from "../../hooks/useProjectJobs";
import {useOpenProject} from "../../hooks/useOpenProject";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {JobCard} from "../common/JobCard";
import {JobObservationNotice} from "../common/JobObservationNotice";

/** Home observes the current project; visiting Home never closes that workspace. */
export function HomeProjectJobs() {
    const fetchImpl = useStudioApi();
    const [generation, setGeneration] = useState(0);
    const [context, setContext] = useState<{pending: boolean; projectRoot?: string; error?: string}>({pending: true});
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10_000);
        getContext(fetchImpl, controller.signal).then((current) => {
            if (!cancelled) setContext({pending: false, projectRoot: current.mode === "project" ? current.projectRoot : undefined});
        }).catch((error: unknown) => {
            if (!cancelled) setContext(previous => ({...previous, pending: false, error: `Cannot check the current project's work. ${errorMessage(error)}`}));
        }).finally(() => window.clearTimeout(timeout));
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [fetchImpl, generation]);

    return (
        <>
            {context.pending && <Text role="status">Checking for active project work…</Text>}
            {context.error !== undefined && <Alert role="alert" color="orange">
                <Stack gap="xs">
                    <Text>{context.error}</Text>
                    <Button variant="default" size="xs" onClick={() => setGeneration(value => value + 1)}>Retry project discovery</Button>
                </Stack>
            </Alert>}
            {context.projectRoot !== undefined && <CurrentProjectJobs key={context.projectRoot} projectRoot={context.projectRoot} onRefreshContext={() => setGeneration(value => value + 1)} />}
        </>
    );
}

function CurrentProjectJobs({projectRoot, onRefreshContext}: {projectRoot: string; onRefreshContext: () => void}) {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const jobs = useProjectJobs(fetchImpl, projectRoot, 0);
    const openAndNavigate = useOpenProject();
    const outputGuard = useDoubleSubmitGuard();
    const [outputPending, setOutputPending] = useState(false);
    const [outputNotice, setOutputNotice] = useState<string>();
    const [outputUnavailableReason, setOutputUnavailableReason] = useState<string | undefined>("Checking local output access.");
    useEffect(() => {
        let cancelled = false;
        checkNativePickerAvailability(fetchImpl).then(view => {
            if (!cancelled) setOutputUnavailableReason(view.status === "unavailable" ? view.reason : undefined);
        }).catch(() => {
            if (!cancelled) setOutputUnavailableReason("This Studio session cannot confirm access to its server's local output.");
        });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);
    const runOutput = (action: () => Promise<void>): void => {
        if (!outputGuard.begin()) return;
        setOutputPending(true);
        setOutputNotice(undefined);
        action().catch((error: unknown) => setOutputNotice(errorMessage(error))).finally(() => {
            outputGuard.end();
            setOutputPending(false);
        });
    };
    const hostOutput = (path: string, reveal: boolean): void => runOutput(async () => {
        const result = await (reveal ? revealOutputPath : openOutputFolder)(fetchImpl, path);
        if (result.status === "ok") setOutputNotice(reveal ? "Revealed job output." : "Opened job output.");
        else setOutputNotice(result.status === "unavailable" ? result.reason : result.message);
    });
    // Opening records already have their source-scoped Home card and actions.
    const projectJobs = jobs.jobs.filter(job => job.operation !== "project-open-materialization");
    return (
        <Stack gap="xs" mt="lg" role="region" aria-label="Current project operations">
            <Title order={3}>Project operations</Title>
            <Text size="sm" c="dimmed">Your project stays open while you visit Home. Server-owned work continues here. Return to the project to review results or configure an explicit retry.</Text>
            <Text className="studio-technical-text" size="xs">{projectRoot}</Text>
            <Button variant="default" onClick={() => navigate(`/project/${encodeURIComponent(projectRoot)}/overview`)}>Return to project</Button>
            <JobObservationNotice discoveryStatus={jobs.discoveryStatus} connectionError={jobs.connectionError} actionError={jobs.actionError} onReattach={async () => {
                onRefreshContext();
                await jobs.refresh();
            }} />
            {projectJobs.map(job => <JobCard key={job.id} job={job} cancellationPending={jobs.pendingIds.includes(job.id)} onCancel={jobs.cancel} onRecover={jobs.recover}
                onRecoveryAction={() => navigate(`/project/${encodeURIComponent(projectRoot)}/overview?recoverJob=${encodeURIComponent(job.id)}`)}
                onOpenOutput={path => hostOutput(path, false)} onRevealOutput={path => hostOutput(path, true)}
                onInspectOutput={path => runOutput(() => openAndNavigate(path))}
                outputActionsUnavailableReason={outputUnavailableReason}
                actionsDisabledReason={outputPending ? "Opening job output. Wait for its result." : undefined} />)}
            {outputNotice !== undefined && <Text size="xs" aria-live="polite">{outputNotice}</Text>}
        </Stack>
    );
}

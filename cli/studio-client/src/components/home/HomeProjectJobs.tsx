import {Alert, Button, Stack, Text, Title} from "@mantine/core";
import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {getContext} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {useProjectJobs} from "../../hooks/useProjectJobs";
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
            {projectJobs.map(job => <JobCard key={job.id} job={job} cancellationPending={jobs.pendingIds.includes(job.id)} onCancel={jobs.cancel} onRecover={jobs.recover} />)}
        </Stack>
    );
}

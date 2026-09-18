import {useCallback, useEffect, useRef, useState} from "react";
import {cancelHomeSourceJob, getHomeSourceJob, listHomeSourceJobs, recoverHomeSourceJob, type FetchLike} from "../api/apiClient.js";
import type {StudioJobView} from "../api/types.js";

const active = (job: StudioJobView): boolean => job.status === "queued" || job.status === "running" || job.status === "cancelling";

/**
 * Home's counterpart to useProjectJobs.  It deliberately discovers all retained
 * source-scoped records when no source is selected: after a browser reload Home
 * otherwise has no remembered path from which to rediscover a Design build.
 */
export function useHomeSourceJobs(fetchImpl: FetchLike, sourcePath?: string) {
    const [jobs, setJobs] = useState<StudioJobView[]>([]);
    const requestGeneration = useRef(0);

    const refresh = useCallback(async () => {
        const generation = ++requestGeneration.current;
        const discovered = await listHomeSourceJobs(fetchImpl, sourcePath);
        if (generation === requestGeneration.current) setJobs(discovered);
    }, [fetchImpl, sourcePath]);

    useEffect(() => {
        setJobs([]);
        refresh().catch(() => {
            // Do not keep stale source cards visible if Home's scope changes.
            setJobs([]);
        });
    }, [refresh, sourcePath]);

    useEffect(() => {
        if (!jobs.some(active)) return undefined;
        const generation = requestGeneration.current;
        const timer = window.setTimeout(() => {
            Promise.all(jobs.filter(active).map((job) => getHomeSourceJob(fetchImpl, job.id, sourcePath))).then((updates) => {
                if (generation !== requestGeneration.current) return;
                setJobs((previous) => previous.map((job) => updates.find((update) => update.id === job.id) ?? job));
            }).catch(() => undefined);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [fetchImpl, jobs, sourcePath]);

    const cancel = useCallback((id: string): void => {
        const generation = requestGeneration.current;
        cancelHomeSourceJob(fetchImpl, id, sourcePath).then((job) => {
            if (generation !== requestGeneration.current) return;
            setJobs((previous) => previous.map((existing) => existing.id === id ? job : existing));
        }).catch(() => undefined);
    }, [fetchImpl, sourcePath]);

    const recover = useCallback((id: string): void => {
        const generation = requestGeneration.current;
        recoverHomeSourceJob(fetchImpl, id, sourcePath).then((job) => {
            if (generation !== requestGeneration.current) return;
            setJobs((previous) => previous.map((existing) => existing.id === id ? job : existing));
        }).catch(() => undefined);
    }, [fetchImpl, sourcePath]);

    return {jobs, refresh, cancel, recover};
}

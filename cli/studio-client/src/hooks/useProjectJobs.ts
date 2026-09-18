import {useCallback, useEffect, useRef, useState} from "react";
import {cancelProjectJob, getProjectJob, listProjectJobs, recoverProjectJob, type FetchLike} from "../api/apiClient.js";
import type {StudioJobView} from "../api/types.js";

const active = (job: StudioJobView): boolean => job.status === "queued" || job.status === "running" || job.status === "cancelling";

/**
 * Discovers jobs from the server on every mount. `generation` is supplied by
 * the dashboard's project transition owner: both it and projectId are checked
 * before committing list or poll responses, so an old project cannot leak into
 * a new dashboard while a fetch is in flight.
 */
export function useProjectJobs(fetchImpl: FetchLike, projectId: string | undefined, generation: number) {
    const [jobs, setJobs] = useState<StudioJobView[]>([]);
    const current = useRef({projectId, generation});

    useEffect(() => {
        const projectChanged = current.current.projectId !== projectId;
        current.current = {projectId, generation};
        // A genuine workspace change must never leave the previous project's
        // retained cards visible while the new discovery request is in flight.
        if (projectChanged) setJobs([]);
    }, [generation, projectId]);

    const refresh = useCallback(async () => {
        const identity = {projectId, generation};
        if (identity.projectId === undefined) {
            setJobs([]);
            return;
        }
        const discovered = await listProjectJobs(fetchImpl);
        if (current.current.projectId === identity.projectId && current.current.generation === identity.generation) {
            // The server has already scoped this response to its canonical
            // project identity.  `projectId` here is the routed/display path,
            // which may be a symlink alias of that identity; filtering the
            // response against it would hide exactly the durable jobs that
            // list/detail/cancel are intentionally able to share through an
            // alias.  Generation still rejects a response from a prior route.
            setJobs(discovered);
        }
    }, [fetchImpl, generation, projectId]);

    useEffect(() => {
        refresh().catch(() => {
            if (current.current.projectId === projectId && current.current.generation === generation) setJobs([]);
        });
    }, [generation, projectId, refresh]);

    useEffect(() => {
        if (!jobs.some(active) || projectId === undefined) return undefined;
        const identity = {projectId, generation};
        const timer = window.setTimeout(() => {
            Promise.all(jobs.filter(active).map((job) => getProjectJob(fetchImpl, job.id))).then((updates) => {
                if (current.current.projectId !== identity.projectId || current.current.generation !== identity.generation) return;
                // `getProjectJob` is server-scoped to the routed project.  A canonical record can therefore
                // legitimately carry a different `projectId` from a symlink route; matching it back to the
                // alias would freeze an active card forever.  The request generation above is the client-side
                // guard against an old route, and the server is the authority for the job/project binding.
                setJobs((previous) => previous.map((job) => updates.find((update) => update.id === job.id) ?? job));
            }).catch(() => undefined);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [fetchImpl, generation, jobs, projectId]);

    const cancel = useCallback((id: string): void => {
        const identity = {projectId, generation};
        if (identity.projectId === undefined) return;
        cancelProjectJob(fetchImpl, id).then((job) => {
            if (current.current.projectId !== identity.projectId || current.current.generation !== identity.generation) return;
            setJobs((previous) => previous.map((existing) => existing.id === id ? job : existing));
        }).catch(() => undefined);
    }, [fetchImpl, generation, projectId]);

    const recover = useCallback((id: string): void => {
        const identity = {projectId, generation};
        if (identity.projectId === undefined) return;
        recoverProjectJob(fetchImpl, id).then((job) => {
            if (current.current.projectId !== identity.projectId || current.current.generation !== identity.generation) return;
            setJobs((previous) => previous.map((existing) => existing.id === id ? job : existing));
        }).catch(() => undefined);
    }, [fetchImpl, generation, projectId]);

    return {jobs, refresh, cancel, recover};
}

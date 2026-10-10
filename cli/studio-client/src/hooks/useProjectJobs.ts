import {useMemo} from "react";
import {cancelProjectJob, getProjectJob, listProjectJobs, recoverProjectJob, type FetchLike} from "../api/apiClient.js";
import {useDurableJobs} from "./useDurableJobs.js";

/** Discover server-scoped durable work without resubmitting any operation. */
export function useProjectJobs(fetchImpl: FetchLike, projectId: string | undefined, generation: number) {
    const port = useMemo(() => ({
        list: (signal: AbortSignal) => listProjectJobs(fetchImpl, signal),
        get: (id: string, signal: AbortSignal) => getProjectJob(fetchImpl, id, signal),
        cancel: (id: string, signal: AbortSignal) => cancelProjectJob(fetchImpl, id, signal),
        recover: (id: string, signal: AbortSignal) => recoverProjectJob(fetchImpl, id, signal),
    }), [fetchImpl]);
    return useDurableJobs(port, projectId, generation);
}

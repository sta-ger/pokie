import {useMemo} from "react";
import {cancelHomeSourceJob, getHomeSourceJob, listHomeSourceJobs, recoverHomeSourceJob, type FetchLike} from "../api/apiClient.js";
import {useDurableJobs} from "./useDurableJobs.js";

/** Discover server-scoped durable work without resubmitting any operation. */
export function useHomeSourceJobs(fetchImpl: FetchLike, sourcePath?: string) {
    const port = useMemo(() => ({
        list: (signal: AbortSignal) => listHomeSourceJobs(fetchImpl, sourcePath, signal),
        get: (id: string, signal: AbortSignal) => getHomeSourceJob(fetchImpl, id, sourcePath, signal),
        cancel: (id: string, signal: AbortSignal) => cancelHomeSourceJob(fetchImpl, id, sourcePath, signal),
        recover: (id: string, signal: AbortSignal) => recoverHomeSourceJob(fetchImpl, id, sourcePath, signal),
    }), [fetchImpl, sourcePath]);
    return useDurableJobs(port, sourcePath ?? "all-home-sources");
}

import {useCallback, useEffect, useRef, useState} from "react";
import type {StudioJobView} from "../api/types.js";
import {errorMessage} from "../domain/errorMessage.js";

export interface DurableJobsObserving {
    list(signal: AbortSignal): Promise<StudioJobView[]>;
    get(id: string, signal: AbortSignal): Promise<StudioJobView>;
    cancel(id: string, signal: AbortSignal): Promise<StudioJobView>;
    recover(id: string, signal: AbortSignal): Promise<StudioJobView>;
}

const active = (job: StudioJobView): boolean => job.status === "queued" || job.status === "running" || job.status === "cancelling";

/** An observation cannot undo accepted cancellation or a retained terminal. */
function observed(previous: StudioJobView | undefined, next: StudioJobView): StudioJobView {
    if (previous === undefined || next.createdAt > previous.createdAt) return next;
    if (next.createdAt < previous.createdAt) return previous;
    // Checkpoint resume can reuse an id with a newly accepted creation time.
    // Within one execution, cancellation and terminal status are monotonic;
    // same-status snapshots may refine retained recovery/output metadata.
    if ((!active(previous) && previous.status !== next.status) || (previous.status === "cancelling" && active(next) && next.status !== "cancelling")) return previous;
    return next;
}

/** Shared transport recovery, with project/source scoping left to each API adapter. */
export function useDurableJobs(port: DurableJobsObserving, scope: string | undefined, generation = 0) {
    const [jobs, setJobs] = useState<StudioJobView[]>([]);
    const [connectionError, setConnectionError] = useState<string>();
    const [actionError, setActionError] = useState<string>();
    const [pendingIds, setPendingIds] = useState<string[]>([]);
    const owner = useRef(0);
    const listSequence = useRef(0);
    const revisions = useRef(new Map<string, number>());
    const pending = useRef(new Set<string>());
    const knownJobs = useRef(jobs);
    const previousScope = useRef(scope);
    const requests = useRef(new Map<AbortController, number>());
    const request = useCallback(<T, >(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 10_000);
        requests.current.set(controller, timer);
        return work(controller.signal).finally(() => {
            window.clearTimeout(timer);
            requests.current.delete(controller);
        });
    }, []);
    useEffect(() => {
        knownJobs.current = jobs;
    }, [jobs]);

    const refresh = useCallback(async (): Promise<void> => {
        if (scope === undefined) return;
        const token = owner.current;
        const sequence = ++listSequence.current;
        const snapshot = new Map(revisions.current);
        try {
            const discovered = await request((signal) => port.list(signal));
            if (token !== owner.current || sequence !== listSequence.current) return;
            setJobs((previous) => {
                const merged = [...previous];
                for (const job of discovered) {
                    if (snapshot.get(job.id) !== revisions.current.get(job.id)) continue;
                    const index = merged.findIndex((existing) => existing.id === job.id);
                    if (index === -1) merged.push(job);
                    else merged[index] = observed(merged[index], job);
                }
                // A transiently incomplete list never erases known durable work.
                return merged.sort((left, right) => right.createdAt - left.createdAt);
            });
            setConnectionError(undefined);
        } catch (error: unknown) {
            if (token === owner.current && sequence === listSequence.current) {
                setConnectionError(`Connection to Studio lost. Known work is retained; reconnecting automatically. ${errorMessage(error)}`);
            }
        }
    }, [port, request, scope]);

    useEffect(() => {
        const token = ++owner.current;
        const ownedRequests = requests.current;
        if (previousScope.current !== scope) {
            setJobs([]);
            knownJobs.current = [];
        }
        previousScope.current = scope;
        revisions.current.clear();
        pending.current.clear();
        setPendingIds([]);
        setConnectionError(undefined);
        setActionError(undefined);
        if (scope === undefined) return () => {
            owner.current = token + 1;
        };
        let timer: number | undefined;
        const observe = async (): Promise<void> => {
            await refresh();
            if (token !== owner.current) return;
            // Details settle independently: one lost request cannot hide another terminal.
            await Promise.all(knownJobs.current.filter(active).map(async (job) => {
                const revision = revisions.current.get(job.id);
                try {
                    const update = await request((signal) => port.get(job.id, signal));
                    if (token !== owner.current || revision !== revisions.current.get(job.id)) return;
                    if (update.id !== job.id) throw new Error(`Studio returned a different job for ${job.id}.`);
                    setJobs((previous) => previous.map((existing) => existing.id === job.id ? observed(existing, update) : existing));
                } catch (error: unknown) {
                    if (token === owner.current && revision === revisions.current.get(job.id)) {
                        setConnectionError(`Cannot observe job ${job.id}. Known work is retained; reconnecting automatically. ${errorMessage(error)}`);
                    }
                }
            }));
            if (token === owner.current) timer = window.setTimeout(() => {
                observe();
            }, 500);
        };
        // The first detail request waits one interval after mount discovery.
        refresh().then(() => {
            if (token === owner.current) timer = window.setTimeout(() => {
                observe();
            }, 500);
        });
        return () => {
            owner.current = token + 1;
            window.clearTimeout(timer);
            for (const [controller, requestTimer] of ownedRequests) {
                window.clearTimeout(requestTimer);
                controller.abort();
            }
            ownedRequests.clear();
        };
    }, [generation, port, refresh, request, scope]);

    const control = useCallback((id: string, action: "cancel" | "recover"): void => {
        if (scope === undefined || pending.current.has(id)) return;
        const token = owner.current;
        const revision = (revisions.current.get(id) ?? 0) + 1;
        revisions.current.set(id, revision);
        pending.current.add(id);
        setPendingIds([...pending.current]);
        setActionError(undefined);
        request((signal) => port[action](id, signal)).then((job) => {
            if (token !== owner.current || revision !== revisions.current.get(id)) return;
            if (job.id !== id) throw new Error(`Studio returned a different job for ${id}.`);
            // Discovery/detail can observe completion while this acknowledgment
            // is in flight. Retain that terminal and its outputs; a same-ID
            // checkpoint resume is authoritative only for a newer execution.
            setJobs((previous) => previous.map((existing) => {
                if (existing.id !== id) return existing;
                if (existing.createdAt === job.createdAt && !active(existing)) return existing;
                return observed(existing, job);
            }));
        }).catch((error: unknown) => {
            if (token === owner.current) setActionError(`Could not ${action === "cancel" ? "cancel" : "resume"} job ${id}. Work remains retained. Try again or reattach. ${errorMessage(error)}`);
        }).finally(() => {
            if (token !== owner.current) return;
            revisions.current.set(id, revision + 1);
            pending.current.delete(id);
            setPendingIds([...pending.current]);
        });
    }, [port, request, scope]);

    const cancel = useCallback((id: string) => control(id, "cancel"), [control]);
    const recover = useCallback((id: string) => control(id, "recover"), [control]);
    return {jobs, refresh, cancel, recover, connectionError, actionError, pendingIds};
}

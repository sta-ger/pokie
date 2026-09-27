import {useEffect, useRef, useState} from "react";
import {cancelSimulation, getSimulation, startSimulation} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeSimulationProgress, isSimulationActive, type SimulationProgressView} from "../domain/interpret/Simulation";
import {useDoubleSubmitGuard} from "./useDoubleSubmitGuard";
import type {StudioSimulationJobView} from "../api/types";

const POLL_INTERVAL_MS = 500;
type SimulationOperation = "simulation" | "simulation-retry";

/** The durable terminal record rendered for the public control that created it. */
export type SimulationTerminalReceipt = Readonly<{
    operation: SimulationOperation;
    jobId: string;
    status: StudioSimulationJobView["status"];
    /** The terminal was reconciled from Studio's durable job store after restart. */
    recoveredAfterRestart?: true;
}>;

// Ports pollSimulation (500ms, uncapped -- a legitimate simulation is allowed to run as long as it
// actually takes) -- stops once the job is terminal, or once the Simulation tab's owning page unmounts.
// `poll` is a hoisted function declaration (not useCallback) specifically so it can call itself
// recursively via setTimeout without a forward-reference -- these handlers are plain functions, not
// memoized, since nothing here depends on their identity staying stable across renders.
//
// StrictMode note: React's dev-only mount -> cleanup -> mount cycle means the setup effect below must
// reset `cancelledRef` back to false on every run, not just flip it to true in cleanup -- otherwise the
// *second* (real) mount inherits `cancelled = true` from the first (throwaway) mount's cleanup and the
// hook silently never polls again. `timeoutRef` holds the one pending recursive-poll handle so cleanup
// can cancel it outright (not just let a stale response get ignored) -- without this, an already-
// in-flight `setTimeout` still fires `poll()` again after unmount, issuing a real, unnecessary HTTP
// request; `poll()` itself also re-checks `cancelledRef` before ever calling `getSimulation`, covering
// the case where cleanup runs after the timeout already fired but before its callback's own fetch call.
export function useSimulationPoll() {
    const fetchImpl = useStudioApi();
    const [progress, setProgress] = useState<SimulationProgressView | undefined>(undefined);
    const [job, setJob] = useState<StudioSimulationJobView>();
    const [error, setError] = useState<string>();
    const [cancellationRequested, setCancellationRequested] = useState(false);
    // The terminal receipt belongs to the public control that created this
    // durable job. A Retry must not be rendered as a second, anonymous Run.
    const [operation, setOperation] = useState<SimulationOperation>("simulation");
    // Progress is deliberately optimistic while a request is being accepted.
    // This receipt is not: it is written only from a durable terminal job so
    // a replaced Retry control cannot be mistaken for a status-only result.
    const [terminalReceipt, setTerminalReceipt] = useState<SimulationTerminalReceipt>();
    const operationRef = useRef<SimulationOperation>("simulation");
    const currentJobId = useRef<string | undefined>(undefined);
    // A terminal view can outlive the in-memory job snapshot while a reload
    // or recovery reconciliation settles. Keep the real request that created
    // it so Retry remains a public operation, never a visible no-op.
    const lastRequestRef = useRef<{rounds: number; seed: string | undefined; workers: number; modeName: string | undefined} | undefined>(undefined);
    const cancelledRef = useRef(false);
    const generationRef = useRef(0);
    const runGuardGenerationRef = useRef<number | undefined>(undefined);
    const cancelGuardGenerationRef = useRef<number | undefined>(undefined);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const runGuard = useDoubleSubmitGuard();
    const cancelGuard = useDoubleSubmitGuard();

    useEffect(() => {
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
            generationRef.current += 1;
            if (timeoutRef.current !== undefined) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = undefined;
            }
        };
    }, []);

    function isCurrent(generation: number): boolean {
        return !cancelledRef.current && generationRef.current === generation;
    }

    function poll(id: string, generation: number): void {
        if (!isCurrent(generation)) {
            return;
        }
        getSimulation(fetchImpl, id)
            .then((polledJob) => {
                if (!isCurrent(generation) || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                lastRequestRef.current = {rounds: polledJob.rounds, seed: polledJob.seed, workers: polledJob.workers, modeName: polledJob.modeName};
                setProgress(describeSimulationProgress(polledJob));
                if (!isSimulationActive(polledJob)) {
                    setCancellationRequested(false);
                    setTerminalReceipt({operation: operationRef.current, jobId: polledJob.id, status: polledJob.status, ...(polledJob.status === "recovery-required" ? {recoveredAfterRestart: true} : {})});
                }
                if (isSimulationActive(polledJob)) {
                    timeoutRef.current = setTimeout(() => poll(id, generation), POLL_INTERVAL_MS);
                }
            })
            .catch((err: unknown) => {
                if (isCurrent(generation) && currentJobId.current === id) {
                    setError(errorMessage(err));
                }
            });
    }

    function run(rounds: number, seed: string | undefined, workers: number, modeName?: string, startedBy: SimulationOperation = "simulation"): void {
        if (!runGuard.begin()) {
            return;
        }
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        runGuardGenerationRef.current = generation;
        lastRequestRef.current = {rounds, seed, workers, modeName};
        operationRef.current = startedBy;
        setOperation(startedBy);
        setTerminalReceipt(undefined);
        setError(undefined);
        setCancellationRequested(false);
        setProgress({status: "queued", roundsCompleted: 0, rounds, workers, percent: 0, durationMs: 0});
        startSimulation(fetchImpl, rounds, seed, workers, modeName)
            .then((result) => {
                if (!isCurrent(generation)) {
                    return;
                }
                const id = result.status === "conflict" ? result.activeJobId : result.job.id;
                currentJobId.current = id;
                if (result.status === "created") {
                    setJob(result.job);
                    setProgress(describeSimulationProgress(result.job));
                }
                poll(id, generation);
            })
            .catch((err: unknown) => {
                if (isCurrent(generation)) {
                    // A rejected start has no durable job to poll. Clear the
                    // optimistic queued state so Configure is immediately
                    // usable for the person's corrected, next submission.
                    // Leaving it queued made the rendered Run button remain
                    // disabled after an actionable server diagnostic.
                    currentJobId.current = undefined;
                    setJob(undefined);
                    setProgress(undefined);
                    setTerminalReceipt(undefined);
                    setError(errorMessage(err));
                }
            })
            .finally(() => {
                if (runGuardGenerationRef.current === generation) {
                    runGuardGenerationRef.current = undefined;
                    runGuard.end();
                }
            });
    }

    /**
     * Reattach a newly mounted dashboard to a server-owned simulation.  The
     * job id comes from the durable project-job discovery surface, not from
     * route or session memory. This includes a restart-reconciled terminal:
     * its original executor is gone, so the first poll must render the
     * durable recovery-required result rather than inventing completion.
     */
    function restore(id: string): void {
        if (currentJobId.current !== undefined) {
            return;
        }
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        currentJobId.current = id;
        operationRef.current = "simulation";
        setOperation("simulation");
        setTerminalReceipt(undefined);
        setError(undefined);
        setCancellationRequested(false);
        poll(id, generation);
    }

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's simulation. Clears `currentJobId` first (so a poll response
    // already in flight from the old project, once it lands, fails the `currentJobId.current !== id`
    // check inside `poll()` and is discarded rather than repopulating what's being cleared here), then
    // cancels the pending recursive-poll timer outright (otherwise one more, now-pointless request for
    // the old job still goes out before that same check stops it) and clears every piece of job state.
    function resetForProjectSwitch(): void {
        generationRef.current += 1;
        runGuardGenerationRef.current = undefined;
        cancelGuardGenerationRef.current = undefined;
        runGuard.end();
        cancelGuard.end();
        currentJobId.current = undefined;
        lastRequestRef.current = undefined;
        if (timeoutRef.current !== undefined) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }
        setProgress(undefined);
        setJob(undefined);
        setError(undefined);
        setCancellationRequested(false);
        setTerminalReceipt(undefined);
        operationRef.current = "simulation";
        setOperation("simulation");
    }

    function cancel(): void {
        const id = currentJobId.current;
        if (id === undefined || !cancelGuard.begin()) {
            return;
        }
        const generation = generationRef.current;
        cancelGuardGenerationRef.current = generation;
        // The server can need a short safe-cleanup interval before its next
        // poll reports `cancelling`. Reflect the accepted user intent now so
        // the rendered Cancel action cannot be submitted twice in that gap.
        setCancellationRequested(true);
        cancelSimulation(fetchImpl, id)
            .then((polledJob) => {
                if (!isCurrent(generation) || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeSimulationProgress(polledJob));
                if (!isSimulationActive(polledJob)) {
                    setCancellationRequested(false);
                    setTerminalReceipt({operation: operationRef.current, jobId: polledJob.id, status: polledJob.status, ...(polledJob.status === "recovery-required" ? {recoveredAfterRestart: true} : {})});
                }
            })
            .catch((err: unknown) => {
                if (isCurrent(generation) && currentJobId.current === id) {
                    setError(errorMessage(err));
                    setCancellationRequested(false);
                }
            })
            .finally(() => {
                if (cancelGuardGenerationRef.current === generation) {
                    cancelGuardGenerationRef.current = undefined;
                    cancelGuard.end();
                }
            });
    }

    function retry(): void {
        const request = lastRequestRef.current;
        if (request !== undefined) {
            run(request.rounds, request.seed, request.workers, request.modeName, "simulation-retry");
        }
    }

    return {progress, job, error, cancellationRequested, operation, terminalReceipt, run, retry, restore, cancel, resetForProjectSwitch, currentJobId: currentJobId.current};
}

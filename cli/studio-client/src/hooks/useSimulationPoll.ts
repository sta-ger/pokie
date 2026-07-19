import {useEffect, useRef, useState} from "react";
import {cancelSimulation, getSimulation, startSimulation} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeSimulationProgress, isSimulationActive, type SimulationProgressView} from "../domain/interpret/Simulation";
import {useDoubleSubmitGuard} from "./useDoubleSubmitGuard";
import type {StudioSimulationJobView} from "../api/types";

const POLL_INTERVAL_MS = 500;

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
    const currentJobId = useRef<string | undefined>(undefined);
    const cancelledRef = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const runGuard = useDoubleSubmitGuard();
    const cancelGuard = useDoubleSubmitGuard();

    useEffect(() => {
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
            if (timeoutRef.current !== undefined) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = undefined;
            }
        };
    }, []);

    function poll(id: string): void {
        if (cancelledRef.current) {
            return;
        }
        getSimulation(fetchImpl, id)
            .then((polledJob) => {
                if (cancelledRef.current || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeSimulationProgress(polledJob));
                if (isSimulationActive(polledJob)) {
                    timeoutRef.current = setTimeout(() => poll(id), POLL_INTERVAL_MS);
                }
            })
            .catch((err: unknown) => {
                if (!cancelledRef.current) {
                    setError(errorMessage(err));
                }
            });
    }

    function run(rounds: number, seed: string | undefined, workers: number): void {
        if (!runGuard.begin()) {
            return;
        }
        setError(undefined);
        setProgress({status: "queued", roundsCompleted: 0, rounds, workers, percent: 0, durationMs: 0});
        startSimulation(fetchImpl, rounds, seed, workers)
            .then((result) => {
                if (cancelledRef.current) {
                    return;
                }
                const id = result.status === "conflict" ? result.activeJobId : result.job.id;
                currentJobId.current = id;
                if (result.status === "created") {
                    setJob(result.job);
                    setProgress(describeSimulationProgress(result.job));
                }
                poll(id);
            })
            .catch((err: unknown) => {
                if (!cancelledRef.current) {
                    setError(errorMessage(err));
                }
            })
            .finally(() => runGuard.end());
    }

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's simulation, same reasoning/convention as
    // useRuntimeManager's own resetForProjectSwitch(). Clears `currentJobId` first (so a poll response
    // already in flight from the old project, once it lands, fails the `currentJobId.current !== id`
    // check inside `poll()` and is discarded rather than repopulating what's being cleared here), then
    // cancels the pending recursive-poll timer outright (otherwise one more, now-pointless request for
    // the old job still goes out before that same check stops it) and clears every piece of job state.
    function resetForProjectSwitch(): void {
        currentJobId.current = undefined;
        if (timeoutRef.current !== undefined) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }
        setProgress(undefined);
        setJob(undefined);
        setError(undefined);
    }

    function cancel(): void {
        const id = currentJobId.current;
        if (id === undefined || !cancelGuard.begin()) {
            return;
        }
        cancelSimulation(fetchImpl, id)
            .then((polledJob) => {
                if (cancelledRef.current) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeSimulationProgress(polledJob));
            })
            .catch((err: unknown) => {
                if (!cancelledRef.current) {
                    setError(errorMessage(err));
                }
            })
            .finally(() => cancelGuard.end());
    }

    return {progress, job, error, run, cancel, resetForProjectSwitch, currentJobId: currentJobId.current};
}

import {useEffect, useRef, useState} from "react";
import {cancelReplay, getReplay, runReplay} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeReplayProgress, isReplayActive, isReplayTerminal, type ReplayProgressView} from "../domain/interpret/Replay";
import {useDoubleSubmitGuard} from "./useDoubleSubmitGuard";
import type {OutcomeSourceReplayDescriptorView, StudioReplayJobView} from "../api/types";

const POLL_INTERVAL_MS = 500;

// Ports pollReplay (500ms, uncapped) -- same reasoning/shape as useSimulationPoll (see its own doc
// comment for the full StrictMode-safety rationale: reset `cancelledRef` on setup not just cleanup,
// store+clear the pending `setTimeout` handle, and re-check `cancelledRef` at the top of `poll()` itself
// so no new HTTP request is ever issued after unmount), plus the old app's own "refresh the Replay list
// once the job reaches a terminal status" side effect (`onTerminal`), read from a ref kept in sync via
// effect so `poll`'s own hoisted-function-declaration recursion never needs `onTerminal` in a dependency
// array.
export function useReplayPoll(onTerminal?: () => void) {
    const fetchImpl = useStudioApi();
    const [progress, setProgress] = useState<ReplayProgressView | undefined>(undefined);
    const [job, setJob] = useState<StudioReplayJobView>();
    const [error, setError] = useState<string>();
    const currentJobId = useRef<string | undefined>(undefined);
    const cancelledRef = useRef(false);
    const generationRef = useRef(0);
    const runGuardGenerationRef = useRef<number | undefined>(undefined);
    const cancelGuardGenerationRef = useRef<number | undefined>(undefined);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const onTerminalRef = useRef(onTerminal);
    const runGuard = useDoubleSubmitGuard();
    const cancelGuard = useDoubleSubmitGuard();

    useEffect(() => {
        onTerminalRef.current = onTerminal;
    });

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
        getReplay(fetchImpl, id)
            .then((polledJob) => {
                if (!isCurrent(generation) || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeReplayProgress(polledJob));
                if (isReplayActive(polledJob)) {
                    timeoutRef.current = setTimeout(() => poll(id, generation), POLL_INTERVAL_MS);
                } else if (isReplayTerminal(polledJob)) {
                    onTerminalRef.current?.();
                }
            })
            .catch((err: unknown) => {
                if (isCurrent(generation) && currentJobId.current === id) {
                    setError(errorMessage(err));
                }
            });
    }

    function run(round: number, seed: string | undefined, simulationId?: string, modeName?: string, outcomeSource?: OutcomeSourceReplayDescriptorView): void {
        if (!runGuard.begin()) {
            return;
        }
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        runGuardGenerationRef.current = generation;
        setError(undefined);
        setProgress({status: "queued", completedRounds: 0, round, percent: 0, durationMs: 0});
        runReplay(fetchImpl, round, seed, simulationId, modeName, outcomeSource)
            .then((result) => {
                if (!isCurrent(generation)) {
                    return;
                }
                const id = result.status === "conflict" ? result.activeJobId : result.job.id;
                currentJobId.current = id;
                if (result.status === "created") {
                    setJob(result.job);
                    setProgress(describeReplayProgress(result.job));
                }
                poll(id, generation);
            })
            .catch((err: unknown) => {
                if (isCurrent(generation)) {
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

    function cancel(): void {
        const id = currentJobId.current;
        if (id === undefined || !cancelGuard.begin()) {
            return;
        }
        const generation = generationRef.current;
        cancelGuardGenerationRef.current = generation;
        cancelReplay(fetchImpl, id)
            .then((polledJob) => {
                if (!isCurrent(generation) || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeReplayProgress(polledJob));
            })
            .catch((err: unknown) => {
                if (isCurrent(generation) && currentJobId.current === id) {
                    setError(errorMessage(err));
                }
            })
            .finally(() => {
                if (cancelGuardGenerationRef.current === generation) {
                    cancelGuardGenerationRef.current = undefined;
                    cancelGuard.end();
                }
            });
    }

    function selectExisting(selectedJob: StudioReplayJobView): void {
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        currentJobId.current = selectedJob.id;
        setJob(selectedJob);
        setProgress(describeReplayProgress(selectedJob));
        if (isReplayActive(selectedJob)) {
            poll(selectedJob.id, generation);
        }
    }

    // Called from ProjectDashboardPage's own projectKey effect -- same reasoning/convention as
    // useSimulationPoll's own resetForProjectSwitch() (see its doc comment): clears `currentJobId`
    // first so an in-flight poll response from the old project is discarded rather than repopulating
    // what's cleared here, cancels the pending recursive-poll timer outright, then clears job state.
    function resetForProjectSwitch(): void {
        generationRef.current += 1;
        runGuardGenerationRef.current = undefined;
        cancelGuardGenerationRef.current = undefined;
        runGuard.end();
        cancelGuard.end();
        currentJobId.current = undefined;
        if (timeoutRef.current !== undefined) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }
        setProgress(undefined);
        setJob(undefined);
        setError(undefined);
    }

    return {progress, job, error, run, cancel, selectExisting, resetForProjectSwitch};
}

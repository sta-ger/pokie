import {useEffect, useRef, useState} from "react";
import {cancelSimulation, getSimulation, startSimulation} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeSimulationProgress, isSimulationActive, type SimulationProgressView} from "../domain/interpret/Simulation";
import type {StudioSimulationJobView} from "../api/types";

const POLL_INTERVAL_MS = 500;

// Ports pollSimulation (500ms, uncapped -- a legitimate simulation is allowed to run as long as it
// actually takes) -- stops once the job is terminal, or once the Simulation tab's owning page unmounts
// (`cancelledRef`), same "unmount replaces the route-check" reasoning as useProjectContext. `poll` is a
// hoisted function declaration (not useCallback) specifically so it can call itself recursively via
// setTimeout without a forward-reference -- these handlers are plain functions, not memoized, since
// nothing here depends on their identity staying stable across renders.
export function useSimulationPoll() {
    const fetchImpl = useStudioApi();
    const [progress, setProgress] = useState<SimulationProgressView | undefined>(undefined);
    const [job, setJob] = useState<StudioSimulationJobView>();
    const [error, setError] = useState<string>();
    const currentJobId = useRef<string>();
    const cancelledRef = useRef(false);
    useEffect(
        () => () => {
            cancelledRef.current = true;
        },
        [],
    );

    function poll(id: string): void {
        getSimulation(fetchImpl, id)
            .then((polledJob) => {
                if (cancelledRef.current || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeSimulationProgress(polledJob));
                if (isSimulationActive(polledJob)) {
                    setTimeout(() => poll(id), POLL_INTERVAL_MS);
                }
            })
            .catch((err: unknown) => {
                if (!cancelledRef.current) {
                    setError(errorMessage(err));
                }
            });
    }

    function run(rounds: number, seed: string | undefined, workers: number): void {
        setError(undefined);
        setProgress({status: "queued", roundsCompleted: 0, rounds, workers, percent: 0, durationMs: 0});
        startSimulation(fetchImpl, rounds, seed, workers)
            .then((result) => {
                const id = result.status === "conflict" ? result.activeJobId : result.job.id;
                currentJobId.current = id;
                if (result.status === "created") {
                    setJob(result.job);
                    setProgress(describeSimulationProgress(result.job));
                }
                poll(id);
            })
            .catch((err: unknown) => setError(errorMessage(err)));
    }

    function cancel(): void {
        const id = currentJobId.current;
        if (id === undefined) {
            return;
        }
        cancelSimulation(fetchImpl, id)
            .then((polledJob) => {
                setJob(polledJob);
                setProgress(describeSimulationProgress(polledJob));
            })
            .catch((err: unknown) => setError(errorMessage(err)));
    }

    return {progress, job, error, run, cancel, currentJobId: currentJobId.current};
}

import {useEffect, useRef, useState} from "react";
import {cancelReplay, getReplay, runReplay} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describeReplayProgress, isReplayActive, isReplayTerminal, type ReplayProgressView} from "../domain/interpret/Replay";
import type {StudioReplayJobView} from "../api/types";

const POLL_INTERVAL_MS = 500;

// Ports pollReplay (500ms, uncapped) -- same reasoning/shape as useSimulationPoll, plus the old app's
// own "refresh the Replay list once the job reaches a terminal status" side effect (`onTerminal`), read
// from a ref kept in sync via effect so `poll`'s own hoisted-function-declaration recursion never needs
// `onTerminal` in a dependency array.
export function useReplayPoll(onTerminal?: () => void) {
    const fetchImpl = useStudioApi();
    const [progress, setProgress] = useState<ReplayProgressView | undefined>(undefined);
    const [job, setJob] = useState<StudioReplayJobView>();
    const [error, setError] = useState<string>();
    const currentJobId = useRef<string>();
    const cancelledRef = useRef(false);
    const onTerminalRef = useRef(onTerminal);

    useEffect(() => {
        onTerminalRef.current = onTerminal;
    });
    useEffect(
        () => () => {
            cancelledRef.current = true;
        },
        [],
    );

    function poll(id: string): void {
        getReplay(fetchImpl, id)
            .then((polledJob) => {
                if (cancelledRef.current || currentJobId.current !== id) {
                    return;
                }
                setJob(polledJob);
                setProgress(describeReplayProgress(polledJob));
                if (isReplayActive(polledJob)) {
                    setTimeout(() => poll(id), POLL_INTERVAL_MS);
                } else if (isReplayTerminal(polledJob)) {
                    onTerminalRef.current?.();
                }
            })
            .catch((err: unknown) => {
                if (!cancelledRef.current) {
                    setError(errorMessage(err));
                }
            });
    }

    function run(round: number, seed: string | undefined): void {
        setError(undefined);
        setProgress({status: "queued", completedRounds: 0, round, percent: 0, durationMs: 0});
        runReplay(fetchImpl, round, seed)
            .then((result) => {
                const id = result.status === "conflict" ? result.activeJobId : result.job.id;
                currentJobId.current = id;
                if (result.status === "created") {
                    setJob(result.job);
                    setProgress(describeReplayProgress(result.job));
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
        cancelReplay(fetchImpl, id)
            .then((polledJob) => {
                setJob(polledJob);
                setProgress(describeReplayProgress(polledJob));
            })
            .catch((err: unknown) => setError(errorMessage(err)));
    }

    function selectExisting(selectedJob: StudioReplayJobView): void {
        currentJobId.current = selectedJob.id;
        setJob(selectedJob);
        setProgress(describeReplayProgress(selectedJob));
        if (isReplayActive(selectedJob)) {
            poll(selectedJob.id);
        }
    }

    return {progress, job, error, run, cancel, selectExisting};
}

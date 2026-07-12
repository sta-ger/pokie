import type {ReplayDescriptor} from "pokie";
import type {StudioReplayStatus} from "./StudioReplayStatus.js";

// The internal, mutable job record StudioReplayExecutionService/StudioReplayRepository hold —
// intentionally never returned directly from an API response (it carries an AbortController) — see
// toStudioReplayJobView for the one place this is turned into the safe, plain-data StudioReplayJobView
// the API actually sends. Mirrors StudioSimulationJobRecord's own shape/reasoning.
export type StudioReplayJobRecord = {
    id: string;
    projectRoot: string;
    status: StudioReplayStatus;
    round: number;
    seed?: string;
    startedAt: number;
    // Set exactly once, the moment status first becomes terminal (completed/failed/cancelled) — see
    // StudioReplayExecutionService's fail()/cancelRecord()/completion path. Undefined while
    // queued/running.
    completedAt?: number;
    completedRounds: number;
    durationMs: number;
    // Known as soon as the game package has loaded (before the round-playing loop starts) — lets the
    // Replay list show which game a still-running job belongs to without waiting for it to finish.
    game?: {id: string; name: string; version: string};
    descriptor?: ReplayDescriptor;
    error?: string;
    abortController: AbortController;
};

import type {ReplayDescriptor} from "pokie";
import type {StudioReplayStatus} from "./StudioReplayStatus.js";

// The typed, plain-data DTO every /api/project/replays* endpoint returns — never a stack trace, never
// a runtime session/game/AbortController object (see StudioReplayJobRecord, which is the internal
// record this is derived from via toStudioReplayJobView). Mirrors StudioSimulationJobView's own shape.
export type StudioReplayJobView = {
    id: string;
    status: StudioReplayStatus;
    round: number;
    seed?: string;
    startedAt: string;
    completedRounds: number;
    durationMs: number;
    game?: {id: string; name: string; version: string};
    // Only present once `status` is "completed" — see StudioReplayExecutionService.run().
    descriptor?: ReplayDescriptor;
    // Only present once `status` is "failed" — a safe message, never a stack trace.
    error?: string;
};

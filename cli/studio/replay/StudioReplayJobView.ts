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
    // Present only for a job started from the Replay tab's "Recent Simulation" source -- see
    // StudioReplayJobRecord.simulationId's own doc comment. Threaded through so "Run again with the
    // same parameters" (ProjectDashboardPage's own onRetry) can preserve the original selection instead
    // of silently downgrading a retried simulation sample into an untagged reproduction.
    simulationId?: string;
    startedAt: string;
    completedRounds: number;
    durationMs: number;
    game?: {id: string; name: string; version: string};
    // The exact runtime configuration that produced this replay, retained after later Blueprint saves.
    configHash?: string;
    // Only present once `status` is "completed" — see StudioReplayExecutionService.run().
    descriptor?: ReplayDescriptor;
    // Only present once `status` is "failed" — a safe message, never a stack trace.
    error?: string;
    // The real outcome-library mode this job replays/replayed -- see StudioReplayJobRecord's own doc
    // comment. Threaded through for the same "Run again with the same parameters" reason simulationId
    // is above. Undefined for an ordinary "tsPackage"/"blueprint" replay.
    modeName?: string;
};

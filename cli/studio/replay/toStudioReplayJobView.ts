import type {StudioReplayJobRecord} from "./StudioReplayJobRecord.js";
import type {StudioReplayJobView} from "./StudioReplayJobView.js";

// The one conversion point from the internal, mutable StudioReplayJobRecord (AbortController and all)
// to the plain-data DTO an API response actually sends — see StudioReplayJobRecord's own doc comment.
export function toStudioReplayJobView(record: StudioReplayJobRecord): StudioReplayJobView {
    return {
        id: record.id,
        status: record.status,
        round: record.round,
        seed: record.seed,
        simulationId: record.simulationId,
        startedAt: new Date(record.startedAt).toISOString(),
        completedRounds: record.completedRounds,
        durationMs: record.durationMs,
        game: record.game,
        configHash: record.configHash,
        descriptor: record.descriptor,
        error: record.error,
        modeName: record.modeName,
    };
}

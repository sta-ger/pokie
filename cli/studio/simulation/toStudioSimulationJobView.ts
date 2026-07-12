import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationJobView} from "./StudioSimulationJobView.js";

// The one conversion point from the internal, mutable StudioSimulationJobRecord (AbortController and
// all) to the plain-data DTO an API response actually sends — see StudioSimulationJobRecord's own
// doc comment.
export function toStudioSimulationJobView(record: StudioSimulationJobRecord): StudioSimulationJobView {
    return {
        id: record.id,
        status: record.status,
        rounds: record.rounds,
        seed: record.seed,
        startedAt: new Date(record.startedAt).toISOString(),
        roundsCompleted: record.roundsCompleted,
        durationMs: record.durationMs,
        report: record.report,
        statistics: record.statistics,
        error: record.error,
    };
}

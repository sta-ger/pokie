import type {PokieProject, PreGeneratedRoundReplayDescriptor, SimulationReport} from "pokie";
import type {StudioSimulationStatisticsView} from "./StudioSimulationJobView.js";
import type {StudioSimulationStatus} from "./StudioSimulationStatus.js";

// The internal, mutable job record StudioSimulationService/StudioSimulationRepository hold —
// intentionally never returned directly from an API response (it carries an AbortController, and
// would happily carry a live session/game reference too if one were stashed on it) — see
// toStudioSimulationJobView for the one place this is turned into the safe, plain-data
// StudioSimulationJobView the API actually sends.
export type StudioSimulationJobRecord = {
    id: string;
    projectRoot: string;
    status: StudioSimulationStatus;
    rounds: number;
    seed?: string;
    workers: number;
    startedAt: number;
    // Set exactly once, the moment status first becomes terminal (completed/failed/cancelled) — see
    // StudioSimulationService's fail()/cancelRecord()/completion path. Undefined while queued/running.
    // Kept as its own field rather than derived from startedAt+durationMs so retention/listing never
    // depends on that arithmetic coincidence holding.
    completedAt?: number;
    roundsCompleted: number;
    durationMs: number;
    report?: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
    error?: string;
    abortController: AbortController;
    // The already-resolved "outcomeLibrary"/"stakeAdapter" project this job samples, when start() was
    // given one -- see StudioSimulationService.start()'s own doc comment. Undefined for an ordinary
    // "tsPackage"/"blueprint" simulation, which run() drives through ParallelSimulationRunner instead.
    outcomeSourceProject?: PokieProject;
    // The real outcome-library mode this job samples/sampled -- undefined at start() time when the
    // caller didn't request one explicitly, then overwritten with the actual resolved value (via
    // resolveOutcomeLibraryModeName) once runOutcomeSourceSampling reads the manifest, so this always
    // ends up holding the concrete mode a completed/failed/cancelled outcome-source job actually ran
    // against. Always undefined for an ordinary "tsPackage"/"blueprint" simulation.
    modeName?: string;
    // The final real seeded draw, retained as portable provenance for Recent Rounds/replay.
    lastReplay?: PreGeneratedRoundReplayDescriptor;
};

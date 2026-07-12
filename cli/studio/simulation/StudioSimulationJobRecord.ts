import type {SimulationReport} from "pokie";
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
    startedAt: number;
    roundsCompleted: number;
    durationMs: number;
    report?: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
    error?: string;
    abortController: AbortController;
};

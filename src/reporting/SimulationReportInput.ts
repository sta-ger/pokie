import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";
import type {SimulationBreakdownComponent} from "../simulation/SimulationBreakdownComponent.js";
import type {SimulationStatistics} from "../simulation/SimulationStatistics.js";

export type SimulationReportInput = {
    manifest: PokieGameManifest;
    requestedRounds: number;
    seed?: string;
    statistics: SimulationStatistics;
    durationMs: number;
    packageRoot?: string;
    // From AggregateSimulationRunner.getBreakdownStatistics(); undefined when the session never
    // exposed the optional categorization contract, in which case the report simply won't have a
    // "breakdown" field (same additive-optional pattern as reproducibility/warnings/recommendations).
    breakdown?: Record<string, SimulationBreakdownComponent>;
};

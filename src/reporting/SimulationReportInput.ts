import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";
import type {SimulationStatistics} from "../simulation/SimulationStatistics.js";

export type SimulationReportInput = {
    manifest: PokieGameManifest;
    requestedRounds: number;
    seed?: string;
    statistics: SimulationStatistics;
    durationMs: number;
    packageRoot?: string;
};

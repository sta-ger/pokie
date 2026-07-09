import {PokieGameManifest, SimulationStatistics} from "pokie";

export type SimulationReportInput = {
    manifest: PokieGameManifest;
    requestedRounds: number;
    seed?: string;
    statistics: SimulationStatistics;
    durationMs: number;
};

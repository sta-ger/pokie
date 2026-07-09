import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportBuilding} from "./SimulationReportBuilding.js";
import type {SimulationReportInput} from "./SimulationReportInput.js";

export class SimulationReportBuilder implements SimulationReportBuilding {
    public build(input: SimulationReportInput): SimulationReport {
        const {manifest, requestedRounds, seed, statistics, durationMs} = input;
        const spinsPerSecond = Math.round(statistics.rounds / (Math.max(durationMs, 1) / 1000));

        return {
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            requestedRounds,
            rounds: statistics.rounds,
            seed: seed ?? null,
            totalBet: statistics.totalBet,
            totalWin: statistics.totalPayout,
            rtp: statistics.rtp,
            hitFrequency: statistics.rounds > 0 ? statistics.hitCount / statistics.rounds : 0,
            maxWin: statistics.maxWin,
            durationMs,
            spinsPerSecond,
        };
    }
}

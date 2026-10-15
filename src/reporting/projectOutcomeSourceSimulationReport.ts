import type {OutcomeSourceSimulationReport} from "../project/simulateOutcomeSourceProject.js";
import {SimulationReportBuilder} from "./SimulationReportBuilder.js";
import type {SimulationReport} from "./SimulationReport.js";

/** Sampled outcome output retains its original provenance/statistics alongside the ordinary saved report. */
export function projectOutcomeSourceSimulationReport(source: OutcomeSourceSimulationReport): SimulationReport & Omit<OutcomeSourceSimulationReport, "seed"> {
    return {
        ...source,
        ...new SimulationReportBuilder().build({
            manifest: source.game ?? source.lastReplay?.game ?? {id: source.libraryId, name: source.libraryId, version: "unavailable"},
            requestedRounds: source.requestedRounds,
            seed: source.seed,
            statistics: source.statistics,
            durationMs: source.durationMs,
            workers: 1,
            betMode: source.modeName,
            configHash: source.libraryHash,
            workerSeedStrategy: source.workerSeedStrategy,
            stopReason: source.statistics.rounds < source.requestedRounds ? "sessionStopped" : "maxRounds",
        }),
    };
}

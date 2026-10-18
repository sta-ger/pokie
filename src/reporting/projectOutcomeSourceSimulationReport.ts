import {validateSimulationStatisticsForReport} from "./validateSimulationReportExtensions.js";
import type {OutcomeSourceSimulationReport} from "../project/simulateOutcomeSourceProject.js";
import {SimulationReportBuilder} from "./SimulationReportBuilder.js";
import type {SimulationReport} from "./SimulationReport.js";

/** Sampled outcome output retains its original provenance/statistics alongside the ordinary saved report. */
export function projectOutcomeSourceSimulationReport(source: OutcomeSourceSimulationReport): SimulationReport & Omit<OutcomeSourceSimulationReport, "seed"> {
    validateSimulationStatisticsForReport(source.statistics);
    const report = {
        ...source,
        ...new SimulationReportBuilder().build({
            manifest: source.game ?? source.lastReplay?.game ?? {id: source.libraryId, name: source.libraryId, version: "unavailable"},
            requestedRounds: source.requestedRounds,
            seed: source.seed,
            statistics: source.statistics,
            durationMs: source.durationMs,
            workers: 1,
            betMode: source.modeName,
            pokieVersion: source.lastReplay?.artifact?.provenance.pokieVersion,
            workerSeedStrategy: source.workerSeedStrategy,
            stopReason: source.statistics.rounds < source.requestedRounds ? "sessionStopped" : "maxRounds",
        }),
    };
    if (report.reproducibility) report.reproducibility.libraryHash = source.libraryHash;
    return report;
}

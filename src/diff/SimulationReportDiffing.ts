import type {SimulationReport} from "../reporting/SimulationReport.js";
import type {SimulationReportDiff} from "./SimulationReportDiff.js";

export interface SimulationReportDiffing {
    diff(left: SimulationReport, right: SimulationReport): SimulationReportDiff;
}

import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportInput} from "./SimulationReportInput.js";

export interface SimulationReportBuilding {
    build(input: SimulationReportInput): SimulationReport;
}

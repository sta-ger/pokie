import {SimulationReport, SimulationReportInput} from "pokie";

export interface SimulationReportBuilding {
    build(input: SimulationReportInput): SimulationReport;
}

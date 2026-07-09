import type {SimulationReport} from "./SimulationReport.js";

export interface SimulationReportRendering {
    render(report: SimulationReport): string;
}

import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationReportSet} from "./SimulationReportSet.js";

export interface SimulationReportRendering {
    render(report: SimulationReport): string;

    // Optional, feature-detected (same pattern as PokieGame.getSessionSerializer/getBetModes): renders
    // a "pokie sim --mode all" bundle (see SimulationReportSet) as a side-by-side mode comparison, plus
    // each mode's own full section (typically by calling render() once per mode.report). A renderer
    // that doesn't implement this simply can't render report sets -- ReportCommand fails clearly rather
    // than falling back to rendering only one mode or guessing.
    renderSet?(reportSet: SimulationReportSet): string;
}

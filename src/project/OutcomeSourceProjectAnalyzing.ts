import type {OutcomeSourceProjectReport} from "./OutcomeSourceProjectReport.js";
import type {PokieProject} from "./PokieProject.js";

// What OutcomeSourceProjectAnalyzer implements -- injectable so a caller (ReportCommand, a future Studio
// route) never depends on the concrete native/Stake reader wiring directly.
export interface OutcomeSourceProjectAnalyzing {
    analyze(project: PokieProject): Promise<OutcomeSourceProjectReport>;
}

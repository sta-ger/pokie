import type {SimulationReport} from "@fromstan/pokie";
import {isSimulationReport as hasSimulationReportShape} from "../../../src/reporting/isSimulationReportSet.js";
import {validateSimulationReportExtensions} from "../../../src/reporting/validateSimulationReportExtensions.js";

// Reads a saved simulation report from disk, so supplied optional structures must be complete before any
// renderer or differ touches them; missing extension fields remain valid legacy support.
export function isSimulationReport(value: unknown): value is SimulationReport {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    validateSimulationReportExtensions(value as Record<string, unknown>);
    return hasSimulationReportShape(value);
}

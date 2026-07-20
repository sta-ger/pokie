import type {SimulationReportSet} from "./SimulationReportSet.js";

// Shape guard shared by "pokie report"/"pokie diff" to tell a "pokie sim --mode all" bundle apart from
// a plain single-mode SimulationReport JSON file -- checks only the one field a SimulationReport can
// never have (a "modes" map of nested reports), the same "structural, not exhaustive" style already
// used by ReportCommand/DiffCommand's own isSimulationReport() checks.
export function isSimulationReportSet(value: unknown): value is SimulationReportSet {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Partial<SimulationReportSet>;
    const game = candidate.game as Partial<SimulationReportSet["game"]> | undefined;

    return (
        typeof game === "object" &&
        game !== null &&
        typeof game.id === "string" &&
        typeof game.name === "string" &&
        typeof game.version === "string" &&
        typeof candidate.requestedRounds === "number" &&
        (candidate.seed === null || typeof candidate.seed === "string") &&
        typeof candidate.modes === "object" &&
        candidate.modes !== null &&
        Object.keys(candidate.modes).length > 0
    );
}

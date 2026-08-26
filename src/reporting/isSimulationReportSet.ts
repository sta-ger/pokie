import type {SimulationReportSet} from "./SimulationReportSet.js";

// Shape guard shared by "pokie report"/"pokie diff" to tell a "pokie sim --mode all" bundle apart from
// a plain single-mode SimulationReport JSON file. It deliberately validates the core render-time fields of
// every nested report: old additive fields stay optional, while malformed hand-edited JSON is rejected before
// a renderer can fail part-way through a document.
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
        Object.keys(candidate.modes).length > 0 &&
        Object.values(candidate.modes).every(isSimulationReportCore)
    );
}

function isSimulationReportCore(value: unknown): boolean {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    const game = candidate.game as Record<string, unknown> | undefined;
    return (
        typeof game === "object" &&
        game !== null &&
        typeof game.id === "string" &&
        typeof game.name === "string" &&
        typeof game.version === "string" &&
        typeof candidate.requestedRounds === "number" &&
        typeof candidate.rounds === "number" &&
        (candidate.seed === null || typeof candidate.seed === "string") &&
        typeof candidate.totalBet === "number" &&
        typeof candidate.totalWin === "number" &&
        typeof candidate.rtp === "number" &&
        typeof candidate.hitFrequency === "number" &&
        typeof candidate.maxWin === "number" &&
        typeof candidate.durationMs === "number" &&
        typeof candidate.spinsPerSecond === "number"
    );
}

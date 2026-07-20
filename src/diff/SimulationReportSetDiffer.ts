import type {SimulationReportSet} from "../reporting/SimulationReportSet.js";
import {SimulationReportDiffer} from "./SimulationReportDiffer.js";
import type {SimulationReportDiffing} from "./SimulationReportDiffing.js";
import type {SimulationReportSetDiff} from "./SimulationReportSetDiff.js";

// Diffs two SimulationReportSets (two "pokie sim --mode all" runs, typically of different game
// versions) mode by mode -- composes an injected SimulationReportDiffing (SimulationReportDiffer by
// default) rather than reimplementing any metric-diffing math itself: for each mode id present on
// BOTH sides, this simply calls differ.diff(left.modes[id], right.modes[id]) exactly as "pokie diff"
// already would for two single-mode reports of that same mode.
export class SimulationReportSetDiffer {
    private readonly differ: SimulationReportDiffing;

    constructor(differ: SimulationReportDiffing = new SimulationReportDiffer()) {
        this.differ = differ;
    }

    public diff(left: SimulationReportSet, right: SimulationReportSet): SimulationReportSetDiff {
        const leftIds = Object.keys(left.modes);
        const rightIds = new Set(Object.keys(right.modes));

        const perMode: Record<string, ReturnType<SimulationReportDiffing["diff"]>> = {};
        leftIds.forEach((modeId) => {
            if (rightIds.has(modeId)) {
                perMode[modeId] = this.differ.diff(left.modes[modeId], right.modes[modeId]);
            }
        });

        return {
            game: {
                left: {...left.game},
                right: {...right.game},
                changed: left.game.id !== right.game.id || left.game.name !== right.game.name || left.game.version !== right.game.version,
            },
            perMode,
            onlyInLeft: leftIds.filter((modeId) => !rightIds.has(modeId)),
            onlyInRight: Object.keys(right.modes).filter((modeId) => !leftIds.includes(modeId)),
        };
    }
}

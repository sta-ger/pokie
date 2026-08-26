import type {SimulationReportDiff} from "./SimulationReportDiff.js";

// Diffing two "pokie sim --mode all" bundles (see SimulationReportSet): one SimulationReportDiff per
// bet mode id present on BOTH sides (see SimulationReportSetDiffer, which reuses
// SimulationReportDiffer for each -- no diff math is duplicated here), plus which mode ids exist on
// only one side. A mode present on only one side is never silently dropped/ignored -- see
// onlyInLeft/onlyInRight -- since that's a real, worth-knowing structural change (a mode was added or
// removed), not something a per-mode diff could express on its own.
export type SimulationReportSetDiff = {
    // True when game metadata, a common mode, or either side's mode list changed.  This saves
    // machine consumers from having to walk every per-mode diff and both added/removed lists.
    changed: boolean;
    game: {
        left: {id: string; name: string; version: string};
        right: {id: string; name: string; version: string};
        changed: boolean;
    };
    perMode: Record<string, SimulationReportDiff>;
    onlyInLeft: string[];
    onlyInRight: string[];
};

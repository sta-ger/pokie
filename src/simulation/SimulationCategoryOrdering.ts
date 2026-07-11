import {BASE_SIMULATION_CATEGORY} from "./SimulationCategoryNames.js";

// Report/diff output lists breakdown categories in a stable order — "base" first (when present), then
// everything else alphabetically — so "pokie sim"/"report"/"diff" read the same way every run instead
// of whatever order rounds happened to be categorized in during simulation (or whatever order two
// reports' category keys happened to union together in a diff).
export class SimulationCategoryOrdering {
    public static sort(categories: readonly string[]): string[] {
        return [...categories].sort((a, b) => {
            if (a === b) {
                return 0;
            }
            if (a === BASE_SIMULATION_CATEGORY) {
                return -1;
            }
            if (b === BASE_SIMULATION_CATEGORY) {
                return 1;
            }
            return a < b ? -1 : 1;
        });
    }
}

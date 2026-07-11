import type {SimulationBreakdownComponent} from "../simulation/SimulationBreakdownComponent.js";

export type SimulationReportBreakdownComponent = SimulationBreakdownComponent;

// Keyed by category (e.g. "base", "freeGames", or whatever a custom
// SimulationRoundCategoryDetermining reports) rather than fixed fields, so new categories
// (a future "bonus" mechanic, say) never require a shape change here.
export type SimulationReportBreakdown = {
    components: Record<string, SimulationReportBreakdownComponent>;
};

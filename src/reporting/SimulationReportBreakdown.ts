import type {SimulationBreakdownComponent} from "../simulation/SimulationBreakdownComponent.js";

export type SimulationReportBreakdownComponent = SimulationBreakdownComponent & {
    // This category's share of the report's overall RTP: totalWin / report.totalBet (the OVERALL
    // totalBet, not this category's own totalBet). Contributions across every category always sum
    // to report.rtp exactly, which `rtp` (this category's own totalWin / totalBet, i.e. its payback
    // ratio in isolation) does not — a "freeGames" category can easily show rtp > 1 (spins that cost
    // nothing but still pay out) while only contributing a small slice of the overall RTP.
    contribution: number;
};

// Keyed by category (e.g. "base", "freeGames", or whatever a custom
// SimulationRoundCategoryDetermining reports) rather than fixed fields, so new categories
// (a future "bonus" mechanic, say) never require a shape change here.
export type SimulationReportBreakdown = {
    components: Record<string, SimulationReportBreakdownComponent>;
};

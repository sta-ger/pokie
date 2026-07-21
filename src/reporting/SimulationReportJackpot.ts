import type {JackpotPoolStatisticsSnapshot} from "../session/JackpotStatisticsSnapshot.js";

export type SimulationReportJackpotPool = JackpotPoolStatisticsSnapshot & {
    // This pool's own share of the report's overall RTP: totalAwarded / report.totalBet (the OVERALL
    // totalBet, not this pool's own totalContributed) — mirrors SimulationReportBreakdownComponent's own
    // "contribution" convention exactly.
    contribution: number;
};

// Keyed by pool/tier id (e.g. "mini", "grand", or whatever a JackpotPoolRepresenting's own getId()
// reports) rather than fixed fields, so a new tier never requires a shape change here — same reasoning as
// SimulationReportBreakdown being keyed by category.
export type SimulationReportJackpot = {
    awardCount: number;
    totalAwarded: number;
    totalContributed: number;
    // Overall jackpot contribution to this report's own RTP: totalAwarded / totalBet.
    contribution: number;
    pools: Record<string, SimulationReportJackpotPool>;
};

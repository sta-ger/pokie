import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {StakeAmountDetermining} from "../session/StakeAmountDetermining.js";
import {BASE_SIMULATION_CATEGORY, FREE_GAMES_SIMULATION_CATEGORY} from "./SimulationCategoryNames.js";
import type {SimulationRoundCategoryDetermining} from "./SimulationRoundCategoryDetermining.js";

// Default SimulationRoundCategoryDetermining: reuses the same optional StakeAmountDetermining
// contract SpinCommandHandler already relies on to tell a charged base-game round from an
// unfinished free-games round that charges nothing (see StakeAmountDetermining and
// determineStakeAmount.ts) — no heuristics, no inferring "this must be free" from balance/payout.
// A session that doesn't implement the contract simply can't be categorized (supportsRoundCategorization
// returns false), same as it's simply assumed to always charge getBet() elsewhere in the codebase.
export class StakeBasedSimulationRoundCategoryDeterminer implements SimulationRoundCategoryDetermining {
    public static readonly BASE = BASE_SIMULATION_CATEGORY;
    public static readonly FREE_GAMES = FREE_GAMES_SIMULATION_CATEGORY;

    public supportsRoundCategorization(session: GameSessionHandling): boolean {
        return typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function";
    }

    public categorizeRound(session: GameSessionHandling): string {
        const stakeAmount = (session as unknown as StakeAmountDetermining).getStakeAmount();
        return stakeAmount === 0
            ? StakeBasedSimulationRoundCategoryDeterminer.FREE_GAMES
            : StakeBasedSimulationRoundCategoryDeterminer.BASE;
    }
}

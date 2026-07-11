import type {GameSessionHandling} from "../session/GameSessionHandling.js";

// Extension point for feature-level RTP breakdowns (see AggregateSimulationRunner): the runner
// doesn't know what "base" vs "free games" vs some future bonus mechanic means for an arbitrary
// game — it asks an injected SimulationRoundCategoryDetermining instead of guessing. A game
// package that needs finer categories than the default StakeBasedSimulationRoundCategoryDeterminer
// provides (e.g. splitting a "bonus buy" mode out from "freeGames") can supply its own.
export interface SimulationRoundCategoryDetermining {
    supportsRoundCategorization(session: GameSessionHandling): boolean;

    categorizeRound(session: GameSessionHandling): string;
}

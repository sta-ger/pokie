import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {SimulationRoundCategoryDetermining} from "./SimulationRoundCategoryDetermining.js";

// Tries each determiner in order and delegates to the first one that supports the CURRENT round —
// lets multiple categorization strategies coexist (e.g. an explicit session-declared category takes
// priority when present, falling back to a stake-based base/freeGames inference otherwise) without
// any of them knowing about each other. Composition, not a fixed if/else chain: a game package can
// build its own priority list, or AggregateSimulationRunner's default order (explicit, then
// stake-based) can be overridden entirely via its 4th constructor argument.
export class FallbackSimulationRoundCategoryDeterminer implements SimulationRoundCategoryDetermining {
    private readonly determiners: readonly SimulationRoundCategoryDetermining[];

    constructor(determiners: readonly SimulationRoundCategoryDetermining[]) {
        this.determiners = determiners;
    }

    public supportsRoundCategorization(session: GameSessionHandling): boolean {
        return this.findSupportingDeterminer(session) !== undefined;
    }

    public categorizeRound(session: GameSessionHandling): string {
        const determiner = this.findSupportingDeterminer(session);
        if (!determiner) {
            throw new Error(
                "FallbackSimulationRoundCategoryDeterminer.categorizeRound() called for a round none of its " +
                    "determiners support — check supportsRoundCategorization() first.",
            );
        }
        return determiner.categorizeRound(session);
    }

    private findSupportingDeterminer(session: GameSessionHandling): SimulationRoundCategoryDetermining | undefined {
        return this.determiners.find((determiner) => determiner.supportsRoundCategorization(session));
    }
}

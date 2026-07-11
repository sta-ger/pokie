import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {SimulationCategoryDetermining} from "../session/SimulationCategoryDetermining.js";
import {SimulationCategoryNameNormalizer} from "./SimulationCategoryNameNormalizer.js";
import type {SimulationRoundCategoryDetermining} from "./SimulationRoundCategoryDetermining.js";

// Feature-detected: a session MAY implement SimulationCategoryDetermining to explicitly declare the
// simulation-breakdown category for the round about to be played. This determiner just asks the
// session and normalizes/validates the answer (see SimulationCategoryNameNormalizer) — it never
// invents a category on its own. A session that doesn't implement the contract, or returns an
// invalid/empty category for a particular round, simply isn't supported HERE for that round; pair
// this with FallbackSimulationRoundCategoryDeterminer to fall through to another strategy (e.g.
// StakeBasedSimulationRoundCategoryDeterminer) in that case instead of losing the round entirely.
export class ExplicitSimulationRoundCategoryDeterminer implements SimulationRoundCategoryDetermining {
    public supportsRoundCategorization(session: GameSessionHandling): boolean {
        return this.readNormalizedCategory(session) !== undefined;
    }

    public categorizeRound(session: GameSessionHandling): string {
        const category = this.readNormalizedCategory(session);
        if (category === undefined) {
            throw new Error(
                "ExplicitSimulationRoundCategoryDeterminer.categorizeRound() called for a round it doesn't " +
                    "support — check supportsRoundCategorization() first.",
            );
        }
        return category;
    }

    private readNormalizedCategory(session: GameSessionHandling): string | undefined {
        const candidate = session as Partial<SimulationCategoryDetermining>;
        if (typeof candidate.getSimulationCategory !== "function") {
            return undefined;
        }
        return SimulationCategoryNameNormalizer.normalize(candidate.getSimulationCategory());
    }
}

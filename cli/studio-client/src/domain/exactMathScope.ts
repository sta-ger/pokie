import type {FreeGamesExactRtp} from "../../../../src/weightedoutcome/computeFreeGamesExactRtp.js";

export type ExactMathScope = "whole-round" | "base-spins" | "uninspected";

/**
 * What an exact outcome table proves about the whole round.
 *
 * - A complete free-games total RTP derivation covers base spins and every feature payout it can
 *   settle, so it is the whole-round reference.
 * - `featurePayoutsIncluded === true` means the outcome table itself already carries every feature
 *   payout, so the enumerated RTP is also whole-round.
 * - `featurePayoutsIncluded === false` means later-settling feature wins are explicitly outside the
 *   table. The exact RTP then covers base spins only.
 * - `undefined` means the table was too large to inspect feature triggers. The UI must not claim either
 *   scope in that case.
 */
export function describeExactMathScope(
    freeGamesRtp: FreeGamesExactRtp | undefined,
    featurePayoutsIncluded: boolean | undefined,
): ExactMathScope {
    if (freeGamesRtp?.status === "infinite") return "base-spins";
    if (freeGamesRtp?.status === "available") return "whole-round";
    if (featurePayoutsIncluded === true) return "whole-round";
    if (featurePayoutsIncluded === false) return "base-spins";
    return "uninspected";
}

/**
 * Only an available free-games derivation with no authored hard cap is genuinely uncapped. A design
 * with no free games has no free-games derivation at all, and an infinite/unsupported derivation is not
 * an available "uncapped" total. This distinction keeps the producer card from claiming an unbounded
 * round for a featureless game.
 */
export function freeGamesAreUncapped(freeGamesRtp: FreeGamesExactRtp | undefined): boolean {
    return freeGamesRtp?.status === "available" && freeGamesRtp.maxFreeGames === undefined;
}

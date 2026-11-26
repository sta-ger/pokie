import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";

// Exact total-RTP view for the authored additive-retrigger free-games mechanic. The paid-spin outcome
// library already gives the exact trigger probability and award distribution. A free spin is just another
// paid-spin reel draw at zero stake, so its expected base win is the paid-spin RTP; retriggers add a geometric
// series. This is exact for the authored freeGames shape in GameBlueprint (one scatter symbol, integer awards,
// additive retrigger, no other feature mechanics). It is deliberately returned as a separate, explicit
// estimate rather than folded into the library's own paid-spin analysis: the library records triggers, not
// future free-game records.
export type FreeGamesExactRtp =
    | {
          readonly status: "available";
          readonly baseRtp: number;
          readonly featureRtp: number;
          readonly totalRtp: number;
          readonly triggerProbability: number;
          readonly expectedAward: number;
          readonly expectedFreeSpins: number;
          readonly method: "additive-retrigger" | "additive-retrigger-capped";
          /** Present only when the authored feature has a hard total-free-games cap. */
          readonly maxFreeGames?: number;
      }
    | {
          readonly status: "infinite";
          readonly baseRtp: number;
          readonly triggerProbability: number;
          readonly expectedAward: number;
          readonly reason: string;
      }
    | {readonly status: "unsupported"; readonly reason: string};

/**
 * Expected free spins under a hard total-free-games cap. The state is (awarded, played); the cap
 * prevents any award beyond `maxFreeGames`, so every path is finite. The two-row DP keeps memory
 * linear in the cap while still evaluating the exact reward distribution.
 */
function expectedFreeSpinsWithCap(
    triggerProbability: number,
    awards: readonly {award: number; probability: number}[],
    maxFreeGames: number,
): number {
    let next = new Float64Array(maxFreeGames + 1);
    for (let played = maxFreeGames - 1; played >= 0; played--) {
        const current = new Float64Array(maxFreeGames + 1);
        for (let awarded = played + 1; awarded <= maxFreeGames; awarded++) {
            let value = 1 + (1 - triggerProbability) * next[awarded]!;
            for (const entry of awards) {
                const nextAwarded = Math.min(awarded + entry.award, maxFreeGames);
                if (nextAwarded > played + 1) {
                    value += triggerProbability * entry.probability * next[nextAwarded]!;
                }
            }
            current[awarded] = value;
        }
        next = current;
    }
    let expected = 0;
    for (const entry of awards) expected += entry.probability * next[Math.min(entry.award, maxFreeGames)]!;
    return expected;
}

/**
 * Derives the exact expected free-games RTP from an exact paid-spin library. The caller owns the decision
 * to display this next to the library's own paid-spin analysis; this function never changes the library.
 *
 * Assumptions (all true for the authored `mechanics.freeGames` shape):
 * - the only feature event in the library is `freeGamesTriggered`;
 * - every trigger awards the `count` recorded on that event;
 * - free spins use the same reels/paytable/bet as the triggering paid spin;
 * - retriggers are additive (the only supported policy).
 */
export function computeFreeGamesExactRtp<T extends string | number = string>(
    library: WeightedOutcomeLibrary<T>,
    baseRtp: number,
    maxFreeGames?: number,
): FreeGamesExactRtp {
    if (!Number.isFinite(baseRtp) || baseRtp < 0) {
        return {status: "unsupported", reason: "The paid-spin RTP is not a finite non-negative number."};
    }
    if (maxFreeGames !== undefined && (!Number.isSafeInteger(maxFreeGames) || maxFreeGames < 1)) {
        return {status: "unsupported", reason: "The free-games cap is not a positive safe integer."};
    }
    let totalWeight = 0;
    let triggerWeight = 0;
    let awardedWeight = 0;
    const awardWeights = new Map<number, number>();
    const eventTypes = new Set<string>();
    for (const outcome of library.outcomes) {
        totalWeight += outcome.weight;
        let award = 0;
        let triggered = false;
        for (const event of outcome.record.featureEvents ?? []) {
            eventTypes.add(event.type);
            if (event.type !== "freeGamesTriggered") continue;
            const count = event.data !== undefined && typeof event.data === "object" && event.data !== null && "count" in event.data
                ? (event.data as {count?: unknown}).count
                : undefined;
            if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
                return {status: "unsupported", reason: "A freeGamesTriggered event does not carry a finite non-negative integer award count."};
            }
            award += count;
            triggered = true;
        }
        if (triggered) {
            triggerWeight += outcome.weight;
            awardedWeight += outcome.weight * award;
            awardWeights.set(award, (awardWeights.get(award) ?? 0) + outcome.weight);
        }
    }
    if (eventTypes.size === 0) {
        return {status: "unsupported", reason: "The library has no feature events, so there are no free games to add."};
    }
    if ([...eventTypes].some((type) => type !== "freeGamesTriggered")) {
        return {status: "unsupported", reason: "This library mixes free games with other feature events; total feature RTP cannot be derived from the paid-spin records alone."};
    }
    if (totalWeight <= 0 || triggerWeight <= 0) {
        return {status: "unsupported", reason: "The library has no weighted free-games trigger."};
    }
    const triggerProbability = triggerWeight / totalWeight;
    const expectedAward = awardedWeight / triggerWeight;
    if (!Number.isFinite(expectedAward) || expectedAward < 0) {
        return {status: "unsupported", reason: "The recorded free-games awards are not finite non-negative integers."};
    }
    const retriggerFactor = triggerProbability * expectedAward;
    if (maxFreeGames === undefined) {
        if (retriggerFactor >= 1) {
            return {
                status: "infinite",
                baseRtp,
                triggerProbability,
                expectedAward,
                reason: `Free-spin retriggers are supercritical: trigger probability ${(triggerProbability * 100).toFixed(4)}%, average award ${expectedAward.toFixed(4)} free games, expected retrigger factor ${retriggerFactor.toFixed(4)} ≥ 1. The geometric series does not converge, so expected total RTP is unbounded.`,
            };
        }
        const expectedFreeSpins = expectedAward / (1 - retriggerFactor);
        const featureRtp = triggerProbability * expectedFreeSpins * baseRtp;
        return {
            status: "available",
            baseRtp,
            featureRtp,
            totalRtp: baseRtp + featureRtp,
            triggerProbability,
            expectedAward,
            expectedFreeSpins,
            method: "additive-retrigger",
        };
    }
    const awards = [...awardWeights.entries()].map(([award, weight]) => ({award, probability: weight / triggerWeight}));
    const expectedFreeSpins = expectedFreeSpinsWithCap(triggerProbability, awards, maxFreeGames);
    const featureRtp = triggerProbability * expectedFreeSpins * baseRtp;
    return {
        status: "available",
        baseRtp,
        featureRtp,
        totalRtp: baseRtp + featureRtp,
        triggerProbability,
        expectedAward,
        expectedFreeSpins,
        method: "additive-retrigger-capped",
        maxFreeGames,
    };
}

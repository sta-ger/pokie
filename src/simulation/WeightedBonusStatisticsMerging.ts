import type {WeightedBonusStatistics} from "../session/videoslot/authored/WeightedBonus.js";

/** Worker totals are additive; model identity includes effects and table ordering. */
export function mergeWeightedBonusStatistics(
    first?: WeightedBonusStatistics,
    second?: WeightedBonusStatistics,
    subtract = false,
): WeightedBonusStatistics | undefined {
    if (!first && !second) return undefined;
    const model = second ?? first!;
    if (
        first &&
        second &&
        (first.tableId !== second.tableId ||
            first.model !== second.model ||
            JSON.stringify(first.outcomes.map(({id, weight, probability}) => [id, weight, probability])) !==
                JSON.stringify(second.outcomes.map(({id, weight, probability}) => [id, weight, probability])))
    ) throw new Error("Cannot merge incompatible weighted bonus models.");
    const signed = (a = 0, b = 0): number => a + (subtract ? -b : b);
    const selections = signed(first?.selections, second?.selections);
    const completed = signed(first?.completed, second?.completed);
    // A restored tail can complete within this run without selecting in it. Retain the signed
    // boundary count: negative incomplete means a carried-in tail completed during this segment.
    if (![selections, completed].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("Invalid weighted bonus counters.");
    const outcomes = model.outcomes.map((outcome, index) => {
        const count = signed(first?.outcomes[index]?.count, second?.outcomes[index]?.count);
        if (
            !Number.isSafeInteger(count) ||
            count < 0 ||
            count > selections ||
            (outcome.weight === 0 && count !== 0) ||
            !Number.isSafeInteger(outcome.weight) ||
            outcome.weight < 0 ||
            !Number.isFinite(outcome.probability) ||
            outcome.probability < 0 ||
            outcome.probability > 1
        ) throw new Error("Invalid weighted bonus outcome statistics.");
        return {
            ...outcome,
            count,
            frequency: selections ? count / selections : 0,
            uncovered: outcome.weight > 0 && count === 0,
        };
    });
    if (outcomes.reduce((sum, o) => sum + o.count, 0) !== selections) throw new Error("Bonus counts differ from eligible selection denominator.");
    return {...model, selections, completed, incomplete: selections - completed, outcomes};
}

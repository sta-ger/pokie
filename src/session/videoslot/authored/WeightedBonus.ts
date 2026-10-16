import type {ValidationIssue} from "../../../validation/ValidationIssue.js";
import type {RandomNumberGenerating} from "../combinations/RandomNumberGenerating.js";

/** A paid entry's final screen can select once. Continuations never retrigger. */
export type WeightedBonus = {
    id: string;
    context: "triggered-paid-entry";
    trigger: {symbolId: string; minimumCount: number};
    feature: {id: string; type: "bonus-respins"; maxDuration: number};
    outcomes: {
        id: string;
        weight: number;
        targetId: string;
        payout: number;
        payoutUnits: "currency" | "bet-multiple";
        duration: number;
    }[];
};
export type WeightedBonusSelection = {tableId: string; outcomeId: string; context: string; model: string};
export type WeightedBonusState = {
    selection: WeightedBonusSelection | null;
    counts: number[];
    completed: number;
    context: string;
    implicitRound: number;
    requestedContext?: string;
};
export type WeightedBonusObservation = {
    selection: WeightedBonusSelection;
    selectedNow: boolean;
    payout: number;
    remaining: number;
    executed: number;
};
export type WeightedBonusStatistics = {
    tableId: string;
    model: string;
    selections: number;
    completed: number;
    incomplete: number;
    outcomes: {id: string; weight: number; probability: number; count: number; frequency: number; uncovered: boolean}[];
};
export interface WeightedBonusProviding {
    getWeightedBonusStatistics(): WeightedBonusStatistics | undefined;
}

/** IDs are canonical lowercase ASCII, compared exactly; array order defines cumulative intervals.
 * Integer weights (including zero) sum to at most 2^32; no positive mass is rounded away.
 */
export function validateWeightedBonus(
    value: unknown,
    symbols?: readonly unknown[],
    boardSize?: number,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const root = "mechanics.weightedBonus";
    const fail = (path: string, code: string, message: string): void => {
        issues.push({path, code: `weighted-bonus-${code}`, severity: "error", message: `${path}: ${message}`});
    };
    const object = (raw: unknown, path: string, keys: string[]): Record<string, unknown> | undefined => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            fail(path, "object", "expected an object.");
            return undefined;
        }
        for (const key of Object.keys(raw)) if (!keys.includes(key)) fail(`${path}.${key}`, "unknown-field", "unknown field.");
        return raw as Record<string, unknown>;
    };
    const id = (raw: unknown, path: string): void => {
        if (
            typeof raw !== "string" ||
            !(/^[a-z][a-z0-9-]{0,63}$/).test(raw) ||
            ["constructor", "prototype", "tojson"].includes(raw)
        ) fail(
            path,
            "id",
            "use a unique lowercase ASCII ID, starting with a letter (maximum 64 characters); reserved keys are forbidden.",
        );
    };
    const integer = (raw: unknown, max: number): raw is number =>
        typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 && raw <= max;
    const table = object(value, root, ["id", "context", "trigger", "feature", "outcomes"]);
    if (!table) return issues;
    id(table.id, `${root}.id`);
    if (table.context !== "triggered-paid-entry") fail(
        `${root}.context`,
        "context",
        "only triggered-paid-entry is supported; bonus respins do not select or retrigger.",
    );
    const trigger = object(table.trigger, `${root}.trigger`, ["symbolId", "minimumCount"]);
    if (
        trigger &&
        (typeof trigger.symbolId !== "string" ||
            (symbols && !symbols.includes(trigger.symbolId)) ||
            !integer(trigger.minimumCount, boardSize ?? Number.MAX_SAFE_INTEGER) ||
            trigger.minimumCount === 0)
    ) fail(`${root}.trigger`, "trigger", "requires a known symbol and a positive count within the board.");
    const feature = object(table.feature, `${root}.feature`, ["id", "type", "maxDuration"]);
    if (feature) {
        id(feature.id, `${root}.feature.id`);
        if (feature.type !== "bonus-respins") fail(`${root}.feature.type`, "target", "only the declared bonus-respins feature is supported.");
        if (!integer(feature.maxDuration, 90)) fail(`${root}.feature.maxDuration`, "duration", "expected an integer in [0, 90].");
    }
    if (!Array.isArray(table.outcomes) || table.outcomes.length === 0) fail(`${root}.outcomes`, "empty", "requires at least one outcome.");
    else {
        let total = 0;
        const ids = new Set<unknown>(),
            effects = new Set<string>();
        Array.from(table.outcomes).forEach((raw, index) => {
            const path = `${root}.outcomes.${index}`;
            const outcome = object(raw, path, ["id", "weight", "targetId", "payout", "payoutUnits", "duration"]);
            if (!outcome) return;
            id(outcome.id, `${path}.id`);
            if (ids.has(outcome.id)) fail(`${path}.id`, "duplicate-id", "duplicate outcome ID.");
            ids.add(outcome.id);
            if (!integer(outcome.weight, 0x100000000)) fail(`${path}.weight`, "weight", "expected a nonnegative integer no larger than 2^32.");
            else total += outcome.weight;
            if (!feature || outcome.targetId !== feature.id) fail(`${path}.targetId`, "target", "must reference the configured bonus feature ID.");
            if (typeof outcome.payout !== "number" || !Number.isFinite(outcome.payout) || outcome.payout < 0) fail(`${path}.payout`, "payout", "expected finite nonnegative payout.");
            if (outcome.payoutUnits !== "currency" && outcome.payoutUnits !== "bet-multiple") fail(`${path}.payoutUnits`, "units", "expected currency or bet-multiple.");
            if (!integer(outcome.duration, typeof feature?.maxDuration === "number" ? feature.maxDuration : 90)) fail(
                `${path}.duration`,
                "duration",
                "expected a nonnegative integer no larger than feature.maxDuration.",
            );
            const effect = JSON.stringify([outcome.targetId, outcome.payout, outcome.payoutUnits, outcome.duration]);
            if (effects.has(effect)) fail(path, "duplicate-effect", "ambiguous duplicate effect; combine its weight into one outcome.");
            effects.add(effect);
        });
        if (!Number.isSafeInteger(total) || total <= 0 || total > 0x100000000) fail(`${root}.outcomes`, "total", "total weight must be in [1, 2^32].");
    }
    return issues;
}

export function weightedBonusModel(table: WeightedBonus): string {
    return JSON.stringify([
        "weighted-bonus-uint32-v1",
        table.id,
        table.context,
        table.trigger.symbolId,
        table.trigger.minimumCount,
        table.feature.id,
        table.feature.type,
        table.feature.maxDuration,
        table.outcomes.map((o) => [o.id, o.weight, o.targetId, o.payout, o.payoutUnits, o.duration]),
    ]);
}

/** Selection is required exactly at a triggering paid entry, never on continuation. */
export function shouldSelectWeightedBonus(table: WeightedBonus, continuing: boolean, screen: readonly (readonly string[])[]): boolean {
    return !continuing && screen.flat().filter(symbol => symbol === table.trigger.symbolId).length >= table.trigger.minimumCount;
}

/** The selected outcome owns its units at the paid entry denomination. */
export function weightedBonusPayout(outcome: WeightedBonus["outcomes"][number], entryBet: number): number {
    return outcome.payout * (outcome.payoutUnits === "bet-multiple" ? entryBet : 1);
}

/** Rejection sampling consumes the same session RNG as the reels. */
export function selectWeightedBonus(
    table: WeightedBonus,
    rng: RandomNumberGenerating,
): WeightedBonus["outcomes"][number] {
    const issues = validateWeightedBonus(table);
    if (issues.length) throw new Error(issues.map((issue) => issue.message).join("; "));
    const total = table.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const limit = Math.floor(0x100000000 / total) * total;
    let point: number;
    do {
        point = rng.getRandomInt(0, 0x100000000);
        if (!Number.isSafeInteger(point) || point < 0 || point >= 0x100000000) throw new Error("Invalid weighted bonus RNG draw.");
    } while (point >= limit);
    point %= total;
    for (const outcome of table.outcomes) {
        if (point < outcome.weight) return {...outcome};
        point -= outcome.weight;
    }
    throw new Error("Invalid weighted bonus cumulative draw.");
}

export function weightedBonusSelectionsEqual(first: unknown, second: unknown): boolean {
    const firstMissing = first === null || first === undefined;
    const secondMissing = second === null || second === undefined;
    if (firstMissing || secondMissing) return firstMissing && secondMissing;
    if (typeof first !== "object" || typeof second !== "object") return false;
    return ["tableId", "outcomeId", "context", "model"].every(
        (key) => Reflect.get(first, key) === Reflect.get(second, key),
    );
}

/** Bind executable duration to the last accepted public observation, not just the budget sum. */
export function validateWeightedBonusObservation(
    state: {bonus?: {selection?: unknown}; executed?: unknown; remaining?: unknown},
    observation: unknown,
): void {
    const retained = observation as Partial<WeightedBonusObservation> | undefined;
    if (!weightedBonusSelectionsEqual(state.bonus?.selection, retained?.selection)) throw new Error("Retained weighted bonus identity differs from executable selection.");
    if (state.bonus?.selection && (state.executed !== retained?.executed || state.remaining !== retained?.remaining)) throw new Error("Retained weighted bonus duration progress differs from executable progress.");
}

export function describeWeightedBonusCoverage(weight: number, uncovered: boolean): string {
    if (weight === 0) return "zero weight";
    return uncovered ? "unobserved" : "observed";
}

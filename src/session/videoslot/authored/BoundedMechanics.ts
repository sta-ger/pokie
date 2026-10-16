/** Finite data contracts. A collection is denominated in wallet currency, never the next bet. */
export type AuthoredCascade = {maxCascades: number};
export type AuthoredRespins = {
    trigger: {symbolId: string; minimumCount: number};
    grant: number;
    retrigger: "none" | "reset";
    maxRespins: number;
};
export type AuthoredCollection = {
    symbolId: string;
    contribution: number;
    threshold: number;
    cap: number;
    reset: "zero" | "subtract-threshold";
    payout: number;
};
export type BoundedMechanics = {weightedBonus?: import("./WeightedBonus.js").WeightedBonus; cascade?: AuthoredCascade; respins?: AuthoredRespins; collection?: AuthoredCollection};
export type BoundedMechanicObservation = {
    weightedBonus?: import("./WeightedBonus.js").WeightedBonusObservation;
    collection?: {value: number; cap: number; threshold: number; contribution: number; triggered: boolean; reset: AuthoredCollection["reset"]; payout: number};
    respins?: {remaining: number; executed: number; granted: number; limit: number};
    cascade?: {winningCascades: number; evaluatedSteps: number};
};
export interface BoundedMechanicsProviding {
    getBoundedMechanicObservation(): BoundedMechanicObservation | undefined;
}

/** One accepted mathematical play, shared by execution and checkpoint validation. */
export function resolveRespinTransition(rule: AuthoredRespins, remaining: number, executed: number, triggerCount: number): NonNullable<BoundedMechanicObservation["respins"]> {
    if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > Math.min(rule.grant, rule.maxRespins - executed) ||
        !Number.isSafeInteger(executed) || executed < 0 || executed > rule.maxRespins) throw new Error("Invalid respins prior transition counters.");
    if (remaining > 0 && (rule.retrigger === "none" ? remaining + executed !== rule.grant :
        remaining < Math.max(0, rule.grant - executed))) throw new Error("Unreachable respins prior transition counters.");
    const continuing = remaining > 0;
    executed = continuing ? executed + 1 : 0;
    remaining = continuing ? remaining - 1 : 0;
    let granted = 0;
    if (triggerCount >= rule.trigger.minimumCount && (!continuing || rule.retrigger === "reset")) {
        const next = Math.min(rule.grant, rule.maxRespins - executed);
        granted = Math.max(0, next - remaining);
        remaining = next;
    }
    return {remaining, executed, granted, limit: rule.maxRespins};
}

/** Collection advances once on the final accepted screen, including losing plays. */
export function resolveCollectionTransition(rule: AuthoredCollection, value: number, count: number): NonNullable<BoundedMechanicObservation["collection"]> {
    if (!Number.isFinite(value) || value < 0 || value > rule.cap ||
        value >= rule.threshold && (rule.reset === "zero" || value > rule.cap - rule.threshold) ||
        !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid collection prior transition.");
    const contribution = count * rule.contribution;
    const accumulated = value + contribution;
    if (!Number.isFinite(accumulated)) throw new Error("Collection accumulation overflow.");
    value = Math.min(rule.cap, accumulated);
    const triggered = value >= rule.threshold;
    if (triggered) value = rule.reset === "zero" ? 0 : value - rule.threshold;
    return {value, cap: rule.cap, threshold: rule.threshold, contribution, triggered, reset: rule.reset, payout: triggered ? rule.payout : 0};
}

import type {ValidationIssue} from "../validation/ValidationIssue.js";

/** Shared by validation and direct rendering: unknown authored fields never disappear. */
export function validateAuthoredMechanics(blueprint: Record<string, unknown>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const error = (path: string, message: string, code = "blueprint-mechanics-invalid"): void => {
        issues.push({code, severity: "error", path, message: `${path}: ${message}`});
    };
    const object = (value: unknown, path: string, keys: string[]): Record<string, unknown> | undefined => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            error(path, "must be an object.");
            return undefined;
        }
        const data = value as Record<string, unknown>;
        for (const key of Object.keys(data)) if (!keys.includes(key)) error(`${path}.${key}`, "unknown field.", "blueprint-mechanics-unknown-field");
        return data;
    };
    const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const positive = (value: unknown): boolean => finite(value) && Number.isSafeInteger(value) && value > 0;
    const symbols = Array.isArray(blueprint.symbols) ? blueprint.symbols : [];
    if (blueprint.mechanics === undefined) return issues;
    const mechanics = object(blueprint.mechanics, "mechanics", ["freeGames", "holdAndWin", "jackpot"]);
    if (!mechanics) return issues;
    if (mechanics.freeGames !== undefined) {
        const free = object(mechanics.freeGames, "mechanics.freeGames", ["scatterSymbol", "awardsByCount", "retriggerPolicy"]);
        if (free?.retriggerPolicy !== undefined && free.retriggerPolicy !== "additive") error("mechanics.freeGames.retriggerPolicy", "only additive retriggers are supported.");
    }
    if (mechanics.holdAndWin !== undefined) {
        const path = "mechanics.holdAndWin";
        const hold = object(mechanics.holdAndWin, path, ["minimumCount", "initialRespins", "retriggerPolicy", "symbolEffects", "payout"]);
        if (hold) {
            for (const key of ["minimumCount", "initialRespins"]) if (!positive(hold[key])) error(`${path}.${key}`, "must be a positive safe integer.");
            if (typeof hold.minimumCount === "number" && hold.minimumCount > Number(blueprint.reels) * Number(blueprint.rows)) error(`${path}.minimumCount`, "exceeds the board size.");
            if (hold.retriggerPolicy !== "reset-on-new-lock") error(`${path}.retriggerPolicy`, "must be reset-on-new-lock.");
            const effects = hold.symbolEffects;
            if (!effects || typeof effects !== "object" || Array.isArray(effects) || !Object.keys(effects).length) error(`${path}.symbolEffects`, "must contain at least one symbol effect.");
            else for (const [symbol, raw] of Object.entries(effects)) {
                const effectPath = `${path}.symbolEffects.${symbol}`;
                if (["__proto__", "constructor", "prototype", "toJSON"].includes(symbol)) error(effectPath, "reserved symbol-effect key cannot be published or extracted; rename the symbol and its references.", "blueprint-mechanics-symbol-key-unsupported");
                if (!symbols.includes(symbol)) error(effectPath, "unknown symbol.");
                const effect = object(raw, effectPath, ["kind", "amount", "factor"]);
                if (effect && ((effect.kind !== "value" && effect.kind !== "multiplier") || (effect.kind === "value" && (!finite(effect.amount) || effect.factor !== undefined)) || (effect.kind === "multiplier" && (!finite(effect.factor) || effect.amount !== undefined)))) error(effectPath, "requires value/amount or multiplier/factor with a finite nonnegative value.");
            }
            const payout = object(hold.payout, `${path}.payout`, ["type", "amountsAreBetMultiples"]);
            if (payout && (payout.type !== "sum-with-multiplier" || typeof payout.amountsAreBetMultiples !== "boolean")) error(`${path}.payout`, "requires sum-with-multiplier and boolean amountsAreBetMultiples.");
        }
    }
    if (mechanics.jackpot !== undefined) {
        const path = "mechanics.jackpot";
        const jackpot = object(mechanics.jackpot, path, ["pool", "contribution", "trigger", "award"]);
        if (jackpot) {
            const pool = object(jackpot.pool, `${path}.pool`, ["id", "type", "amount", "seedValue"]);
            if (pool && (typeof pool.id !== "string" || !pool.id.trim() || ((pool.type !== "fixed" && pool.type !== "accumulating") || (pool.type === "fixed" && (!finite(pool.amount) || pool.seedValue !== undefined)) || (pool.type === "accumulating" && (!finite(pool.seedValue) || pool.amount !== undefined))))) error(`${path}.pool`, "requires a nonempty id and fixed/amount or accumulating/seedValue.");
            const contribution = object(jackpot.contribution, `${path}.contribution`, ["type", "percentage"]);
            if (contribution && (contribution.type !== "percentage" || !finite(contribution.percentage) || contribution.percentage > 1)) error(`${path}.contribution`, "requires percentage in [0, 1].");
            const trigger = object(jackpot.trigger, `${path}.trigger`, ["type", "symbolId", "minimumCount"]);
            if (trigger && (trigger.type !== "symbol-count" || !symbols.includes(trigger.symbolId) || !positive(trigger.minimumCount) || Number(trigger.minimumCount) > Number(blueprint.reels) * Number(blueprint.rows))) error(`${path}.trigger`, "requires a known symbol and a positive minimumCount within the board.");
            if (jackpot.award !== "single-tier") error(`${path}.award`, "must be single-tier.");
        }
    }
    if (mechanics.freeGames !== undefined && mechanics.holdAndWin !== undefined) error("mechanics.holdAndWin", "cannot combine with freeGames: both own zero-stake progression and suppress/bank the wrapped result.");
    if ((mechanics.holdAndWin !== undefined || mechanics.jackpot !== undefined) && blueprint.screenGeometry !== undefined) error("screenGeometry", "HoldAndWin and Jackpot require the standard screen geometry.");
    return issues;
}

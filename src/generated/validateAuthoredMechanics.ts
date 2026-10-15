import {validateScreenModifiers} from "../session/videoslot/modifiers/validateScreenModifiers.js";
import type {ScreenGeometry} from "../session/videoslot/coordinates/ScreenGeometry.js";
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
    const mechanics = object(blueprint.mechanics, "mechanics", ["freeGames", "holdAndWin", "jackpot", "modifiers", "cascade", "respins", "collection"]);
    if (!mechanics) return issues;
    const bounded = ["cascade", "respins", "collection"].filter(key => mechanics[key] !== undefined);
    if (bounded.length) {
        for (const key of ["freeGames", "holdAndWin", "jackpot", "modifiers"]) if (mechanics[key] !== undefined) error(`mechanics.${key}`, "cannot combine with bounded cascade/respins/collection.");
        if (blueprint.betModes !== undefined) error("betModes", "bounded mechanics require the base stake mode.");
        if (blueprint.screenGeometry !== undefined) error("screenGeometry", "bounded mechanics require standard geometry.");
    }
    if (mechanics.cascade !== undefined) {
        const rule = object(mechanics.cascade, "mechanics.cascade", ["maxCascades"]);
        if (rule && (!positive(rule.maxCascades) || Number(rule.maxCascades) > 100)) error("mechanics.cascade.maxCascades", "must be an integer in [1, 100]; a further winning evaluation rejects and rolls back.");
    }
    if (mechanics.respins !== undefined) {
        const path = "mechanics.respins";
        const rule = object(mechanics.respins, path, ["trigger", "grant", "retrigger", "maxRespins"]);
        if (rule) {
            const trigger = object(rule.trigger, `${path}.trigger`, ["symbolId", "minimumCount"]);
            if (trigger && (!symbols.includes(trigger.symbolId) || !positive(trigger.minimumCount) || Number(trigger.minimumCount) > Number(blueprint.reels) * Number(blueprint.rows))) error(`${path}.trigger`, "requires a known symbol and positive count within the board.");
            if (!positive(rule.maxRespins) || Number(rule.maxRespins) > 90) error(`${path}.maxRespins`, "must be an integer in [1, 90].");
            if (!positive(rule.grant) || Number(rule.grant) > Number(rule.maxRespins)) error(`${path}.grant`, "must be a positive integer no larger than maxRespins.");
            if ((rule.retrigger !== "none" && rule.retrigger !== "reset")) error(`${path}.retrigger`, "must be none or reset; grants are clipped to the remaining lifetime budget.");
        }
    }
    if (mechanics.collection !== undefined) {
        const path = "mechanics.collection";
        const rule = object(mechanics.collection, path, ["symbolId", "contribution", "threshold", "cap", "reset", "payout"]);
        if (rule) {
            if (!symbols.includes(rule.symbolId)) error(`${path}.symbolId`, "unknown symbol.");
            for (const key of ["contribution", "payout"]) if (!finite(rule[key])) error(`${path}.${key}`, "must be finite and nonnegative currency units.");
            if (!finite(rule.threshold) || rule.threshold <= 0) error(`${path}.threshold`, "must be finite and positive.");
            if (!finite(rule.cap) || Number(rule.cap) < Number(rule.threshold)) error(`${path}.cap`, "must be finite and at least threshold.");
            if ((rule.reset !== "zero" && rule.reset !== "subtract-threshold")) error(`${path}.reset`, "must be zero or subtract-threshold.");
        }
    }
    if (mechanics.modifiers !== undefined) {
        issues.push(...validateScreenModifiers(mechanics.modifiers, {symbols: symbols as string[], wilds: Array.isArray(blueprint.wilds) ? blueprint.wilds : [], reels: Number(blueprint.reels), rows: Number(blueprint.rows), screenGeometry: blueprint.screenGeometry as ScreenGeometry | undefined}));
        if (mechanics.holdAndWin !== undefined) error("mechanics.modifiers", "cannot combine with HoldAndWin, which owns retained cells and suppresses the base payout.");
    }
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

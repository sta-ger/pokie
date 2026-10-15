import {validateWeightedBonus, weightedBonusModel, type WeightedBonusState} from "../session/videoslot/authored/WeightedBonus.js";
import {restoreWinEvaluation, type WinEvaluationSnapshot} from "../session/videoslot/winevaluation/WinEvaluationSnapshot.js";
import {getSessionCompositionError, type SessionStateSchema} from "../session/SessionStateRestoring.js";

/** Validate financial feature state before any nested object is mutated. */
export function validateMechanicState(state: Record<string, unknown>, schema: SessionStateSchema): void {
    const baseKinds: string[] = [];
    let baseSchema = "base" in schema ? schema.base : undefined;
    while (baseSchema && "base" in baseSchema) {
        baseKinds.push(baseSchema.kind);
        if (baseSchema.kind === "bet-modes" && baseSchema.stakeModifying) baseKinds.push("stake-modifying-bet-modes");
        baseSchema = baseSchema.base;
    }
    const compositionError = getSessionCompositionError(schema.kind, baseKinds);
    if (compositionError) throw new Error(compositionError);
    const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (schema.kind === "bounded-mechanics") {
        const {collection, respins, weightedBonus} = schema.rules;
        if (weightedBonus) {
            const root = schema.base;
            if (root.kind !== "seeded-video-slot" || root.modifiers || root.screenGeometry || Object.keys(schema.rules).some(key => key !== "weightedBonus") || validateWeightedBonus(weightedBonus, root.symbols, (root.reels ?? 0) * (root.rows ?? 0)).length) throw new Error("Invalid weighted bonus schema or composition.");
            const bonus = state.bonus as WeightedBonusState;
            if (!bonus || Object.keys(bonus).some(key => !["selection", "counts", "completed", "context", "implicitRound", "requestedContext"].includes(key)) || !Array.isArray(bonus.counts) || bonus.counts.length !== weightedBonus.outcomes.length || !bonus.counts.every((count, i) => Number.isSafeInteger(count) && count >= 0 && (weightedBonus.outcomes[i].weight > 0 || count === 0)) || !Number.isSafeInteger(bonus.completed) || bonus.completed < 0) throw new Error("Invalid weighted bonus counters.");
            if (!Number.isSafeInteger(bonus.implicitRound) || bonus.implicitRound < 0 || typeof bonus.context !== "string" || !(/^(initialization|implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(bonus.context) || bonus.context.includes("\0") || (bonus.requestedContext !== undefined && (typeof bonus.requestedContext !== "string" || !(/^(implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(bonus.requestedContext) || bonus.requestedContext.includes("\0")))) throw new Error("Invalid bonus selection context.");
            if (state.remaining === 0 && bonus.requestedContext?.startsWith("implicit:") && Number(bonus.requestedContext.slice(9)) <= bonus.implicitRound) throw new Error("Weighted bonus implicit context must advance the consumed counter.");
            if (bonus.requestedContext !== (state.base as {selectionContext?: string}).selectionContext) throw new Error("Weighted bonus pending context differs from its base request.");
            const total = bonus.counts.reduce((sum, count) => sum + count, 0);
            if (!Number.isSafeInteger(total) || bonus.completed !== total - (Number(state.remaining) > 0 ? 1 : 0)) throw new Error("Invalid weighted bonus completion count.");
            if (bonus.selection !== null) {
                const selection = bonus.selection;
                const outcome = weightedBonus.outcomes.find(item => item.id === selection?.outcomeId && item.weight > 0);
                const base = state.base as {selectionContext?: string; sequenceState?: {context: string}; implicitRound?: number};
                const contextValid = typeof selection?.context === "string" && (/^(implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(selection.context) && !selection.context.includes("\0");
                if (!outcome || !contextValid || Object.keys(selection).some(key => !["tableId", "outcomeId", "context", "model"].includes(key)) || selection.context !== bonus.context || selection.tableId !== weightedBonus.id || selection.model !== weightedBonusModel(weightedBonus) || (base.sequenceState && base.sequenceState.context !== selection.context) || (selection.context.startsWith("implicit:") && Number(selection.context.slice(9)) !== bonus.implicitRound) || bonus.counts[weightedBonus.outcomes.indexOf(outcome)] === 0 || Number(state.executed) + Number(state.remaining) !== outcome.duration) throw new Error("Invalid weighted bonus identity, context, configuration or duration.");
            } else if (state.remaining !== 0 || state.executed !== 0) throw new Error("Bonus progress requires a selected identity.");
        } else if (state.bonus !== undefined) throw new Error("Unexpected weighted bonus state.");
        const remaining = Number(state.remaining), 
            executed = Number(state.executed);
        // A paid entry either grants the full initial budget or does not trigger. Without
        // retriggers that budget is conserved; resets can only extend it, up to the lifetime cap.
        const unownedProgressInvalid = weightedBonus ? Number(state.remaining) + Number(state.executed) > weightedBonus.feature.maxDuration : state.remaining !== 0 || state.executed !== 0;
        const reachable = !respins || (executed === 0 && remaining === 0) ||
            (respins.retrigger === "none" ? executed + remaining === respins.grant :
                remaining >= Math.max(0, respins.grant - executed));
        if (!reachable || Object.keys(state).some(key => !["base", "value", "remaining", "executed", "entryBet", "bonus"].includes(key)) || !finite(state.value) || (collection ? state.value > collection.cap || (state.value >= collection.threshold && (collection.reset === "zero" || state.value > collection.cap - collection.threshold)) : state.value !== 0) ||
            !Number.isSafeInteger(state.remaining) || Number(state.remaining) < 0 ||
            !Number.isSafeInteger(state.executed) || Number(state.executed) < 0 ||
            (respins ? Number(state.remaining) > respins.grant || Number(state.executed) + Number(state.remaining) > respins.maxRespins : unownedProgressInvalid) ||
            !finite(state.entryBet) || (state.entryBet !== 0 && !schema.bets.includes(state.entryBet)) || ((Number(state.remaining) > 0 || Number(state.executed) > 0) && state.entryBet === 0)) throw new Error("Invalid bounded collection/respin state or entry denomination.");
    }
    if (schema.kind === "hold-and-win" || schema.kind === "jackpot") {
        const outcome = state.lastOutcome as {kind?: string; payout?: number; amount?: number; baseWinAmount?: number; baseEvaluation?: WinEvaluationSnapshot; poolId?: string; linesWinning?: number; scattersWinning?: number} | undefined;
        if (!outcome || typeof outcome !== "object" || !(schema.kind === "hold-and-win" ? ["ordinary", "suppressed", "completed"] : ["ordinary", "awarded"]).includes(outcome.kind ?? "")) throw new Error("Required settled feature outcome is missing or invalid.");
        if ((outcome.kind === "ordinary" || outcome.kind === "suppressed") && Object.keys(outcome).some(key => key !== "kind")) throw new Error("Unsettled feature outcome cannot retain settled payout data.");
        if (outcome.kind === "completed" || outcome.kind === "awarded") {
            if (!finite(outcome.baseWinAmount) || !finite(outcome.kind === "completed" ? outcome.payout : outcome.amount) || !outcome.baseEvaluation) throw new Error("Invalid settled feature amounts.");
            const evaluation = restoreWinEvaluation(outcome.baseEvaluation);
            if (evaluation.getTotalWin() !== outcome.baseWinAmount) throw new Error("Settled base evaluation disagrees with its amount.");
            if (outcome.kind === "completed" && (state.active || outcome.payout !== state.payout || !finite(outcome.linesWinning) || !finite(outcome.scattersWinning))) throw new Error("Invalid completed HoldAndWin outcome.");
            if (outcome.kind === "awarded" && schema.kind === "jackpot" && !schema.pools.some(pool => pool.id === outcome.poolId)) throw new Error("Unknown awarded pool.");
        }
    }
    if (schema.kind === "hold-and-win") {
        const locks = state.lockedSymbols as {position: number[]; symbolId: string; effect: unknown}[];
        if (typeof state.active !== "boolean" || !Array.isArray(locks) || !finite(state.payout) ||
            !Number.isSafeInteger(state.respinsRemaining) || Number(state.respinsRemaining) < 0 || Number(state.respinsRemaining) > schema.initialRespins ||
            (state.active ? Number(state.respinsRemaining) === 0 || state.payout !== 0 || locks.length === 0 || locks.length >= schema.reels * schema.rows : state.respinsRemaining !== 0) ||
            !finite(state.entryBet) || (state.active && state.entryBet === 0)) throw new Error("Invalid HoldAndWin progress, payout or entry denomination.");
        const kind = (state.lastOutcome as {kind: string}).kind;
        if ((kind === "suppressed" && !state.active) || (kind === "ordinary" && state.active && state.respinsRemaining !== schema.initialRespins) || (kind === "ordinary" && !state.active && (locks.length !== 0 || state.payout !== 0)) ||
            (kind === "completed" && locks.length === 0) ||
            ((state.active || kind === "completed") && (!finite(state.entryBet) || state.entryBet === 0 || (schema.bets !== undefined && !schema.bets.includes(state.entryBet))))) throw new Error("HoldAndWin outcome disagrees with progress or entry denomination.");
        const seen = new Set<string>();
        for (const lock of locks) {
            if (!lock || !Array.isArray(lock.position) || lock.position.length !== 2 || !lock.position.every(Number.isSafeInteger) ||
                lock.position[0] < 0 || lock.position[0] >= schema.reels || lock.position[1] < 0 || lock.position[1] >= schema.rows ||
                seen.has(lock.position.join(":")) || !Reflect.apply(Object.prototype.hasOwnProperty, schema.symbolEffects, [lock.symbolId]) ||
                !sameEffect(lock.effect, schema.symbolEffects[lock.symbolId])) throw new Error("Invalid HoldAndWin lock coordinates, symbol or effect.");
            seen.add(lock.position.join(":"));
            const effect = lock.effect as {kind?: string; amount?: number; factor?: number};
            if (!effect || ((effect.kind !== "value" && effect.kind !== "multiplier") || (effect.kind === "value" && !finite(effect.amount)) || (effect.kind === "multiplier" && !finite(effect.factor)))) throw new Error("Invalid HoldAndWin effect.");
        }
    }
    if (schema.kind === "jackpot") {
        const statistics = state.poolStatistics as Record<string, {awardCount: number; totalAwarded: number; totalContributed: number}>;
        const pools = state.pools as Record<string, {value: number}> | undefined;
        if (!statistics || typeof statistics !== "object" || Array.isArray(statistics)) throw new Error("Required jackpot statistics are missing.");
        for (const [id, stats] of Object.entries(statistics)) {
            if (!schema.pools.some(pool => pool.id === id) || !stats || !finite(stats.awardCount) || !Number.isSafeInteger(stats.awardCount) || !finite(stats.totalAwarded) || !finite(stats.totalContributed)) throw new Error("Invalid jackpot pool identity or statistics.");
        }
        if (pools !== undefined && (!pools || typeof pools !== "object" || Array.isArray(pools) || Object.keys(pools).some(id => !schema.pools.some(pool => pool.id === id && pool.type === "accumulating")))) throw new Error("Unknown jackpot pool snapshot.");
        for (const pool of schema.pools) if (pool.type === "accumulating" && (!pools?.[pool.id] || !finite(pools[pool.id].value) || pools[pool.id].value < (pool.seedValue ?? 0))) throw new Error("Required accumulating jackpot balance is missing or invalid.");
    }
}

function sameEffect(a: unknown, b: unknown): boolean {
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const first = a as Record<string, unknown>,
        second = b as Record<string, unknown>;
    return Object.keys(first).length === Object.keys(second).length && Object.keys(first).every(key => first[key] === second[key]);
}

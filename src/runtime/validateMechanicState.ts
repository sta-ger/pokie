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

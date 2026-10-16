import {canonicalDefinitionJson} from "../../diff/MathDefinitionDiffer.js";
import type {SessionStateSchema} from "../../session/SessionStateRestoring.js";
import type {WeightedBonusState} from "../../session/videoslot/authored/WeightedBonus.js";

/** An offending relationship, retained alongside the original snapshots by the public analyzer. */
export class DeclaredContinuationError extends Error {
    constructor(public readonly property: string, public readonly expected: unknown, public readonly actual: unknown) {
        super(`${property}: expected ${canonicalDefinitionJson(expected)}, actual ${canonicalDefinitionJson(actual)}.`);
    }
}

/** Relationships between already-validated production snapshots; no transition is executed here.
 * Returned properties lack the screen, evaluator or policy evidence needed for a proof.
 */
export function validateDeclaredContinuation(before: Record<string, unknown>, after: Record<string, unknown>, schema: SessionStateSchema, path = "state"): string[] {
    const unsupported: string[] = [];
    const require = (valid: boolean, property: string, expected: unknown, actual: unknown): void => {
        if (!valid) throw new DeclaredContinuationError(`${path}.${property}`, expected, actual);
    };
    if (schema.kind === "bounded-mechanics") {
        const continuing = Number(before.remaining) > 0;
        const executed = continuing ? Number(before.executed) + 1 : 0;
        require(continuing ? after.entryBet === before.entryBet : Number(after.entryBet) > 0, "entryBet", continuing ? before.entryBet : "Positive accepted entry denomination", after.entryBet);
        require(after.executed === executed, "executed", executed, after.executed);
        const {collection, respins, weightedBonus, cascade} = schema.rules;
        if (collection) {
            // The codec retains neither the final (possibly cascaded) screen nor its count.
            // Bound all possible contributions; zero contribution is fully determined.
            const low = Math.min(collection.cap, Number(before.value));
            const high = collection.contribution === 0 ? low : collection.cap;
            const ranges: number[][] = [];
            if (low < collection.threshold) ranges.push([low, Math.min(high, collection.threshold)]);
            if (high >= collection.threshold) ranges.push(collection.reset === "zero" ? [0, 0] : [Math.max(low, collection.threshold) - collection.threshold, high - collection.threshold]);
            if (low === high) {
                let expected = low;
                if (low >= collection.threshold) expected = collection.reset === "zero" ? 0 : low - collection.threshold;
                require(after.value === expected, "value", {value: expected, contribution: 0, reset: collection.reset}, after.value);
            } else {
                require(ranges.some(([min, max]) => Number(after.value) >= min && Number(after.value) <= max), "value", {reachableRanges: ranges, reset: collection.reset}, after.value);
                unsupported.push(`${path}.value: final screen count is absent; accumulation and reset cannot be fully established.`);
            }
        }
        if (weightedBonus) {
            const prior = before.bonus as WeightedBonusState;
            const next = after.bonus as WeightedBonusState;
            if (continuing) {
                require(canonicalDefinitionJson(prior.selection) === canonicalDefinitionJson(next.selection) && canonicalDefinitionJson(prior.counts) === canonicalDefinitionJson(next.counts), "bonus.selection", {selection: prior.selection, counts: prior.counts}, {selection: next.selection, counts: next.counts});
                require(after.remaining === Number(before.remaining) - 1, "remaining", Number(before.remaining) - 1, after.remaining);
            } else {
                require(next.context !== prior.context, "bonus.context", "A fresh paid-entry context", next.context);
                const index = weightedBonus.outcomes.findIndex(outcome => outcome.id === next.selection?.outcomeId);
                const expected = prior.counts.map((count, i) => count + (i === index ? 1 : 0));
                require(canonicalDefinitionJson(next.counts) === canonicalDefinitionJson(expected), "bonus.counts", expected, next.counts);
                // Snapshot validation already binds the selected outcome to its duration.
                unsupported.push(`${path}.bonus.selection: the paid-entry trigger screen is absent.`);
            }
            const expected = prior.completed + (after.remaining === 0 && (continuing || next.selection !== null) ? 1 : 0);
            require(next.completed === expected, "bonus.completed", expected, next.completed);
        } else if (respins) {
            const consumed = continuing ? Number(before.remaining) - 1 : 0;
            const reset = Math.min(respins.grant, respins.maxRespins - executed);
            const allowed = !continuing || respins.retrigger === "reset" ? [consumed, reset] : [consumed];
            require(allowed.includes(Number(after.remaining)), "remaining", {allowed, executed}, after.remaining);
            if (new Set(allowed).size > 1) unsupported.push(`${path}.remaining: the respin trigger screen is absent.`);
        }
        if (cascade) unsupported.push(`${path}.cascade: cascade stages and exhausted status are absent from the codec.`);
    }
    if (schema.kind === "free-games") {
        if (Number(before.freeGamesSum) > Number(before.freeGamesNum)) {
            const expected = Number(before.freeGamesNum) + 1;
            require(after.freeGamesNum === expected && Number(after.freeGamesSum) >= Number(before.freeGamesSum) && Number(after.freeGamesBank) >= Number(before.freeGamesBank), "freeGames", {cursor: expected, minimumSum: before.freeGamesSum, minimumBank: before.freeGamesBank}, {cursor: after.freeGamesNum, sum: after.freeGamesSum, bank: after.freeGamesBank});
        }
        unsupported.push(`${path}.freeGames: grant and win evaluation are absent from the codec.`);
    }
    if (schema.kind === "hold-and-win") {
        if (before.active === true) {
            require(after.entryBet === before.entryBet, "entryBet", before.entryBet, after.entryBet);
            const prior = before.lockedSymbols as {position: number[]}[];
            const next = after.lockedSymbols as typeof prior;
            require(prior.every(lock => next.some(retained => canonicalDefinitionJson(retained) === canonicalDefinitionJson(lock))), "lockedSymbols", {retainedLocks: prior}, next);
            const remaining = next.length > prior.length ? schema.initialRespins : Number(before.respinsRemaining) - 1;
            const completed = next.length === schema.reels * schema.rows || remaining === 0;
            const expected = {active: !completed, respinsRemaining: completed ? 0 : remaining, outcome: completed ? "completed" : "suppressed"};
            const outcome = after.lastOutcome as {kind: string; baseWinAmount?: number};
            const actual = {active: after.active, respinsRemaining: after.respinsRemaining, outcome: outcome.kind};
            require(canonicalDefinitionJson(actual) === canonicalDefinitionJson(expected), "progress", expected, actual);
            if (completed) require(outcome.baseWinAmount === 0, "lastOutcome.baseWinAmount", 0, outcome.baseWinAmount);
        } else {
            if ((after.lastOutcome as {kind: string}).kind === "completed") require((after.lockedSymbols as unknown[]).length === schema.reels * schema.rows, "lockedSymbols", {fullBoard: schema.reels * schema.rows}, after.lockedSymbols);
            unsupported.push(`${path}.entry: the trigger predicate and entry screen are absent from the schema.`);
        }
        if ((after.lastOutcome as {kind: string}).kind === "completed") unsupported.push(`${path}.payout: the schema does not retain the aggregator's currency versus bet-multiple policy.`);
    }
    if (schema.kind === "bet-modes") unsupported.push(`${path}.betModeId: mode cost and forced-entry configuration are absent from the schema.`);
    if (schema.kind === "jackpot") {
        const outcome = after.lastOutcome as {kind: string; baseWinAmount?: number};
        const nested = declaredAccountingOwnership(before.base as Record<string, unknown>, after.base as Record<string, unknown>, schema.base)?.payout;
        if (outcome.kind === "awarded" && nested) require("exact" in nested ? outcome.baseWinAmount === nested.exact : Number(outcome.baseWinAmount) >= nested.minimum, "lastOutcome.baseWinAmount", nested, outcome.baseWinAmount);
        unsupported.push(`${path}.pools: contribution and award policies are absent from the schema.`);
    }
    if (schema.kind === "seeded-video-slot") unsupported.push(`${path}: drawn screen, evaluator and RNG transition evidence are absent from the codec.`);
    if ("base" in schema && before.base && after.base) unsupported.push(...validateDeclaredContinuation(before.base as Record<string, unknown>, after.base as Record<string, unknown>, schema.base, `${path}.base`));
    return unsupported;
}

type AccountingOwnership = {continuation: boolean; bet?: number; multiplier?: number; complete: boolean; payout?: {exact: number} | {minimum: number}};

/** Only infer accounting relationships actually represented by the production codec.
 * A selected denomination establishes neither an evaluator result nor settlement conservation.
 */
export function declaredAccountingOwnership(before: Record<string, unknown>, after: Record<string, unknown>, schema: SessionStateSchema): AccountingOwnership | undefined {
    if (schema.kind === "custom") return undefined;
    if (schema.kind === "bounded-mechanics") {
        const continuation = Number(before.remaining) > 0;
        const bet = continuation ? before.entryBet : after.entryBet;
        let minimum = 0;
        const table = schema.rules.weightedBonus;
        const selection = (after.bonus as WeightedBonusState | undefined)?.selection;
        if (table && !continuation && selection) {
            const outcome = table.outcomes.find(item => item.id === selection.outcomeId)!;
            minimum = outcome.payout * (outcome.payoutUnits === "bet-multiple" ? Number(bet) : 1);
        }
        const collection = schema.rules.collection;
        // Nonzero contribution can also trigger, but its final-screen count is absent.
        if (collection && (Number(before.value) >= collection.threshold || Number(after.value) < Number(before.value))) minimum += collection.payout;
        return {continuation, ...(typeof bet === "number" && bet > 0 ? {bet} : {}), multiplier: 1, complete: false, payout: {minimum}};
    }
    if (schema.kind === "hold-and-win") {
        const continuation = before.active === true;
        const outcome = after.lastOutcome as {kind: string; payout?: number; baseWinAmount?: number};
        let bet = after.active === true || outcome.kind === "completed" ? after.entryBet : undefined;
        if (continuation) bet = before.entryBet;
        let payout: AccountingOwnership["payout"] = continuation ? {exact: 0} : undefined;
        if (outcome.kind === "completed") payout = {exact: Number(outcome.baseWinAmount) + Number(outcome.payout)};
        return {continuation, ...(typeof bet === "number" ? {bet} : {}), multiplier: 1, complete: typeof bet === "number" && payout !== undefined, ...(payout ? {payout} : {})};
    }
    if (schema.kind === "free-games") {
        const continuation = Number(before.freeGamesSum) > Number(before.freeGamesNum);
        return {continuation, multiplier: 1, complete: false, ...(continuation ? {payout: {exact: after.freeGamesSum === after.freeGamesNum ? Number(after.freeGamesBank) : 0}} : {})};
    }
    if ("base" in schema) {
        const owned = declaredAccountingOwnership(before.base as Record<string, unknown>, after.base as Record<string, unknown>, schema.base);
        if (schema.kind === "jackpot" && owned) {
            const outcome = after.lastOutcome as {kind: string; baseWinAmount?: number; amount?: number};
            // Awarded baseWinAmount already includes the nested owner's settlement. Never add it twice.
            return {...owned, complete: false, ...(outcome.kind === "awarded" ? {payout: {exact: Number(outcome.baseWinAmount) + Number(outcome.amount)}} : {})};
        }
        // The codec retains a mode ID, but does not declare its cost, selected bet or settlement effects.
        return owned && schema.kind === "bet-modes" ? {...owned, multiplier: undefined, complete: false} : owned;
    }
    return {continuation: false, complete: false};
}

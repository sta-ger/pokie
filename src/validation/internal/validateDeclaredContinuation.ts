import {canonicalDefinitionJson} from "../../diff/MathDefinitionDiffer.js";
import type {SessionStateSchema} from "../../session/SessionStateRestoring.js";

/** Relationships between already-validated production snapshots; no transition is executed here. */
export function validateDeclaredContinuation(before: Record<string, unknown>, after: Record<string, unknown>, schema: SessionStateSchema): void {
    if (schema.kind === "bounded-mechanics" && Number(before.remaining) > 0) {
        if (after.entryBet !== before.entryBet) throw new Error(`Continuation denomination: expected ${before.entryBet}, actual ${after.entryBet}.`);
        if (after.executed !== Number(before.executed) + 1) throw new Error(`Continuation executed counter: expected ${Number(before.executed) + 1}, actual ${after.executed}.`);
        if (schema.rules.weightedBonus) {
            const prior = before.bonus as {selection: unknown; counts: number[]; completed: number};
            const next = after.bonus as typeof prior;
            if (canonicalDefinitionJson(prior.selection) !== canonicalDefinitionJson(next.selection) || canonicalDefinitionJson(prior.counts) !== canonicalDefinitionJson(next.counts)) throw new Error("A weighted continuation changed its selected identity/context or selection counts.");
            const expected = prior.completed + (after.remaining === 0 ? 1 : 0);
            if (next.completed !== expected) throw new Error(`Weighted completion conservation: expected ${expected}, actual ${next.completed}.`);
        }
    }
    if (schema.kind === "free-games" && Number(before.freeGamesSum) > Number(before.freeGamesNum)) {
        const expected = Number(before.freeGamesNum) + 1;
        if (after.freeGamesNum !== expected || Number(after.freeGamesSum) < Number(before.freeGamesSum) || Number(after.freeGamesBank) < Number(before.freeGamesBank)) throw new Error(`Free-game continuation must consume one cursor and conserve grants/bank: expected cursor ${expected}, actual ${after.freeGamesNum}.`);
    }
    if (schema.kind === "hold-and-win" && before.active === true) {
        if (after.entryBet !== before.entryBet) throw new Error(`HoldAndWin continuation denomination: expected ${before.entryBet}, actual ${after.entryBet}.`);
        const prior = before.lockedSymbols as {position: number[]}[];
        const next = after.lockedSymbols as typeof prior;
        if (prior.some(lock => !next.some(retained => canonicalDefinitionJson(retained) === canonicalDefinitionJson(lock)))) throw new Error("A HoldAndWin continuation lost or replaced an owned lock.");
    }
    if ("base" in schema && before.base && after.base) validateDeclaredContinuation(before.base as Record<string, unknown>, after.base as Record<string, unknown>, schema.base);
}

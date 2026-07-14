import type {PreGeneratedRoundTransaction} from "./PreGeneratedRoundTransaction.js";

// The runtime-only facts about serving one pre-generated round — everything that exists only because
// a real round was played for a real session, as opposed to the canonical, reusable library content
// (selection provenance, artifact) it was drawn from. Never folded back into the library or the
// artifact themselves (see buildPreGeneratedRoundResult).
export type PreGeneratedRoundRuntimeContext = {
    readonly roundId: string;
    readonly sessionId: string;
    readonly requestId?: string;
    readonly balanceBefore: number;
    readonly balanceAfter: number;
    readonly transactions: readonly PreGeneratedRoundTransaction[];
};

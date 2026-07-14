// The pre-generated counterpart to replay/ReplayDescriptor: what PreGeneratedRoundReplayer reproduces
// for a given (library, seed, round) — deliberately narrower than a full PreGeneratedRoundResult (no
// runtime/wallet/session facts to reproduce, since none of those participate in the deterministic
// selection itself).
export type PreGeneratedRoundReplayDescriptor = {
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly seed: string;
    readonly round: number;
    readonly outcomeId: string;
    readonly weight: number;
    readonly totalWin: number;
    readonly payoutMultiplier: number;
    readonly timestamp: number;
    readonly durationMs: number;
};

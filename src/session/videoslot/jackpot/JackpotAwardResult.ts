// What JackpotAwarding resolved for a round JackpotTriggering already confirmed wins a jackpot: which pool
// paid out, and how much. "symbolId", when supplied, is what VideoSlotWithJackpotSession attributes the
// award to in its own reconstructed win breakdown (see its getWinEvaluationResult() override) — a coherent
// ValueWinComponent for the award. When omitted (e.g. a pure probability-based/"mystery" award with no
// natural associated symbol), the reconstruction instead represents the award as a JackpotWinComponent (see
// its own doc comment) — so getTotalWin() on the resulting WinEvaluationResult always equals getWinAmount()
// either way, with or without a symbolId; the poolId/amount are also always recorded in that result's own
// metadata regardless of which component shape was used.
export type JackpotAwardResult<T extends string | number | symbol = string> = {
    readonly poolId: string;
    readonly amount: number;
    readonly symbolId?: T;
};

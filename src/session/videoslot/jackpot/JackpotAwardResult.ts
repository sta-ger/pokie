// What JackpotAwarding resolved for a round JackpotTriggering already confirmed wins a jackpot: which pool
// paid out, and how much. "symbolId", when supplied, is what VideoSlotWithJackpotSession attributes the
// award to in its own reconstructed win breakdown (see its getWinEvaluationResult() override) — a coherent
// ValueWinComponent for the award; when omitted (e.g. a pure probability-based/"mystery" award with no
// natural associated symbol), the award still applies to credits and getWinAmount() correctly, it just isn't
// represented as its own component in the breakdown (recorded in that result's own metadata instead).
export type JackpotAwardResult<T extends string | number | symbol = string> = {
    readonly poolId: string;
    readonly amount: number;
    readonly symbolId?: T;
};

// One wallet transaction applied while settling a PreGeneratedRoundResult — `amount` is always the
// non-negative magnitude, `type` carries the direction, mirroring how SpinCommandHandler names its own
// debit/credit transaction ids.
export type PreGeneratedRoundTransaction = {
    readonly id: string;
    readonly type: "debit" | "credit";
    readonly amount: number;
};

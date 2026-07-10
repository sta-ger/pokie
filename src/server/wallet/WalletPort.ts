// Money balance, kept separate from SessionRepository's persisted game state (credits are
// explicitly not part of it — see PokieDevServer) so the two can vary independently: a
// FileSessionRepository can survive a restart while balances stay process-local.
//
// getBalance/setBalance are the original contract: a plain read and a full-overwrite, still used
// by PokieDevServer to seed a new session's starting balance. debit/credit/rollback are additive —
// a small transactional API SpinCommandHandler uses instead of a blind setBalance overwrite, so a
// custom WalletPort backed by a real ledger can implement each mutation as its own atomic
// operation (and reject an over-large debit) rather than always being handed "here is the final
// number, write it".
export interface WalletPort {
    getBalance(sessionId: string): Promise<number>;

    setBalance(sessionId: string, balance: number): Promise<void>;

    // Reduces the balance by `amount` and returns the new balance. Must reject (e.g. throwing a
    // WalletInsufficientFundsError) and leave the balance unchanged when `amount` exceeds the
    // current balance — SpinCommandHandler relies on that to fail a spin's wallet settlement
    // instead of silently going negative.
    debit(sessionId: string, amount: number): Promise<number>;

    // Increases the balance by `amount` and returns the new balance.
    credit(sessionId: string, amount: number): Promise<number>;

    // Compensates an earlier debit(sessionId, amount) call, e.g. because a later step in the same
    // command failed. Same postcondition as credit(sessionId, amount) — increases the balance by
    // `amount` and returns the new balance — kept as its own method so an implementation backed by
    // a real ledger can record a rollback distinctly from an ordinary credit (a win payout).
    rollback(sessionId: string, amount: number): Promise<number>;
}

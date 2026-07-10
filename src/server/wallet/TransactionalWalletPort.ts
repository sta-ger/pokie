import type {WalletPort} from "./WalletPort.js";

// The transactional API SpinCommandHandler actually settles a spin through — additive to
// WalletPort, never a replacement for it (see WalletPort's own doc comment). A caller-supplied
// plain WalletPort is transparently wrapped in a TransactionalWalletAdapter to satisfy this
// interface, so implementing it directly is opt-in, not required.
//
// `transactionId` must be stable for what the caller considers "the same" operation — e.g.
// SpinCommandHandler mints one fresh id per debit/credit *attempt* (see its own doc comment for
// why: a retried spin after a reversed attempt must never reuse a stale id), tagged with which
// operation it is ("...:debit" / "...:credit") and which logical command it belongs to, but NOT
// reused verbatim across separate attempts at the same logical command. An implementation should
// treat debit/credit as idempotent per (sessionId, transactionId) only while that id's record is
// still in effect: a repeated call with a transactionId that's already applied and not reversed
// must not mutate the balance again, and should just return the balance that call originally
// produced (this is what lets a wallet safely see the exact same call twice — e.g. a caller's own
// network-level retry of one debit() invocation — without double-charging or double-paying). Once
// reverse() has compensated a transactionId, that id no longer counts as applied: a later call
// reusing it (e.g. a caller that intentionally recycles ids) must apply for real again rather than
// silently no-op'ing as if it were still the original, now-reversed, transaction.
export interface TransactionalWalletPort extends WalletPort {
    // Reduces the balance by `amount` and returns the new balance. Must reject (e.g. throwing a
    // WalletInsufficientFundsError) and leave the balance unchanged when `amount` exceeds the
    // current balance.
    debit(sessionId: string, transactionId: string, amount: number): Promise<number>;

    // Increases the balance by `amount` and returns the new balance.
    credit(sessionId: string, transactionId: string, amount: number): Promise<number>;

    // Explicitly compensates the specific, already-applied debit or credit recorded under
    // `transactionId` — reversing a debit credits the same amount back, reversing a credit debits
    // it back — rather than requiring the caller to separately track and pass an amount to undo
    // (ambiguous: the caller could get it wrong, or the balance could have moved for an unrelated
    // reason in between). Must be idempotent — reversing the same transactionId again is a no-op —
    // and must reject if `transactionId` isn't a transaction this wallet recorded for `sessionId`.
    // A single reverse() call is itself a plain read-modify-write against this wallet's own
    // storage, not a distributed transaction: it offers no protection against this process crashing
    // mid-call, or against a caller whose own retry/compensation logic fails after reverse() throws
    // — callers needing durable, crash-safe compensation must provide that themselves.
    reverse(sessionId: string, transactionId: string): Promise<number>;
}

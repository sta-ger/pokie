import type {WalletPort} from "./WalletPort.js";

// The transactional API SpinCommandHandler actually settles a spin through — additive to
// WalletPort, never a replacement for it (see WalletPort's own doc comment). A caller-supplied
// plain WalletPort is transparently wrapped in a TransactionalWalletAdapter to satisfy this
// interface, so implementing it directly is opt-in, not required.
//
// `transactionId` must be stable for what the caller considers "the same" operation — e.g.
// SpinCommandHandler derives it from a spin's requestId (or a fresh id when none was given) plus
// an operation-type suffix ("...:debit" / "...:credit"), so retrying the same spin reuses the same
// ids. An implementation should treat debit/credit as idempotent per (sessionId, transactionId):
// a repeated call with a transactionId it already applied must not mutate the balance again, and
// should just return the balance that call originally produced. This is what lets a wallet safely
// see the same transaction twice (e.g. a retried command) without double-charging or double-paying.
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
    reverse(sessionId: string, transactionId: string): Promise<number>;
}

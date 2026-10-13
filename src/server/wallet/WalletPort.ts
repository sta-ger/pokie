// Independent money balance. Captured session credits record historical results; they do not
// confer authority over this wallet. On the weaker independent-port path the stores can diverge: a
// FileSessionRepository can survive a restart while balances stay process-local.
//
// A plain read/full-overwrite pair, unchanged since the original "pokie serve" wallet support.
// SpinCommandHandler itself needs more than this — see TransactionalWalletPort — but never
// requires it directly from a caller-supplied WalletPort: PokieDevServer transparently wraps any
// plain WalletPort (this interface) in a TransactionalWalletAdapter, so existing custom
// implementations keep working unchanged.
export interface WalletPort {
    getBalance(sessionId: string): Promise<number>;

    setBalance(sessionId: string, balance: number): Promise<void>;
}

// Money balance, kept separate from SessionRepository's persisted game state (credits are
// explicitly not part of it — see PokieDevServer) so the two can vary independently: a
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

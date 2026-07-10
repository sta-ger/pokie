// Money balance, kept separate from SessionRepository's persisted game state (credits are
// explicitly not part of it — see PokieDevServer) so the two can vary independently: a
// FileSessionRepository can survive a restart while balances stay process-local.
export interface WalletPort {
    getBalance(sessionId: string): Promise<number>;

    setBalance(sessionId: string, balance: number): Promise<void>;
}

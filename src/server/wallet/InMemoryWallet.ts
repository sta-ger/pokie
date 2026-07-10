import type {WalletPort} from "./WalletPort.js";

// Default WalletPort: ephemeral by design, same as the dev server's original standalone
// behavior — a real process restart resets every session's balance back to `initialBalance`,
// since credits are never written to a SessionRepository.
export class InMemoryWallet implements WalletPort {
    private readonly balances = new Map<string, number>();
    private readonly initialBalance: number;

    constructor(initialBalance = 0) {
        this.initialBalance = initialBalance;
    }

    public getBalance(sessionId: string): Promise<number> {
        return Promise.resolve(this.balances.get(sessionId) ?? this.initialBalance);
    }

    public setBalance(sessionId: string, balance: number): Promise<void> {
        this.balances.set(sessionId, balance);
        return Promise.resolve();
    }
}

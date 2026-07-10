import {WalletInsufficientFundsError} from "./WalletInsufficientFundsError.js";
import type {WalletPort} from "./WalletPort.js";

// Default WalletPort: ephemeral by design, same as the dev server's original standalone
// behavior — a real process restart resets every session's balance back to `initialBalance`,
// since credits are never written to a SessionRepository.
//
// In isolation, `getBalance()` for a sessionId it hasn't seen simply returns `initialBalance` (0
// unless configured) — that's the whole of this class's own contract. What that fallback means in
// practice depends on how PokieDevServer got this instance:
// - If you passed it in as `options.wallet` yourself, PokieDevServer treats it as the sole source of
//   a new session's starting balance: it reads getBalance() and applies that onto the freshly created
//   session, never writing that session's own default credits back into it.
// - If PokieDevServer constructed its own default instance (no `wallet` option given), it does the
//   opposite at session-creation time: it calls setBalance(sessionId, session.getCreditsAmount()),
//   seeding this wallet from the session's own starting credits, to preserve pokie serve's original
//   out-of-box behavior. See PokieDevServer.handleCreateSession for the actual branching.
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

    public async debit(sessionId: string, amount: number): Promise<number> {
        const balance = await this.getBalance(sessionId);
        if (amount > balance) {
            throw new WalletInsufficientFundsError(sessionId, amount, balance);
        }
        const newBalance = balance - amount;
        await this.setBalance(sessionId, newBalance);
        return newBalance;
    }

    public async credit(sessionId: string, amount: number): Promise<number> {
        const newBalance = (await this.getBalance(sessionId)) + amount;
        await this.setBalance(sessionId, newBalance);
        return newBalance;
    }

    public rollback(sessionId: string, amount: number): Promise<number> {
        return this.credit(sessionId, amount);
    }
}

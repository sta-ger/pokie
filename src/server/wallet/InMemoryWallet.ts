import {TransactionalWalletAdapter} from "./TransactionalWalletAdapter.js";
import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";
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
//
// Also implements TransactionalWalletPort — not by tracking a second, separate ledger, but by
// composing a TransactionalWalletAdapter over itself (the same adapter PokieDevServer reaches for
// to give a caller's own plain WalletPort transactional behavior). It's the same shim either way;
// InMemoryWallet just doesn't make a caller wrap it manually.
export class InMemoryWallet implements WalletPort, TransactionalWalletPort {
    private readonly balances = new Map<string, number>();
    private readonly initialBalance: number;
    private readonly transactional: TransactionalWalletPort;

    constructor(initialBalance = 0) {
        this.initialBalance = initialBalance;
        this.transactional = new TransactionalWalletAdapter(this);
    }

    public getBalance(sessionId: string): Promise<number> {
        return Promise.resolve(this.balances.get(sessionId) ?? this.initialBalance);
    }

    public setBalance(sessionId: string, balance: number): Promise<void> {
        this.balances.set(sessionId, balance);
        return Promise.resolve();
    }

    public debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.transactional.debit(sessionId, transactionId, amount);
    }

    public credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.transactional.credit(sessionId, transactionId, amount);
    }

    public reverse(sessionId: string, transactionId: string): Promise<number> {
        return this.transactional.reverse(sessionId, transactionId);
    }
}

import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";
import {WalletInsufficientFundsError} from "./WalletInsufficientFundsError.js";
import type {WalletPort} from "./WalletPort.js";
import type {WalletTransactionInspecting} from "./WalletTransactionInspecting.js";
import type {WalletTransactionStatus} from "./WalletTransactionStatus.js";

type TransactionRecord = {
    type: "debit" | "credit";
    amount: number;
    reversed: boolean;
};

// Adapts any plain WalletPort (getBalance/setBalance only — including a consumer's existing custom
// implementation, predating debit/credit/reverse entirely) into a TransactionalWalletPort, so
// SpinCommandHandler always has a transactional wallet to settle a spin through regardless of what
// the caller configured. PokieDevServer wraps a caller-supplied WalletPort in one of these
// automatically (see isTransactionalWalletPort) — a wallet that already implements
// TransactionalWalletPort natively (e.g. InMemoryWallet) is used as-is instead.
//
// The transaction ledger (which (sessionId, transactionId) pairs are currently applied, and what
// they did) lives only in this adapter instance, in memory — it's what makes debit/credit
// idempotent per transactionId and reverse() possible at all on top of a wallet that itself only
// ever saw plain setBalance() overwrites. A transactionId is idempotent only while its record is
// still in effect: once reverse() marks it reversed, debit/credit is willing to apply that same id
// again as a brand new transaction — see debit()'s own comment for why that matters.
export class TransactionalWalletAdapter implements TransactionalWalletPort, WalletTransactionInspecting {
    private readonly wallet: WalletPort;
    private readonly transactions = new Map<string, TransactionRecord>();

    constructor(wallet: WalletPort) {
        this.wallet = wallet;
    }

    public getBalance(sessionId: string): Promise<number> {
        return this.wallet.getBalance(sessionId);
    }

    public setBalance(sessionId: string, balance: number): Promise<void> {
        return this.wallet.setBalance(sessionId, balance);
    }

    public async debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        const key = this.keyFor(sessionId, transactionId);
        const existing = this.transactions.get(key);
        // Only a still-applied transaction short-circuits as an idempotent replay. One that was
        // since reversed no longer has any effect on the balance, so a fresh call reusing its id
        // (e.g. a retried command after its first attempt was compensated) must be allowed to apply
        // for real again — otherwise it would silently no-op, leaving the wallet and whatever the
        // caller persists elsewhere (e.g. session state) diverging.
        if (existing && !existing.reversed) {
            return this.wallet.getBalance(sessionId);
        }

        const balance = await this.wallet.getBalance(sessionId);
        if (amount > balance) {
            throw new WalletInsufficientFundsError(sessionId, amount, balance);
        }
        const newBalance = balance - amount;
        await this.wallet.setBalance(sessionId, newBalance);
        this.transactions.set(key, {type: "debit", amount, reversed: false});
        return newBalance;
    }

    public async credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        const key = this.keyFor(sessionId, transactionId);
        const existing = this.transactions.get(key);
        if (existing && !existing.reversed) {
            return this.wallet.getBalance(sessionId);
        }

        const newBalance = (await this.wallet.getBalance(sessionId)) + amount;
        await this.wallet.setBalance(sessionId, newBalance);
        this.transactions.set(key, {type: "credit", amount, reversed: false});
        return newBalance;
    }

    public async reverse(sessionId: string, transactionId: string): Promise<number> {
        const key = this.keyFor(sessionId, transactionId);
        const record = this.transactions.get(key);
        if (!record) {
            throw new Error(`No transaction "${transactionId}" recorded for session "${sessionId}" to reverse.`);
        }
        if (record.reversed) {
            return this.wallet.getBalance(sessionId);
        }

        const balance = await this.wallet.getBalance(sessionId);
        const newBalance = record.type === "debit" ? balance + record.amount : balance - record.amount;
        await this.wallet.setBalance(sessionId, newBalance);
        record.reversed = true;
        return newBalance;
    }

    // Reads straight off the same ledger debit()/credit()/reverse() already maintain — never a second,
    // separate tracking structure to keep in sync. "absent" covers both "never applied" and "this
    // instance has no memory of it" (e.g. after a restart, since the ledger is in-memory-only) — the two
    // are indistinguishable from here, which is exactly why SpinReconciliationService only ever treats
    // "absent" as "safe to proceed as if nothing happened," never as proof a transaction was reversed.
    public getTransactionStatus(sessionId: string, transactionId: string): Promise<WalletTransactionStatus> {
        const record = this.transactions.get(this.keyFor(sessionId, transactionId));
        if (!record) {
            return Promise.resolve("absent");
        }
        return Promise.resolve(record.reversed ? "reversed" : "applied");
    }

    private keyFor(sessionId: string, transactionId: string): string {
        return `${sessionId}\0${transactionId}`;
    }
}

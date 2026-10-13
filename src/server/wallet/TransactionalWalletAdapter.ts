import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";
import {WalletInsufficientFundsError} from "./WalletInsufficientFundsError.js";
import type {WalletPort} from "./WalletPort.js";
import type {WalletTransactionInspecting} from "./WalletTransactionInspecting.js";
import type {WalletTransactionStatus} from "./WalletTransactionStatus.js";

type TransactionRecord = {
    type: "debit" | "credit";
    amount: number;
    reversed: boolean;
    balance: number;
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
    private readonly queues = new Map<string, Promise<unknown>>();

    constructor(wallet: WalletPort) {
        this.wallet = wallet;
    }

    public getBalance(sessionId: string): Promise<number> {
        return this.wallet.getBalance(sessionId);
    }

    public setBalance(sessionId: string, balance: number): Promise<void> {
        return this.wallet.setBalance(sessionId, balance);
    }

    public debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.enqueue(sessionId, () => this.change(sessionId, transactionId, "debit", amount));
    }

    public credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.enqueue(sessionId, () => this.change(sessionId, transactionId, "credit", amount));
    }

    public reverse(sessionId: string, transactionId: string): Promise<number> {
        return this.enqueue(sessionId, () => this.reverseSerialized(sessionId, transactionId));
    }

    // Reads straight off the same ledger debit()/credit()/reverse() already maintain — never a second,
    // separate tracking structure to keep in sync. "absent" covers both "never applied" and "this
    // instance has no memory of it" (e.g. after a restart, since the ledger is in-memory-only) — the two
    // are indistinguishable from here, which cannot establish authoritative absence after a crash. This adapter is admitted only
    // to the weaker compensation path, never to durable external reconciliation.
    public getTransactionStatus(sessionId: string, transactionId: string): Promise<WalletTransactionStatus> {
        const record = this.transactions.get(this.keyFor(sessionId, transactionId));
        if (!record) {
            return Promise.resolve("absent");
        }
        return Promise.resolve(record.reversed ? "reversed" : "applied");
    }

    private async change(sessionId: string, transactionId: string, type: "debit" | "credit", amount: number): Promise<number> {
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Wallet amount must be finite and non-negative.");
        const key = this.keyFor(sessionId, transactionId);
        const existing = this.transactions.get(key);
        if (existing && !existing.reversed) {
            if (existing.type !== type || existing.amount !== amount) throw new Error("Conflicting wallet transaction identity.");
            return existing.balance;
        }
        const balance = await this.wallet.getBalance(sessionId);
        if (!Number.isFinite(balance) || balance < 0) throw new Error("Invalid wallet balance.");
        if (type === "debit" && amount > balance) throw new WalletInsufficientFundsError(sessionId, amount, balance);
        const next = type === "debit" ? balance - amount : balance + amount;
        if (!Number.isFinite(next) || next < 0) throw new Error("Invalid resulting wallet balance.");
        await this.wallet.setBalance(sessionId, next);
        this.transactions.set(key, {type, amount, reversed: false, balance: next});
        return next;
    }

    private async reverseSerialized(sessionId: string, transactionId: string): Promise<number> {
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

    private enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
        const result = (this.queues.get(sessionId) ?? Promise.resolve()).then(work);
        const tail = result.catch(() => undefined);
        this.queues.set(sessionId, tail);
        tail.then(() => {
            if (this.queues.get(sessionId) === tail) this.queues.delete(sessionId);
        });
        return result;
    }

    private keyFor(sessionId: string, transactionId: string): string {
        return `${sessionId}\0${transactionId}`;
    }
}

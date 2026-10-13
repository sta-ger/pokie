import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import {WalletInsufficientFundsError} from "../wallet/WalletInsufficientFundsError.js";

export interface ReferenceRoundLedgerStorage {
    balance(sessionId: string): number;
    find(sessionId: string, transactionId: string): {kind: string; amount: number; balance: number} | undefined;
    writeEntry(sessionId: string, transactionId: string, kind: "debit" | "credit", amount: number, balance: number): Promise<void>;
}

/** Test/reference local ledger, owned by a round transaction. No external wallet/RGS guarantee. */
export class ReferenceRoundLedger implements TransactionalWalletPort {
    private readonly storage: ReferenceRoundLedgerStorage;
    constructor(storage: ReferenceRoundLedgerStorage) {
        this.storage = storage;
    }
    public getBalance(sessionId: string): Promise<number> {
        return Promise.resolve().then(() => this.storage.balance(sessionId));
    }
    public setBalance(): Promise<void> {
        return Promise.reject(new Error("Initialize balance through TransactionalRoundStore.initialize()."));
    }
    public reverse(): Promise<number> {
        return Promise.reject(new Error("Atomic rounds roll back the owning transaction; separate compensation is forbidden."));
    }
    public debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.change(sessionId, transactionId, "debit", amount);
    }
    public credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.change(sessionId, transactionId, "credit", amount);
    }
    private async change(sessionId: string, transactionId: string, kind: "debit" | "credit", amount: number): Promise<number> {
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Ledger amount must be finite and non-negative.");
        const previous = this.storage.find(sessionId, transactionId);
        if (previous !== undefined) {
            if (previous.kind !== kind || previous.amount !== amount) throw new Error("Conflicting reference ledger transaction identity.");
            return previous.balance;
        }
        const balance = this.storage.balance(sessionId);
        if (kind === "debit" && amount > balance) throw new WalletInsufficientFundsError(sessionId, amount, balance);
        const next = kind === "debit" ? balance - amount : balance + amount;
        if (!Number.isFinite(next) || next < 0) throw new Error("Invalid resulting reference balance.");
        await this.storage.writeEntry(sessionId, transactionId, kind, amount, next);
        return next;
    }
}

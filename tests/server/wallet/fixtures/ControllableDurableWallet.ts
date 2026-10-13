import type {DatabaseSync} from "node:sqlite";
import type {DurableWalletPort, DurableWalletTransaction} from "../../../../src/server/wallet/DurableWalletPort.js";
import {WalletInsufficientFundsError} from "../../../../src/server/wallet/WalletInsufficientFundsError.js";

/** Independent provider fixture for controller lifecycle checks. Uses its OWN durable database.
 * Faults affect acknowledgement, never local POKIE intent storage. No detached work or timers.
 */
export class ControllableDurableWallet implements DurableWalletPort {
    public readonly capabilities = {durableIdempotency: true, authoritativeInspection: true, immutableTransactionIdentity: true} as const;
    public fault?: "before-debit" | "after-debit" | "before-credit" | "after-credit" | "hang-debit" | "hang-credit";
    public inspection?: DurableWalletTransaction | "throw" | "hang";
    public onDispatch?: (kind: "debit" | "credit") => void;
    private readonly database: DatabaseSync;
    private constructor(database: DatabaseSync) {
        this.database = database;
    }
    public static async open(filename: string): Promise<ControllableDurableWallet> {
        const {DatabaseSync: Database} = await import("node:sqlite");
        const db = new Database(filename);
        db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;");
        db.exec("CREATE TABLE IF NOT EXISTS balances (session TEXT PRIMARY KEY, balance REAL NOT NULL); CREATE TABLE IF NOT EXISTS transactions (session TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL, balance REAL NOT NULL, reversed INTEGER NOT NULL, PRIMARY KEY(session, id))");
        return new ControllableDurableWallet(db);
    }
    public getBalance(sessionId: string): Promise<number> {
        return Promise.resolve(this.balance(sessionId)); 
    }
    public setBalance(sessionId: string, balance: number): Promise<void> {
        if (!Number.isFinite(balance) || balance < 0) return Promise.reject(new Error("Invalid balance."));
        this.database.prepare("INSERT INTO balances VALUES (?, ?) ON CONFLICT(session) DO UPDATE SET balance=excluded.balance").run(sessionId, balance);
        return Promise.resolve();
    }
    public debit(session: string, id: string, amount: number): Promise<number> {
        return this.change(session, id, "debit", amount); 
    }
    public credit(session: string, id: string, amount: number): Promise<number> {
        return this.change(session, id, "credit", amount); 
    }
    public reverse(session: string, id: string): Promise<number> {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const row = this.database.prepare("SELECT * FROM transactions WHERE session=? AND id=?").get(session, id);
            if (!row) throw new Error("Unknown transaction.");
            if (!row.reversed) {
                const next = this.balance(session) + (row.kind === "debit" ? Number(row.amount) : -Number(row.amount));
                if (next < 0) throw new Error("Insufficient compensation balance.");
                this.database.prepare("UPDATE balances SET balance=? WHERE session=?").run(next, session);
                this.database.prepare("UPDATE transactions SET reversed=1 WHERE session=? AND id=?").run(session, id);
            }
            this.database.exec("COMMIT");
            return this.getBalance(session);
        } catch (error) {
            this.database.exec("ROLLBACK");
            return Promise.reject(error); 
        }
    }
    public inspectTransaction(session: string, id: string): Promise<DurableWalletTransaction> {
        if (this.inspection === "hang") return new Promise(() => { /* Store timeout owns the bounded wait. */ });
        if (this.inspection === "throw") return Promise.reject(new Error("Provider inspection disconnected."));
        if (this.inspection) return Promise.resolve(this.inspection);
        const row = this.database.prepare("SELECT * FROM transactions WHERE session=? AND id=?").get(session, id);
        if (!row) return Promise.resolve({status: "not-applied"});
        return Promise.resolve(row.reversed ? {status: "compensated"} : {status: "committed", kind: row.kind as "debit" | "credit", amount: Number(row.amount), balance: Number(row.balance)});
    }
    public counts(session: string): {debit: number; credit: number} {
        return {debit: Number(this.database.prepare("SELECT COUNT(*) AS n FROM transactions WHERE session=? AND kind='debit'").get(session)!.n),
            credit: Number(this.database.prepare("SELECT COUNT(*) AS n FROM transactions WHERE session=? AND kind='credit'").get(session)!.n)};
    }
    public close(): void {
        if (this.database.isOpen) this.database.close(); 
    }
    private balance(session: string): number {
        return Number(this.database.prepare("SELECT balance FROM balances WHERE session=?").get(session)?.balance ?? 1000); 
    }
    private change(session: string, id: string, kind: "debit" | "credit", amount: number): Promise<number> {
        this.onDispatch?.(kind);
        if (this.fault === `before-${kind}`) {
            this.fault = undefined;
            return Promise.reject(new Error("Disconnected before dispatch.")); 
        }
        if (this.fault === `hang-${kind}`) {
            this.fault = undefined;
            return new Promise(() => { /* Provider does not acknowledge; store bounds the wait. */ }); 
        }
        this.database.exec("BEGIN IMMEDIATE");
        let next: number;
        try {
            if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid amount.");
            const old = this.database.prepare("SELECT * FROM transactions WHERE session=? AND id=?").get(session, id);
            if (old) {
                if (old.kind !== kind || old.amount !== amount || old.reversed) throw new Error("Conflicting/reversed permanent identity.");
                next = Number(old.balance);
            } else {
                const balance = this.balance(session);
                if (kind === "debit" && amount > balance) throw new WalletInsufficientFundsError(session, amount, balance);
                next = kind === "debit" ? balance - amount : balance + amount;
                if (!Number.isFinite(next) || next < 0) throw new Error("Invalid resulting balance.");
                this.database.prepare("INSERT INTO balances VALUES (?, ?) ON CONFLICT(session) DO UPDATE SET balance=excluded.balance").run(session, next);
                this.database.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, 0)").run(session, id, kind, amount, next);
            }
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            return Promise.reject(error); 
        }
        if (this.fault === `after-${kind}`) {
            this.fault = undefined;
            return Promise.reject(new Error("Applied then disconnected.")); 
        }
        return Promise.resolve(next);
    }
}

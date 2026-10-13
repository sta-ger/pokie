import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";

/** Explicit provider promises, to be verified against the provider's durable implementation.
 * Method presence and process-local transaction maps do not establish these guarantees.
 */
export interface DurableWalletCapabilities {
    readonly durableIdempotency: true;
    readonly authoritativeInspection: true;
    readonly immutableTransactionIdentity: true;
    /** Permanent rejection fences every in-flight and future dispatch of the same identity. */
    readonly terminalRejection: true;
}

export type DurableWalletTransaction =
    | {status: "unknown" | "pending" | "not-applied" | "compensated"}
    | {status: "rejected"; kind: "debit" | "credit"; amount: number; reason: string}
    | {status: "committed"; kind: "debit" | "credit"; amount: number; balance: number};

/** Independent settlement, never a participant in the local SQLite transaction.
 * IDs are permanent and bound to session/kind/amount. Duplicates return the ORIGINAL balance.
 * rejected is a durable terminal tombstone: no earlier/late call may ever apply that identity.
 * not-applied is NOT terminal; it is authoritative permission to dispatch the SAME identity; unknown is not.
 * pending includes provider reservations awaiting provider completion. The provider must finish
 * or expose them for operator recovery; POKIE never substitutes another transaction identity.
 * Abort/timeout after dispatch does not prove cancellation. Inspection must include late effects.
 */
export interface DurableWalletPort extends TransactionalWalletPort {
    readonly capabilities: DurableWalletCapabilities;
    getBalance(sessionId: string, signal?: AbortSignal): Promise<number>;
    inspectTransaction(sessionId: string, transactionId: string, signal?: AbortSignal): Promise<DurableWalletTransaction>;
    debit(sessionId: string, transactionId: string, amount: number, signal?: AbortSignal): Promise<number>;
    credit(sessionId: string, transactionId: string, amount: number, signal?: AbortSignal): Promise<number>;
}

export function isDurableWalletPort(wallet: unknown): wallet is DurableWalletPort {
    const candidate = wallet as Partial<DurableWalletPort> | null;
    return candidate !== null && typeof candidate === "object" &&
        candidate.capabilities?.durableIdempotency === true && candidate.capabilities.authoritativeInspection === true &&
        candidate.capabilities.immutableTransactionIdentity === true && candidate.capabilities.terminalRejection === true &&
        [candidate.getBalance, candidate.setBalance, candidate.debit, candidate.credit, candidate.reverse, candidate.inspectTransaction].every(method => typeof method === "function");
}

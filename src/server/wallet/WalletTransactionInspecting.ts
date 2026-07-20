import type {WalletTransactionStatus} from "./WalletTransactionStatus.js";

// Optional capability, additive to TransactionalWalletPort the same way TransactionalWalletPort is
// additive to WalletPort (see isTransactionalWalletPort.ts) — a wallet that already tracks its own
// transaction ledger (TransactionalWalletAdapter/InMemoryWallet both do) can report a specific
// transaction's current status without anything else having to reconstruct or guess at it.
//
// This exists specifically so SpinReconciliationService can tell, for an attempt whose own
// SpinOperationLog record is stuck at the "debited" checkpoint (the win settlement's own outcome is
// unknown from the checkpoint alone), whether the matching creditTransactionId ever actually applied
// before automatically reversing the debit — reversing blindly without knowing that would risk leaving a
// phantom, un-reversed credit behind. A TransactionalWalletPort that doesn't implement this (feature-
// detected via isWalletTransactionInspecting) simply means that specific case is classified
// manual-recovery-required instead of being resolved automatically — always safe, just less automated.
export interface WalletTransactionInspecting {
    getTransactionStatus(sessionId: string, transactionId: string): Promise<WalletTransactionStatus>;
}

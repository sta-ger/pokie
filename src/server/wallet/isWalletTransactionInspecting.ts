import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";
import type {WalletTransactionInspecting} from "./WalletTransactionInspecting.js";

// Feature-detected: true for a wallet that additionally implements getTransactionStatus() (e.g.
// TransactionalWalletAdapter/InMemoryWallet), false for a plain TransactionalWalletPort that doesn't —
// see WalletTransactionInspecting's own doc comment for what that changes for a caller.
export function isWalletTransactionInspecting(wallet: TransactionalWalletPort): wallet is TransactionalWalletPort & WalletTransactionInspecting {
    const candidate = wallet as Partial<WalletTransactionInspecting>;
    return typeof candidate.getTransactionStatus === "function";
}

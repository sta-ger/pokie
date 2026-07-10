import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";
import type {WalletPort} from "./WalletPort.js";

// Feature-detected: true for a wallet that already implements debit/credit/reverse natively (e.g.
// InMemoryWallet), false for a plain legacy WalletPort that needs wrapping in a
// TransactionalWalletAdapter first.
export function isTransactionalWalletPort(wallet: WalletPort): wallet is TransactionalWalletPort {
    const candidate = wallet as Partial<TransactionalWalletPort>;
    return (
        typeof candidate.debit === "function" &&
        typeof candidate.credit === "function" &&
        typeof candidate.reverse === "function"
    );
}

import {InMemoryWallet, transactionalWalletPortContractTests, TransactionalWalletAdapter, WalletPort} from "pokie";

// A minimal legacy WalletPort — getBalance/setBalance only, predating debit/credit/reverse
// entirely — standing in for a consumer's own pre-existing custom implementation.
class LegacyMapWallet implements WalletPort {
    private readonly balances = new Map<string, number>();

    public getBalance(sessionId: string): Promise<number> {
        return Promise.resolve(this.balances.get(sessionId) ?? 0);
    }

    public setBalance(sessionId: string, balance: number): Promise<void> {
        this.balances.set(sessionId, balance);
        return Promise.resolve();
    }
}

transactionalWalletPortContractTests("InMemoryWallet", () => new InMemoryWallet());
transactionalWalletPortContractTests(
    "TransactionalWalletAdapter over a legacy WalletPort",
    () => new TransactionalWalletAdapter(new LegacyMapWallet()),
);

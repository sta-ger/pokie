import {InMemoryWallet, TransactionalWalletAdapter, TransactionalWalletPort, WalletPort, WalletTransactionInspecting} from "pokie";

// Both InMemoryWallet and TransactionalWalletAdapter report transaction status the same way (the latter
// is what InMemoryWallet itself composes internally) — exercised together via a small table so the two
// can never silently drift apart.
const subjects: {name: string; create: () => TransactionalWalletPort & WalletTransactionInspecting}[] = [
    {name: "InMemoryWallet", create: () => new InMemoryWallet(1000)},
    {
        name: "TransactionalWalletAdapter",
        create: () => {
            const plain: WalletPort = (() => {
                let balance = 1000;
                return {
                    getBalance: () => Promise.resolve(balance),
                    setBalance: (_sessionId: string, value: number) => {
                        balance = value;
                        return Promise.resolve();
                    },
                };
            })();
            return new TransactionalWalletAdapter(plain);
        },
    },
];

describe.each(subjects)("$name transaction inspection", ({create}) => {
    it('reports "absent" for a transactionId that was never applied', async () => {
        const wallet = create();

        await expect(wallet.getTransactionStatus("session-1", "never-happened")).resolves.toBe("absent");
    });

    it('reports "applied" right after a debit', async () => {
        const wallet = create();

        await wallet.debit("session-1", "txn-1", 100);

        await expect(wallet.getTransactionStatus("session-1", "txn-1")).resolves.toBe("applied");
    });

    it('reports "applied" right after a credit', async () => {
        const wallet = create();

        await wallet.credit("session-1", "txn-1", 100);

        await expect(wallet.getTransactionStatus("session-1", "txn-1")).resolves.toBe("applied");
    });

    it('reports "reversed" after reverse() compensates a transaction', async () => {
        const wallet = create();
        await wallet.debit("session-1", "txn-1", 100);

        await wallet.reverse("session-1", "txn-1");

        await expect(wallet.getTransactionStatus("session-1", "txn-1")).resolves.toBe("reversed");
    });

    it('reports "applied" again once a reversed transactionId is reused for a brand-new transaction', async () => {
        const wallet = create();
        await wallet.debit("session-1", "txn-1", 100);
        await wallet.reverse("session-1", "txn-1");

        await wallet.debit("session-1", "txn-1", 50);

        await expect(wallet.getTransactionStatus("session-1", "txn-1")).resolves.toBe("applied");
    });

    it("keeps transaction status independent per sessionId", async () => {
        const wallet = create();

        await wallet.debit("session-1", "txn-1", 100);

        await expect(wallet.getTransactionStatus("session-1", "txn-1")).resolves.toBe("applied");
        await expect(wallet.getTransactionStatus("session-2", "txn-1")).resolves.toBe("absent");
    });
});

import type {TransactionalWalletPort} from "./TransactionalWalletPort.js";

// A reusable Jest contract suite for a TransactionalWalletPort implementation (either a native one,
// or a plain WalletPort wrapped in TransactionalWalletAdapter). Usage in a *.test.ts file:
//
//   import {transactionalWalletPortContractTests, TransactionalWalletAdapter} from "pokie";
//   transactionalWalletPortContractTests("MyWalletPort (adapted)", () => new TransactionalWalletAdapter(new MyWalletPort()));
//
// Each case establishes its own starting balance via setBalance() first, rather than assuming a
// default-for-unknown-sessionId behavior — that part of getBalance() is deliberately left to each
// underlying WalletPort (see InMemoryWallet's own, separately tested, `initialBalance` default).
export function transactionalWalletPortContractTests(name: string, createWallet: () => TransactionalWalletPort): void {
    describe(`${name} (TransactionalWalletPort contract)`, () => {
        it("debit reduces the balance by the given amount and returns the new balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.debit("session-1", "txn-1", 200)).resolves.toBe(300);
            await expect(wallet.getBalance("session-1")).resolves.toBe(300);
        });

        it("debit throws and leaves the balance unchanged when amount exceeds the balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 100);

            await expect(wallet.debit("session-1", "txn-1", 101)).rejects.toThrow();
            await expect(wallet.getBalance("session-1")).resolves.toBe(100);
        });

        it("credit increases the balance by the given amount and returns the new balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.credit("session-1", "txn-1", 150)).resolves.toBe(650);
            await expect(wallet.getBalance("session-1")).resolves.toBe(650);
        });

        it("repeating a debit with the same transactionId does not charge twice", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.debit("session-1", "txn-1", 200)).resolves.toBe(300);
            await expect(wallet.debit("session-1", "txn-1", 200)).resolves.toBe(300);
            await expect(wallet.getBalance("session-1")).resolves.toBe(300);
        });

        it("repeating a credit with the same transactionId does not pay twice", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.credit("session-1", "txn-1", 150)).resolves.toBe(650);
            await expect(wallet.credit("session-1", "txn-1", 150)).resolves.toBe(650);
            await expect(wallet.getBalance("session-1")).resolves.toBe(650);
        });

        it("reverse compensates a debit, restoring the balance it had before that debit", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.debit("session-1", "txn-1", 200);

            await expect(wallet.reverse("session-1", "txn-1")).resolves.toBe(500);
            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
        });

        it("reverse compensates a credit, restoring the balance it had before that credit", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.credit("session-1", "txn-1", 150);

            await expect(wallet.reverse("session-1", "txn-1")).resolves.toBe(500);
            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
        });

        it("reverse is idempotent — reversing the same transactionId twice only compensates once", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.debit("session-1", "txn-1", 200);

            await expect(wallet.reverse("session-1", "txn-1")).resolves.toBe(500);
            await expect(wallet.reverse("session-1", "txn-1")).resolves.toBe(500);
            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
        });

        it("debit reapplies for real when its transactionId was previously reversed, rather than silently no-op'ing", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.debit("session-1", "txn-1", 200);
            await wallet.reverse("session-1", "txn-1");

            // "txn-1" now has no effect on the balance (500). Reusing it must charge for real again,
            // not be treated as an idempotent replay of the now-reversed original debit.
            await expect(wallet.debit("session-1", "txn-1", 300)).resolves.toBe(200);
            await expect(wallet.getBalance("session-1")).resolves.toBe(200);
        });

        it("credit reapplies for real when its transactionId was previously reversed, rather than silently no-op'ing", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.credit("session-1", "txn-1", 200);
            await wallet.reverse("session-1", "txn-1");

            await expect(wallet.credit("session-1", "txn-1", 300)).resolves.toBe(800);
            await expect(wallet.getBalance("session-1")).resolves.toBe(800);
        });

        it("reverse rejects an unknown transactionId", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.reverse("session-1", "does-not-exist")).rejects.toThrow();
        });

        it("keeps balances and transaction ledgers for different sessionIds independent", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.setBalance("session-2", 500);

            await wallet.debit("session-1", "txn-1", 200);

            await expect(wallet.getBalance("session-2")).resolves.toBe(500);
            // The same transactionId under a different sessionId is a distinct transaction.
            await expect(wallet.debit("session-2", "txn-1", 50)).resolves.toBe(450);
        });
    });
}

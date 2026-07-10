import type {WalletPort} from "./WalletPort.js";

// A reusable Jest contract suite for a WalletPort implementation, shipped so a consumer with their
// own custom WalletPort (e.g. backed by a real ledger) can verify it against the same behavior
// InMemoryWallet is held to, without duplicating these cases by hand. Usage in a *.test.ts file:
//
//   import {walletPortContractTests} from "pokie";
//   walletPortContractTests("MyWalletPort", () => new MyWalletPort());
//
// Each case establishes its own starting balance via setBalance() first, rather than assuming a
// default-for-unknown-sessionId behavior — that part of getBalance() is deliberately left to each
// implementation (see InMemoryWallet's own, separately tested, `initialBalance` default).
export function walletPortContractTests(name: string, createWallet: () => WalletPort): void {
    describe(`${name} (WalletPort contract)`, () => {
        it("round-trips a balance via setBalance/getBalance", async () => {
            const wallet = createWallet();

            await wallet.setBalance("session-1", 500);

            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
        });

        it("debit reduces the balance by the given amount and returns the new balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.debit("session-1", 200)).resolves.toBe(300);
            await expect(wallet.getBalance("session-1")).resolves.toBe(300);
        });

        it("debit throws and leaves the balance unchanged when amount exceeds the balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 100);

            await expect(wallet.debit("session-1", 101)).rejects.toThrow();
            await expect(wallet.getBalance("session-1")).resolves.toBe(100);
        });

        it("credit increases the balance by the given amount and returns the new balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await expect(wallet.credit("session-1", 150)).resolves.toBe(650);
            await expect(wallet.getBalance("session-1")).resolves.toBe(650);
        });

        it("rollback compensates a prior debit of the same amount, restoring the original balance", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);

            await wallet.debit("session-1", 200);
            await expect(wallet.rollback("session-1", 200)).resolves.toBe(500);
            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
        });

        it("keeps balances for different sessionIds independent across debit/credit/rollback", async () => {
            const wallet = createWallet();
            await wallet.setBalance("session-1", 500);
            await wallet.setBalance("session-2", 100);

            await wallet.debit("session-1", 200);
            await wallet.credit("session-1", 50);
            await wallet.rollback("session-1", 10);

            await expect(wallet.getBalance("session-2")).resolves.toBe(100);
        });
    });
}

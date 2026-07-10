import type {WalletPort} from "./WalletPort.js";

// A reusable Jest contract suite for a plain WalletPort implementation, shipped so a consumer with
// their own custom WalletPort can verify it against the same behavior InMemoryWallet is held to.
// Usage in a *.test.ts file:
//
//   import {walletPortContractTests} from "pokie";
//   walletPortContractTests("MyWalletPort", () => new MyWalletPort());
//
// For the additive transactional API (debit/credit/reverse), see transactionalWalletPortContractTests
// — a plain WalletPort doesn't need to implement that itself, PokieDevServer adapts it automatically.
export function walletPortContractTests(name: string, createWallet: () => WalletPort): void {
    describe(`${name} (WalletPort contract)`, () => {
        it("round-trips a balance via setBalance/getBalance", async () => {
            const wallet = createWallet();

            await wallet.setBalance("session-1", 500);

            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
        });

        it("keeps balances for different sessionIds independent", async () => {
            const wallet = createWallet();

            await wallet.setBalance("session-1", 500);
            await wallet.setBalance("session-2", 100);

            await expect(wallet.getBalance("session-1")).resolves.toBe(500);
            await expect(wallet.getBalance("session-2")).resolves.toBe(100);
        });

        it("overwrites a previously set balance", async () => {
            const wallet = createWallet();

            await wallet.setBalance("session-1", 500);
            await wallet.setBalance("session-1", 750);

            await expect(wallet.getBalance("session-1")).resolves.toBe(750);
        });
    });
}

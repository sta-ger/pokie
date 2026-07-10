import {InMemoryWallet} from "pokie";

describe("InMemoryWallet", () => {
    it("defaults an unknown sessionId's balance to 0", async () => {
        const wallet = new InMemoryWallet();

        await expect(wallet.getBalance("does-not-exist")).resolves.toBe(0);
    });

    it("defaults an unknown sessionId's balance to a configured initial balance", async () => {
        const wallet = new InMemoryWallet(1000);

        await expect(wallet.getBalance("does-not-exist")).resolves.toBe(1000);
    });

    it("round-trips a balance set via setBalance", async () => {
        const wallet = new InMemoryWallet();

        await wallet.setBalance("session-1", 250);

        await expect(wallet.getBalance("session-1")).resolves.toBe(250);
    });

    it("keeps balances for different sessionIds independent", async () => {
        const wallet = new InMemoryWallet(100);

        await wallet.setBalance("session-1", 50);

        await expect(wallet.getBalance("session-1")).resolves.toBe(50);
        await expect(wallet.getBalance("session-2")).resolves.toBe(100);
    });
});

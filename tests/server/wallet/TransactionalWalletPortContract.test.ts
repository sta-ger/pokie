import fs from "node:fs";
import path from "node:path";
import {ControllableDurableWallet} from "./fixtures/ControllableDurableWallet.js";
import {isDurableWalletPort} from "../../../src/server/wallet/DurableWalletPort.js";
import {InMemoryWallet, transactionalWalletPortContractTests, TransactionalWalletAdapter, WalletPort} from "@fromstan/pokie";

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

describe("independent durable wallet contract", () => {
    let directory: string;
    let wallet: ControllableDurableWallet;
    beforeEach(async () => {
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c05-wallet-"));
        wallet = await ControllableDurableWallet.open(path.join(directory, "provider.sqlite"));
        await wallet.setBalance("s", 100);
    });
    afterEach(() => {
        wallet.close();
        fs.rmSync(directory, {recursive: true, force: true});
    });
    it("keeps original permanent outcomes through unrelated balances and provider restart", async () => {
        const debit = await wallet.debit("s", "d", 0.05);
        const credit = await wallet.credit("s", "c", 7.5);
        await wallet.credit("s", "unrelated", 1e-7);
        wallet.close();
        const reopened = await ControllableDurableWallet.open(path.join(directory, "provider.sqlite"));
        expect(await reopened.debit("s", "d", 0.05)).toBe(debit);
        expect(await reopened.credit("s", "c", 7.5)).toBe(credit);
        await expect(reopened.debit("s", "d", 7.5)).rejects.toThrow();
        await expect(reopened.credit("s", "d", 0.05)).rejects.toThrow();
        expect(await reopened.inspectTransaction("s", "d")).toEqual({status: "committed", kind: "debit", amount: 0.05, balance: debit});
        expect(reopened.counts("s")).toEqual({debit: 1, credit: 2});
        reopened.close();
    });
    it.each(["before-debit", "after-debit", "before-credit", "after-credit"] as const)("authoritatively inspects %s and duplicates the original identity", async fault => {
        wallet.fault = fault;
        const kind = fault.endsWith("debit") ? "debit" : "credit";
        await expect(wallet[kind]("s", "leg", 0.05)).rejects.toThrow();
        expect(await wallet.inspectTransaction("s", "leg")).toMatchObject({status: fault.startsWith("before") ? "not-applied" : "committed"});
        const a = await wallet[kind]("s", "leg", 0.05);
        expect(await wallet[kind]("s", "leg", 0.05)).toBe(a);
        expect(wallet.counts("s")[kind]).toBe(1);
    });
    it("distinguishes unknown, pending, authoritative absence, commitment and compensation", async () => {
        expect(await wallet.inspectTransaction("s", "missing")).toEqual({status: "not-applied"});
        for (const status of ["unknown", "pending"] as const) {
            Object.assign(wallet, {inspection: {status}});
            expect(await wallet.inspectTransaction("s", "leg")).toEqual({status});
        }
        Object.assign(wallet, {inspection: undefined});
        await wallet.debit("s", "leg", 1e-7);
        await wallet.reverse("s", "leg");
        expect(await wallet.inspectTransaction("s", "leg")).toEqual({status: "compensated"});
        await expect(wallet.debit("s", "leg", 1e-7)).rejects.toThrow();
    });
    it("overlapping provider connections cannot overdraw or duplicate", async () => {
        const second = await ControllableDurableWallet.open(path.join(directory, "provider.sqlite"));
        try {
            const results = await Promise.allSettled([wallet.debit("s", "a", 100), second.debit("s", "b", 100)]);
            expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
            expect(await second.debit("s", "a", 100)).toBe(0);
            expect(await wallet.getBalance("s")).toBe(0);
        } finally {
            second.close();
        }
    });
    it("does not certify ephemeral or incomplete adapters by method names", () => {
        expect(isDurableWalletPort(new InMemoryWallet())).toBe(false);
        expect(isDurableWalletPort(new TransactionalWalletAdapter(new LegacyMapWallet()))).toBe(false);
        expect(isDurableWalletPort({...wallet, capabilities: wallet.capabilities})).toBe(false);
        expect(isDurableWalletPort(wallet)).toBe(true);
    });
    it("permanent insufficient rejection survives restart and prevents every late duplicate", async () => {
        await expect(wallet.debit("s", "rejected", 101)).rejects.toThrow();
        expect(await wallet.inspectTransaction("s", "rejected")).toMatchObject({status: "rejected", kind: "debit", amount: 101});
        wallet.close();
        const reopened = await ControllableDurableWallet.open(path.join(directory, "provider.sqlite"));
        await reopened.credit("s", "unrelated", 10);
        await expect(reopened.debit("s", "rejected", 101)).rejects.toThrow();
        await expect(reopened.debit("s", "rejected", 0.05)).rejects.toThrow();
        await expect(reopened.credit("s", "rejected", 101)).rejects.toThrow();
        expect(await reopened.getBalance("s")).toBe(110);
        expect(reopened.counts("s")).toEqual({debit: 0, credit: 1});
        reopened.close();
    });
    it("requires a declared terminal rejection fence before admitting strong settlement", () => {
        Object.assign(wallet, {capabilities: {...wallet.capabilities, terminalRejection: undefined}});
        expect(isDurableWalletPort(wallet)).toBe(false);
    });

});

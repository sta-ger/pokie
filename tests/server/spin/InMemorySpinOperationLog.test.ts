import {InMemorySpinOperationLog, SpinOperationRecord} from "pokie";

function recordFor(sessionId: string, requestId: string, checkpoint: SpinOperationRecord["checkpoint"]): SpinOperationRecord {
    const now = new Date().toISOString();
    return {
        sessionId,
        requestId,
        attemptId: "attempt-1",
        debitTransactionId: `${requestId}:attempt-1:debit`,
        creditTransactionId: `${requestId}:attempt-1:credit`,
        stakeAmount: 5,
        expectedVersion: undefined,
        checkpoint,
        startedAt: now,
        updatedAt: now,
    };
}

describe("InMemorySpinOperationLog", () => {
    it("returns undefined for a (sessionId, requestId) that was never recorded", async () => {
        const log = new InMemorySpinOperationLog();

        await expect(log.load("session-1", "request-1")).resolves.toBeUndefined();
    });

    it("round-trips a recorded record", async () => {
        const log = new InMemorySpinOperationLog();
        const record = recordFor("session-1", "request-1", "started");

        await log.record(record);

        await expect(log.load("session-1", "request-1")).resolves.toEqual(record);
    });

    it("upserts by (sessionId, requestId) — a later record() call replaces, never accumulates", async () => {
        const log = new InMemorySpinOperationLog();
        await log.record(recordFor("session-1", "request-1", "started"));

        await log.record(recordFor("session-1", "request-1", "debited"));

        await expect(log.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "debited"});
    });

    it("keeps different sessionIds and different requestIds independent", async () => {
        const log = new InMemorySpinOperationLog();
        await log.record(recordFor("session-1", "request-1", "debited"));
        await log.record(recordFor("session-1", "request-2", "settled"));
        await log.record(recordFor("session-2", "request-1", "session-saved"));

        await expect(log.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "debited"});
        await expect(log.load("session-1", "request-2")).resolves.toMatchObject({checkpoint: "settled"});
        await expect(log.load("session-2", "request-1")).resolves.toMatchObject({checkpoint: "session-saved"});
    });

    it("delete() removes a record; deleting one that was never there is a harmless no-op", async () => {
        const log = new InMemorySpinOperationLog();
        await log.record(recordFor("session-1", "request-1", "debited"));

        await log.delete("session-1", "request-1");

        await expect(log.load("session-1", "request-1")).resolves.toBeUndefined();
        await expect(log.delete("session-1", "does-not-exist")).resolves.toBeUndefined();
    });

    it("listIncomplete() returns only records whose checkpoint is not committed/compensated", async () => {
        const log = new InMemorySpinOperationLog();
        await log.record(recordFor("session-1", "request-1", "started"));
        await log.record(recordFor("session-1", "request-2", "debited"));
        await log.record(recordFor("session-1", "request-3", "settled"));
        await log.record(recordFor("session-1", "request-4", "session-saved"));
        await log.record(recordFor("session-1", "request-5", "committed"));
        await log.record(recordFor("session-1", "request-6", "compensated"));

        const incomplete = await log.listIncomplete();

        expect(new Set(incomplete.map((record) => record.requestId))).toEqual(new Set(["request-1", "request-2", "request-3", "request-4"]));
    });

    it("listIncomplete() no longer returns a record once it's been recorded as committed/compensated", async () => {
        const log = new InMemorySpinOperationLog();
        await log.record(recordFor("session-1", "request-1", "session-saved"));

        await log.record(recordFor("session-1", "request-1", "committed"));

        await expect(log.listIncomplete()).resolves.toEqual([]);
    });

    describe("SpinOperationLeasing — fenced, token-based claims", () => {
        it("tryClaimForReconciliation returns a fresh token when uncontested, and undefined while it's still held", async () => {
            const log = new InMemorySpinOperationLog();

            const tokenA = await log.tryClaimForReconciliation("session-1", "request-1", 10_000);

            expect(typeof tokenA).toBe("string");
            await expect(log.tryClaimForReconciliation("session-1", "request-1", 10_000)).resolves.toBeUndefined();
        });

        it("renewReconciliationClaim extends a still-current claim's own expiry and returns true", async () => {
            let currentTime = new Date(2026, 0, 1, 12, 0, 0);
            const log = new InMemorySpinOperationLog(() => currentTime);
            const token = await log.tryClaimForReconciliation("session-1", "request-1", 1_000);

            currentTime = new Date(currentTime.getTime() + 900); // still within the original 1s lease

            await expect(log.renewReconciliationClaim("session-1", "request-1", token as string, 1_000)).resolves.toBe(true);

            currentTime = new Date(currentTime.getTime() + 900); // would have expired without the renewal above
            // A fresh claim attempt by someone else must still fail — the renewal genuinely extended it.
            await expect(log.tryClaimForReconciliation("session-1", "request-1", 1_000)).resolves.toBeUndefined();
        });

        it("renewReconciliationClaim returns false for a token that has already expired, or that never held the claim", async () => {
            let currentTime = new Date(2026, 0, 1, 12, 0, 0);
            const log = new InMemorySpinOperationLog(() => currentTime);
            const token = await log.tryClaimForReconciliation("session-1", "request-1", 1_000);

            currentTime = new Date(currentTime.getTime() + 2_000); // past the 1s lease

            await expect(log.renewReconciliationClaim("session-1", "request-1", token as string, 1_000)).resolves.toBe(false);
            await expect(log.renewReconciliationClaim("session-1", "request-1", "never-held-this", 1_000)).resolves.toBe(false);
        });

        // The scenario the fencing guarantee exists for: A's lease genuinely expires, B claims the record
        // fresh, and A — unaware its own claim already lapsed — finally gets around to releasing what it
        // still believes is its own claim. That release must be a safe no-op against B's now-active one,
        // never a way for a stale owner to silently clear a newer owner's claim out from under it.
        it("a stale owner's release() does not remove a newer claimant's lease (fencing)", async () => {
            let currentTime = new Date(2026, 0, 1, 12, 0, 0);
            const log = new InMemorySpinOperationLog(() => currentTime);

            const tokenA = await log.tryClaimForReconciliation("session-1", "request-1", 1_000);
            expect(tokenA).toBeDefined();

            currentTime = new Date(currentTime.getTime() + 2_000); // A's lease has now expired

            const tokenB = await log.tryClaimForReconciliation("session-1", "request-1", 1_000);
            expect(tokenB).toBeDefined();
            expect(tokenB).not.toBe(tokenA);

            // A, unaware its own lease already expired, finally releases what it still believes is its
            // own claim.
            await log.releaseReconciliationClaim("session-1", "request-1", tokenA as string);

            // B's claim must still be intact — a fresh claim attempt (as a third party would make) must
            // fail, since B still legitimately holds it.
            await expect(log.tryClaimForReconciliation("session-1", "request-1", 1_000)).resolves.toBeUndefined();

            // B's own release, using its own correct token, does work.
            await log.releaseReconciliationClaim("session-1", "request-1", tokenB as string);
            await expect(log.tryClaimForReconciliation("session-1", "request-1", 1_000)).resolves.toBeDefined();
        });

        it("releaseReconciliationClaim is a harmless no-op for a token that never held any claim", async () => {
            const log = new InMemorySpinOperationLog();
            const token = await log.tryClaimForReconciliation("session-1", "request-1", 10_000);

            await log.releaseReconciliationClaim("session-1", "request-1", "some-other-token");

            // The real owner's claim is untouched.
            await expect(log.tryClaimForReconciliation("session-1", "request-1", 10_000)).resolves.toBeUndefined();
            await log.releaseReconciliationClaim("session-1", "request-1", token as string);
            await expect(log.tryClaimForReconciliation("session-1", "request-1", 10_000)).resolves.toBeDefined();
        });
    });
});

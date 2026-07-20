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
});

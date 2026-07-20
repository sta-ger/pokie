import {
    InMemoryIdempotencyRepository,
    InMemorySpinOperationLog,
    PokieSessionState,
    SessionRepository,
    SessionVersionConflictError,
    SpinCommandResult,
    SpinOperationRecord,
    SpinReconciliationService,
    TransactionalWalletPort,
    VersionedSessionRepository,
    WalletTransactionInspecting,
    WalletTransactionStatus,
} from "pokie";

// A minimal TransactionalWalletPort with no WalletTransactionInspecting at all — the "reconciliation
// can't ask the wallet directly" baseline every no-inspection manual-recovery test needs.
class FakeNonInspectingWallet implements TransactionalWalletPort {
    public readonly reverseCalls: string[] = [];

    public getBalance(): Promise<number> {
        return Promise.resolve(0);
    }
    public setBalance(): Promise<void> {
        return Promise.resolve();
    }
    public debit(): Promise<number> {
        return Promise.resolve(0);
    }
    public credit(): Promise<number> {
        return Promise.resolve(0);
    }
    public reverse(_sessionId: string, transactionId: string): Promise<number> {
        this.reverseCalls.push(transactionId);
        return Promise.resolve(0);
    }
}

// A wallet whose getTransactionStatus() is entirely test-controlled via "statusFor" (defaults every
// unmentioned transactionId to "absent") — direct control over what reconciliation "sees" without
// having to simulate a full ledger.
class FakeInspectableWallet implements TransactionalWalletPort, WalletTransactionInspecting {
    public readonly statusFor = new Map<string, WalletTransactionStatus>();
    public readonly reverseCalls: string[] = [];

    public getBalance(): Promise<number> {
        return Promise.resolve(0);
    }
    public setBalance(): Promise<void> {
        return Promise.resolve();
    }
    public debit(): Promise<number> {
        return Promise.resolve(0);
    }
    public credit(): Promise<number> {
        return Promise.resolve(0);
    }
    public reverse(_sessionId: string, transactionId: string): Promise<number> {
        this.reverseCalls.push(transactionId);
        this.statusFor.set(transactionId, "reversed");
        return Promise.resolve(0);
    }
    public getTransactionStatus(_sessionId: string, transactionId: string): Promise<WalletTransactionStatus> {
        return Promise.resolve(this.statusFor.get(transactionId) ?? "absent");
    }
}

class FakeSessionRepository implements SessionRepository {
    public readonly saveCalls: {sessionId: string; state: PokieSessionState}[] = [];
    public load(): Promise<PokieSessionState | undefined> {
        return Promise.resolve(undefined);
    }
    public save(sessionId: string, state: PokieSessionState): Promise<void> {
        this.saveCalls.push({sessionId, state});
        return Promise.resolve();
    }
}

class FakeVersionedSessionRepository implements VersionedSessionRepository {
    public readonly saveVersionedCalls: {sessionId: string; state: PokieSessionState; expectedVersion: number}[] = [];
    public conflictOnNextSaveVersioned = false;

    public load(): Promise<PokieSessionState | undefined> {
        return Promise.resolve(undefined);
    }
    public save(): Promise<void> {
        return Promise.resolve();
    }
    public loadVersioned(): Promise<{state: PokieSessionState; version: number} | undefined> {
        return Promise.resolve(undefined);
    }
    public saveVersioned(sessionId: string, state: PokieSessionState, expectedVersion: number): Promise<number> {
        if (this.conflictOnNextSaveVersioned) {
            throw new SessionVersionConflictError(sessionId, expectedVersion, expectedVersion + 1);
        }
        this.saveVersionedCalls.push({sessionId, state, expectedVersion});
        return Promise.resolve(expectedVersion + 1);
    }
}

const previousState: PokieSessionState = {bet: 5, win: 0};
const newState: PokieSessionState = {bet: 5, win: 20};

// Every fixture record defaults to a comfortably-quiescent "updatedAt" (an hour in the past) so ordinary
// tests aren't accidentally subject to SpinReconciliationService's own quiescence window (see the
// dedicated "quiescence" describe block below for tests of that window itself).
const LONG_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function baseRecord(checkpoint: SpinOperationRecord["checkpoint"], overrides: Partial<SpinOperationRecord> = {}): SpinOperationRecord {
    return {
        sessionId: "session-1",
        requestId: "request-1",
        attemptId: "attempt-1",
        debitTransactionId: "request-1:attempt-1:debit",
        creditTransactionId: "request-1:attempt-1:credit",
        stakeAmount: 5,
        expectedVersion: undefined,
        checkpoint,
        startedAt: LONG_AGO,
        updatedAt: LONG_AGO,
        ...overrides,
    };
}

describe("SpinReconciliationService", () => {
    it("returns no-action-needed when no operation record exists", async () => {
        const wallet = new FakeNonInspectingWallet();
        const sessionRepository = new FakeSessionRepository();
        const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        const operationLog = new InMemorySpinOperationLog();
        const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

        const outcome = await service.reconcileOne("session-1", "request-1");

        expect(outcome).toMatchObject({status: "no-action-needed"});
    });

    describe("checkpoint at 'committed' — re-verified against idempotencyRepository directly, never trusted blindly", () => {
        it("returns already-committed when idempotencyRepository still holds the result — even with a checkpoint updated moments ago", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const cached: SpinCommandResult = {status: "played", sessionId: "session-1", requestId: "request-1", state: newState, credits: 995, win: 20};
            await idempotencyRepository.save("session-1", "request-1", cached);
            const operationLog = new InMemorySpinOperationLog();
            // Fresh updatedAt — "committed" is terminal, so it's never subject to the quiescence window
            // a live in-flight attempt could still be racing (see the "quiescence" describe block).
            await operationLog.record(baseRecord("committed", {updatedAt: new Date().toISOString()}));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "already-committed"});
        });

        it("backfills idempotencyRepository from the record's own capturedResult, and resumes, when the result is missing", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("committed", {capturedResult: {previousState, newState, win: 20, credits: 995}}));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "resumed", result: {status: "played", win: 20, credits: 995, requestId: "request-1"}});
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toMatchObject({status: "played", win: 20, credits: 995});
            expect(sessionRepository.saveCalls).toEqual([]); // never re-saves the session for an already-committed record
        });

        it("is manual-recovery-required — never a fresh spin — when the idempotency result is missing and there's no captured data to rebuild it from", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("committed")); // no capturedResult
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
        });

        it("is manual-recovery-required when the wallet no longer matches what 'committed' implies — never backfills a mismatched result", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "reversed");
            wallet.statusFor.set("request-1:attempt-1:credit", "reversed");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("committed", {capturedResult: {previousState, newState, win: 20, credits: 995}}));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toBeUndefined();
        });
    });

    it("returns no-action-needed and clears the record for a 'compensated' checkpoint — even with a checkpoint updated moments ago", async () => {
        const wallet = new FakeNonInspectingWallet();
        const sessionRepository = new FakeSessionRepository();
        const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        const operationLog = new InMemorySpinOperationLog();
        await operationLog.record(baseRecord("compensated", {updatedAt: new Date().toISOString()}));
        const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

        const outcome = await service.reconcileOne("session-1", "request-1");

        expect(outcome).toMatchObject({status: "no-action-needed"});
        await expect(operationLog.load("session-1", "request-1")).resolves.toBeUndefined();
    });

    // "started" and "debited" are resolved identically: neither checkpoint alone proves what happened
    // next (a crash can land after the wallet call already succeeded but before the matching checkpoint
    // write does) — see SpinReconciliationService's own doc comment. In particular, "started" is no
    // longer trusted as proof the debit never applied.
    describe.each(["started" as const, "debited" as const])("checkpoint stuck at '%s'", (checkpoint) => {
        it("is always manual-recovery-required when the wallet doesn't support transaction inspection", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord(checkpoint));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
            expect(wallet.reverseCalls).toEqual([]); // never guessed at
        });

        it("returns no-action-needed and clears the record when inspection confirms neither the debit nor the credit ever applied", async () => {
            const wallet = new FakeInspectableWallet(); // statusFor left empty -> everything defaults to "absent"
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord(checkpoint));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "no-action-needed"});
            expect(wallet.reverseCalls).toEqual([]); // nothing was applied — nothing to reverse
            await expect(operationLog.load("session-1", "request-1")).resolves.toBeUndefined();
        });

        it("reverses the debit and clears the record when inspection confirms the debit applied but the credit never did", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "applied");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord(checkpoint));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "reversed"});
            expect(wallet.reverseCalls).toEqual(["request-1:attempt-1:debit"]);
            await expect(operationLog.load("session-1", "request-1")).resolves.toBeUndefined();
        });

        it("is idempotent — reconciling the same stuck record twice reverses only once in effect", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "applied");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord(checkpoint));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const first = await service.reconcileOne("session-1", "request-1");
            // Record is now cleared — a second reconcileOne() call for the same (sessionId, requestId)
            // finds nothing left to do, exactly as if this were the first time it were ever called.
            const second = await service.reconcileOne("session-1", "request-1");

            expect(first).toMatchObject({status: "reversed"});
            expect(second).toMatchObject({status: "no-action-needed"});
        });

        it("is manual-recovery-required when the wallet reports the credit as applied — checkpoint and reality disagree", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "applied");
            wallet.statusFor.set("request-1:attempt-1:credit", "applied");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord(checkpoint));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
            expect(wallet.reverseCalls).toEqual([]); // never reversed a debit whose credit actually landed
        });
    });

    describe("checkpoint at 'settled' or 'session-saved' — resuming from the captured result", () => {
        it("persists the session state and the idempotency result, never re-playing, for a 'settled' record", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("settled", {
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({
                status: "resumed",
                result: {status: "played", sessionId: "session-1", requestId: "request-1", win: 20, credits: 995, state: newState},
            });
            expect(sessionRepository.saveCalls).toEqual([{sessionId: "session-1", state: newState}]);
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toMatchObject({status: "played", win: 20});
            await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "committed"});
        });

        it("persists only the missing idempotency result — never re-saves the session — for a 'session-saved' record", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("session-saved", {
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "resumed", result: {status: "played", win: 20, credits: 995}});
            expect(sessionRepository.saveCalls).toEqual([]); // the session was already saved — never touched again
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toMatchObject({status: "played"});
        });

        it("saves via saveVersioned() using the record's own expectedVersion when the repository is versioned", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeVersionedSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("settled", {
                    expectedVersion: 3,
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "resumed", result: {version: 4}});
            expect(sessionRepository.saveVersionedCalls).toEqual([{sessionId: "session-1", state: newState, expectedVersion: 3}]);
        });

        it("carries the newly-assigned version forward onto the terminal committed record, so a later backfill also gets it right", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeVersionedSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("settled", {
                    expectedVersion: 3,
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            await service.reconcileOne("session-1", "request-1");

            await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({
                checkpoint: "committed",
                capturedResult: {newVersion: 4},
            });
        });

        it("is manual-recovery-required, never a silent overwrite, when resuming hits a SessionVersionConflictError", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeVersionedSessionRepository();
            sessionRepository.conflictOnNextSaveVersioned = true;
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("settled", {
                    expectedVersion: 3,
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toBeUndefined();
        });

        it("is manual-recovery-required when capturedResult is unexpectedly missing (invariant guard)", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("settled"));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
        });

        it("is manual-recovery-required when wallet inspection shows the wallet is no longer fully settled — a same-process compensation partially reversed it without also restoring the session", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "reversed");
            wallet.statusFor.set("request-1:attempt-1:credit", "reversed");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("session-saved", {
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "manual-recovery-required"});
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toBeUndefined();
        });
    });

    describe("quiescence — never acting on a non-terminal record that might still be a live attempt", () => {
        it("defers a 'debited' record updated moments ago, without touching the wallet", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "applied"); // would otherwise be reversed
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("debited", {updatedAt: new Date().toISOString()}));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "deferred"});
            expect(wallet.reverseCalls).toEqual([]);
            await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "debited"}); // untouched
        });

        it("defers a 'settled' record updated moments ago, without touching the session or idempotency stores", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(
                baseRecord("settled", {
                    updatedAt: new Date().toISOString(),
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "deferred"});
            expect(sessionRepository.saveCalls).toEqual([]);
            await expect(idempotencyRepository.load("session-1", "request-1")).resolves.toBeUndefined();
        });

        it("proceeds normally once a record has been quiescent for at least the configured window", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "applied");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            const recordedAt = new Date(2026, 0, 1, 12, 0, 0);
            await operationLog.record(baseRecord("debited", {updatedAt: recordedAt.toISOString()}));
            const justPastQuiescence = new Date(recordedAt.getTime() + 5_000);
            const service = new SpinReconciliationService(
                wallet,
                sessionRepository,
                idempotencyRepository,
                operationLog,
                5_000, // minimumQuiescenceMs
                () => justPastQuiescence,
            );

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "reversed"});
        });

        it("uses a caller-configured quiescence window instead of the default", async () => {
            const wallet = new FakeInspectableWallet();
            wallet.statusFor.set("request-1:attempt-1:debit", "applied");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            const recordedAt = new Date(2026, 0, 1, 12, 0, 0);
            await operationLog.record(baseRecord("debited", {updatedAt: recordedAt.toISOString()}));
            // 60s window; "now" is only 5s after updatedAt — still inside the window despite being past
            // the library's own 30s default, proving the configured value (not the default) is what's honored.
            const stillWithinConfiguredWindow = new Date(recordedAt.getTime() + 5_000);
            const service = new SpinReconciliationService(
                wallet,
                sessionRepository,
                idempotencyRepository,
                operationLog,
                60_000,
                () => stillWithinConfiguredWindow,
            );

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome).toMatchObject({status: "deferred"});
        });

        it("never defers terminal 'committed'/'compensated' records regardless of how recently they were updated", async () => {
            const wallet = new FakeNonInspectingWallet();
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("compensated", {updatedAt: new Date().toISOString()}));
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcome = await service.reconcileOne("session-1", "request-1");

            expect(outcome.status).not.toBe("deferred");
        });
    });

    describe("reconcileAll()", () => {
        it("sweeps every incomplete record and reconciles each one", async () => {
            const wallet = new FakeInspectableWallet(); // statusFor left empty -> request-1's legs default to "absent"
            wallet.statusFor.set("request-2:attempt-1:debit", "applied");
            wallet.statusFor.set("request-2:attempt-1:credit", "applied");
            const sessionRepository = new FakeSessionRepository();
            const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record(baseRecord("started", {requestId: "request-1"}));
            await operationLog.record(
                baseRecord("session-saved", {
                    requestId: "request-2",
                    debitTransactionId: "request-2:attempt-1:debit",
                    creditTransactionId: "request-2:attempt-1:credit",
                    capturedResult: {previousState, newState, win: 20, credits: 995},
                }),
            );
            const service = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog);

            const outcomes = await service.reconcileAll();

            expect(outcomes).toHaveLength(2);
            expect(outcomes.find((outcome) => outcome.requestId === "request-1")).toMatchObject({status: "no-action-needed"});
            expect(outcomes.find((outcome) => outcome.requestId === "request-2")).toMatchObject({status: "resumed"});
            await expect(operationLog.listIncomplete()).resolves.toEqual([]);
        });
    });
});

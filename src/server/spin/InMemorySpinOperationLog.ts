import type {SpinOperationLeasing} from "./SpinOperationLeasing.js";
import type {SpinOperationLog} from "./SpinOperationLog.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";

const TERMINAL_CHECKPOINTS: ReadonlySet<string> = new Set(["committed", "compensated"]);

// Default SpinOperationLog: records live only in a Map for the lifetime of the process, same tradeoff as
// InMemoryWallet/InMemoryIdempotencyRepository/InMemorySessionRepository — a restart forgets every
// record. See SpinOperationLog's own doc comment for what that means for a deployment that actually needs
// crash recovery to work.
//
// Also implements SpinOperationLeasing: a second in-memory Map of claim expiry timestamps, keyed the same
// way as "records". This is a real, race-free claim within one process — JS's own single-threaded,
// run-to-completion execution model already makes "check the current claim, then set a new one" atomic
// for any two same-process callers, with no separate locking needed — but it's exactly as
// process-local/non-durable as everything else about this class: it gives no cross-process guarantee at
// all, which is the honest limit of an in-memory implementation (see SpinOperationLeasing's own doc
// comment for what a durable implementation would need to do differently).
export class InMemorySpinOperationLog implements SpinOperationLog, SpinOperationLeasing {
    private readonly records = new Map<string, SpinOperationRecord>();
    private readonly claimExpiryMs = new Map<string, number>();

    public record(record: SpinOperationRecord): Promise<void> {
        this.records.set(this.keyFor(record.sessionId, record.requestId), record);
        return Promise.resolve();
    }

    public load(sessionId: string, requestId: string): Promise<SpinOperationRecord | undefined> {
        return Promise.resolve(this.records.get(this.keyFor(sessionId, requestId)));
    }

    public delete(sessionId: string, requestId: string): Promise<void> {
        this.records.delete(this.keyFor(sessionId, requestId));
        return Promise.resolve();
    }

    public listIncomplete(): Promise<readonly SpinOperationRecord[]> {
        return Promise.resolve([...this.records.values()].filter((record) => !TERMINAL_CHECKPOINTS.has(record.checkpoint)));
    }

    public tryClaimForReconciliation(sessionId: string, requestId: string, leaseDurationMs: number): Promise<boolean> {
        const key = this.keyFor(sessionId, requestId);
        const now = Date.now();
        const existingExpiry = this.claimExpiryMs.get(key);
        if (existingExpiry !== undefined && existingExpiry > now) {
            return Promise.resolve(false);
        }
        this.claimExpiryMs.set(key, now + leaseDurationMs);
        return Promise.resolve(true);
    }

    public releaseReconciliationClaim(sessionId: string, requestId: string): Promise<void> {
        this.claimExpiryMs.delete(this.keyFor(sessionId, requestId));
        return Promise.resolve();
    }

    private keyFor(sessionId: string, requestId: string): string {
        return `${sessionId}\0${requestId}`;
    }
}

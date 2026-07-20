import crypto from "crypto";
import type {SpinOperationLeasing} from "./SpinOperationLeasing.js";
import type {SpinOperationLog} from "./SpinOperationLog.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";

const TERMINAL_CHECKPOINTS: ReadonlySet<string> = new Set(["committed", "compensated"]);

type Claim = {
    readonly token: string;
    readonly expiresAtMs: number;
};

// Default SpinOperationLog: records live only in a Map for the lifetime of the process, same tradeoff as
// InMemoryWallet/InMemoryIdempotencyRepository/InMemorySessionRepository — a restart forgets every
// record. See SpinOperationLog's own doc comment for what that means for a deployment that actually needs
// crash recovery to work.
//
// Also implements SpinOperationLeasing: a second in-memory Map of {token, expiresAtMs} claims, keyed the
// same way as "records", with the fencing behavior that interface's own doc comment requires — every
// renew/release call is checked against the current claim's own token, never just "is there a claim
// here." JS's own single-threaded, run-to-completion execution model already makes each individual
// check-then-act call atomic for any two same-process callers, with no separate locking needed — but this
// is exactly as process-local/non-durable as everything else about this class: it gives no cross-process
// guarantee at all, which is the honest limit of an in-memory implementation (see SpinOperationLeasing's
// own doc comment for what a durable implementation would need to do differently).
export class InMemorySpinOperationLog implements SpinOperationLog, SpinOperationLeasing {
    private readonly records = new Map<string, SpinOperationRecord>();
    private readonly claims = new Map<string, Claim>();
    private readonly now: () => Date;

    // "now" is injectable purely for deterministic lease-expiry tests — production code should never pass
    // this, the same convention StakeEngineExporter's own injectable "now" already uses.
    constructor(now: () => Date = () => new Date()) {
        this.now = now;
    }

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

    public tryClaimForReconciliation(sessionId: string, requestId: string, leaseDurationMs: number): Promise<string | undefined> {
        const key = this.keyFor(sessionId, requestId);
        const nowMs = this.now().getTime();
        const existing = this.claims.get(key);
        if (existing !== undefined && existing.expiresAtMs > nowMs) {
            return Promise.resolve(undefined);
        }
        const token = crypto.randomUUID();
        this.claims.set(key, {token, expiresAtMs: nowMs + leaseDurationMs});
        return Promise.resolve(token);
    }

    public renewReconciliationClaim(sessionId: string, requestId: string, ownerToken: string, leaseDurationMs: number): Promise<boolean> {
        const key = this.keyFor(sessionId, requestId);
        const nowMs = this.now().getTime();
        const existing = this.claims.get(key);
        if (existing === undefined || existing.token !== ownerToken || existing.expiresAtMs <= nowMs) {
            // Expired, released, superseded by someone else's claim, or never held in the first place —
            // every one of these is "no longer yours," never renewed regardless of which it was.
            return Promise.resolve(false);
        }
        this.claims.set(key, {token: ownerToken, expiresAtMs: nowMs + leaseDurationMs});
        return Promise.resolve(true);
    }

    public releaseReconciliationClaim(sessionId: string, requestId: string, ownerToken: string): Promise<void> {
        const key = this.keyFor(sessionId, requestId);
        const existing = this.claims.get(key);
        if (existing !== undefined && existing.token === ownerToken) {
            this.claims.delete(key);
        }
        // Else: a stale/foreign token — deliberately left untouched, never deletes someone else's active
        // claim (see SpinOperationLeasing's own doc comment on why this is the whole point of fencing).
        return Promise.resolve();
    }

    private keyFor(sessionId: string, requestId: string): string {
        return `${sessionId}\0${requestId}`;
    }
}

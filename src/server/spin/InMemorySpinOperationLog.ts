import type {SpinOperationLog} from "./SpinOperationLog.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";

const TERMINAL_CHECKPOINTS: ReadonlySet<string> = new Set(["committed", "compensated"]);

// Default SpinOperationLog: records live only in a Map for the lifetime of the process, same tradeoff as
// InMemoryWallet/InMemoryIdempotencyRepository/InMemorySessionRepository — a restart forgets every
// record. See SpinOperationLog's own doc comment for what that means for a deployment that actually needs
// crash recovery to work.
export class InMemorySpinOperationLog implements SpinOperationLog {
    private readonly records = new Map<string, SpinOperationRecord>();

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

    private keyFor(sessionId: string, requestId: string): string {
        return `${sessionId}\0${requestId}`;
    }
}

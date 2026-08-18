import type {PreGeneratedRoundRecord} from "./PreGeneratedRoundRecord.js";
import type {PreGeneratedRoundRecording} from "./PreGeneratedRoundRecording.js";

// Default development recorder.  Production callers can supply a durable PreGeneratedRoundRecording
// through PokieDevServerOptions; this in-memory implementation preserves the existing dev-server
// process-lifetime tradeoff while still enforcing requestId/roundId idempotency.
export class InMemoryPreGeneratedRoundRecorder<T extends string | number = string> implements PreGeneratedRoundRecording<T> {
    private readonly recordsBySessionAndRoundId = new Map<string, PreGeneratedRoundRecord<T>>();
    private readonly latestBySession = new Map<string, PreGeneratedRoundRecord<T>>();

    public record(record: PreGeneratedRoundRecord<T>): Promise<PreGeneratedRoundRecord<T>> {
        const key = this.key(record.sessionId, record.roundId);
        const existing = this.recordsBySessionAndRoundId.get(key);
        if (existing !== undefined) {
            return Promise.resolve(existing);
        }

        this.recordsBySessionAndRoundId.set(key, record);
        const latest = this.latestBySession.get(record.sessionId);
        if (latest === undefined || record.round > latest.round) {
            this.latestBySession.set(record.sessionId, record);
        }
        return Promise.resolve(record);
    }

    public load(sessionId: string, roundId: string): Promise<PreGeneratedRoundRecord<T> | undefined> {
        return Promise.resolve(this.recordsBySessionAndRoundId.get(this.key(sessionId, roundId)));
    }

    public loadLatest(sessionId: string): Promise<PreGeneratedRoundRecord<T> | undefined> {
        return Promise.resolve(this.latestBySession.get(sessionId));
    }

    private key(sessionId: string, roundId: string): string {
        return JSON.stringify([sessionId, roundId]);
    }
}

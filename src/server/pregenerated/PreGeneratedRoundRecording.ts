import type {PreGeneratedRoundRecord} from "./PreGeneratedRoundRecord.js";

// The outcome-library counterpart to a round recorder.  Implementations may persist records durably;
// record() is idempotent by (sessionId, roundId), so a requestId retry can return its original replay
// identity without creating a second audit record.
export interface PreGeneratedRoundRecording<T extends string | number = string> {
    record(record: PreGeneratedRoundRecord<T>): Promise<PreGeneratedRoundRecord<T>>;

    load(sessionId: string, roundId: string): Promise<PreGeneratedRoundRecord<T> | undefined>;

    loadLatest(sessionId: string): Promise<PreGeneratedRoundRecord<T> | undefined>;
}

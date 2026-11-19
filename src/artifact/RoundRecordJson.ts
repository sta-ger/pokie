import type {RoundRecord} from "./RoundRecord.js";

// The canonical JSON projection of a RoundRecord, stamped with its own content hash (see
// computeRoundRecordHash) — what PokieJsonRoundRecordProjector produces, and what a round-trip
// (JSON.stringify → JSON.parse → re-hash) is expected to reproduce byte-for-hash-identically.
export type RoundRecordJson<T extends string | number = string> = RoundRecord<T> & {
    readonly hash: string;
};

import type {RoundRecord} from "./RoundRecord.js";

// A RoundRecord is transport/storage-agnostic; a projector turns it into one concrete representation.
// PokieJsonRoundRecordProjector is the standard, ready-made one (canonical JSON + content hash) — implement
// this directly for a different representation (e.g. a flat CSV row for a data warehouse) without touching
// RoundRecord itself.
export interface RoundRecordProjector<T extends string | number, TOutput> {
    project(artifact: RoundRecord<T>): TOutput;
}

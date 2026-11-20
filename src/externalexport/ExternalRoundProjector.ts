import type {JsonObject} from "../json/JsonValue.js";
import type {RoundRecord} from "../roundrecord/RoundRecord.js";

// One target's own RoundRecord -> external-format projection. Deliberately not a reuse of the generic
// RoundRecordProjector<T, TOutput> (see RoundRecordProjector.ts) — every ExternalExportTarget's own
// generator needs a stable, JSON-safe output (see toCanonicalJson) it can embed directly into whatever files or
// wire payloads it produces, so the output type is fixed to JsonObject here rather than left fully generic.
//
// An ExternalFileGenerator must always go through its target's own ExternalRoundProjector to turn a
// RoundRecord into output — never recompute a round's screen/wins/events itself from scratch. This is the
// same "no second calculation path" rule RoundRecord's own doc comment states, extended to this SDK's own
// generation step: whatever a projector returns is by construction consistent with the RoundRecord it was
// given, so a generator that goes through it can never silently disagree with the canonical record.
export interface ExternalRoundProjector<T extends string | number = string> {
    project(record: RoundRecord<T>): JsonObject;
}

import {sha256} from "../json/internal/sha256.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {RoundRecord} from "./RoundRecord.js";

// A sha256 hash of a RoundRecord's content, stable regardless of the source object's own key order — via
// toCanonicalJson, the one canonical serializer this also shares with PokieJsonRoundRecordProjector, so a
// hash and its own JSON projection can never silently disagree on what counts as "valid" or how it's ordered.
// Fails fast (propagates InvalidJsonValueError) on anything that isn't valid canonical JSON, same as the
// projector — a RoundRecord built via buildRoundRecord is already guaranteed JSON-safe, so this only
// actually throws for a hand-crafted record that bypassed that guarantee.
export function computeRoundRecordHash<T extends string | number = string>(
    record: RoundRecord<T>,
): string {
    return `sha256:${sha256(JSON.stringify(toCanonicalJson(record)))}`;
}

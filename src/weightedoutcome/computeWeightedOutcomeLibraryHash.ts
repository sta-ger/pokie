import crypto from "crypto";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";

// A sha256 hash of a WeightedOutcomeLibrary's content, stable regardless of the source object's own key order —
// via toCanonicalJson, the same canonical serializer computeRoundArtifactHash and PokieJsonRoundArtifactProjector
// already share, now also shared by PokieJsonWeightedOutcomeLibraryProjector, so a hash and its own JSON
// projection can never silently disagree on what counts as "valid" or how it's ordered. Fails fast (propagates
// InvalidJsonValueError) on anything that isn't valid canonical JSON — a library built via
// buildWeightedOutcomeLibrary is already guaranteed JSON-safe, so this only actually throws for a hand-crafted
// library that bypassed that guarantee.
export function computeWeightedOutcomeLibraryHash<T extends string | number = string>(
    library: WeightedOutcomeLibrary<T>,
): string {
    return `sha256:${crypto.createHash("sha256").update(JSON.stringify(toCanonicalJson(library))).digest("hex")}`;
}

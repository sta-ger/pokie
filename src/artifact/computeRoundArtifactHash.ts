import crypto from "crypto";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {RoundArtifact} from "./RoundArtifact.js";

// A sha256 hash of a RoundArtifact's content, stable regardless of the source object's own key order — via
// toCanonicalJson, the one canonical serializer this also shares with PokieJsonRoundArtifactProjector, so a
// hash and its own JSON projection can never silently disagree on what counts as "valid" or how it's ordered.
// Fails fast (propagates InvalidJsonValueError) on anything that isn't valid canonical JSON, same as the
// projector — a RoundArtifact built via buildRoundArtifact is already guaranteed JSON-safe, so this only
// actually throws for a hand-crafted artifact that bypassed that guarantee.
export function computeRoundArtifactHash<T extends string | number = string>(
    artifact: RoundArtifact<T>,
): string {
    return `sha256:${crypto.createHash("sha256").update(JSON.stringify(toCanonicalJson(artifact))).digest("hex")}`;
}

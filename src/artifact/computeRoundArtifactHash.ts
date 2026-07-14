import crypto from "crypto";
import type {RoundArtifact} from "./RoundArtifact.js";

// A sha256 hash of a RoundArtifact's content, stable regardless of the source object's own key order (own keys,
// and any nested arbitrary Record<string, unknown> blob's keys — win/step "metadata", "debug", feature event
// "data" — are all sorted before hashing) — NOT `JSON.stringify(artifact)` directly. Array order is left as-is
// everywhere (steps, wins, screen, winning positions, ...): unlike a plain object's own key order, it's always
// semantically meaningful here. Used both standalone and by PokieJsonRoundArtifactProjector to stamp its output.
export function computeRoundArtifactHash<T extends string | number | symbol = string>(
    artifact: RoundArtifact<T>,
): string {
    return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalizeForHashing(artifact))).digest("hex")}`;
}

function canonicalizeForHashing(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalizeForHashing);
    }
    if (value !== null && typeof value === "object") {
        const canonical: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            canonical[key] = canonicalizeForHashing((value as Record<string, unknown>)[key]);
        }
        return canonical;
    }
    return value;
}

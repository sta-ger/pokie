import {InvalidJsonValueError} from "../../json/InvalidJsonValueError.js";
import type {JsonObject} from "../../json/JsonValue.js";
import {toCanonicalJson} from "../../json/toCanonicalJson.js";
import {RoundArtifactBuildError} from "../RoundArtifactBuildError.js";

// Turns an arbitrary caller-supplied blob (win/step "metadata", step/round "debug", feature event "data") into
// a canonical, deeply-copied, JSON-safe JsonObject in one pass: toCanonicalJson both validates it (fails fast,
// as RoundArtifactBuildError, on anything non-JSON-safe — NaN/Infinity, bigint, symbol, function, undefined,
// circular references) and rebuilds it as fresh objects/arrays, so the result shares no references with the
// caller's original value (see buildRoundArtifact/buildRoundStepArtifact's own isolation guarantee).
export function canonicalizeJsonField(fieldPath: string, value: Record<string, unknown>): JsonObject {
    let canonical;
    try {
        canonical = toCanonicalJson(value);
    } catch (error) {
        const reason = error instanceof InvalidJsonValueError ? error.message : String(error);
        throw new RoundArtifactBuildError("round-artifact-not-json-safe", `${fieldPath} is not JSON-safe: ${reason}`);
    }
    if (canonical === null || typeof canonical !== "object" || Array.isArray(canonical)) {
        throw new RoundArtifactBuildError("round-artifact-not-json-safe", `${fieldPath} must be a plain object.`);
    }
    return canonical;
}

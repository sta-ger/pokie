import {InvalidJsonValueError} from "./InvalidJsonValueError.js";
import type {JsonValue} from "./JsonValue.js";

// The one canonical serializer behind both computeRoundArtifactHash and PokieJsonRoundArtifactProjector (and
// anything else in POKIE that needs a stable, hashable JSON form) — so a hash and its own JSON projection can
// never silently disagree on what counts as "valid" or how it's ordered.
//
// Deeply validates + canonicalizes an arbitrary value: plain object keys are sorted (two values with the same
// content but different construction/insertion order canonicalize identically — the whole point for stable
// hashing), while array order is always left exactly as-is (semantically meaningful everywhere it appears in a
// RoundArtifact — steps, wins, screen rows, winning positions, ...). Fails fast — throws InvalidJsonValueError —
// on anything JSON can't represent losslessly: NaN/Infinity, bigint, symbol, function, undefined, and circular
// references, rather than silently coercing them the way `JSON.stringify` does (dropping undefined/functions,
// turning NaN/Infinity into `null`, throwing a generic TypeError on cycles with no indication of where).
export function toCanonicalJson(value: unknown, path = "", seen: Set<object> = new Set()): JsonValue {
    if (value === null) {
        return null;
    }

    const type = typeof value;
    if (type === "string" || type === "boolean") {
        return value as string | boolean;
    }
    if (type === "number") {
        if (!Number.isFinite(value)) {
            throw new InvalidJsonValueError(path, `${String(value)} is not a finite number`);
        }
        return value as number;
    }
    if (type === "undefined") {
        throw new InvalidJsonValueError(path, "undefined is not a valid JSON value");
    }
    if (type === "bigint") {
        throw new InvalidJsonValueError(path, "a bigint is not a valid JSON value");
    }
    if (type === "symbol") {
        throw new InvalidJsonValueError(path, "a symbol is not a valid JSON value");
    }
    if (type === "function") {
        throw new InvalidJsonValueError(path, "a function is not a valid JSON value");
    }

    const obj = value as object;
    if (seen.has(obj)) {
        throw new InvalidJsonValueError(path, "circular reference");
    }
    seen.add(obj);
    try {
        if (Array.isArray(obj)) {
            return obj.map((element, index) => toCanonicalJson(element, `${path}[${index}]`, seen));
        }

        const canonical: Record<string, JsonValue> = {};
        for (const key of Object.keys(obj).sort()) {
            canonical[key] = toCanonicalJson(
                (obj as Record<string, unknown>)[key],
                path.length > 0 ? `${path}.${key}` : key,
                seen,
            );
        }
        return canonical;
    } finally {
        seen.delete(obj);
    }
}

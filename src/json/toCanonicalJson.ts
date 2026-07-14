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
// turning NaN/Infinity into `null`, throwing a generic TypeError on cycles with no indication of where). Only
// plain objects (object literals, `Object.create(null)`, or `JSON.parse` output — prototype is `Object.prototype`
// or `null`) and dense arrays are accepted as containers: a `Date`/`Map`/`Set`/`RegExp`/class instance/any other
// custom-prototype object, a symbol-keyed own property, or a sparse array (a hole from `[1, , 3]`) all throw too
// — none of those round-trip through JSON the way the caller probably expects (a `Date` silently becomes a
// string, a `Map`/`Set` silently becomes `{}`, a hole silently becomes `null`), so this rejects them instead of
// guessing.
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
            for (let index = 0; index < obj.length; index++) {
                if (!(index in obj)) {
                    throw new InvalidJsonValueError(path, "a sparse array (with holes) is not a valid JSON value");
                }
            }
            return obj.map((element, index) => toCanonicalJson(element, `${path}[${index}]`, seen));
        }

        if (!isPlainObject(obj)) {
            throw new InvalidJsonValueError(path, `${describe(obj)} is not a valid JSON value (only plain objects are)`);
        }

        const symbolKeys = Object.getOwnPropertySymbols(obj);
        if (symbolKeys.length > 0) {
            throw new InvalidJsonValueError(path, "a symbol-keyed property is not a valid JSON value");
        }

        // Object.create(null) rather than `{}`: a plain `{}` inherits Object.prototype's "__proto__" accessor, so
        // `canonical["__proto__"] = ...` for a source key literally named "__proto__" would silently reassign the
        // new object's own prototype instead of creating an own data property — losing the key entirely (and, had
        // the value been attacker-controlled, a textbook prototype-pollution vector). A null-prototype object has
        // no such accessor to intercept the assignment, so every key — including "__proto__" — becomes a real own
        // property.
        const canonical: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
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

function isPlainObject(obj: object): boolean {
    const proto = Reflect.getPrototypeOf(obj);
    return proto === null || proto === Object.prototype;
}

function describe(obj: object): string {
    const proto = Reflect.getPrototypeOf(obj) as {constructor?: {name?: string}} | null;
    const name = proto?.constructor?.name;
    return name ? `a ${name}` : "an object with a non-standard prototype";
}

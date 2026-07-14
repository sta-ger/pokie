// Recursively Object.freezes a value and everything reachable from it. Not cycle-safe by itself — safe to use
// here only because every RoundArtifact/RoundStepArtifact this library builds is tree-shaped by construction:
// arbitrary caller-supplied blobs (metadata/debug/feature event data) are always routed through
// canonicalizeJsonField (backed by toCanonicalJson, which does its own cycle detection and rejects cycles
// before this ever runs) rather than frozen as-is.
export function deepFreeze<T>(value: T): T {
    if (value === null || (typeof value !== "object" && typeof value !== "function") || Object.isFrozen(value)) {
        return value;
    }
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value as object)) {
        deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    return value;
}

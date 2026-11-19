/**
 * Object.keys/Object.values always expose string keys, even when a Record is
 * keyed by a generic string | number | symbol type. The cast is the single
 * boundary for that runtime invariant; callers keep their value type.
 */
export function recordValues<V>(record: Record<PropertyKey, V>): V[] {
    return Object.values(record as Record<string, V>);
}

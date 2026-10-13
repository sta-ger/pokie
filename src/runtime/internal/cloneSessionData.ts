/** Detach JSON session data in the current realm, retaining invalid primitives for validation.
 * Unlike JSON round-tripping this does not turn NaN into null or discard undefined fields.
 */
export function cloneSessionData<T>(value: T): T {
    const copies = new Map<object, object>();
    const copy = (item: unknown): unknown => {
        if (typeof item !== "object" || item === null) return item;
        const existing = copies.get(item);
        if (existing !== undefined) return existing;
        const result: unknown[] | Record<string, unknown> = Array.isArray(item) ? [] : {};
        copies.set(item, result);
        for (const [key, child] of Object.entries(item)) {
            Reflect.defineProperty(result, key, {value: copy(child), enumerable: true, configurable: true, writable: true});
        }
        return result;
    };
    return copy(value) as T;
}

/** Strict detached JSON copying. Never invokes accessors or toJSON; bounds depth and size. */
export function detachPackageModelData(value: unknown): unknown {
    const ancestors = new Set<object>();
    let nodes = 0;
    const copy = (input: unknown, field: string, depth: number): unknown => {
        if (++nodes > 1000000 || depth > 100) throw new Error(`${field}: metadata exceeds extraction limits`);
        if (input === null || typeof input === "string" || typeof input === "boolean") return input;
        if (typeof input === "number" && Number.isFinite(input)) return input;
        if (typeof input !== "object" || input === null) throw new Error(`${field}: unsupported JSON value`);
        if (ancestors.has(input)) throw new Error(`${field}: cyclic metadata`);
        const array = Array.isArray(input);
        const prototype = Reflect.getPrototypeOf(input);
        if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) throw new Error(`${field}: unsupported object prototype`);
        ancestors.add(input);
        const result: Record<string, unknown> | unknown[] = array ? [] : {};
        const descriptors = Object.getOwnPropertyDescriptors(input);
        if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) throw new Error(`${field}: symbol property`);
        if (array) {
            for (let i = 0; i < (input as unknown[]).length; i++) if (!descriptors[String(i)]) throw new Error(`${field}: sparse collection`);
        }
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (array && key === "length") continue;
            if (["__proto__", "constructor", "prototype", "toJSON"].includes(key)) throw new Error(`${field}.${key}: unsafe property`);
            if (!descriptor.enumerable || !Reflect.apply(Object.prototype.hasOwnProperty, descriptor, ["value"])) throw new Error(`${field}.${key}: accessor or hidden metadata`);
            if (array && (!(/^(0|[1-9]\d*)$/).test(key) || Number(key) >= (input as unknown[]).length)) throw new Error(`${field}.${key}: malformed collection`);
            Reflect.set(result, key, copy(descriptor.value, `${field}.${key}`, depth + 1));
        }
        ancestors.delete(input);
        return result;
    };
    return copy(value, "$", 0);
}

import type {OptimizationPolicy, OptimizationScalar} from "../OptimizationPolicy.js";

export function pointerParts(pointer: string): string[] {
    return pointer
        .slice(1)
        .split("/")
        .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}
export function at(value: unknown, pointer: string): unknown {
    let current = value;
    for (const key of pointerParts(pointer)) {
        if (!current || typeof current !== "object" || !Reflect.apply(Object.prototype.hasOwnProperty, current, [key])) throw new Error(`Unknown policy path ${pointer}.`);
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}
export function put(value: unknown, pointer: string, scalar: OptimizationScalar): void {
    const parts = pointerParts(pointer);
    const key = parts.pop()!;
    let current = value as Record<string, unknown>;
    for (const part of parts) current = current[part] as Record<string, unknown>;
    current[key] = scalar;
}
export function checkPolicyPaths(model: unknown, policy: OptimizationPolicy, writable: readonly string[]): void {
    for (const tunable of policy.tunables) {
        at(model, tunable.path);
        if (!writable.includes(tunable.path)) throw new Error(`Unsupported tunable ${tunable.path}; this adapter permits only declared numeric leaves.`);
    }
    for (const lock of policy.locks) at(model, lock);
    for (const fixed of policy.constraints?.fixed ?? []) at(model, fixed.path);
    for (const sum of policy.constraints?.sums ?? []) for (const field of sum.paths) at(model, field);
    for (const count of policy.constraints?.counts ?? []) {
        const value = at(model, count.path);
        if (!Array.isArray(value) && (!value || typeof value !== "object")) throw new Error(`Count path ${count.path} must identify ${count.scope}.`);
        if (
            (count.scope === "outcomes" && !count.path.endsWith("/outcomes")) ||
            (count.scope === "variants" && !count.path.endsWith("/variants")) ||
            (count.scope === "symbols" &&
                !count.path.endsWith("/symbols") &&
                !(/^\/reelStrips\/[0-9]+$/).test(count.path))
        ) throw new Error(`Count scope ${count.scope} does not match ${count.path}.`);
    }
}
export function constraintsHold(model: unknown, policy: OptimizationPolicy): boolean {
    for (const fixed of policy.constraints?.fixed ?? []) if (at(model, fixed.path) !== fixed.value) return false;
    for (const sum of policy.constraints?.sums ?? []) {
        const values = sum.paths.map((field) => at(model, field));
        if (typeof sum.value === "string") {
            if (
                values.some((value) => typeof value !== "string") ||
                values.reduce<bigint>((total, value) => total + BigInt(value as string), BigInt(0)) !==
                    BigInt(sum.value)
            ) return false;
        } else if (
            values.some((value) => typeof value !== "number") ||
            values.reduce<number>((total, value) => total + Number(value), 0) !== sum.value
        ) return false;
    }
    for (const count of policy.constraints?.counts ?? []) if (Object.keys(at(model, count.path) as object).length !== count.value) return false;
    return true;
}
export function assertOnlyTuned(before: unknown, after: unknown, policy: OptimizationPolicy, attempted?: unknown): void {
    for (const field of policy.tunables) {
        const value = at(after, field.path);
        if (!field.values.includes(value as OptimizationScalar) || (attempted !== undefined && value !== at(attempted, field.path))) throw new Error(`Serialized tunable differs from attempted selection: ${field.path}`);
    }
    const restored = structuredClone(after);
    for (const field of policy.tunables) put(restored, field.path, at(before, field.path) as OptimizationScalar);
    if (JSON.stringify(before) !== JSON.stringify(restored)) throw new Error("Native roundtrip changed an undeclared or locked field.");
    for (const lock of policy.locks) if (JSON.stringify(at(before, lock)) !== JSON.stringify(at(after, lock))) throw new Error(`Lock changed: ${lock}`);
    if (!constraintsHold(after, policy)) throw new Error("Serialized candidate violates fixed/count/sum constraints.");
}
export function paytablePaths(model: {paytable: Record<string, Record<string, number>>}): string[] {
    const escape = (s: string): string => s.replace(/~/g, "~0").replace(/\//g, "~1");
    return Object.entries(model.paytable).flatMap(([symbol, amounts]) =>
        Object.keys(amounts).map((count) => `/paytable/${escape(symbol)}/${escape(count)}`),
    );
}


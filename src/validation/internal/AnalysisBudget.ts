import type {AdvancedAnalysisLimits, AdvancedValidationOptions} from "../AdvancedModelValidation.js";

export class AnalysisStopped extends Error {
    constructor(public readonly reason: "budget-exhausted" | "cancelled", message: string) {
        super(message);
    }
}
export class AnalysisBudget {
    public readonly limits: AdvancedAnalysisLimits;
    public readonly work: AdvancedAnalysisLimits = {inputNodes: 0, outcomes: 0, states: 0, transitions: 0, depth: 0, evidenceNodes: 0, yieldEvery: 0};
    private ticks = 0;
    constructor(private readonly options: AdvancedValidationOptions = {}) {
        const proposed = options.limits;
        if (proposed !== undefined && (!proposed || typeof proposed !== "object" || Array.isArray(proposed) || ![Object.prototype, null].includes(Reflect.getPrototypeOf(proposed)))) throw new Error("Invalid analysis limits: expected a plain options object.");
        if (proposed && Reflect.ownKeys(proposed).some(key => typeof key !== "string" || !("value" in Reflect.getOwnPropertyDescriptor(proposed, key)!))) throw new Error("Invalid analysis limits: accessors and symbol keys are unsupported.");
        this.limits = {inputNodes: 100000, outcomes: 1000, states: 1000, transitions: 10000, depth: 256, evidenceNodes: 10000, yieldEvery: 128, ...proposed};
        for (const [key, value] of Object.entries(this.limits)) {
            if (!Reflect.apply(Object.prototype.hasOwnProperty, this.work, [key]) || !Number.isSafeInteger(value) || value < 1 || value > 10000000) throw new Error(`Invalid analysis limit ${key}: expected an integer in [1, 10000000].`);
        }
    }
    public check(): void {
        if (this.options.signal?.aborted) throw new AnalysisStopped("cancelled", "Analysis cancelled.");
    }
    public take(key: keyof AdvancedAnalysisLimits, amount = 1): void {
        this.check();
        if (this.work[key] + amount > this.limits[key]) throw new AnalysisStopped("budget-exhausted", `Analysis ${key} limit exhausted.`);
        this.work[key] += amount;
    }
    public depth(value: number): void {
        this.check();
        if (value > this.limits.depth) throw new AnalysisStopped("budget-exhausted", "Analysis depth limit exhausted.");
        this.work.depth = Math.max(this.work.depth, value);
    }
    public async yield(): Promise<void> {
        this.check();
        if (++this.ticks % this.limits.yieldEvery === 0) await new Promise<void>(resolve => {
            setImmediate(resolve);
        });
        this.check();
    }
    /** Clone data without invoking accessors/toJSON; bound preprocessing before allocation. */
    public detach(input: unknown, evidence = false): Promise<unknown> {
        const ancestors = new Set<object>();
        const visit = async (value: unknown, depth: number): Promise<unknown> => {
            this.take(evidence ? "evidenceNodes" : "inputNodes");
            this.depth(depth);
            await this.yield();
            if (typeof value === "string") this.take(evidence ? "evidenceNodes" : "inputNodes", value.length);
            if (value === null || ["string", "boolean", "number"].includes(typeof value)) return evidence && typeof value === "number" && !Number.isFinite(value) ? String(value) : value;
            if (value === undefined) return undefined;
            if (typeof value !== "object" || ancestors.has(value)) throw new Error("Analysis requires acyclic plain data.");
            const proto: unknown = Reflect.getPrototypeOf(value);
            if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) throw new Error("Analysis requires plain data objects.");
            ancestors.add(value);
            const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
            // Bound key enumeration as well as recursion. Reflect descriptors never execute getters.
            const allKeys = Reflect.ownKeys(value);
            if (allKeys.length > this.limits[evidence ? "evidenceNodes" : "inputNodes"] - this.work[evidence ? "evidenceNodes" : "inputNodes"] + (Array.isArray(value) ? 1 : 0)) throw new AnalysisStopped("budget-exhausted", "Analysis data expansion limit exhausted.");
            if (allKeys.some(key => typeof key !== "string")) throw new Error("Analysis does not accept symbol metadata.");
            for (const key of allKeys) {
                const descriptor = Reflect.getOwnPropertyDescriptor(value, key)!;
                if (Array.isArray(value) && key === "length") continue;
                if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("Analysis does not invoke accessors or hidden metadata.");
            }
            const keys = Object.keys(value);
            if (Array.isArray(value) && keys.length !== value.length) throw new Error("Analysis does not accept sparse arrays.");
            if (keys.length > this.limits[evidence ? "evidenceNodes" : "inputNodes"] - this.work[evidence ? "evidenceNodes" : "inputNodes"]) throw new AnalysisStopped("budget-exhausted", "Analysis data expansion limit exhausted.");
            for (const key of keys) {
                const descriptor = Reflect.getOwnPropertyDescriptor(value, key)!;
                if (!("value" in descriptor)) throw new Error("Analysis does not invoke data accessors.");
                if (descriptor.value === undefined && !Array.isArray(value)) continue;
                Reflect.defineProperty(result, key, {value: await visit(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true});
            }
            ancestors.delete(value);
            return result;
        };
        return visit(input, 0);
    }
}

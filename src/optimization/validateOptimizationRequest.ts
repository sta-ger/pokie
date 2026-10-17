import type {OptimizationDiagnostic, OptimizationRequest} from "./OptimizationPolicy.js";

export class OptimizationInputError extends Error {
    public constructor(public readonly diagnostics: OptimizationDiagnostic[]) {
        super(diagnostics.map((item) => `${item.path}: ${item.message}`).join("; "));
    }
}
export function optimizationPathsOverlap(left: string, right: string): boolean {
    return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
/** Shared strict transport/direct-call validator. Never coerces submitted values. */
export function validateOptimizationRequest(input: unknown): OptimizationRequest {
    const errors: OptimizationDiagnostic[] = [];
    const bad = (path: string, message: string): void => {
        errors.push({path, message});
    };
    const object = (value: unknown, path: string, keys: string[]): Record<string, unknown> => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            bad(path, "Expected an object.");
            return {};
        }
        for (const key of Object.keys(value)) if (!keys.includes(key)) bad(`${path}/${key}`, "Unknown field.");
        return value as Record<string, unknown>;
    };
    const finite = (value: unknown, path: string, probability = false): void => {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (probability && value > 1)) bad(path, probability ? "Expected a ratio in [0,1]." : "Expected a finite nonnegative number.");
    };
    const integer = (value: unknown, path: string, min = 1): void => {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > 1000000) bad(path, `Expected an integer in [${min},1000000].`);
    };
    const pointer = (value: unknown, path: string): value is string => {
        if (
            typeof value !== "string" ||
            !(/^\/(?:[^~/]+|~[01])+(?:\/(?:[^~/]+|~[01])+)*$/).test(value) ||
            value.split("/").some((part) => ["__proto__", "prototype", "constructor"].includes(part))
        ) {
            bad(path, "Expected a safe non-root JSON pointer.");
            return false;
        }
        return true;
    };
    const scalar = (value: unknown, path: string, aggregate = false): void => {
        if (
            !(typeof value === "number" && Number.isFinite(value) && value >= 0) &&
            !(
                typeof value === "string" &&
                (/^(0|[1-9][0-9]*)$/).test(value) &&
                (aggregate || BigInt(value) <= BigInt("18446744073709551615"))
            )
        ) bad(path, aggregate ? "Expected a nonnegative finite number or canonical nonnegative integer sum string." : "Expected a nonnegative finite number or canonical uint64 decimal string.");
    };
    const array = (value: unknown, path: string): unknown[] => {
        if (!Array.isArray(value)) {
            bad(path, "Expected an array.");
            return [];
        }
        return value;
    };
    const root = object(input, "$", ["targets", "policy"]);
    const targets = array(root.targets, "targets");
    if (!targets.length || targets.length > 100) bad("targets", "Supply 1–100 targets.");
    targets.forEach((value, i) => {
        const p = `targets/${i}`;
        const t = object(value, p, ["metric", "unit", "value", "tolerance", "event", "bucket"]);
        const units: Record<string, string[]> = {
            rtp: ["ratio"],
            volatility: ["variance", "standardDeviation"],
            hitFrequency: ["ratio"],
            featureFrequency: ["ratio"],
            distribution: ["ratio"],
            maxWin: ["currency", "betMultiple"],
        };
        if (
            typeof t.metric !== "string" ||
            !Reflect.apply(Object.prototype.hasOwnProperty, units, [t.metric]) ||
            !units[t.metric].includes(t.unit as string)
        ) bad(`${p}/unit`, "Unknown metric or incompatible unit.");
        finite(
            t.value,
            `${p}/value`,
            ["hitFrequency", "featureFrequency", "distribution"].includes(t.metric as string),
        );
        if (t.tolerance !== undefined) {
            const tolerance = object(t.tolerance, `${p}/tolerance`, ["kind", "value"]);
            if (!["absolute", "relative"].includes(tolerance.kind as string)) bad(`${p}/tolerance/kind`, "Expected absolute or relative.");
            finite(tolerance.value, `${p}/tolerance/value`);
        }
        if (t.metric === "featureFrequency") {
            if (typeof t.event !== "string" || !t.event.trim() || t.event.length > 256) bad(`${p}/event`, "Supply the exact native event identity.");
        } else if (t.event !== undefined) bad(`${p}/event`, "Only featureFrequency accepts event.");
        if (t.metric === "distribution") {
            const bucket = object(t.bucket, `${p}/bucket`, ["min", "max"]);
            finite(bucket.min, `${p}/bucket/min`);
            if (bucket.max !== null) {
                finite(bucket.max, `${p}/bucket/max`);
                if (Number(bucket.max) <= Number(bucket.min)) bad(`${p}/bucket/max`, "Must exceed min.");
            }
        } else if (t.bucket !== undefined) bad(`${p}/bucket`, "Only distribution accepts bucket.");
    });
    const distributions = targets.filter(
        (value) => value && typeof value === "object" && (value as {metric?: unknown}).metric === "distribution",
    ) as {value: number; bucket?: {min: number; max: number | null}}[];
    if (distributions.reduce((sum, target) => sum + (Number.isFinite(target.value) ? target.value : 0), 0) > 1) bad("targets", "Distribution bucket mass must not exceed one.");
    distributions.forEach((target, i) =>
        distributions.slice(i + 1).forEach((other) => {
            if (
                target.bucket &&
                other.bucket &&
                target.bucket.min < (other.bucket.max ?? Infinity) &&
                other.bucket.min < (target.bucket.max ?? Infinity)
            ) bad("targets", "Distribution buckets must not overlap.");
        }),
    );
    const p = object(root.policy, "policy", [
        "strategy",
        "sampling",
        "seed",
        "budget",
        "maxOutcomes",
        "mode",
        "stake",
        "scope",
        "tunables",
        "locks",
        "protectedFiles",
        "constraints",
    ]);
    if (!["exact-finite-v1", "seeded-search-v1"].includes(p.strategy as string)) bad("policy/strategy", "Expected exact-finite-v1 or seeded-search-v1.");
    if (p.strategy === "seeded-search-v1") {
        const sampling = object(p.sampling, "policy/sampling", ["searchSamples", "searchBudget", "assessmentSamples", "minSamples", "minEventCount", "confidence", "chunkSize", "workers"]);
        for (const key of ["searchSamples", "searchBudget", "assessmentSamples", "minSamples", "minEventCount", "chunkSize", "workers"]) integer(sampling[key], `policy/sampling/${key}`);
        if (Number(sampling.workers) > 16) bad("policy/sampling/workers", "At most 16 workers.");
        if (Number(sampling.chunkSize) > 1000) bad("policy/sampling/chunkSize", "At most 1000 observations per cancellation chunk.");
        if (Number(sampling.minSamples) < 30) bad("policy/sampling/minSamples", "At least 30 assessment observations.");
        if (typeof sampling.confidence !== "number" || !Number.isFinite(sampling.confidence) || sampling.confidence < 0.8 || sampling.confidence >= 1) bad("policy/sampling/confidence", "Expected confidence in [0.8,1).");
    } else if (p.sampling !== undefined) bad("policy/sampling", "Only seeded-search-v1 accepts sampling.");
    if (typeof p.seed !== "string" || !p.seed.length || p.seed.length > 256) bad("policy/seed", "Supply a nonempty string of at most 256 characters.");
    integer(p.budget, "policy/budget");
    if (p.strategy === "seeded-search-v1" && Number(p.budget) > 10000) bad("policy/budget", "Sampled search trace is bounded to 10000 candidate attempts.");
    integer(p.maxOutcomes, "policy/maxOutcomes");
    finite(p.stake, "policy/stake");
    if (p.stake === 0) bad("policy/stake", "Stake must be positive.");
    if (typeof p.mode !== "string" || !p.mode.trim()) bad("policy/mode", "Supply a mode identity.");
    if (!["paid-entry", "logical-round", "native-outcomes"].includes(p.scope as string)) bad("policy/scope", "Unknown population scope.");
    const tunables = array(p.tunables, "policy/tunables");
    if (!tunables.length || tunables.length > 20) bad("policy/tunables", "Supply 1–20 finite domains.");
    const paths: string[] = [];
    tunables.forEach((value, i) => {
        const field = `policy/tunables/${i}`;
        const t = object(value, field, ["path", "values"]);
        if (pointer(t.path, `${field}/path`)) {
            if (paths.some((other) => optimizationPathsOverlap(other, t.path as string))) bad(`${field}/path`, "Overlapping tunables.");
            paths.push(t.path);
        }
        const values = array(t.values, `${field}/values`);
        if (!values.length || values.length > 10000 || new Set(values).size !== values.length) bad(`${field}/values`, "Supply 1–10000 distinct values.");
        values.forEach((v, j) => scalar(v, `${field}/values/${j}`));
    });
    array(p.locks, "policy/locks").forEach((lock, i) => {
        if (pointer(lock, `policy/locks/${i}`) && paths.some((field) => optimizationPathsOverlap(field, lock))) bad(`policy/locks/${i}`, "Locked field overlaps a tunable.");
    });
    if (p.protectedFiles !== undefined) array(p.protectedFiles, "policy/protectedFiles").forEach((file, i) => {
        if (
            typeof file !== "string" ||
                !file ||
                file.startsWith("/") ||
                file.includes("\\") ||
                file.split("/").some((part) => ["..", ".", ""].includes(part))
        ) bad(`policy/protectedFiles/${i}`, "Expected a relative file path without traversal.");
    });
    if (p.constraints !== undefined) {
        const c = object(p.constraints, "policy/constraints", ["fixed", "sums", "counts", "maxWin"]);
        if (c.fixed !== undefined) array(c.fixed, "policy/constraints/fixed").forEach((v, i) => {
            const f = object(v, `policy/constraints/fixed/${i}`, ["path", "value"]);
            pointer(f.path, `policy/constraints/fixed/${i}/path`);
            scalar(f.value, `policy/constraints/fixed/${i}/value`);
        });
        if (c.sums !== undefined) array(c.sums, "policy/constraints/sums").forEach((v, i) => {
            const s = object(v, `policy/constraints/sums/${i}`, ["paths", "value"]);
            const sumPaths = array(s.paths, `policy/constraints/sums/${i}/paths`);
            if (!sumPaths.length || new Set(sumPaths).size !== sumPaths.length) bad(`policy/constraints/sums/${i}/paths`, "Supply distinct paths.");
            sumPaths.forEach((field) => pointer(field, `policy/constraints/sums/${i}/paths`));
            scalar(s.value, `policy/constraints/sums/${i}/value`, true);
        });
        if (c.counts !== undefined) array(c.counts, "policy/constraints/counts").forEach((v, i) => {
            const count = object(v, `policy/constraints/counts/${i}`, ["path", "scope", "value"]);
            pointer(count.path, `policy/constraints/counts/${i}/path`);
            integer(count.value, `policy/constraints/counts/${i}/value`, 0);
            if (!["outcomes", "symbols", "variants"].includes(count.scope as string)) bad(`policy/constraints/counts/${i}/scope`, "Unknown count population.");
        });
        if (c.maxWin !== undefined) {
            const max = object(c.maxWin, "policy/constraints/maxWin", ["value", "unit"]);
            finite(max.value, "policy/constraints/maxWin/value");
            if (!["currency", "betMultiple"].includes(max.unit as string)) bad("policy/constraints/maxWin/unit", "Expected currency or betMultiple.");
        }
    }
    // Intersect tolerance regions for repeated observations before any source acquisition.
    const regions = new Map<string, {low: number; high: number}>();
    for (const value of targets) {
        if (!value || typeof value !== "object") continue;
        const target = value as OptimizationRequest["targets"][number];
        const key = JSON.stringify([target.metric, target.unit, target.event, target.bucket]);
        const allowance = target.tolerance?.kind === "relative" ? target.value * target.tolerance.value : target.tolerance?.value ?? 0;
        const region = {low: target.value - allowance, high: target.value + allowance};
        if (!Number.isFinite(region.low) || !Number.isFinite(region.high)) bad("targets", "Tolerance region must be finite.");
        const previous = regions.get(key);
        if (previous) {
            region.low = Math.max(region.low, previous.low);
            region.high = Math.min(region.high, previous.high);
            if (region.low > region.high) bad("targets", "Contradictory target intervals for the same observable.");
        }
        regions.set(key, region);
    }
    if (errors.length) throw new OptimizationInputError(errors);
    return JSON.parse(JSON.stringify(input)) as OptimizationRequest;
}

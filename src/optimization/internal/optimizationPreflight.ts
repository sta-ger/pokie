import {OptimizationInputError, optimizationPathsOverlap} from "../validateOptimizationRequest.js";
import type {MathTarget, OptimizationPolicy, OptimizationScalar} from "../OptimizationPolicy.js";
import {at} from "./optimizationModel.js";

export function preflightConstraints(model: unknown, policy: OptimizationPolicy): void {
    const invalid = (path: string, message: string): never => {
        throw new OptimizationInputError([{path, message}]);
    };
    for (const fixed of policy.constraints?.fixed ?? []) {
        if (policy.tunables.some((field) => optimizationPathsOverlap(field.path, fixed.path))) invalid(fixed.path, "Fixed field overlaps a tunable.");
        if (at(model, fixed.path) !== fixed.value) invalid(fixed.path, "Fixed field contradicts source.");
    }
    for (const count of policy.constraints?.counts ?? []) if (Object.keys(at(model, count.path) as object).length !== count.value) invalid(count.path, "Fixed count contradicts this adapter's preserved population.");
    for (const sum of policy.constraints?.sums ?? []) {
        const ranges = sum.paths.map(
            (field) =>
                policy.tunables.find((t) => t.path === field)?.values ?? [at(model, field) as OptimizationScalar],
        );
        if (typeof sum.value === "string") {
            if (ranges.some((values) => values.some((value) => typeof value !== "string"))) invalid("policy/constraints/sums", "Integer sum requires uint64 string weights.");
            const min = ranges.reduce(
                (total, values) => total + values.map((value) => BigInt(value)).reduce((a, b) => (a < b ? a : b)),
                BigInt(0),
            );
            const max = ranges.reduce(
                (total, values) => total + values.map((value) => BigInt(value)).reduce((a, b) => (a > b ? a : b)),
                BigInt(0),
            );
            if (BigInt(sum.value) < min || BigInt(sum.value) > max) invalid("policy/constraints/sums", "Sum contradicts finite domains/fixed weights.");
        } else {
            if (ranges.some((values) => values.some((value) => typeof value !== "number"))) invalid("policy/constraints/sums", "Numeric sum requires numeric leaves.");
            const min = ranges.reduce((total, values) => total + Math.min(...(values as number[])), 0);
            const max = ranges.reduce((total, values) => total + Math.max(...(values as number[])), 0);
            if (sum.value < min || sum.value > max) invalid("policy/constraints/sums", "Sum contradicts finite domains/fixed weights.");
        }
    }
}
export function targetsMatch(targets: MathTarget[], measured: number[]): boolean {
    return targets.every((target, index) => {
        const tolerance = target.tolerance?.value ?? 0;
        const allowance = target.tolerance?.kind === "relative" ? Math.abs(target.value) * tolerance : tolerance;
        return Number.isFinite(measured[index]) && Math.abs(measured[index] - target.value) <= allowance;
    });
}

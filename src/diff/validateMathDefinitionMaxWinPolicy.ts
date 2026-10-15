import {detachPackageModelData} from "../generated/internal/detachPackageModelData.js";
import type {MathDefinitionMaxWinPolicy} from "./MathDefinitionDiff.js";

export function validateMathDefinitionMaxWinPolicy(value: unknown): MathDefinitionMaxWinPolicy {
    const policy = detachPackageModelData(value) as Record<string, unknown>;
    if (
        !policy ||
        Array.isArray(policy) ||
        typeof policy !== "object" ||
        typeof policy.authority !== "string" ||
        !policy.authority.trim()
    ) throw new Error("maxWinPolicy: expected a declared authority");
    const keys =
        policy.type === "declared"
            ? ["type", "authority", "scope", "value", "unit"]
            : ["type", "authority", ...(policy.type === "none" ? ["scope"] : [])];
    if (
        Object.keys(policy).some((key) => !keys.includes(key)) ||
        !["none", "unknown", "declared"].includes(String(policy.type))
    ) throw new Error("maxWinPolicy: unsupported declaration");
    if (policy.type !== "unknown" && policy.scope !== "logical-round" && policy.scope !== "paid-entry") throw new Error("maxWinPolicy: expected scope");
    if (
        policy.type === "declared" &&
        (typeof policy.value !== "number" ||
            !Number.isFinite(policy.value) ||
            policy.value < 0 ||
            !["currency", "bet-multiple"].includes(String(policy.unit)))
    ) throw new Error("maxWinPolicy: expected finite non-negative value and payout unit");
    return policy as MathDefinitionMaxWinPolicy;
}

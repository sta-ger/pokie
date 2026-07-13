import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";
import type {ReelStripSymbolWeightsConversionRequest} from "./ReelStripSymbolWeightsConversionRequest.js";
import type {ReelStripSymbolWeightsConversionResult} from "./ReelStripSymbolWeightsConversionResult.js";
import type {ReelStripSymbolWeightsConverter} from "./ReelStripSymbolWeightsConverter.js";
import type {ReelStripSymbolWeightsRemainderTieBreakPolicy} from "./ReelStripSymbolWeightsRemainderTieBreakPolicy.js";
import type {ReelStripSymbolWeightsRoundingPolicy} from "./ReelStripSymbolWeightsRoundingPolicy.js";

type SymbolQuota = {
    symbolId: string;
    weight: number;
    quota: number;
    count: number;
};

// Default ReelStripSymbolWeightsConverter: the Largest Remainder Method (a.k.a. Hare-quota
// apportionment, the same family of algorithm used for proportional seat allocation). Each symbol's
// exact quota (weight / totalWeight * length) is rounded to an initial integer count per
// `roundingPolicy`; the gap between the sum of those counts and `length` is then corrected one unit
// at a time, always picking the symbol(s) whose quota was least well served by the initial rounding.
// Ties are broken deterministically per `remainderTieBreakPolicy` — the same weights, length, and
// policies always produce the same counts.
export class LargestRemainderReelStripSymbolWeightsConverter implements ReelStripSymbolWeightsConverter {
    private static readonly DEFAULT_ROUNDING_POLICY: ReelStripSymbolWeightsRoundingPolicy = "floor";
    private static readonly DEFAULT_TIE_BREAK_POLICY: ReelStripSymbolWeightsRemainderTieBreakPolicy = "symbol-id";

    private static validate(request: ReelStripSymbolWeightsConversionRequest): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];

        if (!Number.isInteger(request.length) || request.length <= 0) {
            violations.push({
                constraintId: "symbolWeights.length",
                message: `length must be a positive integer, got ${request.length}.`,
            });
        }

        const symbolWeights = request.symbolWeights ?? {};
        if (Object.keys(symbolWeights).length === 0) {
            violations.push({
                constraintId: "symbolWeights.weights",
                message: "symbolWeights must contain at least one symbol.",
            });
        }

        for (const [symbolId, weight] of Object.entries(symbolWeights)) {
            if (!Number.isFinite(weight) || weight <= 0) {
                violations.push({
                    constraintId: "symbolWeights.weights",
                    message: `Symbol "${symbolId}" has an invalid weight (${weight}); weights must be positive, finite numbers.`,
                    details: {symbolId, weight},
                });
            }
        }

        return violations;
    }

    private static computeQuotas(symbolWeights: Record<string, number>, length: number): SymbolQuota[] {
        const totalWeight = Object.values(symbolWeights).reduce((sum, weight) => sum + weight, 0);
        return Object.entries(symbolWeights).map(([symbolId, weight]) => ({
            symbolId,
            weight,
            quota: (weight / totalWeight) * length,
            count: 0,
        }));
    }

    private static applyRoundingPolicy(quotas: SymbolQuota[], roundingPolicy: ReelStripSymbolWeightsRoundingPolicy): void {
        for (const quota of quotas) {
            if (roundingPolicy === "ceil") {
                quota.count = Math.ceil(quota.quota);
            } else if (roundingPolicy === "round") {
                quota.count = Math.round(quota.quota);
            } else {
                quota.count = Math.floor(quota.quota);
            }
        }
    }

    private static compareForTieBreak(
        a: SymbolQuota,
        b: SymbolQuota,
        tieBreakPolicy: ReelStripSymbolWeightsRemainderTieBreakPolicy,
        declaredOrder: Map<string, number>,
    ): number {
        if (tieBreakPolicy === "largest-weight-first" && a.weight !== b.weight) {
            return b.weight - a.weight;
        }
        if (tieBreakPolicy === "declared-order") {
            return (declaredOrder.get(a.symbolId) ?? 0) - (declaredOrder.get(b.symbolId) ?? 0);
        }
        if (a.symbolId === b.symbolId) {
            return 0;
        }
        return a.symbolId < b.symbolId ? -1 : 1;
    }

    // Ranks quotas by how much their fractional remainder (quota - count) favors receiving the next
    // +1 (direction 1, most-favored first) or losing a -1 (direction -1, least-favored first),
    // breaking ties per `tieBreakPolicy`.
    private static rankByFractionalRemainder(
        quotas: SymbolQuota[],
        direction: 1 | -1,
        tieBreakPolicy: ReelStripSymbolWeightsRemainderTieBreakPolicy,
        declaredOrder: Map<string, number>,
    ): SymbolQuota[] {
        return [...quotas].sort((a, b) => {
            const fractionalDifference = (b.quota - b.count) - (a.quota - a.count);
            if (fractionalDifference !== 0) {
                return direction * fractionalDifference;
            }
            return LargestRemainderReelStripSymbolWeightsConverter.compareForTieBreak(a, b, tieBreakPolicy, declaredOrder);
        });
    }

    private static distributeRemainder(quotas: SymbolQuota[], remainder: number, tieBreakPolicy: ReelStripSymbolWeightsRemainderTieBreakPolicy): void {
        if (remainder === 0) {
            return;
        }
        const declaredOrder = new Map(quotas.map((quota, index) => [quota.symbolId, index]));

        if (remainder > 0) {
            const ranked = LargestRemainderReelStripSymbolWeightsConverter.rankByFractionalRemainder(quotas, 1, tieBreakPolicy, declaredOrder);
            for (let i = 0; i < remainder; i++) {
                ranked[i % ranked.length].count++;
            }
            return;
        }

        const ranked = LargestRemainderReelStripSymbolWeightsConverter.rankByFractionalRemainder(quotas, -1, tieBreakPolicy, declaredOrder);
        let remaining = -remainder;
        for (let i = 0; remaining > 0; i++) {
            const candidate = ranked[i % ranked.length];
            if (candidate.count > 0) {
                candidate.count--;
                remaining--;
            }
        }
    }

    public convert(request: ReelStripSymbolWeightsConversionRequest): ReelStripSymbolWeightsConversionResult {
        const violations = LargestRemainderReelStripSymbolWeightsConverter.validate(request);
        if (violations.length > 0) {
            return {success: false, violations};
        }

        const roundingPolicy = request.roundingPolicy ?? LargestRemainderReelStripSymbolWeightsConverter.DEFAULT_ROUNDING_POLICY;
        const tieBreakPolicy = request.remainderTieBreakPolicy ?? LargestRemainderReelStripSymbolWeightsConverter.DEFAULT_TIE_BREAK_POLICY;

        const quotas = LargestRemainderReelStripSymbolWeightsConverter.computeQuotas(request.symbolWeights, request.length);
        LargestRemainderReelStripSymbolWeightsConverter.applyRoundingPolicy(quotas, roundingPolicy);

        const remainder = request.length - quotas.reduce((sum, quota) => sum + quota.count, 0);
        LargestRemainderReelStripSymbolWeightsConverter.distributeRemainder(quotas, remainder, tieBreakPolicy);

        const totalWeight = Object.values(request.symbolWeights).reduce((sum, weight) => sum + weight, 0);
        const symbolCounts: Record<string, number> = {};
        const targetProportions: Record<string, number> = {};
        const actualProportions: Record<string, number> = {};
        const deviations: Record<string, number> = {};

        for (const quota of quotas) {
            symbolCounts[quota.symbolId] = quota.count;
            targetProportions[quota.symbolId] = quota.weight / totalWeight;
            actualProportions[quota.symbolId] = quota.count / request.length;
            deviations[quota.symbolId] = actualProportions[quota.symbolId] - targetProportions[quota.symbolId];
        }

        return {
            success: true,
            symbolCounts,
            violations: [],
            diagnostic: {
                weights: {...request.symbolWeights},
                counts: {...symbolCounts},
                targetProportions,
                actualProportions,
                deviations,
            },
        };
    }
}

import {deepFreeze} from "../../../internal/deepFreeze.js";
import type {WeightedOutcomePayoutBucket, WeightedOutcomeLibraryAnalysis} from "../../WeightedOutcomeLibraryAnalysis.js";
import {iterateOutcomesJsonl} from "./iterateOutcomesJsonl.js";
import {OutcomeLibraryBundleInvariantError} from "../OutcomeLibraryBundleInvariantError.js";

// Recomputes exactly the same statistics WeightedOutcomeLibraryAnalyzer.analyze() would, over a mode's already-
// written outcomes file, without ever holding more than one outcome in memory (see iterateOutcomesJsonl) or
// building an array of them — "totalWeight" must already be known (from the same streaming write pass that
// produced this file — see streamModeOutcomesToTempFile) since every weighted term here is normalized
// (weight / totalWeight) *before* being multiplied by anything else, exactly like the in-memory analyzer's own
// weightedAverage — this is what keeps every intermediate term bounded and overflow-safe rather than summing
// raw weight*value products (see WeightedOutcomeLibraryAnalyzer's own doc comment for the full rationale); it's
// also exactly why this needs two full streaming passes over the file (rtp/hitFrequency/maxWin first, then
// variance/maxWinProbability, which each depend on a value only known after a first complete pass) rather than
// one — "online" here means never buffering all outcomes at once, not literally a single read.
//
// A dedicated cross-check test asserts this produces bit-identical results to WeightedOutcomeLibraryAnalyzer.analyze()
// for the same outcomes, so the two can never silently diverge.
export async function computeOnlineWeightedOutcomeLibraryAnalysis(outcomesFilePath: string, totalWeight: number): Promise<WeightedOutcomeLibraryAnalysis> {
    let rtpSum = 0;
    let hitFrequencySum = 0;
    let maxWin = 0;
    const weightByMultiplier = new Map<number, number>();

    for await (const line of iterateOutcomesJsonl(outcomesFilePath)) {
        if (line.status !== "ok") {
            throw new OutcomeLibraryBundleInvariantError(`outcomes file line ${line.position} is not valid JSON on a re-read of a file this same writer just wrote.`);
        }
        const outcome = line.value as {id: string; weight: number; artifact: {payoutMultiplier: number; totalWin: number}};
        const normalizedWeight = outcome.weight / totalWeight;

        rtpSum += normalizedWeight * outcome.artifact.payoutMultiplier;
        hitFrequencySum += normalizedWeight * (outcome.artifact.totalWin > 0 ? 1 : 0);
        maxWin = Math.max(maxWin, outcome.artifact.totalWin);
        weightByMultiplier.set(outcome.artifact.payoutMultiplier, (weightByMultiplier.get(outcome.artifact.payoutMultiplier) ?? 0) + normalizedWeight);
    }

    const rtp = rtpSum;
    const hitFrequency = hitFrequencySum;
    const zeroWinFrequency = 1 - hitFrequency;

    let varianceSum = 0;
    let maxWinProbabilitySum = 0;
    for await (const line of iterateOutcomesJsonl(outcomesFilePath)) {
        if (line.status !== "ok") {
            throw new OutcomeLibraryBundleInvariantError(`outcomes file line ${line.position} is not valid JSON on a re-read of a file this same writer just wrote.`);
        }
        const outcome = line.value as {id: string; weight: number; artifact: {payoutMultiplier: number; totalWin: number}};
        const normalizedWeight = outcome.weight / totalWeight;

        varianceSum += normalizedWeight * (outcome.artifact.payoutMultiplier - rtp) ** 2;
        maxWinProbabilitySum += normalizedWeight * (outcome.artifact.totalWin === maxWin ? 1 : 0);
    }

    const variance = varianceSum;
    const standardDeviation = Math.sqrt(variance);
    const maxWinProbability = maxWinProbabilitySum;

    const payoutDistribution: WeightedOutcomePayoutBucket[] = Array.from(weightByMultiplier.entries())
        .sort(([a], [b]) => a - b)
        .map(([payoutMultiplier, probability]) => ({payoutMultiplier, probability}));

    return deepFreeze({
        totalWeight,
        rtp,
        hitFrequency,
        zeroWinFrequency,
        variance,
        standardDeviation,
        maxWin,
        maxWinProbability,
        payoutDistribution,
    });
}

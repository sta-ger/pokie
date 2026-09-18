import fs from "fs";
import {deepFreeze} from "../../../internal/deepFreeze.js";
import type {WeightedOutcomePayoutBucket, WeightedOutcomeLibraryAnalysis} from "../../WeightedOutcomeLibraryAnalysis.js";
import {iterateOutcomesJsonl} from "./iterateOutcomesJsonl.js";
import {OutcomeLibraryBundleInvariantError} from "../OutcomeLibraryBundleInvariantError.js";

type AnalysisRecord = {readonly weight: number; readonly payoutMultiplier: number; readonly totalWin: number};
const STAGED_ANALYSIS_RECORD_BYTES = 24;

export type OnlineWeightedOutcomeLibraryAnalysisProgress = {
    readonly pass: 1 | 2;
    readonly completed: bigint;
    readonly total?: bigint;
    readonly unit: "outcome records";
};

export type OnlineWeightedOutcomeLibraryAnalysisOptions = {
    readonly signal?: AbortSignal;
    readonly throwIfAborted?: () => void;
    /** A writer knows this from its just-completed streaming pass. */
    readonly expectedOutcomeCount?: bigint;
    /** A private compact spool, written alongside JSONL by native publication. */
    readonly stagedValuesPath?: string;
    readonly onProgress?: (progress: OnlineWeightedOutcomeLibraryAnalysisProgress) => void;
};

// Recomputes exactly the same statistics WeightedOutcomeLibraryAnalyzer.analyze() would, over a mode's already-
// written outcomes file, without ever holding more than one outcome in memory (see iterateOutcomesJsonl) or
// building an array of them — "totalWeight" must already be known (from the same streaming write pass that
// produced this file — see streamModeOutcomesToTempFile) since every weighted term here is normalized
// (weight / totalWeight) *before* being multiplied by anything else, exactly like the in-memory analyzer's own
// weightedAverage — this is what keeps every intermediate term bounded and overflow-safe rather than summing
// raw weight*value products (see WeightedOutcomeLibraryAnalyzer's own doc comment for the full rationale); it's
// needs two deterministic accumulation passes (rtp/hitFrequency/maxWin first, then variance/maxWinProbability,
// which each depend on a value only known after the first pass). Native publication replays a compact staged
// numeric representation for those passes; deep validation and direct callers independently scan JSONL.
//
// A dedicated cross-check test asserts this produces bit-identical results to WeightedOutcomeLibraryAnalyzer.analyze()
// for the same outcomes, so the two can never silently diverge.
export async function computeOnlineWeightedOutcomeLibraryAnalysis(
    outcomesFilePath: string,
    totalWeight: number,
    options?: OnlineWeightedOutcomeLibraryAnalysisOptions,
): Promise<WeightedOutcomeLibraryAnalysis> {
    let rtpSum = 0;
    let hitFrequencySum = 0;
    let maxWin = 0;
    const weightByMultiplier = new Map<number, number>();

    for await (const outcome of iterateAnalysisRecords(outcomesFilePath, options, 1)) {
        const normalizedWeight = outcome.weight / totalWeight;

        rtpSum += normalizedWeight * outcome.payoutMultiplier;
        hitFrequencySum += normalizedWeight * (outcome.totalWin > 0 ? 1 : 0);
        maxWin = Math.max(maxWin, outcome.totalWin);
        weightByMultiplier.set(outcome.payoutMultiplier, (weightByMultiplier.get(outcome.payoutMultiplier) ?? 0) + normalizedWeight);
    }

    const rtp = rtpSum;
    const hitFrequency = hitFrequencySum;
    const zeroWinFrequency = 1 - hitFrequency;

    let varianceSum = 0;
    let maxWinProbabilitySum = 0;
    for await (const outcome of iterateAnalysisRecords(outcomesFilePath, options, 2)) {
        const normalizedWeight = outcome.weight / totalWeight;

        varianceSum += normalizedWeight * (outcome.payoutMultiplier - rtp) ** 2;
        maxWinProbabilitySum += normalizedWeight * (outcome.totalWin === maxWin ? 1 : 0);
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

async function *iterateAnalysisRecords(
    outcomesFilePath: string,
    options: OnlineWeightedOutcomeLibraryAnalysisOptions | undefined,
    pass: 1 | 2,
): AsyncGenerator<AnalysisRecord> {
    if (options?.stagedValuesPath === undefined) {
        for await (const line of iterateOutcomesJsonl(outcomesFilePath, analysisIterationOptions(options, pass))) {
            if (line.status !== "ok") {
                throw new OutcomeLibraryBundleInvariantError(`outcomes file line ${line.position} is not valid JSON on a re-read of a file this same writer just wrote.`);
            }
            const outcome = line.value as {weight: number; artifact: {payoutMultiplier: number; totalWin: number}};
            yield {weight: outcome.weight, payoutMultiplier: outcome.artifact.payoutMultiplier, totalWin: outcome.artifact.totalWin};
        }
        return;
    }

    const descriptor = fs.openSync(options.stagedValuesPath, "r");
    const buffer = Buffer.allocUnsafe(STAGED_ANALYSIS_RECORD_BYTES * 256);
    let completed = BigInt(0);
    try {
        let bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        while (bytesRead > 0) {
            assertNotCancelled(options);
            if (bytesRead % STAGED_ANALYSIS_RECORD_BYTES !== 0) {
                throw new OutcomeLibraryBundleInvariantError("Outcome Library analysis staging data is truncated.");
            }
            for (let offset = 0; offset < bytesRead; offset += STAGED_ANALYSIS_RECORD_BYTES) {
                yield {
                    weight: buffer.readDoubleLE(offset),
                    payoutMultiplier: buffer.readDoubleLE(offset + 8),
                    totalWin: buffer.readDoubleLE(offset + 16),
                };
                completed++;
                options.onProgress?.({pass, completed, unit: "outcome records", ...(options.expectedOutcomeCount === undefined ? {} : {total: options.expectedOutcomeCount})});
            }
            if (options.expectedOutcomeCount !== undefined && completed > options.expectedOutcomeCount) {
                throw new OutcomeLibraryBundleInvariantError("Outcome Library analysis staging data has more records than the written outcomes file.");
            }
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            assertNotCancelled(options);
            bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        }
        if (options.expectedOutcomeCount !== undefined && completed !== options.expectedOutcomeCount) {
            throw new OutcomeLibraryBundleInvariantError("Outcome Library analysis staging data does not match the written outcomes count.");
        }
    } finally {
        fs.closeSync(descriptor);
    }
}

function analysisIterationOptions(options: OnlineWeightedOutcomeLibraryAnalysisOptions | undefined, pass: 1 | 2) {
    return {
        signal: options?.signal,
        throwIfAborted: options?.throwIfAborted,
        onProgress: ({recordsRead}: {readonly recordsRead: bigint}) => options?.onProgress?.({
            pass,
            completed: recordsRead,
            unit: "outcome records",
            ...(options?.expectedOutcomeCount === undefined ? {} : {total: options.expectedOutcomeCount}),
        }),
    };
}

function assertNotCancelled(options: OnlineWeightedOutcomeLibraryAnalysisOptions | undefined): void {
    options?.throwIfAborted?.();
    if (!options?.signal?.aborted) return;
    const error = new Error("Outcome Library analysis was cancelled.");
    error.name = "AbortError";
    throw error;
}

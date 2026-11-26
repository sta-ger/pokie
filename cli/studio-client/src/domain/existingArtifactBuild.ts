import type {StudioFormatConversionPlan, StudioJobView, StudioOutputFormat} from "../api/types";

/**
 * Finds the completed build job that produced a file already sitting at the card's destination.
 * The conflict state is deliberately reload-safe: without this lookup, the Download action existed
 * only in the transient completion receipt and disappeared the moment Studio was reopened.
 */
export function findExistingArtifactBuildJob(
    jobs: readonly StudioJobView[],
    target: StudioOutputFormat,
    outputPath: string,
): StudioJobView | undefined {
    return [...jobs]
        .filter((job) => job.operation === "artifact-build" && job.status === "completed")
        .sort((left, right) => (right.completedAt ?? right.createdAt) - (left.completedAt ?? left.createdAt))
        .find((job) => {
            const detail = job.result?.detail;
            return detail?.target === target &&
                job.result?.outputs?.some((output) => output.path === outputPath) === true;
        });
}

export type ExistingArtifactFreshness =
    | {status: "current"; reason: string}
    | {status: "stale"; reason: string}
    | {status: "unknown"; reason: string};

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

/**
 * Reads the plan a completed build job retained.  Older Studio builds may predate the retained
 * `result` copy, so a missing shape is "unknown", never a reason to claim the output is current.
 */
function retainedPlan(job: StudioJobView | undefined): StudioFormatConversionPlan | undefined {
    const detail = job?.result?.detail;
    const result = detail?.result;
    if (!record(result) || result.status !== "ok" || !record(result.plan)) return undefined;
    return result.plan as unknown as StudioFormatConversionPlan;
}

function provenance(plan: StudioFormatConversionPlan | undefined): {
    inputBindingHash?: string;
    configurationHash?: string;
} {
    const value = plan?.source?.configurationProvenance;
    return {
        ...(typeof value?.inputBindingHash === "string" ? {inputBindingHash: value.inputBindingHash} : {}),
        ...(typeof value?.configurationHash === "string" ? {configurationHash: value.configurationHash} : {}),
    };
}

/**
 * A file already on disk is useful only if it was built from the same saved design the workspace is
 * showing now.  The build job retains the exact source hashes it consumed; the current preview retains
 * the hashes Studio would consume now.  Compare both bindings when both sides have them, and answer
 * "unknown" when either side lacks a fingerprint instead of guessing.
 *
 * This is deliberately independent of the output's own bytes: a PAR workbook contains the RTP, while
 * the source hash identifies the design that produced that RTP.  A changed A/K/Q/J payout therefore
 * marks the workbook stale even though the file itself is still readable and downloadable.
 */
export function describeExistingArtifactFreshness(
    job: StudioJobView | undefined,
    currentPlan: StudioFormatConversionPlan | undefined,
): ExistingArtifactFreshness {
    if (job === undefined) {
        return {
            status: "unknown",
            reason: "No completed build record was found for this file, so Studio cannot confirm which saved design produced it.",
        };
    }
    const previous = provenance(retainedPlan(job));
    const current = provenance(currentPlan);
    const comparisons = [
        [previous.inputBindingHash, current.inputBindingHash],
        [previous.configurationHash, current.configurationHash],
    ].filter((pair): pair is [string, string] => pair[0] !== undefined && pair[1] !== undefined);
    if (comparisons.length === 0) {
        return {
            status: "unknown",
            reason: "This build record does not carry a design fingerprint, so Studio cannot confirm that the file matches the current saved design.",
        };
    }
    if (comparisons.some(([before, after]) => before !== after)) {
        return {
            status: "stale",
            reason: "This file was built from an earlier saved design. Its RTP, paytable or reels may no longer match the current design.",
        };
    }
    return {
        status: "current",
        reason: "This file was built from the current saved design.",
    };
}

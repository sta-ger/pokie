import type {SimulationConvergenceOptions} from "../../../../src/simulation/SimulationConvergenceOptions.js";

// A target precision is expressed in percentage points of the 95% RTP interval's half-width, matching
// how the review screen and the report talk about precision. The simulation engine works in RTP units.
const MIN_TARGET_PP = 0.01;
const MAX_TARGET_PP = 20;
const MIN_CONVERGENCE_ROUNDS = 5_000;
const STABLE_CHECKS = 3;

export function getSimulationPrecisionError(value: unknown): string | null {
    if (value === "" || value === undefined || value === null) return null;
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number) || number < MIN_TARGET_PP || number > MAX_TARGET_PP) {
        return `Target precision must be between ${MIN_TARGET_PP} and ${MAX_TARGET_PP} pp, or empty for a fixed run.`;
    }
    return null;
}

/**
 * Translate an optional target precision into the engine's adaptive-stop policy. `rounds` remains the
 * maximum play budget (the engine's own contract): a converging run may stop earlier, but never later.
 * The check cadence is derived from the requested budget so a 10k quick look and a 2M precision run both
 * get a meaningful number of checks without exposing engine-internal knobs in the main form.
 */
export function buildSimulationConvergence(
    rounds: number,
    targetPpHalfWidth: number | undefined,
): SimulationConvergenceOptions | undefined {
    if (targetPpHalfWidth === undefined || !Number.isFinite(targetPpHalfWidth)) return undefined;
    if (targetPpHalfWidth < MIN_TARGET_PP || targetPpHalfWidth > MAX_TARGET_PP) return undefined;
    if (!Number.isInteger(rounds) || rounds < 1) return undefined;
    return {
        minRounds: Math.min(rounds, MIN_CONVERGENCE_ROUNDS),
        rtpTolerance: targetPpHalfWidth / 100,
        checkIntervalRounds: Math.max(1, Math.min(rounds, Math.ceil(rounds / 20))),
        stableChecks: STABLE_CHECKS,
    };
}

type CapturedSimulationConvergence = {
    readonly minRounds?: unknown;
    readonly rtpTolerance?: unknown;
    readonly checkIntervalRounds?: unknown;
    readonly stableChecks?: unknown;
};

/**
 * A completed adaptive report carries both its request policy and result-only fields (`checksPerformed`,
 * `consecutiveStableChecks`, `achievedRtpHalfWidth`). Reusing "Run again" or changing the spin budget
 * must send only the four policy fields the server accepts; forwarding the whole report object makes a
 * valid retry fail as `Unknown "convergence" option.` This is the one boundary that narrows a captured
 * or freshly built policy before it becomes a request body.
 */
export function toSimulationConvergenceRequest(
    value: CapturedSimulationConvergence | undefined,
): SimulationConvergenceOptions | undefined {
    if (value === undefined) return undefined;
    const {minRounds, rtpTolerance, checkIntervalRounds, stableChecks} = value;
    if (!Number.isSafeInteger(minRounds) || (minRounds as number) < 0) return undefined;
    if (typeof rtpTolerance !== "number" || !Number.isFinite(rtpTolerance) || rtpTolerance <= 0) return undefined;
    if (!Number.isSafeInteger(checkIntervalRounds) || (checkIntervalRounds as number) < 1) return undefined;
    if (stableChecks !== undefined && (!Number.isSafeInteger(stableChecks) || (stableChecks as number) < 1)) return undefined;
    return {
        minRounds: minRounds as number,
        rtpTolerance,
        checkIntervalRounds: checkIntervalRounds as number,
        ...(stableChecks === undefined ? {} : {stableChecks: stableChecks as number}),
    };
}

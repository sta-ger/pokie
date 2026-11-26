import type {SimulationReport} from "./SimulationReport.js";
import type {SimulationStopReason} from "../simulation/SimulationStopReason.js";
import {describePayoutHistogramBuckets} from "./payoutHistogramPresentation.js";
import {describeWeightedBonusCoverage} from "../session/videoslot/authored/WeightedBonus.js";
import {describeSequenceVariantCoverage} from "../session/videoslot/combinations/WeightedSequenceVariant.js";

export type SimulationDiagnostics = {
    sampleUnit: "completed-logical-round" | "accepted-subround";
    samples: number;
    achievedRtpHalfWidth: number | null;
    precision: "insufficientSamples" | "uninformative" | "insufficientPrecision" | "empiricalPrecision" | "notRequested";
    coverageLimitations: string[];
};

export type SimulationPrecision = SimulationDiagnostics["precision"];

const PRECISION_LABEL: Record<SimulationPrecision, string> = {
    insufficientSamples: "not enough usable samples",
    uninformative: "no informative outcome observed",
    insufficientPrecision: "requested precision not reached",
    empiricalPrecision: "empirical precision target reached",
    notRequested: "no precision target requested",
};

const STOP_REASON_LABEL: Record<SimulationStopReason, string> = {
    maxRounds: "requested spins completed",
    sessionStopped: "session stopped early",
    converged: "converged",
};

function describeSampleUnit(unit: SimulationDiagnostics["sampleUnit"] | undefined): string {
    return unit === "completed-logical-round" ? "completed paid rounds" : "accepted spins";
}

function formatRtpUnitsAsPercentagePoints(value: number | null | undefined): string {
    return value === null || value === undefined ? "unavailable" : `${(value * 100).toFixed(2)} pp`;
}

/** Human-facing wording for a persisted precision verdict; the JSON field itself stays unchanged. */
export function describeSimulationPrecision(precision: SimulationPrecision): string {
    return PRECISION_LABEL[precision] ?? precision;
}

/** Human-facing wording for a persisted stop reason; the JSON field itself stays unchanged. */
export function describeSimulationStopReason(stopReason: SimulationStopReason): string {
    return STOP_REASON_LABEL[stopReason] ?? stopReason;
}

/** Reads persisted report fields only. It never re-estimates a metric or its denominator. */
export function describeSimulationDiagnostics(report: Pick<SimulationReport,
    "rounds" | "requestedRounds" | "sampling" | "diagnostics" | "stopReason" | "convergence" | "payoutHistogram" | "weightedBonus" | "reelSequences"
>, includeSelectionCoverage = true): string[] {
    const acceptedPlays = report.sampling?.acceptedSubrounds ?? report.requestedRounds;
    const lines = [
        `Sampling: requested spin budget ${report.requestedRounds}; ${acceptedPlays === report.rounds ? "" : `${acceptedPlays} spins accepted; `}usable samples ${report.rounds} completed paid rounds.`,
        "Hit frequency, means, volatility, payout histogram, maximum and confidence intervals use this completed-paid-round sample population. Monetary totals and monetary RTP include all spins, including free spins.",
        "Normal-approximation 95% confidence intervals and adaptive convergence are empirical estimates; neither establishes exact RTP, target agreement or unseen-event coverage.",
    ];
    if (report.sampling) lines.push(`Spins accepted: ${report.sampling.acceptedSubrounds}; completed paid rounds: ${report.rounds}; carried spins: ${report.sampling.carriedSubrounds ?? 0}; excluded unfinished/restored spins: ${report.sampling.excludedSubrounds}. Independent session per worker.`);
    if (report.diagnostics) {
        const d = report.diagnostics;
        lines.push(`Precision: ${describeSimulationPrecision(d.precision)}; usable samples: ${d.samples} ${describeSampleUnit(d.sampleUnit)}; combined 95% interval half-width: ${formatRtpUnitsAsPercentagePoints(d.achievedRtpHalfWidth)}; stop reason: ${report.stopReason === undefined ? "unavailable" : describeSimulationStopReason(report.stopReason)}.`, ...d.coverageLimitations);
    } else lines.push("Persisted precision/support diagnostics unavailable (legacy report).");
    if (report.convergence) lines.push(`Adaptive convergence summary: worst interval half-width ${formatRtpUnitsAsPercentagePoints(report.convergence.achievedRtpHalfWidth)}; tolerance ${formatRtpUnitsAsPercentagePoints(report.convergence.rtpTolerance)}; minimum samples per worker ${report.convergence.minRounds}; stable checks ${report.convergence.consecutiveStableChecks}/${report.convergence.stableChecks}. This is separate from the combined report interval.`);
    if (report.payoutHistogram) lines.push(`Payout bucket counts (paid rounds; payout multiples of the bet; labels are half-open [a, b) unless marked legacy): ${describePayoutHistogramBuckets(report.payoutHistogram)}.`);
    if (!includeSelectionCoverage) return lines;
    if (report.weightedBonus) {
        const b = report.weightedBonus;
        lines.push(`Weighted bonus ${b.tableId}: ${b.selections} eligible selections; ${b.completed} completed; ${b.incomplete} incomplete.`);
        for (const o of b.outcomes) lines.push(`Bonus ${o.id}: weight ${o.weight}; probability ${o.probability}; count / eligible selections ${o.count} / ${b.selections}; frequency ${o.frequency}; ${describeWeightedBonusCoverage(o.weight, o.uncovered)}.`);
    }
    for (const reel of report.reelSequences ?? []) {
        lines.push(`Reel ${reel.reelIndex + 1} (${reel.context}): ${reel.selections} eligible selections.`);
        for (const v of reel.variants) lines.push(`Variant ${v.id}: weight ${v.weight}; probability ${v.probability === 0 && v.weight > 0 ? `${v.probabilityRatio?.numerator}/${v.probabilityRatio?.denominator}` : v.probability}; count / selections ${v.count} / ${reel.selections}; frequency ${v.frequency}; ${describeSequenceVariantCoverage(v.weight, v.uncovered)}.`);
    }
    return lines;
}

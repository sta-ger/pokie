import type {SimulationReport} from "./SimulationReport.js";
import {describeWeightedBonusCoverage} from "../session/videoslot/authored/WeightedBonus.js";
import {describeSequenceVariantCoverage} from "../session/videoslot/combinations/WeightedSequenceVariant.js";

export type SimulationDiagnostics = {
    sampleUnit: "completed-logical-round" | "accepted-subround";
    samples: number;
    achievedRtpHalfWidth: number | null;
    precision: "insufficientSamples" | "uninformative" | "insufficientPrecision" | "empiricalPrecision" | "notRequested";
    coverageLimitations: string[];
};

/** Reads persisted report fields only. It never re-estimates a metric or its denominator. */
export function describeSimulationDiagnostics(report: Pick<SimulationReport,
    "rounds" | "requestedRounds" | "sampling" | "diagnostics" | "stopReason" | "convergence" | "payoutHistogram" | "weightedBonus" | "reelSequences"
>, includeSelectionCoverage = true): string[] {
    const lines = [
        `Sampling: requested budget ${report.requestedRounds} accepted plays; usable samples ${report.rounds} (${report.sampling?.unit ?? "accepted-subround"}).`,
        "Hit frequency, means, volatility, payout histogram, maximum and confidence intervals use this sample population. Monetary totals and monetary RTP include all accepted plays.",
        "Normal-approximation 95% confidence intervals and adaptive convergence are empirical estimates; neither establishes exact RTP, target agreement or unseen-event coverage.",
    ];
    if (report.sampling) lines.push(`Accepted plays: ${report.sampling.acceptedSubrounds}; completed logical rounds: ${report.rounds}; carried observations: ${report.sampling.carriedSubrounds ?? 0}; excluded unfinished/restored tails: ${report.sampling.excludedSubrounds}. Independent session per worker.`);
    if (report.diagnostics) {
        const d = report.diagnostics;
        lines.push(`Precision: ${d.precision}; usable samples: ${d.samples} ${d.sampleUnit}; merged interval half-width: ${d.achievedRtpHalfWidth ?? "unavailable"} RTP units; stop reason: ${report.stopReason ?? "unavailable"}.`, ...d.coverageLimitations);
    } else lines.push("Persisted precision/support diagnostics unavailable (legacy report).");
    if (report.convergence) lines.push(`Adaptive per-worker summary: worst half-width ${report.convergence.achievedRtpHalfWidth ?? "unavailable (no check)"} RTP units; tolerance ${report.convergence.rtpTolerance}; minimum samples per worker ${report.convergence.minRounds}; stable checks ${report.convergence.consecutiveStableChecks}/${report.convergence.stableChecks}. This is separate from the merged report interval.`);
    if (report.payoutHistogram) lines.push(`Payout distribution (currency amounts; sample population above; bins 0, (0,10), [10,100), [100,infinity); legacy keys 0,1-9,10-99,100+): ${JSON.stringify(report.payoutHistogram)}.`);
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

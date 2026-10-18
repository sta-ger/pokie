import type {SimulationStatistics} from "../../simulation/SimulationStatistics.js";
import type {MathTarget, OptimizationRequest, OptimizationSampleEvidence} from "../OptimizationPolicy.js";

export function sampledEstimates(targets: MathTarget[], statistics: SimulationStatistics): number[] {
    const observations = statistics.observations;
    if (!observations || observations.observations !== statistics.rounds) throw new Error("Missing complete sampled metric coverage.");
    let bucket = 0;
    return targets.map(target => {
        switch (target.metric) {
            case "rtp": return statistics.rtp;
            case "hitFrequency": return statistics.rounds ? statistics.hitCount / statistics.rounds : 0;
            case "featureFrequency": return observations.events[observations.request.events.indexOf(target.event!)] / statistics.rounds;
            case "distribution": return observations.buckets[bucket++] / statistics.rounds;
            default: throw new Error("Unsupported sampled metric reached assessment.");
        }
    });
}
/** One fixed held-out assessment, simultaneous two-sided Hoeffding bounds (Bonferroni).
 * Uses a structural support bound, never a sample maximum or a zero-variance normal interval.
 */
export function assessOptimizationSample(request: OptimizationRequest, statistics: SimulationStatistics, bound: number, seed: string, stopReason: string): OptimizationSampleEvidence {
    const sampling = request.policy.sampling!;
    const estimates = sampledEstimates(request.targets, statistics);
    const sampleCount = statistics.rounds;
    const delta = (1 - sampling.confidence) / request.targets.length;
    let bucket = 0;
    const population: OptimizationSampleEvidence["population"] = {scope: request.policy.scope};
    if (request.policy.scope === "native-outcomes") population.nativeOutcomes = sampleCount;
    else {
        population.paidEntries = sampleCount;
        if (request.policy.scope === "logical-round") population.completedLogicalRounds = sampleCount;
    }
    return {authority: "sampled-bounded", population, seed, requestedSamples: sampling.assessmentSamples, actualSamples: sampleCount, returnBound: bound, stopReason, estimates,
        targets: request.targets.map((target, index) => {
            const estimate = estimates[index];
            const allowance = target.tolerance?.kind === "relative" ? target.value * target.tolerance.value : target.tolerance?.value ?? 0;
            const toleranceRegion = {low: target.value - allowance, high: target.value + allowance};
            const range = target.metric === "rtp" ? bound : 1;
            const margin = sampleCount ? range * Math.sqrt(Math.log(2 / delta) / (2 * sampleCount)) : range;
            const confidence = {low: Math.max(0, estimate - margin), high: Math.min(range, estimate + margin)};
            let successes = statistics.hitCount;
            if (target.metric === "featureFrequency") successes = statistics.observations!.events[statistics.observations!.request.events.indexOf(target.event!)];
            if (target.metric === "distribution") successes = statistics.observations!.buckets[bucket++];
            const usable = sampleCount >= sampling.minSamples && sampleCount === sampling.assessmentSamples && stopReason === "maxRounds" && Number.isFinite(estimate);
            const covered = successes >= sampling.minEventCount && sampleCount - successes >= sampling.minEventCount;
            const attained = usable && covered && allowance > 0 && confidence.low >= toleranceRegion.low && confidence.high <= toleranceRegion.high;
            const missed = usable && covered && (confidence.high < toleranceRegion.low || confidence.low > toleranceRegion.high);
            let verdict: OptimizationSampleEvidence["targets"][number]["verdict"] = "inconclusive";
            let reason = "uncertainty overlaps tolerance boundary";
            if (attained) {
                verdict = "attained";
                reason = "entire joint confidence interval lies in tolerance region";
            } else if (missed) {
                verdict = "missed";
                reason = "confidence interval excludes tolerance region; no domain infeasibility proof";
            } else if (!usable) reason = "insufficient or incomplete assessment";
            else if (!covered) reason = "insufficient success/failure event coverage";
            else if (allowance === 0) reason = "exact numerical equality cannot be certified by sampling";
            return {observations: sampleCount, successes, failures: sampleCount - successes, estimate, confidence, toleranceRegion, verdict, reason};
        }),};
}

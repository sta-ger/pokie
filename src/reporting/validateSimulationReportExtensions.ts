import {emptyFeatureAnalytics, featureAnalyticsStatistics, FEATURE_NAMES} from "../simulation/FeatureAnalytics.js";

/** Optional saved structures must be complete when supplied; missing analytics remains legacy support. */
export function validateSimulationReportExtensions(value: Record<string, unknown>): void {
    const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
    const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    const matches = (v: unknown, template: unknown): boolean => {
        if (typeof template === "number") return finite(v) && v >= 0;
        if (template === null) return v === null || typeof v === "string";
        if (Array.isArray(template)) return Array.isArray(v) && (template.length === 0 || v.every(item => matches(item, template[0])));
        if (object(template)) return object(v) && Object.entries(template).every(([key, example]) => matches(v[key], example));
        return typeof v === typeof template;
    };
    const fail = (field: string): never => {
        throw new Error(`Invalid simulation report ${field}; regenerate the saved report from the matching runtime.`);
    };
    if (value.analytics !== undefined) {
        const a = value.analytics;
        const template = featureAnalyticsStatistics(emptyFeatureAnalytics());
        if (!matches(a, template) || !object(a)) fail("analytics schema");
        else {
            const envelope = a.envelope as typeof template.envelope;
            if (envelope.schemaVersion !== 1 || envelope.eventVersion !== 1 || envelope.policy !== template.envelope.policy || !envelope.supportedFeatures.every(name => FEATURE_NAMES.includes(name))) fail("analytics provenance");
            const record = (v: unknown, example: unknown) => object(v) && Object.values(v).every(item => matches(item, example));
            const ratio = {numerator: 0, denominator: 0, value: 0};
            if (!record(a.betModes, 0) || !record(a.components, {type: "", id: "", symbol: null, occurrences: 0, samples: 0, amount: 0}) ||
                !record(a.betModeContribution, {rtp: ratio, payoutShare: ratio}) || !record(a.hits, {}) || !record(a.hitRates, {})) fail("analytics dimensions");
            for (const kind of ["symbol", "line", "scatter"]) {
                if (!record((a.hits as Record<string, unknown>)[kind], 0) || !record((a.hitRates as Record<string, unknown>)[kind], ratio)) fail("analytics hit rates");
            }
            if ((a.topWins as unknown[]).length > 10 || !(a.topWins as unknown[]).every(n => finite(n) && n > 0)) fail("analytics top wins");
            for (const f of Object.values(a.features as typeof template.features)) if (f.durationHistogram.length !== 4 || f.winHistogram.length !== 4) fail("analytics histograms");
        }
    }
    if (value.sampling !== undefined && (!object(value.sampling) || value.sampling.unit !== "completed-logical-round" || value.sampling.trajectories !== "independent-session-per-worker" || !finite(value.sampling.acceptedSubrounds) || !finite(value.sampling.excludedSubrounds) || (value.sampling.carriedSubrounds !== undefined && !finite(value.sampling.carriedSubrounds)))) fail("sampling");
    if (value.logicalRounds !== undefined && !matches(value.logicalRounds, {rounds: 0, steps: 0, totalStake: 0, totalWin: 0})) fail("logical rounds");
    for (const field of ["rtpConfidenceInterval95", "averagePayoutConfidenceInterval95"]) if (value[field] !== undefined && (!object(value[field]) || !finite(value[field].low) || !finite(value[field].high) || value[field].low > value[field].high)) fail(field);
    if (value.diagnostics !== undefined) {
        const d = value.diagnostics;
        if (!object(d) || !["completed-logical-round", "accepted-subround"].includes(String(d.sampleUnit)) || !finite(d.samples) || !(d.achievedRtpHalfWidth === null || finite(d.achievedRtpHalfWidth)) || !["insufficientSamples", "uninformative", "insufficientPrecision", "empiricalPrecision", "notRequested"].includes(String(d.precision)) || !Array.isArray(d.coverageLimitations) || !d.coverageLimitations.every(s => typeof s === "string")) fail("diagnostics");
    }
    if (value.weightedBonus !== undefined && !matches(value.weightedBonus, {tableId: "", model: "", selections: 0, completed: 0, incomplete: 0, outcomes: [{id: "", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false}]})) fail("weighted bonus");
    if (value.reelSequences !== undefined && (!Array.isArray(value.reelSequences) || !value.reelSequences.every(reel => matches(reel, {reelIndex: 0, context: "", model: "", selections: 0, variants: [{id: "", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false}]})))) fail("reel sequences");
}

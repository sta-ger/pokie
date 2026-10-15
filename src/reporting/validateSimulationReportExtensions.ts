import {emptyFeatureAnalytics, featureAnalyticsStatistics, FEATURE_NAMES} from "../simulation/FeatureAnalytics.js";

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const count = (v: unknown): v is number => nonnegative(v) && Number.isSafeInteger(v);
function fail(field: string): never {
    throw new Error(`Invalid simulation report ${field}; regenerate the saved report from the matching runtime.`);
}
function requireObject(value: unknown, field: string): Record<string, unknown> {
    if (!object(value)) fail(field);
    return value;
}
function check(value: unknown, predicate: (v: unknown) => boolean, field: string): void {
    if (!predicate(value)) fail(field);
}
function shape(value: unknown, template: unknown, field: string): void {
    if (typeof template === "number") check(value, nonnegative, field);
    else if (template === null) check(value, v => v === null || typeof v === "string", field);
    else if (Array.isArray(template)) {
        if (!Array.isArray(value)) fail(field);
        if (template.length) value.forEach((item, index) => shape(item, template[0], `${field}[${index}]`));
    } else if (object(template)) {
        const record = requireObject(value, field);
        for (const [key, example] of Object.entries(template)) shape(record[key], example, `${field}.${key}`);
    } else check(value, v => typeof v === typeof template, field);
}
function dimensions(value: unknown, template: unknown, field: string): void {
    for (const [key, item] of Object.entries(requireObject(value, field))) shape(item, template, `${field}.${key}`);
}
function counts(value: Record<string, unknown>, keys: string[], field: string): void {
    for (const key of keys) check(value[key], count, `${field}.${key}`);
}
function interval(value: unknown, field: string): void {
    const range = requireObject(value, field);
    check(range.low, finite, `${field}.low`);
    check(range.high, finite, `${field}.high`);
    if ((range.low as number) > (range.high as number)) fail(field);
}
function halfWidth(value: unknown, field: string): void {
    check(value, v => v === null || nonnegative(v), field);
}
function probabilityRatio(value: unknown, field: string, weight: number): void {
    const ratio = requireObject(value, field);
    if (Object.keys(ratio).some(key => key !== "numerator" && key !== "denominator")) fail(field);
    for (const key of ["numerator", "denominator"]) check(ratio[key], v => typeof v === "string" && (/^(0|[1-9][0-9]*)$/).test(v), `${field}.${key}`);
    // Compare decimal integers exactly: converting to Number would erase tiny positive probabilities.
    const numerator = BigInt(ratio.numerator as string),
        denominator = BigInt(ratio.denominator as string);
    if (denominator === BigInt(0)) fail(`${field}.denominator`);
    if (numerator > denominator || (weight > 0 ? numerator === BigInt(0) : numerator !== BigInt(0))) fail(`${field}.numerator`);
}
function selections(value: unknown, field: string, reel: boolean): void {
    const record = requireObject(value, field);
    shape(record, reel ? {reelIndex: 0, context: "", model: "", selections: 0, variants: []} : {tableId: "", model: "", selections: 0, completed: 0, incomplete: 0, outcomes: []}, field);
    counts(record, reel ? ["reelIndex", "selections"] : ["selections", "completed", "incomplete"], field);
    const key = reel ? "variants" : "outcomes";
    (record[key] as unknown[]).forEach((item, index) => {
        const path = `${field}.${key}[${index}]`;
        shape(item, {id: "", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false}, path);
        const outcome = item as Record<string, unknown>;
        counts(outcome, ["count"], path);
        for (const probability of ["probability", "frequency"]) if ((outcome[probability] as number) > 1) fail(`${path}.${probability}`);
        if (outcome.probabilityRatio !== undefined) probabilityRatio(outcome.probabilityRatio, `${path}.probabilityRatio`, outcome.weight as number);
    });
}

/** Optional saved structures must be complete when supplied; missing analytics remains legacy support. */
export function validateSimulationReportExtensions(value: Record<string, unknown>, prefix = ""): void {
    const path = (key: string) => `${prefix}${key}`;
    for (const field of ["rounds", "requestedRounds"]) if (value[field] !== undefined) check(value[field], count, path(field));
    if (value.analytics !== undefined) {
        const a = requireObject(value.analytics, path("analytics"));
        const template = featureAnalyticsStatistics(emptyFeatureAnalytics());
        shape(a, template, path("analytics"));
        counts(a, ["subrounds", "paidEntries", "logicalEntries", "logicalCompletions", "carriedSubrounds", "cascadeSteps", "deadSpins", "maxWinCount"], path("analytics"));
        const envelope = a.envelope as typeof template.envelope;
        if (envelope.schemaVersion !== 1 || envelope.eventVersion !== 1 || envelope.policy !== template.envelope.policy || !envelope.supportedFeatures.every(name => FEATURE_NAMES.includes(name))) fail(path("analytics.envelope provenance"));
        if (a.unit !== template.unit || a.zeroConvention !== template.zeroConvention) fail(path("analytics sample conventions"));
        const ratio = {numerator: 0, denominator: 0, value: 0};
        dimensions(a.betModes, 0, path("analytics.betModes"));
        dimensions(a.components, {type: "", id: "", symbol: null, occurrences: 0, samples: 0, amount: 0}, path("analytics.components"));
        dimensions(a.betModeContribution, {rtp: ratio, payoutShare: ratio}, path("analytics.betModeContribution"));
        for (const kind of ["symbol", "line", "scatter"]) {
            dimensions((a.hits as Record<string, unknown>)[kind], 0, path(`analytics.hits.${kind}`));
            dimensions((a.hitRates as Record<string, unknown>)[kind], ratio, path(`analytics.hitRates.${kind}`));
        }
        if ((a.topWins as unknown[]).length > 10 || !(a.topWins as unknown[]).every(n => finite(n) && n > 0)) fail(path("analytics.topWins"));
        for (const [name, feature] of Object.entries(a.features as Record<string, unknown>)) {
            const field = path(`analytics.features.${name}`);
            // Validate every supplied record before reading its histograms, including unknown feature keys.
            shape(feature, template.features.freeGames, field);
            const f = feature as Record<string, unknown>;
            counts(f, ["entries", "entrySubrounds", "retriggers", "grants", "completions", "excludedCompletions", "durationSum"], field);
            for (const histogram of ["durationHistogram", "winHistogram"]) {
                const bins = f[histogram] as unknown[];
                if (bins.length !== 4) fail(`${field}.${histogram}`);
                bins.forEach((bin, index) => check(bin, count, `${field}.${histogram}[${index}]`));
            }
        }
        dimensions(a.lifecycle, template.lifecycle.freeGames, path("analytics.lifecycle"));
    }
    if (value.sampling !== undefined) {
        const sampling = requireObject(value.sampling, path("sampling"));
        if (sampling.unit !== "completed-logical-round") fail(path("sampling.unit"));
        if (sampling.trajectories !== "independent-session-per-worker") fail(path("sampling.trajectories"));
        counts(sampling, ["acceptedSubrounds", "excludedSubrounds"], path("sampling"));
        if (sampling.carriedSubrounds !== undefined) check(sampling.carriedSubrounds, count, path("sampling.carriedSubrounds"));
    }
    if (value.logicalRounds !== undefined) {
        shape(value.logicalRounds, {rounds: 0, steps: 0, totalStake: 0, totalWin: 0}, path("logicalRounds"));
        counts(value.logicalRounds as Record<string, unknown>, ["rounds", "steps"], path("logicalRounds"));
    }
    for (const field of ["rtpConfidenceInterval95", "averagePayoutConfidenceInterval95"]) if (value[field] !== undefined) interval(value[field], path(field));
    if (value.diagnostics !== undefined) {
        const d = requireObject(value.diagnostics, path("diagnostics"));
        if (!["completed-logical-round", "accepted-subround"].includes(String(d.sampleUnit))) fail(path("diagnostics.sampleUnit"));
        check(d.samples, count, path("diagnostics.samples"));
        halfWidth(d.achievedRtpHalfWidth, path("diagnostics.achievedRtpHalfWidth"));
        if (!["insufficientSamples", "uninformative", "insufficientPrecision", "empiricalPrecision", "notRequested"].includes(String(d.precision))) fail(path("diagnostics.precision"));
        check(d.coverageLimitations, v => Array.isArray(v) && v.every(s => typeof s === "string"), path("diagnostics.coverageLimitations"));
    }
    if (value.convergence !== undefined) {
        const c = requireObject(value.convergence, path("convergence"));
        counts(c, ["minRounds", "checkIntervalRounds", "stableChecks", "checksPerformed", "consecutiveStableChecks"], path("convergence"));
        check(c.rtpTolerance, v => nonnegative(v) && v > 0, path("convergence.rtpTolerance"));
        halfWidth(c.achievedRtpHalfWidth, path("convergence.achievedRtpHalfWidth"));
    }
    if (value.modifiers !== undefined) counts(requireObject(value.modifiers, path("modifiers")), ["steps", "ruleApplications", "stickySteps", "multipliedComponents"], path("modifiers"));
    if (value.weightedBonus !== undefined) selections(value.weightedBonus, path("weightedBonus"), false);
    if (value.reelSequences !== undefined) {
        if (!Array.isArray(value.reelSequences)) fail(path("reelSequences"));
        value.reelSequences.forEach((reel, index) => selections(reel, path(`reelSequences[${index}]`), true));
    }
}

/** Historical native reports feed statistics directly into the builder, before a report exists. */
export function validateSimulationStatisticsForReport(value: unknown, field = "statistics"): void {
    const statistics = requireObject(value, field);
    validateSimulationReportExtensions(statistics, `${field}.`);
    counts(statistics, ["rounds", "hitCount"], field);
    for (const key of ["totalBet", "totalPayout", "rtp", "volatility", "maxWin"]) check(statistics[key], nonnegative, `${field}.${key}`);
    for (const key of ["rtpConfidenceInterval95", "averagePayoutConfidenceInterval95"]) interval(statistics[key], `${field}.${key}`);
    dimensions(statistics.payoutHistogram, 0, `${field}.payoutHistogram`);
    for (const [key, bin] of Object.entries(statistics.payoutHistogram as Record<string, unknown>)) check(bin, count, `${field}.payoutHistogram.${key}`);
    if (statistics.logicalSampling !== undefined) counts(requireObject(statistics.logicalSampling, `${field}.logicalSampling`), ["carriedSubrounds", "excludedSubrounds"], `${field}.logicalSampling`);
    if (statistics.logicalRoundMetrics !== undefined) validateSimulationStatisticsForReport(statistics.logicalRoundMetrics, `${field}.logicalRoundMetrics`);
}

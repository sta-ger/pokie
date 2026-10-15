import {SimulationAccumulator} from "../../../src/simulation/SimulationAccumulator.js";
import {SimulationReportBuilder} from "../../../src/reporting/SimulationReportBuilder.js";
import {analyticsEnvelope, type FeatureAnalyticsObservation} from "../../../src/simulation/FeatureAnalytics.js";

export const envelope = analyticsEnvelope("known-answer", true, true);
export const component = (amount: number, type = "line", id = "L", symbol: string | null = "A", partition: "base" | "feature" | "jackpot" = "base") => ({
    amount,
    type,
    id,
    symbol,
    partition,
});
export const observation = (overrides: Partial<FeatureAnalyticsObservation> = {}): FeatureAnalyticsObservation => ({
    envelope,
    source: "one",
    logicalEntry: true,
    logicalCompletion: true,
    carriedSubround: false,
    cascadeSteps: 0,
    mode: "base",
    components: [],
    features: [],
    ...overrides,
});
export const corpus: Array<[number, number, FeatureAnalyticsObservation]> = [
    [
        8,
        6,
        observation({
            logicalCompletion: false,
            components: [component(2), component(2, "scatter", "S", "S"), component(2, "jackpot", "mini", null, "jackpot")],
            features: [{feature: "freeGames", entry: true, granted: 1}],
        }),
    ],
    [
        0,
        4,
        observation({
            logicalEntry: false,
            logicalCompletion: false,
            cascadeSteps: 3,
            components: [component(2, "line", "L", "A", "feature"), component(2, "line", "L", "A", "feature")],
            features: [{feature: "freeGames", retrigger: true, granted: 1}],
        }),
    ],
    [0, 0, observation({logicalEntry: false, features: [{feature: "freeGames", completion: {duration: 2, win: 4}}]})],
    [
        8,
        10,
        observation({
            mode: "buy",
            components: [component(10, "value", "bonus", "bonus", "feature")],
            features: [{feature: "weightedBonus", entry: true, completion: {duration: 0, win: 10}}],
        }),
    ],
    [
        8,
        10,
        observation({
            components: [component(10), component(0, "value", "bonus", "bonus", "feature")],
            features: [{feature: "weightedBonus", entry: true, completion: {duration: 0, win: 0}}],
        }),
    ],
];
export function aggregate(rows = corpus) {
    const a = new SimulationAccumulator();
    for (const row of rows) a.addRound(...row);
    return a;
}
export const ratio = (numerator: number, denominator: number, value: number) => ({numerator, denominator, value});


/** The V2 known-answer corpus is also the renderer/download fixture authority. */
export function featureAnalyticsReport(kind: "empty" | "incomplete" | "populated" = "populated") {
    const rows = kind === "empty" ? [] : corpus.slice(0, kind === "incomplete" ? 1 : corpus.length);
    const accumulator = aggregate(rows);
    if (!rows.length) accumulator.configureAnalytics(envelope);
    accumulator.enableLogicalRoundSampling();
    if (kind === "populated") {
        accumulator.addLogicalRound({rounds: 1, steps: 3, totalStake: 8, totalWin: 10});
        accumulator.addLogicalRound({rounds: 1, steps: 1, totalStake: 8, totalWin: 10});
        accumulator.addLogicalRound({rounds: 1, steps: 1, totalStake: 8, totalWin: 10});
    }
    accumulator.addLogicalSamplingRanges([{trajectory: "fixture", observed: rows.length ? [[0, rows.length]] : [], completed: kind === "populated" ? [[0, rows.length]] : []}]);
    return new SimulationReportBuilder().build({manifest: {id: "analytics-fixture", name: "Analytics fixture", version: "1"}, requestedRounds: rows.length, statistics: accumulator.getStatistics(), configHash: envelope.modelId ?? undefined, durationMs: 1});
}

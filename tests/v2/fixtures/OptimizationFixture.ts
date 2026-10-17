import type {OptimizationRequest} from "../../../src/optimization/OptimizationPolicy.js";
export const optimizationBlueprint = () => ({
    manifest: {id: "opt", name: "Optimization", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    reelStrips: [["A", "B", "B", "B"], ["A"]],
    paytable: {A: {2: 2}, B: {2: 0}},
    paylines: [[0, 0]],
    availableBets: [0.05, 7.5, 1e-7, 1],
});
export const optimizationRequest = (): OptimizationRequest => ({
    targets: [{metric: "rtp", unit: "ratio", value: 0.75}],
    policy: {
        strategy: "exact-finite-v1",
        seed: "known-answer",
        budget: 3,
        maxOutcomes: 100,
        stake: 1,
        mode: "base",
        scope: "logical-round",
        tunables: [{path: "/paytable/A/2", values: [2, 3, 4]}],
        locks: ["/paylines", "/reelStrips", "/paytable/B", "/availableBets"],
    },
});
export const stochasticOptimizationRequest = (): OptimizationRequest => {
    const request = optimizationRequest();
    request.policy.strategy = "seeded-search-v1";
    request.policy.sampling = {
        searchSamples: 400, searchBudget: 1200, assessmentSamples: 6000,
        minSamples: 1000, minEventCount: 5, confidence: 0.95, chunkSize: 100, workers: 1,
    };
    request.targets[0].tolerance = {kind: "absolute", value: 0.15};
    return request;
};

export const declaredOptimizationGameCode = `const p = require('@fromstan/pokie');
const data = require('./parameters.json');
function config() {
 const c = new p.VideoSlotConfig(); c.setAvailableBets(data.availableBets); c.setReelsNumber(data.reels); c.setReelsSymbolsNumber(data.rows);
 c.setAvailableSymbols(data.symbols); c.setWildSymbols([]); c.setScatterSymbols([]);
 c.setSymbolsSequences(data.reelStrips.map(s => new p.SymbolsSequence().fromArray(s)));
 const lines = new p.CustomLinesDefinitions(); data.paylines.forEach((line,i) => lines.setLineDefinition(String(i), line)); c.setLinesDefinitions(lines);
 const table = new p.Paytable(data.availableBets); for (const [symbol, amounts] of Object.entries(data.paytable)) for (const [count, amount] of Object.entries(amounts)) table.setPayoutForSymbol(symbol, Number(count), amount); c.setPaytable(table); return c;
}
module.exports = {getManifest: () => data.manifest, getConfigHash: () => p.computeGameBlueprintHash(data),
 createSession() { const c = config(); return new p.VideoSlotSession(c, new p.SymbolsCombinationsGenerator(c, new p.SeededRandomNumberGenerator(1))); },
 createExactEnumerationSession(forced) { return new p.VideoSlotSession(config(), forced); }};
`;

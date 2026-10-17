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

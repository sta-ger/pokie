import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

const base: GameBlueprint = {
    manifest: {id: "gallery-lines", name: "Lines · fractional stakes", version: "1"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B", "Z", "S"],
    wilds: [],
    scatters: [],
    availableBets: [0.05, 7.5, 1e-7],
    reelStrips: [
        ["A", "B", "Z", "S"],
        ["A", "B", "Z", "S"],
    ],
    paylines: [[0, 0]],
    paytable: {A: {2: 4}, B: {2: 0}, S: {2: 0}},
};
const example = (id: string, name: string, description: string, changes: Partial<GameBlueprint>) => ({
    id,
    name,
    description,
    blueprint: JSON.parse(
        JSON.stringify({...structuredClone(base), ...changes, manifest: {id: `gallery-${id}`, name, version: "1"}}),
    ) as GameBlueprint,
});
export const galleryModels = [
    example(
        "lines",
        "Lines & zero payouts",
        "Two reels, one line. A/A pays 4×; B/B explicitly pays zero; Z has no paytable entry. Try 0.05, 7.5 or 1e-7.",
        {},
    ),
    example("ways", "All ways", "Three rows evaluated by the shared ways calculator.", {
        rows: 3,
        paylines: undefined,
        winModel: {type: "ways"},
        paytable: {A: {2: 1}, B: {2: 0}},
    }),
    example(
        "clusters",
        "Connected clusters",
        "Connected groups use the canonical cluster evaluator, with explicit zero and missing pays.",
        {rows: 2, paylines: undefined, winModel: {type: "clusters", minimumClusterSize: 2}, paytable: {A: {2: 1, 3: 2, 4: 3}, B: {2: 0}}},
    ),
    example(
        "free-games",
        "Free games & analytics",
        "Two scatters grant two free games; one scatter explicitly grants zero. Reports separate accepted steps, completed logical rounds and incomplete tails.",
        {
            scatters: ["S"],
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "ante", runtimeType: "ante", costMultiplier: 1.5},
            ],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {1: 0, 2: 2}}},
        },
    ),
    example(
        "weighted",
        "Weighted whole sequences",
        "Each paid entry chooses a whole reel variant. Continuations retain it; reports show selection and coverage counts.",
        {
            reelStrips: undefined,
            reelSequences: [
                {
                    type: "weighted",
                    variants: [
                        {id: "A", symbols: ["A", "A"], weight: 1},
                        {id: "B", symbols: ["B", "B"], weight: 3},
                    ],
                },
                {type: "exact", symbols: ["A", "A"]},
            ],
        },
    ),
    example(
        "projection",
        "Generated → evaluated → visible",
        "Three generated rows; only the middle row is evaluated and visible. Highlights use visible coordinates, while payout uses evaluated coordinates.",
        {
            rows: 1,
            paylines: [[0, 0]],
            screenGeometry: {
                generated: {reels: 2, rows: 3},
                evaluated: {rowOffset: 1, rows: 1},
                visible: {rowOffset: 1, rows: 1},
                paylineSpace: "evaluated",
            },
        },
    ),
    example(
        "optimize",
        "Tune a Blueprint",
        "Bounded seeded search over A/A payout. Preview search and held-out confidence evidence, then explicitly apply the same-type candidate.",
        {},
    ),
];
export const galleryPolicy = {
    targets: [{metric: "rtp", unit: "ratio", value: 0.5, tolerance: {kind: "absolute", value: 0.5}}],
    policy: {
        strategy: "seeded-search-v1",
        seed: "gallery-29",
        budget: 3,
        maxOutcomes: 64,
        mode: "base",
        stake: 0.05,
        scope: "paid-entry",
        tunables: [{path: "/paytable/A/2", values: [2, 4, 6]}],
        locks: ["/reelStrips", "/availableBets", "/paytable/B"],
        sampling: {
            searchSamples: 256,
            searchBudget: 768,
            assessmentSamples: 2048,
            minSamples: 30,
            minEventCount: 5,
            confidence: 0.95,
            chunkSize: 64,
            workers: 1,
        },
    },
};

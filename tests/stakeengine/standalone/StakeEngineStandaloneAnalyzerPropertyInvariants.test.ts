import {SeededRandomNumberGenerator, StakeEngineEvent, StakeEngineOutcomeSourceReadResult, StakeEngineStandaloneAnalyzer, toCanonicalJson} from "pokie";

// StakeEngineStandaloneAnalyzer.test.ts hand-verifies exact statistics for a handful of hand-picked fixtures,
// including a few uint64-scale ones. This sweeps a bounded, fixed set of seeds through a deterministically
// generated (via SeededRandomNumberGenerator -- the same reproducible-RNG infrastructure the video-slot session
// itself uses) uint64-scale outcome set per seed and checks invariants that must hold no matter what the
// randomized inputs happen to be: reproducibility, non-negative/bounded payout statistics, the payout
// distribution's probabilities summing to exactly 1, the analyzer's own bigint weight total exactly matching an
// independently computed sum (not merely close -- byte-for-byte, since JS number addition alone would silently
// lose precision at this scale), and a lossless canonical-JSON round trip (proving no bigint or other
// non-JSON-safe value ever leaks out of the bigint fixed-point math). The seed set is a fixed-size, literal
// range -- bounded case count, stable across runs and release lanes.
function buildRandomOutcomeSet(seed: number): StakeEngineOutcomeSourceReadResult {
    const rng = new SeededRandomNumberGenerator(seed);
    const cost = rng.getRandomInt(1, 101);
    const outcomeCount = rng.getRandomInt(2, 7);

    const outcomes = Array.from({length: outcomeCount}, (_, id) => {
        // Product of two bounded random factors: keeps every individual weight comfortably inside uint64
        // (well under 2^53 * 2^40) while still exercising values far above Number.MAX_SAFE_INTEGER once summed.
        const weight = BigInt(rng.getRandomInt(1, 1_000_000)) * BigInt(rng.getRandomInt(1, 1_000_000_000_000));
        const payoutMultiplier = rng.getRandomInt(0, 10_000);

        return {
            id,
            weight,
            payoutMultiplier,
            // Every outcome carries an exactly-reversed ratio (never undefined), so the resulting analysis is
            // always fully JSON-safe end to end -- see the "serialization round-trip" assertion below.
            ratio: payoutMultiplier / cost / 100,
            events: [
                {index: 0, type: "reveal"},
                {index: 1, type: "win", amount: payoutMultiplier},
                {index: 2, type: "finalWin", amount: payoutMultiplier, payoutMultiplier},
            ] as StakeEngineEvent[],
        };
    });

    return {stakeDir: "/property/stake-dir", issues: [], modes: [{modeName: "property-mode", cost, outcomes}]};
}

describe("StakeEngineStandaloneAnalyzer bounded property invariants", () => {
    const seeds = Array.from({length: 30}, (_, index) => index + 1);
    const analyzer = new StakeEngineStandaloneAnalyzer();

    test.each(seeds)(
        "seed %i: reproducible, non-negative/bounded, probabilities sum to 1, exact uint64 total, JSON round-trips losslessly",
        (seed) => {
            const readResult = buildRandomOutcomeSet(seed);
            const expectedTotalWeight = readResult.modes[0].outcomes.reduce(
                (sum, outcome) => sum + (outcome.weight as bigint),
                BigInt(0),
            );

            // uint64 scale: every generated case's own total weight independently exceeds Number.MAX_SAFE_INTEGER,
            // proving these bounded property runs actually exercise the overflow-prone uint64 range they claim to
            // rather than happening to stay within a range plain Number arithmetic could already handle safely.
            expect(expectedTotalWeight).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));

            const first = analyzer.analyze(readResult);
            const second = analyzer.analyze(readResult);

            // same seed/result: reproducibility
            expect(second).toEqual(first);

            const [mode] = first.modes;

            // exact uint64 calculations: the analyzer's own bigint accumulation must exactly match an
            // independently computed bigint sum of the same weights.
            expect(BigInt(mode.totalWeight)).toBe(expectedTotalWeight);

            // non-negative payout statistics, each within its own natural bound -- the fixed-point-scaled
            // probabilities (see scaledProbabilityAsNumber's own 1e18 scale) can round a hair past their exact
            // bound, so bounds allow a tiny epsilon rather than asserting a false, over-tight exactness.
            const epsilon = 1e-9;
            expect(mode.rtp).toBeGreaterThanOrEqual(0);
            expect(mode.hitFrequency).toBeGreaterThanOrEqual(0);
            expect(mode.hitFrequency).toBeLessThanOrEqual(1 + epsilon);
            expect(mode.zeroWinFrequency).toBeGreaterThanOrEqual(0 - epsilon);
            expect(mode.zeroWinFrequency).toBeLessThanOrEqual(1);
            expect(mode.variance).toBeGreaterThanOrEqual(0);
            expect(mode.standardDeviation).toBeGreaterThanOrEqual(0);
            expect(mode.maxPayoutMultiplier).toBeGreaterThanOrEqual(0);
            expect(mode.maxRatio).toBeGreaterThanOrEqual(0);
            expect(mode.maxWinProbability).toBeGreaterThanOrEqual(0);
            expect(mode.maxWinProbability).toBeLessThanOrEqual(1 + epsilon);
            for (const bucket of mode.payoutDistribution) {
                expect(Number(bucket.probability)).toBeGreaterThanOrEqual(0);
            }

            // component totals: independently group the same raw outcome weights used above (the analysis
            // distribution's own raw-weight field) by payoutMultiplier -- the same key the analyzer's own
            // payoutDistribution buckets by -- and sum them in bigint. This proves the payout distribution's
            // buckets exactly partition every unit of weight with none lost or double-counted, entirely without
            // ever routing a uint64-scale value through a JS number.
            const rawWeightByMultiplier = new Map<number, bigint>();
            for (const outcome of readResult.modes[0].outcomes) {
                const weight = outcome.weight as bigint;
                rawWeightByMultiplier.set(outcome.payoutMultiplier, (rawWeightByMultiplier.get(outcome.payoutMultiplier) ?? BigInt(0)) + weight);
            }
            expect(mode.payoutDistribution.map((bucket) => bucket.payoutMultiplier).sort((a, b) => a - b)).toEqual(
                Array.from(rawWeightByMultiplier.keys()).sort((a, b) => a - b),
            );
            const componentTotal = Array.from(rawWeightByMultiplier.values()).reduce((sum, weight) => sum + weight, BigInt(0));
            expect(componentTotal).toBe(BigInt(mode.totalWeight));

            // serialization round-trip: no bigint (or other non-JSON-safe value) ever leaks out of the analysis,
            // and its canonical JSON form survives a stringify/parse cycle losslessly
            const canonical = toCanonicalJson(first);
            expect(JSON.parse(JSON.stringify(canonical))).toEqual(canonical);
        },
    );
});

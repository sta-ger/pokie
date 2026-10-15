import {analyticsEnvelope} from "../../src/simulation/FeatureAnalytics.js";
import {AggregateSimulationRunner, GameSession, GameSessionConfig, SimulationAccumulator} from "@fromstan/pokie";

describe("SimulationAccumulator", () => {
    test("addRound tracks total bet, total payout, rounds, and hit count", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(10, 0);
        accumulator.addRound(10, 50);
        accumulator.addRound(10, 0);

        const stats = accumulator.getStatistics();
        expect(stats.rounds).toBe(3);
        expect(stats.totalBet).toBe(30);
        expect(stats.totalPayout).toBe(50);
        expect(stats.hitCount).toBe(1);
        expect(stats.maxWin).toBe(50);
    });

    test("rtp reflects total payout over total bet for a constant bet size", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(10, 5);
        accumulator.addRound(10, 15);

        const stats = accumulator.getStatistics();
        expect(stats.rtp).toBeCloseTo(stats.totalPayout / stats.totalBet, 10);
    });

    test("hit frequency (hitCount / rounds) is correct for a mix of winning and losing rounds", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        accumulator.addRound(1, 3);
        accumulator.addRound(1, 0);
        accumulator.addRound(1, 7);

        const stats = accumulator.getStatistics();
        expect(stats.hitCount / stats.rounds).toBe(0.5);
    });

    test("confidence intervals do not throw or produce NaN on a single round", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(10, 20);

        const stats = accumulator.getStatistics();
        expect(stats.rounds).toBe(1);
        expect(Number.isNaN(stats.averagePayoutConfidenceInterval95.low)).toBe(false);
        expect(Number.isNaN(stats.averagePayoutConfidenceInterval95.high)).toBe(false);
        expect(Number.isNaN(stats.rtpConfidenceInterval95.low)).toBe(false);
        expect(Number.isNaN(stats.rtpConfidenceInterval95.high)).toBe(false);
        // a single sample has zero variance, so the interval collapses to the point estimate
        expect(stats.averagePayoutConfidenceInterval95).toEqual({low: stats.averagePayout, high: stats.averagePayout});
    });

    test("a freshly constructed accumulator (0 rounds) reports zeroed-out statistics without NaN or throwing", () => {
        const accumulator = new SimulationAccumulator();

        const stats = accumulator.getStatistics();
        expect(stats.rounds).toBe(0);
        expect(stats.totalBet).toBe(0);
        expect(stats.totalPayout).toBe(0);
        expect(stats.hitCount).toBe(0);
        expect(stats.rtp).toBe(0);
        expect(stats.averagePayout).toBe(0);
        expect(Number.isNaN(stats.rtp)).toBe(false);
        expect(Number.isNaN(stats.payoutStandardDeviation)).toBe(false);
        expect(stats.averagePayoutConfidenceInterval95).toEqual({low: 0, high: 0});
        expect(stats.rtpConfidenceInterval95).toEqual({low: 0, high: 0});
    });

    test("accepts a zero-stake free continuation but rejects a negative stake", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(0, 5);
        expect(() => accumulator.addRound(-10, 5)).toThrow(/bet >= 0/);

        expect(accumulator.getStatistics()).toMatchObject({rounds: 1, totalBet: 0, totalPayout: 5, rtp: 0});
    });

    test("rejects NaN/Infinity before any accumulator state is mutated", () => {
        const accumulator = new SimulationAccumulator();
        for (const [bet, payout] of [[Number.NaN, 1], [Infinity, 1], [1, Number.NaN], [1, Infinity], [1, -1]]) {
            expect(() => accumulator.addRound(bet, payout)).toThrow(/finite/);
            expect(accumulator.getStatistics().rounds).toBe(0);
        }
    });

    test("rejects an invalid worker snapshot before it can contaminate a merge", () => {
        const accumulator = new SimulationAccumulator();
        const snapshot = accumulator.toSnapshot();
        snapshot.totalPayout = Number.NaN;
        expect(() => SimulationAccumulator.fromSnapshot(snapshot)).toThrow(/invalid totalPayout/);
        expect(accumulator.getStatistics().rounds).toBe(0);
    });

    test("snapshot ranges retain independent prefix/tail provenance, union chunks and reject malformed coordinates", () => {
        const sample = new SimulationAccumulator();
        sample.enableLogicalRoundSampling();
        sample.addLogicalSamplingRanges([{trajectory: "one", observed: [[1, 10]], completed: [[0, 9]]}]);
        const snapshot = sample.toSnapshot();
        const restored = SimulationAccumulator.fromSnapshot(snapshot);
        snapshot.logicalSamplingRanges![0].observed[0][0] = 0;
        expect(restored.getStatistics().logicalSampling).toEqual({carriedSubrounds: 1, excludedSubrounds: 1});
        const prefix = new SimulationAccumulator();
        prefix.addLogicalSamplingRanges([{trajectory: "one", observed: [[0, 1]], completed: []}]);
        restored.merge(prefix);
        expect(restored.getStatistics().logicalSampling).toEqual({carriedSubrounds: 0, excludedSubrounds: 1});
        const independent = new SimulationAccumulator();
        independent.addLogicalSamplingRanges([{trajectory: "two", observed: [[0, 1]], completed: []}]);
        restored.merge(independent);
        expect(restored.getStatistics().logicalSampling).toEqual({carriedSubrounds: 0, excludedSubrounds: 2});
        for (const coordinates of [[-1, 0], [1, 0], [0, Infinity], [0, 0.5]]) {
            const invalid = sample.toSnapshot();
            invalid.logicalSamplingRanges![0].observed = [coordinates as [number, number]];
            expect(() => SimulationAccumulator.fromSnapshot(invalid)).toThrow(/logical sampling/);
        }
    });

    test("merging two populated accumulators combines their totals exactly", () => {
        const left = new SimulationAccumulator();
        left.addRound(10, 0);
        left.addRound(10, 20);
        const right = new SimulationAccumulator();
        right.addRound(10, 5);
        right.addRound(10, 0);
        right.addRound(10, 15);

        left.merge(right);
        const stats = left.getStatistics();

        expect(stats.rounds).toBe(5);
        expect(stats.totalBet).toBe(50);
        expect(stats.totalPayout).toBe(40);
        expect(stats.hitCount).toBe(3);
        expect(stats.maxWin).toBe(20);
    });

    test("merging into an empty accumulator adopts the other side's stats unchanged", () => {
        const empty = new SimulationAccumulator();
        const populated = new SimulationAccumulator();
        populated.addRound(10, 30);
        populated.addRound(10, 0);

        empty.merge(populated);

        expect(empty.getStatistics()).toEqual(populated.getStatistics());
    });

    test("merging an empty accumulator into a populated one is a no-op", () => {
        const populated = new SimulationAccumulator();
        populated.addRound(10, 30);
        const before = populated.getStatistics();

        populated.merge(new SimulationAccumulator());

        expect(populated.getStatistics()).toEqual(before);
    });

    test("merge is order-independent for combined totals (associative aggregation)", () => {
        const a = new SimulationAccumulator();
        a.addRound(10, 0);
        a.addRound(10, 40);
        const b = new SimulationAccumulator();
        b.addRound(20, 10);
        const c = new SimulationAccumulator();
        c.addRound(5, 5);
        c.addRound(5, 0);
        c.addRound(5, 25);

        const abThenC = new SimulationAccumulator();
        abThenC.merge(a);
        abThenC.merge(b);
        abThenC.merge(c);

        const cThenAb = new SimulationAccumulator();
        cThenAb.merge(c);
        cThenAb.merge(a);
        cThenAb.merge(b);

        const left = abThenC.getStatistics();
        const right = cThenAb.getStatistics();
        expect(left.rounds).toBe(right.rounds);
        expect(left.totalBet).toBe(right.totalBet);
        expect(left.totalPayout).toBe(right.totalPayout);
        expect(left.hitCount).toBe(right.hitCount);
        expect(left.rtp).toBeCloseTo(right.rtp, 10);
        expect(left.payoutStandardDeviation).toBeCloseTo(right.payoutStandardDeviation, 10);
    });

    test("variable stakes and free continuations use ratio-of-totals RTP with a finite CI", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 1); // return ratio 1
        accumulator.addRound(100, 0); // return ratio 0
        accumulator.addRound(10, 10); // return ratio 1

        const stats = accumulator.getStatistics();
        expect(stats.rounds).toBe(3);
        expect(stats.totalBet).toBe(111);
        expect(stats.totalPayout).toBe(11);
        expect(stats.rtp).toBeCloseTo(stats.totalPayout / stats.totalBet, 10);
        expect(stats.rtp).toBeCloseTo(11 / 111, 10);
        expect(Number.isFinite(stats.rtpConfidenceInterval95.low)).toBe(true);
        expect(Number.isFinite(stats.rtpConfidenceInterval95.high)).toBe(true);
    });

    test("toSnapshot()/fromSnapshot() round-trips to an equivalent accumulator", () => {
        const original = new SimulationAccumulator();
        original.addRound(10, 0);
        original.addRound(10, 50);
        original.addRound(5, 5);

        const rehydrated = SimulationAccumulator.fromSnapshot(original.toSnapshot());

        expect(rehydrated.getStatistics()).toEqual(original.getStatistics());
    });

    test("fromSnapshot() produces an independent instance — mutating one leaves the other untouched", () => {
        const original = new SimulationAccumulator();
        original.addRound(10, 20);
        const snapshot = original.toSnapshot();
        const rehydrated = SimulationAccumulator.fromSnapshot(snapshot);

        rehydrated.addRound(10, 0);

        expect(rehydrated.getStatistics().rounds).toBe(2);
        expect(original.getStatistics().rounds).toBe(1);
    });

    test("merging two rehydrated-from-snapshot accumulators matches merging the originals directly", () => {
        const left = new SimulationAccumulator();
        left.addRound(10, 0);
        left.addRound(10, 30);
        const right = new SimulationAccumulator();
        right.addRound(5, 5);
        right.addRound(5, 0);

        const direct = new SimulationAccumulator();
        direct.merge(left);
        direct.merge(right);

        const viaSnapshots = new SimulationAccumulator();
        viaSnapshots.merge(SimulationAccumulator.fromSnapshot(left.toSnapshot()));
        viaSnapshots.merge(SimulationAccumulator.fromSnapshot(right.toSnapshot()));

        expect(viaSnapshots.getStatistics()).toEqual(direct.getStatistics());
    });

    test("no NaN appears anywhere in statistics across a realistic, varied run", () => {
        const accumulator = new SimulationAccumulator();
        const bets = [1, 5, 10, 20, 1, 1, 50];
        const payouts = [0, 0, 15, 0, 3, 0, 200];
        bets.forEach((bet, i) => accumulator.addRound(bet, payouts[i]));

        const stats = accumulator.getStatistics();
        Object.values(stats).forEach((value) => {
            if (typeof value === "number") {
                expect(Number.isNaN(value)).toBe(false);
            }
        });
        expect(Number.isNaN(stats.averagePayoutConfidenceInterval95.low)).toBe(false);
        expect(Number.isNaN(stats.rtpConfidenceInterval95.low)).toBe(false);
    });
});

describe("AggregateSimulationRunner", () => {
    test("running 0 rounds returns an empty, zeroed-out accumulator rather than throwing", () => {
        const session = new GameSession(new GameSessionConfig());
        const runner = new AggregateSimulationRunner(session, 0);

        const stats = runner.run().getStatistics();
        expect(stats.rounds).toBe(0);
        expect(stats.totalBet).toBe(0);
        expect(stats.totalPayout).toBe(0);
        expect(Number.isNaN(stats.rtp)).toBe(false);
    });

    test("running exactly 1 round produces a single-round accumulator", () => {
        const config = new GameSessionConfig();
        config.setAvailableBets([10]);
        config.setBet(10);
        config.setCreditsAmount(100);
        const session = new GameSession(config);
        const runner = new AggregateSimulationRunner(session, 1);

        const stats = runner.run().getStatistics();
        expect(stats.rounds).toBe(1);
        expect(stats.totalBet).toBe(10);
    });

    test("stops early if the session can no longer play, without corrupting the accumulator", () => {
        const config = new GameSessionConfig();
        config.setAvailableBets([10]);
        config.setBet(10);
        config.setCreditsAmount(25); // enough for 2 rounds, not 3
        const session = new GameSession(config);
        const runner = new AggregateSimulationRunner(session, 10);

        const stats = runner.run().getStatistics();
        expect(stats.rounds).toBe(2);
        expect(stats.totalBet).toBe(20);
    });
});

it("rejects unbounded imported histogram dimensions without changing the source", () => {
    const accumulator = new SimulationAccumulator();
    accumulator.addRound(1, 0);
    const snapshot = accumulator.toSnapshot();
    snapshot.payoutHistogram["custom-round-1"] = 1;
    expect(() => SimulationAccumulator.fromSnapshot(snapshot)).toThrow(/fixed buckets/);
    expect(Object.keys(accumulator.toSnapshot().payoutHistogram)).toEqual(["0"]);
});

it("keeps older amount-only history readable and appendable without fabricating current provenance", () => {
    const original = new SimulationAccumulator();
    original.addRound(1, 0);
    const snapshot = original.toSnapshot();
    Reflect.deleteProperty(snapshot, "analytics");
    const legacy = SimulationAccumulator.fromSnapshot(snapshot);
    legacy.addRound(1, 0);
    expect(legacy.getStatistics()).toMatchObject({rounds: 2, totalBet: 2});
    expect(legacy.getStatistics().analytics).toBeUndefined();
    const before = legacy.toSnapshot();
    expect(() => legacy.configureAnalytics(analyticsEnvelope("known"))).toThrow(/historical/);
    expect(legacy.toSnapshot()).toEqual(before);
});

it("validates direct merge invariants and modifier observations before mutation", () => {
    const target = new SimulationAccumulator();
    target.addRound(1, 0);
    const before = target.toSnapshot();
    expect(() => target.addModifierStatistics({steps: NaN, ruleApplications: 0, stickySteps: 0, multipliedComponents: 0})).toThrow(/modifier/);
    expect(() => target.addModifierStatistics({} as Parameters<SimulationAccumulator["addModifierStatistics"]>[0])).toThrow(/modifier/);
    const malformed = new SimulationAccumulator();
    Reflect.set(malformed, "totalPayout", Infinity);
    expect(() => target.merge(malformed)).toThrow(/totalPayout/);
    expect(target.toSnapshot()).toEqual(before);
});

const snapshotCorruptions = [
    ["duration without completions", (s: ReturnType<SimulationAccumulator["toSnapshot"]>) => {
        s.analytics!.features.freeGames.durationSum = 100;
    }],
    ["win without completions", (s: ReturnType<SimulationAccumulator["toSnapshot"]>) => {
        s.analytics!.features.freeGames.winSum = 123;
    }],
    ["oversized mode", (s: ReturnType<SimulationAccumulator["toSnapshot"]>) => {
        s.analytics!.betModes["m".repeat(1000000)] = 0;
    }],
    ["empty mode", (s: ReturnType<SimulationAccumulator["toSnapshot"]>) => {
        s.analytics!.betModes[""] = 0;
    }],
    ["conflicting maximum count", (s: ReturnType<SimulationAccumulator["toSnapshot"]>) => {
        s.maxWinCount = 0;
    }],
    ["missing maximum count", (s: ReturnType<SimulationAccumulator["toSnapshot"]>) => {
        Reflect.deleteProperty(s, "maxWinCount");
    }],
] as const;
it.each(snapshotCorruptions)("rejects %s on restoration and direct merge before destination mutation", (_name, corrupt) => {
    const source = new SimulationAccumulator();
    source.addRound(1, 2);
    const malformed = source.toSnapshot();
    corrupt(malformed);
    const input = JSON.stringify(malformed);
    expect(() => SimulationAccumulator.fromSnapshot(malformed)).toThrow(/analytics/i);
    expect(JSON.stringify(malformed)).toBe(input);
    // Bypass restoration deliberately to exercise the public merge boundary independently.
    Reflect.set(source, "analytics", malformed.analytics);
    Reflect.set(source, "maxWinCount", malformed.maxWinCount);
    const target = new SimulationAccumulator();
    target.addRound(1, 3);
    const before = target.toSnapshot();
    expect(() => target.merge(source)).toThrow(/analytics/i);
    expect(target.toSnapshot()).toEqual(before);
});

it("preserves the distinct zero-maximum conventions through restoration and merging", () => {
    const a = new SimulationAccumulator();
    a.addRound(1, 0);
    const restored = SimulationAccumulator.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    restored.merge(a);
    expect(restored.toSnapshot()).toMatchObject({maxWin: 0, maxWinCount: 0, analytics: {maxWin: 0, maxWinCount: 2}});
    expect(restored.getStatistics()).toMatchObject({maxWinFrequency: 0, analytics: {maxWinRate: {value: 1}}});
    a.addRound(1, 2);
    restored.merge(SimulationAccumulator.fromSnapshot(a.toSnapshot()));
    expect(restored.toSnapshot()).toMatchObject({maxWin: 2, maxWinCount: 1, analytics: {maxWin: 2, maxWinCount: 1}});
});

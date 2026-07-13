import {AggregateSimulationRunner, GameSession, GameSessionConfig, SimulationAccumulator} from "pokie";

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

    test("addRound rejects a non-positive bet with a clear error instead of corrupting the running stats", () => {
        const accumulator = new SimulationAccumulator();
        expect(() => accumulator.addRound(0, 5)).toThrow(/bet > 0/);
        expect(() => accumulator.addRound(-10, 5)).toThrow(/bet > 0/);

        // the rejected rounds must not have been counted
        expect(accumulator.getStatistics().rounds).toBe(0);
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

    test("variable bet sizes do not break aggregation: rtp uses per-round return ratios, not raw payout averages", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 1); // return ratio 1
        accumulator.addRound(100, 0); // return ratio 0
        accumulator.addRound(10, 10); // return ratio 1

        const stats = accumulator.getStatistics();
        expect(stats.rounds).toBe(3);
        expect(stats.totalBet).toBe(111);
        expect(stats.totalPayout).toBe(11);
        // rtp is the mean of per-round ratios (1, 0, 1) / 3, not totalPayout / totalBet
        expect(stats.rtp).toBeCloseTo(2 / 3, 10);
        expect(stats.rtp).not.toBeCloseTo(stats.totalPayout / stats.totalBet, 5);
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

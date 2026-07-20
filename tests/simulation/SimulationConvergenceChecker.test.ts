import {SimulationAccumulator, SimulationConvergenceChecker} from "pokie";

function accumulatorWithZeroVariance(rounds: number): SimulationAccumulator {
    const accumulator = new SimulationAccumulator();
    for (let i = 0; i < rounds; i++) {
        accumulator.addRound(1, 1); // constant RTP of 1.0, zero variance -> halfWidth is always 0
    }
    return accumulator;
}

describe("SimulationConvergenceChecker", () => {
    test("never converges before minRounds, even with zero variance (halfWidth 0)", () => {
        const checker = new SimulationConvergenceChecker({minRounds: 100, rtpTolerance: 0.01, checkIntervalRounds: 10});

        const result = checker.check(accumulatorWithZeroVariance(10), 10);

        expect(result.converged).toBe(false);
        expect(result.consecutiveStableChecks).toBe(0);
        expect(result.achievedRtpHalfWidth).toBe(0);
    });

    test("requires stableChecks consecutive satisfying checks (default 3) before converging", () => {
        const checker = new SimulationConvergenceChecker({minRounds: 20, rtpTolerance: 0.01, checkIntervalRounds: 10});

        const first = checker.check(accumulatorWithZeroVariance(10), 10); // below minRounds
        const second = checker.check(accumulatorWithZeroVariance(20), 20); // 1st satisfying check
        const third = checker.check(accumulatorWithZeroVariance(30), 30); // 2nd satisfying check
        const fourth = checker.check(accumulatorWithZeroVariance(40), 40); // 3rd satisfying check -> converged

        expect(first.converged).toBe(false);
        expect(second.converged).toBe(false);
        expect(second.consecutiveStableChecks).toBe(1);
        expect(third.converged).toBe(false);
        expect(third.consecutiveStableChecks).toBe(2);
        expect(fourth.converged).toBe(true);
        expect(fourth.consecutiveStableChecks).toBe(3);
    });

    test("a failing check resets the consecutive-stable counter to zero", () => {
        const checker = new SimulationConvergenceChecker({minRounds: 10, rtpTolerance: 0.01, checkIntervalRounds: 10, stableChecks: 2});

        const good1 = checker.check(accumulatorWithZeroVariance(10), 10);
        // Below minRounds even though rounds increased -- simulates a caller re-checking mid-run with a
        // fresh, smaller accumulator (e.g. a different worker share); the point is any unsatisfying
        // check resets the streak regardless of why it failed.
        const bad = checker.check(accumulatorWithZeroVariance(5), 5);
        const good2 = checker.check(accumulatorWithZeroVariance(20), 20);
        const good3 = checker.check(accumulatorWithZeroVariance(30), 30);

        expect(good1.consecutiveStableChecks).toBe(1);
        expect(bad.consecutiveStableChecks).toBe(0);
        expect(good2.consecutiveStableChecks).toBe(1);
        expect(good2.converged).toBe(false);
        expect(good3.consecutiveStableChecks).toBe(2);
        expect(good3.converged).toBe(true);
    });

    test("respects a custom stableChecks value", () => {
        const checker = new SimulationConvergenceChecker({minRounds: 10, rtpTolerance: 0.01, checkIntervalRounds: 10, stableChecks: 1});

        const result = checker.check(accumulatorWithZeroVariance(10), 10);

        expect(result.converged).toBe(true);
    });

    test("never converges when the confidence interval half-width exceeds rtpTolerance", () => {
        const accumulator = new SimulationAccumulator();
        // Alternating 0/2 payouts on a bet of 1 gives real variance (RTP mean 1.0, but never exactly 1
        // per round), so the confidence interval never fully collapses to 0.
        for (let i = 0; i < 100; i++) {
            accumulator.addRound(1, i % 2 === 0 ? 0 : 2);
        }
        const checker = new SimulationConvergenceChecker({minRounds: 10, rtpTolerance: 0.0000001, checkIntervalRounds: 10});

        const result = checker.check(accumulator, 100);

        expect(result.converged).toBe(false);
        expect(result.achievedRtpHalfWidth).toBeGreaterThan(0);
    });

    test("buildOutcome() reflects the options and the last check's results", () => {
        const checker = new SimulationConvergenceChecker({minRounds: 20, rtpTolerance: 0.01, checkIntervalRounds: 10, stableChecks: 2});

        checker.check(accumulatorWithZeroVariance(10), 10);
        checker.check(accumulatorWithZeroVariance(20), 20);
        checker.check(accumulatorWithZeroVariance(30), 30);

        expect(checker.buildOutcome()).toEqual({
            minRounds: 20,
            rtpTolerance: 0.01,
            checkIntervalRounds: 10,
            stableChecks: 2,
            checksPerformed: 3,
            consecutiveStableChecks: 2,
            achievedRtpHalfWidth: 0,
        });
    });

    test("buildOutcome() defaults stableChecks to 3 when the caller didn't set one", () => {
        const checker = new SimulationConvergenceChecker({minRounds: 1, rtpTolerance: 0.01, checkIntervalRounds: 1});

        expect(checker.buildOutcome().stableChecks).toBe(3);
    });
});

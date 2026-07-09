import {SimulationReport, SimulationReportDiffer} from "pokie";

const reproducibility = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    seed: "demo",
    requestedRounds: 10000,
    actualRounds: 9800,
    command: "pokie sim <packageRoot> --rounds 10000 --seed demo",
};

const left: SimulationReport = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    requestedRounds: 10000,
    rounds: 9800,
    seed: "demo",
    totalBet: 9800,
    totalWin: 9331.4,
    rtp: 0.9522,
    hitFrequency: 0.241,
    maxWin: 120.5,
    durationMs: 1234,
    spinsPerSecond: 7942,
    reproducibility,
    warnings: [],
    recommendations: [],
};

const right: SimulationReport = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    requestedRounds: 10000,
    rounds: 9850,
    seed: "demo",
    totalBet: 9850,
    totalWin: 9400,
    rtp: 0.9543,
    hitFrequency: 0.245,
    maxWin: 130,
    durationMs: 1300,
    spinsPerSecond: 7900,
    reproducibility,
    warnings: [],
    recommendations: [],
};

describe("SimulationReportDiffer", () => {
    it("reports unchanged game/seed metadata with changed: false", () => {
        const diff = new SimulationReportDiffer().diff(left, right);

        expect(diff.game).toEqual({
            left: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            right: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            changed: false,
        });
        expect(diff.seed).toEqual({left: "demo", right: "demo", changed: false});
    });

    it("flags game metadata as changed when id/name/version differ", () => {
        const diff = new SimulationReportDiffer().diff(left, {...right, game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.2.0"}});

        expect(diff.game.changed).toBe(true);
    });

    it("flags seed as changed when it differs", () => {
        const diff = new SimulationReportDiffer().diff(left, {...right, seed: "other-seed"});

        expect(diff.seed.changed).toBe(true);
    });

    it("computes left/right/delta for every numeric metric", () => {
        const diff = new SimulationReportDiffer().diff(left, right);

        expect(diff.rounds).toEqual({left: 9800, right: 9850, delta: 50, percentDelta: diff.rounds.percentDelta});
        expect(diff.rounds.percentDelta).toBeCloseTo((50 / 9800) * 100, 5);
        expect(diff.totalBet.delta).toBeCloseTo(50, 5);
        expect(diff.totalWin.delta).toBeCloseTo(68.6, 5);
        expect(diff.durationMs).toEqual({left: 1234, right: 1300, delta: 66, percentDelta: diff.durationMs.percentDelta});
        expect(diff.spinsPerSecond.delta).toBe(-42);
    });

    it("computes rtp/hitFrequency/maxWin deltas", () => {
        const diff = new SimulationReportDiffer().diff(left, right);

        expect(diff.rtp.left).toBe(0.9522);
        expect(diff.rtp.right).toBe(0.9543);
        expect(diff.rtp.delta).toBeCloseTo(0.0021, 10);
        expect(diff.hitFrequency.delta).toBeCloseTo(0.004, 10);
        expect(diff.maxWin.delta).toBeCloseTo(9.5, 5);
    });

    it("sets percentDelta to null when the left value is 0, instead of Infinity/NaN", () => {
        const zeroLeft: SimulationReport = {...left, maxWin: 0};

        const diff = new SimulationReportDiffer().diff(zeroLeft, right);

        expect(diff.maxWin.percentDelta).toBeNull();
        expect(diff.maxWin.left).toBe(0);
        expect(diff.maxWin.right).toBe(130);
    });

    it("produces no warnings for a small, unremarkable change", () => {
        const diff = new SimulationReportDiffer().diff(left, right);

        expect(diff.warnings).toEqual([]);
    });

    it("warns when RTP changes by more than the default threshold (1 percentage point)", () => {
        const bigRtpChange: SimulationReport = {...right, rtp: left.rtp + 0.02};

        const diff = new SimulationReportDiffer().diff(left, bigRtpChange);

        expect(diff.warnings.some((warning) => warning.startsWith("RTP changed by"))).toBe(true);
    });

    it("warns when hit frequency changes by more than the default threshold", () => {
        const bigHitFrequencyChange: SimulationReport = {...right, hitFrequency: left.hitFrequency + 0.05};

        const diff = new SimulationReportDiffer().diff(left, bigHitFrequencyChange);

        expect(diff.warnings.some((warning) => warning.startsWith("Hit frequency changed by"))).toBe(true);
    });

    it("warns when max win changes by more than the default percent threshold", () => {
        const bigMaxWinChange: SimulationReport = {...right, maxWin: left.maxWin * 2};

        const diff = new SimulationReportDiffer().diff(left, bigMaxWinChange);

        expect(diff.warnings.some((warning) => warning.startsWith("Max win changed by"))).toBe(true);
    });

    it("warns when max win goes from 0 to a positive value", () => {
        const zeroLeft: SimulationReport = {...left, maxWin: 0};

        const diff = new SimulationReportDiffer().diff(zeroLeft, right);

        expect(diff.warnings).toContain("Max win went from 0 to 130.00");
    });

    it("respects custom thresholds passed to the constructor", () => {
        const strictDiffer = new SimulationReportDiffer(0.001, 0.001, 1);

        const diff = strictDiffer.diff(left, right);

        expect(diff.warnings.length).toBe(3);
        expect(diff.warnings.some((warning) => warning.startsWith("RTP changed by"))).toBe(true);
        expect(diff.warnings.some((warning) => warning.startsWith("Hit frequency changed by"))).toBe(true);
        expect(diff.warnings.some((warning) => warning.startsWith("Max win changed by"))).toBe(true);
    });
});

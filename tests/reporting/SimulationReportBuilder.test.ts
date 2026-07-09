import {PokieGameManifest, SimulationAccumulator, SimulationReportBuilder} from "pokie";

describe("SimulationReportBuilder", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    test("maps manifest id/name/version into the report's game field, dropping other manifest fields", () => {
        const fullManifest: PokieGameManifest = {...manifest, description: "A fruity slot", author: "sta-ger"};
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest: fullManifest, requestedRounds: 1, statistics: accumulator.getStatistics(), durationMs: 10});

        expect(report.game).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
    });

    test("carries totalBet/totalWin/rtp/maxWin straight from the statistics", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(10, 0);
        accumulator.addRound(10, 50);
        accumulator.addRound(10, 0);
        const statistics = accumulator.getStatistics();
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 3, statistics, durationMs: 10});

        expect(report.rounds).toBe(3);
        expect(report.totalBet).toBe(statistics.totalBet);
        expect(report.totalWin).toBe(statistics.totalPayout);
        expect(report.rtp).toBe(statistics.rtp);
        expect(report.maxWin).toBe(statistics.maxWin);
    });

    test("computes hitFrequency as hitCount / rounds", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        accumulator.addRound(1, 3);
        accumulator.addRound(1, 0);
        accumulator.addRound(1, 7);
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 4, statistics: accumulator.getStatistics(), durationMs: 10});

        expect(report.hitFrequency).toBe(0.5);
    });

    test("hitFrequency is 0 when no rounds were played", () => {
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 100, statistics: new SimulationAccumulator().getStatistics(), durationMs: 10});

        expect(report.hitFrequency).toBe(0);
    });

    test("preserves requestedRounds separately from the actual rounds played", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

        expect(report.requestedRounds).toBe(100);
        expect(report.rounds).toBe(1);
    });

    test("defaults seed to null when not given, and passes it through otherwise", () => {
        const statistics = new SimulationAccumulator().getStatistics();
        const builder = new SimulationReportBuilder();

        const withoutSeed = builder.build({manifest, requestedRounds: 0, statistics, durationMs: 10});
        const withSeed = builder.build({manifest, requestedRounds: 0, statistics, durationMs: 10, seed: "demo"});

        expect(withoutSeed.seed).toBeNull();
        expect(withSeed.seed).toBe("demo");
    });

    test("computes spinsPerSecond from rounds and durationMs", () => {
        const accumulator = new SimulationAccumulator();
        for (let i = 0; i < 100; i++) {
            accumulator.addRound(1, 0);
        }
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 1000});

        expect(report.spinsPerSecond).toBe(100);
    });

    test("does not divide by zero when durationMs is 0", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 1, statistics: accumulator.getStatistics(), durationMs: 0});

        expect(Number.isFinite(report.spinsPerSecond)).toBe(true);
    });

    test("passes durationMs through unchanged", () => {
        const builder = new SimulationReportBuilder();

        const report = builder.build({manifest, requestedRounds: 0, statistics: new SimulationAccumulator().getStatistics(), durationMs: 842});

        expect(report.durationMs).toBe(842);
    });
});

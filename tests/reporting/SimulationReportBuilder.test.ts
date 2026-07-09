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

    function buildHealthyReport(overrides: Partial<{seed: string; packageRoot: string}> = {}) {
        const accumulator = new SimulationAccumulator();
        for (let i = 0; i < 9999; i++) {
            accumulator.addRound(1, 0);
        }
        accumulator.addRound(1, 5);
        const builder = new SimulationReportBuilder();

        return builder.build({
            manifest,
            requestedRounds: 10000,
            seed: overrides.seed ?? "demo",
            statistics: accumulator.getStatistics(),
            durationMs: 1000,
            packageRoot: overrides.packageRoot,
        });
    }

    describe("reproducibility", () => {
        test("includes game/seed/requested/actual rounds mirroring the top-level report", () => {
            const report = buildHealthyReport();

            expect(report.reproducibility.game).toEqual(report.game);
            expect(report.reproducibility.seed).toBe(report.seed);
            expect(report.reproducibility.requestedRounds).toBe(report.requestedRounds);
            expect(report.reproducibility.actualRounds).toBe(report.rounds);
        });

        test("builds a re-run command with a placeholder packageRoot when none was given", () => {
            const report = buildHealthyReport();

            expect(report.reproducibility.command).toBe("pokie sim <packageRoot> --rounds 10000 --seed demo");
        });

        test("builds a re-run command using the given packageRoot", () => {
            const report = buildHealthyReport({packageRoot: "./crazy-fruits"});

            expect(report.reproducibility.command).toBe("pokie sim ./crazy-fruits --rounds 10000 --seed demo");
        });

        test("omits --seed from the re-run command when no seed was given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.reproducibility.command).toBe("pokie sim <packageRoot> --rounds 100");
        });
    });

    describe("warnings", () => {
        test("produces no warnings for a healthy report (seeded, enough rounds, hits, wins, bets)", () => {
            const report = buildHealthyReport();

            expect(report.warnings).toEqual([]);
        });

        test("warns when no seed was given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings.some((warning) => warning.includes("No seed was provided"))).toBe(true);
        });

        test("warns when requestedRounds is below the low-rounds threshold", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings.some((warning) => warning.includes("Requested rounds (100) is low"))).toBe(true);
        });

        test("does not warn about low rounds at/above the threshold", () => {
            const report = buildHealthyReport();

            expect(report.warnings.some((warning) => warning.includes("is low"))).toBe(false);
        });

        test("warns when hit frequency is 0", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 1, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings).toContain("Hit frequency is 0 — no round produced a win.");
        });

        test("warns when max win is 0", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 1, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings).toContain("Max win is 0 — no round produced a payout.");
        });

        test("warns when total bet is 0", () => {
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 1,
                seed: "demo",
                statistics: new SimulationAccumulator().getStatistics(),
                durationMs: 10,
            });

            expect(report.warnings).toContain("Total bet is 0 — no rounds appear to have been played.");
        });

        test("warns when actual rounds is less than requested rounds", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 5);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings.some((warning) => warning.includes("Actual rounds (1) is less than requested rounds (100)"))).toBe(true);
        });
    });

    describe("recommendations", () => {
        test("recommends running with a seed when none was given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.recommendations.some((recommendation) => recommendation.includes("--seed <value>"))).toBe(true);
        });

        test("does not recommend a seed when one was already given", () => {
            const report = buildHealthyReport();

            expect(report.recommendations.some((recommendation) => recommendation.includes("--seed <value>"))).toBe(false);
        });

        test("recommends increasing rounds when requestedRounds is below the low-rounds threshold", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.recommendations.some((recommendation) => recommendation.includes("Increase --rounds"))).toBe(true);
        });

        test("always recommends using pokie diff after changing the game's math", () => {
            const report = buildHealthyReport();

            expect(report.recommendations.some((recommendation) => recommendation.includes('"pokie diff"'))).toBe(true);
        });

        test("always recommends saving the report via --out", () => {
            const report = buildHealthyReport();

            expect(report.recommendations.some((recommendation) => recommendation.includes("--out"))).toBe(true);
        });
    });
});

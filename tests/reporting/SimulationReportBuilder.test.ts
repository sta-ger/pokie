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

    describe("workers", () => {
        test("defaults to 1 when not given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.workers).toBe(1);
        });

        test("carries through an explicit workers count", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 100,
                statistics: accumulator.getStatistics(),
                durationMs: 10,
                workers: 4,
            });

            expect(report.workers).toBe(4);
        });

        test("omits --workers from the re-run command when workers is 1 (or unset)", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.reproducibility!.command).not.toContain("--workers");
        });

        test("includes --workers N in the re-run command when workers > 1", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 100,
                statistics: accumulator.getStatistics(),
                durationMs: 10,
                workers: 4,
            });

            expect(report.reproducibility!.command).toBe("pokie sim <packageRoot> --rounds 100 --workers 4");
        });

        test("carries through workerSeedStrategy into the reproducibility block when given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 100,
                statistics: accumulator.getStatistics(),
                durationMs: 10,
                workers: 4,
                workerSeedStrategy: "deterministic per-worker derivation",
            });

            expect(report.reproducibility!.workerSeedStrategy).toBe("deterministic per-worker derivation");
        });
    });

    describe("reproducibility", () => {
        test("includes game/seed/requested/actual rounds mirroring the top-level report", () => {
            const report = buildHealthyReport();

            expect(report.reproducibility!.game).toEqual(report.game);
            expect(report.reproducibility!.seed).toBe(report.seed);
            expect(report.reproducibility!.requestedRounds).toBe(report.requestedRounds);
            expect(report.reproducibility!.actualRounds).toBe(report.rounds);
        });

        test("builds a re-run command with a placeholder packageRoot when none was given", () => {
            const report = buildHealthyReport();

            expect(report.reproducibility!.command).toBe("pokie sim <packageRoot> --rounds 10000 --seed demo");
        });

        test("builds a re-run command using the given packageRoot", () => {
            const report = buildHealthyReport({packageRoot: "./crazy-fruits"});

            expect(report.reproducibility!.command).toBe("pokie sim ./crazy-fruits --rounds 10000 --seed demo");
        });

        test("omits --seed from the re-run command when no seed was given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.reproducibility!.command).toBe("pokie sim <packageRoot> --rounds 100");
        });

        test("treats a blank/whitespace-only seed the same as no seed at all (no dangling --seed)", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "   ", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.reproducibility!.command).toBe("pokie sim <packageRoot> --rounds 100");
        });

        test("treats a blank/whitespace-only packageRoot the same as no packageRoot at all", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 100,
                seed: "demo",
                statistics: accumulator.getStatistics(),
                durationMs: 10,
                packageRoot: "  ",
            });

            expect(report.reproducibility!.command).toBe("pokie sim <packageRoot> --rounds 100 --seed demo");
        });

        test("never contains a double space, regardless of seed/packageRoot", () => {
            const withSeedAndRoot = buildHealthyReport({packageRoot: "./crazy-fruits"});
            const withoutSeedOrRoot = (() => {
                const accumulator = new SimulationAccumulator();
                accumulator.addRound(1, 0);
                return new SimulationReportBuilder().build({
                    manifest,
                    requestedRounds: 100,
                    statistics: accumulator.getStatistics(),
                    durationMs: 10,
                });
            })();

            expect(withSeedAndRoot.reproducibility!.command).not.toContain("  ");
            expect(withoutSeedOrRoot.reproducibility!.command).not.toContain("  ");
        });
    });

    describe("warnings", () => {
        test("produces no warnings for a healthy report (seeded, enough rounds, hits, wins, bets)", () => {
            const report = buildHealthyReport();

            expect(report.warnings!).toEqual([]);
        });

        test("warns when no seed was given", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings!.some((warning) => warning.includes("No seed was provided"))).toBe(true);
        });

        test("warns when the seed is blank/whitespace-only, same as no seed", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "   ", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings!.some((warning) => warning.includes("No seed was provided"))).toBe(true);
        });

        test("warns when requestedRounds is below the low-rounds threshold", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings!.some((warning) => warning.includes("Requested rounds (100) is low"))).toBe(true);
        });

        test("does not warn about low rounds at/above the threshold", () => {
            const report = buildHealthyReport();

            expect(report.warnings!.some((warning) => warning.includes("is low"))).toBe(false);
        });

        test("warns when hit frequency is 0", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 1, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings!).toContain("Hit frequency is 0 — no round produced a win.");
        });

        test("warns when max win is 0", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 1, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings!).toContain("Max win is 0 — no round produced a payout.");
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

            expect(report.warnings!).toContain("Total bet is 0 — no rounds appear to have been played.");
        });

        test("warns when actual rounds is less than requested rounds", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 5);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.warnings!.some((warning) => warning.includes("Actual rounds (1) is less than requested rounds (100)"))).toBe(true);
        });
    });

    describe("recommendations", () => {
        test("recommends running with a seed when none was given, with a concrete example (not a dangling flag)", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.recommendations!.some((recommendation) => recommendation.includes("--seed <seed>"))).toBe(true);
            expect(report.recommendations!.some((recommendation) => recommendation.includes("--seed demo"))).toBe(true);
            expect(report.recommendations!.some((recommendation) => recommendation.includes("--seed  "))).toBe(false);
        });

        test("recommends running with a seed when the given seed is blank/whitespace-only", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "  ", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.recommendations!.some((recommendation) => recommendation.includes("--seed <seed>"))).toBe(true);
        });

        test("does not recommend a seed when one was already given", () => {
            const report = buildHealthyReport();

            expect(report.recommendations!.some((recommendation) => recommendation.includes("--seed <seed>"))).toBe(false);
        });

        test("recommends increasing rounds when requestedRounds is below the low-rounds threshold", () => {
            const accumulator = new SimulationAccumulator();
            accumulator.addRound(1, 0);
            const builder = new SimulationReportBuilder();

            const report = builder.build({manifest, requestedRounds: 100, seed: "demo", statistics: accumulator.getStatistics(), durationMs: 10});

            expect(report.recommendations!.some((recommendation) => recommendation.includes("Increase --rounds"))).toBe(true);
        });

        test("always recommends using pokie diff after changing the game's math", () => {
            const report = buildHealthyReport();

            expect(report.recommendations!.some((recommendation) => recommendation.includes('"pokie diff"'))).toBe(true);
        });

        test("always recommends saving the report via --out", () => {
            const report = buildHealthyReport();

            expect(report.recommendations!.some((recommendation) => recommendation.includes("--out"))).toBe(true);
        });
    });

    describe("breakdown", () => {
        function statisticsWithRounds(rounds: number) {
            const accumulator = new SimulationAccumulator();
            for (let i = 0; i < rounds; i++) {
                accumulator.addRound(1, 0);
            }
            return accumulator.getStatistics();
        }

        test("old-shape compatibility: report.breakdown is undefined when no breakdown input is given", () => {
            const report = buildHealthyReport();

            expect(report.breakdown).toBeUndefined();
        });

        test("never recommends implementing categorization when breakdown is absent — most games simply don't have the feature", () => {
            const report = buildHealthyReport();

            expect(report.recommendations!.some((recommendation) => recommendation.toLowerCase().includes("breakdown"))).toBe(false);
            expect(report.recommendations!.some((recommendation) => recommendation.includes("StakeAmountDetermining"))).toBe(false);
        });

        test("never warns about the absence of breakdown either", () => {
            const report = buildHealthyReport();

            expect(report.warnings!.some((warning) => warning.toLowerCase().includes("breakdown"))).toBe(false);
        });

        test("wraps a non-empty breakdown input into report.breakdown.components, adding a computed contribution", () => {
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 1,
                seed: "demo",
                statistics: statisticsWithRounds(10),
                durationMs: 10,
                breakdown: {
                    base: {rounds: 8, totalBet: 8, totalWin: 4, rtp: 0.5, hitFrequency: 0.25, maxWin: 4},
                    freeGames: {rounds: 2, totalBet: 2, totalWin: 6, rtp: 3, hitFrequency: 1, maxWin: 6},
                },
            });

            // core.totalBet is 10 (statisticsWithRounds(10) bets 1 per round) — contribution is each
            // category's totalWin divided by that OVERALL totalBet, not the category's own totalBet.
            expect(report.breakdown).toEqual({
                components: {
                    base: {rounds: 8, totalBet: 8, totalWin: 4, rtp: 0.5, contribution: 0.4, hitFrequency: 0.25, maxWin: 4},
                    freeGames: {rounds: 2, totalBet: 2, totalWin: 6, rtp: 3, contribution: 0.6, hitFrequency: 1, maxWin: 6},
                },
            });
        });

        test("orders report.breakdown.components with base first, then alphabetically, regardless of input order", () => {
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 1,
                seed: "demo",
                statistics: statisticsWithRounds(10),
                durationMs: 10,
                breakdown: {
                    respins: {rounds: 1, totalBet: 1, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0},
                    freeGames: {rounds: 1, totalBet: 1, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0},
                    base: {rounds: 6, totalBet: 6, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0},
                    bonus: {rounds: 2, totalBet: 2, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0},
                },
            });

            expect(Object.keys(report.breakdown!.components)).toEqual(["base", "bonus", "freeGames", "respins"]);
        });

        test("contributions across every category sum to the report's overall rtp when breakdown totals are consistent with the statistics", () => {
            const builder = new SimulationReportBuilder();
            const accumulator = new SimulationAccumulator();
            for (let i = 0; i < 8; i++) {
                accumulator.addRound(1, 0.5); // 8 base rounds, bet 8 total, win 4 total
            }
            for (let i = 0; i < 2; i++) {
                accumulator.addRound(1, 3); // 2 freeGames rounds, bet 2 total, win 6 total
            }

            const report = builder.build({
                manifest,
                requestedRounds: 10,
                seed: "demo",
                statistics: accumulator.getStatistics(),
                durationMs: 10,
                breakdown: {
                    base: {rounds: 8, totalBet: 8, totalWin: 4, rtp: 0.5, hitFrequency: 1, maxWin: 0.5},
                    freeGames: {rounds: 2, totalBet: 2, totalWin: 6, rtp: 3, hitFrequency: 1, maxWin: 3},
                },
            });

            expect(report.breakdown!.components.base.contribution + report.breakdown!.components.freeGames.contribution).toBeCloseTo(report.rtp, 10);
        });

        test("treats an empty breakdown input the same as no breakdown at all", () => {
            const builder = new SimulationReportBuilder();

            const report = builder.build({
                manifest,
                requestedRounds: 1,
                seed: "demo",
                statistics: statisticsWithRounds(1),
                durationMs: 10,
                breakdown: {},
            });

            expect(report.breakdown).toBeUndefined();
        });

        describe("no non-base category ever appeared", () => {
            test("warns when this happens over a large sample (rounds >= LOW_ROUNDS_WARNING_THRESHOLD)", () => {
                const builder = new SimulationReportBuilder();

                const report = builder.build({
                    manifest,
                    requestedRounds: SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD,
                    seed: "demo",
                    statistics: statisticsWithRounds(SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD),
                    durationMs: 1000,
                    breakdown: {base: {rounds: SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD, totalBet: 10000, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0}},
                });

                expect(report.warnings!.some((warning) => warning.includes('no non-base category (e.g. "freeGames") ever appeared'))).toBe(true);
            });

            test("does NOT warn over a small sample — avoids a false positive for a rare feature that just hasn't triggered yet", () => {
                const builder = new SimulationReportBuilder();

                const report = builder.build({
                    manifest,
                    requestedRounds: 100,
                    seed: "demo",
                    statistics: statisticsWithRounds(100),
                    durationMs: 10,
                    breakdown: {base: {rounds: 100, totalBet: 100, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0}},
                });

                expect(report.warnings!.some((warning) => warning.includes("ever appeared"))).toBe(false);
            });
        });

        describe("a non-base category triggered but never won", () => {
            test("warns once the category has enough rounds to make an all-zero streak unlikely by chance", () => {
                const builder = new SimulationReportBuilder();

                const report = builder.build({
                    manifest,
                    requestedRounds: 1000,
                    seed: "demo",
                    statistics: statisticsWithRounds(1000),
                    durationMs: 10,
                    breakdown: {
                        base: {rounds: 950, totalBet: 950, totalWin: 800, rtp: 0.842, hitFrequency: 0.2, maxWin: 8},
                        freeGames: {
                            rounds: SimulationReportBuilder.MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING,
                            totalBet: SimulationReportBuilder.MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING,
                            totalWin: 0,
                            rtp: 0,
                            hitFrequency: 0,
                            maxWin: 0,
                        },
                    },
                });

                expect(report.warnings!.some((warning) => warning.includes('"freeGames" triggered 20 times but never produced a win'))).toBe(true);
            });

            test("does NOT warn below the sample-size threshold — a short all-zero streak is normal variance, not a signal", () => {
                const builder = new SimulationReportBuilder();

                const report = builder.build({
                    manifest,
                    requestedRounds: 100,
                    seed: "demo",
                    statistics: statisticsWithRounds(100),
                    durationMs: 10,
                    breakdown: {
                        base: {rounds: 95, totalBet: 95, totalWin: 80, rtp: 0.842, hitFrequency: 0.2, maxWin: 8},
                        freeGames: {
                            rounds: SimulationReportBuilder.MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING - 1,
                            totalBet: SimulationReportBuilder.MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING - 1,
                            totalWin: 0,
                            rtp: 0,
                            hitFrequency: 0,
                            maxWin: 0,
                        },
                    },
                });

                expect(report.warnings!.some((warning) => warning.includes("never produced a win"))).toBe(false);
            });

            test("does not warn when the non-base category has a win", () => {
                const builder = new SimulationReportBuilder();

                const report = builder.build({
                    manifest,
                    requestedRounds: 1000,
                    seed: "demo",
                    statistics: statisticsWithRounds(1000),
                    durationMs: 10,
                    breakdown: {
                        base: {rounds: 950, totalBet: 950, totalWin: 800, rtp: 0.842, hitFrequency: 0.2, maxWin: 8},
                        freeGames: {rounds: 50, totalBet: 50, totalWin: 60, rtp: 1.2, hitFrequency: 0.4, maxWin: 5},
                    },
                });

                expect(report.warnings!.some((warning) => warning.includes("never produced a win"))).toBe(false);
                expect(report.warnings!.some((warning) => warning.includes("ever appeared"))).toBe(false);
            });

            test("evaluates multiple arbitrary non-base categories independently — not just base/freeGames", () => {
                const builder = new SimulationReportBuilder();

                const report = builder.build({
                    manifest,
                    requestedRounds: 1000,
                    seed: "demo",
                    statistics: statisticsWithRounds(1000),
                    durationMs: 10,
                    breakdown: {
                        base: {rounds: 700, totalBet: 700, totalWin: 600, rtp: 0.857, hitFrequency: 0.2, maxWin: 8},
                        // "respins" triggered plenty and won — should stay quiet.
                        respins: {rounds: 250, totalBet: 250, totalWin: 300, rtp: 1.2, hitFrequency: 0.5, maxWin: 6},
                        // "holdAndWin" triggered enough to be a meaningful sample but never won — should warn.
                        holdAndWin: {rounds: 50, totalBet: 50, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0},
                    },
                });

                expect(report.warnings!.some((warning) => warning.includes('"respins"'))).toBe(false);
                expect(report.warnings!.some((warning) => warning.includes('"holdAndWin" triggered 50 times but never produced a win'))).toBe(true);
                expect(report.breakdown!.components.respins).toBeDefined();
                expect(report.breakdown!.components.holdAndWin).toBeDefined();
            });
        });
    });
});

describe("SimulationReportBuilder betMode", () => {
    const manifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    test("without betMode, core metrics come straight from statistics -- fully backward compatible", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        accumulator.addRound(1, 5);
        const builder = new SimulationReportBuilder();

        const report = builder.build({
            manifest,
            requestedRounds: 2,
            statistics: accumulator.getStatistics(),
            durationMs: 10,
            breakdown: {base: {rounds: 2, totalBet: 2, totalWin: 5, rtp: 2.5, hitFrequency: 0.5, maxWin: 5}},
        });

        expect(report.betMode).toBeUndefined();
        expect(report.totalBet).toBe(accumulator.getStatistics().totalBet);
        expect(report.rtp).toBe(accumulator.getStatistics().rtp);
    });

    test("with betMode, core totalBet/totalWin/rtp/hitFrequency/maxWin are derived from the (stake-based) breakdown, not nominal-bet statistics", () => {
        const accumulator = new SimulationAccumulator();
        // Nominal-bet-based statistics a real ante-mode-locked AggregateSimulationRunner would still
        // produce for its OWN accumulator (unconditionally nominal, see its own doc comment) --
        // understates the real 1.25x ante cost, which is exactly why betMode must override this.
        for (let i = 0; i < 100; i++) {
            accumulator.addRound(1, i % 10 === 0 ? 8 : 0);
        }
        const builder = new SimulationReportBuilder();

        const report = builder.build({
            manifest,
            requestedRounds: 100,
            statistics: accumulator.getStatistics(),
            durationMs: 10,
            betMode: "ante",
            breakdown: {base: {rounds: 100, totalBet: 125, totalWin: 80, rtp: 0.64, hitFrequency: 0.1, maxWin: 8}},
        });

        expect(report.betMode).toBe("ante");
        expect(report.totalBet).toBe(125); // the breakdown's stake-based figure, not statistics.totalBet (100)
        expect(report.totalWin).toBe(80);
        expect(report.rtp).toBeCloseTo(80 / 125, 10);
        expect(report.hitFrequency).toBe(0.1);
        expect(report.maxWin).toBe(8);
    });

    test("sums multiple breakdown categories (e.g. a buy-bonus mode's base + freeGames) into the core metrics", () => {
        const statistics = new SimulationAccumulator().getStatistics();
        const builder = new SimulationReportBuilder();

        const report = builder.build({
            manifest,
            requestedRounds: 100,
            statistics,
            durationMs: 10,
            betMode: "buy-bonus",
            breakdown: {
                base: {rounds: 25, totalBet: 1250, totalWin: 900, rtp: 0.72, hitFrequency: 1, maxWin: 40},
                freeGames: {rounds: 75, totalBet: 0, totalWin: 600, rtp: 0, hitFrequency: 0.2, maxWin: 60},
            },
        });

        expect(report.totalBet).toBe(1250); // freeGames' own 0 contributes nothing
        expect(report.totalWin).toBe(1500);
        expect(report.rtp).toBeCloseTo(1500 / 1250, 10);
        expect(report.maxWin).toBe(60);
    });

    test("warns (falling back to nominal statistics) when betMode is set but no breakdown is available", () => {
        const accumulator = new SimulationAccumulator();
        accumulator.addRound(1, 0);
        const builder = new SimulationReportBuilder();

        const report = builder.build({
            manifest,
            requestedRounds: 1,
            statistics: accumulator.getStatistics(),
            durationMs: 10,
            betMode: "ante",
        });

        expect(report.totalBet).toBe(accumulator.getStatistics().totalBet); // fell back, not silently wrong
        expect(report.warnings).toEqual(
            expect.arrayContaining([expect.stringContaining('Bet mode "ante" was locked for this run, but no per-round categorization')]),
        );
    });

    test("includes --mode in the reproducibility re-run command when betMode is set", () => {
        const statistics = new SimulationAccumulator().getStatistics();
        const builder = new SimulationReportBuilder();

        const report = builder.build({
            manifest,
            requestedRounds: 100,
            statistics,
            durationMs: 10,
            packageRoot: "./game",
            betMode: "buy-bonus",
        });

        expect(report.reproducibility!.command).toBe("pokie sim ./game --rounds 100 --mode buy-bonus");
    });
});

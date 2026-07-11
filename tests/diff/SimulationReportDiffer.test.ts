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

    describe("breakdown", () => {
        it("ignores breakdown (leaves diff.breakdown undefined, no warning) when neither report has one — old-shape compatibility", () => {
            const diff = new SimulationReportDiffer().diff(left, right);

            expect(diff.breakdown).toBeUndefined();
            expect(diff.warnings.some((warning) => warning.includes("breakdown"))).toBe(false);
        });

        it("leaves diff.breakdown undefined but warns clearly when only the right report has it", () => {
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {base: {rounds: 9850, totalBet: 9850, totalWin: 9400, rtp: 0.9543, contribution: 0.9543, hitFrequency: 0.245, maxWin: 130}},
                },
            };

            const diff = new SimulationReportDiffer().diff(left, rightWithBreakdown);

            expect(diff.breakdown).toBeUndefined();
            expect(diff.warnings).toContain("Feature-level breakdown comparison skipped — the left report has no breakdown data.");
        });

        it("leaves diff.breakdown undefined but warns clearly when only the left report has it", () => {
            const leftWithBreakdown: SimulationReport = {
                ...left,
                breakdown: {
                    components: {base: {rounds: 9800, totalBet: 9800, totalWin: 9331.4, rtp: 0.9522, contribution: 0.9522, hitFrequency: 0.241, maxWin: 120.5}},
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, right);

            expect(diff.breakdown).toBeUndefined();
            expect(diff.warnings).toContain("Feature-level breakdown comparison skipped — the right report has no breakdown data.");
        });

        it("compares matching categories on both sides when both reports have a breakdown, including contribution", () => {
            const leftWithBreakdown: SimulationReport = {
                ...left,
                breakdown: {
                    components: {
                        base: {rounds: 8820, totalBet: 8820, totalWin: 7938, rtp: 0.9, contribution: 0.81, hitFrequency: 0.2, maxWin: 90},
                        freeGames: {rounds: 980, totalBet: 980, totalWin: 1393.4, rtp: 1.4218367346938776, contribution: 0.14218367346938776, hitFrequency: 0.6, maxWin: 120.5},
                    },
                },
            };
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {
                        base: {rounds: 8850, totalBet: 8850, totalWin: 8000, rtp: 0.9040451977401129, contribution: 0.8121827411167513, hitFrequency: 0.21, maxWin: 95},
                        freeGames: {rounds: 1000, totalBet: 1000, totalWin: 1400, rtp: 1.4, contribution: 0.1421319796954315, hitFrequency: 0.61, maxWin: 130},
                    },
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, rightWithBreakdown);

            expect(diff.breakdown).toBeDefined();
            expect(diff.breakdown!.components.base.rounds).toEqual({left: 8820, right: 8850, delta: 30, percentDelta: diff.breakdown!.components.base.rounds.percentDelta});
            expect(diff.breakdown!.components.base.totalWin.delta).toBeCloseTo(62, 5);
            expect(diff.breakdown!.components.freeGames.totalWin.delta).toBeCloseTo(6.6, 5);
            expect(diff.breakdown!.components.base.contribution.delta).toBeCloseTo(0.0021827411167513, 10);
            expect(diff.breakdown!.components.freeGames.contribution.left).toBeCloseTo(0.14218367346938776, 10);
        });

        it("treats a category missing on one side as zero (left: null, right values only)", () => {
            const leftWithBreakdown: SimulationReport = {
                ...left,
                breakdown: {
                    components: {base: {rounds: 9800, totalBet: 9800, totalWin: 9331.4, rtp: 0.9522, contribution: 0.9522, hitFrequency: 0.241, maxWin: 120.5}},
                },
            };
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {
                        base: {rounds: 8850, totalBet: 8850, totalWin: 8000, rtp: 0.904, contribution: 0.812, hitFrequency: 0.21, maxWin: 95},
                        freeGames: {rounds: 1000, totalBet: 1000, totalWin: 1400, rtp: 1.4, contribution: 0.142, hitFrequency: 0.61, maxWin: 130},
                    },
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, rightWithBreakdown);

            expect(diff.breakdown!.components.freeGames.left).toBeNull();
            expect(diff.breakdown!.components.freeGames.right).not.toBeNull();
            expect(diff.breakdown!.components.freeGames.rounds).toEqual({left: 0, right: 1000, delta: 1000, percentDelta: null});
            expect(diff.breakdown!.components.freeGames.contribution).toEqual({left: 0, right: 0.142, delta: 0.142, percentDelta: null});
        });

        it("handles a category set that changed entirely — one removed, one added, arbitrary custom names", () => {
            // left had a "freeGames" feature; right's build swapped it out for a "bonus" mechanic — an
            // entirely different, non-built-in category name (not base/freeGames at all).
            const leftWithBreakdown: SimulationReport = {
                ...left,
                breakdown: {
                    components: {
                        base: {rounds: 8820, totalBet: 8820, totalWin: 7938, rtp: 0.9, contribution: 0.81, hitFrequency: 0.2, maxWin: 90},
                        freeGames: {rounds: 980, totalBet: 980, totalWin: 1393.4, rtp: 1.42, contribution: 0.1422, hitFrequency: 0.6, maxWin: 120.5},
                    },
                },
            };
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {
                        base: {rounds: 8850, totalBet: 8850, totalWin: 8500, rtp: 0.96, contribution: 0.8629, hitFrequency: 0.4, maxWin: 5},
                        bonus: {rounds: 1000, totalBet: 1000, totalWin: 900, rtp: 0.9, contribution: 0.0914, hitFrequency: 1, maxWin: 3},
                    },
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, rightWithBreakdown);

            expect(Object.keys(diff.breakdown!.components).sort()).toEqual(["base", "bonus", "freeGames"]);
            // freeGames existed only on the left — removed in right.
            expect(diff.breakdown!.components.freeGames.left).not.toBeNull();
            expect(diff.breakdown!.components.freeGames.right).toBeNull();
            expect(diff.breakdown!.components.freeGames.rounds).toEqual({left: 980, right: 0, delta: -980, percentDelta: -100});
            // bonus exists only on the right — added in right.
            expect(diff.breakdown!.components.bonus.left).toBeNull();
            expect(diff.breakdown!.components.bonus.right).not.toBeNull();
            expect(diff.breakdown!.components.bonus.rounds).toEqual({left: 0, right: 1000, delta: 1000, percentDelta: null});
            // base existed on both sides and is compared normally.
            expect(diff.breakdown!.components.base.left).not.toBeNull();
            expect(diff.breakdown!.components.base.right).not.toBeNull();
        });

        it("warns when a category's RTP changes by more than the RTP delta threshold", () => {
            const leftWithBreakdown: SimulationReport = {
                ...left,
                breakdown: {
                    components: {base: {rounds: 9800, totalBet: 9800, totalWin: 9331.4, rtp: 0.9522, contribution: 0.9522, hitFrequency: 0.241, maxWin: 120.5}},
                },
            };
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {base: {rounds: 9850, totalBet: 9850, totalWin: 9850, rtp: 1.0, contribution: 1.0, hitFrequency: 0.245, maxWin: 130}},
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, rightWithBreakdown);

            expect(diff.warnings.some((warning) => warning.startsWith('"base" RTP changed by'))).toBe(true);
        });
    });
});

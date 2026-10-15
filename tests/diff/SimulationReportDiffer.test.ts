import {featureAnalyticsReport, aggregate, corpus} from "../v2/fixtures/FeatureAnalyticsFixture.js";
import {SimulationReport, SimulationReportDiffer} from "@fromstan/pokie";

const reproducibility = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    seed: "demo",
    requestedRounds: 10000,
    actualRounds: 9800,
    command: "pokie sim <packageRoot> --rounds 10000 --seed demo",
};

const left: SimulationReport = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
            left: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            right: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            changed: false,
        });
        expect(diff.seed).toEqual({left: "demo", right: "demo", changed: false});
    });

    it("flags game metadata as changed when id/name/version differ", () => {
        const diff = new SimulationReportDiffer().diff(left, {...right, game: {id: "sample-slot", name: "Sample Slot", version: "0.2.0"}});

        expect(diff.game.changed).toBe(true);
        expect(diff.changed).toBe(true);
    });

    it("marks an identical report as unchanged for machine consumers", () => {
        expect(new SimulationReportDiffer().diff(left, left).changed).toBe(false);
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

            // base first, then alphabetically — a stable order regardless of which side introduced which key.
            expect(Object.keys(diff.breakdown!.components)).toEqual(["base", "bonus", "freeGames"]);
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

        it("clearly labels a removed category instead of reporting a misleading RTP drop", () => {
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
                    components: {base: {rounds: 9850, totalBet: 9850, totalWin: 9000, rtp: 0.9137, contribution: 0.9137, hitFrequency: 0.4, maxWin: 5}},
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, rightWithBreakdown);

            expect(diff.warnings).toContain('"freeGames" is no longer present in the right report (was rtp 142.00%, contributing 14.22 pp)');
            expect(diff.warnings.some((warning) => warning.includes('"freeGames" RTP changed by'))).toBe(false);
        });

        it("clearly labels a new category instead of reporting a misleading RTP gain from 0", () => {
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
                        base: {rounds: 8850, totalBet: 8850, totalWin: 8000, rtp: 0.904, contribution: 0.8121, hitFrequency: 0.21, maxWin: 95},
                        bonus: {rounds: 1000, totalBet: 1000, totalWin: 1400, rtp: 1.4, contribution: 0.1421, hitFrequency: 0.61, maxWin: 130},
                    },
                },
            };

            const diff = new SimulationReportDiffer().diff(leftWithBreakdown, rightWithBreakdown);

            expect(diff.warnings).toContain('"bonus" is a new category in the right report (rtp 140.00%, contributing 14.21 pp)');
            expect(diff.warnings.some((warning) => warning.includes('"bonus" RTP changed by'))).toBe(false);
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

describe("SimulationReportDiffer betMode", () => {
    test("omits the betMode field entirely when neither side locked a mode", () => {
        const diff = new SimulationReportDiffer().diff(left, right);

        expect(diff.betMode).toBeUndefined();
    });

    test("reports betMode as unchanged when both sides locked the same mode", () => {
        const diff = new SimulationReportDiffer().diff({...left, betMode: "ante"}, {...right, betMode: "ante"});

        expect(diff.betMode).toEqual({left: "ante", right: "ante", changed: false});
        expect(diff.warnings.some((warning) => warning.includes("Comparing different bet modes"))).toBe(false);
    });

    test("flags a cross-mode comparison (e.g. base vs buy-bonus) as changed, with a dedicated warning", () => {
        const diff = new SimulationReportDiffer().diff({...left, betMode: "base"}, {...right, betMode: "buy-bonus"});

        expect(diff.betMode).toEqual({left: "base", right: "buy-bonus", changed: true});
        expect(diff.warnings[0]).toBe('Comparing different bet modes: "base" -> "buy-bonus"');
    });

    test("treats one side having a betMode and the other not as changed too", () => {
        const diff = new SimulationReportDiffer().diff(left, {...right, betMode: "ante"});

        expect(diff.betMode).toEqual({left: null, right: "ante", changed: true});
    });
});

it.each(["unchanged", "order", "weight", "context", "symbols", "added", "removed", "missing", "sampling"])("explains whole-sequence %s changes with identical payout metrics", kind => {
    const variants = [{id: "a", weight: 1, probability: 0.25, count: 0, frequency: 0, uncovered: true}, {id: "b", weight: 3, probability: 0.75, count: 0, frequency: 0, uncovered: true}];
    const model = {context: "logical-round-v1", rows: 1, reels: [[{id: "a", weight: 1, symbols: ["A"]}, {id: "b", weight: 3, symbols: ["B"]}]]};
    const before: SimulationReport = {...left, reelSequences: [{reelIndex: 0, context: "logical-round", selections: 0, model: JSON.stringify(model), variants}]};
    const after: SimulationReport = JSON.parse(JSON.stringify(before));
    if (kind === "order") {
 after.reelSequences![0] = {...after.reelSequences![0], variants: [...variants].reverse()};
 model.reels[0].reverse();
    }
    if (kind === "weight") {
 after.reelSequences![0] = {...after.reelSequences![0], variants: [{...variants[0], weight: 2}, variants[1]]};
 model.reels[0][0].weight = 2;
    }
    if (kind === "context") model.context = "future-context-v2";
    if (kind === "symbols") model.reels[0][0].symbols = ["B", "A"];
    if (kind === "added") after.reelSequences![0] = {...after.reelSequences![0], variants: [...variants, {...variants[0], id: "new"}]};
    if (kind === "removed") after.reelSequences![0] = {...after.reelSequences![0], variants: [variants[0]]};
    if (kind === "sampling") after.reelSequences![0] = {...after.reelSequences![0], selections: 2, variants: variants.map(v => ({...v, count: 1, frequency: 0.5, uncovered: false}))};
    after.reelSequences![0] = {...after.reelSequences![0], model: JSON.stringify(model)};
    if (kind === "missing") Reflect.deleteProperty(after, "reelSequences");
    const result = new SimulationReportDiffer().diff(before, after);
    expect(result.rtp.delta).toBe(0);
    expect(result.changed).toBe(kind !== "unchanged");
    expect(result.reelSequences?.configuredChanged).toBe(!["unchanged", "sampling"].includes(kind));
    expect(result.reelSequences?.observationsChanged).toBe(kind === "sampling");
    if (!["unchanged", "sampling"].includes(kind)) expect(result.reelSequences?.changes.some(change => change.kind === (kind === "missing" ? "availability" : kind))).toBe(true);
    if (kind === "unchanged") expect(result.reelSequences?.changes).toEqual([]);
});


it.each(["weighted", "exact"])("attributes a reel 2 %s definition edit once with mixed siblings", type => {
    const variants = [{id: "a", weight: 1, probability: 1, count: 0, frequency: 0, uncovered: true}];
    const weighted = [{id: "a", weight: 1, symbols: ["A"]}];
    const model = {context: "logical-round-v1", reels: [weighted, type === "exact" ? ["A"] : weighted, ["B"]]};
    const sequence = (reelIndex: number) => ({reelIndex, context: "logical-round" as const, selections: 0, model: JSON.stringify(model), variants});
    const before: SimulationReport = {...left, reelSequences: type === "exact" ? [sequence(0)] : [sequence(0), sequence(1)]};
    const changedModel = JSON.parse(JSON.stringify(model));
    if (type === "exact") changedModel.reels[1] = ["B"];
    else changedModel.reels[1][0].symbols = ["B"];
    const after: SimulationReport = {...before, reelSequences: before.reelSequences!.map(reel => ({...reel, model: JSON.stringify(changedModel)}))};
    const diff = new SimulationReportDiffer().diff(before, after);
    expect(diff.reelSequences).toMatchObject({configuredChanged: true, observationsChanged: false});
    expect(diff.reelSequences!.changes).toEqual([
        expect.objectContaining({reelIndex: 1, kind: "symbols", path: type === "exact" ? "model.reels[1]" : 'model.reels[1].variants["a"].symbols'}),
    ]);
    expect(diff.warnings).toHaveLength(1);
    expect(diff.warnings[0]).toContain("change at reel 2");
    expect(diff.warnings[0]).not.toContain("reel 1");
    const sampled: SimulationReport = {...after, reelSequences: after.reelSequences!.map(reel => ({...reel, selections: 1, variants: variants.map(variant => ({...variant, count: 1, frequency: 1, uncovered: false}))}))};
    const sampledDiff = new SimulationReportDiffer().diff(before, sampled);
    expect(sampledDiff.reelSequences!.changes).toEqual(diff.reelSequences!.changes);
    expect(sampledDiff.reelSequences!.observationsChanged).toBe(true);
});

it("observes analytics-only changes and availability even when all legacy totals match", () => {
    const original = featureAnalyticsReport();
    const rows = corpus.map(([bet, win, observation]): typeof corpus[number] => [bet, win, {...observation, components: observation.components?.map(component => ({...component, symbol: component.symbol === "A" ? "B" : component.symbol}))}]);
    const alternate = {...original, analytics: aggregate(rows).getStatistics().analytics!};
    expect(alternate.analytics.totalWin).toBe(original.totalWin);
    expect(alternate.analytics.totalStake).toBe(original.totalBet);
    const differ = new SimulationReportDiffer();
    expect(differ.diff(original, alternate)).toMatchObject({changed: true, analytics: {changed: true}});
    expect(differ.diff({...original, analytics: undefined}, original)).toMatchObject({changed: true, analytics: {changed: true}});
    expect(differ.diff(original, original)).toMatchObject({changed: false, analytics: {changed: false}});
});

it("detects sampling and diagnostic changes independently of headline monetary metrics", () => {
    const report = featureAnalyticsReport();
    const diff = new SimulationReportDiffer().diff(report, {...report, sampling: {...report.sampling!, excludedSubrounds: 1}});
    expect(diff.changed).toBe(true);
    expect(diff.warnings.join("\n")).toContain("sample populations");
    expect(new SimulationReportDiffer().diff(report, {...report, diagnostics: undefined}).warnings.join("\n")).toContain("precision or support diagnostics");
});

it("ignores persisted object key order while retaining value and array changes", () => {
    const report = featureAnalyticsReport();
    report.diagnostics!.coverageLimitations = ["first", "second"];
    const reverse = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    const reordered = {...report, sampling: reverse(report.sampling!), logicalRounds: reverse(report.logicalRounds!), diagnostics: reverse(report.diagnostics!)};
    const differ = new SimulationReportDiffer();
    expect(differ.diff(report, reordered)).toMatchObject({changed: false, warnings: []});
    for (const patch of [
        {sampling: {...report.sampling!, carriedSubrounds: report.sampling!.carriedSubrounds! + 1}},
        {logicalRounds: {...report.logicalRounds!, totalStake: report.logicalRounds!.totalStake + 0.05}},
        {diagnostics: {...report.diagnostics!, samples: report.diagnostics!.samples + 1}},
        {diagnostics: {...report.diagnostics!, coverageLimitations: ["second", "first"]}},
        {diagnostics: {...report.diagnostics!, coverageLimitations: ["first", "second", "third"]}},
    ]) expect(differ.diff(report, {...reordered, ...patch}).changed).toBe(true);
});

import {dispatch} from "../../../cli/dispatch.js";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";
import {writeDescriptorPackage} from "../../v2/fixtures/PackageExtractionFixture.js";
import {featureAnalyticsReport} from "../../v2/fixtures/FeatureAnalyticsFixture.js";
import {
    OutcomeLibraryBundleWriter,
    OutcomeSourceDiffResult,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    SimulationReport,
    SimulationReportSet,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    WeightedOutcomeInput,
} from "@fromstan/pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {DiffCommand} from "../../../cli/commands/DiffCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {buildStakeEngineTestLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

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
    reproducibility: {
        game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        seed: "demo",
        requestedRounds: 10000,
        actualRounds: 9800,
        command: "pokie sim <packageRoot> --rounds 10000 --seed demo",
    },
    warnings: [],
    recommendations: [],
};

const right: SimulationReport = {
    ...left,
    rounds: 9850,
    totalBet: 9850,
    totalWin: 9400,
    rtp: 0.98,
    hitFrequency: 0.245,
    maxWin: 250,
    durationMs: 1300,
    spinsPerSecond: 7900,
};

function createStubReadFile(files: Record<string, string>): (file: string) => string {
    return (file: string) => {
        if (!(file in files)) {
            const error = new Error(`ENOENT: no such file or directory, open '${file}'`) as NodeJS.ErrnoException;
            error.code = "ENOENT";
            throw error;
        }
        return files[file];
    };
}

describe("DiffCommand", () => {
    it.each(["left", "right"])("validates single and every all-mode %s input before comparison", async side => {
        const report = featureAnalyticsReport();
        const patches = [{analytics: {}}, {analytics: {...report.analytics, features: {...report.analytics!.features, extra: null}}},
            {diagnostics: {...report.diagnostics, samples: -1}}, {sampling: {...report.sampling, excludedSubrounds: -1}},
            {reelSequences: [{reelIndex: 0, context: "logical-round", model: "fixture", selections: 0, variants: [{id: "rare", weight: 1, probability: 0, probabilityRatio: {numerator: "<img>", denominator: "1"}, count: 0, frequency: 0, uncovered: true}]}]}];
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            for (const patch of patches) for (const all of [false, true]) {
                const invalid = {...report, ...patch};
                const validPayload = all ? {game: report.game, requestedRounds: report.requestedRounds, seed: report.seed, modes: {base: report, buy: report}} : report;
                const invalidPayload = all ? {game: report.game, requestedRounds: report.requestedRounds, seed: report.seed, modes: {base: report, buy: invalid}} : invalid;
                const files = {"left.json": JSON.stringify(side === "left" ? invalidPayload : validPayload), "right.json": JSON.stringify(side === "right" ? invalidPayload : validPayload)};
                const command = new DiffCommand(createStubReadFile(files));
                await expect(command.run(["left.json", "right.json"])).rejects.toThrow(/Invalid simulation report (analytics|diagnostics.samples|sampling.excludedSubrounds|reelSequences)/);
            }
            expect(log).not.toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });

    it("has the expected name and description", () => {
        const command = new DiffCommand();

        expect(command.getName()).toBe("diff");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without both report paths", async () => {
        const command = new DiffCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie diff <leftProjectOrReportJson> <rightProjectOrReportJson>/);
        await expect(command.run(["only-left.json"])).rejects.toThrow(/Usage: pokie diff <leftProjectOrReportJson> <rightProjectOrReportJson>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));

        await expect(command.run(["left.json", "right.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --format is not json", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));

        await expect(command.run(["left.json", "right.json", "--format", "xml"])).rejects.toThrow(/--format only supports "json"/);
    });

    it("throws a descriptive error when --out has no value", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));

        await expect(command.run(["left.json", "right.json", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("throws a clear error when a report file does not exist", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left)}));

        await expect(command.run(["left.json", "missing.json"])).rejects.toThrow(/Could not read simulation report at "missing\.json"/);
    });

    it("throws a clear error when a report file is not valid JSON", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "broken.json": "{not json"}));

        await expect(command.run(["left.json", "broken.json"])).rejects.toThrow(/"broken\.json" is not valid JSON/);
    });

    it("throws a clear error when the JSON does not look like a simulation report", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "other.json": JSON.stringify({foo: "bar"})}));

        await expect(command.run(["left.json", "other.json"])).rejects.toThrow(/does not look like a pokie sim report/);
    });

    it("diffs two resolved outcome projects before trying to read them as simulation reports", async () => {
        const leftProject: PokieProject = {
            type: "outcomeLibrary",
            rootPath: "left-project",
            provenance: "native",
            capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
        };
        const rightProject: PokieProject = {
            type: "stakeAdapter",
            rootPath: "right-project",
            provenance: "native",
            capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
        };
        const resolveProject: ProjectResolving = {
            resolve: jest.fn((projectPath: string) => Promise.resolve(projectPath === "left-project" ? leftProject : rightProject)),
        };
        const diffOutcomeSources = jest.fn(() =>
            Promise.resolve({
                supported: true,
                diff: {
                    changed: false,
                    left: {rootPath: "left-project", kind: "native", issues: []},
                    right: {rootPath: "right-project", kind: "stakeEngine", issues: []},
                    onlyInLeft: [],
                    onlyInRight: [],
                    perMode: {},
                },
            } as OutcomeSourceDiffResult),
        );
        const command = new DiffCommand(createStubReadFile({}), undefined, undefined, undefined, resolveProject, diffOutcomeSources);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left-project", "right-project"]);

        expect(diffOutcomeSources).toHaveBeenCalledWith(leftProject, rightProject);
        expect(logSpy.mock.calls[0][0]).toContain('Diffing "left-project" (native) -> "right-project" (stakeEngine)');
        logSpy.mockRestore();
    });

    it("uses the product-facing compatibility diagnostic for an unsupported project", async () => {
        const blueprintProject: PokieProject = {
            type: "blueprint",
            rootPath: "game.json",
            provenance: "blueprint",
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
        };
        const outcomeProject: PokieProject = {
            type: "outcomeLibrary",
            rootPath: "library",
            provenance: "native",
            capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
        };
        const resolveProject: ProjectResolving = {
            resolve: jest.fn((targetPath: string) => Promise.resolve(targetPath === "game.json" ? blueprintProject : outcomeProject)),
        };
        const unsupportedResult: OutcomeSourceDiffResult = {
            supported: false,
            diagnostic: {
                detectedType: "blueprint" as const,
                operation: "outcomeSource.diff",
                missingCapability: "outcomeSource.read" as const,
                alternatives: ["outcomeLibrary", "stakeAdapter"] as const,
                message: "This Game Blueprint cannot compare outcome sources. Compare two Outcome Library bundles or Stake Engine exports.",
            },
        };
        const diffOutcomeSources = jest.fn(() => Promise.resolve(unsupportedResult));
        const command = new DiffCommand(createStubReadFile({}), undefined, undefined, undefined, resolveProject, diffOutcomeSources);

        await expect(command.run(["game.json", "library"])).rejects.toThrow(
            "This Game Blueprint cannot compare outcome sources. Compare two Outcome Library bundles or Stake Engine exports.",
        );
        expect(diffOutcomeSources).toHaveBeenCalledWith(blueprintProject, outcomeProject);
    });

    it("prints a human-readable diff to the console by default", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diff: Sample Slot (id: "sample-slot")');
        expect(printed).toContain("rounds          9800 -> 9850");
        expect(printed).toContain("rtp             95.22% -> 98.00%");

        logSpy.mockRestore();
    });

    it("makes an identical report's no-change result explicit in both human and machine output", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(left)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("No changes detected.");
        logSpy.mockClear();

        await command.run(["left.json", "right.json", "--format", "json"]);

        expect(JSON.parse(logSpy.mock.calls[0][0]).changed).toBe(false);
        logSpy.mockRestore();
    });

    it("includes a Warnings section when RTP/hit frequency/max win change noticeably", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Warnings:");
        expect(printed).toContain("RTP changed by");
        expect(printed).toContain("Max win changed by");

        logSpy.mockRestore();
    });

    it("prints JSON to the console when --format json is given", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--format", "json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const parsed = JSON.parse(printed);
        expect(parsed.game).toEqual({
            left: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            right: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            changed: false,
        });
        expect(parsed.rtp.left).toBe(0.9522);
        expect(parsed.rtp.right).toBe(0.98);
        expect(Array.isArray(parsed.warnings)).toBe(true);
        expect(parsed.warnings.length).toBeGreaterThan(0);

        logSpy.mockRestore();
    });

    it("writes the JSON diff to --out and logs a confirmation", async () => {
        const writeFile = jest.fn();
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}), writeFile);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--out", "diff.json"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("diff.json");
        const parsed = JSON.parse(contents);
        expect(parsed.rounds).toEqual({left: 9800, right: 9850, delta: 50, percentDelta: parsed.rounds.percentDelta});

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diff written to "diff.json".');

        logSpy.mockRestore();
    });

    it("does not write a file when --out is not given", async () => {
        const writeFile = jest.fn();
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        expect(writeFile).not.toHaveBeenCalled();

        (console.log as jest.Mock).mockRestore();
    });

    describe("breakdown", () => {
        it("prints no Breakdown section when neither report has one (old-shape compatibility)", async () => {
            const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

            await command.run(["left.json", "right.json"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).not.toContain("Breakdown:");

            logSpy.mockRestore();
        });

        it("prints no Breakdown section but a clear Warnings note when only one report has one", async () => {
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {base: {rounds: 9850, totalBet: 9850, totalWin: 9400, rtp: 0.98, contribution: 0.98, hitFrequency: 0.245, maxWin: 250}},
                },
            };
            const command = new DiffCommand(
                createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(rightWithBreakdown)}),
            );
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

            await command.run(["left.json", "right.json"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).not.toContain("Breakdown:");
            expect(printed).toContain("Feature-level breakdown comparison skipped — the left report has no breakdown data.");

            logSpy.mockRestore();
        });

        it("clearly labels added/removed categories in the printed Warnings section, not as a misleading RTP swing", async () => {
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
            const command = new DiffCommand(
                createStubReadFile({"left.json": JSON.stringify(leftWithBreakdown), "right.json": JSON.stringify(rightWithBreakdown)}),
            );
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

            await command.run(["left.json", "right.json"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('"bonus" is a new category in the right report');
            expect(printed).not.toContain('"bonus" RTP changed by');

            logSpy.mockRestore();
        });

        it("prints a Breakdown section with per-category lines, including contribution, when both reports have one", async () => {
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
                        base: {rounds: 8850, totalBet: 8850, totalWin: 8000, rtp: 0.904, contribution: 0.812, hitFrequency: 0.21, maxWin: 95},
                        freeGames: {rounds: 1000, totalBet: 1000, totalWin: 1400, rtp: 1.4, contribution: 0.142, hitFrequency: 0.61, maxWin: 130},
                    },
                },
            };
            const command = new DiffCommand(
                createStubReadFile({"left.json": JSON.stringify(leftWithBreakdown), "right.json": JSON.stringify(rightWithBreakdown)}),
            );
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

            await command.run(["left.json", "right.json"]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Breakdown:");
            expect(printed).toContain("base");
            expect(printed).toContain("freeGames");
            expect(printed).toContain("contribution");

            logSpy.mockRestore();
        });

        it("includes breakdown (with contribution) in the JSON diff when --format json is given and both reports have one", async () => {
            const leftWithBreakdown: SimulationReport = {
                ...left,
                breakdown: {
                    components: {base: {rounds: 9800, totalBet: 9800, totalWin: 9331.4, rtp: 0.9522, contribution: 0.9522, hitFrequency: 0.241, maxWin: 120.5}},
                },
            };
            const rightWithBreakdown: SimulationReport = {
                ...right,
                breakdown: {
                    components: {base: {rounds: 9850, totalBet: 9850, totalWin: 9400, rtp: 0.98, contribution: 0.98, hitFrequency: 0.245, maxWin: 250}},
                },
            };
            const command = new DiffCommand(
                createStubReadFile({"left.json": JSON.stringify(leftWithBreakdown), "right.json": JSON.stringify(rightWithBreakdown)}),
            );
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

            await command.run(["left.json", "right.json", "--format", "json"]);

            const parsed = JSON.parse(logSpy.mock.calls[0][0]);
            expect(parsed.breakdown.components.base.rounds).toEqual({left: 9800, right: 9850, delta: 50, percentDelta: parsed.breakdown.components.base.rounds.percentDelta});
            expect(parsed.breakdown.components.base.contribution).toEqual({left: 0.9522, right: 0.98, delta: parsed.breakdown.components.base.contribution.delta, percentDelta: parsed.breakdown.components.base.contribution.percentDelta});

            logSpy.mockRestore();
        });
    });
});

describe("DiffCommand (betMode -- CLI-level cross-mode comparison)", () => {
    it("diffs two reports locked to the SAME bet mode without a cross-mode warning", async () => {
        const leftAnte: SimulationReport = {...left, betMode: "ante"};
        const rightAnte: SimulationReport = {...right, betMode: "ante"};
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(leftAnte), "right.json": JSON.stringify(rightAnte)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--format", "json"]);

        const diff = JSON.parse(logSpy.mock.calls[0][0]);
        expect(diff.betMode).toEqual({left: "ante", right: "ante", changed: false});
        expect(diff.warnings.some((warning: string) => warning.includes("Comparing different bet modes"))).toBe(false);

        logSpy.mockRestore();
    });

    it("surfaces the cross-mode warning in the console summary when comparing two DIFFERENT bet modes", async () => {
        const leftBase: SimulationReport = {...left, betMode: "base"};
        const rightBuyBonus: SimulationReport = {...right, betMode: "buy-bonus"};
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(leftBase), "right.json": JSON.stringify(rightBuyBonus)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Comparing different bet modes: "base" -> "buy-bonus"');

        logSpy.mockRestore();
    });
});

function buildSetReport(betMode: string, rtp: number): SimulationReport {
    return {...left, betMode, rtp};
}

describe("DiffCommand (SimulationReportSet -- diffing two `pokie sim --mode all` runs)", () => {
    function buildSet(overrides: Partial<Record<string, SimulationReport>>, extraModeId?: string): SimulationReportSet {
        return {
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            requestedRounds: 10000,
            seed: "demo",
            workers: 1,
            modes: {
                base: buildSetReport("base", 0.95),
                ante: buildSetReport("ante", 0.965),
                ...overrides,
                ...(extraModeId ? {[extraModeId]: buildSetReport(extraModeId, 0.9)} : {}),
            },
        };
    }

    it.each([false, true])("labels report-set summaries as statistical (changed game: %s)", async changed => {
        const a = buildSet({});
        const b = buildSet({});
        if (changed) b.game = {...b.game, name: "Renamed game", version: "2"};
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(a), "right.json": JSON.stringify(b)}));
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await command.run(["left.json", "right.json"]);
            expect(log.mock.calls[0][0]).toMatch(/^Statistical Diff \(all modes\):/);
            if (changed) expect(log.mock.calls[0][0]).toContain("Renamed game");
        } finally {
            log.mockRestore();
        }
    });

    it("diffs each common mode independently, reusing the same per-mode diff logic as a plain single-report diff", async () => {
        const leftSet = buildSet({});
        const rightSet = buildSet({ante: buildSetReport("ante", 0.99)});
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(leftSet), "right.json": JSON.stringify(rightSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--format", "json"]);

        const setDiff = JSON.parse(logSpy.mock.calls[0][0]);
        expect(Object.keys(setDiff.perMode)).toEqual(["base", "ante"]);
        expect(setDiff.perMode.base.rtp.left).toBe(0.95);
        expect(setDiff.perMode.base.rtp.right).toBe(0.95);
        expect(setDiff.perMode.ante.rtp.left).toBe(0.965);
        expect(setDiff.perMode.ante.rtp.right).toBe(0.99);
        expect(setDiff.onlyInLeft).toEqual([]);
        expect(setDiff.onlyInRight).toEqual([]);

        logSpy.mockRestore();
    });

    it("reports modes present on only one side under onlyInLeft/onlyInRight, never silently dropping them", async () => {
        const leftSet = buildSet({}, "buy-10");
        const rightSet = buildSet({}, "buy-20");
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(leftSet), "right.json": JSON.stringify(rightSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--format", "json"]);

        const setDiff = JSON.parse(logSpy.mock.calls[0][0]);
        expect(setDiff.onlyInLeft).toEqual(["buy-10"]);
        expect(setDiff.onlyInRight).toEqual(["buy-20"]);
        expect(setDiff.perMode["buy-10"]).toBeUndefined();
        expect(setDiff.perMode["buy-20"]).toBeUndefined();
        expect(setDiff.changed).toBe(true);

        logSpy.mockRestore();
    });

    it("prints each mode's diff summary separately in the console, plus onlyInLeft/onlyInRight when present", async () => {
        const leftSet = buildSet({}, "buy-10");
        const rightSet = buildSet({});
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(leftSet), "right.json": JSON.stringify(rightSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("=== Mode: base ===");
        expect(printed).toContain("=== Mode: ante ===");
        expect(printed).toContain("Modes only in the left report: buy-10");

        logSpy.mockRestore();
    });

    it("never computes a blended/overall diff across modes -- only game/perMode/onlyInLeft/onlyInRight", async () => {
        const leftSet = buildSet({});
        const rightSet = buildSet({});
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(leftSet), "right.json": JSON.stringify(rightSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json", "--format", "json"]);

        const setDiff = JSON.parse(logSpy.mock.calls[0][0]);
        expect(Object.keys(setDiff).sort()).toEqual(["changed", "comparisonKind", "game", "onlyInLeft", "onlyInRight", "perMode"]);

        logSpy.mockRestore();
    });

    it("fails clearly rather than guessing when diffing a single-mode report against a multi-mode report set", async () => {
        const singleReport: SimulationReport = {...left};
        const set = buildSet({});
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(singleReport), "right.json": JSON.stringify(set)}));

        await expect(command.run(["left.json", "right.json"])).rejects.toThrow(/Cannot diff a single-mode pokie sim report against a multi-mode report set/);
    });

    it("explains that a report and an outcome source cannot be compared together", async () => {
        const outcomeProject: PokieProject = {
            type: "outcomeLibrary",
            rootPath: "library",
            provenance: "native",
            capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
        };
        const resolveProject: ProjectResolving = {resolve: jest.fn((targetPath: string) => Promise.resolve(targetPath === "library" ? outcomeProject : undefined))};
        const command = new DiffCommand(createStubReadFile({"report.json": JSON.stringify(left)}), undefined, undefined, undefined, resolveProject);

        await expect(command.run(["report.json", "library"])).rejects.toThrow(
            /Compare two simulation reports, or two Outcome Library bundles \/ Stake Engine exports/,
        );
    });
});

describe("DiffCommand (integration, real pokie sim output)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("diffs two reports produced by pokie sim --out", async () => {
        const leftFile = path.join(outDir, "left.json");
        const rightFile = path.join(outDir, "right.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "100", "--seed", "demo", "--out", leftFile]);
        await new SimCommand().run([fixtureRoot, "--rounds", "200", "--seed", "demo", "--out", rightFile]);

        const diffOut = path.join(outDir, "diff.json");
        await new DiffCommand().run([leftFile, rightFile, "--out", diffOut]);

        const diff = JSON.parse(fs.readFileSync(diffOut, "utf-8"));
        expect(diff.rounds.left).toBe(100);
        expect(diff.rounds.right).toBe(200);
        expect(diff.game.changed).toBe(false);
    });

    it("refuses existing or input-alias --out paths without changing report files", async () => {
        const leftFile = path.join(outDir, "left.json");
        const rightFile = path.join(outDir, "right.json");
        const existingOutput = path.join(outDir, "existing-diff.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "100", "--seed", "demo", "--out", leftFile]);
        await new SimCommand().run([fixtureRoot, "--rounds", "200", "--seed", "demo", "--out", rightFile]);
        fs.writeFileSync(existingOutput, "existing diff artifact", "utf-8");
        const leftBefore = fs.readFileSync(leftFile, "utf-8");
        const rightBefore = fs.readFileSync(rightFile, "utf-8");

        await expect(new DiffCommand().run([leftFile, rightFile, "--out", existingOutput])).rejects.toThrow(
            /Choose a new unused --out path, or inspect and remove the destination yourself before retrying/,
        );
        await expect(new DiffCommand().run([leftFile, rightFile, "--out", path.relative(process.cwd(), leftFile)])).rejects.toThrow(
            /because it is also an input/,
        );
        await expect(new DiffCommand().run([leftFile, rightFile, "--out", rightFile])).rejects.toThrow(/because it is also an input/);

        expect(fs.readFileSync(leftFile, "utf-8")).toBe(leftBefore);
        expect(fs.readFileSync(rightFile, "utf-8")).toBe(rightBefore);
        expect(fs.readFileSync(existingOutput, "utf-8")).toBe("existing diff artifact");
    });
});

describe("DiffCommand (integration, real reports with an arbitrary custom category)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game-with-bonus-round");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-custom-category-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("diffs the non-base/freeGames 'bonus' category between two real reports", async () => {
        const leftFile = path.join(outDir, "left.json");
        const rightFile = path.join(outDir, "right.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "500", "--out", leftFile]);
        await new SimCommand().run([fixtureRoot, "--rounds", "1000", "--out", rightFile]);

        const diffOut = path.join(outDir, "diff.json");
        await new DiffCommand().run([leftFile, rightFile, "--out", diffOut]);

        const diff = JSON.parse(fs.readFileSync(diffOut, "utf-8"));
        expect(diff.breakdown.components.bonus).toBeDefined();
        expect(diff.breakdown.components.bonus.rounds.left).toBeGreaterThan(0);
        expect(diff.breakdown.components.bonus.rounds.right).toBeGreaterThan(diff.breakdown.components.bonus.rounds.left);
    });
});

describe("DiffCommand (integration, real outcome-source artifacts)", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-diff-outcome-source-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("diffs real changed, unchanged, and removed-mode Outcome Library bundles with valid JSON output", async () => {
        const leftDir = path.join(outDir, "left-library");
        const changedDir = path.join(outDir, "changed-library");
        const baseOnlyDir = path.join(outDir, "base-only-library");
        const changedMode = buildOutcomeLibraryBundleModeInput("base", "changed");
        const changedOutcomes: WeightedOutcomeInput<string>[] = [];
        for await (const outcome of changedMode.outcomes) {
            changedOutcomes.push(outcome);
        }
        changedOutcomes[4] = {...changedOutcomes[4], weight: 20};

        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
            [buildOutcomeLibraryBundleModeInput("base", "left"), buildOutcomeLibraryBundleModeInput("bonus", "left-bonus")],
            leftDir,
        );
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{
            ...changedMode,
            outcomes: changedOutcomes,
        }, buildOutcomeLibraryBundleModeInput("bonus", "changed-bonus")], changedDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-only")], baseOnlyDir);

        const outputPath = path.join(outDir, "outcome-diff.json");
        fs.writeFileSync(outputPath, "existing outcome diff artifact", "utf-8");
        const command = new DiffCommand();
        await expect(command.run([leftDir, changedDir, "--out", outputPath])).rejects.toThrow(/destination already exists/);
        await expect(command.run([leftDir, changedDir, "--out", leftDir])).rejects.toThrow(/because it is also an input/);
        expect(fs.readFileSync(outputPath, "utf-8")).toBe("existing outcome diff artifact");
        fs.unlinkSync(outputPath);
        await command.run([leftDir, changedDir, "--format", "json", "--out", outputPath]);

        const machineDiff = JSON.parse((console.log as jest.Mock).mock.calls[0][0]);
        expect(machineDiff.changed).toBe(true);
        expect(machineDiff.perMode.base.rtp.delta).not.toBe(0);
        expect(JSON.parse(fs.readFileSync(outputPath, "utf-8"))).toEqual(machineDiff);

        (console.log as jest.Mock).mockClear();
        await command.run([leftDir, leftDir]);
        expect((console.log as jest.Mock).mock.calls[0][0]).toContain("No changes detected.");

        (console.log as jest.Mock).mockClear();
        await command.run([leftDir, baseOnlyDir, "--format", "json"]);
        const removedModeDiff = JSON.parse((console.log as jest.Mock).mock.calls[0][0]);
        expect(removedModeDiff.changed).toBe(true);
        expect(removedModeDiff.onlyInLeft).toEqual(["bonus"]);
    });

    it("diffs two real Stake Engine exports through the same public command", async () => {
        const leftDir = path.join(outDir, "left-stake");
        const rightDir = path.join(outDir, "right-stake");
        const leftModes: StakeEngineExportModeInput[] = [{
            modeName: "base",
            cost: 1,
            library: buildStakeEngineTestLibrary({libraryId: "left", betMode: "base", stake: 1}),
        }];
        const rightModes: StakeEngineExportModeInput[] = [{
            modeName: "base",
            cost: 1,
            library: buildStakeEngineTestLibrary({libraryId: "right", betMode: "base", stake: 1}),
        }, {
            modeName: "bonus",
            cost: 1,
            library: buildStakeEngineTestLibrary({libraryId: "bonus", betMode: "bonus", stake: 1}),
        }];
        await new StakeEngineExporter("1.3.0").exportToDirectory(leftModes, leftDir);
        await new StakeEngineExporter("1.3.0").exportToDirectory(rightModes, rightDir);

        await new DiffCommand().run([leftDir, rightDir, "--format", "json"]);

        const diff = JSON.parse((console.log as jest.Mock).mock.calls[0][0]);
        expect(diff.changed).toBe(true);
        expect(diff.left.kind).toBe("stakeEngine");
        expect(diff.right.kind).toBe("stakeEngine");
        expect(diff.onlyInRight).toEqual(["bonus"]);
    });

    it("refuses new nested output paths in real outcome sources, including a Stake Engine symlink alias", async () => {
        const leftLibraryDir = path.join(outDir, "left-library");
        const rightLibraryDir = path.join(outDir, "right-library");
        const leftStakeDir = path.join(outDir, "left-stake");
        const rightStakeDir = path.join(outDir, "right-stake");
        const stakeAlias = path.join(outDir, "right-stake-alias");
        const nestedLibraryOutput = path.join(leftLibraryDir, "diffs", "nested-diff.json");
        const nestedStakeAliasOutput = path.join(stakeAlias, "diffs", "nested-diff.json");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "left")], leftLibraryDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "right")], rightLibraryDir);
        await new StakeEngineExporter("1.3.0").exportToDirectory([{
            modeName: "base",
            cost: 1,
            library: buildStakeEngineTestLibrary({libraryId: "left", betMode: "base", stake: 1}),
        }], leftStakeDir);
        await new StakeEngineExporter("1.3.0").exportToDirectory([{
            modeName: "base",
            cost: 1,
            library: buildStakeEngineTestLibrary({libraryId: "right", betMode: "base", stake: 1}),
        }], rightStakeDir);
        fs.symlinkSync(rightStakeDir, stakeAlias, "dir");
        const libraryManifestBefore = fs.readFileSync(path.join(leftLibraryDir, "manifest.json"), "utf-8");
        const stakeIndexBefore = fs.readFileSync(path.join(rightStakeDir, "index.json"), "utf-8");

        const command = new DiffCommand();
        await expect(command.run([leftLibraryDir, rightLibraryDir, "--out", nestedLibraryOutput])).rejects.toThrow(
            /Choose a new unused --out path, or inspect and remove the destination yourself before retrying/,
        );
        await expect(command.run([leftStakeDir, rightStakeDir, "--out", nestedStakeAliasOutput])).rejects.toThrow(
            /Choose a new unused --out path, or inspect and remove the destination yourself before retrying/,
        );

        expect(fs.existsSync(nestedLibraryOutput)).toBe(false);
        expect(fs.existsSync(nestedStakeAliasOutput)).toBe(false);
        expect(fs.existsSync(path.dirname(nestedLibraryOutput))).toBe(false);
        expect(fs.existsSync(path.dirname(nestedStakeAliasOutput))).toBe(false);
        expect(fs.readFileSync(path.join(leftLibraryDir, "manifest.json"), "utf-8")).toBe(libraryManifestBefore);
        expect(fs.readFileSync(path.join(rightStakeDir, "index.json"), "utf-8")).toBe(stakeIndexBefore);
    });
});

it("prints and serializes whole-sequence changes even when payouts agree", async () => {
    const sequence = {reelIndex: 0, context: "logical-round" as const, model: "model", selections: 0, variants: [{id: "a", weight: 1, probability: 1, count: 0, frequency: 0, uncovered: true}]};
    const before = {...left, reelSequences: [sequence]};
    const after = {...before, reelSequences: [{...sequence, variants: [{...sequence.variants[0], weight: 2}]}]};
    const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(before), "right.json": JSON.stringify(after)}));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
        await command.run(["left.json", "right.json"]);
        expect(log.mock.calls.map(call => String(call[0])).join("\n")).toContain("Whole-sequence weight change");
        log.mockClear();
        await command.run(["left.json", "right.json", "--format", "json"]);
        const parsed = JSON.parse(String(log.mock.calls[0][0]));
        expect(parsed.changed).toBe(true);
        expect(parsed.reelSequences.configuredChanged).toBe(true);
    } finally {
        log.mockRestore();
    }
});


it("public JSON and text diffs attribute a mixed-model reel 2 edit without naming reel 1", async () => {
    const model = {context: "logical-round-v1", reels: [[{id: "a", weight: 1, symbols: ["A"]}], ["A"]]};
    const sequence = {reelIndex: 0, context: "logical-round" as const, model: JSON.stringify(model), selections: 0, variants: [{id: "a", weight: 1, probability: 1, count: 0, frequency: 0, uncovered: true}]};
    const before = {...left, reelSequences: [sequence]};
    const after = {...before, reelSequences: [{...sequence, model: JSON.stringify({...model, reels: [model.reels[0], ["B"]]})}]};
    const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(before), "right.json": JSON.stringify(after)}));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
        await command.run(["left.json", "right.json"]);
        const text = log.mock.calls.map(call => String(call[0])).join("\n");
        expect(text).toContain("Whole-sequence symbols change at reel 2");
        expect(text).not.toContain("change at reel 1");
        log.mockClear();
        await command.run(["left.json", "right.json", "--format", "json"]);
        const parsed = JSON.parse(String(log.mock.calls[0][0]));
        expect(parsed.reelSequences.changes).toEqual([expect.objectContaining({reelIndex: 1, kind: "symbols", path: "model.reels[1]"})]);
        expect(parsed.reelSequences.observationsChanged).toBe(false);
    } finally {
        log.mockRestore();
    }
});

describe("DiffCommand canonical definitions through dispatch", () => {
    let root: string, a: string, b: string;
    let log: jest.SpyInstance, error: jest.SpyInstance;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "definition-cli-"));
        a = path.join(root, "a.blueprint.json");
        b = path.join(root, "b.blueprint.json");
        fs.writeFileSync(a, JSON.stringify(fractionalBetBlueprint([0.05, 7.5, 1e-7], true)));
        fs.copyFileSync(a, b);
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, {recursive: true, force: true});
    });
    const run = (args: string[], command = new DiffCommand()) =>
        dispatch([command], ["node", "pokie", "diff", ...args]);
    it("auto-selects definitions with parseable versioned JSON and retains successful default on differences", async () => {
        const changed = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        changed.paytable.A[3] = 7.5;
        fs.writeFileSync(b, JSON.stringify(changed));
        expect(await run([a, b, "--format", "json"])).toBe(0);
        expect(log).toHaveBeenCalledTimes(1);
        expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
            schemaVersion: 1,
            comparisonKind: "math-definition",
            status: "different",
        });
        expect(error).not.toHaveBeenCalled();
    });
    it("implements opt-in CI policy for unchanged, math, representation-only, partial, invalid and failure", async () => {
        expect(await run([a, b, "--ci"])).toBe(0);
        const changed = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        changed.paytable.A[3] = 7.5;
        fs.writeFileSync(b, JSON.stringify(changed));
        expect(await run([a, b, "--ci"])).toBe(1);
        fs.writeFileSync(
            b,
            JSON.stringify({...fractionalBetBlueprint([0.05, 7.5, 1e-7], true), winModel: {type: "lines"}}),
        );
        expect(await run([a, b, "--ci"])).toBe(0);
        const custom = writeDescriptorPackage(root);
        expect(await run([custom, custom, "--ci"])).toBe(2);
        fs.writeFileSync(b, JSON.stringify({...changed, availableBets: ["0.05"]}));
        expect(await run([a, b, "--comparison", "definition", "--ci"])).toBe(2);
        expect(await run([a, path.join(root, "missing"), "--comparison", "definition", "--ci"])).toBe(2);
        expect(await run([a, b, "--comparison", "statistics", "--ci"])).toBe(2);
    });
    it.each(["label", "targetRtp", "paylines", "factor"])("keeps %s representation edits out of CI math failures", async field => {
        const model = field === "factor"
            ? JSON.parse(fs.readFileSync("examples/blueprints/wild-expanding.blueprint.json", "utf8"))
            : {...fractionalBetBlueprint([0.05], true), betModes: [{id: "base", runtimeType: "base", isDefault: true}]};
        if (field === "factor") Reflect.deleteProperty(model.mechanics.modifiers.wilds[0], "factor");
        if (field === "paylines") {
            model.rows = 2;
            model.winModel = {type: "ways"};
        }
        fs.writeFileSync(a, JSON.stringify(model));
        if (field === "factor") model.mechanics.modifiers.wilds[0].factor = 1;
        if (field === "label") model.betModes[0].label = "Display only";
        if (field === "targetRtp") model.betModes[0].targetRtp = 0.96;
        if (field === "paylines") model.paylines = [[1, 1, 1]];
        fs.writeFileSync(b, JSON.stringify(model));
        expect(await run([a, b, "--ci", "--format", "json"])).toBe(field === "factor" ? 2 : 0);
        const diff = JSON.parse(log.mock.calls[0][0]);
        expect(diff.status).toBe(field === "factor" ? "partial" : "different");
        expect(diff.changes.every((change: {mathematical: boolean}) => !change.mathematical)).toBe(true);
        if (field === "factor") {
            model.mechanics.modifiers.wilds[0].factor = 2;
            fs.writeFileSync(b, JSON.stringify(model));
            expect(await run([a, b, "--ci"])).toBe(2);
        }
    });

    it.each(["exact reels", "inventory", "metadata cost"])("keeps %s representation changes visible through dispatch", async field => {
        const model = {...fractionalBetBlueprint([0.05], true), betModes: [{id: "legacy", costMultiplier: 2}]};
        fs.writeFileSync(a, JSON.stringify(model));
        const changed = JSON.parse(JSON.stringify(model)) as typeof model;
        if (field === "exact reels") {
            changed.reelSequences = changed.reelStrips!.map(symbols => ({type: "exact", symbols}));
            Reflect.deleteProperty(changed, "reelStrips");
        }
        if (field === "inventory") changed.symbols.reverse();
        if (field === "metadata cost") changed.betModes[0].costMultiplier = 7.5;
        fs.writeFileSync(b, JSON.stringify(changed));
        for (const [left, right] of [[a, b], [b, a]]) {
            log.mockClear();
            expect(await run([left, right, "--ci", "--format", "json"])).toBe(0);
            const diff = JSON.parse(log.mock.calls[0][0]);
            expect(diff.status).toBe("different");
            expect(diff.changes.length).toBeGreaterThan(0);
            expect(diff.changes.every((change: {mathematical: boolean}) => !change.mathematical)).toBe(true);
        }
        changed.paytable.A[3] = 7.5;
        fs.writeFileSync(b, JSON.stringify(changed));
        expect(await run([a, b, "--ci"])).toBe(1);
    });

    it("publishes every distinct missing-payout diagnostic and its reverse addition", async () => {
        const model = {...fractionalBetBlueprint([0.05], true), symbols: ["A", "B", "C"], paytable: {}};
        fs.writeFileSync(a, JSON.stringify(model));
        fs.writeFileSync(b, JSON.stringify({...model, paytable: {A: {3: 0}}}));
        for (const [left, right, added] of [[a, b, false], [b, a, true]] as const) {
            log.mockClear();
            expect(await run([left, right, "--ci", "--format", "json"])).toBe(0);
            const diff = JSON.parse(log.mock.calls[0][0]);
            const changes = diff.changes.filter((change: {path: string}) => change.path.includes("blueprint-symbol-missing-payout"));
            expect(changes).toHaveLength(1);
            expect(changes[0].before.present).toBe(!added);
            expect(changes[0].after.present).toBe(added);
            expect((added ? changes[0].after : changes[0].before).value.message).toContain('Symbol "A"');
        }
    });

    it("maps SIGINT cancellation through dispatch without publishing an equality result", async () => {
        const read = fs.readFileSync.bind(fs);
        let cancelled = false;
        jest.spyOn(fs, "readFileSync").mockImplementation((...args) => {
            const contents = read(...args);
            if (!cancelled && String(args[0]) === a) {
                cancelled = true;
                process.emit("SIGINT");
            }
            return contents;
        });
        const count = process.listenerCount("SIGINT");
        expect(await run([a, b, "--comparison", "definition", "--format", "json", "--ci"])).toBe(2);
        expect(JSON.parse(log.mock.calls[0][0]).status).toBe("cancelled");
        expect(process.listenerCount("SIGINT")).toBe(count);
    });
    it("preserves output aliases, containment, occupied paths and cleanup during publication failure", async () => {
        const original = fs.readFileSync(a);
        const alias = path.join(root, "alias.json");
        fs.symlinkSync(a, alias);
        const occupied = path.join(root, "occupied.json");
        fs.writeFileSync(occupied, "keep");
        for (const output of [a, alias, occupied]) expect(await run([a, b, "--ci", "--out", output])).toBe(2);
        const custom = writeDescriptorPackage(root);
        const symlink = path.join(root, "package-alias");
        fs.symlinkSync(custom, symlink);
        expect(await run([custom, custom, "--ci", "--out", path.join(symlink, "diff.json")])).toBe(2);
        const output = path.join(root, "new.json");
        const link = jest.spyOn(fs, "linkSync").mockImplementation(() => {
            throw new Error("publication failed");
        });
        expect(await run([a, b, "--ci", "--out", output])).toBe(2);
        link.mockRestore();
        expect(fs.existsSync(output)).toBe(false);
        expect(fs.readdirSync(root).some((name) => name.includes(".pokie-diff-"))).toBe(false);
        expect(fs.readFileSync(a)).toEqual(original);
        expect(fs.readFileSync(occupied, "utf8")).toBe("keep");
    });
    it("publishes only an explicitly requested definition JSON and cleans staging after a write failure", async () => {
        const before = fs.readFileSync(a);
        const output = path.join(root, "diff.json");
        expect(await run([a, b, "--format", "json", "--out", output])).toBe(0);
        expect(JSON.parse(fs.readFileSync(output, "utf8"))).toEqual(JSON.parse(log.mock.calls[0][0]));
        const write = fs.writeFileSync.bind(fs);
        jest.spyOn(fs, "writeFileSync").mockImplementation((file, ...args) => {
            if (String(file).includes(".pokie-diff-")) throw new Error("staging write failed");
            return write(file, ...args);
        });
        const failed = path.join(root, "failed.json");
        expect(await run([a, b, "--ci", "--out", failed])).toBe(2);
        expect(fs.existsSync(failed)).toBe(false);
        expect(fs.readdirSync(root).some((name) => name.includes(".pokie-diff-"))).toBe(false);
        expect(fs.readFileSync(a)).toEqual(before);
    });
    it("retains the winner of a definition output publication race and cleans staging", async () => {
        const out = path.join(root, "race.json");
        const link = fs.linkSync.bind(fs);
        jest.spyOn(fs, "linkSync").mockImplementation((source, destination) => {
            fs.writeFileSync(destination, "winner", {flag: "wx"});
            link(source, destination);
        });
        expect(await run([a, b, "--ci", "--out", out])).toBe(2);
        expect(fs.readFileSync(out, "utf8")).toBe("winner");
        expect(fs.readdirSync(root).some((name) => name.includes(".pokie-diff-"))).toBe(false);
    });
});

it("reserves definition JSON stdout while executable descriptors log diagnostics", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "definition-stdout-"));
    const source = writeDescriptorPackage(root, {
        descriptorBody:
            'process.stdout.write("descriptor diagnostic\\n"); return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model};',
    });
    const stdoutWrite = process.stdout.write;
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
        await new DiffCommand().run([source, source, "--comparison", "definition", "--format", "json"]);
        expect(log).toHaveBeenCalledTimes(1);
        expect(JSON.parse(log.mock.calls[0][0]).comparisonKind).toBe("math-definition");
        expect(stderr).toHaveBeenCalledWith("descriptor diagnostic\n");
        expect(process.stdout.write).toBe(stdoutWrite);
    } finally {
        stderr.mockRestore();
        log.mockRestore();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

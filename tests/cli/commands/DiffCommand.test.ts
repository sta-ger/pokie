import {SimulationReport, SimulationReportSet} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {DiffCommand} from "../../../cli/commands/DiffCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";

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
    reproducibility: {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
    it("has the expected name and description", () => {
        const command = new DiffCommand();

        expect(command.getName()).toBe("diff");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without both report paths", async () => {
        const command = new DiffCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie diff <leftReportJson> <rightReportJson>/);
        await expect(command.run(["only-left.json"])).rejects.toThrow(/Usage: pokie diff <leftReportJson> <rightReportJson>/);
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

    it("prints a human-readable diff to the console by default", async () => {
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(left), "right.json": JSON.stringify(right)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["left.json", "right.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diff: Crazy Fruits (id: "crazy-fruits")');
        expect(printed).toContain("rounds          9800 -> 9850");
        expect(printed).toContain("rtp             95.22% -> 98.00%");

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
            left: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            right: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
        expect(Object.keys(setDiff).sort()).toEqual(["game", "onlyInLeft", "onlyInRight", "perMode"]);

        logSpy.mockRestore();
    });

    it("fails clearly rather than guessing when diffing a single-mode report against a multi-mode report set", async () => {
        const singleReport: SimulationReport = {...left};
        const set = buildSet({});
        const command = new DiffCommand(createStubReadFile({"left.json": JSON.stringify(singleReport), "right.json": JSON.stringify(set)}));

        await expect(command.run(["left.json", "right.json"])).rejects.toThrow(/Cannot diff a single-mode pokie sim report against a multi-mode report set/);
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

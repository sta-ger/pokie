import {
    OutcomeLibraryBundleWriter,
    OutcomeSourceProjectAnalyzing,
    OutcomeSourceProjectReport,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    ProjectTargetResolver,
    SimulationReport,
    SimulationReportRendering,
    SimulationReportSet,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ReportCommand} from "../../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

const report: SimulationReport = {
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

function omitNewReportFields(fullReport: SimulationReport): object {
    const {game, requestedRounds, rounds, seed, totalBet, totalWin, rtp, hitFrequency, maxWin, durationMs, spinsPerSecond} = fullReport;
    return {game, requestedRounds, rounds, seed, totalBet, totalWin, rtp, hitFrequency, maxWin, durationMs, spinsPerSecond};
}

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

describe("ReportCommand", () => {
    it("has the expected name and description", () => {
        const command = new ReportCommand();

        expect(command.getName()).toBe("report");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a report path", async () => {
        const command = new ReportCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie report <simulationReportJson>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}));

        await expect(command.run(["sim.json", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error when --format is not markdown or html", async () => {
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}));

        await expect(command.run(["sim.json", "--format", "xml"])).rejects.toThrow(/--format must be "markdown" or "html"/);
    });

    it("throws a descriptive error when --out has no value", async () => {
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}));

        await expect(command.run(["sim.json", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("throws a clear error when the report file does not exist", async () => {
        const command = new ReportCommand(createStubReadFile({}));

        await expect(command.run(["missing.json"])).rejects.toThrow(/Could not read simulation report at "missing\.json"/);
    });

    it("throws a clear error when the report file is not valid JSON", async () => {
        const command = new ReportCommand(createStubReadFile({"broken.json": "{not json"}));

        await expect(command.run(["broken.json"])).rejects.toThrow(/"broken\.json" is not valid JSON/);
    });

    it("throws a clear error when the JSON does not look like a simulation report", async () => {
        const command = new ReportCommand(createStubReadFile({"other.json": JSON.stringify({foo: "bar"})}));

        await expect(command.run(["other.json"])).rejects.toThrow(/does not look like a pokie sim report/);
    });

    it("prints Markdown to the console by default", async () => {
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["sim.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("# Simulation Report: Sample Slot");
        expect(printed).toContain("**RTP**: 95.22%");

        logSpy.mockRestore();
    });

    it("prints HTML to the console when --format html is given", async () => {
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["sim.json", "--format", "html"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("<!DOCTYPE html>");
        expect(printed).toContain("<h1>Simulation Report: Sample Slot</h1>");

        logSpy.mockRestore();
    });

    it("writes the rendered report to --out and logs a confirmation", async () => {
        const writeFile = jest.fn();
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}), writeFile);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["sim.json", "--format", "html", "--out", "report.html"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("report.html");
        expect(contents).toContain("<!DOCTYPE html>");
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Report written to "report.html".');

        logSpy.mockRestore();
    });

    it("does not write a file when --out is not given", async () => {
        const writeFile = jest.fn();
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["sim.json"]);

        expect(writeFile).not.toHaveBeenCalled();

        (console.log as jest.Mock).mockRestore();
    });

    it("accepts and renders an old report JSON without reproducibility/warnings/recommendations fields", async () => {
        const oldShapeReport = omitNewReportFields(report);
        const command = new ReportCommand(createStubReadFile({"old.json": JSON.stringify(oldShapeReport)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["old.json"]);
        await command.run(["old.json", "--format", "html"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("# Simulation Report: Sample Slot");
        expect(printed).not.toContain("## Reproducibility");
        expect(printed).not.toContain("## Warnings");
        expect(printed).not.toContain("## Recommendations");
        expect(printed).not.toContain("## Breakdown");
        expect(printed).toContain("<h1>Simulation Report: Sample Slot</h1>");

        logSpy.mockRestore();
    });
});

function buildMode(id: string, rtp: number, targetRtp?: number): SimulationReport {
    return {
        ...report,
        betMode: id,
        rtp,
        targetRtp,
        rtpDeviation: targetRtp !== undefined ? rtp - targetRtp : undefined,
        averageBet: 1,
        averagePayout: rtp,
    };
}

const reportSet: SimulationReportSet = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    requestedRounds: 10000,
    seed: "demo",
    workers: 1,
    modes: {
        base: buildMode("base", 0.94, 0.94),
        ante: buildMode("ante", 0.965),
        "buy-10": buildMode("buy-10", 0.9),
    },
};

// Proves "pokie report" upgrades a raw parse/shape failure into a project-aware message once it turns
// out `reportPath` actually resolves to a recognized PokieProject -- see ReportCommand's own
// resolveProject field comment.
describe("ReportCommand resolved-project boundary", () => {
    function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
        const calls: string[] = [];
        return {
            calls,
            resolve(targetPath: string) {
                calls.push(targetPath);
                return Promise.resolve(project);
            },
        };
    }

    it('reports a project-aware message when a mistakenly-given target resolves to a "blueprint" project', async () => {
        const project = {
            type: "blueprint",
            rootPath: "/blueprints/game.json",
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        } as PokieProject;
        const resolveProject = stubProjectResolver(project);
        const command = new ReportCommand(createStubReadFile({}), undefined, undefined, resolveProject);

        await expect(command.run(["/blueprints/game.json"])).rejects.toThrow(
            /"\/blueprints\/game\.json" is a "blueprint" project, not a pokie sim report/,
        );
        expect(resolveProject.calls).toEqual(["/blueprints/game.json"]);
    });

    it("falls back to the original error unchanged when the resolver itself fails", async () => {
        const resolveProject: ProjectResolving = {resolve: () => Promise.reject(new Error("resolver exploded"))};
        const command = new ReportCommand(createStubReadFile({}), undefined, undefined, resolveProject);

        await expect(command.run(["missing.json"])).rejects.toThrow(/Could not read simulation report at "missing\.json"/);
    });

    it("leaves an unresolved path's original error unchanged", async () => {
        const resolveProject = stubProjectResolver(undefined);
        const command = new ReportCommand(createStubReadFile({"other.json": JSON.stringify({foo: "bar"})}), undefined, undefined, resolveProject);

        await expect(command.run(["other.json"])).rejects.toThrow(/does not look like a pokie sim report/);
        expect(resolveProject.calls).toEqual(["other.json"]);
    });
});

// Proves the P3-POLISH-21 routing: a mistakenly-given target that resolves to an "outcomeLibrary"/
// "stakeAdapter" project is analyzed through its own canonical outcome-source reader and rendered directly --
// never told to "run pokie sim" first, since neither project type ever gains RUNTIME_EXECUTE_CAPABILITY.
describe("ReportCommand outcome-source project routing", () => {
    function stubProjectResolver(project: PokieProject | undefined): ProjectResolving {
        return {resolve: () => Promise.resolve(project)};
    }

    function stubAnalyzer(report: OutcomeSourceProjectReport | Error): OutcomeSourceProjectAnalyzing & {calls: PokieProject[]} {
        const calls: PokieProject[] = [];
        return {
            calls,
            analyze(project: PokieProject) {
                calls.push(project);
                return report instanceof Error ? Promise.reject(report) : Promise.resolve(report);
            },
        };
    }

    const outcomeLibraryProject: PokieProject = {
        type: "outcomeLibrary",
        rootPath: "/libraries/base",
        capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
        provenance: "test fixture",
    };

    it('renders a canonical-reader-backed exact analysis, with limitations, for a resolved "outcomeLibrary" project', async () => {
        const report: OutcomeSourceProjectReport = {
            rootPath: "/libraries/base",
            descriptor: {kind: "native", streaming: true, limitations: ["never re-derives the game model that produced these outcomes"]},
            issues: [],
            modes: [
                {
                    modeName: "base",
                    analysis: {totalWeight: 1000, rtp: 0.955, hitFrequency: 0.25, zeroWinFrequency: 0.75, variance: 0.1, standardDeviation: 0.3162, maxWin: 500, maxWinProbability: 0.001, payoutDistribution: []},
                },
            ],
        };
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const outcomeSourceAnalyzer = stubAnalyzer(report);
        const command = new ReportCommand(createStubReadFile({}), undefined, undefined, resolveProject, outcomeSourceAnalyzer);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["/libraries/base"]);

        expect(outcomeSourceAnalyzer.calls).toEqual([outcomeLibraryProject]);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('"/libraries/base" is a "native" canonical outcome source (streaming: true).');
        expect(printed).toContain("never re-derives the game model that produced these outcomes");
        expect(printed).toContain('mode "base": rtp 95.50%, hit frequency 25.00%');

        logSpy.mockRestore();
    });

    it("prints the source's own structural issues instead of an exact analysis when it's malformed", async () => {
        const report: OutcomeSourceProjectReport = {
            rootPath: "/libraries/broken",
            descriptor: {kind: "native", streaming: true, limitations: ["never re-derives the game model that produced these outcomes"]},
            issues: [{code: "outcome-library-bundle-manifest-invalid-json", severity: "error", message: "manifest.json is not valid JSON."}],
            modes: [],
        };
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const outcomeSourceAnalyzer = stubAnalyzer(report);
        const command = new ReportCommand(createStubReadFile({}), undefined, undefined, resolveProject, outcomeSourceAnalyzer);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["/libraries/broken"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("1 issue(s) found while reading it:");
        expect(printed).toContain("outcome-library-bundle-manifest-invalid-json");
        expect(printed).not.toContain("Exact analysis");

        logSpy.mockRestore();
    });

    it("falls back to the original error unchanged when the outcome-source analyzer itself fails", async () => {
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const outcomeSourceAnalyzer = stubAnalyzer(new Error("disk exploded"));
        const command = new ReportCommand(createStubReadFile({}), undefined, undefined, resolveProject, outcomeSourceAnalyzer);

        await expect(command.run(["missing.json"])).rejects.toThrow(/Could not read simulation report at "missing\.json"/);
    });

    it("writes the rendered exact analysis to --out, same as an ordinary sim report", async () => {
        const report: OutcomeSourceProjectReport = {
            rootPath: "/libraries/base",
            descriptor: {kind: "stakeEngine", streaming: false, limitations: ["reads every mode's own CSV/books before analyzing"]},
            issues: [],
            modes: [
                {modeName: "base", analysis: {modeName: "base", cost: 1, outcomeCount: 3, totalWeight: 1000, rtp: 0.95, hitFrequency: 0.2, zeroWinFrequency: 0.8, variance: 0.05, standardDeviation: 0.2236, maxPayoutMultiplier: 500, maxRatio: 5, maxWinProbability: 0.005, nonInvertibleRatioCount: 0, payoutDistribution: [], eventClassificationBreakdown: []}},
            ],
        };
        const writeFile = jest.fn();
        const resolveProject = stubProjectResolver({...outcomeLibraryProject, type: "stakeAdapter", capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter});
        const outcomeSourceAnalyzer = stubAnalyzer(report);
        const command = new ReportCommand(createStubReadFile({}), writeFile, undefined, resolveProject, outcomeSourceAnalyzer);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["/stake/base", "--out", "analysis.txt"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("analysis.txt");
        expect(contents).toContain('"stakeEngine" canonical outcome source');

        (console.log as jest.Mock).mockRestore();
    });
});

// Real, non-stubbed end-to-end coverage: "pokie report" pointed straight at a real, on-disk outcome-library
// bundle (built by "pokie outcomelibrary build", not mocked) resolves and renders it through the same
// OutcomeSourceProjectAnalyzer/canonical-reader path the unit tests above stub out.
describe("ReportCommand (integration, real outcome-library bundle)", () => {
    let bundleDir: string;

    beforeEach(async () => {
        bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-report-outcome-source-test-"));
        fs.rmdirSync(bundleDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
    });

    afterEach(() => {
        fs.rmSync(bundleDir, {recursive: true, force: true});
    });

    it("renders a real bundle's exact analysis instead of an error, without ever being told to run \"pokie sim\"", async () => {
        const command = new ReportCommand(undefined, undefined, undefined, new ProjectTargetResolver());
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([bundleDir]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('is a "native" canonical outcome source (streaming: true)');
        expect(printed).toContain('mode "base":');
        expect(printed).not.toContain("run pokie sim");

        logSpy.mockRestore();
    });
});

describe("ReportCommand (SimulationReportSet -- pokie sim --mode all output)", () => {
    it("renders a side-by-side comparison table plus each mode's own section in Markdown", async () => {
        const command = new ReportCommand(createStubReadFile({"set.json": JSON.stringify(reportSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["set.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("# Simulation Report Set: Sample Slot");
        expect(printed).toContain("## Comparison");
        expect(printed).toContain("| Metric | base | ante | buy-10 |");
        expect(printed).toContain("## Mode: base");
        expect(printed).toContain("## Mode: ante");
        expect(printed).toContain("## Mode: buy-10");
        // Each mode's own section is the demoted single-report render() output.
        expect(printed).toContain("### Reproducibility");

        logSpy.mockRestore();
    });

    it("renders the same comparison + per-mode sections in HTML", async () => {
        const command = new ReportCommand(createStubReadFile({"set.json": JSON.stringify(reportSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["set.json", "--format", "html"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("<!DOCTYPE html>");
        expect(printed).toContain("<h1>Simulation Report Set: Sample Slot</h1>");
        expect(printed).toContain("<h2>Comparison</h2>");
        expect(printed).toContain("<h2>Mode: base</h2>");
        expect(printed).toContain("<h2>Mode: ante</h2>");
        expect(printed).toContain("<h2>Mode: buy-10</h2>");

        logSpy.mockRestore();
    });

    it("never renders a blended/overall RTP row -- only per-mode columns", async () => {
        const command = new ReportCommand(createStubReadFile({"set.json": JSON.stringify(reportSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["set.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).not.toMatch(/overall/i);
        expect(printed).not.toMatch(/blended/i);

        logSpy.mockRestore();
    });

    it("shows RTP target/deviation only for modes that declared one", async () => {
        const command = new ReportCommand(createStubReadFile({"set.json": JSON.stringify(reportSet)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["set.json"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("RTP (target)");
        expect(printed).toContain("RTP deviation");
        // buy-10 declared no targetRtp -- its column in those rows must show the "no value" placeholder.
        const targetRow = printed.split("\n").find((line) => line.startsWith("| RTP (target)"));
        expect(targetRow).toBeDefined();
        expect(targetRow!.split("|").map((cell) => cell.trim())).toContain("–");

        logSpy.mockRestore();
    });

    it("fails clearly rather than guessing when the injected renderer doesn't support report sets", async () => {
        const noSetRenderer: SimulationReportRendering = {render: () => "rendered"};
        const command = new ReportCommand(createStubReadFile({"set.json": JSON.stringify(reportSet)}), undefined, {
            markdown: noSetRenderer,
            html: noSetRenderer,
        });

        await expect(command.run(["set.json"])).rejects.toThrow(/does not support multi-mode report sets/);
    });
});

describe("ReportCommand (integration, real pokie sim output)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-report-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("accepts a report produced by pokie sim --out and renders it as Markdown and HTML", async () => {
        const simReportFile = path.join(outDir, "sim.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "100", "--seed", "demo", "--out", simReportFile]);

        const markdownOut = path.join(outDir, "report.md");
        const htmlOut = path.join(outDir, "report.html");
        await new ReportCommand().run([simReportFile, "--out", markdownOut]);
        await new ReportCommand().run([simReportFile, "--format", "html", "--out", htmlOut]);

        const markdown = fs.readFileSync(markdownOut, "utf-8");
        const html = fs.readFileSync(htmlOut, "utf-8");
        expect(markdown).toContain("# Simulation Report: Playable Game");
        expect(markdown).toContain("**Actual rounds**: 100");
        expect(html).toContain("<h1>Simulation Report: Playable Game</h1>");
        expect(html).toContain("<td>100</td>");
    });
});

describe("ReportCommand (integration, base vs. freeGames breakdown from a real free-games game)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game-with-free-games");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-report-breakdown-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("renders a Breakdown section with both base and freeGames rows for a game with a free-games feature", async () => {
        const simReportFile = path.join(outDir, "sim.json");
        await new SimCommand().run([fixtureRoot, "--rounds", "5000", "--seed", "demo", "--out", simReportFile]);

        const simReport = JSON.parse(fs.readFileSync(simReportFile, "utf-8")) as SimulationReport;
        expect(simReport.breakdown).toBeDefined();
        expect(simReport.breakdown!.components.base.rounds).toBeGreaterThan(0);
        expect(simReport.breakdown!.components.freeGames.rounds).toBeGreaterThan(0);

        const markdownOut = path.join(outDir, "report.md");
        await new ReportCommand().run([simReportFile, "--out", markdownOut]);
        const markdown = fs.readFileSync(markdownOut, "utf-8");

        expect(markdown).toContain("## Breakdown");
        expect(markdown).toContain("| base |");
        expect(markdown).toContain("| freeGames |");
    });
});

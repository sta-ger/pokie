import {SimulationReport} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ReportCommand} from "../../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../../cli/commands/SimCommand.js";

const report: SimulationReport = {
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
        expect(printed).toContain("# Simulation Report: Crazy Fruits");
        expect(printed).toContain("**RTP**: 95.22%");

        logSpy.mockRestore();
    });

    it("prints HTML to the console when --format html is given", async () => {
        const command = new ReportCommand(createStubReadFile({"sim.json": JSON.stringify(report)}));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["sim.json", "--format", "html"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("<!DOCTYPE html>");
        expect(printed).toContain("<h1>Simulation Report: Crazy Fruits</h1>");

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
        expect(printed).toContain("# Simulation Report: Crazy Fruits");
        expect(printed).not.toContain("## Reproducibility");
        expect(printed).not.toContain("## Warnings");
        expect(printed).not.toContain("## Recommendations");
        expect(printed).toContain("<h1>Simulation Report: Crazy Fruits</h1>");

        logSpy.mockRestore();
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

import fs from "fs";
import os from "os";
import path from "path";
import {
    StakeEngineExportModeInput,
    StakeEngineExporter,
    StakeEngineOutcomeSourceReadResult,
    StakeEngineOutcomeSourceReading,
    StakeEngineStandaloneAnalysisDiff,
    StakeEngineStandaloneAnalysisDiffing,
    ValidationIssue,
} from "pokie";
import {StakeEngineCommand} from "../../../cli/commands/StakeEngineCommand.js";
import {buildSingleOutcomeStakeEngineLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";

function createStubReader(results: Record<string, StakeEngineOutcomeSourceReadResult>): StakeEngineOutcomeSourceReading & {calledWith: string[]} {
    return {
        calledWith: [] as string[],
        readFromDirectory(stakeDir: string) {
            this.calledWith.push(stakeDir);
            const result = results[stakeDir];
            if (!result) {
                throw new Error(`no stub result for "${stakeDir}"`);
            }
            return Promise.resolve(result);
        },
    };
}

function createExplodingDiffer(): StakeEngineStandaloneAnalysisDiffing & {calledCount: number} {
    return {
        calledCount: 0,
        diff(): StakeEngineStandaloneAnalysisDiff {
            this.calledCount++;
            throw new Error("diff() must never be called when either side failed to read");
        },
    };
}

const identicalReadResult = (stakeDir: string): StakeEngineOutcomeSourceReadResult => ({
    stakeDir,
    issues: [],
    modes: [
        {
            modeName: "base",
            cost: 1,
            outcomes: [
                {id: 0, weight: 750, payoutMultiplier: 0, ratio: 0, events: []},
                {id: 1, weight: 250, payoutMultiplier: 400, ratio: 4, events: []},
            ],
        },
    ],
});

const materiallyDifferentRightReadResult: StakeEngineOutcomeSourceReadResult = {
    stakeDir: "/project/right",
    issues: [],
    modes: [
        {
            modeName: "base",
            cost: 1,
            outcomes: [
                {id: 0, weight: 700, payoutMultiplier: 0, ratio: 0, events: []},
                {id: 1, weight: 300, payoutMultiplier: 400, ratio: 4, events: []},
            ],
        },
    ],
};

describe("StakeEngineCommand diff", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("throws a descriptive error when no stakeDirs are given", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run(["diff"])).rejects.toThrow(/Usage: pokie stakeengine diff/);
    });

    it("throws a descriptive error when only one stakeDir is given", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run(["diff", "/project/left"])).rejects.toThrow(/Usage: pokie stakeengine diff/);
    });

    it("throws on --out with no value", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run(["diff", "/project/left", "/project/right", "--out"])).rejects.toThrow(/--out requires a file path/);
    });

    it("throws on an unknown option", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run(["diff", "/project/left", "/project/right", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("rejects an unknown --format value", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run(["diff", "/project/left", "/project/right", "--format", "xml"])).rejects.toThrow('--format only supports "json"');
    });

    it("reads both directories, diffs, prints a summary, and returns 0 (no material difference) for identical inputs", async () => {
        const reader = createStubReader({
            "/project/left": identicalReadResult("/project/left"),
            "/project/right": identicalReadResult("/project/right"),
        });
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader);

        const exitCode = await command.run(["diff", "/project/left", "/project/right"]);

        expect(exitCode).toBe(0);
        expect(reader.calledWith.sort()).toEqual(["/project/left", "/project/right"]);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Diffing "/project/left" -> "/project/right"');
        expect(printed).toContain('Mode "base"');
        expect(printed).toContain("No material differences detected.");
    });

    it("returns 1 (material difference) and reports it when rtp drifts past the differ's warning threshold", async () => {
        const reader = createStubReader({
            "/project/left": identicalReadResult("/project/left"),
            "/project/right": materiallyDifferentRightReadResult,
        });
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader);

        const exitCode = await command.run(["diff", "/project/left", "/project/right"]);

        expect(exitCode).toBe(1);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Material differences detected.");
        expect(printed).toContain("RTP changed by");
    });

    it("reports added/removed modes and treats them as a material difference", async () => {
        const reader = createStubReader({
            "/project/left": identicalReadResult("/project/left"),
            "/project/right": {
                stakeDir: "/project/right",
                issues: [],
                modes: [
                    ...identicalReadResult("/project/right").modes,
                    {modeName: "bonus", cost: 100, outcomes: [{id: 0, weight: 1, payoutMultiplier: 0, ratio: 0, events: []}]},
                ],
            },
        });
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader);

        const exitCode = await command.run(["diff", "/project/left", "/project/right"]);

        expect(exitCode).toBe(1);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Added modes (only in "/project/right"): bonus');
        expect(printed).toContain("Material differences detected.");
    });

    it("returns 2, prints the read errors, and never invokes the differ when one side fails to read", async () => {
        const issues: ValidationIssue[] = [{code: "stakeengine-standalone-index-missing", severity: "error", message: "no index.json"}];
        const reader = createStubReader({
            "/project/left": {stakeDir: "/project/left", issues, modes: []},
            "/project/right": identicalReadResult("/project/right"),
        });
        const differ = createExplodingDiffer();
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader, undefined, undefined, differ);

        const exitCode = await command.run(["diff", "/project/left", "/project/right"]);

        expect(exitCode).toBe(2);
        expect(differ.calledCount).toBe(0);
        expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("no index.json");
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Errors reading "/project/left"');
    });

    it("--format json prints the machine-readable {stakeDir, issues, diff} shape", async () => {
        const reader = createStubReader({
            "/project/left": identicalReadResult("/project/left"),
            "/project/right": materiallyDifferentRightReadResult,
        });
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader);

        const exitCode = await command.run(["diff", "/project/left", "/project/right", "--format", "json"]);

        expect(exitCode).toBe(1);
        const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const parsed = JSON.parse(printedJson) as {
            stakeDir: {left: string; right: string};
            issues: {left: ValidationIssue[]; right: ValidationIssue[]};
            diff: StakeEngineStandaloneAnalysisDiff;
        };
        expect(parsed.stakeDir).toEqual({left: "/project/left", right: "/project/right"});
        expect(parsed.issues).toEqual({left: [], right: []});
        expect(parsed.diff.perMode.base.rtp.delta).toBeCloseTo(0.2, 10);
        expect(parsed.diff.onlyInLeft).toEqual([]);
        expect(parsed.diff.onlyInRight).toEqual([]);
    });

    it("--out writes the same report to a file", async () => {
        const reader = createStubReader({
            "/project/left": identicalReadResult("/project/left"),
            "/project/right": identicalReadResult("/project/right"),
        });
        const writeFile = jest.fn();
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader, undefined, writeFile);

        const exitCode = await command.run(["diff", "/project/left", "/project/right", "--out", "/tmp/diff-report.json"]);

        expect(exitCode).toBe(0);
        expect(writeFile).toHaveBeenCalledTimes(1);
        const [filePath, contents] = writeFile.mock.calls[0] as [string, string];
        expect(filePath).toBe("/tmp/diff-report.json");
        const parsed = JSON.parse(contents) as {stakeDir: {left: string; right: string}};
        expect(parsed.stakeDir).toEqual({left: "/project/left", right: "/project/right"});
    });

    it("end to end: diffs two real Stake Engine directories exported at different totalWins, detecting the rtp drift and never event-level diffing", async () => {
        const leftDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-left-"));
        const rightDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-right-"));
        try {
            const leftModes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "left-lib", betMode: "base", stake: 1, totalWin: 5})},
            ];
            const rightModes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "right-lib", betMode: "base", stake: 1, totalWin: 25})},
            ];
            await new StakeEngineExporter("1.3.0").exportToDirectory(leftModes, leftDir);
            await new StakeEngineExporter("1.3.0").exportToDirectory(rightModes, rightDir);

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["diff", leftDir, rightDir, "--format", "json"]);

            expect(exitCode).toBe(1);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            const parsed = JSON.parse(printed) as {issues: {left: ValidationIssue[]; right: ValidationIssue[]}; diff: StakeEngineStandaloneAnalysisDiff};
            expect(parsed.issues.left.some((issue) => issue.severity === "error")).toBe(false);
            expect(parsed.issues.right.some((issue) => issue.severity === "error")).toBe(false);
            expect(parsed.diff.perMode.base.rtp.left).toBe(5);
            expect(parsed.diff.perMode.base.rtp.right).toBe(25);
            expect(parsed.diff.perMode.base.rtp.delta).toBe(20);
        } finally {
            fs.rmSync(leftDir, {recursive: true, force: true});
            fs.rmSync(rightDir, {recursive: true, force: true});
        }
    });

    it("end to end: diffing the same pair of real Stake Engine directories twice produces byte-identical --format json output", async () => {
        const leftDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-determinism-left-"));
        const rightDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-determinism-right-"));
        try {
            const leftModes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "left-lib", betMode: "base", stake: 1, totalWin: 5})},
            ];
            const rightModes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "right-lib", betMode: "base", stake: 1, totalWin: 25})},
            ];
            await new StakeEngineExporter("1.3.0").exportToDirectory(leftModes, leftDir);
            await new StakeEngineExporter("1.3.0").exportToDirectory(rightModes, rightDir);

            const firstRun = await new StakeEngineCommand("1.3.0").run(["diff", leftDir, rightDir, "--format", "json"]);
            const secondRun = await new StakeEngineCommand("1.3.0").run(["diff", leftDir, rightDir, "--format", "json"]);

            expect(firstRun).toBe(1);
            expect(secondRun).toBe(1);
            const [firstPrinted, secondPrinted] = logSpy.mock.calls.map((call) => call[0] as string);
            expect(secondPrinted).toBe(firstPrinted);
        } finally {
            fs.rmSync(leftDir, {recursive: true, force: true});
            fs.rmSync(rightDir, {recursive: true, force: true});
        }
    });
});

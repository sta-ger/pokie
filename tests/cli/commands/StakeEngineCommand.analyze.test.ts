import fs from "fs";
import os from "os";
import path from "path";
import {
    StakeEngineExportModeInput,
    StakeEngineExporter,
    StakeEngineOutcomeSourceReadResult,
    StakeEngineOutcomeSourceReading,
    StakeEngineStandaloneAnalysis,
    StakeEngineStandaloneAnalyzer,
    ValidationIssue,
} from "pokie";
import {StakeEngineCommand} from "../../../cli/commands/StakeEngineCommand.js";
import {buildSingleOutcomeStakeEngineLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";

function createStubReader(result: StakeEngineOutcomeSourceReadResult): StakeEngineOutcomeSourceReading & {calledWith?: string} {
    return {
        readFromDirectory(stakeDir: string) {
            this.calledWith = stakeDir;
            return Promise.resolve(result);
        },
    };
}

const successReadResult: StakeEngineOutcomeSourceReadResult = {
    stakeDir: "/project/stake",
    issues: [],
    modes: [{modeName: "base", cost: 1, outcomes: [{id: 0, weight: 1, payoutMultiplier: 0, ratio: 0, events: []}]}],
};

describe("StakeEngineCommand analyze", () => {
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

    it("reads, analyzes, and prints a summary, returning 0 on success", async () => {
        const reader = createStubReader(successReadResult);
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader);

        const exitCode = await command.run(["analyze", "/project/stake"]);

        expect(exitCode).toBe(0);
        expect(reader.calledWith).toBe("/project/stake");
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Analyzing "/project/stake"');
        expect(printed).toContain('Mode "base"');
    });

    it("prints an error summary and returns 1 when the reader reports error-level issues, never running the analyzer", async () => {
        const issues: ValidationIssue[] = [{code: "stakeengine-standalone-index-missing", severity: "error", message: "no index.json"}];
        const reader = createStubReader({stakeDir: "/project/stake", modes: [], issues});
        let analyzeCalled = false;
        const analyzer = {
            analyze: () => {
                analyzeCalled = true;
                return {} as StakeEngineStandaloneAnalysis;
            },
        } as unknown as StakeEngineStandaloneAnalyzer;
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader, analyzer);

        const exitCode = await command.run(["analyze", "/project/stake"]);

        expect(exitCode).toBe(1);
        expect(analyzeCalled).toBe(false);
        expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("no index.json");
    });

    it("--format json prints the machine-readable {stakeDir, issues, analysis} shape", async () => {
        const reader = createStubReader(successReadResult);
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader);

        const exitCode = await command.run(["analyze", "/project/stake", "--format", "json"]);

        expect(exitCode).toBe(0);
        const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const parsed = JSON.parse(printedJson) as {stakeDir: string; issues: ValidationIssue[]; analysis: StakeEngineStandaloneAnalysis};
        expect(parsed.stakeDir).toBe("/project/stake");
        expect(parsed.issues).toEqual([]);
        expect(parsed.analysis?.modes[0].modeName).toBe("base");
    });

    it("--out writes the same report to a file", async () => {
        const reader = createStubReader(successReadResult);
        const writeFile = jest.fn();
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader, undefined, writeFile);

        await command.run(["analyze", "/project/stake", "--out", "/tmp/report.json"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [filePath, contents] = writeFile.mock.calls[0] as [string, string];
        expect(filePath).toBe("/tmp/report.json");
        expect(JSON.parse(contents).stakeDir).toBe("/project/stake");
    });

    it("rejects an unknown --format value", async () => {
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, createStubReader(successReadResult));

        await expect(command.run(["analyze", "/project/stake", "--format", "xml"])).rejects.toThrow('--format only supports "json"');
    });

    it("end to end: analyzes a real Stake Engine directory with no pokie-manifest.json at all", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-test-"));
        try {
            const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "cli-lib", betMode: "base", stake: 1, totalWin: 5});
            const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library}];
            await new StakeEngineExporter("1.3.0").exportToDirectory(modes, dir);
            fs.rmSync(path.join(dir, "pokie-manifest.json"));

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["analyze", dir, "--format", "json"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            const parsed = JSON.parse(printed) as {issues: ValidationIssue[]; analysis: StakeEngineStandaloneAnalysis};
            expect(parsed.issues.some((issue) => issue.severity === "error")).toBe(false);
            expect(parsed.analysis?.modes[0].modeName).toBe("base");
            expect(parsed.analysis?.modes[0].rtp).toBe(5);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});

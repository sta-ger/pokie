import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
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

function writeUint64FixtureDirectory(dir: string, weights: readonly bigint[]): void {
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes: [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]}));
    const csv = weights.map((weight, id) => `${id},${weight},${id === 0 ? 0 : 100}`).join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "lookup.csv"), csv);
    const jsonl = weights.map((_, id) => JSON.stringify({id, payoutMultiplier: id === 0 ? 0 : 100, events: []})).join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "books.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));
}

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

    it("end to end: serializes uint64 weights above Number.MAX_SAFE_INTEGER as canonical decimal strings, never as a bigint, in both --format json and the default summary", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-uint64-test-"));
        try {
            const uint64Max = BigInt("18446744073709551615");
            writeUint64FixtureDirectory(dir, [uint64Max, BigInt(1)]);
            const expectedTotalWeight = (uint64Max + BigInt(1)).toString();

            const jsonCommand = new StakeEngineCommand("1.3.0");
            const jsonExitCode = await jsonCommand.run(["analyze", dir, "--format", "json"]);
            expect(jsonExitCode).toBe(0);

            const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(() => JSON.parse(printedJson)).not.toThrow();
            const parsed = JSON.parse(printedJson) as {analysis: StakeEngineStandaloneAnalysis};
            const [mode] = parsed.analysis.modes;

            expect(typeof mode.totalWeight).toBe("string");
            expect(mode.totalWeight).toBe(expectedTotalWeight);
            expect(mode.payoutDistribution.every((bucket) => typeof bucket.probability === "string")).toBe(true);
            expect(collectUnsafeNumbers(parsed)).toEqual([]);

            logSpy.mockClear();
            const summaryCommand = new StakeEngineCommand("1.3.0");
            const summaryExitCode = await summaryCommand.run(["analyze", dir]);
            expect(summaryExitCode).toBe(0);
            const printedSummary = logSpy.mock.calls.map((call) => call[0]).join("\n");

            expect(printedSummary).toContain(`total weight ${expectedTotalWeight}`);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});

// Walks a parsed JSON value looking for any plain `number` above Number.MAX_SAFE_INTEGER -- valid JSON.parse output
// can never contain a bigint (JSON has no bigint literal), so the only way an unsafe integer could have been
// silently emitted is as a `number` that already lost precision on the way out.
function collectUnsafeNumbers(value: unknown, path = "<root>"): string[] {
    if (typeof value === "number") {
        return Number.isFinite(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER ? [path] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((element, index) => collectUnsafeNumbers(element, `${path}[${index}]`));
    }
    if (typeof value === "object" && value !== null) {
        return Object.entries(value).flatMap(([key, entry]) => collectUnsafeNumbers(entry, `${path}.${key}`));
    }
    return [];
}

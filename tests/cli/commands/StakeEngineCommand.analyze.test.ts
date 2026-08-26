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

    it("end to end: computes exact weighted results over a uint64-scale directory with distinct payout buckets, with no precision loss anywhere in the JSON report", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-exact-test-"));
        try {
            // The 970/25/5 hand-computable distribution scaled by 1e16: total 1e19 sits above Number.MAX_SAFE_INTEGER,
            // every weight stays inside uint64, and cost 1 makes ratio === payoutMultiplier / 100. rtp/probabilities
            // must match the small-integer distribution exactly through the real read -> analyze -> JSON path.
            writeExactWeightFixtureDirectory(dir, [
                {id: 0, weight: BigInt("9700000000000000000"), payoutMultiplier: 0},
                {id: 1, weight: BigInt("250000000000000000"), payoutMultiplier: 200},
                {id: 2, weight: BigInt("50000000000000000"), payoutMultiplier: 500},
            ]);

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["analyze", dir, "--format", "json"]);
            expect(exitCode).toBe(0);

            const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
            const parsed = JSON.parse(printedJson) as {analysis: StakeEngineStandaloneAnalysis};
            const [mode] = parsed.analysis.modes;

            expect(mode.totalWeight).toBe("10000000000000000000");
            expect(mode.rtp).toBeCloseTo(0.075, 10);
            expect(mode.hitFrequency).toBeCloseTo(0.03, 10);
            // variance/standardDeviation are the other two headline weighted metrics: E[ratio^2] - E[ratio]^2 =
            // (0.025*2^2 + 0.005*5^2) - 0.075^2 = 0.225 - 0.005625 = 0.219375 -- proven exact through the real CLI path,
            // not just the unit-level analyzer, so the representative JSON output carries every weighted metric losslessly.
            expect(mode.variance).toBeCloseTo(0.219375, 10);
            expect(mode.standardDeviation).toBeCloseTo(Math.sqrt(0.219375), 10);
            expect(mode.maxPayoutMultiplier).toBe(500);
            expect(mode.maxRatio).toBe(5);
            expect(mode.payoutDistribution).toEqual([
                {payoutMultiplier: 0, weight: "9700000000000000000", ratio: 0, probability: "0.97"},
                {payoutMultiplier: 200, weight: "250000000000000000", ratio: 2, probability: "0.025"},
                {payoutMultiplier: 500, weight: "50000000000000000", ratio: 5, probability: "0.005"},
            ]);
            expect(collectUnsafeNumbers(parsed)).toEqual([]);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    it("end to end: emits a non-terminating canonical 40-place decimal probability through the real CLI JSON path with no precision loss", async () => {
        // Every other end-to-end uint64 test uses splits whose probabilities terminate (0.97/0.025/0.005), so the
        // analyzer's 40-place repeating-decimal branch is only ever exercised by unit tests, never through the real
        // read -> analyze -> JSON CLI path. Three equal uint64-scale weights (total 3e18, above Number.MAX_SAFE_INTEGER)
        // give each distinct bucket probability exactly 1/3, which no float or finite decimal can hold: the CLI must
        // serialize the canonical 40-place "0.333..." string, digit-for-digit, with nothing coerced back to a number.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-third-test-"));
        try {
            const oneThird = BigInt("1000000000000000000");
            writeExactWeightFixtureDirectory(dir, [
                {id: 0, weight: oneThird, payoutMultiplier: 0},
                {id: 1, weight: oneThird, payoutMultiplier: 100},
                {id: 2, weight: oneThird, payoutMultiplier: 200},
            ]);

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["analyze", dir, "--format", "json"]);
            expect(exitCode).toBe(0);

            const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
            const parsed = JSON.parse(printedJson) as {analysis: StakeEngineStandaloneAnalysis};
            const [mode] = parsed.analysis.modes;

            const expectedThird = "0." + "3".repeat(40);
            expect(mode.totalWeight).toBe("3000000000000000000");
            expect(mode.payoutDistribution.map((bucket) => bucket.probability)).toEqual([expectedThird, expectedThird, expectedThird]);
            expect(mode.payoutDistribution.every((bucket) => typeof bucket.probability === "string")).toBe(true);
            expect(collectUnsafeNumbers(parsed)).toEqual([]);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    it("end to end: rejects a malformed event in a uint64-scale directory with exit 1, surfacing the error in the JSON report and never running the analyzer", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-malformed-test-"));
        try {
            // A directory whose weights are genuine uint64-scale values (total above Number.MAX_SAFE_INTEGER), but whose
            // second outcome carries a malformed event (an object with no string "type"). The reader must raise an
            // error-severity stakeengine-standalone-books-malformed-event, which makes the CLI exit 1, omit the analysis
            // entirely, and still serialize the weights it did read as canonical strings -- no precision loss on the way out.
            writeMalformedEventUint64Directory(dir, BigInt("18446744073709551615"), BigInt("9700000000000000000"));

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["analyze", dir, "--format", "json"]);
            expect(exitCode).toBe(1);

            const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
            const parsed = JSON.parse(printedJson) as {issues: ValidationIssue[]; analysis?: StakeEngineStandaloneAnalysis};
            const malformed = parsed.issues.find((issue) => issue.code === "stakeengine-standalone-books-malformed-event");
            expect(malformed?.severity).toBe("error");
            expect(parsed.analysis).toBeUndefined();
            expect(collectUnsafeNumbers(parsed)).toEqual([]);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    it("end to end: rejects a lookup weight above uint64 max with exit 1, surfacing the error in the JSON report and never running the analyzer", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-weight-overflow-test-"));
        try {
            // The weight-side counterpart to the malformed-event test: one lookup weight is uint64 max + 1, above both
            // Number.MAX_SAFE_INTEGER and the uint64 ceiling the analyzer's exact fixed-point path is built around. The
            // validator must raise an error-severity stakeengine-standalone-outcome-weight-not-positive-integer, making
            // the CLI exit 1, omit the analysis entirely, and emit no unsafe number anywhere in the JSON report -- the
            // out-of-range weight is reported as a string in the message, never silently truncated to a lossy number.
            const aboveUint64Max = BigInt("18446744073709551615") + BigInt(1);
            writeExactWeightFixtureDirectory(dir, [
                {id: 0, weight: BigInt("9700000000000000000"), payoutMultiplier: 0},
                {id: 1, weight: aboveUint64Max, payoutMultiplier: 100},
            ]);

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["analyze", dir, "--format", "json"]);
            expect(exitCode).toBe(1);

            const printedJson = logSpy.mock.calls.map((call) => call[0]).join("\n");
            const parsed = JSON.parse(printedJson) as {issues: ValidationIssue[]; analysis?: StakeEngineStandaloneAnalysis};
            const overflow = parsed.issues.find((issue) => issue.code === "stakeengine-standalone-outcome-weight-not-positive-integer");
            expect(overflow?.severity).toBe("error");
            expect(overflow?.message).toContain(aboveUint64Max.toString());
            expect(parsed.analysis).toBeUndefined();
            expect(collectUnsafeNumbers(parsed)).toEqual([]);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    it("end to end: --out writes a uint64-scale report file whose canonical string weights survive round-tripping through disk with no precision loss", async () => {
        // The other uint64 CLI tests only exercise the stdout/summary paths; the --out file-write path is a distinct
        // representative CLI output and is elsewhere only covered with a stubbed reader and small-integer data. Drive the
        // real read -> analyze -> fs.writeFileSync path over uint64-scale weights whose total exceeds Number.MAX_SAFE_INTEGER,
        // then read the file back off disk and prove the canonical decimal strings survived rather than re-floating.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-out-uint64-test-"));
        const outFile = path.join(dir, "report.json");
        try {
            const uint64Max = BigInt("18446744073709551615");
            writeUint64FixtureDirectory(dir, [uint64Max, BigInt(1)]);
            const expectedTotalWeight = (uint64Max + BigInt(1)).toString();

            const command = new StakeEngineCommand("1.3.0");
            const exitCode = await command.run(["analyze", dir, "--out", outFile]);
            expect(exitCode).toBe(0);

            const contents = fs.readFileSync(outFile, "utf-8");
            expect(() => JSON.parse(contents)).not.toThrow();
            const parsed = JSON.parse(contents) as {analysis: StakeEngineStandaloneAnalysis};
            const [mode] = parsed.analysis.modes;

            expect(typeof mode.totalWeight).toBe("string");
            expect(mode.totalWeight).toBe(expectedTotalWeight);
            expect(mode.payoutDistribution.every((bucket) => typeof bucket.probability === "string")).toBe(true);
            expect(collectUnsafeNumbers(parsed)).toEqual([]);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    it("end to end: replaces an existing analysis report without using diff publication diagnostics", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-analyze-cli-existing-out-test-"));
        const outFile = path.join(dir, "analysis.json");
        try {
            const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "cli-lib", betMode: "base", stake: 1, totalWin: 5});
            await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], dir);
            fs.writeFileSync(outFile, "previous analysis report", "utf-8");

            const exitCode = await new StakeEngineCommand("1.3.0").run(["analyze", dir, "--out", outFile]);

            expect(exitCode).toBe(0);
            expect(JSON.parse(fs.readFileSync(outFile, "utf-8"))).toMatchObject({stakeDir: dir, issues: []});
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).not.toContain("Cannot write Stake Engine diff");
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});

// Writes a uint64-scale standalone directory whose second outcome carries a malformed event (an object with no string
// "type"), so a test can drive the reader's error-severity malformed-event rejection through the real CLI path while the
// weights themselves stay genuine uint64 values above Number.MAX_SAFE_INTEGER.
function writeMalformedEventUint64Directory(dir: string, lossWeight: bigint, winWeight: bigint): void {
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes: [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]}));
    fs.writeFileSync(path.join(dir, "lookup.csv"), `0,${lossWeight},0\n1,${winWeight},100\n`);
    const jsonl = [
        JSON.stringify({id: 0, payoutMultiplier: 0, events: [{index: 0, type: "reveal"}]}),
        JSON.stringify({id: 1, payoutMultiplier: 100, events: [{index: 0}]}),
    ].join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "books.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));
}

// Writes a standalone Stake Engine directory whose per-row weight and payoutMultiplier are given verbatim, so a test
// can exercise distinct payout buckets and uint64-scale weights the shared uint64 fixture writer doesn't cover.
function writeExactWeightFixtureDirectory(dir: string, rows: readonly {id: number; weight: bigint; payoutMultiplier: number}[]): void {
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes: [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]}));
    fs.writeFileSync(path.join(dir, "lookup.csv"), rows.map((row) => `${row.id},${row.weight},${row.payoutMultiplier}`).join("\n") + "\n");
    const jsonl = rows.map((row) => JSON.stringify({id: row.id, payoutMultiplier: row.payoutMultiplier, events: row.payoutMultiplier > 0 ? [{index: 0, type: "win", amount: row.payoutMultiplier}] : [{index: 0, type: "reveal"}]})).join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "books.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));
}

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

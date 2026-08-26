import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
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

// This fixture intentionally bypasses StakeEngineExporter so the CLI's advertised foreign-input
// path is proven against an independently supplied compatible directory, not self-readback.
function writeForeignFixtureDirectory(dir: string, winningPayoutMultiplier: number): void {
    fs.writeFileSync(
        path.join(dir, "index.json"),
        JSON.stringify({modes: [{name: "base", cost: 1, events: "vendor-books.zst", weights: "vendor-lookup.csv"}]}),
    );
    fs.writeFileSync(path.join(dir, "vendor-lookup.csv"), `0,900,0\n1,100,${winningPayoutMultiplier}\n`);
    const jsonl = [
        {id: 0, payoutMultiplier: 0, events: [{index: 0, type: "vendorAnticipation"}]},
        {id: 1, payoutMultiplier: winningPayoutMultiplier, events: [{index: 0, type: "vendorMultiplier", value: 2}]},
    ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "vendor-books.zst"), zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));
}

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
        const writeNewDiffFile = jest.fn();
        const command = new StakeEngineCommand("1.3.0", undefined, undefined, undefined, undefined, undefined, undefined, reader, undefined, undefined, undefined, writeNewDiffFile);

        const exitCode = await command.run(["diff", "/project/left", "/project/right", "--out", "/tmp/diff-report.json"]);

        expect(exitCode).toBe(0);
        expect(writeNewDiffFile).toHaveBeenCalledTimes(1);
        const [filePath, contents] = writeNewDiffFile.mock.calls[0] as [string, string];
        expect(filePath).toBe("/tmp/diff-report.json");
        const parsed = JSON.parse(contents) as {stakeDir: {left: string; right: string}};
        expect(parsed.stakeDir).toEqual({left: "/project/left", right: "/project/right"});
    });

    it("publishes a new diff artifact but preserves existing and input-directory destinations", async () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-safe-output-"));
        const leftDir = path.join(rootDir, "left");
        const rightDir = path.join(rootDir, "right");
        const outputPath = path.join(rootDir, "diff-report.json");
        const existingOutputPath = path.join(rootDir, "existing-diff.json");
        const leftAlias = path.join(rootDir, "left-alias");
        try {
            await new StakeEngineExporter("1.3.0").exportToDirectory(
                [{modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "left-lib", betMode: "base", stake: 1, totalWin: 5})}],
                leftDir,
            );
            await new StakeEngineExporter("1.3.0").exportToDirectory(
                [{modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "right-lib", betMode: "base", stake: 1, totalWin: 25})}],
                rightDir,
            );
            fs.writeFileSync(existingOutputPath, "existing diff artifact", "utf-8");
            fs.symlinkSync(leftDir, leftAlias, "dir");
            const leftIndexPath = path.join(leftDir, "index.json");
            const leftIndexBefore = fs.readFileSync(leftIndexPath, "utf-8");
            const command = new StakeEngineCommand("1.3.0");

            expect(await command.run(["diff", leftDir, rightDir, "--format", "json", "--out", outputPath])).toBe(1);
            const artifact = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {diff: StakeEngineStandaloneAnalysisDiff};
            expect(artifact.diff.perMode.base.rtp.delta).toBe(20);

            await expect(command.run(["diff", leftDir, rightDir, "--out", existingOutputPath])).rejects.toThrow(
                `Cannot write Stake Engine diff to "${existingOutputPath}" because that destination already exists. Choose a new unused --out path and retry.`,
            );
            await expect(command.run(["diff", leftDir, rightDir, "--out", path.join(rightDir, "new-diff.json")])).rejects.toThrow(
                /because it is inside input directory/,
            );
            await expect(command.run(["diff", leftDir, rightDir, "--out", path.join(leftAlias, "index.json")])).rejects.toThrow(
                /because it is inside input directory/,
            );

            expect(fs.readFileSync(existingOutputPath, "utf-8")).toBe("existing diff artifact");
            expect(fs.readFileSync(leftIndexPath, "utf-8")).toBe(leftIndexBefore);
            expect(fs.existsSync(path.join(rightDir, "new-diff.json"))).toBe(false);
        } finally {
            fs.rmSync(rootDir, {recursive: true, force: true});
        }
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

    it("end to end: diffs POKIE output against an independently supplied compatible Stake directory", async () => {
        const leftDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-pokie-left-"));
        const foreignDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-diff-cli-foreign-right-"));
        try {
            await new StakeEngineExporter("1.3.0").exportToDirectory(
                [{modeName: "base", cost: 1, library: buildSingleOutcomeStakeEngineLibrary({libraryId: "left-lib", betMode: "base", stake: 1, totalWin: 5})}],
                leftDir,
            );
            writeForeignFixtureDirectory(foreignDir, 1500);

            const exitCode = await new StakeEngineCommand("1.3.0").run(["diff", leftDir, foreignDir, "--format", "json"]);

            expect(exitCode).toBe(1);
            const parsed = JSON.parse(logSpy.mock.calls.map((call) => call[0]).join("\n")) as {
                issues: {left: ValidationIssue[]; right: ValidationIssue[]};
                diff: StakeEngineStandaloneAnalysisDiff;
            };
            expect(parsed.issues.left.filter((issue) => issue.severity === "error")).toEqual([]);
            expect(parsed.issues.right.filter((issue) => issue.severity === "error")).toEqual([]);
            expect(parsed.diff.perMode.base.rtp).toMatchObject({left: 5, right: 1.5, delta: -3.5});
        } finally {
            fs.rmSync(leftDir, {recursive: true, force: true});
            fs.rmSync(foreignDir, {recursive: true, force: true});
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

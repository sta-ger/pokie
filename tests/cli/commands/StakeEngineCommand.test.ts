import {
    StakeEngineBundleModeInput,
    StakeEngineBundleStreamingExporting,
    StakeEngineExportModeInput,
    StakeEngineExporting,
    StakeEngineExportResult,
    StakeEngineImportResult,
    StakeEngineImporting,
    StakeEngineImportWriting,
    ValidationIssue,
} from "pokie";
import {StakeEngineCommand} from "../../../cli/commands/StakeEngineCommand.js";

const CONFIG_PATH = "/project/stake-config.json";
const BASE_LIBRARY = {schemaVersion: 1, libraryId: "base-lib", outcomes: []};
const BONUS_LIBRARY = {schemaVersion: 1, libraryId: "bonus-lib", outcomes: []};

function createStubJsonStore(entries: Record<string, unknown>): (filePath: string) => unknown {
    return (filePath: string) => {
        if (!(filePath in entries)) {
            throw new Error(`no stub JSON for "${filePath}"`);
        }
        return entries[filePath];
    };
}

function createStubExporter(result: StakeEngineExportResult): StakeEngineExporting & {calledWith?: {modes: StakeEngineExportModeInput[]; outDir: string}} {
    return {
        exportToDirectory(modes: StakeEngineExportModeInput[], outDir: string) {
            this.calledWith = {modes, outDir};
            return Promise.resolve(result);
        },
    };
}

function createStubBundleStreamingExporter(
    result: StakeEngineExportResult,
): StakeEngineBundleStreamingExporting & {calledWith?: {modes: StakeEngineBundleModeInput[]; outDir: string}} {
    return {
        exportToDirectory(modes: StakeEngineBundleModeInput[], outDir: string) {
            this.calledWith = {modes, outDir};
            return Promise.resolve(result);
        },
    };
}

const descriptor = {
    modes: [
        {modeName: "base", cost: 1, libraryPath: "./libraries/base.json"},
        {modeName: "bonus", cost: 100, libraryPath: "./libraries/bonus.json"},
    ],
};

const successResult: StakeEngineExportResult = {
    outDir: "/project/stakeengine",
    files: ["lookup_base.csv", "books_base.jsonl.zst", "index.json", "pokie-manifest.json"],
    manifest: undefined,
    issues: [],
};

function createStubImporter(result: StakeEngineImportResult): StakeEngineImporting & {calledWith?: string} {
    return {
        importFromDirectory(stakeDir: string) {
            this.calledWith = stakeDir;
            return Promise.resolve(result);
        },
    };
}

function createStubImportWriter(
    issues: ValidationIssue[] = [],
): StakeEngineImportWriting & {calledWith?: {importResult: StakeEngineImportResult; outDir: string}} {
    return {
        writeToDirectory(importResult: StakeEngineImportResult, outDir: string) {
            this.calledWith = {importResult, outDir};
            return Promise.resolve({issues});
        },
    };
}

const successImportResult: StakeEngineImportResult = {
    stakeDir: "/project/stake",
    manifest: undefined,
    modes: [
        {modeName: "base", cost: 1, library: BASE_LIBRARY},
        {modeName: "bonus", cost: 100, library: BONUS_LIBRARY},
    ],
    sourceProvenance: undefined,
    issues: [],
};

describe("StakeEngineCommand", () => {
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

    it("has the expected name and description", () => {
        const command = new StakeEngineCommand("1.3.0", createStubExporter(successResult));

        expect(command.getName()).toBe("stakeengine");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run([])).rejects.toThrow(/Usage: pokie stakeengine export/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new StakeEngineCommand("1.3.0");

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie stakeengine export/);
    });

    describe("export", () => {
        it("loads the descriptor, resolves each libraryPath relative to it, and exports to the default --out dir", async () => {
            const exporter = createStubExporter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new StakeEngineCommand("1.3.0", exporter, undefined, loadJson);

            const exitCode = await command.run(["export", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(exporter.calledWith?.outDir).toBe("/project/stakeengine");
            expect(exporter.calledWith?.modes).toEqual([
                {modeName: "base", cost: 1, library: BASE_LIBRARY},
                {modeName: "bonus", cost: 100, library: BONUS_LIBRARY},
            ]);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Exported");
            for (const file of successResult.files) {
                expect(printed).toContain(file);
            }
        });

        it("honors a custom --out path", async () => {
            const exporter = createStubExporter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new StakeEngineCommand("1.3.0", exporter, undefined, loadJson);

            await command.run(["export", CONFIG_PATH, "--out", "/custom/out"]);

            expect(exporter.calledWith?.outDir).toBe("/custom/out");
        });

        it("prints an error summary and returns 1 when the exporter reports error-level issues", async () => {
            const issues: ValidationIssue[] = [{code: "stakeengine-mode-cost-invalid", severity: "error", message: "bad cost"}];
            const exporter = createStubExporter({outDir: "/project/stakeengine", files: [], manifest: undefined, issues});
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new StakeEngineCommand("1.3.0", exporter, undefined, loadJson);

            const exitCode = await command.run(["export", CONFIG_PATH]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("bad cost");
            expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).not.toContain("Exported");
        });

        it("prints warnings alongside a success line when the exporter reports only warnings", async () => {
            const issues: ValidationIssue[] = [{code: "stakeengine-mode-name-case-collision", severity: "warning", message: "heads up"}];
            const exporter = createStubExporter({...successResult, issues});
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new StakeEngineCommand("1.3.0", exporter, undefined, loadJson);

            const exitCode = await command.run(["export", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Exported");
            expect(printed).toContain("heads up");
        });

        it("throws a descriptive error when no config path is given", async () => {
            const command = new StakeEngineCommand("1.3.0");

            await expect(command.run(["export"])).rejects.toThrow(/Usage: pokie stakeengine export/);
        });

        it("throws on --out with no value", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new StakeEngineCommand("1.3.0", createStubExporter(successResult), undefined, loadJson);

            await expect(command.run(["export", CONFIG_PATH, "--out"])).rejects.toThrow(/--out requires a directory path/);
        });

        it("throws on an unknown option", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new StakeEngineCommand("1.3.0", createStubExporter(successResult), undefined, loadJson);

            await expect(command.run(["export", CONFIG_PATH, "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error when the descriptor JSON has no modes array", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {}});
            const command = new StakeEngineCommand("1.3.0", createStubExporter(successResult), undefined, loadJson);

            await expect(command.run(["export", CONFIG_PATH])).rejects.toThrow(/is not a valid Stake Engine export config/);
        });

        it("throws a descriptive error when a mode entry is malformed", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {modes: [{modeName: "base"}]}});
            const command = new StakeEngineCommand("1.3.0", createStubExporter(successResult), undefined, loadJson);

            await expect(command.run(["export", CONFIG_PATH])).rejects.toThrow(/must have a string "modeName" and a number "cost"/);
        });

        it("throws a descriptive error when a mode entry has neither libraryPath nor bundleDir, or both", async () => {
            const neither = createStubJsonStore({[CONFIG_PATH]: {modes: [{modeName: "base", cost: 1}]}});
            const both = createStubJsonStore({
                [CONFIG_PATH]: {modes: [{modeName: "base", cost: 1, libraryPath: "./libraries/base.json", bundleDir: "./bundle"}]},
            });

            await expect(new StakeEngineCommand("1.3.0", createStubExporter(successResult), undefined, neither).run(["export", CONFIG_PATH])).rejects.toThrow(
                /must specify exactly one of "libraryPath" or "bundleDir"/,
            );
            await expect(new StakeEngineCommand("1.3.0", createStubExporter(successResult), undefined, both).run(["export", CONFIG_PATH])).rejects.toThrow(
                /must specify exactly one of "libraryPath" or "bundleDir"/,
            );
        });

        it("streams the export directly from a canonical outcome-library bundle when every mode specifies bundleDir, resolved relative to the config file, defaulting bundleModeName to modeName", async () => {
            const bundleStreamingExporter = createStubBundleStreamingExporter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: {
                    modes: [
                        {modeName: "base", cost: 1, bundleDir: "./bundle", bundleModeName: "canonicalBase"},
                        {modeName: "bonus", cost: 100, bundleDir: "./bundle"},
                    ],
                },
            });
            const command = new StakeEngineCommand("1.3.0", undefined, undefined, loadJson, undefined, undefined, bundleStreamingExporter);

            const exitCode = await command.run(["export", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(bundleStreamingExporter.calledWith?.modes).toEqual([
                {modeName: "base", cost: 1, bundleDir: "/project/bundle", bundleModeName: "canonicalBase"},
                {modeName: "bonus", cost: 100, bundleDir: "/project/bundle", bundleModeName: "bonus"},
            ]);
            expect(bundleStreamingExporter.calledWith?.outDir).toBe("/project/stakeengine");
        });

        it("falls back to loading a mode's library from a bundle (via the non-streaming exporter) when the export mixes libraryPath and bundleDir modes", async () => {
            const exporter = createStubExporter(successResult);
            const bundleStreamingExporter = createStubBundleStreamingExporter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: {
                    modes: [
                        {modeName: "base", cost: 1, libraryPath: "./libraries/base.json"},
                        {modeName: "bonus", cost: 100, bundleDir: "./bundle"},
                    ],
                },
                "/project/libraries/base.json": BASE_LIBRARY,
            });
            const loadLibraryFromBundle = jest.fn(() => Promise.resolve(BONUS_LIBRARY));
            const command = new StakeEngineCommand("1.3.0", exporter, undefined, loadJson, undefined, loadLibraryFromBundle, bundleStreamingExporter);

            const exitCode = await command.run(["export", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(loadLibraryFromBundle).toHaveBeenCalledWith("/project/bundle", "bonus");
            expect(exporter.calledWith?.modes).toEqual([
                {modeName: "base", cost: 1, library: BASE_LIBRARY},
                {modeName: "bonus", cost: 100, library: BONUS_LIBRARY},
            ]);
            expect(bundleStreamingExporter.calledWith).toBeUndefined();
        });
    });

    describe("import", () => {
        it("imports and hands the result to the writer for the default --out dir", async () => {
            const importer = createStubImporter(successImportResult);
            const writer = createStubImportWriter();
            const command = new StakeEngineCommand("1.3.0", undefined, importer, undefined, writer);

            const exitCode = await command.run(["import", "/project/stake"]);

            expect(exitCode).toBe(0);
            expect(importer.calledWith).toBe("/project/stake");
            expect(writer.calledWith?.outDir).toBe("/project/stake-imported");
            expect(writer.calledWith?.importResult).toBe(successImportResult);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Imported");
            expect(printed).toContain("config.json");
            expect(printed).toContain("libraries/base.json");
            expect(printed).toContain("libraries/bonus.json");
        });

        it("honors a custom --out path", async () => {
            const importer = createStubImporter(successImportResult);
            const writer = createStubImportWriter();
            const command = new StakeEngineCommand("1.3.0", undefined, importer, undefined, writer);

            await command.run(["import", "/project/stake", "--out", "/custom/out"]);

            expect(writer.calledWith?.outDir).toBe("/custom/out");
        });

        it("prints an error summary and returns 1 when the importer reports error-level issues, never calling the writer", async () => {
            const issues: ValidationIssue[] = [{code: "stakeengine-import-manifest-missing", severity: "error", message: "no manifest"}];
            const importer = createStubImporter({stakeDir: "/project/stake", manifest: undefined, modes: [], sourceProvenance: undefined, issues});
            const writer = createStubImportWriter();
            const command = new StakeEngineCommand("1.3.0", undefined, importer, undefined, writer);

            const exitCode = await command.run(["import", "/project/stake"]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("no manifest");
            expect(writer.calledWith).toBeUndefined();
        });

        it("prints info issues from the importer alongside a success line", async () => {
            const issues: ValidationIssue[] = [{code: "stakeengine-import-library-hash-differs-from-manifest", severity: "info", message: "heads up"}];
            const importer = createStubImporter({...successImportResult, issues});
            const command = new StakeEngineCommand("1.3.0", undefined, importer, undefined, createStubImportWriter());

            const exitCode = await command.run(["import", "/project/stake"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Imported");
            expect(printed).toContain("heads up");
        });

        it("prints warnings the writer itself reports (e.g. a stale-cleanup failure) without failing the command", async () => {
            const writerIssues: ValidationIssue[] = [
                {code: "stakeengine-import-write-stale-cleanup-failed", severity: "warning", message: "could not remove stale backup"},
            ];
            const importer = createStubImporter(successImportResult);
            const command = new StakeEngineCommand("1.3.0", undefined, importer, undefined, createStubImportWriter(writerIssues));

            const exitCode = await command.run(["import", "/project/stake"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Imported");
            expect(printed).toContain("could not remove stale backup");
        });

        it("throws a descriptive error when no stakeDir is given", async () => {
            const command = new StakeEngineCommand("1.3.0");

            await expect(command.run(["import"])).rejects.toThrow(/Usage: pokie stakeengine import/);
        });

        it("throws on --out with no value", async () => {
            const command = new StakeEngineCommand("1.3.0", undefined, createStubImporter(successImportResult));

            await expect(command.run(["import", "/project/stake", "--out"])).rejects.toThrow(/--out requires a directory path/);
        });

        it("throws on an unknown option", async () => {
            const command = new StakeEngineCommand("1.3.0", undefined, createStubImporter(successImportResult));

            await expect(command.run(["import", "/project/stake", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });
    });
});

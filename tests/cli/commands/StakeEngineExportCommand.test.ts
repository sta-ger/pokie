import {StakeEngineExportModeInput, StakeEngineExporting, StakeEngineExportResult, ValidationIssue} from "pokie";
import {StakeEngineExportCommand} from "../../../cli/commands/StakeEngineExportCommand.js";

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

describe("StakeEngineExportCommand", () => {
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
        const command = new StakeEngineExportCommand("1.3.0", createStubExporter(successResult));

        expect(command.getName()).toBe("stakeengine");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new StakeEngineExportCommand("1.3.0");

        await expect(command.run([])).rejects.toThrow(/Usage: pokie stakeengine export/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new StakeEngineExportCommand("1.3.0");

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
            const command = new StakeEngineExportCommand("1.3.0", exporter, loadJson);

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
            const command = new StakeEngineExportCommand("1.3.0", exporter, loadJson);

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
            const command = new StakeEngineExportCommand("1.3.0", exporter, loadJson);

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
            const command = new StakeEngineExportCommand("1.3.0", exporter, loadJson);

            const exitCode = await command.run(["export", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Exported");
            expect(printed).toContain("heads up");
        });

        it("throws a descriptive error when no config path is given", async () => {
            const command = new StakeEngineExportCommand("1.3.0");

            await expect(command.run(["export"])).rejects.toThrow(/Usage: pokie stakeengine export/);
        });

        it("throws on --out with no value", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new StakeEngineExportCommand("1.3.0", createStubExporter(successResult), loadJson);

            await expect(command.run(["export", CONFIG_PATH, "--out"])).rejects.toThrow(/--out requires a directory path/);
        });

        it("throws on an unknown option", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new StakeEngineExportCommand("1.3.0", createStubExporter(successResult), loadJson);

            await expect(command.run(["export", CONFIG_PATH, "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error when the descriptor JSON has no modes array", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {}});
            const command = new StakeEngineExportCommand("1.3.0", createStubExporter(successResult), loadJson);

            await expect(command.run(["export", CONFIG_PATH])).rejects.toThrow(/is not a valid Stake Engine export config/);
        });

        it("throws a descriptive error when a mode entry is malformed", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {modes: [{modeName: "base"}]}});
            const command = new StakeEngineExportCommand("1.3.0", createStubExporter(successResult), loadJson);

            await expect(command.run(["export", CONFIG_PATH])).rejects.toThrow(/modes\[0\] must be/);
        });
    });
});

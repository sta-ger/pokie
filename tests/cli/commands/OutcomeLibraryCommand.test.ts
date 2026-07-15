import {OutcomeLibraryBundleModeInput, OutcomeLibraryBundleValidateOptions, OutcomeLibraryBundleWriteResult, ValidationIssue} from "pokie";
import {OutcomeLibraryCommand} from "../../../cli/commands/OutcomeLibraryCommand.js";

const CONFIG_PATH = "/project/outcomelibrary-config.json";
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

function createStubWriter(result: OutcomeLibraryBundleWriteResult): {
    calledWith?: {modes: OutcomeLibraryBundleModeInput[]; outDir: string};
    writeToDirectory(modes: OutcomeLibraryBundleModeInput[], outDir: string): Promise<OutcomeLibraryBundleWriteResult>;
} {
    return {
        writeToDirectory(modes: OutcomeLibraryBundleModeInput[], outDir: string) {
            this.calledWith = {modes, outDir};
            return Promise.resolve(result);
        },
    };
}

function createStubValidator(issues: ValidationIssue[]): {
    calledWith?: {bundleDir: string; options?: OutcomeLibraryBundleValidateOptions};
    validate(bundleDir: string, options?: OutcomeLibraryBundleValidateOptions): Promise<ValidationIssue[]>;
} {
    return {
        validate(bundleDir: string, options?: OutcomeLibraryBundleValidateOptions) {
            this.calledWith = {bundleDir, options};
            return Promise.resolve(issues);
        },
    };
}

const descriptor = {
    modes: [
        {modeName: "base", libraryPath: "./libraries/base.json"},
        {modeName: "bonus", libraryPath: "./libraries/bonus.json"},
    ],
};

const successResult: OutcomeLibraryBundleWriteResult = {
    outDir: "/project/outcomelibrary",
    files: ["index_base.json", "outcomes_base.jsonl", "index_bonus.json", "outcomes_bonus.jsonl", "manifest.json"],
    manifest: undefined,
    issues: [],
};

describe("OutcomeLibraryCommand", () => {
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
        const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult));

        expect(command.getName()).toBe("outcomelibrary");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("rejects when run with no subcommand", async () => {
        const command = new OutcomeLibraryCommand("1.3.0");

        await expect(command.run([])).rejects.toThrow(/Usage: pokie outcomelibrary build/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new OutcomeLibraryCommand("1.3.0");

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie outcomelibrary build/);
    });

    describe("build", () => {
        it("loads the descriptor, resolves each libraryPath relative to it, and writes to the default --out dir", async () => {
            const writer = createStubWriter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new OutcomeLibraryCommand("1.3.0", writer, undefined, loadJson);

            const exitCode = await command.run(["build", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(writer.calledWith?.outDir).toBe("/project/outcomelibrary");
            expect(writer.calledWith?.modes).toEqual([
                {modeName: "base", libraryId: BASE_LIBRARY.libraryId, schemaVersion: BASE_LIBRARY.schemaVersion, outcomes: BASE_LIBRARY.outcomes},
                {modeName: "bonus", libraryId: BONUS_LIBRARY.libraryId, schemaVersion: BONUS_LIBRARY.schemaVersion, outcomes: BONUS_LIBRARY.outcomes},
            ]);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("Built an outcome library bundle");
            for (const file of successResult.files) {
                expect(printed).toContain(file);
            }
        });

        it("honors a custom --out path", async () => {
            const writer = createStubWriter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new OutcomeLibraryCommand("1.3.0", writer, undefined, loadJson);

            await command.run(["build", CONFIG_PATH, "--out", "/custom/out"]);

            expect(writer.calledWith?.outDir).toBe("/custom/out");
        });

        it("prints an error summary and returns 1 when the writer reports error-level issues", async () => {
            const failureResult: OutcomeLibraryBundleWriteResult = {
                outDir: "/project/outcomelibrary",
                files: [],
                manifest: undefined,
                issues: [{code: "outcome-library-bundle-duplicate-mode-name", severity: "error", message: "boom"}],
            };
            const writer = createStubWriter(failureResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new OutcomeLibraryCommand("1.3.0", writer, undefined, loadJson);

            const exitCode = await command.run(["build", CONFIG_PATH]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("outcome-library-bundle-duplicate-mode-name");
        });

        it("prints warnings alongside a success line when the writer reports only warnings", async () => {
            const warningResult: OutcomeLibraryBundleWriteResult = {
                ...successResult,
                issues: [{code: "outcome-library-bundle-write-stale-cleanup-failed", severity: "warning", message: "clean me up"}],
            };
            const writer = createStubWriter(warningResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: descriptor,
                "/project/libraries/base.json": BASE_LIBRARY,
                "/project/libraries/bonus.json": BONUS_LIBRARY,
            });
            const command = new OutcomeLibraryCommand("1.3.0", writer, undefined, loadJson);

            const exitCode = await command.run(["build", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(logSpy.mock.calls.flat().join("\n")).toContain("clean me up");
        });

        it("throws a descriptive error when no config path is given", async () => {
            const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult));

            await expect(command.run(["build"])).rejects.toThrow(/Usage: pokie outcomelibrary build/);
        });

        it("throws on --out with no value", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult), undefined, loadJson);

            await expect(command.run(["build", CONFIG_PATH, "--out"])).rejects.toThrow(/--out requires a directory path/);
        });

        it("throws on an unknown option", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: descriptor});
            const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult), undefined, loadJson);

            await expect(command.run(["build", CONFIG_PATH, "--bogus"])).rejects.toThrow(/Unknown option/);
        });

        it("throws a descriptive error when the descriptor JSON has no modes array", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {}});
            const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult), undefined, loadJson);

            await expect(command.run(["build", CONFIG_PATH])).rejects.toThrow(/is not a valid outcome library bundle config/);
        });

        it("throws a descriptive error when a mode entry is malformed", async () => {
            const loadJson = createStubJsonStore({[CONFIG_PATH]: {modes: [{modeName: "base"}]}});
            const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult), undefined, loadJson);

            await expect(command.run(["build", CONFIG_PATH])).rejects.toThrow(/must specify exactly one of "libraryPath" or "outcomesPath"/);
        });

        it("streams outcomes from an outcomesPath file, using the entry's libraryId/schemaVersion, resolved relative to the config file", async () => {
            const writer = createStubWriter(successResult);
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: {
                    modes: [{modeName: "bonus", outcomesPath: "./outcomes-bonus.jsonl", libraryId: "bonus-lib", schemaVersion: 2}],
                },
            });
            const streamedOutcomes = [{id: "0", weight: 1, artifact: {}}];
            const streamOutcomes = jest.fn(async function *() {
                for (const outcome of streamedOutcomes) {
                    yield outcome;
                }
            });
            const command = new OutcomeLibraryCommand("1.3.0", writer, undefined, loadJson, streamOutcomes as never);

            const exitCode = await command.run(["build", CONFIG_PATH]);

            expect(exitCode).toBe(0);
            expect(streamOutcomes).toHaveBeenCalledWith("/project/outcomes-bonus.jsonl");
            expect(writer.calledWith?.modes).toHaveLength(1);
            const mode = writer.calledWith?.modes[0];
            expect(mode?.modeName).toBe("bonus");
            expect(mode?.libraryId).toBe("bonus-lib");
            expect(mode?.schemaVersion).toBe(2);
            const collected: unknown[] = [];
            for await (const outcome of mode?.outcomes as AsyncGenerator<unknown>) {
                collected.push(outcome);
            }
            expect(collected).toEqual(streamedOutcomes);
        });

        it("throws a descriptive error when outcomesPath is used without a string libraryId", async () => {
            const loadJson = createStubJsonStore({
                [CONFIG_PATH]: {modes: [{modeName: "bonus", outcomesPath: "./outcomes-bonus.jsonl"}]},
            });
            const command = new OutcomeLibraryCommand("1.3.0", createStubWriter(successResult), undefined, loadJson);

            await expect(command.run(["build", CONFIG_PATH])).rejects.toThrow(/requires a string "libraryId"/);
        });
    });

    describe("validate", () => {
        it("validates the given bundle directory and prints a success line when there are no issues", async () => {
            const validator = createStubValidator([]);
            const command = new OutcomeLibraryCommand("1.3.0", undefined, validator);

            const exitCode = await command.run(["validate", "/project/bundle"]);

            expect(exitCode).toBe(0);
            expect(validator.calledWith).toEqual({bundleDir: "/project/bundle", options: {deep: false}});
            expect(logSpy.mock.calls.flat().join("\n")).toContain("is a valid outcome library bundle");
        });

        it("passes --deep through to the validator", async () => {
            const validator = createStubValidator([]);
            const command = new OutcomeLibraryCommand("1.3.0", undefined, validator);

            await command.run(["validate", "/project/bundle", "--deep"]);

            expect(validator.calledWith?.options).toEqual({deep: true});
        });

        it("prints an error summary and returns 1 when the validator reports error-level issues", async () => {
            const validator = createStubValidator([{code: "outcome-library-bundle-hash-mismatch", severity: "error", message: "boom"}]);
            const command = new OutcomeLibraryCommand("1.3.0", undefined, validator);

            const exitCode = await command.run(["validate", "/project/bundle"]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("outcome-library-bundle-hash-mismatch");
        });

        it("throws a descriptive error when no bundleDir is given", async () => {
            const command = new OutcomeLibraryCommand("1.3.0");

            await expect(command.run(["validate"])).rejects.toThrow(/Usage: pokie outcomelibrary validate/);
        });

        it("throws on an unknown option", async () => {
            const command = new OutcomeLibraryCommand("1.3.0");

            await expect(command.run(["validate", "/project/bundle", "--bogus"])).rejects.toThrow(/Unknown option/);
        });
    });
});

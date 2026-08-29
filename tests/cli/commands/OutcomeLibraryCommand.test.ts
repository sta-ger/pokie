import {EventEmitter} from "events";
import fs from "fs";
import os from "os";
import path from "path";
import {
    GenerateExactWeightedOutcomeLibraryResult,
    OutcomeLibraryGenerationRequest,
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleValidateOptions,
    OutcomeLibraryBundleWriteResult,
    OutcomeSpaceEstimate,
    PokieGame,
    ValidationIssue,
    WeightedOutcomeLibraryGenerationCancelledError,
    WeightedOutcomeLibraryGenerationError,
} from "pokie";
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

        await expect(command.run([])).rejects.toThrow(/Usage: pokie outcomelibrary generate/);
    });

    it("rejects on an unknown subcommand", async () => {
        const command = new OutcomeLibraryCommand("1.3.0");

        await expect(command.run(["bogus"])).rejects.toThrow(/Usage: pokie outcomelibrary generate/);
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

    describe("generate", () => {
        const FAKE_GAME: PokieGame = {
            getManifest: () => ({id: "slot-1", name: "Slot 1", version: "1.0.0"}),
            getConfigHash: () => "sha256:abc",
            createSession: () => {
                throw new Error("createSession() should never be called by the generate CLI path");
            },
        };

        function defaultGenerateResult(): GenerateExactWeightedOutcomeLibraryResult {
            return {
                library: {schemaVersion: 1, libraryId: "slot-1", outcomes: [{id: "o1", weight: 6, artifact: {}}]},
                diagnostics: {
                    algorithm: "pokie-exact-reel-enumeration-v1",
                    strategy: "exact",
                    totalOutcomeSpaceSize: 6,
                    sampledRawCount: 6,
                    pokieVersion: "1.3.0",
                    game: {id: "slot-1", name: "Slot 1", version: "1.0.0"},
                    generatedAt: "2026-01-01T00:00:00.000Z",
                },
            } as unknown as GenerateExactWeightedOutcomeLibraryResult;
        }

        function createGenerateCommand(overrides: {
            loadGame?: (packageRoot: string) => Promise<PokieGame>;
            generate?: (request: OutcomeLibraryGenerationRequest) => Promise<GenerateExactWeightedOutcomeLibraryResult>;
            estimateSpace?: (game: PokieGame) => OutcomeSpaceEstimate;
            writeFile?: (filePath: string, contents: string) => void;
            loadJson?: (filePath: string) => unknown;
            fileExists?: (filePath: string) => boolean;
            removeFile?: (filePath: string) => void;
            processHandle?: NodeJS.Process;
        } = {}): OutcomeLibraryCommand {
            return new OutcomeLibraryCommand(
                "1.3.0",
                undefined,
                undefined,
                overrides.loadJson ??
                    (() => {
                        throw new Error("no stub JSON configured");
                    }),
                undefined,
                overrides.loadGame ?? (() => Promise.resolve(FAKE_GAME)),
                overrides.generate ?? jest.fn(() => Promise.resolve(defaultGenerateResult())),
                overrides.estimateSpace ?? (() => ({reelsNumber: 2, reelsSymbolsNumber: 1, reelSizes: [3, 2], totalOutcomeSpaceSize: BigInt(6)})),
                overrides.writeFile ?? jest.fn(),
                overrides.fileExists ?? (() => false),
                overrides.removeFile ?? jest.fn(),
                overrides.processHandle ?? (new EventEmitter() as unknown as NodeJS.Process),
            );
        }

        it("loads the package, drives generation with contract-consistent options, writes --out and prints machine JSON", async () => {
            const loadGame = jest.fn(() => Promise.resolve(FAKE_GAME));
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const writeFile = jest.fn();
            const command = createGenerateCommand({loadGame, generate, writeFile});

            const exitCode = await command.run([
                "generate",
                "/project/slot",
                "--mode",
                "base",
                "--stake",
                "1.5",
                "--config-hash",
                "sha256:abc",
                "--library-id",
                "custom-lib",
                "--out",
                "/project/base.json",
                "--format",
                "json",
            ]);

            expect(exitCode).toBe(0);
            expect(loadGame).toHaveBeenCalledWith("/project/slot");
            expect(generate).toHaveBeenCalledWith(
                expect.objectContaining({
                    libraryId: "custom-lib",
                    game: FAKE_GAME,
                    pokieVersion: "1.3.0",
                    configHash: "sha256:abc",
                    mode: "base",
                    stake: 1.5,
                }),
            );
            expect(writeFile).toHaveBeenCalledWith("/project/base.json", expect.stringContaining("slot-1"));
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain('"algorithm"');
            expect(printed).toContain("pokie-exact-reel-enumeration-v1");
        });

        it("derives a default library id from the game manifest and --mode when --library-id is omitted", async () => {
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({generate});

            await command.run(["generate", "/project/slot", "--mode", "bonus"]);

            expect(generate).toHaveBeenCalledWith(expect.objectContaining({libraryId: "slot-1-bonus"}));
        });

        it("rejects a caller configuration hash that does not match the loaded game", async () => {
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({generate});

            const exitCode = await command.run(["generate", "/project/slot", "--config-hash", "sha256:other"]);

            expect(exitCode).toBe(1);
            expect(generate).not.toHaveBeenCalled();
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("configuration-conflict");
        });

        it("prints a summary and the location of the written library when --format is the default", async () => {
            const writeFile = jest.fn();
            const command = createGenerateCommand({writeFile});

            const exitCode = await command.run(["generate", "/project/slot", "--out", "/project/base.json"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.flat().join("\n");
            expect(printed).toContain("Generated outcome library");
            expect(printed).toContain('Library written to "/project/base.json"');
        });

        it("treats raw --out as a fresh file publication and rejects package aliases", async () => {
            const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-raw-generation-source-"));
            const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-raw-generation-alias-"));
            const linkedPackage = path.join(aliasRoot, "package-link");
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const writeFile = jest.fn();
            const command = createGenerateCommand({generate, writeFile});

            try {
                fs.symlinkSync(packageRoot, linkedPackage, "dir");
                for (const destination of [
                    packageRoot,
                    path.join(packageRoot, "nested", "generated.json"),
                    path.join(linkedPackage, "through-symlink.json"),
                ]) {
                    await expect(command.run(["generate", packageRoot, "--out", destination])).rejects.toThrow(/source itself or lies inside source/i);
                }

                const occupied = path.join(aliasRoot, "occupied.json");
                fs.writeFileSync(occupied, "sentinel");
                await expect(command.run(["generate", packageRoot, "--out", occupied])).rejects.toThrow(/already exists/i);
                expect(fs.readFileSync(occupied, "utf-8")).toBe("sentinel");
                expect(writeFile).not.toHaveBeenCalled();
            } finally {
                fs.rmSync(aliasRoot, {recursive: true, force: true});
                fs.rmSync(packageRoot, {recursive: true, force: true});
            }
        });

        it("--estimate reports the outcome space without invoking generation", async () => {
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({generate});

            const exitCode = await command.run(["generate", "/project/slot", "--estimate", "--format", "json"]);

            expect(exitCode).toBe(0);
            expect(generate).not.toHaveBeenCalled();
            const printed = JSON.parse(logSpy.mock.calls[0][0]);
            expect(printed).toMatchObject({
                game: {id: "slot-1"},
                reelSizes: [3, 2],
                totalOutcomeSpaceSize: 6,
                strategy: "exact",
                requiresBounded: false,
            });
        });

        it("--dry-run behaves the same as --estimate", async () => {
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({generate});

            const exitCode = await command.run(["generate", "/project/slot", "--dry-run", "--format", "json"]);

            expect(exitCode).toBe(0);
            expect(generate).not.toHaveBeenCalled();
            const printed = JSON.parse(logSpy.mock.calls[0][0]);
            expect(printed.strategy).toBe("exact");
        });

        it("flags the estimate as requiring --bounded once the space exceeds --max-outcome-space-size", async () => {
            const command = createGenerateCommand();

            await command.run(["generate", "/project/slot", "--estimate", "--max-outcome-space-size", "3", "--format", "json"]);

            const printed = JSON.parse(logSpy.mock.calls[0][0]);
            expect(printed.strategy).toBe("bounded-coverage");
            expect(printed.requiresBounded).toBe(true);
        });

        it("requires --sample-size and --seed together with --bounded", async () => {
            const command = createGenerateCommand();

            await expect(command.run(["generate", "/project/slot", "--bounded", "--sample-size", "1000"])).rejects.toThrow(
                /--bounded requires both --sample-size and --seed/,
            );
        });

        it("rejects --sample-size/--seed given without --bounded", async () => {
            const command = createGenerateCommand();

            await expect(command.run(["generate", "/project/slot", "--sample-size", "1000", "--seed", "abc"])).rejects.toThrow(
                /--sample-size and --seed require --bounded/,
            );
        });

        it("passes bounded-coverage options through when --bounded/--sample-size/--seed are all given", async () => {
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({generate});

            await command.run(["generate", "/project/slot", "--bounded", "--sample-size", "1000", "--seed", "seed-1"]);

            expect(generate).toHaveBeenCalledWith(expect.objectContaining({generation: "bounded", sample: {sampleSize: BigInt(1000), seed: "seed-1"}}));
        });

        it("makes direct sampled generation explicit and threads its deterministic count and seed", async () => {
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({generate});

            await command.run(["generate", "/project/slot", "--sample", "1000", "--seed", "sample-seed"]);

            expect(generate).toHaveBeenCalledWith(expect.objectContaining({generation: "sampled", sample: {sampleSize: BigInt(1000), seed: "sample-seed"}}));
        });

        it("rejects incomplete or conflicting exact/sampled choices before loading a game", async () => {
            const loadGame = jest.fn(() => Promise.resolve(FAKE_GAME));
            const command = createGenerateCommand({loadGame});

            await expect(command.run(["generate", "/project/slot", "--sample", "1000"])).rejects.toThrow(/--sample requires --seed/);
            await expect(command.run(["generate", "/project/slot", "--exact", "--sample", "1000", "--seed", "sample-seed"])).rejects.toThrow(
                /--exact cannot be combined/,
            );
            expect(loadGame).not.toHaveBeenCalled();
        });

        it("returns 1 and prints the failure code when generation fails closed with a WeightedOutcomeLibraryGenerationError", async () => {
            const generate = jest.fn(() => {
                throw new WeightedOutcomeLibraryGenerationError(
                    "weighted-outcome-library-generation-unsupported",
                    '"slot-1" does not implement createExactEnumerationSession()',
                );
            });
            const command = createGenerateCommand({generate});

            const exitCode = await command.run(["generate", "/project/slot"]);

            expect(exitCode).toBe(1);
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("weighted-outcome-library-generation-unsupported");
        });

        it("writes a resumable checkpoint and returns 130 when SIGINT cancels a run mid-sweep, given --resume", async () => {
            const processHandle = new EventEmitter() as unknown as NodeJS.Process;
            const grids = new Map([["[[\"A\"]]", {grid: [["A"]], weight: BigInt(2)}]]);
            // The generate stub emits SIGINT itself, from inside the promise executor -- by this
            // point executeGenerate has already registered its SIGINT listener (synchronously, before
            // calling this.generate), so this is fully deterministic: no reliance on real timers or
            // microtask ordering to land the signal "mid-sweep".
            const generate = jest.fn(
                (options: OutcomeLibraryGenerationRequest) =>
                    new Promise<GenerateExactWeightedOutcomeLibraryResult>((_resolve, reject) => {
                        options.signal?.addEventListener("abort", () => {
                            reject(new WeightedOutcomeLibraryGenerationCancelledError(BigInt(3), BigInt(6), grids, "src-1"));
                        });
                        processHandle.emit("SIGINT");
                    }),
            );
            const writeFile = jest.fn();
            const command = createGenerateCommand({processHandle, generate, writeFile});

            const exitCode = await command.run(["generate", "/project/slot", "--resume", "/project/checkpoint.json"]);

            expect(exitCode).toBe(130);
            expect(writeFile).toHaveBeenCalledWith("/project/checkpoint.json", expect.any(String));
            const written = JSON.parse((writeFile.mock.calls[0] as [string, string])[1]);
            expect(written).toEqual({
                processedRawIndex: "3",
                progressTotal: "6",
                sourceEnumerationId: "src-1",
                grids: [["[[\"A\"]]", {grid: [["A"]], weight: "2"}]],
            });
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("Checkpoint written");
            // The SIGINT listener registered for this run must not leak into the next one.
            expect((processHandle as unknown as EventEmitter).listenerCount("SIGINT")).toBe(0);
        });

        it("returns 130 without writing a checkpoint when SIGINT cancels a run with no --resume given", async () => {
            const processHandle = new EventEmitter() as unknown as NodeJS.Process;
            const generate = jest.fn(
                (options: OutcomeLibraryGenerationRequest) =>
                    new Promise<GenerateExactWeightedOutcomeLibraryResult>((_resolve, reject) => {
                        options.signal?.addEventListener("abort", () => {
                            reject(new WeightedOutcomeLibraryGenerationCancelledError(BigInt(3), BigInt(6), new Map(), "src-1"));
                        });
                        processHandle.emit("SIGINT");
                    }),
            );
            const writeFile = jest.fn();
            const command = createGenerateCommand({processHandle, generate, writeFile});

            const exitCode = await command.run(["generate", "/project/slot"]);

            expect(exitCode).toBe(130);
            expect(writeFile).not.toHaveBeenCalled();
            expect(errorSpy.mock.calls.flat().join("\n")).toContain("no --resume");
        });

        it("reads an existing --resume checkpoint file and threads it into resumeFrom, re-hydrating its bigints", async () => {
            const serialized = {
                processedRawIndex: "3",
                progressTotal: "6",
                sourceEnumerationId: "src-1",
                grids: [["[[\"A\"]]", {grid: [["A"]], weight: "2"}]],
            };
            const loadJson = jest.fn((filePath: string) => {
                if (filePath !== "/project/checkpoint.json") {
                    throw new Error(`no stub JSON for "${filePath}"`);
                }
                return serialized;
            });
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({loadJson, generate, fileExists: () => true});

            await command.run(["generate", "/project/slot", "--resume", "/project/checkpoint.json"]);

            expect(generate).toHaveBeenCalledWith(
                expect.objectContaining({
                    resumeFrom: {
                        processedRawIndex: BigInt(3),
                        progressTotal: BigInt(6),
                        sourceEnumerationId: "src-1",
                        grids: new Map([["[[\"A\"]]", {grid: [["A"]], weight: BigInt(2)}]]),
                    },
                }),
            );
        });

        it("removes a stale --resume checkpoint file once generation completes successfully", async () => {
            const removeFile = jest.fn();
            const generate = jest.fn(() => Promise.resolve(defaultGenerateResult()));
            const command = createGenerateCommand({
                generate,
                removeFile,
                fileExists: () => true,
                loadJson: () => ({processedRawIndex: "0", progressTotal: "6", sourceEnumerationId: "src-1", grids: []}),
            });

            const exitCode = await command.run(["generate", "/project/slot", "--resume", "/project/checkpoint.json"]);

            expect(exitCode).toBe(0);
            expect(removeFile).toHaveBeenCalledWith("/project/checkpoint.json");
        });

        it("throws a descriptive error when no packageRoot is given", async () => {
            const command = createGenerateCommand();

            await expect(command.run(["generate"])).rejects.toThrow(/Usage: pokie outcomelibrary generate/);
        });

        it("throws on an unknown option", async () => {
            const command = createGenerateCommand();

            await expect(command.run(["generate", "/project/slot", "--bogus"])).rejects.toThrow(/Unknown option/);
        });
    });
});

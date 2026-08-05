import fs from "fs";
import os from "os";
import path from "path";
import {PokieGamePackageValidating, PokieGamePackageValidationReport} from "pokie";
import {defaultDirectoryNeedsConfirmation, InitCommand} from "../../../cli/commands/InitCommand.js";
import {GamePackagePreparationError} from "../../../cli/prepare/GamePackagePreparationError.js";
import {PackageCommandResult, PackageCommandRunning} from "../../../cli/prepare/PackageCommandRunner.js";
import {GamePackageMergeConflictError} from "../../../cli/scaffold/GamePackageMergeConflictError.js";
import {GamePackageMergeOverrides, GamePackageMerging} from "../../../cli/scaffold/GamePackageMerging.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";

const manifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};
const scaffoldResult: ScaffoldResult = {
    projectRoot: "/tmp/sample-slot",
    manifest,
    createdFiles: ["package.json", "tsconfig.json", "README.md", "src/index.ts"],
    updatedFiles: [],
    skippedFiles: [],
};
const validReport: PokieGamePackageValidationReport = {
    packageRoot: scaffoldResult.projectRoot,
    valid: true,
    game: manifest,
    errors: [],
    warnings: [],
    suggestions: [],
};

// Echoes back whatever projectRoot InitCommand actually resolved and passed in -- matching the real
// GamePackageMerger's own contract (its ScaffoldResult.projectRoot is always exactly its `projectRoot`
// argument) -- rather than a fixed fake path a caller could mismatch against the directory under test.
function createStubMerger(
    result: Omit<ScaffoldResult, "projectRoot"> = scaffoldResult,
): GamePackageMerging & {calledWith?: {projectRoot: string; overrides?: GamePackageMergeOverrides}} {
    return {
        merge(projectRoot: string, overrides?: GamePackageMergeOverrides) {
            this.calledWith = {projectRoot, overrides};
            return {...result, projectRoot};
        },
    };
}

function createRecordingRunCommand(): PackageCommandRunning & {calls: string[][]} {
    const calls: string[][] = [];
    const fn = ((_command: string, args: string[], _cwd: string): Promise<PackageCommandResult> => {
        calls.push(args);
        return Promise.resolve({stdout: "", stderr: ""});
    }) as PackageCommandRunning & {calls: string[][]};
    fn.calls = calls;
    return fn;
}

function createStubValidator(report: PokieGamePackageValidationReport = validReport): PokieGamePackageValidating & {calledWith?: string} {
    return {
        validate(packageRoot: string) {
            this.calledWith = packageRoot;
            return Promise.resolve(report);
        },
    };
}

function createCommand(
    merger = createStubMerger(),
    runCommand: PackageCommandRunning = createRecordingRunCommand(),
    validator = createStubValidator(),
    directoryNeedsConfirmation: (resolvedDir: string) => boolean = () => false,
) {
    const command = new InitCommand("1.3.0", merger, runCommand, validator, directoryNeedsConfirmation);
    return {command, merger, runCommand, validator};
}

describe("InitCommand", () => {
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
        const {command} = createCommand();

        expect(command.getName()).toBe("init");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("describes itself as fully non-interactive -- never launching a wizard", () => {
        const {command} = createCommand();

        expect(command.getDescription().toLowerCase()).not.toContain("wizard");
        expect(command.getDescription().toLowerCase()).toContain("never asks reel/paytable/mechanics questions");
    });

    describe("default directory", () => {
        it("merges into process.cwd() when no directory is given, then installs, builds, and verifies", async () => {
            const {command, merger, runCommand} = createCommand();

            const exitCode = await command.run([]);

            expect(exitCode).toBe(0);
            expect(merger.calledWith?.projectRoot).toBe(process.cwd());
            expect((runCommand as ReturnType<typeof createRecordingRunCommand>).calls).toEqual([["install"], ["run", "build"]]);

            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("created  package.json");
            expect(printed).toContain(`prepared and verified in "${process.cwd()}"`);
            expect(printed).toContain(`loadPokieGame("${process.cwd()}")`);
            expect(printed).toContain("npm start");
        });
    });

    describe("with an explicit directory and override flags", () => {
        it("forwards --package-name/--game-id/--game-name/--version to the merger as overrides", async () => {
            const {command, merger} = createCommand();

            await command.run([
                "some-dir",
                "--package-name",
                "custom-pkg",
                "--game-id",
                "custom-id",
                "--game-name",
                "Custom Name",
                "--version",
                "2.0.0",
            ]);

            expect(merger.calledWith?.overrides).toEqual({
                packageName: "custom-pkg",
                id: "custom-id",
                name: "Custom Name",
                version: "2.0.0",
            });
        });

        it("resolves a relative directory against process.cwd() before merging", async () => {
            const {command, merger} = createCommand();

            await command.run(["some-dir"]);

            expect(merger.calledWith?.projectRoot).toBe(path.resolve("some-dir"));
        });

        it("accepts a directory whose name contains a space", async () => {
            const {command, merger} = createCommand();

            const exitCode = await command.run(["my game dir"]);

            expect(exitCode).toBe(0);
            expect(merger.calledWith?.projectRoot).toBe(path.resolve("my game dir"));
        });
    });

    describe("the --yes confirmation guard", () => {
        it("refuses a non-empty, not-yet-POKIE directory without --yes, and never merges", async () => {
            const {command, merger} = createCommand(undefined, undefined, undefined, () => true);

            const exitCode = await command.run(["existing-project"]);

            expect(exitCode).toBe(1);
            expect(merger.calledWith).toBeUndefined();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--yes"));
        });

        it("proceeds once --yes is given, even when the directory needs confirmation", async () => {
            const {command, merger} = createCommand(undefined, undefined, undefined, () => true);

            const exitCode = await command.run(["existing-project", "--yes"]);

            expect(exitCode).toBe(0);
            expect(merger.calledWith).toBeDefined();
        });

        it("never needs --yes for an empty or not-yet-existing directory", () => {
            const doesNotExist = "/tmp/pokie-init-command-test-does-not-exist-xyz";
            expect(defaultDirectoryNeedsConfirmation(doesNotExist)).toBe(false);
        });
    });

    describe("--no-install", () => {
        it("skips 'npm install' but still builds and verifies", async () => {
            const {command, runCommand, validator} = createCommand();

            const exitCode = await command.run(["some-dir", "--no-install"]);

            expect(exitCode).toBe(0);
            expect((runCommand as ReturnType<typeof createRecordingRunCommand>).calls).toEqual([["run", "build"]]);
            expect(validator.calledWith).toBe(path.resolve("some-dir"));
        });
    });

    describe("--no-prepare", () => {
        it("scaffolds in place and stops -- never installs, builds, or verifies", async () => {
            const runCommand = jest.fn(() => {
                throw new Error("must not be called");
            }) as unknown as PackageCommandRunning;
            const validator: PokieGamePackageValidating = {
                validate: () => {
                    throw new Error("must not be called");
                },
            };
            const {command} = createCommand(undefined, runCommand, validator);

            const exitCode = await command.run(["some-dir", "--no-prepare"]);

            expect(exitCode).toBe(0);
            const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toContain("scaffolded in");
            expect(printed).toContain('run "npm install" then "npm run build"');
        });
    });

    describe("failures", () => {
        it("rejects with a GamePackagePreparationError when 'npm install' fails", async () => {
            const runCommand: PackageCommandRunning = () => Promise.reject(new Error("network unreachable"));
            const {command} = createCommand(undefined, runCommand);

            await expect(command.run(["some-dir"])).rejects.toMatchObject({phase: "dependencies"});
        });

        it("rejects with a GamePackagePreparationError when 'npm run build' fails", async () => {
            const runCommand: PackageCommandRunning = (_command, args) =>
                args[0] === "run" ? Promise.reject(new Error("tsc failed")) : Promise.resolve({stdout: "", stderr: ""});
            const {command} = createCommand(undefined, runCommand);

            await expect(command.run(["some-dir"])).rejects.toMatchObject({phase: "build"});
        });

        it("rejects with a GamePackagePreparationError (phase 'verify') and reports issues when verification fails", async () => {
            const invalidReport: PokieGamePackageValidationReport = {
                ...validReport,
                valid: false,
                errors: [{code: "package-not-loadable", severity: "error", message: "dist/index.js is missing"}],
            };
            const {command} = createCommand(undefined, undefined, createStubValidator(invalidReport));

            const rejection = command.run(["some-dir"]);
            await expect(rejection).rejects.toMatchObject({phase: "verify"});
            await expect(rejection).rejects.toThrow(/dist\/index\.js is missing/);
        });

        it("is retryable: a failed build followed by a successful re-run reports success", async () => {
            let buildAttempts = 0;
            const runCommand: PackageCommandRunning = (_command, args) => {
                if (args[0] === "run") {
                    buildAttempts += 1;
                    if (buildAttempts === 1) {
                        return Promise.reject(new Error("tsc failed"));
                    }
                }
                return Promise.resolve({stdout: "", stderr: ""});
            };
            const {command} = createCommand(undefined, runCommand);

            await expect(command.run(["some-dir"])).rejects.toMatchObject({phase: "build"});
            const secondExitCode = await command.run(["some-dir"]);

            expect(secondExitCode).toBe(0);
            expect(buildAttempts).toBe(2);
        });

        it("throws GamePackagePreparationError instances (not a bare Error)", async () => {
            const runCommand: PackageCommandRunning = () => Promise.reject(new Error("boom"));
            const {command} = createCommand(undefined, runCommand);

            let caught: unknown;
            try {
                await command.run(["some-dir"]);
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(GamePackagePreparationError);
        });

        it("propagates a GamePackageMergeConflictError from the merger untouched -- never installs/builds and never swallows it", async () => {
            const conflictError = new GamePackageMergeConflictError("/tmp/some-dir", [
                {field: "main", existingValue: '"./lib/custom.js"', requiredValue: '"./dist/index.js"'},
            ]);
            const merger: GamePackageMerging = {
                merge() {
                    throw conflictError;
                },
            };
            const runCommand = jest.fn(() => {
                throw new Error("must not be called");
            }) as unknown as PackageCommandRunning;
            const {command} = createCommand(merger, runCommand);

            await expect(command.run(["some-dir"])).rejects.toBe(conflictError);
        });
    });

    describe("usage errors", () => {
        it("throws a descriptive error for an unknown option", () => {
            const {command} = createCommand();

            expect(() => command.run(["some-dir", "--bogus"])).toThrow(/Unknown option "--bogus"/);
        });

        it("throws a descriptive error for an unexpected extra positional argument", () => {
            const {command} = createCommand();

            expect(() => command.run(["dir-one", "dir-two"])).toThrow(/Unexpected extra argument "dir-two"/);
        });
    });
});

describe("defaultDirectoryNeedsConfirmation", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-init-confirmation-test-"));
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it("is false for a directory that doesn't exist yet", () => {
        expect(defaultDirectoryNeedsConfirmation(path.join(dir, "not-created"))).toBe(false);
    });

    it("is false for an empty existing directory", () => {
        expect(defaultDirectoryNeedsConfirmation(dir)).toBe(false);
    });

    it("is true for a non-empty directory with no package.json at all", () => {
        fs.writeFileSync(path.join(dir, "notes.txt"), "hello");
        expect(defaultDirectoryNeedsConfirmation(dir)).toBe(true);
    });

    it("is true for an existing npm project whose package.json has no pokie dependency yet", () => {
        fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({name: "other-project", dependencies: {leftpad: "^1.0.0"}}));
        expect(defaultDirectoryNeedsConfirmation(dir)).toBe(true);
    });

    it("is false once package.json already declares a pokie dependency (a prior/partial run of this same tool)", () => {
        fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({name: "my-game", dependencies: {pokie: "^1.3.0"}}));
        expect(defaultDirectoryNeedsConfirmation(dir)).toBe(false);
    });
});

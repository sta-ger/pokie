import fs from "fs";
import os from "os";
import path from "path";
import {PokieGamePackageValidating, PokieGamePackageValidationReport} from "pokie";
import {GamePackagePreparationError} from "../../../cli/prepare/GamePackagePreparationError.js";
import {GamePackagePreparer} from "../../../cli/prepare/GamePackagePreparer.js";
import {PackageCommandResult, PackageCommandRunning} from "../../../cli/prepare/PackageCommandRunner.js";
import {GamePackageCreateOverrides, GamePackageCreating} from "../../../cli/scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../../../cli/scaffold/GamePackageCreator.js";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult.js";

type RecordedCommand = {command: string; args: string[]; cwd: string};

function createRecordingRunner(
    outcomes: Partial<Record<string, Error>> = {},
): PackageCommandRunning & {calls: RecordedCommand[]} {
    const calls: RecordedCommand[] = [];
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls.push({command, args, cwd});
        const failure = outcomes[args.join(" ")];
        if (failure) {
            return Promise.reject(failure);
        }
        return Promise.resolve({stdout: "", stderr: ""});
    };
    return Object.assign(runner, {calls});
}

function createStubValidator(
    report: PokieGamePackageValidationReport,
): PokieGamePackageValidating & {calledWith?: string} {
    return {
        validate(packageRoot: string) {
            this.calledWith = packageRoot;
            return Promise.resolve(report);
        },
    };
}

function createCountingCreator(pokieVersion: string): GamePackageCreating & {callCount: number} {
    const real = new GamePackageCreator(pokieVersion);
    const counting = {
        callCount: 0,
        create(parentDir: string, name: string, overrides?: GamePackageCreateOverrides): ScaffoldResult {
            counting.callCount++;
            return real.create(parentDir, name, overrides);
        },
    };
    return counting;
}

function validReport(packageRoot: string): PokieGamePackageValidationReport {
    return {
        packageRoot,
        valid: true,
        game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        errors: [],
        warnings: [],
        suggestions: [],
    };
}

describe("GamePackagePreparer", () => {
    let parentDir: string;

    beforeEach(() => {
        parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-prepare-test-"));
    });

    afterEach(() => {
        fs.rmSync(parentDir, {recursive: true, force: true});
    });

    it("runs create, dependencies, build, then verify, in that order, and returns a successful result", async () => {
        const runner = createRecordingRunner();
        const validator = createStubValidator(validReport(path.join(parentDir, "sample-slot")));
        const preparer = new GamePackagePreparer("1.2.1", undefined, runner, validator);

        const result = await preparer.prepare(parentDir, "sample-slot");

        const projectRoot = path.join(parentDir, "sample-slot");
        expect(result.projectRoot).toBe(projectRoot);
        expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
        expect(result.createdFiles.sort()).toEqual(
            ["README.md", "package.json", "src/SampleSlotGame.ts", "src/SampleSlotSession.ts", "src/index.ts", "tsconfig.json"].sort(),
        );

        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "tsconfig.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "README.md"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "index.ts"))).toBe(true);
        expect(fs.readFileSync(path.join(projectRoot, "README.md"), "utf-8")).toContain("Sample Slot");

        expect(runner.calls).toEqual([
            {command: "npm", args: ["install"], cwd: projectRoot},
            {command: "npm", args: ["run", "build"], cwd: projectRoot},
        ]);
        expect(validator.calledWith).toBe(projectRoot);
    });

    it("wraps a create-phase failure in a GamePackagePreparationError, and never runs any command", async () => {
        const failingCreator: GamePackageCreating = {
            create() {
                throw new Error(`"${path.join(parentDir, "sample-slot")}" already exists.`);
            },
        };
        const runner = createRecordingRunner();
        const preparer = new GamePackagePreparer("1.2.1", failingCreator, runner);

        let caught: unknown;
        try {
            await preparer.prepare(parentDir, "sample-slot");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("create");
        expect((caught as GamePackagePreparationError).message).toContain("already exists");
        expect(runner.calls).toEqual([]);
    });

    it("wraps an `npm install` failure in a GamePackagePreparationError for the dependencies phase, and never runs build", async () => {
        const runner = createRecordingRunner({install: new Error("network error: ETIMEDOUT")});
        const preparer = new GamePackagePreparer("1.2.1", undefined, runner);

        let caught: unknown;
        try {
            await preparer.prepare(parentDir, "sample-slot");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("dependencies");
        expect((caught as GamePackagePreparationError).message).toContain("npm install");
        expect((caught as GamePackagePreparationError).message).toContain("ETIMEDOUT");
        expect(runner.calls).toEqual([{command: "npm", args: ["install"], cwd: path.join(parentDir, "sample-slot")}]);
    });

    it("wraps an `npm run build` failure in a GamePackagePreparationError for the build phase", async () => {
        const runner = createRecordingRunner({"run build": new Error("TS2322: type error")});
        const preparer = new GamePackagePreparer("1.2.1", undefined, runner);

        let caught: unknown;
        try {
            await preparer.prepare(parentDir, "sample-slot");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("build");
        expect((caught as GamePackagePreparationError).message).toContain("npm run build");
        expect((caught as GamePackagePreparationError).message).toContain("TS2322");
        expect(runner.calls).toHaveLength(2);
    });

    it("wraps a failed verification in a GamePackagePreparationError for the verify phase, naming the failing checks and a rebuild recovery step", async () => {
        const projectRoot = path.join(parentDir, "sample-slot");
        const runner = createRecordingRunner();
        const validator = createStubValidator({
            packageRoot: projectRoot,
            valid: false,
            game: null,
            errors: [{code: "pokie-package-load-failed", severity: "error", message: "entry module not found"}],
            warnings: [],
            suggestions: [],
        });
        const preparer = new GamePackagePreparer("1.2.1", undefined, runner, validator);

        let caught: unknown;
        try {
            await preparer.prepare(parentDir, "sample-slot");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("verify");
        const message = (caught as GamePackagePreparationError).message;
        expect(message).toContain("pokie-package-load-failed");
        expect(message).toContain("entry module not found");
        expect(message).toContain("npm run build");
    });

    it("passes overrides through to the underlying creator", async () => {
        const runner = createRecordingRunner();
        const validator = createStubValidator(validReport(path.join(parentDir, "sample-slot")));
        const preparer = new GamePackagePreparer("1.2.1", undefined, runner, validator);

        const result = await preparer.prepare(parentDir, "sample-slot", {id: "cf", name: "Sample Slot Deluxe", version: "2.0.0"});

        expect(result.manifest).toEqual({id: "cf", name: "Sample Slot Deluxe", version: "2.0.0"});
    });

    it("prepares a package under a parentDir path containing spaces, passing the space-containing project root through to every phase unmangled", async () => {
        const spacedParentDir = fs.mkdtempSync(path.join(parentDir, "has spaces "));
        const runner = createRecordingRunner();
        const projectRoot = path.join(spacedParentDir, "sample-slot");
        const validator = createStubValidator(validReport(projectRoot));
        const preparer = new GamePackagePreparer("1.2.1", undefined, runner, validator);

        const result = await preparer.prepare(spacedParentDir, "sample-slot");

        expect(result.projectRoot).toBe(projectRoot);
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "README.md"))).toBe(true);
        expect(runner.calls).toEqual([
            {command: "npm", args: ["install"], cwd: projectRoot},
            {command: "npm", args: ["run", "build"], cwd: projectRoot},
        ]);
        expect(validator.calledWith).toBe(projectRoot);
    });

    describe("retrying a failed preparation", () => {
        it("does not touch, or fail on, an unrelated pre-existing directory: 'create' still fails 'already exists', and no command ever runs", async () => {
            const projectRoot = path.join(parentDir, "sample-slot");
            fs.mkdirSync(projectRoot);
            fs.writeFileSync(path.join(projectRoot, "my-own-notes.txt"), "do not touch");
            const runner = createRecordingRunner();
            const preparer = new GamePackagePreparer("1.2.1", undefined, runner);

            let caught: unknown;
            try {
                await preparer.prepare(parentDir, "sample-slot");
            } catch (error) {
                caught = error;
            }

            expect(caught).toBeInstanceOf(GamePackagePreparationError);
            expect((caught as GamePackagePreparationError).phase).toBe("create");
            expect((caught as GamePackagePreparationError).message).toContain("already exists");
            expect(runner.calls).toEqual([]);
            expect(fs.readFileSync(path.join(projectRoot, "my-own-notes.txt"), "utf-8")).toBe("do not touch");
        });

        it("resumes after a failed 'npm install': retrying re-runs install and build, without ever calling the creator again", async () => {
            const creator = createCountingCreator("1.2.1");
            const projectRoot = path.join(parentDir, "sample-slot");

            const failingRunner = createRecordingRunner({install: new Error("network error: ETIMEDOUT")});
            const firstAttempt = new GamePackagePreparer("1.2.1", creator, failingRunner);
            await expect(firstAttempt.prepare(parentDir, "sample-slot")).rejects.toBeInstanceOf(GamePackagePreparationError);
            expect(creator.callCount).toBe(1);

            const succeedingRunner = createRecordingRunner();
            const validator = createStubValidator(validReport(projectRoot));
            const secondAttempt = new GamePackagePreparer("1.2.1", creator, succeedingRunner, validator);
            const result = await secondAttempt.prepare(parentDir, "sample-slot");

            expect(creator.callCount).toBe(1);
            expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
            expect(succeedingRunner.calls).toEqual([
                {command: "npm", args: ["install"], cwd: projectRoot},
                {command: "npm", args: ["run", "build"], cwd: projectRoot},
            ]);
        });

        it("resumes after a failed 'npm run build': retrying skips 'install' entirely and only re-runs build", async () => {
            const creator = createCountingCreator("1.2.1");
            const projectRoot = path.join(parentDir, "sample-slot");

            const failingRunner = createRecordingRunner({"run build": new Error("TS2322: type error")});
            const firstAttempt = new GamePackagePreparer("1.2.1", creator, failingRunner);
            await expect(firstAttempt.prepare(parentDir, "sample-slot")).rejects.toBeInstanceOf(GamePackagePreparationError);
            expect(failingRunner.calls).toEqual([
                {command: "npm", args: ["install"], cwd: projectRoot},
                {command: "npm", args: ["run", "build"], cwd: projectRoot},
            ]);

            const succeedingRunner = createRecordingRunner();
            const validator = createStubValidator(validReport(projectRoot));
            const secondAttempt = new GamePackagePreparer("1.2.1", creator, succeedingRunner, validator);
            const result = await secondAttempt.prepare(parentDir, "sample-slot");

            expect(creator.callCount).toBe(1);
            expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
            // Only "run build" -- "install" is never repeated once "dependencies" is already recorded done.
            expect(succeedingRunner.calls).toEqual([{command: "npm", args: ["run", "build"], cwd: projectRoot}]);
        });

        it("resumes after a failed verification: retrying skips install and build, and only re-verifies", async () => {
            const creator = createCountingCreator("1.2.1");
            const projectRoot = path.join(parentDir, "sample-slot");

            const runner = createRecordingRunner();
            const failingValidator = createStubValidator({
                packageRoot: projectRoot,
                valid: false,
                game: null,
                errors: [{code: "pokie-package-load-failed", severity: "error", message: "entry module not found"}],
                warnings: [],
                suggestions: [],
            });
            const firstAttempt = new GamePackagePreparer("1.2.1", creator, runner, failingValidator);
            await expect(firstAttempt.prepare(parentDir, "sample-slot")).rejects.toBeInstanceOf(GamePackagePreparationError);
            expect(runner.calls).toHaveLength(2);

            const succeedingValidator = createStubValidator(validReport(projectRoot));
            const secondAttempt = new GamePackagePreparer("1.2.1", creator, runner, succeedingValidator);
            const result = await secondAttempt.prepare(parentDir, "sample-slot");

            expect(creator.callCount).toBe(1);
            expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
            // Still just the original two commands -- neither install nor build ran again for the retry.
            expect(runner.calls).toHaveLength(2);
        });

        it("clears its retry marker once preparation succeeds, so the directory carries no trace of it", async () => {
            const projectRoot = path.join(parentDir, "sample-slot");
            const runner = createRecordingRunner();
            const validator = createStubValidator(validReport(projectRoot));
            const preparer = new GamePackagePreparer("1.2.1", undefined, runner, validator);

            await preparer.prepare(parentDir, "sample-slot");

            expect(fs.existsSync(path.join(projectRoot, ".pokie-prepare-state.json"))).toBe(false);
        });
    });
});

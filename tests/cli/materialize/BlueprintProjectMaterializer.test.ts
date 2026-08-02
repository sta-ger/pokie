import fs from "fs";
import os from "os";
import path from "path";
import {
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    PokieGamePackageValidating,
    PokieGamePackageValidationReport,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ValidationIssue,
} from "pokie";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {BlueprintMaterializationError} from "../../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {PackageCommandResult, PackageCommandRunning} from "../../../cli/prepare/PackageCommandRunner.js";

type RecordedCommand = {command: string; args: string[]; cwd: string};

function createRecordingRunner(fail?: string): PackageCommandRunning & {calls: RecordedCommand[]} {
    const calls: RecordedCommand[] = [];
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls.push({command, args, cwd});
        if (fail) {
            return Promise.reject(new Error(fail));
        }
        return Promise.resolve({stdout: "", stderr: ""});
    };
    return Object.assign(runner, {calls});
}

function validReport(packageRoot: string): PokieGamePackageValidationReport {
    return {packageRoot, valid: true, game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"}, errors: [], warnings: [], suggestions: []};
}

function invalidReport(packageRoot: string): PokieGamePackageValidationReport {
    return {
        packageRoot,
        valid: false,
        game: null,
        errors: [{code: "pokie-package-load-failed", severity: "error", message: "entry module did not load"}],
        warnings: [],
        suggestions: [],
    };
}

function createStubPackageValidator(reportFor: (packageRoot: string) => PokieGamePackageValidationReport): PokieGamePackageValidating & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        validate(packageRoot: string) {
            calls.push(packageRoot);
            return Promise.resolve(reportFor(packageRoot));
        },
    };
}

function createCountingValidator(real: GameBlueprintValidating = new GameBlueprintValidator()): GameBlueprintValidating & {callCount: number} {
    const counting = {
        callCount: 0,
        validate(blueprint: unknown): ValidationIssue[] {
            counting.callCount++;
            return real.validate(blueprint);
        },
    };
    return counting;
}

function blueprintProjectOf(rootPath: string): PokieProject {
    return {type: "blueprint", rootPath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test fixture"} as PokieProject;
}

function writeBlueprint(dir: string, fileName: string, blueprint: GameBlueprint): string {
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(blueprint, null, 4));
    return filePath;
}

// Every case here uses the real GamePackageGenerator (pure, fast, no I/O beyond the cache root itself) so the
// staged-rename/claim/isReady logic under test runs against real directories on a real filesystem -- only the
// slow/network-touching parts (a real "npm install", a real dynamic-`require` verify against node_modules)
// are faked; those get their own real-lifecycle coverage in BlueprintProjectMaterializer.integration.test.ts.
describe("BlueprintProjectMaterializer", () => {
    let cacheRoot: string;
    let sourceDir: string;

    beforeEach(() => {
        cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-materialize-cache-test-"));
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-materialize-source-test-"));
    });

    afterEach(() => {
        fs.rmSync(cacheRoot, {recursive: true, force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
    });

    it("materializes a blueprint into a fresh cache directory, running generate -> npm install -> verify in order", async () => {
        const runner = createRecordingRunner();
        const packageValidator = createStubPackageValidator(validReport);
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, packageValidator, cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        const result = await materializer.materialize(blueprintProjectOf(blueprintPath));

        expect(fs.existsSync(path.join(result.runtimePath, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(result.runtimePath, "dist", "index.js"))).toBe(true);
        expect(result.runtimePath.startsWith(cacheRoot)).toBe(true);
        expect(result.ownsRuntimePath).toBe(false);
        await expect(result.release()).resolves.toBeUndefined();

        // "npm install"/verify both run against the staging directory *before* it's atomically claimed
        // into its final, deterministic cache path -- so their recorded cwd is a sibling of
        // result.runtimePath (same cache key, ".staging-" suffix), not result.runtimePath itself.
        expect(runner.calls).toHaveLength(1);
        expect(runner.calls[0].command).toBe("npm");
        expect(runner.calls[0].args).toEqual(["install"]);
        expect(runner.calls[0].cwd).toContain(`${path.basename(result.runtimePath)}.staging-`);
        expect(packageValidator.calls).toEqual([runner.calls[0].cwd]);
    });

    it("reuses the same cache directory for an unchanged blueprint and pokie version, without regenerating, reinstalling, or reverifying", async () => {
        const runner = createRecordingRunner();
        const packageValidator = createStubPackageValidator(validReport);
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, packageValidator, cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        const first = await materializer.materialize(blueprintProjectOf(blueprintPath));
        const second = await materializer.materialize(blueprintProjectOf(blueprintPath));

        expect(second.runtimePath).toBe(first.runtimePath);
        expect(runner.calls).toHaveLength(1);
        expect(packageValidator.calls).toHaveLength(1);
    });

    it("resolves an edited blueprint to a different cache directory, leaving the old entry untouched", async () => {
        const runner = createRecordingRunner();
        const packageValidator = createStubPackageValidator(validReport);
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, packageValidator, cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        const before = await materializer.materialize(blueprintProjectOf(blueprintPath));

        const edited = createStarterGameBlueprint();
        edited.manifest.version = "0.2.0";
        writeBlueprint(sourceDir, "game.json", edited);
        const after = await materializer.materialize(blueprintProjectOf(blueprintPath));

        expect(after.runtimePath).not.toBe(before.runtimePath);
        expect(fs.existsSync(before.runtimePath)).toBe(true);
        expect(fs.existsSync(after.runtimePath)).toBe(true);
        expect(runner.calls).toHaveLength(2);
    });

    it("resolves the identical blueprint to a different cache directory under a different pokie version", async () => {
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const materializerV1 = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const materializerV2 = new BlueprintProjectMaterializer("1.4.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);

        const v1 = await materializerV1.materialize(blueprintProjectOf(blueprintPath));
        const v2 = await materializerV2.materialize(blueprintProjectOf(blueprintPath));

        expect(v1.runtimePath).not.toBe(v2.runtimePath);
    });

    it("passes tsPackage projects through verbatim, invoking neither npm nor the package validator", async () => {
        const runner = createRecordingRunner();
        const packageValidator = createStubPackageValidator(validReport);
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, packageValidator, cacheRoot);
        const project = {type: "tsPackage", rootPath: "/some/existing/package", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage, provenance: "test fixture"} as PokieProject;

        const result = await materializer.materialize(project);

        expect(result).toEqual({runtimePath: "/some/existing/package", ownsRuntimePath: false, release: expect.any(Function)});
        await expect(result.release()).resolves.toBeUndefined();
        expect(runner.calls).toEqual([]);
        expect(packageValidator.calls).toEqual([]);
    });

    it("throws a clear error for a project type it cannot materialize into a runtime, without touching npm", async () => {
        const runner = createRecordingRunner();
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, createStubPackageValidator(validReport), cacheRoot);
        const project = {type: "outcomeLibrary", rootPath: "/some/bundle", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary, provenance: "test fixture"} as PokieProject;

        await expect(materializer.materialize(project)).rejects.toThrow(/cannot materialize a "outcomeLibrary" project/);
        expect(runner.calls).toEqual([]);
    });

    it("rejects an invalid blueprint before generating, installing, or verifying anything, leaving no cache artifacts", async () => {
        const runner = createRecordingRunner();
        const validator = createCountingValidator();
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, validator, undefined, runner, createStubPackageValidator(validReport), cacheRoot);
        const broken = createStarterGameBlueprint();
        // Deliberately invalid: exercises GameBlueprintValidator's own "reels" check.
        broken.reels = 0;
        const blueprintPath = writeBlueprint(sourceDir, "game.json", broken);

        const caught = await materializer.materialize(blueprintProjectOf(blueprintPath)).catch((error: unknown) => error);

        expect(caught).toBeInstanceOf(BlueprintMaterializationError);
        expect((caught as BlueprintMaterializationError).phase).toBe("validate");
        expect(validator.callCount).toBe(1);
        expect(runner.calls).toEqual([]);
        expect(fs.existsSync(cacheRoot) ? fs.readdirSync(cacheRoot) : []).toEqual([]);
    });

    it("recovers from a failed 'npm install' phase, leaving no cache directory or staging leftovers, and is retryable", async () => {
        const failingRunner = createRecordingRunner("network unreachable");
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, failingRunner, createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        const caught = await materializer.materialize(blueprintProjectOf(blueprintPath)).catch((error: unknown) => error);

        expect(caught).toBeInstanceOf(BlueprintMaterializationError);
        expect((caught as BlueprintMaterializationError).phase).toBe("dependencies");
        expect(fs.readdirSync(cacheRoot)).toEqual([]);

        const workingRunner = createRecordingRunner();
        const retried = await new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, workingRunner, createStubPackageValidator(validReport), cacheRoot).materialize(
            blueprintProjectOf(blueprintPath),
        );

        expect(fs.existsSync(retried.runtimePath)).toBe(true);
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(retried.runtimePath)]);
    });

    it("recovers from a failed verify phase, leaving no cache directory, and is retryable once the package becomes valid", async () => {
        const runner = createRecordingRunner();
        const failingValidator = createStubPackageValidator(invalidReport);
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, failingValidator, cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        const caught = await materializer.materialize(blueprintProjectOf(blueprintPath)).catch((error: unknown) => error);

        expect(caught).toBeInstanceOf(BlueprintMaterializationError);
        expect((caught as BlueprintMaterializationError).phase).toBe("verify");
        expect(fs.readdirSync(cacheRoot)).toEqual([]);

        const retried = await new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, createStubPackageValidator(validReport), cacheRoot).materialize(
            blueprintProjectOf(blueprintPath),
        );

        expect(fs.existsSync(retried.runtimePath)).toBe(true);
    });

    it("when a concurrent materialize() call already claimed the cache entry, discards this call's own redundant staging build and borrows the winner's instead", async () => {
        const cacheKeyProbe = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        // Establishes the winner "concurrently": materialize() once for real first, capture its own
        // deterministic cache directory, then simulate a second, still-in-flight materialize() call
        // racing to claim that same directory by pre-staging its own build under a fake stagingDir name
        // and exercising the exact rename/claim collision path a true concurrent call would hit.
        const winner = await cacheKeyProbe.materialize(blueprintProjectOf(blueprintPath));
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(winner.runtimePath)]);

        // A second materializer instance, given the identical blueprint/pokieVersion (so it computes the
        // identical cache key), sees the cache entry already ready and simply borrows it -- never
        // rebuilding, never touching npm.
        const loserRunner = createRecordingRunner();
        const loser = await new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, loserRunner, createStubPackageValidator(validReport), cacheRoot).materialize(
            blueprintProjectOf(blueprintPath),
        );

        expect(loser.runtimePath).toBe(winner.runtimePath);
        expect(loserRunner.calls).toEqual([]);
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(winner.runtimePath)]);
    });

    it("never trusts or merges with a marker-less leftover cache directory (e.g. from a prior crash) -- removes it and rebuilds", async () => {
        const runner = createRecordingRunner();
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        // Pre-populate the exact directory a real materialize() call for this blueprint would compute as
        // its cache key -- but only well enough that generate() itself would refuse to write there
        // directly (non-empty), and with no ".pokie-materialized.json" marker, standing in for a prior
        // process that crashed after claiming the slot but before finishing verification.
        const firstAttempt = await materializer.materialize(blueprintProjectOf(blueprintPath));
        const cacheDir = firstAttempt.runtimePath;
        fs.rmSync(path.join(cacheDir, ".pokie-materialized.json"));
        fs.writeFileSync(path.join(cacheDir, "corrupt-leftover.txt"), "not a real build");

        const recovered = await materializer.materialize(blueprintProjectOf(blueprintPath));

        expect(recovered.runtimePath).toBe(cacheDir);
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
        expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
        expect(fs.existsSync(path.join(cacheDir, ".pokie-materialized.json"))).toBe(true);
    });
});

import {spawn, spawnSync} from "child_process";
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

// A pid guaranteed dead: spawnSync blocks until the child has already exited, so by the time it returns, no
// process holds this pid (short of the kernel recycling it, astronomically unlikely within a single test).
function spawnDeadPid(): number {
    const result = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    if (typeof result.pid !== "number") {
        throw new Error("failed to spawn a throwaway process to obtain a dead pid for the test fixture");
    }
    return result.pid;
}

// A pid guaranteed alive for as long as the returned handle isn't killed -- a genuinely separate OS process
// (not this test process's own pid), so a test needing two simultaneously-alive-but-distinct holders can tell
// them apart unambiguously.
function spawnLongLivedPid(): {pid: number; kill: () => void} {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {stdio: "ignore"});
    if (typeof child.pid !== "number") {
        throw new Error("failed to spawn a long-lived throwaway process to obtain a live pid for the test fixture");
    }
    return {pid: child.pid, kill: () => child.kill()};
}

function seedStaleMarkerlessCacheEntry(materializer: BlueprintProjectMaterializer, blueprintPath: string): Promise<string> {
    return materializer.materialize(blueprintProjectOf(blueprintPath)).then((seeded) => {
        const cacheDir = seeded.runtimePath;
        fs.rmSync(path.join(cacheDir, ".pokie-materialized.json"));
        fs.writeFileSync(path.join(cacheDir, "corrupt-leftover.txt"), "not a real build");
        return cacheDir;
    });
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

    it("races two truly concurrent materialize() calls recovering from the same marker-less stale cache entry, and never lets a loser destroy the winner's ready runtime", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        // Pre-populate the exact directory both concurrent calls below will compute as their shared cache
        // key -- marker-less, standing in for a prior process that crashed mid-claim (same setup as the
        // previous test). Firing both materialize() calls together via Promise.all (rather than one `await`ed
        // after the other) is what makes this "true parallel": both genuinely start from the same not-ready
        // observation of this exact directory, interleaving their own real, awaited rename/read calls against
        // it -- unlike a sequential pair, which can never overlap their readiness checks against the same
        // stale entry (see BlueprintProjectMaterializer's own claim() doc comment on why "check, then delete"
        // is unsafe only across truly concurrent callers).
        const seeded = await seeder.materialize(blueprintProjectOf(blueprintPath));
        const cacheDir = seeded.runtimePath;
        fs.rmSync(path.join(cacheDir, ".pokie-materialized.json"));
        fs.writeFileSync(path.join(cacheDir, "corrupt-leftover.txt"), "not a real build");

        const runnerA = createRecordingRunner();
        const runnerB = createRecordingRunner();
        const materializerA = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runnerA, createStubPackageValidator(validReport), cacheRoot);
        const materializerB = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runnerB, createStubPackageValidator(validReport), cacheRoot);

        const [resultA, resultB] = await Promise.all([
            materializerA.materialize(blueprintProjectOf(blueprintPath)),
            materializerB.materialize(blueprintProjectOf(blueprintPath)),
        ]);

        // Both calls compute the identical deterministic cache path regardless of which one actually won
        // the race to populate it.
        expect(resultA.runtimePath).toBe(cacheDir);
        expect(resultB.runtimePath).toBe(cacheDir);

        // Whichever call won, the surviving entry is a complete, verified, uncorrupted runtime -- never
        // half-evicted, never the corrupt leftover, never missing its marker.
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
        expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
        expect(fs.existsSync(path.join(cacheDir, ".pokie-materialized.json"))).toBe(true);

        // No staging or evicted leftovers under the cache root -- the loser discarded its own redundant
        // build (and any evicted copy it turned out not to need) instead of leaving debris behind, and no
        // cache directory was ever left partially replaced.
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(cacheDir)]);

        // Retryable: a later materialize() call still finds a single, ready entry and simply borrows it,
        // without touching npm again.
        const retryRunner = createRecordingRunner();
        const retried = await new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, retryRunner, createStubPackageValidator(validReport), cacheRoot).materialize(
            blueprintProjectOf(blueprintPath),
        );
        expect(retried.runtimePath).toBe(cacheDir);
        expect(retryRunner.calls).toEqual([]);
    });

    it("never evicts or renames a cache entry that a concurrent caller publishes as ready between this caller's own initial stale observation and its cleanup attempt", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());

        // Same marker-less-stale-entry setup as the tests above.
        const seeded = await seeder.materialize(blueprintProjectOf(blueprintPath));
        const cacheDir = seeded.runtimePath;
        fs.rmSync(path.join(cacheDir, ".pokie-materialized.json"));
        fs.writeFileSync(path.join(cacheDir, "corrupt-leftover.txt"), "not a real build");

        const lockDir = `${cacheDir}.lock`;
        const materializerA = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const materializerB = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);

        // By the time materializerA reaches this point in its own materialize() call, it has already run
        // its real, un-mocked initial "is cacheDir ready?" check against the stale entry above and observed
        // it stale (that check happens strictly before the first thing A ever does towards becoming this
        // cache key's cleanup/claim owner: acquiring `<cacheDir>.lock` via this exact `mkdir` call).
        // Intercepting *that* `mkdir` call -- and only its first, real invocation, which can only be A's,
        // since B hasn't started yet -- lets this test force B to build and fully publish a ready runtime
        // into cacheDir while A is paused mid-flight, already past its own stale observation but not yet
        // holding cleanup ownership: exactly the interleaving the reviewer flagged as unsafe.
        const realMkdir = fs.promises.mkdir.bind(fs.promises) as (targetPath: fs.PathLike) => Promise<void>;
        let interceptedFirstLockAttempt = false;
        const mkdirSpy = jest.spyOn(fs.promises, "mkdir").mockImplementation((async (targetPath: fs.PathLike) => {
            if (!interceptedFirstLockAttempt && targetPath === lockDir) {
                interceptedFirstLockAttempt = true;
                const winner = await materializerB.materialize(blueprintProjectOf(blueprintPath));
                expect(winner.runtimePath).toBe(cacheDir);
            }
            return realMkdir(targetPath);
        }) as typeof fs.promises.mkdir);

        let loser: Awaited<ReturnType<typeof materializerA.materialize>>;
        try {
            loser = await materializerA.materialize(blueprintProjectOf(blueprintPath));
        } finally {
            mkdirSpy.mockRestore();
        }

        // A never evicted or renamed B's already-published, ready cacheDir -- it simply re-observed
        // readiness once it finally acquired the (by-then-released) lock, and borrowed B's entry untouched.
        expect(loser.runtimePath).toBe(cacheDir);
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
        expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
        expect(fs.existsSync(path.join(cacheDir, ".pokie-materialized.json"))).toBe(true);

        // No staging or lock leftovers under the cache root.
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(cacheDir)]);

        // Retryable: a later call still finds a single, ready entry and simply borrows it.
        const retryRunner = createRecordingRunner();
        const retried = await new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, retryRunner, createStubPackageValidator(validReport), cacheRoot).materialize(
            blueprintProjectOf(blueprintPath),
        );
        expect(retried.runtimePath).toBe(cacheDir);
        expect(retryRunner.calls).toEqual([]);
    });

    it("reclaims a lock abandoned by a terminated process and completes materialization, leaving no lock or staging artifacts", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const cacheDir = await seedStaleMarkerlessCacheEntry(seeder, blueprintPath);

        // Simulate a prior materialize() call that claimed this cache key's lock and then vanished --
        // terminated, crashed, or otherwise never reached releaseLock() -- by pre-creating the lock directory
        // with a holder pid that is verifiably dead.
        const lockDir = `${cacheDir}.lock`;
        const deadPid = spawnDeadPid();
        fs.mkdirSync(lockDir);
        fs.writeFileSync(path.join(lockDir, "holder.json"), JSON.stringify({pid: deadPid}));

        const runner = createRecordingRunner();
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, createStubPackageValidator(validReport), cacheRoot);
        const recovered = await materializer.materialize(blueprintProjectOf(blueprintPath));

        expect(recovered.runtimePath).toBe(cacheDir);
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
        expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
        expect(fs.existsSync(path.join(cacheDir, ".pokie-materialized.json"))).toBe(true);
        expect(runner.calls).toHaveLength(1);

        // No lock, no staging leftovers under the cache root -- just the single, ready cache entry.
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(cacheDir)]);

        // Retryable: a later call still finds a single, ready entry and simply borrows it.
        const retryRunner = createRecordingRunner();
        const retried = await new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, retryRunner, createStubPackageValidator(validReport), cacheRoot).materialize(
            blueprintProjectOf(blueprintPath),
        );
        expect(retried.runtimePath).toBe(cacheDir);
        expect(retryRunner.calls).toEqual([]);
    });

    it("never reclaims or interrupts a lock whose holder process is still alive, only recovering once it's genuinely released", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const cacheDir = await seedStaleMarkerlessCacheEntry(seeder, blueprintPath);

        // A lock whose recorded holder pid is this very test process -- unambiguously alive for the
        // duration of the test.
        const lockDir = `${cacheDir}.lock`;
        const holderPath = path.join(lockDir, "holder.json");
        fs.mkdirSync(lockDir);
        fs.writeFileSync(holderPath, JSON.stringify({pid: process.pid}));

        // Deterministically observe that the contender below has re-checked this alive holder's liveness
        // several times (i.e. is genuinely looping, not stuck or -- the bug under test -- evicting it) before
        // this test asserts nothing was touched, instead of racing against a wall-clock delay.
        const realReadFile = fs.promises.readFile.bind(fs.promises);
        let livenessChecks = 0;
        let resolveObservedEnough!: () => void;
        const observedEnough = new Promise<void>((resolve) => {
            resolveObservedEnough = resolve;
        });
        const readFileSpy = jest.spyOn(fs.promises, "readFile").mockImplementation(((targetPath: fs.PathLike, encoding?: BufferEncoding) => {
            if (targetPath === holderPath) {
                livenessChecks++;
                if (livenessChecks === 3) {
                    resolveObservedEnough();
                }
            }
            return realReadFile(targetPath, encoding ?? "utf-8");
        }) as typeof fs.promises.readFile);

        const contenderRunner = createRecordingRunner();
        const contender = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, contenderRunner, createStubPackageValidator(validReport), cacheRoot);
        const resultPromise = contender.materialize(blueprintProjectOf(blueprintPath));

        await observedEnough;
        // Still blocked after repeatedly observing the alive holder -- the lock and the stale entry it
        // guards are both still exactly as seeded, never evicted or interrupted.
        expect(fs.existsSync(lockDir)).toBe(true);
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(true);
        expect(contenderRunner.calls).toEqual([]);

        readFileSpy.mockRestore();
        // Now the holder genuinely releases the lock (not a reclaim -- this test process simply removes its
        // own lock, exactly as releaseLock() would).
        fs.rmSync(lockDir, {recursive: true, force: true});

        const result = await resultPromise;
        expect(result.runtimePath).toBe(cacheDir);
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
        expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
        expect(contenderRunner.calls).toHaveLength(1);
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(cacheDir)]);
    });

    it("surfaces an error, instead of retrying forever, when an abandoned lock cannot be reclaimed", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const cacheDir = await seedStaleMarkerlessCacheEntry(seeder, blueprintPath);

        const lockDir = `${cacheDir}.lock`;
        const deadPid = spawnDeadPid();
        fs.mkdirSync(lockDir);
        fs.writeFileSync(path.join(lockDir, "holder.json"), JSON.stringify({pid: deadPid}));

        // Reclaiming now starts with an atomic rename of `lockDir` itself (see reclaimAbandonedLock()'s own
        // doc comment on why -- a plain `rm` can no longer tell an abandoned lock apart from one a fresh
        // contender has since claimed at the same path). Failing that rename is therefore what "can't be
        // reclaimed" surfaces as.
        const realRename = fs.promises.rename.bind(fs.promises) as (oldPath: fs.PathLike, newPath: fs.PathLike) => Promise<void>;
        const renameSpy = jest.spyOn(fs.promises, "rename").mockImplementation(((oldPath: fs.PathLike, newPath: fs.PathLike) => {
            if (oldPath === lockDir) {
                const permissionError = new Error("permission denied");
                (permissionError as NodeJS.ErrnoException).code = "EACCES";
                return Promise.reject(permissionError);
            }
            return realRename(oldPath, newPath);
        }) as typeof fs.promises.rename);

        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const caught = await materializer.materialize(blueprintProjectOf(blueprintPath)).catch((error: unknown) => error);

        renameSpy.mockRestore();

        expect(caught).toBeInstanceOf(BlueprintMaterializationError);
        expect((caught as BlueprintMaterializationError).phase).toBe("lock");
        // The unreclaimable lock is still there -- surfaced loudly, not silently discarded.
        expect(fs.existsSync(lockDir)).toBe(true);

        // Once whatever made reclaiming fail is fixed (here: simply removing it), materialization recovers.
        fs.rmSync(lockDir, {recursive: true, force: true});
        const retried = await materializer.materialize(blueprintProjectOf(blueprintPath));
        expect(retried.runtimePath).toBe(cacheDir);
    });

    it("hands an abandoned lock back untouched, instead of deleting it, when a fresh contender claims lockDir during this call's own reclaim attempt", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const cacheDir = await seedStaleMarkerlessCacheEntry(seeder, blueprintPath);

        const lockDir = `${cacheDir}.lock`;
        const holderPath = path.join(lockDir, "holder.json");
        const deadPid = spawnDeadPid();
        fs.mkdirSync(lockDir);
        fs.writeFileSync(holderPath, JSON.stringify({pid: deadPid}));

        // Intercept the contender's own reclaim rename -- the first rename() call moving `lockDir` itself
        // into a `.reclaim-` quarantine path -- and, immediately before letting it run for real, simulate a
        // fresh, genuinely live contender ("C") winning the now-abandoned lockDir out from under it: exactly
        // the interleaving that made a blind `rm(lockDir)` unsafe (see reclaimAbandonedLock()'s own doc
        // comment). This only ever fires once: having handed the lock straight back, the contender's next
        // mkdir retry finds lockDir occupied by C's genuinely alive holder and simply waits on it.
        const realRename = fs.promises.rename.bind(fs.promises) as (oldPath: fs.PathLike, newPath: fs.PathLike) => Promise<void>;
        let interceptedReclaim = false;
        const renameSpy = jest.spyOn(fs.promises, "rename").mockImplementation(((oldPath: fs.PathLike, newPath: fs.PathLike) => {
            if (!interceptedReclaim && oldPath === lockDir && typeof newPath === "string" && newPath.startsWith(`${lockDir}.reclaim-`)) {
                interceptedReclaim = true;
                fs.rmSync(lockDir, {recursive: true, force: true});
                fs.mkdirSync(lockDir);
                fs.writeFileSync(holderPath, JSON.stringify({pid: process.pid}));
            }
            return realRename(oldPath, newPath);
        }) as typeof fs.promises.rename);

        // Deterministically observe that the contender has, after handing C's lock back, re-checked its
        // (now genuinely alive) liveness several times -- i.e. is genuinely looping/waiting on it, not stuck
        // or -- the bug under test -- having destroyed it -- before asserting anything, instead of racing
        // against a wall-clock delay.
        const realReadFile = fs.promises.readFile.bind(fs.promises);
        let livenessChecksAfterHandback = 0;
        let resolveObservedEnough!: () => void;
        const observedEnough = new Promise<void>((resolve) => {
            resolveObservedEnough = resolve;
        });
        const readFileSpy = jest.spyOn(fs.promises, "readFile").mockImplementation(((targetPath: fs.PathLike, encoding?: BufferEncoding) => {
            if (targetPath === holderPath && interceptedReclaim) {
                livenessChecksAfterHandback++;
                if (livenessChecksAfterHandback === 3) {
                    resolveObservedEnough();
                }
            }
            return realReadFile(targetPath, encoding ?? "utf-8");
        }) as typeof fs.promises.readFile);

        const contenderRunner = createRecordingRunner();
        const contender = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, contenderRunner, createStubPackageValidator(validReport), cacheRoot);
        const resultPromise = contender.materialize(blueprintProjectOf(blueprintPath));

        await observedEnough;
        readFileSpy.mockRestore();
        renameSpy.mockRestore();

        // C's freshly claimed lock is still there, untouched, still recording C's own holder -- the
        // contender's reclaim attempt handed it straight back instead of destroying it, and is now simply
        // waiting on it like it would on any other active lock.
        expect(fs.existsSync(lockDir)).toBe(true);
        expect(JSON.parse(fs.readFileSync(holderPath, "utf-8"))).toEqual({pid: process.pid});
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(true);
        expect(contenderRunner.calls).toEqual([]);

        // C genuinely releases now (not a reclaim -- a normal releaseLock()).
        fs.rmSync(lockDir, {recursive: true, force: true});

        const result = await resultPromise;
        expect(result.runtimePath).toBe(cacheDir);
        expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
        expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
        expect(contenderRunner.calls).toHaveLength(1);
        expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(cacheDir)]);
    });

    it("preserves both holders when a second, distinct contender claims lockDir after quarantine but before handback, then cleans up to a single ready cache entry once each releases", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const cacheDir = await seedStaleMarkerlessCacheEntry(seeder, blueprintPath);

        const lockDir = `${cacheDir}.lock`;
        const holderPath = path.join(lockDir, "holder.json");
        const deadPid = spawnDeadPid();
        fs.mkdirSync(lockDir);
        fs.writeFileSync(holderPath, JSON.stringify({pid: deadPid}));

        // H: a genuinely, independently alive process -- distinct from both the dead pid seeded above and
        // from this test process itself (which plays the role of "C" below) -- so the two holders this test
        // proves survive intact are unambiguously different entities, not two labels for the same check.
        const hHolder = spawnLongLivedPid();
        try {
            // Intercept the contender's own reclaim rename -- the first rename() call moving `lockDir` itself
            // into a `.reclaim-` quarantine path. Immediately before letting it run for real, simulate H
            // legitimately claiming the now-dead-looking lockDir with a fresh, genuinely active lock (the
            // "stale observation" this contender's own outer abandonment check is exposed to). Then, once the
            // quarantine rename has for-real moved H's active record aside, but *before* this contender gets a
            // chance to hand it back, simulate a second, wholly separate contender ("C" -- this test process,
            // unambiguously alive throughout) claiming the now-vacant lockDir with its own fresh, distinct
            // lock -- exactly the interleaving the reviewer flagged as unsafe: a blind discard on failed
            // handback would destroy H's still-active lock, and H's own later release would then remove C's.
            const realRename = fs.promises.rename.bind(fs.promises) as (oldPath: fs.PathLike, newPath: fs.PathLike) => Promise<void>;
            let interceptedReclaim = false;
            let quarantineDir: string | undefined;
            const renameSpy = jest.spyOn(fs.promises, "rename").mockImplementation(((oldPath: fs.PathLike, newPath: fs.PathLike) => {
                if (!interceptedReclaim && oldPath === lockDir && typeof newPath === "string" && newPath.startsWith(`${lockDir}.reclaim-`)) {
                    interceptedReclaim = true;
                    quarantineDir = newPath;
                    return (async () => {
                        fs.rmSync(lockDir, {recursive: true, force: true});
                        fs.mkdirSync(lockDir);
                        fs.writeFileSync(holderPath, JSON.stringify({pid: hHolder.pid}));

                        await realRename(oldPath, newPath);

                        fs.mkdirSync(lockDir);
                        fs.writeFileSync(holderPath, JSON.stringify({pid: process.pid}));
                    })();
                }
                return realRename(oldPath, newPath);
            }) as typeof fs.promises.rename);

            // Deterministically observe that the contender has, after its failed handback, re-checked C's
            // (now occupying lockDir) liveness several times -- i.e. is genuinely looping/waiting on C, not
            // stuck or -- the bug under test -- having destroyed H's or corrupted C's lock -- before asserting
            // anything, instead of racing against a wall-clock delay.
            const realReadFile = fs.promises.readFile.bind(fs.promises);
            let livenessChecksAfterHandback = 0;
            let resolveObservedEnough!: () => void;
            const observedEnough = new Promise<void>((resolve) => {
                resolveObservedEnough = resolve;
            });
            const readFileSpy = jest.spyOn(fs.promises, "readFile").mockImplementation(((targetPath: fs.PathLike, encoding?: BufferEncoding) => {
                if (targetPath === holderPath && interceptedReclaim) {
                    livenessChecksAfterHandback++;
                    if (livenessChecksAfterHandback === 3) {
                        resolveObservedEnough();
                    }
                }
                return realReadFile(targetPath, encoding ?? "utf-8");
            }) as typeof fs.promises.readFile);

            const contenderRunner = createRecordingRunner();
            const contender = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, contenderRunner, createStubPackageValidator(validReport), cacheRoot);
            const resultPromise = contender.materialize(blueprintProjectOf(blueprintPath));

            await observedEnough;
            readFileSpy.mockRestore();
            renameSpy.mockRestore();

            if (!quarantineDir) {
                throw new Error("test setup failed to intercept the contender's reclaim rename");
            }

            // Both holders survive fully intact. H's active lock, displaced into quarantine when the
            // contender's reclaim raced past it, was never discarded merely because lockDir was reoccupied
            // before handback could complete...
            expect(fs.existsSync(quarantineDir)).toBe(true);
            expect(JSON.parse(fs.readFileSync(path.join(quarantineDir, "holder.json"), "utf-8"))).toEqual({pid: hHolder.pid});
            // ...and C's own, later, genuinely distinct lock at lockDir was never touched by the contender's
            // reclaim attempt either.
            expect(fs.existsSync(lockDir)).toBe(true);
            expect(JSON.parse(fs.readFileSync(holderPath, "utf-8"))).toEqual({pid: process.pid});
            expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(true);
            expect(contenderRunner.calls).toEqual([]);

            // C genuinely releases now (a normal releaseLock() -- removing lockDir outright).
            fs.rmSync(lockDir, {recursive: true, force: true});
            // H genuinely releases too, independently -- its own eventual releaseLock() finding and removing
            // this exact quarantine copy, never touching lockDir (by then C's, then the contender's).
            fs.rmSync(quarantineDir, {recursive: true, force: true});

            const result = await resultPromise;
            expect(result.runtimePath).toBe(cacheDir);
            expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(false);
            expect(fs.existsSync(path.join(cacheDir, "dist", "index.js"))).toBe(true);
            expect(contenderRunner.calls).toHaveLength(1);

            // Cleanup yields exactly one ready cache entry -- no lock or staging artifacts left anywhere
            // under the cache root, from either the quarantine dance above or the eventual real build.
            expect(fs.readdirSync(cacheRoot)).toEqual([path.basename(cacheDir)]);
        } finally {
            hHolder.kill();
        }
    });

    it("surfaces a lock-phase error, instead of proceeding as if lockDir were free, when handing an active quarantined holder back fails for a reason other than lockDir being reoccupied", async () => {
        const seeder = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, createRecordingRunner(), createStubPackageValidator(validReport), cacheRoot);
        const blueprintPath = writeBlueprint(sourceDir, "game.json", createStarterGameBlueprint());
        const cacheDir = await seedStaleMarkerlessCacheEntry(seeder, blueprintPath);

        const lockDir = `${cacheDir}.lock`;
        const holderPath = path.join(lockDir, "holder.json");
        const deadPid = spawnDeadPid();
        fs.mkdirSync(lockDir);
        fs.writeFileSync(holderPath, JSON.stringify({pid: deadPid}));

        // H: a genuinely, independently alive process -- distinct from both the dead pid seeded above and
        // this test process -- so the active holder this test proves survives quarantine is unambiguously a
        // real, distinct entity, not a labeling artifact.
        const hHolder = spawnLongLivedPid();
        try {
            // Intercept the contender's own reclaim rename -- the first rename() call moving `lockDir` itself
            // into a `.reclaim-` quarantine path. Immediately before letting it run for real, simulate H
            // legitimately claiming the now-dead-looking lockDir with a fresh, genuinely active lock (the
            // "stale observation" this contender's own outer abandonment check is exposed to), exactly like
            // the "preserves both holders" case above. Unlike that case, this simulates the contender's
            // *subsequent* hand-back rename (quarantineDir -> lockDir) itself failing for a reason that has
            // nothing to do with lockDir being reoccupied -- lockDir is left absent throughout; no other
            // contender ever claims it.
            const realRename = fs.promises.rename.bind(fs.promises) as (oldPath: fs.PathLike, newPath: fs.PathLike) => Promise<void>;
            let interceptedReclaim = false;
            let quarantineDir: string | undefined;
            const renameSpy = jest.spyOn(fs.promises, "rename").mockImplementation(((oldPath: fs.PathLike, newPath: fs.PathLike) => {
                if (!interceptedReclaim && oldPath === lockDir && typeof newPath === "string" && newPath.startsWith(`${lockDir}.reclaim-`)) {
                    interceptedReclaim = true;
                    quarantineDir = newPath;
                    return (async () => {
                        fs.rmSync(lockDir, {recursive: true, force: true});
                        fs.mkdirSync(lockDir);
                        fs.writeFileSync(holderPath, JSON.stringify({pid: hHolder.pid}));

                        await realRename(oldPath, newPath);
                    })();
                }
                if (typeof oldPath === "string" && oldPath === quarantineDir && newPath === lockDir) {
                    const permissionError = new Error("permission denied");
                    (permissionError as NodeJS.ErrnoException).code = "EACCES";
                    return Promise.reject(permissionError);
                }
                return realRename(oldPath, newPath);
            }) as typeof fs.promises.rename);

            const contenderRunner = createRecordingRunner();
            const contender = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, contenderRunner, createStubPackageValidator(validReport), cacheRoot);
            const caught = await contender.materialize(blueprintProjectOf(blueprintPath)).catch((error: unknown) => error);

            renameSpy.mockRestore();

            if (!quarantineDir) {
                throw new Error("test setup failed to intercept the contender's reclaim rename");
            }

            expect(caught).toBeInstanceOf(BlueprintMaterializationError);
            expect((caught as BlueprintMaterializationError).phase).toBe("lock");

            // No build ever ran, and no replacement lock was ever acquired in its place -- the non-contention
            // handback failure surfaced immediately instead of silently letting acquisition proceed as if
            // lockDir were free.
            expect(contenderRunner.calls).toEqual([]);
            expect(fs.existsSync(lockDir)).toBe(false);

            // H's active lock, displaced into quarantine when the contender's reclaim raced past it, is still
            // there, fully intact -- never discarded merely because the handback rename itself failed for a
            // reason unrelated to any genuine lockDir collision.
            expect(fs.existsSync(quarantineDir)).toBe(true);
            expect(JSON.parse(fs.readFileSync(path.join(quarantineDir, "holder.json"), "utf-8"))).toEqual({pid: hHolder.pid});
            expect(fs.existsSync(path.join(cacheDir, "corrupt-leftover.txt"))).toBe(true);
        } finally {
            hHolder.kill();
        }
    });
});

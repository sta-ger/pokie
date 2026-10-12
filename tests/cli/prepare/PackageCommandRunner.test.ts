import fs from "fs";
import os from "os";
import path from "path";
import {EventEmitter} from "events";
import type {ChildProcessWithoutNullStreams} from "child_process";
import {PackageCommandResult, PackageCommandRunning, PackageCommandSpawning, runPackageCommand, withLinkedLocalPokieRuntime, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";
import {REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";

type RecordedCall = {command: string; args: string[]; cwd: string};

function writePackageJson(dir: string, pkg: Record<string, unknown>): string {
    const filePath = path.join(dir, "package.json");
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 4));
    return filePath;
}

function readPackageJson(dir: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as Record<string, unknown>;
}

function writePackageLock(dir: string, lock: Record<string, unknown>): void {
    fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock, null, 2));
}

function readPackageLock(dir: string): {packages: Record<string, unknown>} {
    return JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf-8")) as {packages: Record<string, unknown>};
}

// Real `npm install` records a resolved `file:` spec as a symlink "link": true entry under its own
// "node_modules/<name>" key, plus a second entry (keyed by the relative path "resolved" points at)
// carrying the linked target's real package.json metadata -- verified against a real `npm install` of
// this exact mechanism's own output (see PackageCommandRunner.ts's own doc comment on
// stripLocalPokieLockEntries). Reproduced by hand here rather than spawning real npm, matching every
// other test in this file's own "no real npm process" convention.
function fileLinkLockEntries(name: string, targetKey: string): Record<string, unknown> {
    return {
        [targetKey]: {name, version: "1.3.0", license: "ISC"},
        [`node_modules/${name}`]: {resolved: targetKey, link: true},
    };
}

function createLockWritingBase(lock: Record<string, unknown>): PackageCommandRunning {
    return (_command, _args, cwd) => {
        writePackageLock(cwd, lock);
        return Promise.resolve({stdout: "", stderr: ""});
    };
}

function createRecordingBase(): PackageCommandRunning & {calls: RecordedCall[]} {
    const calls: RecordedCall[] = [];
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls.push({command, args, cwd});
        return Promise.resolve({stdout: "", stderr: ""});
    };
    return Object.assign(runner, {calls});
}

type SpawnedCall = {command: string; args: string[]; cwd: string};

// This tests runPackageCommand itself rather than one of its injected wrappers. The child process is
// simulated only to make the subprocess boundary deterministic; its captured argv is exactly what
// the real runner hands to its spawn dependency.
describe("runPackageCommand", () => {
    const spawnedCalls: SpawnedCall[] = [];
    let failSpawnedCommand = false;
    const spawnRecordedCommand: PackageCommandSpawning = (command, args, options) => {
        spawnedCalls.push({command, args, cwd: options.cwd});
        const child = Object.assign(new EventEmitter(), {pid: 123, stdout: new EventEmitter(), stderr: new EventEmitter()});
        queueMicrotask(() => {
            if (failSpawnedCommand) child.stderr.emit("data", Buffer.from("simulated install failure"));
            child.emit("close", failSpawnedCommand ? 7 : 0, null);
        });
        return child as unknown as ChildProcessWithoutNullStreams;
    };

    beforeEach(() => {
        spawnedCalls.splice(0);
        failSpawnedCommand = false;
    });

    it("adds cache-first install flags only to npm install and otherwise forwards argv unchanged", async () => {
        await runPackageCommand("npm", ["install", "typescript@5"], "/package", {spawn: spawnRecordedCommand});
        await runPackageCommand("npm", ["run", "build", "--", "--watch"], "/package", {spawn: spawnRecordedCommand});
        await runPackageCommand("pnpm", ["install", "typescript@5"], "/package", {spawn: spawnRecordedCommand});

        expect(spawnedCalls).toEqual([
            {command: "npm", args: ["install", "typescript@5", "--prefer-offline", "--no-audit", "--no-fund"], cwd: "/package"},
            {command: "npm", args: ["run", "build", "--", "--watch"], cwd: "/package"},
            {command: "pnpm", args: ["install", "typescript@5"], cwd: "/package"},
        ]);
    });

    it("retains effective npm install argv and stderr in a failed command diagnostic", async () => {
        failSpawnedCommand = true;
        await expect(runPackageCommand("npm", ["install"], "/package", {spawn: spawnRecordedCommand})).rejects.toMatchObject({
            message: "npm install --prefer-offline --no-audit --no-fund exited with 7.",
            stderr: "simulated install failure",
        });
        expect(spawnedCalls).toEqual([{command: "npm", args: ["install", "--prefer-offline", "--no-audit", "--no-fund"], cwd: "/package"}]);
    });
});

// Snapshots package.json exactly as it stands the moment the wrapped "npm install" itself would run --
// this is what proves the local `file:` rewrite is really in effect for that command, not just present
// on disk at some other time, without ever spawning a real npm process (the injected `base` stands in
// for that).
function createStateRecordingBase(): PackageCommandRunning & {packageJsonDuringCalls: Array<Record<string, unknown>>} {
    const packageJsonDuringCalls: Array<Record<string, unknown>> = [];
    const runner = (_command: string, _args: string[], cwd: string): Promise<PackageCommandResult> => {
        packageJsonDuringCalls.push(readPackageJson(cwd));
        return Promise.resolve({stdout: "", stderr: ""});
    };
    return Object.assign(runner, {packageJsonDuringCalls});
}

// withLocalPokieInstall is the one shared mechanism every "npm install" BlueprintProjectMaterializer runs
// (via materializeRuntimePackage.ts's default wiring) and InitCommand's own scaffolded install go through
// -- see PackageCommandRunner.ts's own doc comment. These tests exercise it directly, against a real
// filesystem package.json, without ever spawning a real npm process (the injected `base` stands in for
// that).
describe("withLocalPokieInstall", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-local-install-test-"));
    });

    afterEach(() => {
        fs.rmSync(projectDir, {recursive: true, force: true});
    });

    it("rewrites the package's pokie dependency to a file: spec for the duration of 'npm install', then restores the portable spec once it completes", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["install"], projectDir);

        expect(base.packageJsonDuringCalls).toEqual([{name: "starter-slot", dependencies: {"@fromstan/pokie": "file:/opt/pokie-checkout"}}]);
        expect(readPackageJson(projectDir)).toEqual({name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
    });

    it.each(["failure", "cancellation"])("removes invocation-created scoped lock metadata after install %s", async outcome => {
        const original = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0", other: "^1"}};
        writePackageJson(projectDir, original);
        const error = new Error(outcome);
        const controller = new AbortController();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", () => {
            writePackageLock(projectDir, {packages: {
                "": {dependencies: {"@fromstan/pokie": "file:/opt/pokie-checkout", other: "^1"}},
                ...fileLinkLockEntries("@fromstan/pokie", "../../opt/pokie-checkout"),
                ...fileLinkLockEntries("other", "../../other"),
            }});
            if (outcome === "cancellation") controller.abort();
            return Promise.reject(error);
        });
        await expect(runner("npm", ["install"], projectDir, {signal: controller.signal})).rejects.toBe(error);
        expect(readPackageJson(projectDir)).toEqual(original);
        expect(fs.existsSync(path.join(projectDir, "package-lock.json"))).toBe(false);
    });

    it.each(["failure", "cancellation"])("preserves original lock bytes/existence after %s, including early and partial writes", async outcome => {
        const originalPackage = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}};
        const lockPath = path.join(projectDir, "package-lock.json");
        for (const bytes of [Buffer.from('{ "packages": {} }\n\n'), Buffer.from('{malformed\n'), undefined]) {
            for (const mutation of ["untouched", "torn", "deleted"]) {
                writePackageJson(projectDir, originalPackage);
                fs.rmSync(lockPath, {force: true});
                if (bytes) fs.writeFileSync(lockPath, bytes);
                const error = new Error(outcome);
                const controller = new AbortController();
                const runner = withLocalPokieInstall("/opt/pokie-checkout", () => {
                    if (mutation === "torn") fs.writeFileSync(lockPath, '{"packages":');
                    if (mutation === "deleted") fs.rmSync(lockPath, {force: true});
                    if (outcome === "cancellation") controller.abort();
                    return Promise.reject(error);
                });
                await expect(runner("npm", ["install"], projectDir, {signal: controller.signal})).rejects.toBe(error);
                expect(readPackageJson(projectDir)).toEqual(originalPackage);
                if (bytes) expect(fs.readFileSync(lockPath)).toEqual(bytes);
                else expect(fs.existsSync(lockPath)).toBe(false);
            }
        }
    });

    it("does not mask the original install rejection if cleanup fails", async () => {
        writePackageJson(projectDir, {dependencies: {"@fromstan/pokie": "^1.3.0"}});
        const error = new Error("original install error");
        const runner = withLocalPokieInstall("/opt/pokie-checkout", () => {
            fs.mkdirSync(path.join(projectDir, "package-lock.json"));
            return Promise.reject(error);
        });
        await expect(runner("npm", ["install"], projectDir)).rejects.toBe(error);
        expect(readPackageJson(projectDir).dependencies).toEqual({"@fromstan/pokie": "^1.3.0"});
    });

    it("preserves an authored scoped link when a successful install writes other metadata", async () => {
        writePackageJson(projectDir, {dependencies: {"@fromstan/pokie": "file:../authored"}});
        const originalLock = {packages: {"": {dependencies: {"@fromstan/pokie": "file:../authored"}}, ...fileLinkLockEntries("@fromstan/pokie", "../authored")}};
        writePackageLock(projectDir, originalLock);
        const runner = withLocalPokieInstall("/opt/pokie-checkout", createLockWritingBase({...originalLock, requires: true}));
        await runner("npm", ["install"], projectDir);
        expect(readPackageLock(projectDir).packages).toEqual(originalLock.packages);
    });

    it("removes a torn lock write after failed install and restores the authored package", async () => {
        const original = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}};
        writePackageJson(projectDir, original);
        const runner = withLocalPokieInstall("/opt/pokie-checkout", () => {
            fs.writeFileSync(path.join(projectDir, "package-lock.json"), '{"packages":');
            return Promise.reject(new Error("install failed"));
        });
        await expect(runner("npm", ["install"], projectDir)).rejects.toThrow("install failed");
        expect(readPackageJson(projectDir)).toEqual(original);
        expect(fs.existsSync(path.join(projectDir, "package-lock.json"))).toBe(false);
    });

    it("never touches package.json for a non-'install' npm subcommand", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
        const base = createRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["run", "build"], projectDir);

        expect(readPackageJson(projectDir).dependencies).toEqual({"@fromstan/pokie": "^1.3.0"});
        expect(base.calls).toEqual([{command: "npm", args: ["run", "build"], cwd: projectDir}]);
    });

    it("preserves every other dependency and field already in the package.json, both during install and once it's restored", async () => {
        const original = {
            name: "starter-slot",
            version: "0.1.0",
            dependencies: {"@fromstan/pokie": "^1.3.0", commander: "^14.0.0"},
            devDependencies: {typescript: "^5.0.4"},
        };
        writePackageJson(projectDir, original);
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["install"], projectDir);

        const duringInstall = base.packageJsonDuringCalls[0] as typeof original;
        expect(duringInstall.dependencies).toEqual({"@fromstan/pokie": "file:/opt/pokie-checkout", commander: "^14.0.0"});
        expect(duringInstall.devDependencies).toEqual({typescript: "^5.0.4"});
        expect(duringInstall.name).toBe("starter-slot");
        expect(duringInstall.version).toBe("0.1.0");

        expect(readPackageJson(projectDir)).toEqual(original);
    });

    // REPO_ROOT is a real, already-`npm install`ed POKIE checkout (this repository itself) -- standing
    // in for a real "the running POKIE installation's own root directory" (pokiePackageRoot), unlike
    // every other test in this file's fake, nonexistent "/opt/pokie-checkout" (whose own package.json
    // can't be read, so resolveLocalPokieDependencyClosure trivially yields an empty closure there).
    // This is what proves withLocalPokieInstall's own offline mechanism covers "pokie"'s full runtime
    // dependency closure, not just "pokie" itself -- see PackageCommandRunner.ts's own doc comment on
    // withLocalPokieDependencyClosure for why that distinction is the one this whole mechanism exists
    // for.
    it("also rewrites every one of pokie's own real runtime dependencies to this running installation's already-resolved copies, only for the duration of install", async () => {
        const original = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}};
        writePackageJson(projectDir, original);
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall(REPO_ROOT, base);

        await runner("npm", ["install"], projectDir);

        const duringInstall = base.packageJsonDuringCalls[0] as {dependencies: Record<string, string>; overrides: Record<string, string>};
        expect(duringInstall.dependencies["@fromstan/pokie"]).toBe(`file:${REPO_ROOT}`);
        // "commander" and "exceljs" are pokie's own direct dependencies (package.json); "dayjs" is one
        // of exceljs's own transitive dependencies -- proving the closure really is walked, not just
        // one level deep.
        expect(duringInstall.overrides.commander).toBe(`file:${path.join(REPO_ROOT, "node_modules", "commander")}`);
        expect(duringInstall.overrides.exceljs).toBe(`file:${path.join(REPO_ROOT, "node_modules", "exceljs")}`);
        expect(duringInstall.overrides.dayjs).toBe(`file:${path.join(REPO_ROOT, "node_modules", "dayjs")}`);

        // Once install completes, none of that closure's absolute, host-specific paths are left behind
        // -- the persisted package.json is exactly what it was before this install ran.
        expect(readPackageJson(projectDir)).toEqual(original);
    });

    it("rewrites a closure name already declared as a direct dependency in place, instead of adding it to overrides (npm rejects an overrides entry for a direct dependency it doesn't match)", async () => {
        const original = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0", commander: "^14.0.0"}};
        writePackageJson(projectDir, original);
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall(REPO_ROOT, base);

        await runner("npm", ["install"], projectDir);

        const duringInstall = base.packageJsonDuringCalls[0] as {dependencies: Record<string, string>; overrides?: Record<string, string>};
        expect(duringInstall.dependencies.commander).toBe(`file:${path.join(REPO_ROOT, "node_modules", "commander")}`);
        expect(duringInstall.overrides?.commander).toBeUndefined();

        expect(readPackageJson(projectDir)).toEqual(original);
    });

    it("resolves against a pokiePackageRoot containing spaces", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie checkout with spaces", base);

        await runner("npm", ["install"], projectDir);

        expect(base.packageJsonDuringCalls[0].dependencies).toEqual({"@fromstan/pokie": "file:/opt/pokie checkout with spaces"});
        expect(readPackageJson(projectDir).dependencies).toEqual({"@fromstan/pokie": "^1.3.0"});
    });

    it("propagates the base runner's own result and rejection unchanged", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
        const failing: PackageCommandRunning = () => Promise.reject(new Error("npm exploded"));
        const runner = withLocalPokieInstall("/opt/pokie-checkout", failing);

        await expect(runner("npm", ["install"], projectDir)).rejects.toThrow("npm exploded");
    });

    it("still restores the portable spec when the wrapped 'npm install' itself fails -- a retry re-derives the local override fresh rather than depending on a stale rewrite surviving the failure", async () => {
        const original = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}};
        writePackageJson(projectDir, original);
        const failing: PackageCommandRunning = () => Promise.reject(new Error("npm exploded"));
        const runner = withLocalPokieInstall("/opt/pokie-checkout", failing);

        await expect(runner("npm", ["install"], projectDir)).rejects.toThrow("npm exploded");

        expect(readPackageJson(projectDir)).toEqual(original);
    });

    // Restoring package.json alone isn't enough: a real "npm install" against the transient `file:`
    // rewrite writes those same absolute, host-specific paths into package-lock.json too (see
    // PackageCommandRunner.ts's own doc comment on stripLocalPokieLockEntries) -- these tests drive that
    // normalization directly against a hand-reproduced real npm lockfile shape, distinct from the
    // package.json-only coverage above.
    describe("normalizing package-lock.json once the wrapped 'npm install' succeeds", () => {
        it("strips the 'pokie' link entry and its target metadata block, leaving every unrelated (genuinely portable) entry untouched", async () => {
            const original = {name: "starter-slot", version: "0.1.0", dependencies: {"@fromstan/pokie": "^1.3.0"}};
            writePackageJson(projectDir, original);
            const lock = {
                name: "starter-slot",
                version: "0.1.0",
                lockfileVersion: 3,
                requires: true,
                packages: {
                    "": {name: "starter-slot", version: "0.1.0", dependencies: {"@fromstan/pokie": "file:/opt/pokie-checkout"}},
                    ...fileLinkLockEntries("@fromstan/pokie", "../../opt/pokie-checkout"),
                    "node_modules/left-pad": {
                        version: "1.3.0",
                        resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
                        integrity: "sha512-abc",
                    },
                },
            };
            const base = createLockWritingBase(lock);
            const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

            await runner("npm", ["install"], projectDir);

            const written = readPackageLock(projectDir);
            expect(written.packages["node_modules/@fromstan/pokie"]).toBeUndefined();
            expect(written.packages["../../opt/pokie-checkout"]).toBeUndefined();
            expect(written.packages["node_modules/left-pad"]).toEqual(lock.packages["node_modules/left-pad"]);
            expect((written.packages[""] as {dependencies: unknown}).dependencies).toEqual({"@fromstan/pokie": "^1.3.0"});
        });

        it("also strips a closure override's link entry (e.g. 'commander'), by name, wherever it was rewritten", async () => {
            const original = {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}};
            writePackageJson(projectDir, original);
            const commanderRoot = path.join(REPO_ROOT, "node_modules", "commander");
            const lock = {
                packages: {
                    "": {
                        name: "starter-slot",
                        dependencies: {"@fromstan/pokie": `file:${REPO_ROOT}`},
                        overrides: {commander: `file:${commanderRoot}`},
                    },
                    ...fileLinkLockEntries("@fromstan/pokie", "../../workspace"),
                    ...fileLinkLockEntries("commander", "../../workspace/node_modules/commander"),
                },
            };
            const base = createLockWritingBase(lock);
            const runner = withLocalPokieInstall(REPO_ROOT, base);

            await runner("npm", ["install"], projectDir);

            const written = readPackageLock(projectDir);
            expect(written.packages["node_modules/@fromstan/pokie"]).toBeUndefined();
            expect(written.packages["../../workspace"]).toBeUndefined();
            expect(written.packages["node_modules/commander"]).toBeUndefined();
            expect(written.packages["../../workspace/node_modules/commander"]).toBeUndefined();
            // Once install settles, package.json carries no "overrides" at all (the original never had one)
            // -- the lock's own root entry follows suit rather than keeping the transient override behind.
            expect((written.packages[""] as {overrides?: unknown}).overrides).toBeUndefined();
        });

        it("leaves an unrelated pre-existing link entry (a name outside pokie's own closure) untouched", async () => {
            writePackageJson(projectDir, {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
            const lock = {
                packages: {
                    "": {name: "starter-slot", dependencies: {"@fromstan/pokie": "file:/opt/pokie-checkout"}},
                    ...fileLinkLockEntries("@fromstan/pokie", "../../opt/pokie-checkout"),
                    ...fileLinkLockEntries("some-unrelated-local-dep", "../../opt/some-unrelated-local-dep"),
                },
            };
            const base = createLockWritingBase(lock);
            const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

            await runner("npm", ["install"], projectDir);

            const written = readPackageLock(projectDir);
            expect(written.packages["node_modules/some-unrelated-local-dep"]).toEqual(
                lock.packages["node_modules/some-unrelated-local-dep"],
            );
            expect(written.packages["../../opt/some-unrelated-local-dep"]).toEqual(
                lock.packages["../../opt/some-unrelated-local-dep"],
            );
        });

        it("never writes/touches package-lock.json when the wrapped install never produced one", async () => {
            writePackageJson(projectDir, {name: "starter-slot", dependencies: {"@fromstan/pokie": "^1.3.0"}});
            const base: PackageCommandRunning = () => Promise.resolve({stdout: "", stderr: ""});
            const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

            await runner("npm", ["install"], projectDir);

            expect(fs.existsSync(path.join(projectDir, "package-lock.json"))).toBe(false);
        });
    });
});

describe("withLinkedLocalPokieRuntime", () => {
    let runtimeDir: string;

    beforeEach(() => {
        runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-linked-runtime-test-"));
    });

    afterEach(() => {
        fs.rmSync(runtimeDir, {recursive: true, force: true});
    });

    it("links the running POKIE installation for a runtime install without spawning npm", async () => {
        const base = createRecordingBase();
        const runner = withLinkedLocalPokieRuntime(REPO_ROOT, base);

        await expect(runner("npm", ["install", "--omit=dev"], runtimeDir)).resolves.toEqual({stdout: "", stderr: ""});

        const linkedPokie = path.join(runtimeDir, "node_modules", "@fromstan", "pokie");
        expect(fs.realpathSync(linkedPokie)).toBe(fs.realpathSync(REPO_ROOT));
        expect(base.calls).toEqual([]);
    });

    it("delegates commands other than npm install", async () => {
        const base = createRecordingBase();
        const runner = withLinkedLocalPokieRuntime(REPO_ROOT, base);

        await runner("npm", ["run", "build"], runtimeDir);

        expect(base.calls).toEqual([{command: "npm", args: ["run", "build"], cwd: runtimeDir}]);
    });
});

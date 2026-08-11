import fs from "fs";
import os from "os";
import path from "path";
import {PackageCommandResult, PackageCommandRunning, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";
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

function createRecordingBase(): PackageCommandRunning & {calls: RecordedCall[]} {
    const calls: RecordedCall[] = [];
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls.push({command, args, cwd});
        return Promise.resolve({stdout: "", stderr: ""});
    };
    return Object.assign(runner, {calls});
}

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
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["install"], projectDir);

        expect(base.packageJsonDuringCalls).toEqual([{name: "starter-slot", dependencies: {pokie: "file:/opt/pokie-checkout"}}]);
        expect(readPackageJson(projectDir)).toEqual({name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
    });

    it("never touches package.json for a non-'install' npm subcommand", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const base = createRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["run", "build"], projectDir);

        expect(readPackageJson(projectDir).dependencies).toEqual({pokie: "^1.3.0"});
        expect(base.calls).toEqual([{command: "npm", args: ["run", "build"], cwd: projectDir}]);
    });

    it("preserves every other dependency and field already in the package.json, both during install and once it's restored", async () => {
        const original = {
            name: "starter-slot",
            version: "0.1.0",
            dependencies: {pokie: "^1.3.0", commander: "^14.0.0"},
            devDependencies: {typescript: "^5.0.4"},
        };
        writePackageJson(projectDir, original);
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["install"], projectDir);

        const duringInstall = base.packageJsonDuringCalls[0] as typeof original;
        expect(duringInstall.dependencies).toEqual({pokie: "file:/opt/pokie-checkout", commander: "^14.0.0"});
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
        const original = {name: "starter-slot", dependencies: {pokie: "^1.3.0"}};
        writePackageJson(projectDir, original);
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall(REPO_ROOT, base);

        await runner("npm", ["install"], projectDir);

        const duringInstall = base.packageJsonDuringCalls[0] as {dependencies: Record<string, string>; overrides: Record<string, string>};
        expect(duringInstall.dependencies.pokie).toBe(`file:${REPO_ROOT}`);
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
        const original = {name: "starter-slot", dependencies: {pokie: "^1.3.0", commander: "^14.0.0"}};
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
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const base = createStateRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie checkout with spaces", base);

        await runner("npm", ["install"], projectDir);

        expect(base.packageJsonDuringCalls[0].dependencies).toEqual({pokie: "file:/opt/pokie checkout with spaces"});
        expect(readPackageJson(projectDir).dependencies).toEqual({pokie: "^1.3.0"});
    });

    it("propagates the base runner's own result and rejection unchanged", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const failing: PackageCommandRunning = () => Promise.reject(new Error("npm exploded"));
        const runner = withLocalPokieInstall("/opt/pokie-checkout", failing);

        await expect(runner("npm", ["install"], projectDir)).rejects.toThrow("npm exploded");
    });

    it("still restores the portable spec when the wrapped 'npm install' itself fails -- a retry re-derives the local override fresh rather than depending on a stale rewrite surviving the failure", async () => {
        const original = {name: "starter-slot", dependencies: {pokie: "^1.3.0"}};
        writePackageJson(projectDir, original);
        const failing: PackageCommandRunning = () => Promise.reject(new Error("npm exploded"));
        const runner = withLocalPokieInstall("/opt/pokie-checkout", failing);

        await expect(runner("npm", ["install"], projectDir)).rejects.toThrow("npm exploded");

        expect(readPackageJson(projectDir)).toEqual(original);
    });
});

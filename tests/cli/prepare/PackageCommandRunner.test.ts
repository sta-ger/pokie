import fs from "fs";
import os from "os";
import path from "path";
import {PackageCommandResult, PackageCommandRunning, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";

type RecordedCall = {command: string; args: string[]; cwd: string};

function createRecordingBase(): PackageCommandRunning & {calls: RecordedCall[]} {
    const calls: RecordedCall[] = [];
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls.push({command, args, cwd});
        return Promise.resolve({stdout: "", stderr: ""});
    };
    return Object.assign(runner, {calls});
}

function writePackageJson(dir: string, pkg: Record<string, unknown>): string {
    const filePath = path.join(dir, "package.json");
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 4));
    return filePath;
}

function readPackageJson(dir: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as Record<string, unknown>;
}

// withLocalPokieInstall is the one shared mechanism every "npm install" BlueprintProjectMaterializer runs
// (via materializeRuntimePackage.ts's default wiring) goes through -- see PackageCommandRunner.ts's own doc
// comment. These tests exercise it directly, against a real filesystem package.json, without ever spawning a
// real npm process (the injected `base` stands in for that).
describe("withLocalPokieInstall", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-local-install-test-"));
    });

    afterEach(() => {
        fs.rmSync(projectDir, {recursive: true, force: true});
    });

    it("rewrites the package's pokie dependency to a file: spec before an 'npm install' runs", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const base = createRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["install"], projectDir);

        expect(readPackageJson(projectDir).dependencies).toEqual({pokie: "file:/opt/pokie-checkout"});
        expect(base.calls).toEqual([{command: "npm", args: ["install"], cwd: projectDir}]);
    });

    it("never touches package.json for a non-'install' npm subcommand", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const base = createRecordingBase();
        const runner = withLocalPokieInstall("/opt/pokie-checkout", base);

        await runner("npm", ["run", "build"], projectDir);

        expect(readPackageJson(projectDir).dependencies).toEqual({pokie: "^1.3.0"});
        expect(base.calls).toEqual([{command: "npm", args: ["run", "build"], cwd: projectDir}]);
    });

    it("preserves every other dependency and field already in the package.json", async () => {
        writePackageJson(projectDir, {
            name: "starter-slot",
            version: "0.1.0",
            dependencies: {pokie: "^1.3.0", commander: "^14.0.0"},
            devDependencies: {typescript: "^5.0.4"},
        });
        const runner = withLocalPokieInstall("/opt/pokie-checkout", createRecordingBase());

        await runner("npm", ["install"], projectDir);

        const patched = readPackageJson(projectDir);
        expect(patched.dependencies).toEqual({pokie: "file:/opt/pokie-checkout", commander: "^14.0.0"});
        expect(patched.devDependencies).toEqual({typescript: "^5.0.4"});
        expect(patched.name).toBe("starter-slot");
        expect(patched.version).toBe("0.1.0");
    });

    it("resolves against a pokiePackageRoot containing spaces", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const runner = withLocalPokieInstall("/opt/pokie checkout with spaces", createRecordingBase());

        await runner("npm", ["install"], projectDir);

        expect(readPackageJson(projectDir).dependencies).toEqual({pokie: "file:/opt/pokie checkout with spaces"});
    });

    it("propagates the base runner's own result and rejection unchanged", async () => {
        writePackageJson(projectDir, {name: "starter-slot", dependencies: {pokie: "^1.3.0"}});
        const failing: PackageCommandRunning = () => Promise.reject(new Error("npm exploded"));
        const runner = withLocalPokieInstall("/opt/pokie-checkout", failing);

        await expect(runner("npm", ["install"], projectDir)).rejects.toThrow("npm exploded");
    });
});

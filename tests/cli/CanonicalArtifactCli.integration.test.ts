import {spawnSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleReader, ParSheetImporter, StakeEngineImporter} from "pokie";
import {dispatch} from "../../cli/dispatch.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";

const root = path.resolve(__dirname, "../..");
const binary = path.join(root, "dist/cli/pokie.js");
const blueprint = {
    manifest: {id: "canonical-cli", name: "Canonical CLI", version: "1.0.0"},
    reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["B", "A"]],
};

// Fresh production CLI and ESM package boundary only; browser assets and packaging belong
// to the controller. The existing helper keeps the compiler foreground and owns its lock.
beforeAll(() => {
    ensureCompiledTestOutput({
        repositoryRoot: root, outputPaths: [binary], lockName: "canonical-artifact-cli", forceRebuild: true,
        command: [process.execPath, "-e", `
            const {execFileSync}=require('node:child_process');
            const fs=require('node:fs');
            for(const project of ['tsconfig.prod.json','tsconfig.cli.json'])
                execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--project',project],{stdio:'inherit'});
            for(const directory of ['dist/esm','dist/src']) {
                const target=directory+'/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs';
                fs.mkdirSync(require('node:path').dirname(target),{recursive:true});
                fs.copyFileSync('src/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs',target);
            }
        `],
    });
}, 120000);

describe("canonical artifact CLI through real registration and fresh executable", () => {
    let directory: string;
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;
    const commands = registerCliCommands({version: "1.3.0", pokiePackageRoot: root, clientRoot: path.join(root, "dist/cli/client"), studioRoot: path.join(root, "dist/cli/studio-client")});
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-canonical-cli-"));
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        log.mockRestore();
        error.mockRestore();
        fs.rmSync(directory, {recursive: true, force: true});
    });
    const run = (args: string[], cwd: string) => spawnSync(process.execPath, [binary, ...args], {cwd, encoding: "utf8", timeout: 60000});

    it.each([["export"], ["export", "--help"], ["export", "source.json", "--to", "outcomes", "--out", "removed-artifact"]])("rejects removed argv %j without publication or Studio startup", async (...args) => {
        const studio = commands.find((command) => command.getName() === "__studio")!;
        const startup = jest.spyOn(studio, "run").mockResolvedValue(0);
        const previousDirectory = process.cwd();
        try {
            process.chdir(directory);
            expect(await dispatch(commands, ["node", "pokie", ...args])).toBe(1);
            expect(log).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledWith('Unknown command "export". Did you mean `import`? Run `pokie import --help` for usage.');
            expect(startup).not.toHaveBeenCalled();
            const result = run(args, directory);
            expect(result.status).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr.trim()).toBe('Unknown command "export". Did you mean `import`? Run `pokie import --help` for usage.');
            expect(fs.readdirSync(directory)).toEqual([]);
        } finally {
            process.chdir(previousDirectory);
            startup.mockRestore();
        }
    });

    it("keeps explicit ./export project routing and global Home startup", async () => {
        fs.mkdirSync(path.join(directory, "export"));
        const studio = commands.find((command) => command.getName() === "__studio")!;
        const startup = jest.spyOn(studio, "run").mockResolvedValue(0);
        const previousDirectory = process.cwd();
        try {
            process.chdir(directory);
            expect(await dispatch(commands, ["node", "pokie", "./export", "--no-open"])).toBe(0);
            expect(startup).toHaveBeenLastCalledWith(["./export", "--no-open"]);
            expect(await dispatch(commands, ["node", "pokie"])).toBe(0);
            expect(startup).toHaveBeenLastCalledWith([]);
        } finally {
            process.chdir(previousDirectory);
            startup.mockRestore();
        }
    });

    it("removes export from root and recursive help while preserving retained nested verbs", () => {
        for (const args of [["--help"], ["-h"], ...commands.filter((command) => !command.getName().startsWith("__")).flatMap((command) => [
            [command.getName(), "--help"], ...command.getCommanderCommand().commands.map((verb) => [command.getName(), verb.name(), "--help"]),
        ])]) {
            const result = run(args, directory);
            expect(result.status).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).not.toMatch(/^ {2}export\s{2,}|\bpokie export\b/m);
        }
        for (const flag of ["--version", "-V"]) expect(run([flag], directory).stdout.trim()).toBe("1.3.0");
    });

    it.each(["outcomeLibrary", "stakeAdapter"] as const)("rejects invalid %s descriptor publication through registration and the fresh binary", async (target) => {
        const blueprintPath = path.join(directory, "source.blueprint.json");
        const bundle = path.join(directory, "valid-bundle");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
        expect(run(["build", blueprintPath, "--target", "outcomeLibrary", "--out", bundle], directory).status).toBe(0);
        const reader = new OutcomeLibraryBundleReader();
        const manifest = await reader.readManifest(bundle);
        const library = await reader.readLibrary(bundle, manifest.modes[0].modeName);
        fs.writeFileSync(path.join(directory, "invalid-library.json"), JSON.stringify({...library, outcomes: library.outcomes.map((outcome) => ({...outcome, weight: 0}))}));
        const descriptor = path.join(directory, "descriptor.json");
        fs.writeFileSync(descriptor, JSON.stringify({modes: [{modeName: "base", cost: 1, libraryPath: "./invalid-library.json"}]}));
        for (const surface of ["dispatcher", "binary"]) {
            const destination = path.join(directory, `invalid-${surface}`);
            const args = ["build", descriptor, "--target", target, "--out", destination];
            if (surface === "dispatcher") {
                expect(await dispatch(commands, ["node", "pokie", ...args])).toBe(1);
                expect(error.mock.calls.flat().join("\n")).toMatch(/weight/i);
                expect(log.mock.calls.flat().join("\n")).not.toMatch(/Artifact .* built in/);
            } else {
                const result = run(args, directory);
                expect(result.status).toBe(1);
                expect(result.stderr).toMatch(/weight/i);
                expect(result.stdout).not.toMatch(/Artifact .* built in/);
            }
            expect(fs.existsSync(destination)).toBe(false);
            expect(fs.readdirSync(directory).filter((entry) => (/staging-|tmp-/).test(entry))).toEqual([]);
        }
    });

    it.each(["outcomeLibrary", "stakeAdapter", "parWorkbook"] as const)("publishes and reads back %s through both public boundaries with truthful previews and failures", async (target) => {
        const source = path.join(directory, "source.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        for (const surface of ["dispatcher", "binary"]) {
            const destination = path.join(directory, `${surface}-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
            const args = ["build", source, "--target", target, "--out", destination];
            if (surface === "dispatcher") {
                expect(await dispatch(commands, ["node", "pokie", ...args, "--dry-run"])).toBe(0);
                expect(fs.existsSync(destination)).toBe(false);
                expect(await dispatch(commands, ["node", "pokie", ...args])).toBe(0);
            } else {
                const preview = run([...args, "--dry-run"], directory);
                expect(preview.status).toBe(0);
                expect(preview.stderr).toBe("");
                expect(fs.existsSync(destination)).toBe(false);
                const built = run(args, directory);
                expect(built.status).toBe(0);
                expect(built.stderr).toBe("");
                expect(built.stdout).toContain(`Artifact "${target}"`);
                const occupied = run(args, directory);
                expect(occupied.status).toBe(1);
                expect(occupied.stderr).toMatch(/destination is unavailable[\s\S]*Next: choose a different --out/);
            }
            if (target === "outcomeLibrary") expect((await new OutcomeLibraryBundleReader().readManifest(destination)).game.id).toBe(blueprint.manifest.id);
            else if (target === "stakeAdapter") expect((await new StakeEngineImporter().importFromDirectory(destination)).modes).toHaveLength(1);
            else expect((await new ParSheetImporter().importFromFile(destination)).blueprint).toEqual(blueprint);
        }
        if (target !== "parWorkbook") {
            let descriptor: string;
            if (target === "outcomeLibrary") {
                descriptor = path.join(directory, "stream-descriptor.json");
                fs.writeFileSync(descriptor, JSON.stringify({modes: [{modeName: "base", outcomesPath: "./binary-outcomeLibrary/outcomes_base.jsonl", libraryId: "canonical-stream"}]}));
            } else {
                const imported = path.join(directory, "imported");
                const importedResult = run(["import", path.join(directory, "binary-stakeAdapter"), "--out", imported], directory);
                expect(importedResult.status).toBe(0);
                descriptor = path.join(imported, "config.json");
            }
            const destination = path.join(directory, "descriptor-artifact");
            const args = ["build", descriptor, "--target", target, "--out", destination];
            expect(run([...args, "--dry-run"], directory).status).toBe(0);
            expect(fs.existsSync(destination)).toBe(false);
            const built = run(args, directory);
            expect(built.status).toBe(0);
            expect(built.stderr).toBe("");
            if (target === "outcomeLibrary") expect((await new OutcomeLibraryBundleReader().readManifest(destination)).modes[0].libraryId).toBe("canonical-stream");
            else {
                const config = JSON.parse(fs.readFileSync(descriptor, "utf8"));
                const manifest = JSON.parse(fs.readFileSync(path.join(destination, "pokie-manifest.json"), "utf8"));
                expect(manifest.sourceProvenance).toEqual(config.sourceProvenance);
                expect(manifest.modes[0].generator).toEqual(config.modes[0].generator);
            }
        }
        const missing = run(["build", path.join(directory, "missing.json"), "--target", target, "--out", path.join(directory, "missing-output"), "--dry-run"], directory);
        expect(missing.status).toBe(1);
        expect(missing.stderr).toMatch(/Could not read|ENOENT|not recognized/);
        expect(fs.existsSync(path.join(directory, "missing-output"))).toBe(false);
    });
});

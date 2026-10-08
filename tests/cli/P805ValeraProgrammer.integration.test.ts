import {existsSync, mkdtempSync, readFileSync, rmSync} from "fs";
import {execFileSync} from "child_process";
import {tmpdir} from "os";
import path from "path";

import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";

const repositoryRoot = path.resolve(__dirname, "../..");
const launcher = path.join(repositoryRoot, "dist", "cli", "pokie.js");

// This whole-file CLI run must work independently of packaging and npm's
// lifecycle environment, including when the controller launches Jest directly.
beforeAll(() => {
    ensureCompiledTestOutput({
        repositoryRoot,
        outputPaths: [launcher],
        lockName: "canonical-artifact-cli",
        forceRebuild: true,
        command: [process.execPath, "-e", `
            const {execFileSync}=require('node:child_process');
            for(const project of ['tsconfig.prod.json','tsconfig.cli.json'])
                execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--project',project],{stdio:'inherit'});
        `],
    });
}, 120_000);

describe("P8-05 Valera Programmer public path", () => {
    it("preserves installed/npx entry points and exposes the readiness and one-shot release validators", () => {
        const packageJson = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")) as {bin: Record<string, string>; scripts: Record<string, string>; exports: Record<string, unknown>};
        const commands = registerCliCommands({version: "1.3.0", pokiePackageRoot: "/packed/pokie", clientRoot: "/packed/pokie/dist/cli/client", studioRoot: "/packed/pokie/dist/cli/studio-client"});

        expect(packageJson.bin.pokie).toBe("./dist/cli/pokie.js");
        expect(packageJson.scripts["audit:product-readiness"]).toContain("p8-05-product-readiness-campaign.mjs");
        expect(packageJson.scripts["release:p8-05"]).toContain("p8-05-release-completion.mjs");
        expect(Object.keys(packageJson.exports)).toEqual(expect.arrayContaining([".", "./browser", "./wasm", "./client/player"]));
        expect(commands.find((command) => command.getName() === "__studio")?.getCommanderCommand().helpInformation()).toContain("Usage: pokie");
        for (const command of ["build", "diff", "replay", "report", "serve", "sim", "validate"]) expect(commands.find((item) => item.getName() === command)?.getCommanderCommand().helpInformation()).toContain(`Usage: ${command}`);
    });

    it("executes the public built launcher through a real WASM create/build/inspect/validate/run path", () => {
        const workspace = mkdtempSync(path.join(tmpdir(), "pokie-p8-05-programmer-"));
        const blueprint = path.join(workspace, "Valera spaced blueprint.json");
        const wasm = path.join(workspace, "Valera artifact.wasm");
        const run = (...args: string[]) => execFileSync(process.execPath, [launcher, ...args], {encoding: "utf8"});
        try {
            expect(existsSync(launcher)).toBe(true);
            const publicCommands = ["build", "certification", "client", "create", "dev", "diff", "edit", "fairness", "generate", "import", "init", "inspect", "par", "reel", "run", "replay", "report", "sample", "serve", "sim", "validate"];
            expect(run("--help")).not.toMatch(/^ {2}export\s{2,}|\bpokie export\b/m);
            for (const args of [["--help"], ...publicCommands.map((command) => [command, "--help"]), ["certification", "build", "--help"], ["certification", "verify", "--help"], ["fairness", "seed-commit", "--help"], ["fairness", "commit", "--help"], ["fairness", "reveal", "--help"], ["fairness", "verify", "--help"], ["par", "import", "--help"], ["par", "export", "--help"], ["reel", "generate", "--help"]]) {
                expect(run(...args)).toContain("Usage:");
            }
            expect(run("create", "Valera Programmer", "--random", "--seed", "805", "--out", blueprint)).toContain("created");
            expect(run("build", blueprint, "--target", "wasm", "--out", wasm)).toContain("Artifact \"wasm\" built");
            expect(existsSync(wasm)).toBe(true);
            expect(run("inspect", wasm)).toContain("POKIE WASM component");
            expect(run("validate", wasm)).toContain("valid           yes");
            expect(run("run", wasm, "--seed", "p8-05-programmer")).toContain("POKIE WASM round");
            expect(() => run("validate", path.join(workspace, "missing blueprint.json"))).toThrow();
        } finally {
            rmSync(workspace, {recursive: true, force: true});
        }
    }, 240_000);
});

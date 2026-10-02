import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from "fs";
import {execFileSync} from "child_process";
import {tmpdir} from "os";
import path from "path";

import {registerCliCommands} from "../../cli/registerCliCommands.js";

const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
const packedTestPath = (process.env.PATH ?? "").split(path.delimiter).filter((entry) => !entry.includes("pokie-command-policy")).join(path.delimiter);
const runNpm = (args: string[], options: {cwd?: string} = {}) => execFileSync(process.execPath, [npmCli, ...args], {
    ...options,
    encoding: "utf8",
    env: {...process.env, NODE_ENV: "production", PATH: packedTestPath},
    stdio: "pipe",
    maxBuffer: 64 * 1024 * 1024,
});

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
        const launcher = path.join(process.cwd(), "dist", "cli", "pokie.js");
        const blueprint = path.join(workspace, "Valera spaced blueprint.json");
        const wasm = path.join(workspace, "Valera artifact.wasm");
        const run = (...args: string[]) => execFileSync(process.execPath, [launcher, ...args], {encoding: "utf8"});
        try {
            expect(existsSync(launcher)).toBe(true);
            const publicCommands = ["build", "certification", "client", "create", "dev", "diff", "edit", "export", "fairness", "generate", "import", "init", "inspect", "par", "reel", "run", "replay", "report", "sample", "serve", "sim", "validate"];
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

    it("packs the current candidate, installs its public launcher, and keeps npx and semantic failure behavior", () => {
        // Keep the CLI proof independent from the repository's dist launcher.
        // The browser runner consumes the same verifier-owned archive, but this
        // focused contract makes a broken packed bin or npx entry point fail at
        // the programmer boundary before a rendered workflow can mask it.
        const candidate = execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
        const candidateDirectory = mkdtempSync(path.join(tmpdir(), "pokie-p8-05-packed-cli-"));
        const installation = path.join(candidateDirectory, "installation");
        const sourceArchiveDirectory = path.join(candidateDirectory, "source");
        const sourceArchive = () => {
            // build-cli is incremental and may retain obsolete dist/src or
            // CJS files. Canonical prepack uses build, which clears dist;
            // reproduce that boundary before packing without lifecycle scripts.
            runNpm(["run", "build"], {cwd: process.cwd()});
            mkdirSync(sourceArchiveDirectory, {recursive: true});
            return JSON.parse(runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", sourceArchiveDirectory], {cwd: process.cwd()})) as Array<{filename: string}>;
        };
        try {
            const packed = sourceArchive();
            expect(packed).toHaveLength(1);
            const source = path.join(sourceArchiveDirectory, packed[0].filename);
            const archive = path.join(candidateDirectory, "candidate-package.tgz");
            const receipt = path.join(candidateDirectory, "candidate-executable-receipt.json");
            const canonicalBytes = readFileSync(source);
            execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "p8-05-candidate-package-verifier.mjs"), "--source-archive", source, "--candidate-archive", archive, "--candidate", candidate, "--receipt", receipt], {encoding: "utf8", stdio: "pipe"});
            expect(readFileSync(source)).toEqual(canonicalBytes);
            expect(readFileSync(archive)).toEqual(canonicalBytes);
            runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installation, archive]);
            const launcher = path.join(installation, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie");
            const installedPackage = JSON.parse(readFileSync(path.join(installation, "node_modules", "pokie", "package.json"), "utf8")) as {gitHead?: string};
            const run = (...args: string[]) => execFileSync(launcher, args, {encoding: "utf8", stdio: "pipe"});
            const npxLauncher = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npx-cli.js");
            const blueprint = path.join(candidateDirectory, "Valera packed blueprint.json");
            const wasm = path.join(candidateDirectory, "Valera packed artifact.wasm");

            expect(installedPackage.gitHead === undefined || installedPackage.gitHead === candidate).toBe(true);
            expect(run("--help")).toContain("Usage:");
            expect(existsSync(npxLauncher)).toBe(true);
            expect(execFileSync(process.execPath, [npxLauncher, "--no-install", "--prefix", installation, "pokie", "--help"], {encoding: "utf8", stdio: "pipe"})).toContain("Usage:");
            expect(run("create", "Valera Packed Programmer", "--random", "--seed", "805", "--out", blueprint)).toContain("created");
            expect(run("build", blueprint, "--target", "wasm", "--out", wasm)).toContain("Artifact \"wasm\" built");
            expect(run("validate", wasm)).toContain("valid           yes");
            expect(run("run", wasm, "--seed", "p8-05-packed-programmer")).toContain("POKIE WASM round");
            expect(() => run("validate", path.join(candidateDirectory, "missing blueprint.json"))).toThrow();
        } finally {
            rmSync(candidateDirectory, {recursive: true, force: true});
        }
    }, 900_000);
});

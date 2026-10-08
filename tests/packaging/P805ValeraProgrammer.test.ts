import {mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync} from "fs";
import {execFileSync} from "child_process";
import {createHash} from "crypto";
import {tmpdir} from "os";
import path from "path";

const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
const packedTestPath = (process.env.PATH ?? "").split(path.delimiter).filter((entry) => !entry.includes("pokie-command-policy")).join(path.delimiter);
const runNpm = (args: string[], {cwd, nodeEnv = "production"}: {cwd?: string; nodeEnv?: string} = {}) => execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    env: {...process.env, NODE_ENV: nodeEnv, PATH: packedTestPath},
    stdio: "pipe",
    maxBuffer: 64 * 1024 * 1024,
});

// The complete candidate archive/install proof belongs to the controller-owned
// packaging lifecycle; ordinary help and WASM coverage stays in tests/cli.
describe("P8-05 Valera Programmer installed public path", () => {
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
            // The release smoke launches its compilers from Jest's test
            // environment. It must still produce the production archive that
            // the independently rebuilt candidate verifier authenticates.
            runNpm(["run", "build"], {cwd: process.cwd(), nodeEnv: "test"});
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
            expect(readFileSync(source).equals(canonicalBytes)).toBe(true);
            expect(readFileSync(archive).equals(canonicalBytes)).toBe(true);
            const provenance = JSON.parse(readFileSync(receipt, "utf8")) as {
                candidateId: string;
                candidatePackageSha256: string;
                verifiedBuild: {candidateId: string; environment: {NODE_ENV: string}; executableFiles: number; executableSha256: string};
            };
            expect(provenance.candidateId).toBe(candidate);
            expect(provenance.candidatePackageSha256).toBe(createHash("sha256").update(canonicalBytes).digest("hex"));
            expect(provenance.verifiedBuild).toMatchObject({candidateId: candidate, environment: {NODE_ENV: "production"}});
            expect(provenance.verifiedBuild.executableFiles).toBeGreaterThan(0);
            expect(provenance.verifiedBuild.executableSha256).toMatch(/^[a-f0-9]{64}$/);
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

import {mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, realpathSync, symlinkSync, writeFileSync} from "fs";
import {execFileSync, spawnSync} from "child_process";
import {createHash} from "crypto";
import {tmpdir} from "os";
import path from "path";
import {pathToFileURL} from "url";
import {constants, runInThisContext} from "node:vm";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {preparePackedTestCandidate} from "../testUtils/preparePackedTestCandidate.js";

function expectProgrammerWasmValidation(output: string, wasm: string): void {
    expect(JSON.parse(output)).toMatchObject({
        schemaVersion: 1,
        project: {path: wasm, kind: "wasm"},
        valid: true,
        errors: [],
        wasm: {compatibility: "compatible"},
        advanced: {
            schemaVersion: 1,
            scope: "declared-model",
            adapter: "wasm-declaration-v1",
            status: "budget-exhausted",
            verdict: "inconclusive",
            structuralValid: true,
            executableFidelity: "unverified",
            checks: expect.arrayContaining([
                expect.objectContaining({id: "analysis.completion", status: "unknown", message: "Analysis outcomes limit exhausted."}),
                expect.objectContaining({id: "source.executable-fidelity", status: "unknown"}),
            ]),
        },
    });
}

function importProgrammerScript(file: string): Promise<unknown> {
    const url = pathToFileURL(path.resolve(__dirname, file)).href;
    return runInThisContext(`import(${JSON.stringify(url)})`, {
        importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    }) as Promise<unknown>;
}

async function readSharedProgrammerCandidate(environment: NodeJS.ProcessEnv, options?: {repository: string}): Promise<{installationRoot: string; candidateId: string; archive: Buffer} | undefined> {
    const {readP911CandidateFromEnvironment} = await importProgrammerScript("../../scripts/p9-11-candidate.mjs") as {
        readP911CandidateFromEnvironment: (environment: NodeJS.ProcessEnv, options?: {repository: string}) => Promise<{installationRoot: string; candidateId: string; archive: Buffer} | undefined>;
    };
    return readP911CandidateFromEnvironment(environment, options);
}

function borrowProgrammerInstallation(shared: {installationRoot: string}, installation: string): string {
    mkdirSync(installation);
    writeFileSync(path.join(installation, "package.json"), JSON.stringify({name: "p9-installed-cli-consumer", private: true}));
    symlinkSync(path.join(shared.installationRoot, "node_modules"), path.join(installation, "node_modules"), "dir");
    return path.join(installation, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie");
}

it("selects the pinned P9 programmer archive/installation through native ESM without build/pack", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "p911-programmer-handoff-"));
    try {
        const {candidateFixture} = await importProgrammerScript("../testUtils/createP911CandidateFixture.mjs") as {
            candidateFixture: (directory: string) => Promise<{reference: {path: string; sha256: string}; repository: string; handoff: {installationRoot: string; archivePath: string; candidateId: string}}>;
        };
        const fixture = await candidateFixture(directory);
        const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256, POKIE_P805_RELEASE_HANDOFF: ""};
        const shared = await readSharedProgrammerCandidate(environment, {repository: fixture.repository});
        expect(shared?.installationRoot).toBe(fixture.handoff.installationRoot);
        expect(shared?.candidateId).toBe(fixture.handoff.candidateId);
        expect(shared?.archive.equals(readFileSync(fixture.handoff.archivePath))).toBe(true);
        expect(shared).toBeDefined();
        const installation = path.join(directory, "consumer");
        const launcher = borrowProgrammerInstallation(shared!, installation);
        expect(realpathSync(path.join(installation, "node_modules"))).toBe(path.join(fixture.handoff.installationRoot, "node_modules"));
        expect(readFileSync(launcher, "utf8")).toBe("fixture:dist/cli/pokie.js");
        expect(existsSync(path.join(directory, "source"))).toBe(false);
        rmSync(installation, {recursive: true, force: true});
        expect(existsSync(path.join(fixture.handoff.installationRoot, "node_modules/.bin/pokie"))).toBe(true);
        expect(shared?.archive.equals(readFileSync(fixture.handoff.archivePath))).toBe(true);
        await expect(readSharedProgrammerCandidate({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "b".repeat(64)}, {repository: fixture.repository})).rejects.toThrow("digest mismatch");
        await expect(readSharedProgrammerCandidate({...environment, POKIE_P805_RELEASE_HANDOFF: "{}"}, {repository: fixture.repository})).rejects.toThrow("cannot be combined");
        await expect(readSharedProgrammerCandidate({POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256}, {repository: fixture.repository})).rejects.toThrow("absolute receipt path");
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});

it("preserves authenticated selectors across the bounded programmer correction", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "p911-programmer-descendant-"));
    try {
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {execFileSync} from 'node:child_process';
            import {mkdir, readFile, writeFile} from 'node:fs/promises';
            import path from 'node:path';
            import {candidateFixture, P911_TOOLING_DESCENDANT_PATHS, V2C37_SAVED_GATE_CORRECTION_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, "../testUtils/createP911CandidateFixture.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, "../../scripts/p8-05-release-handoff.mjs")).href)};
            import {readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, "../../scripts/p9-11-candidate.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
            const options = {repository: fixture.repository};
            const readers = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            const original = await readers[0](environment, options);
            const correction = ['tests/packaging/P805ValeraProgrammer.test.ts', 'scripts/p8-05-release-handoff.mjs', 'tests/testUtils/createP911CandidateFixture.mjs'];
            const paths = [...new Set([...V2C37_SAVED_GATE_CORRECTION_PATHS, ...correction])].sort();
            for (const file of correction) assert.ok(V2C37_SAVED_GATE_CORRECTION_PATHS.includes(file), 'missing saved correction path: ' + file);
            for (const file of paths) {
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), 'missing descendant fixture path: ' + file);
                await writeFile(path.join(fixture.repository, file), '// Bounded programmer test correction.');
            }
            const git = args => execFileSync('git', args, {cwd: fixture.repository, encoding: 'utf8'}).trim();
            const commit = () => {
                git(['add', '.']);
                git(['-c', 'user.name=sta-ger', '-c', 'user.email=pascaldelger@gmail.com', 'commit', '--quiet', '-m', 'bounded programmer correction fixture']);
                return git(['rev-parse', 'HEAD']);
            };
            const reviewedId = commit();
            assert.deepEqual(authenticateP805ProductTree(fixture.handoff.candidateId, reviewedId, fixture.repository).changedToolingAndEvidencePaths, paths);
            const releaseEnvironment = {...environment, POKIE_PACK_SMOKE_CANDIDATE_ID: reviewedId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256};
            for (const reader of readers) {
                const selected = await reader(releaseEnvironment, options);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, paths);
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            }
            for (const reference of [fixture.reference, fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(original.packageRoot, 'dist/cli/pokie.js')}]) {
                const bytes = await readFile(reference.path);
                try {
                    await writeFile(reference.path, 'changed pinned input');
                    for (const reader of readers) await assert.rejects(reader(releaseEnvironment, options),
                        /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                } finally { await writeFile(reference.path, bytes); }
            }
            for (const file of ['tests/packaging/unlisted.test.ts', 'src/index.ts', 'package.json', 'tsconfig.prod.json']) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, 'changed protected input');
                const changedId = commit();
                assert.throws(() => authenticateP805ProductTree(fixture.handoff.candidateId, changedId, fixture.repository), /product or build inputs/);
                for (const reader of readers) await assert.rejects(reader(environment, options), /product\\/build inputs changed/);
                git(['reset', '--hard', reviewedId]);
            }
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});

it("validates seed 805 WASM through public commands without archive collection", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "p805-wasm-validation-"));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
        const blueprint = path.join(directory, "Valera packed blueprint.json");
        const wasm = path.join(directory, "Valera packed artifact.wasm");
        const output = path.join(directory, "validation.json");
        expect(await new CreateCommand("2.0.0").run(["Valera Packed Programmer", "--random", "--seed", "805", "--out", blueprint])).toBe(0);
        expect(await new BuildCommand("2.0.0").run([blueprint, "--target", "wasm", "--out", wasm])).toBe(0);
        expect(existsSync(wasm)).toBe(true);
        expect(await new ValidateCommand().run([wasm, "--format", "json", "--out", output])).toBe(2);
        expectProgrammerWasmValidation(readFileSync(output, "utf8"), wasm);
        expect(await new ValidateCommand().run([path.join(directory, "missing blueprint.json"), "--format", "json"])).toBe(1);
        expect(JSON.parse(log.mock.calls[log.mock.calls.length - 1][0])).toMatchObject({valid: false, errors: expect.arrayContaining([expect.objectContaining({severity: "error"})])});
    } finally {
        log.mockRestore();
        rmSync(directory, {recursive: true, force: true});
    }
}, 60_000);

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
    it("packs the current candidate, installs its public launcher, and keeps npx and semantic failure behavior", async () => {
        // Keep the CLI proof independent from the repository's dist launcher.
        // The browser runner consumes the same verifier-owned archive, but this
        // focused contract makes a broken packed bin or npx entry point fail at
        // the programmer boundary before a rendered workflow can mask it.
        const candidate = execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
        const candidateDirectory = mkdtempSync(path.join(tmpdir(), "pokie-p8-05-packed-cli-"));
        const installation = path.join(candidateDirectory, "installation");
        try {
            const shared = await readSharedProgrammerCandidate(process.env);
            let launcher: string;
            let installedCandidate = candidate;
            if (shared) {
                installedCandidate = shared.candidateId;
                launcher = borrowProgrammerInstallation(shared, installation);
            } else {
                // Preserve the historical standalone P8 verifier path. The P9
                // lifecycle instead consumes its pinned normal build/install.
                const {archive, receipt, candidateId} = preparePackedTestCandidate();
                expect(candidateId).toBe(candidate);
                const source = archive;
                const canonicalBytes = readFileSync(source);
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
                launcher = path.join(installation, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie");
            }
            const installedPackage = JSON.parse(readFileSync(path.join(installation, "node_modules", "@fromstan", "pokie", "package.json"), "utf8")) as {gitHead?: string};
            const runWithStatus = (expectedStatus: number, ...args: string[]) => {
                const result = spawnSync(launcher, args, {encoding: "utf8", timeout: 180_000});
                if (result.error) throw result.error;
                if (result.signal !== null || result.status !== expectedStatus) throw new Error(`pokie ${args.join(" ")} exited ${result.status} (${result.signal}); expected ${expectedStatus}:\n${result.stdout}\n${result.stderr}`);
                return result.stdout;
            };
            const run = (...args: string[]) => runWithStatus(0, ...args);
            const npxLauncher = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npx-cli.js");
            const blueprint = path.join(candidateDirectory, "Valera packed blueprint.json");
            const wasm = path.join(candidateDirectory, "Valera packed artifact.wasm");

            expect(installedPackage.gitHead === undefined || installedPackage.gitHead === installedCandidate).toBe(true);
            expect(run("--help")).toContain("Usage:");
            expect(existsSync(npxLauncher)).toBe(true);
            expect(execFileSync(process.execPath, [npxLauncher, "--no-install", "--prefix", installation, "pokie", "--help"], {encoding: "utf8", stdio: "pipe"})).toContain("Usage:");
            expect(run("create", "Valera Packed Programmer", "--random", "--seed", "805", "--out", blueprint)).toContain("created");
            expect(run("build", blueprint, "--target", "wasm", "--out", wasm)).toContain("Artifact \"wasm\" built");
            // Seed 805 reaches the bounded analysis limit. Structural validity
            // and WASM compatibility remain true; inconclusive analysis exits 2.
            expectProgrammerWasmValidation(runWithStatus(2, "validate", wasm, "--format", "json"), wasm);
            expect(run("run", wasm, "--seed", "p8-05-packed-programmer")).toContain("POKIE WASM round");
            expect(() => run("validate", path.join(candidateDirectory, "missing blueprint.json"))).toThrow();
        } finally {
            rmSync(candidateDirectory, {recursive: true, force: true});
        }
    }, 1_200_000);
});

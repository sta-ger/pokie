import {ChildProcessWithoutNullStreams, execFileSync, spawnSync} from "child_process";
import {createHash} from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {pathToFileURL} from "url";
import {createServer} from "node:http";
import {constants, runInThisContext} from "node:vm";
import {BUILT_PACKAGE_FILES} from "@fromstan/pokie";
import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {fractionalBetBlueprint, FRACTIONAL_MIXED_CONTINUATION} from "../fixtures/math/FractionalBetFixture.js";
import {authoritativePaytableBlueprint} from "../fixtures/math/AuthoritativePaytableFixture.js";
import {weightedBonusBlueprint} from "../v2/fixtures/WeightedBonusGame.js";
import {writeRareStakeDirectory, markRecognizedStakeProject} from "../stakeengine/standalone/StakeProbabilityTestFixtures.js";

import {selectPackedArchive} from "./helpers/selectPackedArchive.js";

const REPO_ROOT = path.join(__dirname, "..", "..");

function createExternalSmokeDirectory(prefix: string): string {
    const checkout = fs.realpathSync(REPO_ROOT);
    // Jest may deliberately put TMPDIR under node_modules. Resolve aliases before
    // choosing a parent so the native consumer never inherits checkout resolution.
    const temporaryRoot = [os.tmpdir(), "/tmp", "/var/tmp"]
        .filter((directory) => fs.existsSync(directory))
        .map((directory) => fs.realpathSync(directory))
        .find((directory) => directory !== checkout && !directory.startsWith(checkout + path.sep));
    if (temporaryRoot === undefined) throw new Error("No temporary directory outside the checkout is available for the native smoke consumer.");
    return fs.mkdtempSync(path.join(temporaryRoot, prefix));
}

function importSmokeScript(filename: string): Promise<unknown> {
    const url = pathToFileURL(path.join(REPO_ROOT, "scripts", filename)).href;
    // This lane is transpiled to CommonJS. Keep the real ESM scripts and their
    // dependencies on Node's loader rather than ts-jest's require(fileURL).
    return runInThisContext(`import(${JSON.stringify(url)})`, {
        importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    }) as Promise<unknown>;
}

interface SharedSmokeCandidate {
    archive: Buffer;
    candidateId: string;
    candidateTreeId: string;
    archiveSha256: string;
    installationRoot: string;
    buildReceipt: {path: string; sha256: string};
    installReceipt: {path: string; sha256: string};
    equivalence: {reviewedId: string; candidateId: string; candidateTreeId: string; changedEvidenceAndTooling: string[]};
    projection: {packageJson: {gitHead?: string}};
}

async function readSharedSmokeCandidate(environment: NodeJS.ProcessEnv, options?: {repository: string}): Promise<SharedSmokeCandidate | undefined> {
    const {readP911SmokeCandidateFromEnvironment} = await importSmokeScript("p9-11-candidate.mjs") as {
        readP911SmokeCandidateFromEnvironment: (environment: NodeJS.ProcessEnv, options?: {repository: string}) => Promise<SharedSmokeCandidate | undefined>;
    };
    return readP911SmokeCandidateFromEnvironment(environment, options);
}

async function validateSharedSmokeIdentity(candidate: SharedSmokeCandidate, archive: Buffer): Promise<void> {
    const {validateP911SmokeCandidateIdentity} = await importSmokeScript("p9-11-candidate.mjs") as {
        validateP911SmokeCandidateIdentity: (candidate: SharedSmokeCandidate, environment: NodeJS.ProcessEnv, options: {archive: Buffer}) => void;
    };
    validateP911SmokeCandidateIdentity(candidate, process.env, {archive});
}

function stageSharedSmokeArchive(archive: Buffer, directory: string): string {
    const file = path.join(directory, "p9-candidate.tgz");
    fs.writeFileSync(file, archive, {flag: "wx"});
    return file;
}

function borrowSmokeInstallation(installation: string, sharedInstallation: string): void {
    fs.symlinkSync(path.join(sharedInstallation, "node_modules"), path.join(installation, "node_modules"), "dir");
}

it("selects the pinned P9 smoke archive/installation through native ESM without build/pack", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "p911-smoke-handoff-"));
    try {
        const url = pathToFileURL(path.join(REPO_ROOT, "tests/testUtils/createP911CandidateFixture.mjs")).href;
        const {candidateFixture} = await runInThisContext(`import(${JSON.stringify(url)})`, {importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER}) as {
            candidateFixture: (directory: string) => Promise<{reference: {path: string; sha256: string}; repository: string; handoff: {installationRoot: string; archivePath: string; archiveSha256: string}}>;
        };
        const fixture = await candidateFixture(directory);
        // The shared release runner supplies an empty P8 handoff when absent.
        const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256, POKIE_P805_RELEASE_HANDOFF: ""};
        const shared = await readSharedSmokeCandidate(environment, {repository: fixture.repository});
        expect(shared?.installationRoot).toBe(fixture.handoff.installationRoot);
        expect(shared?.archiveSha256).toBe(fixture.handoff.archiveSha256);
        expect(shared?.archive.equals(fs.readFileSync(fixture.handoff.archivePath))).toBe(true);
        expect(shared).toBeDefined();
        const archive = stageSharedSmokeArchive(shared!.archive, directory);
        expect(fs.readFileSync(archive).equals(fs.readFileSync(fixture.handoff.archivePath))).toBe(true);
        const installation = path.join(directory, "consumer");
        fs.mkdirSync(installation);
        borrowSmokeInstallation(installation, shared!.installationRoot);
        expect(fs.realpathSync(path.join(installation, "node_modules"))).toBe(path.join(fixture.handoff.installationRoot, "node_modules"));
        expect(fs.readFileSync(path.join(installation, "node_modules/.bin/pokie"), "utf8")).toBe("fixture:dist/cli/pokie.js");
        fs.rmSync(installation, {recursive: true, force: true});
        expect(fs.existsSync(path.join(fixture.handoff.installationRoot, "node_modules/.bin/pokie"))).toBe(true);
        expect(shared?.archive.equals(fs.readFileSync(fixture.handoff.archivePath))).toBe(true);
        await expect(readSharedSmokeCandidate({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "b".repeat(64)}, {repository: fixture.repository})).rejects.toThrow("digest mismatch");
        await expect(readSharedSmokeCandidate({...environment, POKIE_P805_RELEASE_HANDOFF: "{}"}, {repository: fixture.repository})).rejects.toThrow("cannot be combined");
        await expect(readSharedSmokeCandidate({POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256}, {repository: fixture.repository})).rejects.toThrow("absolute receipt path");
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

// The installed-binary sweep must keep a workflow row for every public parser surface.  These ids
// deliberately mirror the public command tree rather than the private implementation commands.
const PACKAGED_PUBLIC_WORKFLOW_SCENARIOS = [
    "build", "certification", "certification build", "certification verify", "client", "create", "dev", "diff", "edit",
    "fairness", "fairness seed-commit", "fairness commit", "fairness reveal", "fairness verify", "generate", "import", "init",
    "inspect", "optimize", "par", "par export", "par import", "reel", "reel generate", "run", "replay", "report", "sample", "serve", "sim", "validate",
] as const;

// One of two places in the suite where a CLI command is legitimately spawned as a real subprocess (see
// the project's own "never spawn a CLI command as a subprocess" convention for Studio's in-process
// features) — this test isn't exercising Studio internals, it's exercising *packaging*: whether the
// tarball `npm publish` would actually ship contains everything the installed `pokie` binary needs to
// run standalone, outside this repo's own dev tree (studioRoot resolution via import.meta.url, the
// dual CJS/ESM dist layout, etc.). The other is
// tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts's own CLI command
// coverage describe block, which spawns the built (not packed/installed) executable to prove
// running-installation-root discovery against a spaced path, not packaging.
function waitForListeningPort(child: ChildProcessWithoutNullStreams, timeoutMs = 60000): Promise<number> {
    return new Promise((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => {
            reject(new Error(`Timed out waiting for "pokie" to report its listening port. Output so far:\n${output}`));
        }, timeoutMs);
        const onData = (chunk: Buffer): void => {
            output += chunk.toString();
            const match = (/listening on http:\/\/[^:]+:(\d+)/).exec(output);
            if (match) {
                clearTimeout(timer);
                child.stdout.off("data", onData);
                resolve(Number(match[1]));
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", (chunk: Buffer) => {
            output += chunk.toString();
        });
        child.once("exit", (code) => {
            clearTimeout(timer);
            reject(new Error(`"pokie" exited early (code ${code}). Output so far:\n${output}`));
        });
    });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    const {stopP911Child} = await importSmokeScript("p9-11-corrective-closeout.mjs") as {stopP911Child: (owned: ChildProcessWithoutNullStreams) => Promise<void>};
    await stopP911Child(child);
}

describe("npm pack smoke test (real tarball, real npm install, real spawned pokie binary)", () => {
    // Real `npm pack` (which runs the full `prepack` -> `npm run build` lifecycle) plus a real
    // `npm install` are both genuinely slow — far outside the rest of the suite's normal budget.
    jest.setTimeout(300000);

    let packDir: string | undefined;
    let releaseHandoffBinding: {auditedCandidateId: string; releaseHandoffSha256: string} | undefined;
    let sharedSmokeCandidate: SharedSmokeCandidate | undefined;
    let tarballPath: string | undefined;
    let installDir: string | undefined;
    let pokieBinPath: string;
    const smokeResults = {cli: false, studioApi: false, studioAssets: false, libraryWorker: false, wasm: false, processesDrained: false};
    const completedSmokeTests = new Set<string>();
    let registeredSmokeTests = 0;
    const spawnedSmokeChildren = new Set<ChildProcessWithoutNullStreams>();
    const spawnSmokeChild = async (args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<ChildProcessWithoutNullStreams> => {
        const {spawnP911Child} = await importSmokeScript("p9-11-corrective-closeout.mjs") as {
            spawnP911Child: (command: string, args: string[], options: {cwd: string; env: NodeJS.ProcessEnv}) => ChildProcessWithoutNullStreams;
        };
        const child = spawnP911Child(pokieBinPath, args, {cwd, env});
        spawnedSmokeChildren.add(child);
        return child;
    };
    const smokeIt = (name: string, implementation: () => unknown | Promise<unknown>): void => {
        registeredSmokeTests++;
        it(name, async () => {
            await implementation();
            completedSmokeTests.add(name);
        });
    };

    function stageReleaseSmokeArchive(archive: Buffer): void {
        const receiptPath = process.env.POKIE_PACK_SMOKE_RECEIPT;
        const archivePath = process.env.POKIE_PACK_SMOKE_ARCHIVE_PATH;
        if (receiptPath === undefined && archivePath === undefined) return;
        expect(receiptPath).toBeDefined();
        expect(archivePath).toBeDefined();
        expect(process.env.POKIE_PACK_SMOKE_CANDIDATE_ID).toMatch(/^[a-f0-9]{40}$/i);
        // A release receipt is a result, never a finally-block assertion.  In
        // particular, an earlier failed suite must not be able to leave a
        // seemingly successful installed/cleanup receipt behind.
        if (!smokeResults.cli || !smokeResults.studioApi || !smokeResults.studioAssets || !smokeResults.libraryWorker || !smokeResults.wasm) return;
        const archiveSha256 = createHash("sha256").update(archive).digest("hex");
        expect(archiveSha256).toBe(process.env.POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256);
        fs.mkdirSync(path.dirname(archivePath!), {recursive: true});
        fs.writeFileSync(archivePath!, archive, {flag: "wx"});
    }

    function retainReleaseSmokeReceipt(suitePassed: boolean, cleanup: {temporaryInstallRemoved: boolean; temporaryPackDirectoryRemoved: boolean; processesDrained: boolean}): void {
        const receiptPath = process.env.POKIE_PACK_SMOKE_RECEIPT;
        const archivePath = process.env.POKIE_PACK_SMOKE_ARCHIVE_PATH;
        if (receiptPath === undefined && archivePath === undefined) return;
        expect(receiptPath).toBeDefined();
        expect(archivePath).toBeDefined();
        if (!suitePassed || !Object.values(smokeResults).every(Boolean) || !Object.values(cleanup).every(Boolean)) return;
        const archive = fs.readFileSync(archivePath!);
        const archiveSha256 = createHash("sha256").update(archive).digest("hex");
        const ownPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as {name: string; version: string};
        fs.writeFileSync(receiptPath!, `${JSON.stringify({
            ...releaseHandoffBinding,
            ...(sharedSmokeCandidate === undefined ? {} : {p911CandidateIdentity: {
                candidateId: sharedSmokeCandidate.candidateId,
                candidateTreeId: sharedSmokeCandidate.candidateTreeId,
                archiveSha256: sharedSmokeCandidate.archiveSha256,
                buildReceipt: sharedSmokeCandidate.buildReceipt,
                installReceipt: sharedSmokeCandidate.installReceipt,
                equivalence: sharedSmokeCandidate.equivalence,
            }}),
            schemaVersion: 1,
            kind: "npm-pack-install-smoke",
            candidateId: process.env.POKIE_PACK_SMOKE_CANDIDATE_ID,
            candidatePackageSha256: archiveSha256,
            packageName: ownPackage.name,
            packageVersion: ownPackage.version,
            archivePath: path.resolve(archivePath!),
            archiveSha256,
            archiveSizeBytes: archive.length,
            complete: true,
            suitePassed: true,
            installed: smokeResults,
            cleanup,
        }, null, 2)}\n`, {flag: "wx"});
    }

    beforeAll(async () => {
        // Keep the real tarball and npm's output outside the candidate tree.
        // `npm pack --json` includes one record per shipped file; once the package exceeded 8,000
        // files that output crossed execFileSync's default 1 MiB buffer and failed with ENOBUFS.
        // Non-JSON mode avoids the per-file inventory, but prepack can still emit
        // Vite logs. Select the archive from the fresh directory, not stdout.
        const handoffConfig = process.env.POKIE_P805_RELEASE_HANDOFF;
        sharedSmokeCandidate = await readSharedSmokeCandidate(process.env);
        const p911Candidate = sharedSmokeCandidate;
        if (p911Candidate) {
            const candidate = p911Candidate;
            packDir = createExternalSmokeDirectory("pokie-npm-pack-output-");
            tarballPath = stageSharedSmokeArchive(candidate.archive, packDir);
        } else if (handoffConfig) {
            // Re-authenticate the exact archived product at the real install
            // boundary. The reviewed tooling commit remains the release SHA;
            // archive/gitHead retain their original audited identity.
            const {readP805ReleaseArchive} = await importSmokeScript("p8-05-release-handoff.mjs") as {
                readP805ReleaseArchive: (config: unknown) => Promise<{archive: Buffer; binding: {auditedCandidateId: string}; sha256: string}>;
            };
            const config = JSON.parse(handoffConfig) as {candidateId: string; candidatePackageSha256: string};
            expect(config.candidateId).toBe(process.env.POKIE_PACK_SMOKE_CANDIDATE_ID);
            expect(config.candidatePackageSha256).toBe(process.env.POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256);
            expect(execFileSync("git", ["rev-parse", "HEAD"], {cwd: REPO_ROOT, encoding: "utf8"}).trim()).toBe(config.candidateId);
            const result = await readP805ReleaseArchive(config);
            releaseHandoffBinding = {auditedCandidateId: result.binding.auditedCandidateId, releaseHandoffSha256: result.sha256};
            packDir = createExternalSmokeDirectory("pokie-npm-pack-output-");
            tarballPath = path.join(packDir, "audited-package.tgz");
            fs.writeFileSync(tarballPath, result.archive, {flag: "wx"});
        } else {
            packDir = createExternalSmokeDirectory("pokie-npm-pack-output-");
            const {spawnP911Child, waitP911Child} = await importSmokeScript("p9-11-corrective-closeout.mjs") as {
                spawnP911Child: (command: string, args: string[], options: {cwd: string; timeoutMs: number}) => ChildProcessWithoutNullStreams;
                waitP911Child: (child: ChildProcessWithoutNullStreams) => Promise<{stdout: string}>;
            };
            // Preserve normal prepack, with launch-time ownership of its build
            // descendants and awaited cleanup even when it fails or times out.
            const packChild = spawnP911Child("npm", ["pack", "--silent", "--pack-destination", packDir], {cwd: REPO_ROOT, timeoutMs: 180000});
            spawnedSmokeChildren.add(packChild);
            let stdout: string;
            try {
                stdout = (await waitP911Child(packChild)).stdout;
            } finally {
                await stopChild(packChild);
            }
            tarballPath = selectPackedArchive(packDir, stdout);
        }
        expect(fs.existsSync(tarballPath)).toBe(true);

        // Validate the selected bytes and reviewed checkout before installation.
        // A P9 product keeps its original SHA; optional release context was
        // checked against the authenticated reviewed descendant by the selector.
        const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {cwd: REPO_ROOT, encoding: "utf8"}).trim();
        const selectedArchive = fs.readFileSync(tarballPath);
        const digest = createHash("sha256").update(selectedArchive).digest("hex");
        if (p911Candidate) {
            await validateSharedSmokeIdentity(p911Candidate, selectedArchive);
        } else {
            const expectedSha = process.env.POKIE_PACK_SMOKE_CANDIDATE_ID;
            if (expectedSha) expect(candidateSha).toBe(expectedSha);
            if (process.env.POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256) expect(digest).toBe(process.env.POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256);
        }

        installDir = createExternalSmokeDirectory("pokie native installed consumer ");
        fs.writeFileSync(
            path.join(installDir, "package.json"),
            JSON.stringify({name: "pokie-smoke-test", version: "0.0.0", private: true}),
        );
        // The tarball and its dependency metadata are already local. Prefer npm's cache for matching
        // dependencies while retaining a real `npm install` boundary (and its normal network fallback
        // for a cold cache), so this smoke suite cannot time out merely on registry metadata latency.
        // Always install the authenticated archive natively. A borrowed node_modules symlink
        // cannot establish clean installed-consumer acceptance, even for a shared candidate.
        execFileSync("npm", ["install", tarballPath, "--no-audit", "--no-fund", "--prefer-offline"], {cwd: installDir, encoding: "utf-8", timeout: 120000});
        const installedRoot = path.join(installDir, "node_modules", "@fromstan", "pokie");
        expect(fs.lstatSync(path.join(installDir, "node_modules")).isSymbolicLink()).toBe(false);
        expect(fs.lstatSync(installedRoot).isSymbolicLink()).toBe(false);
        expect(fs.realpathSync(installedRoot).startsWith(fs.realpathSync(REPO_ROOT) + path.sep)).toBe(false);
        expect(execFileSync("git", ["rev-parse", "HEAD"], {cwd: REPO_ROOT, encoding: "utf8"}).trim()).toBe(candidateSha);
        expect(createHash("sha256").update(fs.readFileSync(tarballPath)).digest("hex")).toBe(digest);
        if (p911Candidate) await validateSharedSmokeIdentity(p911Candidate, selectedArchive);
        const installedMetadata = JSON.parse(fs.readFileSync(path.join(installedRoot, "package.json"), "utf8"));
        const ownMetadata = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
        expect(installedMetadata).toMatchObject({name: "@fromstan/pokie", version: "2.0.0", exports: ownMetadata.exports, bin: ownMetadata.bin});
        if (p911Candidate) expect(installedMetadata.gitHead).toBe(p911Candidate.projection.packageJson.gitHead);
        console.log(JSON.stringify({candidateSha, ...(p911Candidate === undefined ? {} : {productCandidateSha: p911Candidate.candidateId, equivalence: p911Candidate.equivalence}), archiveSha256: digest, installedRoot, packageName: installedMetadata.name, version: installedMetadata.version}));

        pokieBinPath = path.join(installDir, "node_modules", ".bin", "pokie");
        expect(fs.existsSync(pokieBinPath)).toBe(true);

        // Keep the real worker fixture beneath this consumer's node_modules.
        // The repository fixture helper would resolve its bare require("@fromstan/pokie")
        // back to checkout dist and could also launch an extra runtime build.
        fs.cpSync(path.join(REPO_ROOT, "tests/cli/fixtures/playable-game"), path.join(installDir, "playable-game"), {
            recursive: true, filter: (source) => path.basename(source) !== "node_modules",
        });
    });

    afterAll(async () => {
        // Jest reaches afterAll only after every real installed CLI, Studio/API/assets and worker
        // assertion above has completed; the receipt is therefore an append-only release artifact,
        // not a pre-flight checklist written before the smoke boundary ran.
        // Every test in this describe is registered through smokeIt.  Keep the
        // expected count explicit so adding an unwrapped test cannot silently
        // make a release receipt describe only a subset of this suite.
        const suitePassed = completedSmokeTests.size === registeredSmokeTests;
        // Drain even when an assertion/startup fails before its per-test finally.
        // allSettled prevents the first failed stop from abandoning siblings.
        const stops = await Promise.allSettled([...spawnedSmokeChildren].map((child) => stopChild(child)));
        const stopFailure = stops.find((result) => result.status === "rejected");
        let cleanupFailure: unknown;
        let archive: Buffer | undefined;
        try {
            if (tarballPath !== undefined) archive = fs.readFileSync(tarballPath);
        } catch (error) {
            cleanupFailure = error;
        }
        for (const directory of [installDir, packDir]) {
            try {
                if (directory !== undefined) fs.rmSync(directory, {recursive: true, force: true});
            } catch (error) {
                cleanupFailure ??= error;
            }
        }
        // This is a real handle audit, not a finally-block declaration. A
        // receipt can claim cleanup only once every smoke-launched server has
        // drained its signed descendant ledger and closed its stdio handles.
        const {p911ChildrenDrained, retainP911PackagingReceipt} = await importSmokeScript("p9-11-corrective-closeout.mjs") as {
            p911ChildrenDrained: (children: Iterable<ChildProcessWithoutNullStreams>) => boolean;
            retainP911PackagingReceipt: (children: Iterable<ChildProcessWithoutNullStreams>, retain: () => void) => void;
        };
        smokeResults.processesDrained = p911ChildrenDrained(spawnedSmokeChildren);
        const cleanup = {
            temporaryInstallRemoved: installDir === undefined || !fs.existsSync(installDir),
            temporaryPackDirectoryRemoved: packDir === undefined || !fs.existsSync(packDir),
            processesDrained: smokeResults.processesDrained,
        };
        if (stopFailure?.status === "rejected") throw stopFailure.reason;
        if (cleanupFailure !== undefined) throw cleanupFailure;
        expect(Object.values(cleanup).every(Boolean)).toBe(true);
        if (suitePassed && archive !== undefined && smokeResults.cli && smokeResults.studioApi && smokeResults.studioAssets && smokeResults.libraryWorker && smokeResults.wasm) stageReleaseSmokeArchive(archive);
        retainP911PackagingReceipt(spawnedSmokeChildren, () => retainReleaseSmokeReceipt(suitePassed, cleanup));
    });

    function installedProbe(name: string, script: string): string {
        const file = path.join(installDir!, `${name}.mjs`);
        fs.writeFileSync(file, script);
        const result = spawnSync(process.execPath, [file], {cwd: installDir, encoding: "utf8", timeout: 120000});
        expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ""});
        return result.stdout;
    }

    smokeIt("resolves native ESM/CJS and strict declarations inside the installation and enforces portable export boundaries", () => {
        const root = path.join(installDir!, "node_modules/@fromstan/pokie");
        for (const file of [
            "dist/cjs/package.json", "dist/esm/index.d.ts", "dist/cjs/index.d.ts",
            "dist/cli/pokie.js", "dist/cli/client/index.html", "dist/cli/studio-client/index.html",
            "dist/cli/client/player/index.js", "dist/cli/client/player/index.d.ts",
            ...["esm", "cjs", "src"].flatMap(tree => [
                `dist/${tree}/gamepackage/internal/runtimeLocation.mjs`,
                `dist/${tree}/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs`,
                `dist/${tree}/simulation/parallel/internal/simulationWorkerEntry.js`,
            ]),
        ]) expect(fs.statSync(path.join(root, file)).size).toBeGreaterThan(0);
        expect(installedProbe("native-exports", `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import {createRequire} from 'node:module';
            import {fileURLToPath} from 'node:url';
            import * as esm from '@fromstan/pokie';
            import * as browser from '@fromstan/pokie/browser';
            import * as wasm from '@fromstan/pokie/wasm';
            import * as player from '@fromstan/pokie/client/player';
            const require = createRequire(import.meta.url);
            const root = ${JSON.stringify(root)};
            const cjs = require('@fromstan/pokie');
            for (const [specifier, suffix] of [['@fromstan/pokie','dist/esm/index.js'], ['@fromstan/pokie/browser','dist/esm/browser.js'], ['@fromstan/pokie/wasm','dist/esm/wasm/browser.js'], ['@fromstan/pokie/client/player','dist/cli/client/player/index.js']]) {
                assert.equal(fs.realpathSync(fileURLToPath(import.meta.resolve(specifier))), root + '/' + suffix);
            }
            assert.equal(fs.realpathSync(require.resolve('@fromstan/pokie')), root + '/dist/cjs/index.js');
            assert.equal(esm.POKIE_VERSION, '2.0.0');
            assert.equal(cjs.POKIE_VERSION, esm.POKIE_VERSION);
            assert.equal(browser.POKIE_WASM_RUNTIME_API_VERSION, '2.1.0');
            assert.equal(wasm.POKIE_WASM_RUNTIME_API_VERSION, '2.1.0');
            assert.equal(typeof player.renderPlayerRound, 'function');
            for (const specifier of ['@fromstan/pokie/browser', '@fromstan/pokie/wasm', '@fromstan/pokie/client/player', '@fromstan/pokie/package.json', '@fromstan/pokie/dist/esm/index.js']) {
                assert.throws(() => require(specifier), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
            }
            await assert.rejects(import('pokie'), {code: 'ERR_MODULE_NOT_FOUND'});
            console.log('NATIVE_EXPORTS_OK');
        `)).toContain("NATIVE_EXPORTS_OK");
        execFileSync("npm", ["install", "--no-save", "--package-lock=false", "--no-audit", "--no-fund", "typescript@^5.8.3", "@types/node@^22"], {cwd: installDir, encoding: "utf8", timeout: 120000});
        fs.writeFileSync(path.join(installDir!, "consumer.mts"), `
            import {POKIE_VERSION, type PokieGame} from '@fromstan/pokie';
            import {VideoSlotConfig} from '@fromstan/pokie/browser';
            import {instantiatePokieWasm} from '@fromstan/pokie/wasm';
            import {renderPlayerRound} from '@fromstan/pokie/client/player';
            const identity: string = POKIE_VERSION;
            const game: PokieGame | undefined = undefined;
            void [identity, game, new VideoSlotConfig(), instantiatePokieWasm, renderPlayerRound];
        `);
        fs.writeFileSync(path.join(installDir!, "consumer.cts"), `import api = require('@fromstan/pokie'); const identity: string = api.POKIE_VERSION; void identity;`);
        execFileSync(process.execPath, [path.join(installDir!, "node_modules/typescript/bin/tsc"), "--strict", "--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.mts", "consumer.cts"], {cwd: installDir, encoding: "utf8", timeout: 120000});
        expect(installedProbe("declaration-resolution", `
            import assert from 'node:assert/strict';
            import ts from 'typescript';
            const root = ${JSON.stringify(root)};
            const options = {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext};
            for (const [entry, mode, expected] of [['consumer.mts', ts.ModuleKind.ESNext, '/dist/esm/index.d.ts'], ['consumer.cts', ts.ModuleKind.CommonJS, '/dist/cjs/index.d.ts']]) {
                const result = ts.resolveModuleName('@fromstan/pokie', process.cwd() + '/' + entry, options, ts.sys, undefined, undefined, mode);
                assert.equal(result.resolvedModule.resolvedFileName, root + expected);
            }
            console.log('NATIVE_DECLARATIONS_OK');
        `)).toContain("NATIVE_DECLARATIONS_OK");
    });

    smokeIt("walks installed recursive help including optimize and advertised help verbs from unrelated spaced cwd without side effects", () => {
        const cwd = path.join(installDir!, "unrelated working directory");
        fs.mkdirSync(cwd);
        const root = path.join(installDir!, "node_modules/@fromstan/pokie");
        const tree = JSON.parse(installedProbe("installed-help-tree", `
            import {registerCliCommands} from ${JSON.stringify(pathToFileURL(path.join(root, "dist/cli/registerCliCommands.js")).href)};
            const handlers = registerCliCommands({version: '2.0.0', pokiePackageRoot: ${JSON.stringify(root)}, clientRoot: ${JSON.stringify(path.join(root, "dist/cli/client"))}, studioRoot: ${JSON.stringify(path.join(root, "dist/cli/studio-client"))}});
            const walk = (command, args) => [{args, help: command.helpInformation(), children: command.commands.map(child => child.name())}, ...command.commands.flatMap(child => walk(child, [...args, child.name()]))];
            console.log(JSON.stringify(handlers.filter(handler => !handler.getName().startsWith('__')).flatMap(handler => walk(handler.getCommanderCommand(), [handler.getName()]))));
        `)) as Array<{args: string[]; help: string; children: string[]}>;
        const sourceTree = registerCliCommands({version: "2.0.0", pokiePackageRoot: root, clientRoot: path.join(root, "dist/cli/client"), studioRoot: path.join(root, "dist/cli/studio-client")});
        expect(tree.filter(node => node.args.length === 1).map(node => node.args[0])).toEqual(sourceTree.map(handler => handler.getName()).filter(name => !name.startsWith("__")));
        expect(tree.some(node => node.args[0] === "optimize")).toBe(true);
        for (const node of tree) {
            const requests = [[...node.args, "--help"], [...node.args, "-h"]];
            if ((/^\s+help \[command\]/m).test(node.help)) requests.push(...[
                [...node.args, "help"], [...node.args, "help", "--help"], [...node.args, "help", "-h"],
                ...node.children.flatMap(child => [[...node.args, "help", child], [...node.args, "help", child, "--help"]]),
            ]);
            for (const args of requests) {
                const result = spawnSync(pokieBinPath, args, {cwd, encoding: "utf8", timeout: 30000});
                expect({args, status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({args, status: 0, error: undefined, stderr: ""});
                const childHelp = args[args.indexOf("help") + 1];
                const expected = node.children.includes(childHelp) ? tree.find(candidate => candidate.args.join(" ") === [...node.args, childHelp].join(" "))!.help : node.help;
                expect(result.stdout).toContain(expected);
            }
        }
        for (const args of [["--version"], ["-V"], ["--help"], ["-h"]]) {
            const result = spawnSync(pokieBinPath, args, {cwd, encoding: "utf8", timeout: 30000});
            expect(result.status).toBe(0);
            expect(result.stderr).toBe("");
            if (args[0] === "--version" || args[0] === "-V") expect(result.stdout.trim()).toBe("2.0.0");
        }
        for (const args of [["build", "--version"], ["sim", "-V"], ["unknown-command"]]) {
            const result = spawnSync(pokieBinPath, args, {cwd, encoding: "utf8", timeout: 30000});
            expect(result.status).not.toBe(0);
            expect(result.stderr).not.toBe("");
            expect(result.stdout).not.toContain("listening on");
        }
        expect(fs.readdirSync(cwd)).toEqual([]);
    });

    smokeIt("executes unchanged generated CJS and genuinely recompiled TS against the installed candidate, including numeric and compact-state regressions", () => {
        const model = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        const root = path.join(installDir!, "native generated package");
        const blueprint = path.join(installDir!, "native-source.json");
        fs.writeFileSync(blueprint, JSON.stringify(model));
        const build = spawnSync(pokieBinPath, ["build", blueprint, "--target", "tsPackage", "--out", root], {cwd: installDir, encoding: "utf8", timeout: 60000});
        expect({status: build.status, stderr: build.stderr}).toEqual({status: 0, stderr: ""});
        const source = fs.readFileSync(path.join(root, "src/index.ts"));
        const direct = fs.readFileSync(path.join(root, "dist/index.js"));
        expect(source.toString()).toContain('from "@fromstan/pokie"');
        expect(direct.toString()).toContain('require("@fromstan/pokie")');
        for (const bytes of [source, direct]) {
            expect(bytes.toString()).not.toContain(REPO_ROOT);
            expect(bytes.toString()).not.toMatch(/(?:require\(|from\s+)["'](?:pokie|.*\/src\/index)["']/);
        }
        // Remove the production convenience link, then perform a real native candidate install.
        fs.rmSync(path.join(root, "node_modules"), {recursive: true, force: true});
        execFileSync("npm", ["install", "--no-save", "--package-lock=false", "--no-audit", "--no-fund", tarballPath!], {cwd: root, encoding: "utf8", timeout: 120000});
        expect(fs.lstatSync(path.join(root, "node_modules/@fromstan/pokie")).isSymbolicLink()).toBe(false);
        const runGeneratedWorkflow = (phase: string) => {
            const sim = path.join(installDir!, `${phase}-generated-sim.json`);
            const markdown = path.join(installDir!, `${phase}-generated-report.md`);
            const replay = path.join(installDir!, `${phase}-generated-replay.json`);
            for (const args of [
                ["inspect", root], ["validate", root],
                ["sim", root, "--rounds", "3", "--seed", "0", "--out", sim],
                ["report", sim, "--format", "markdown", "--out", markdown],
                ["replay", root, "--round", "3", "--seed", "0", "--out", replay],
            ]) {
                const result = spawnSync(pokieBinPath, args, {cwd: installDir, encoding: "utf8", timeout: 60000});
                expect({phase, args, status: result.status, error: result.error?.message, stderr: result.stderr})
                    .toEqual({phase, args, status: 0, error: undefined, stderr: ""});
            }
            const statistics = JSON.parse(fs.readFileSync(sim, "utf8"));
            const recorded = JSON.parse(fs.readFileSync(replay, "utf8"));
            expect(statistics).toMatchObject({rounds: 3, seed: "0", totalBet: expect.closeTo(0.15, 12), totalWin: 0.1, rtp: expect.closeTo(2 / 3, 12)});
            expect(recorded).toMatchObject({seed: "0", round: 3, totalBet: statistics.totalBet, totalWin: statistics.totalWin, screen: FRACTIONAL_MIXED_CONTINUATION[2].screen});
            expect(fs.readFileSync(markdown, "utf8")).toContain("RTP");
            return {statistics, recorded};
        };
        const originalWorkflow = runGeneratedWorkflow("original-cjs");
        fs.writeFileSync(path.join(root, "dist/direct.cjs"), direct);
        execFileSync("npm", ["run", "build"], {cwd: root, encoding: "utf8", timeout: 120000});
        expect(fs.readFileSync(path.join(root, "src/index.ts"))).toEqual(source);
        const recompiledWorkflow = runGeneratedWorkflow("recompiled-ts");
        for (const field of ["rounds", "seed", "totalBet", "totalWin", "rtp", "hitFrequency"]) {
            expect(recompiledWorkflow.statistics[field]).toEqual(originalWorkflow.statistics[field]);
        }
        for (const field of ["game", "seed", "round", "screen", "totalBet", "totalWin"]) {
            expect(recompiledWorkflow.recorded[field]).toEqual(originalWorkflow.recorded[field]);
        }
        const rare = path.join(installDir!, "rare-native-stake");
        writeRareStakeDirectory(rare);
        markRecognizedStakeProject(rare);
        expect(installedProbe("native-regressions", `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import {createRequire} from 'node:module';
            import * as api from '@fromstan/pokie';
            import * as portable from '@fromstan/pokie/wasm';
            const require = createRequire(import.meta.url);
            const packageRoot = ${JSON.stringify(root)};
            const consumer = createRequire(packageRoot + '/package.json');
            assert.equal(fs.realpathSync(consumer.resolve('@fromstan/pokie')), packageRoot + '/node_modules/@fromstan/pokie/dist/cjs/index.js');
            const original = consumer('./dist/direct.cjs');
            const recompiled = consumer('./dist/index.js');
            const loaded = await api.loadPokieGameRuntime(packageRoot);
            const model = ${JSON.stringify(model)};
            const golden = ${JSON.stringify(FRACTIONAL_MIXED_CONTINUATION)};
            try {
                for (const seed of [0, '0', 37, '37']) {
                    const games = [original, recompiled, loaded.game];
                    const sessions = games.map(game => game.createSession({seed}));
                    const oracle = new api.SeededRandomNumberGenerator(seed);
                    for (let reel = 0; reel < 3; reel++) oracle.getRandomInt(0, 2);
                    for (const session of sessions) {
                        assert.equal(session.toSessionState().rngState, oracle.toSessionState());
                        session.setCreditsAmount(1000);
                    }
                    const artifact = typeof seed === 'string' ? await portable.createBlueprintWasmArtifact(model) : undefined;
                    const runtime = artifact && await portable.instantiatePokieWasm(artifact.bytes, artifact.manifest, new portable.SeededPokieWasmHost(seed));
                    const wasm = runtime?.createSession(seed);
                    const initialWasm = wasm?.serialize();
                    const portableRounds = [];
                    try {
                        for (let round = 0; round < 12; round++) {
                            const bet = model.availableBets[round % 3];
                            const before = sessions[0].getCreditsAmount();
                            for (const session of sessions) { session.setBet(bet); session.play(); }
                            const screen = sessions[0].getSymbolsCombination().toMatrix();
                            const expected = screen.every(reel => reel[0] === 'A') ? bet * 5 : screen.every(reel => reel[0] === 'B') ? bet * 2 : 0;
                            if (seed === '0' && round < golden.length) {
                                assert.deepEqual(screen, golden[round].screen);
                                assert.equal(sessions[0].toSessionState().rngState, golden[round].rngState);
                            }
                            for (let index = 0; index < sessions.length; index++) {
                                const session = sessions[index];
                                assert.deepEqual(session.getSymbolsCombination().toMatrix(), screen);
                                assert.equal(session.getWinAmount(), expected);
                                assert.equal(session.getCreditsAmount(), before - bet + expected);
                                assert.deepEqual(session.toSessionState(), sessions[0].toSessionState());
                                const restored = games[index].createSession({seed: 'unrelated'});
                                restored.fromSessionState(JSON.parse(JSON.stringify(session.toSessionState())));
                                restored.setBet(bet); restored.setCreditsAmount(session.getCreditsAmount());
                                const continuation = games[index].createSession({seed});
                                continuation.fromSessionState(session.toSessionState());
                                continuation.setBet(bet); continuation.setCreditsAmount(session.getCreditsAmount());
                                restored.play(); continuation.play();
                                assert.deepEqual(restored.toSessionState(), continuation.toSessionState());
                                assert.equal(restored.getWinAmount(), continuation.getWinAmount());
                            }
                            if (wasm) {
                                const result = await wasm.play({bet});
                                assert.deepEqual(result.screen, screen);
                                assert.equal(result.stake, bet); assert.equal(result.payout, expected);
                                assert.equal(result.credits, sessions[0].getCreditsAmount());
                                portableRounds.push(result);
                            }
                        }
                        if (wasm) {
                            const replayed = await runtime.replay(initialWasm, portableRounds.map(round => ({bet: round.stake})));
                            assert.deepEqual(replayed.rounds, portableRounds);
                            assert.deepEqual(replayed.stateAfter, wasm.serialize());
                        }
                    } finally { runtime?.dispose(); }
                }
                for (const bet of model.availableBets) {
                    for (const game of [original, recompiled, loaded.game]) {
                        const session = game.createSession({seed: '0'});
                        session.setCreditsAmount(1000); session.setBet(bet);
                        const statistics = new api.AggregateSimulationRunner(session, 3).run().getStatistics();
                        const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), statistics, requestedRounds: 3, seed: '0', durationMs: 1});
                        assert.equal(report.rounds, 3);
                        assert.ok(Math.abs(report.totalBet / (3 * bet) - 1) < 1e-12);
                        assert.ok(Math.abs(report.totalWin / (2 * bet) - 1) < 1e-12);
                        assert.ok(Math.abs(report.rtp - 2 / 3) < 1e-12);
                        const replay = new api.ReplayRecorder().record({game, seed: '0', round: 3, entryCommands: Array.from({length: 3}, () => ({kind: 'spin', bet}))});
                        assert.deepEqual(replay.screen, golden[2].screen);
                        assert.equal(replay.totalBet, report.totalBet);
                        assert.equal(replay.totalWin, report.totalWin);
                    }
                }
                const initial0 = new api.SeededRandomNumberGenerator(0).toSessionState();
                assert.notEqual(initial0, new api.SeededRandomNumberGenerator('0').toSessionState());
                for (const model of ${JSON.stringify(["missing-symbol", "missing-count", "zero"].map(kind => authoritativePaytableBlueprint(kind as "zero", 0.05)))}) {
                    const output = new api.GamePackageGenerator('2.0.0').generate(model, process.cwd(), process.cwd() + '/omission-' + model.manifest.id);
                    const game = require(output.projectRoot + '/dist/index.js');
                    const session = game.createSession({seed: '0'}); session.setBet(0.05); session.play();
                    assert.equal(session.getWinAmount(), 0);
                    assert.deepEqual(game.getModelDescriptor().model.paytable, model.paytable);
                }
                for (const awards of [{}, {3: 0}]) {
                    const freeModel = {...model, symbols: ['A','S'], scatters: ['S'], reelStrips: [['S'],['S'],['S']], paytable: {A: {3: 5}, S: {3: 2}}, mechanics: {freeGames: {scatterSymbol: 'S', awardsByCount: awards}}};
                    const output = new api.GamePackageGenerator('2.0.0').generate(freeModel, process.cwd(), process.cwd() + '/free-' + Object.keys(awards).length);
                    const session = require(output.projectRoot + '/dist/index.js').createSession({seed: '0'});
                    session.setBet(0.05); session.play();
                    assert.equal(session.getWinAmount(), 0.1);
                    assert.equal(session.getFreeGamesNum(), 0);
                }
                for (const feature of [false, true]) {
                    const artifact = await portable.createBlueprintWasmArtifact(feature ? ${JSON.stringify(weightedBonusBlueprint())} : model);
                    const runtime = await portable.instantiatePokieWasm(artifact.bytes, artifact.manifest, new portable.SeededPokieWasmHost('0'));
                    const fresh = await portable.instantiatePokieWasm(artifact.bytes, artifact.manifest, new portable.SeededPokieWasmHost('fresh'));
                    try {
                        const session = runtime.createSession('0', {credits: 10000});
                        for (let i = 0; i < 48; i++) {
                            const state = JSON.parse(JSON.stringify(session.serialize()));
                            assert.equal(state.schemaVersion, feature ? 'pokie.state.v4' : 'pokie.state.v3');
                            assert.ok(JSON.stringify(state).length < (feature ? 16384 : 512));
                            assert.ok(!('commands' in state) && !('draws' in state));
                            const restored = fresh.restoreSession(state);
                            const command = feature ? portable.nextPokieWasmCommand(state) : {bet: 0.05};
                            assert.deepEqual(await restored.play(command), await session.play(command));
                            assert.deepEqual(restored.serialize(), session.serialize()); restored.dispose();
                            const before = session.serialize();
                            assert.throws(() => runtime.restoreSession({...state, artifactIdentity: 'wrong'}));
                            assert.throws(() => runtime.restoreSession({...state, rngState: -1}));
                            assert.deepEqual(session.serialize(), before);
                        }
                    } finally { runtime.dispose(); fresh.dispose(); }
                }
                const project = await new api.ProjectTargetResolver().resolve(${JSON.stringify(rare)});
                const report = await new api.OutcomeSourceProjectAnalyzer().analyze(project);
                assert.equal(report.issues.filter(issue => issue.severity === 'error').length, 0);
                const analysis = report.modes[0].analysis;
                for (const [field, expected] of [['hitFrequency', 2 ** -64], ['maxWinProbability', 2 ** -64], ['rtp', 2 ** -63], ['variance', 2 ** -62]]) {
                    assert.ok(analysis[field] > 0 && Math.abs(analysis[field] / expected - 1) <= 1e-12, field);
                }
                console.log('INSTALLED_NUMERIC_AND_COMPACT_CONTRACTS_OK');
            } finally { await loaded.release(); }
        `)).toContain("INSTALLED_NUMERIC_AND_COMPACT_CONTRACTS_OK");
    });

    smokeIt("executes delivered portable exports and executable WASM through a real browser and module Worker", async () => {
        const root = path.join(installDir!, "node_modules/@fromstan/pokie");
        const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
        const imports = Object.fromEntries(["browser", "wasm", "client/player"].map(name => [
            `@fromstan/pokie/${name}`, `/installed/${metadata.exports[`./${name}`].import.default.slice(2)}`,
        ]));
        const profile = path.join(installDir!, "browser profile");
        let finish!: (value: unknown) => void;
        const completed = new Promise<unknown>(resolve => {
            finish = resolve;
        });
        const script = `
            import * as browser from '@fromstan/pokie/browser';
            import * as wasm from '@fromstan/pokie/wasm';
            import * as player from '@fromstan/pokie/client/player';
            const check = (condition, message) => {if (!condition) throw new Error(message)};
            let worker;
            let runtime;
            try {
                check(typeof player.renderPlayerRound === 'function', 'player export');
                check(new browser.VideoSlotConfig().getAvailableBets().length > 0, 'browser runtime');
                const artifact = await wasm.createBlueprintWasmArtifact(${JSON.stringify(fractionalBetBlueprint([0.05, 7.5, 1e-7], true))});
                check(WebAssembly.validate(artifact.bytes), 'executable WASM bytes');
                runtime = await wasm.instantiatePokieWasm(artifact.bytes, artifact.manifest, new wasm.SeededPokieWasmHost('0'));
                const session = runtime.createSession('0');
                const initial = session.serialize();
                const round = await session.play({bet: 0.05});
                check(JSON.stringify(round.screen) === ${JSON.stringify(JSON.stringify(FRACTIONAL_MIXED_CONTINUATION[0].screen))}, 'independent RNG oracle');
                check(round.stake === 0.05 && round.payout === 0.1, 'fractional payout');
                check((await runtime.replay(initial, [{bet: 0.05}])).rounds[0].payout === 0.1, 'portable replay');
                worker = new wasm.PokieWasmWorkerClient(() => new Worker('/worker.mjs', {type: 'module'}), {project: 'installed', generation: '1', artifact: artifact.manifest.artifact.sha256, job: 'native'});
                await worker.request({type: 'instantiate', bytes: artifact.bytes, manifest: artifact.manifest, seed: '0'});
                const workerRound = await worker.request({type: 'play', command: {bet: 0.05}});
                check(JSON.stringify(workerRound) === JSON.stringify(round), 'real Worker parity');
                await worker.request({type: 'dispose'});
                worker.dispose();
                check(worker.getDiagnostics().disposed && worker.getDiagnostics().pending === 0, 'Worker drained');
                await fetch('/result', {method: 'POST', body: JSON.stringify({ok: true, abi: artifact.manifest.artifact.abiVersion, api: wasm.POKIE_WASM_RUNTIME_API_VERSION, worker: true})});
            } catch (error) {
                await fetch('/result', {method: 'POST', body: JSON.stringify({ok: false, error: String(error), stack: error.stack})});
            } finally {worker?.dispose(); runtime?.dispose();}
        `;
        const server = createServer((request, response) => {
            const url = new URL(request.url!, "http://localhost");
            if (url.pathname === "/result" && request.method === "POST") {
                let body = "";
                request.on("data", chunk => {
                    body += chunk.toString();
                });
                request.on("end", () => {
                    finish(JSON.parse(body));
                    response.end("ok");
                });
                return;
            }
            response.setHeader("Content-Type", "text/javascript");
            if (url.pathname === "/probe.mjs") {
                response.end(script);
                return;
            }
            if (url.pathname === "/worker.mjs") {
                response.end("import {installPokieWasmWorker} from '/installed/dist/esm/wasm/PokieWasmWorkerClient.js'; installPokieWasmWorker(self);");
                return;
            }
            if (url.pathname === "/") {
                response.setHeader("Content-Type", "text/html");
                response.end(`<script type="importmap">${JSON.stringify({imports})}</script><script type="module" src="/probe.mjs"></script>`);
                return;
            }
            const file = path.resolve(root, url.pathname.replace(/^\/installed\//, ""));
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                response.writeHead(404).end();
                return;
            }
            response.end(fs.readFileSync(file));
        });
        await new Promise<void>(resolve => {
            server.listen(0, "127.0.0.1", resolve);
        });
        let child: ChildProcessWithoutNullStreams | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            const {spawnP911Child} = await importSmokeScript("p9-11-corrective-closeout.mjs") as {
                spawnP911Child: (command: string, args: string[], options: {cwd: string}) => ChildProcessWithoutNullStreams;
            };
            child = spawnP911Child(process.env.P8_04_CHROMIUM_BINARY ?? "chromium-browser", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `http://127.0.0.1:${(server.address() as {port: number}).port}/`], {cwd: installDir!});
            spawnedSmokeChildren.add(child);
            const failure = new Promise<never>((_resolve, reject) => {
                child!.once("error", reject);
                child!.once("exit", code => {
                    reject(new Error(`Browser exited before acceptance (${code})`));
                });
                timeout = setTimeout(() => {
                    reject(new Error("Installed browser consumer did not finish within 60 seconds"));
                }, 60000);
            });
            expect(await Promise.race([completed, failure])).toEqual({ok: true, abi: "3.0.0", api: "2.1.0", worker: true});
        } finally {
            clearTimeout(timeout);
            try {
                if (child) await stopChild(child);
            } finally {
                server.closeAllConnections();
                await new Promise<void>((resolve, reject) => {
                    server.close(error => error ? reject(error) : resolve());
                });
            }
        }
    });

    smokeIt("preserves an independently authored installed package and its custom behavior during inspection, simulation and rejected model extraction", () => {
        const root = path.join(installDir!, "custom executable package");
        fs.mkdirSync(path.join(root, "dist"), {recursive: true});
        fs.mkdirSync(path.join(root, "src"));
        const executable = fs.readFileSync(path.join(installDir!, "playable-game/index.js"));
        const files: Record<string, Buffer> = {
            "src/index.js": executable,
            "dist/index.js": executable,
            "package.json": Buffer.from(JSON.stringify({name: "independent-custom", version: "1.0.0", pokie: {entry: "dist/index.js"}})),
            "package-lock.json": Buffer.from('{"lockfileVersion":3,"packages":{}}\n'),
        };
        for (const [file, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, file), bytes);
        const probe = `
            import assert from 'node:assert/strict';
            import {loadPokieGameRuntime, PackageBlueprintExtraction} from '@fromstan/pokie';
            const runtime = await loadPokieGameRuntime(${JSON.stringify(root)});
            try {
                assert.equal(runtime.game.getModelDescriptor, undefined);
                const session = runtime.game.createSession({seed: 'custom-seed'});
                session.setCreditsAmount(1000); session.play();
                const extraction = await new PackageBlueprintExtraction().extract(runtime.game);
                assert.notEqual(extraction.status, 'complete'); assert.equal(extraction.blueprint, undefined);
                console.log(JSON.stringify({manifest: runtime.game.getManifest(), screen: session.getSymbolsCombination().toMatrix(), win: session.getWinAmount(), state: session.toSessionState()}));
            } finally {await runtime.release();}
        `;
        const before = JSON.parse(installedProbe("custom-before", probe));
        for (const command of ["inspect", "validate"]) {
            const result = spawnSync(pokieBinPath, [command, root], {cwd: installDir, encoding: "utf8", timeout: 60000});
            expect(result.status).toBe(0);
        }
        const simulation = spawnSync(pokieBinPath, ["sim", root, "--rounds", "4", "--seed", "custom-seed", "--out", path.join(installDir!, "custom-sim.json")], {cwd: installDir, encoding: "utf8", timeout: 60000});
        expect(simulation.status).toBe(0);
        for (const target of ["blueprint", "tsPackage", "parWorkbook", "wasm"]) {
            const output = path.join(installDir!, `custom-rejected-${target}`);
            const result = spawnSync(pokieBinPath, ["build", root, "--target", target, "--out", output], {cwd: installDir, encoding: "utf8", timeout: 60000});
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/descriptor|model|extract|represent/i);
            expect(fs.existsSync(output)).toBe(false);
        }
        expect(JSON.parse(installedProbe("custom-after", probe))).toEqual(before);
        for (const [file, bytes] of Object.entries(files)) expect(fs.readFileSync(path.join(root, file))).toEqual(bytes);
    });

    smokeIt("runs `pokie --no-open` (Home mode): serves the app shell/assets and a healthy API", async () => {
        const child = await spawnSmokeChild(["--no-open", "--port", "0"], installDir!);
        try {
            const port = await waitForListeningPort(child);
            const baseUrl = `http://127.0.0.1:${port}`;

            const health = await fetch(`${baseUrl}/api/health`);
            expect(health.status).toBe(200);
            expect(await health.json()).toEqual({status: "ok"});

            const context = await fetch(`${baseUrl}/api/context`);
            expect(await context.json()).toEqual({mode: "home"});

            const diagnostics = await fetch(`${baseUrl}/api/studio/diagnostics`);
            expect(diagnostics.status).toBe(200);
            expect((await diagnostics.json()) as {mode: string}).toMatchObject({mode: "home"});

            // Proves the tarball's compiled/copied studio-client assets are actually served from the
            // installed location, not just present on disk in this dev repo. The Studio frontend is a
            // real Vite build with content-hashed asset filenames (no fixed /main.js or /style.css) —
            // discover the real paths from the served index.html itself rather than hardcoding them.
            const index = await fetch(`${baseUrl}/`);
            expect(index.status).toBe(200);
            expect(index.headers.get("content-type")).toContain("text/html");
            const indexHtml = await index.text();

            const scriptSrc = (/<script[^>]+src="([^"]+)"/).exec(indexHtml)?.[1];
            const stylesheetHref = (/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/).exec(indexHtml)?.[1];
            expect(scriptSrc).toBeDefined();
            expect(stylesheetHref).toBeDefined();

            const mainJs = await fetch(`${baseUrl}${scriptSrc}`);
            expect(mainJs.status).toBe(200);
            expect(mainJs.headers.get("content-type")).toContain("javascript");

            const styleCss = await fetch(`${baseUrl}${stylesheetHref}`);
            expect(styleCss.status).toBe(200);
            expect(styleCss.headers.get("content-type")).toContain("css");
            smokeResults.cli = true;
            smokeResults.studioApi = true;
            smokeResults.studioAssets = true;
        } finally {
            await stopChild(child);
        }
    });

    smokeIt("runs `pokie . --no-open` (Project mode) against a non-package directory: starts cleanly, reports an error dashboard, never crashes", async () => {
        const child = await spawnSmokeChild([".", "--no-open", "--port", "0"], installDir!);
        try {
            const port = await waitForListeningPort(child);
            const baseUrl = `http://127.0.0.1:${port}`;

            const context = await fetch(`${baseUrl}/api/context`);
            expect(await context.json()).toEqual({mode: "project", projectRoot: installDir});

            let dashboard: {status: string} = {status: "loading"};
            for (let i = 0; i < 200 && dashboard.status === "loading"; i++) {
                const response = await fetch(`${baseUrl}/api/project/context`);
                dashboard = (await response.json()) as {status: string};
                if (dashboard.status === "loading") {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 50);
                    });
                }
            }
            expect(dashboard.status).toBe("error");

            // Still running — a failed project load reports an error dashboard, it never crashes Studio.
            expect(child.exitCode).toBeNull();
        } finally {
            await stopChild(child);
        }
    });

    smokeIt("imports ParallelSimulationRunner from the installed \"pokie\" package and runs a workers=2 simulation, exiting cleanly with no lingering worker threads", () => {
        const fixtureRoot = path.join(installDir!, "playable-game");
        const scriptPath = path.join(installDir!, "run-parallel-simulation.mjs");
        // Deliberately not importing anything from this repo's own src/cli — this script only ever
        // sees what npm actually installed from the tarball, exactly as a real third-party consumer
        // embedding parallel simulation programmatically would write it.
        fs.writeFileSync(
            scriptPath,
            `
            import {ParallelSimulationRunner} from "@fromstan/pokie";

            const {createRequire} = await import('node:module');
            const consumer = createRequire(import.meta.url);
            const fixture = createRequire(${JSON.stringify(path.join(fixtureRoot, "package.json"))});
            if (fixture.resolve('@fromstan/pokie') !== consumer.resolve('@fromstan/pokie')) throw new Error('worker fixture resolved a different POKIE');
            const runner = new ParallelSimulationRunner(${JSON.stringify(fixtureRoot)}, 20000, {seed: "demo", workers: 2});
            const result = await runner.run();

            if (result.workers !== 2) {
                throw new Error("expected workers to be 2, got " + result.workers);
            }
            if (result.statistics.rounds !== 20000) {
                throw new Error("expected 20000 rounds, got " + result.statistics.rounds);
            }
            if (!Number.isFinite(result.statistics.rtp)) {
                throw new Error("expected a finite rtp");
            }
            if (result.manifest.id !== "playable-game") {
                throw new Error("expected the fixture game's manifest, got " + JSON.stringify(result.manifest));
            }
            if (!result.workerSeedStrategy || typeof result.workerSeedStrategy !== "string") {
                throw new Error("expected a workerSeedStrategy description");
            }

            console.log("PARALLEL_SIMULATION_SMOKE_OK " + JSON.stringify({workers: result.workers, rounds: result.statistics.rounds}));
            `,
        );

        // execFileSync only returns once the child process has actually exited on its own — if a
        // worker thread were left running (not terminated after run() resolves), Node's event loop
        // would never drain and this would hang until Jest's own timeout killed it, failing the test.
        const output = execFileSync("node", [scriptPath], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(output).toContain('PARALLEL_SIMULATION_SMOKE_OK {"workers":2,"rounds":20000}');
        smokeResults.libraryWorker = true;
    });

    smokeIt("imports pokie/wasm, uses its Worker protocol, and runs installed CLI WASM build/inspect/validate/run without checkout files", () => {
        const workflowDir = fs.mkdtempSync(path.join(installDir!, "wasm-installed-workflow-"));
        const blueprintPath = path.join(workflowDir, "game.blueprint.json");
        const wasmPath = path.join(workflowDir, "game.wasm");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "installed-wasm", name: "Installed WASM", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], reelStrips: [["A", "B"], ["B", "A"]], paytable: {A: {2: 2}, B: {2: 1}},
        }));
        try {
            execFileSync(pokieBinPath, ["build", blueprintPath, "--target", "wasm", "--out", wasmPath], {cwd: workflowDir, encoding: "utf-8"});
            expect(execFileSync(pokieBinPath, ["inspect", wasmPath], {cwd: workflowDir, encoding: "utf-8"})).toContain("canonical ABI operations: play, replay");
            expect(execFileSync(pokieBinPath, ["validate", wasmPath, "--format", "json"], {cwd: workflowDir, encoding: "utf-8"})).toContain('"valid": true');
            expect(execFileSync(pokieBinPath, ["run", wasmPath, "--seed", "installed"], {cwd: workflowDir, encoding: "utf-8"})).toContain("POKIE WASM round 1");

            const workerScript = path.join(workflowDir, "wasm-worker-protocol.mjs");
            fs.writeFileSync(workerScript, `
                import fs from "fs";
                import {PokieWasmWorkerProtocol} from "@fromstan/pokie/wasm";
                const artifact = ${JSON.stringify(wasmPath)};
                const manifest = JSON.parse(fs.readFileSync(artifact + ".pokie-wasm.json", "utf8"));
                const protocol = new PokieWasmWorkerProtocol();
                const instantiated = await protocol.handle({id: "instantiate", type: "instantiate", bytes: new Uint8Array(fs.readFileSync(artifact)), manifest, draws: [0.1, 0.2, 0.3, 0.4]});
                if (!instantiated.ok) throw new Error(instantiated.error);
                const played = await protocol.handle({id: "play", type: "play"});
                if (!played.ok || !Array.isArray(played.result.screen)) throw new Error("installed Worker protocol did not produce a round");
                const disposed = await protocol.handle({id: "dispose", type: "dispose"});
                if (!disposed.ok) throw new Error(disposed.error);
                console.log("INSTALLED_WASM_WORKER_PROTOCOL_OK");
            `);
            expect(execFileSync("node", [workerScript], {cwd: workflowDir, encoding: "utf-8"})).toContain("INSTALLED_WASM_WORKER_PROTOCOL_OK");
            smokeResults.wasm = true;
        } finally {
            fs.rmSync(workflowDir, {recursive: true, force: true});
        }
    });

    // Studio startup targeting, against the real installed binary: which of Home / a project dashboard
    // each launch form actually ends up serving. The mode is read from /api/context, i.e. the same
    // thing the app's own landing route asks before it picks its opening screen.
    describe("Studio startup target", () => {
        let projectRoot: string;

        beforeAll(() => {
            const create = spawnSync(
                pokieBinPath,
                ["create", "--random", "--seed", "4242", "--out", "./startup-project.blueprint.json"],
                {cwd: installDir, encoding: "utf-8", timeout: 120000},
            );
            expect(create.status).toBe(0);

            const build = spawnSync(
                pokieBinPath,
                ["build", "./startup-project.blueprint.json", "--target", "tsPackage", "--out", "./startup-project"],
                {cwd: installDir, encoding: "utf-8", timeout: 120000},
            );
            expect(build.status).toBe(0);
            projectRoot = fs.realpathSync(path.join(installDir!, "startup-project"));
        });

        async function contextOf(args: string[], cwd: string): Promise<unknown> {
            // Keep argv literal: adding --no-open here would exercise option-only
            // project discovery, not the no-argument global Home contract. The
            // browser launch is best-effort; suppress Linux's desktop opener only.
            const child = await spawnSmokeChild(args, cwd, {...process.env, BROWSER: "true"});
            try {
                const port = await waitForListeningPort(child);
                return await (await fetch(`http://127.0.0.1:${port}/api/context`)).json();
            } finally {
                await stopChild(child);
            }
        }

        const headlessFlags = ["--no-open", "--port", "0"];

        smokeIt("bare `pokie` inside a project opens global Home", async () => {
            expect(await contextOf([], projectRoot)).toEqual({mode: "home"});
        });

        smokeIt("bare `pokie` from a nested project directory still opens global Home", async () => {
            const nested = path.join(projectRoot, "dist");
            expect(fs.existsSync(nested)).toBe(true);

            expect(await contextOf([], nested)).toEqual({mode: "home"});
        });

        smokeIt("`pokie` outside any project opens Home", async () => {
            // installDir has a package.json of its own, but no "pokie.entry" — not a game package.
            expect(await contextOf([], installDir!)).toEqual({mode: "home"});
        });

        smokeIt("`pokie .` opens the project it was pointed at", async () => {
            expect(await contextOf([".", ...headlessFlags], projectRoot)).toEqual({mode: "project", projectRoot});
        });

        smokeIt("`pokie <path>` opens the supplied project from elsewhere", async () => {
            expect(await contextOf([projectRoot, ...headlessFlags], installDir!)).toEqual({mode: "project", projectRoot});
        });

        smokeIt("option-only Studio startup retains current-project discovery", async () => {
            expect(await contextOf(headlessFlags, projectRoot)).toEqual({mode: "project", projectRoot});
        });

        smokeIt("opens relative/absolute WASM paths from a nested spaced cwd and reports malformed WASM without starting a package runtime", async () => {
            const cwd = path.join(installDir!, "unrelated working directory", "nested directory");
            fs.mkdirSync(cwd, {recursive: true});
            const wasmPath = path.join(installDir!, "startup game.wasm");
            expect(installedProbe("startup-wasm", `
                import fs from 'node:fs';
                import {createBlueprintWasmArtifact} from '@fromstan/pokie/wasm';
                const artifact = await createBlueprintWasmArtifact(${JSON.stringify(fractionalBetBlueprint([0.05]))});
                fs.writeFileSync(${JSON.stringify(wasmPath)}, artifact.bytes);
                fs.writeFileSync(${JSON.stringify(`${wasmPath}.pokie-wasm.json`)}, JSON.stringify(artifact.manifest));
                console.log('STARTUP_WASM_READY');
            `)).toContain("STARTUP_WASM_READY");
            const malformed = path.join(cwd, "malformed.wasm");
            fs.writeFileSync(malformed, "invalid executable");
            for (const target of [wasmPath, path.relative(cwd, wasmPath), "./malformed.wasm"]) {
                const child = await spawnSmokeChild([target, ...headlessFlags], cwd);
                try {
                    const port = await waitForListeningPort(child);
                    const base = `http://127.0.0.1:${port}`;
                    expect(await (await fetch(`${base}/api/context`)).json()).toEqual({mode: "project", projectRoot: path.resolve(cwd, target)});
                    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({status: "ok"});
                    let dashboard: {status: string; type?: string} = {status: "loading"};
                    for (let attempt = 0; attempt < 100 && dashboard.status === "loading"; attempt++) {
                        dashboard = await (await fetch(`${base}/api/project/context`)).json() as typeof dashboard;
                        if (dashboard.status === "loading") await new Promise(resolve => {
                            setTimeout(resolve, 50);
                        });
                    }
                    expect(dashboard.status).toBe(target === "./malformed.wasm" ? "error" : "loaded");
                    if (dashboard.status !== "error") expect(dashboard.type).toBe("wasm");
                    expect((await fetch(`${base}/`)).status).toBe(200);
                } finally {
                    await stopChild(child);
                }
            }
        });
    });

    for (const [flag] of [["--help"], ["-h"]]) smokeIt(`prints the general usage and the full command list for \`pokie ${flag}\`, exiting 0`, () => {
        const result = spawnSync(pokieBinPath, [flag], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Usage: pokie <command>");
        expect(result.stdout).toContain("Commands:");
        // This top-level inventory complements the native recursive help sweep above.
        for (const commandName of ["build", "certification", "client", "create", "dev", "diff", "edit", "fairness", "generate", "import", "init", "inspect", "optimize", "par", "reel", "run", "replay", "report", "sample", "serve", "sim", "validate"]) {
            expect(result.stdout).toMatch(new RegExp(`^ {2}${commandName} `, "m"));
        }
        // Storage-format namespaces stay private implementation details: their public lifecycle
        // verbs are build/generate/sample/validate/inspect/diff. Name and Studio are likewise
        // unavailable as public command names.
        for (const commandName of ["export", "outcomelibrary", "outcomesource", "stakeengine"]) {
            expect(result.stdout).not.toMatch(new RegExp(`^ {2}${commandName} `, "m"));
        }
        expect(result.stdout).not.toMatch(/^ {2}(name|studio)\b/m);
    });

    smokeIt("rejects the removed artifact command through the installed binary without output or startup", () => {
        for (const args of [["export"], ["export", "--help"], ["export", "missing.json", "--to", "outcomes", "--out", "removed-artifact"]]) {
            const result = spawnSync(pokieBinPath, args, {cwd: installDir, encoding: "utf-8", timeout: 60000});
            expect(result.status).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr.trim()).toBe('Unknown command "export". Did you mean `import`? Run `pokie import --help` for usage.');
            expect(fs.existsSync(path.join(installDir!, "removed-artifact"))).toBe(false);
        }
    });

    smokeIt("publishes and reads all six installed project types, follows automatic intermediates and rejects unsupported reconstruction", () => {
        const directory = fs.mkdtempSync(path.join(installDir!, "canonical-artifacts-"));
        const blueprintPath = path.join(directory, "source.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "canonical-smoke", name: "Canonical Smoke", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["B", "A"]],
        }));
        try {
            const sources: Record<string, string> = {blueprint: blueprintPath};
            const names = {tsPackage: "package", outcomeLibrary: "outcome", stakeAdapter: "stake", parWorkbook: "model.xlsx", wasm: "game.wasm"};
            for (const [target, name] of Object.entries(names)) {
                const destination = path.join(directory, name);
                sources[target] = destination;
                const preview = spawnSync(pokieBinPath, ["build", blueprintPath, "--target", target, "--out", destination, "--dry-run"], {cwd: directory, encoding: "utf-8"});
                expect(preview.status).toBe(0);
                expect(preview.stderr).toBe("");
                expect(fs.existsSync(destination)).toBe(false);
                const built = spawnSync(pokieBinPath, ["build", blueprintPath, "--target", target, "--out", destination], {cwd: directory, encoding: "utf-8"});
                expect(built.status).toBe(0);
                expect(built.stderr).toBe("");
                for (const command of ["inspect", "validate"]) {
                    const readback = spawnSync(pokieBinPath, [command, destination, ...(command === "validate" ? ["--format", "json"] : [])], {cwd: directory, encoding: "utf-8"});
                    expect(readback.status).toBe(0);
                    expect(readback.stderr).toBe("");
                }
            }
            for (const type of ["outcomeLibrary", "stakeAdapter", "wasm"]) {
                const output = path.join(directory, `unsupported-${type}.json`);
                const rejected = spawnSync(pokieBinPath, ["build", sources[type], "--target", "blueprint", "--out", output], {cwd: directory, encoding: "utf8", timeout: 60000});
                expect(rejected.status).toBe(1);
                expect(rejected.stderr).toMatch(/cannot|unavailable|does not preserve|unsupported|no conversion/i);
                expect(fs.existsSync(output)).toBe(false);
            }
            for (const [source, target, name] of [["parWorkbook", "wasm", "from-par.wasm"], ["tsPackage", "blueprint", "extracted.json"], ["outcomeLibrary", "outcomeLibrary", "republished-outcome"], ["stakeAdapter", "stakeAdapter", "republished-stake"]]) {
                const output = path.join(directory, name);
                const result = spawnSync(pokieBinPath, ["build", sources[source], "--target", target, "--out", output], {cwd: directory, encoding: "utf8", timeout: 60000});
                expect({source, status: result.status, stderr: result.stderr}).toEqual({source, status: 0, stderr: ""});
                expect(spawnSync(pokieBinPath, ["inspect", output], {cwd: directory, encoding: "utf8", timeout: 60000}).status).toBe(0);
            }
            const parEvidence = JSON.parse(fs.readFileSync(path.join(directory, "from-par.wasm.pokie/par-import/conversion-evidence.json"), "utf8"));
            expect(parEvidence).toMatchObject({schemaVersion: 1, sourceWorkbook: sources.parWorkbook, losslessEligible: true, provenanceHashMatches: true});
            const extractionEvidence = JSON.parse(fs.readFileSync(path.join(directory, "extracted.json.conversion-evidence.json"), "utf8"));
            expect(extractionEvidence).toMatchObject({schemaVersion: 1, kind: "package-extraction", extraction: {status: "complete"}});
            expect(installedProbe("six-native-projects", `
                import assert from 'node:assert/strict';
                import * as api from '@fromstan/pokie';
                const sources = ${JSON.stringify(sources)};
                for (const [type, source] of Object.entries(sources)) {
                    const project = await new api.ProjectTargetResolver().resolve(source);
                    assert.equal(project.type, type);
                    assert.ok(project.capabilities.length);
                    if (['outcomeLibrary', 'stakeAdapter'].includes(type)) {
                        const report = await new api.OutcomeSourceProjectAnalyzer().analyze(project);
                        assert.equal(report.issues.filter(issue => issue.severity === 'error').length, 0);
                        assert.equal(report.modes[0].analysis.rtp, 0.25);
                        assert.equal(report.modes[0].analysis.hitFrequency, 0.25);
                    }
                }
                const converted = ${JSON.stringify(path.join(directory, "from-par.wasm"))};
                const runtime = await api.loadPokieWasmFileRuntime(converted, new api.SeededPokieWasmHost('0'));
                try {
                    assert.deepEqual(runtime.manifest.component, {id: 'canonical-smoke', version: '1.0.0'});
                    const session = runtime.createSession('0');
                    const initial = session.serialize();
                    const round = await session.play({bet: 1});
                    assert.equal(round.stake, 1);
                    assert.deepEqual((await runtime.replay(initial, [{bet: 1}])).rounds, [round]);
                } finally { runtime.dispose(); }
                const extracted = api.loadGameBlueprint(${JSON.stringify(path.join(directory, "extracted.json"))});
                assert.equal(extracted.manifest.id, 'canonical-smoke');
                assert.deepEqual(extracted.reelStrips, [['A','B'],['B','A']]);
                for (const name of ['republished-outcome', 'republished-stake']) {
                    const project = await new api.ProjectTargetResolver().resolve(${JSON.stringify(directory)} + '/' + name);
                    assert.equal(project.type, name === 'republished-outcome' ? 'outcomeLibrary' : 'stakeAdapter');
                    const report = await new api.OutcomeSourceProjectAnalyzer().analyze(project);
                    assert.equal(report.issues.filter(issue => issue.severity === 'error').length, 0);
                    assert.equal(report.modes[0].analysis.rtp, 0.25);
                }
                console.log('SIX_NATIVE_TYPES_OK');
            `)).toContain("SIX_NATIVE_TYPES_OK");
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    for (const [flag] of [["--version"], ["-V"]]) smokeIt(`prints the installed version for \`pokie ${flag}\`, exiting 0`, () => {
        const result = spawnSync(pokieBinPath, [flag], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        const {version} = JSON.parse(fs.readFileSync(path.join(installDir!, "node_modules", "@fromstan", "pokie", "package.json"), "utf-8")) as {
            version: string;
        };

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(version);
        expect(result.stderr).toBe("");
    });

    smokeIt("`pokie <unrecognized command>` explains how to recover and exits 1", () => {
        const result = spawnSync(pokieBinPath, ["totally-bogus-pokie-command-xyz-12345"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toBe(
            'Unknown command "totally-bogus-pokie-command-xyz-12345". Run `pokie --help` to list commands.',
        );
    });

    smokeIt("suggests the intended command for a close top-level typo and exits 1", () => {
        const result = spawnSync(pokieBinPath, ["creat"], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toBe('Unknown command "creat". Did you mean `create`? Run `pokie create --help` for usage.');
    });

    smokeIt("reports usage and recovery text when a command is missing required input", () => {
        const result = spawnSync(pokieBinPath, ["build"], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(
            "Usage: pokie build <project> --target <artifact> [--exact | --sample <n> --seed <string>] [--out <path>] [--dry-run]",
        );
        expect(result.stderr).toContain("<project> is a path pokie resolves to a blueprint/tsPackage/outcomeLibrary");
    });

    smokeIt("scaffolds a package in place via a fully non-interactive `pokie init <directory>`, installing/building it entirely on its own -- its scaffolded \"pokie\" dependency resolves against this exact installed binary's own root during install (never the registry, never a manual rewrite), then is left with a portable version range, and it validates and simulates", () => {
        const projectRoot = path.join(installDir!, "sample-slot");
        // No --no-prepare, no --no-install, no manual package.json rewrite: "pokie init" now resolves its
        // own scaffolded "pokie" dependency against the running installation's own root (readOwnPackageRoot()
        // -- here, installDir/node_modules/@fromstan/pokie, exactly what the outer `npm install tarballPath` above
        // already installed) via the same withLocalPokieInstall mechanism Blueprint materialization uses --
        // see registerCliCommands.ts's own InitCommand wiring. Proves this works even though this dev
        // version was never published: only "pokie" itself needs that local resolution, "typescript" (a
        // real, always-available registry package) installs normally alongside it.
        const init = spawnSync(pokieBinPath, ["init", projectRoot], {cwd: installDir, encoding: "utf-8", timeout: 120000});

        expect(init.status).toBe(0);
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "index.ts"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);
        for (const file of ["README.md", "tsconfig.json", "src/index.ts"]) {
            expect(fs.statSync(path.join(projectRoot, file)).size).toBeGreaterThan(0);
        }
        expect(fs.readFileSync(path.join(projectRoot, "src/index.ts"), "utf8")).toContain('from "@fromstan/pokie"');
        expect(installedProbe("init-package-identity", `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import {createRequire} from 'node:module';
            import {loadPokieGameRuntime} from '@fromstan/pokie';
            const root = ${JSON.stringify(projectRoot)};
            const consumer = createRequire(root + '/package.json');
            const identity = consumer(consumer.resolve('@fromstan/pokie')).POKIE_VERSION;
            assert.equal(identity, '2.0.0');
            assert.ok(fs.realpathSync(consumer.resolve('@fromstan/pokie')).startsWith(${JSON.stringify(installDir!)} + '/'));
            const direct = consumer('./dist/index.js');
            const runtime = await loadPokieGameRuntime(root);
            try {
                assert.deepEqual(direct.getManifest(), {id: 'sample-slot', name: 'Sample Slot', version: '0.1.0'});
                assert.deepEqual(runtime.game.getManifest(), direct.getManifest());
                for (const game of [direct, runtime.game]) {
                    const session = game.createSession({seed: 'demo'});
                    session.setCreditsAmount(1000); session.play();
                    assert.ok(Number.isFinite(session.getWinAmount()));
                }
                console.log('INIT_NATIVE_IDENTITY_OK');
            } finally { await runtime.release(); }
        `)).toContain("INIT_NATIVE_IDENTITY_OK");

        // The transient local resolution already ran and settled by the time "pokie init" exits (this is
        // a real spawned binary, not an injected runCommand -- there's no in-process hook to observe the
        // package.json PackageCommandRunner.ts's withLocalPokieInstall writes for the duration of "npm
        // install" itself; see PackageCommandRunner.test.ts and InitCommandWorkflow.integration.test.ts
        // for that half of the contract, captured via an injected recording runCommand). What's left on
        // disk here is only ever the *persisted* half: a portable version range, never the absolute,
        // host-specific `file:` path "npm install" actually resolved against.
        const packageJsonPath = path.join(projectRoot, "package.json");
        const scaffoldedPkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {dependencies?: Record<string, string>};
        const {version: ownVersion} = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as {version: string};
        expect(scaffoldedPkg.dependencies?.["@fromstan/pokie"]).toBe(`^${ownVersion}`);
        expect(fs.existsSync(path.join(projectRoot, "node_modules", "@fromstan", "pokie", "package.json"))).toBe(true);

        const validate = spawnSync(pokieBinPath, ["validate", projectRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);

        const simFile = path.join(installDir!, "init-sim.json");
        const sim = spawnSync(pokieBinPath, ["sim", projectRoot, "--rounds", "200", "--seed", "demo", "--out", simFile], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 120000,
        });
        expect(sim.status).toBe(0);

        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as {rounds: number; seed: string; totalBet: number; totalWin: number; rtp: number; hitFrequency: number};
        expect(report.rounds).toBe(200);
        expect(report.seed).toBe("demo");
        expect(report.totalBet).toBe(200);
        expect(Number.isFinite(report.totalWin)).toBe(true);
        expect(report.rtp).toBe(report.totalWin / report.totalBet);
        expect(report.hitFrequency).toBeGreaterThanOrEqual(0);
        expect(report.hitFrequency).toBeLessThanOrEqual(1);
        const markdown = path.join(installDir!, "init-report.md");
        const rendered = spawnSync(pokieBinPath, ["report", simFile, "--format", "markdown", "--out", markdown], {cwd: installDir, encoding: "utf8", timeout: 60000});
        expect(rendered.status).toBe(0);
        expect(fs.readFileSync(markdown, "utf8")).toContain("RTP");
        const replay = path.join(installDir!, "init-replay.json");
        expect(spawnSync(pokieBinPath, ["replay", projectRoot, "--round", "2", "--seed", "demo", "--out", replay], {cwd: installDir, encoding: "utf8", timeout: 60000}).status).toBe(0);
        expect(installedProbe("init-replay-agreement", `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import {loadPokieGameRuntime, ReplayRecorder} from '@fromstan/pokie';
            const recorded = JSON.parse(fs.readFileSync(${JSON.stringify(replay)}, 'utf8'));
            const runtime = await loadPokieGameRuntime(${JSON.stringify(projectRoot)});
            try {
                const rebuilt = new ReplayRecorder().record({game: runtime.game, seed: 'demo', round: 2});
                for (const field of ['game', 'seed', 'round', 'screen', 'totalBet', 'totalWin']) assert.deepEqual(recorded[field], rebuilt[field]);
                console.log('INIT_NATIVE_REPLAY_OK');
            } finally { await runtime.release(); }
        `)).toContain("INIT_NATIVE_REPLAY_OK");
    });

    function readPackageLockPackages(packageRoot: string): Record<string, unknown> {
        const lock = JSON.parse(fs.readFileSync(path.join(packageRoot, "package-lock.json"), "utf-8")) as {
            packages?: Record<string, unknown>;
        };
        return lock.packages ?? {};
    }

    // Reinstall portable authored metadata against the exact same unpublished archive.
    smokeIt("reinstalls the initialized package at a new location against the same candidate archive without checkout overrides or persisted metadata rewrites", () => {
        const sourceRoot = path.join(installDir!, "sample-slot");
        const reinstalledRoot = path.join(installDir!, "sample-slot-reinstalled");
        for (const relativeFile of [
            "package.json",
            "package-lock.json",
            "tsconfig.json",
            path.join("src", "index.ts"),
            path.join("dist", "index.js"),
        ]) {
            const destination = path.join(reinstalledRoot, relativeFile);
            fs.mkdirSync(path.dirname(destination), {recursive: true});
            fs.copyFileSync(path.join(sourceRoot, relativeFile), destination);
        }
        expect(fs.existsSync(path.join(reinstalledRoot, "node_modules"))).toBe(false);

        const lockPackagesBeforeReinstall = readPackageLockPackages(reinstalledRoot);
        expect(lockPackagesBeforeReinstall["node_modules/@fromstan/pokie"]).toBeUndefined();
        for (const key of Object.keys(lockPackagesBeforeReinstall)) {
            expect(key).not.toContain(installDir!);
        }

        const portableFiles = ["package.json", "package-lock.json"].map(file => fs.readFileSync(path.join(reinstalledRoot, file)));
        // An unpublished candidate is selected explicitly for this install. --no-save and
        // --package-lock=false retain the portable authored metadata without a checkout override.
        execFileSync("npm", ["install", "--no-save", "--package-lock=false", "--no-audit", "--no-fund", tarballPath!], {cwd: reinstalledRoot, encoding: "utf8", timeout: 120000});
        for (const [index, file] of ["package.json", "package-lock.json"].entries()) expect(fs.readFileSync(path.join(reinstalledRoot, file))).toEqual(portableFiles[index]);
        expect(fs.lstatSync(path.join(reinstalledRoot, "node_modules/@fromstan/pokie")).isSymbolicLink()).toBe(false);

        expect(fs.existsSync(path.join(reinstalledRoot, "node_modules", "@fromstan", "pokie", "package.json"))).toBe(true);

        const pkgAfterReinstall = JSON.parse(fs.readFileSync(path.join(reinstalledRoot, "package.json"), "utf-8")) as {
            dependencies?: Record<string, string>;
        };
        expect(pkgAfterReinstall.dependencies?.["@fromstan/pokie"]).not.toMatch(/^file:/);
        expect(pkgAfterReinstall.dependencies?.["@fromstan/pokie"]).not.toContain(installDir!);

        const lockPackagesAfterReinstall = readPackageLockPackages(reinstalledRoot);
        expect(lockPackagesAfterReinstall["node_modules/@fromstan/pokie"]).toBeUndefined();
        for (const key of Object.keys(lockPackagesAfterReinstall)) {
            expect(key).not.toContain(installDir!);
        }

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const game = require(path.join(reinstalledRoot, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(game.getManifest().id).toBeDefined();

        const validate = spawnSync(pokieBinPath, ["validate", reinstalledRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);
    });

    // Real "npm install" resolves a `file:` spec as a symlink, recording it in package-lock.json as its
    // own absolute-host-tied "link": true entry (see PackageCommandRunner.ts's own doc comment on
    // stripLocalPokieLockEntries) -- checked here against the real lockfile a real spawned "pokie init"
    // (above) actually wrote, not just the hand-reproduced shape PackageCommandRunner.test.ts's own unit
    // coverage exercises.
    smokeIt("moves the initialized package (with its already-resolved node_modules) to a new location and still loads/validates there without ever running npm install again -- proving the persisted package.json AND package-lock.json carry no absolute path back to where it was installed", () => {
        const sourceRoot = path.join(installDir!, "sample-slot");
        const movedRoot = path.join(installDir!, "sample-slot-moved");
        fs.renameSync(sourceRoot, movedRoot);

        const movedPkg = JSON.parse(fs.readFileSync(path.join(movedRoot, "package.json"), "utf-8")) as {
            dependencies?: Record<string, string>;
        };
        expect(movedPkg.dependencies?.["@fromstan/pokie"]).not.toMatch(/^file:/);
        expect(movedPkg.dependencies?.["@fromstan/pokie"]).not.toContain(installDir!);

        const movedLockPackages = readPackageLockPackages(movedRoot);
        expect(movedLockPackages["node_modules/@fromstan/pokie"]).toBeUndefined();
        for (const key of Object.keys(movedLockPackages)) {
            expect(key).not.toContain(installDir!);
        }

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const game = require(path.join(movedRoot, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(game.getManifest().id).toBeDefined();

        const validate = spawnSync(pokieBinPath, ["validate", movedRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);
    });

    smokeIt("runs the public outcome-library lifecycle against a package built by the installed binary itself", () => {
        // Same small, hand-computable, exactly-enumerable blueprint as
        // tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts's own finiteBlueprint(): 2 reels of
        // 3/2 stops, no stateful mechanics, so "generate" resolves the exact strategy without --bounded.
        const blueprintPath = path.join(installDir!, "outcomelibrary-blueprint.json");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "packed-outcomelibrary-slot", name: "Packed Outcomelibrary Slot", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 5}},
                reelStrips: [
                    ["A", "A", "B"],
                    ["A", "B"],
                ],
            }),
        );
        const packageRoot = path.join(installDir!, "outcomelibrary-pkg");
        const build = spawnSync(pokieBinPath, ["build", blueprintPath, "--target", "tsPackage", "--out", packageRoot], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(build.status).toBe(0);

        const libraryFile = path.join(installDir!, "outcomelibrary-base.json");
        const generate = spawnSync(pokieBinPath, ["generate", packageRoot, "--stake", "1", "--out", libraryFile, "--format", "json"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(generate.status).toBe(0);

        const library = JSON.parse(fs.readFileSync(libraryFile, "utf-8")) as {outcomes: Array<{weight: number}>};
        expect(library.outcomes).toHaveLength(4);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);

        const bundleDir = path.join(installDir!, "outcomelibrary-bundle");
        const bundleBuild = spawnSync(pokieBinPath, ["build", packageRoot, "--target", "outcomeLibrary", "--out", bundleDir], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(bundleBuild.status).toBe(0);

        const bundleValidate = spawnSync(pokieBinPath, ["validate", bundleDir, "--deep"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(bundleValidate.status).toBe(0);

        const inspect = spawnSync(pokieBinPath, ["inspect", bundleDir], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(inspect.status).toBe(0);

        const sample = spawnSync(pokieBinPath, ["sample", bundleDir, "--mode", "base", "--seed", "packed-source-seed"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(sample.status).toBe(0);
    });

    smokeIt("runs a data-driven, artifact-producing workflow for every public command and nested verb from the installed binary", async () => {
        // This is intentionally not another recursive-help assertion.  Each row below is a command the
        // tarball-installed executable actually runs with a concrete input, expected exit status, and a
        // produced/consumed artifact (or, for the non-interactive edit boundary, its actionable recovery).
        // Keep the list explicit: adding a public command or verb must add a meaningful clean-room workflow.
        const workflowRoot = fs.mkdtempSync(path.join(installDir!, "all-public-workflows-"));
        const blueprintPath = path.join(workflowRoot, "workflow.blueprint.json");
        const packageRoot = path.join(workflowRoot, "workflow-package");
        const libraryPath = path.join(workflowRoot, "workflow-library.json");
        const bundlePath = path.join(workflowRoot, "workflow-bundle");
        const simPath = path.join(workflowRoot, "workflow-sim.json");
        const comparisonSimPath = path.join(workflowRoot, "workflow-sim-comparison.json");
        const workflowIds: string[] = [];
        const exercisedPublicWorkflows = new Set<string>();

        const run = (id: string, args: string[], expectedStatus = 0): ReturnType<typeof spawnSync> => {
            const result = spawnSync(pokieBinPath, args, {cwd: workflowRoot, encoding: "utf-8", timeout: 120000});
            workflowIds.push(id);
            const nestedVerb = args.slice(0, 2).join(" ");
            exercisedPublicWorkflows.add(PACKAGED_PUBLIC_WORKFLOW_SCENARIOS.includes(nestedVerb as typeof PACKAGED_PUBLIC_WORKFLOW_SCENARIOS[number]) ? nestedVerb : args[0]);
            expect(result.error).toBeUndefined();
            expect(result.status).toBe(expectedStatus);
            return result;
        };
        const expectFile = (filePath: string): void => expect(fs.existsSync(filePath)).toBe(true);
        const expectDirectory = (directoryPath: string): void => expect(fs.statSync(directoryPath).isDirectory()).toBe(true);
        const runListeningWorkflow = async (id: string, args: string[], assertion: (baseUrl: string) => Promise<void>): Promise<void> => {
            const child = await spawnSmokeChild(args, workflowRoot);
            workflowIds.push(id);
            exercisedPublicWorkflows.add(args[0]);
            try {
                const port = await waitForListeningPort(child);
                await assertion(`http://127.0.0.1:${port}`);
                expect(child.exitCode).toBeNull();
            } finally {
                await stopChild(child);
            }
        };

        try {
            // Use a deliberately tiny source so every generated/consumed artifact is fast and inspectable.
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "packed-workflow-slot", name: "Packed Workflow Slot", version: "1.0.0"},
                    reels: 2,
                    rows: 1,
                    symbols: ["A", "B"],
                    paytable: {A: {2: 5}},
                    reelStrips: [["A", "A", "B"], ["A", "B"]],
                }),
            );

            const createdBlueprintPath = path.join(workflowRoot, "created.blueprint.json");
            run("create", ["create", "Packed Workflow", "--random", "--seed", "71", "--out", createdBlueprintPath]);
            expectFile(createdBlueprintPath);
            run("validate", ["validate", createdBlueprintPath, "--format", "json"]);

            run("build", ["build", blueprintPath, "--target", "tsPackage", "--out", packageRoot]);
            expectDirectory(packageRoot);
            run("generate", ["generate", packageRoot, "--stake", "1", "--out", libraryPath, "--format", "json"]);
            expectFile(libraryPath);
            run("build-outcome-library", ["build", packageRoot, "--target", "outcomeLibrary", "--out", bundlePath]);
            expectDirectory(bundlePath);
            run("inspect", ["inspect", bundlePath]);
            run("sample", ["sample", bundlePath, "--mode", "base", "--seed", "workflow-seed"]);

            run("sim", ["sim", packageRoot, "--rounds", "40", "--seed", "workflow-seed", "--out", simPath, "--format", "json"]);
            expectFile(simPath);
            run("sim-comparison", ["sim", packageRoot, "--rounds", "40", "--seed", "comparison-seed", "--out", comparisonSimPath, "--format", "json"]);
            expectFile(comparisonSimPath);
            const reportPath = path.join(workflowRoot, "workflow-report.md");
            run("report", ["report", simPath, "--format", "markdown", "--out", reportPath]);
            expectFile(reportPath);
            const diffPath = path.join(workflowRoot, "workflow-diff.json");
            run("diff", ["diff", simPath, comparisonSimPath, "--format", "json", "--out", diffPath]);
            expectFile(diffPath);
            const replayPath = path.join(workflowRoot, "workflow-replay.json");
            run("replay", ["replay", packageRoot, "--round", "1", "--seed", "workflow-seed", "--out", replayPath]);
            expectFile(replayPath);

            const wasmSourcePath = path.join(workflowRoot, "wasm-source.blueprint.json");
            const wasmPath = path.join(workflowRoot, "workflow.wasm");
            fs.writeFileSync(wasmSourcePath, JSON.stringify({
                manifest: {id: "workflow-wasm", name: "Workflow WASM", version: "1.0.0"},
                reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["B", "A"]],
            }));
            run("build-wasm", ["build", wasmSourcePath, "--target", "wasm", "--out", wasmPath]);
            expectFile(wasmPath);
            expect(run("run", ["run", wasmPath, "--seed", "workflow-wasm"]).stdout).toContain("POKIE WASM round 1");

            const workbookPath = path.join(workflowRoot, "workflow.par.xlsx");
            run("par export", ["par", "export", blueprintPath, "--out", workbookPath]);
            expectFile(workbookPath);
            const parImportedPath = path.join(workflowRoot, "par-imported.blueprint.json");
            run("par import", ["par", "import", workbookPath, "--out", parImportedPath, "--format", "json"]);
            expectFile(parImportedPath);
            const exportedWorkbookPath = path.join(workflowRoot, "exported.par.xlsx");
            run("build-par-workbook", ["build", blueprintPath, "--target", "parWorkbook", "--out", exportedWorkbookPath]);
            expectFile(exportedWorkbookPath);
            const importedBlueprintPath = path.join(workflowRoot, "imported.blueprint.json");
            run("import", ["import", exportedWorkbookPath, "--out", importedBlueprintPath, "--format", "json"]);
            expectFile(importedBlueprintPath);

            const reelBlueprintPath = path.join(workflowRoot, "generated-reels.blueprint.json");
            fs.writeFileSync(
                reelBlueprintPath,
                JSON.stringify({
                    manifest: {id: "packed-generated-reels", name: "Packed Generated Reels", version: "1.0.0"},
                    reels: 2,
                    rows: 1,
                    symbols: ["A", "B"],
                    paytable: {A: {2: 5}},
                    reelStripGeneration: [
                        {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 1},
                        {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 2},
                    ],
                }),
            );
            const reelOutputPath = path.join(workflowRoot, "generated-reels-output.blueprint.json");
            run("reel generate", ["reel", "generate", reelBlueprintPath, "--apply", "--out", reelOutputPath, "--format", "json"]);
            expectFile(reelOutputPath);

            const seedPath = path.join(workflowRoot, "server-seed.txt");
            const seedCommitmentPath = path.join(workflowRoot, "server-seed-commitment.json");
            const commitmentPath = path.join(workflowRoot, "round-commitment.json");
            const proofPath = path.join(workflowRoot, "round-proof.json");
            fs.writeFileSync(seedPath, "packed-workflow-server-seed\n");
            run("fairness seed-commit", ["fairness", "seed-commit", seedPath, "--out", seedCommitmentPath]);
            expectFile(seedCommitmentPath);
            run("fairness commit", ["fairness", "commit", seedCommitmentPath, "--client-seed", "workflow-client", "--nonce", "0", "--source", bundlePath, "--mode", "base", "--out", commitmentPath]);
            expectFile(commitmentPath);
            run("fairness reveal", ["fairness", "reveal", commitmentPath, "--server-seed", seedPath, "--source", bundlePath, "--out", proofPath]);
            expectFile(proofPath);
            run("fairness verify", ["fairness", "verify", proofPath, "--commitment", commitmentPath, "--source", bundlePath]);

            const certificationConfigPath = path.join(workflowRoot, "certification-config.json");
            const certificationPath = path.join(workflowRoot, "certification");
            fs.writeFileSync(certificationConfigPath, JSON.stringify({modes: [{modeName: "base", seed: "cert-seed", sampleCount: 4}]}));
            run("certification build", ["certification", "build", bundlePath, certificationConfigPath, "--out", certificationPath]);
            expectDirectory(certificationPath);
            run("certification verify", ["certification", "verify", certificationPath, "--source", bundlePath]);

            const initializedRoot = path.join(workflowRoot, "initialized");
            run("init", ["init", initializedRoot, "--no-install", "--no-prepare"]);
            expectFile(path.join(initializedRoot, "package.json"));
            const edit = run("edit-noninteractive-recovery", ["edit", blueprintPath, "--out", path.join(workflowRoot, "edited.blueprint.json")], 1);
            expect(`${edit.stdout}\n${edit.stderr}`).toMatch(/terminal|interactive|JSON/i);
            const invalidPolicy = path.join(workflowRoot, "invalid-policy.json");
            fs.writeFileSync(invalidPolicy, "{}");
            const optimize = run("optimize-invalid-policy", ["optimize", blueprintPath, "--policy", invalidPolicy], 3);
            expect(JSON.parse(String(optimize.stdout))).toMatchObject({status: "invalid"});
            for (const parent of ["certification", "fairness", "par", "reel"]) {
                const missingVerb = run(`${parent}-missing-verb-recovery`, [parent], 1);
                expect(`${missingVerb.stdout}\n${missingVerb.stderr}`).toContain("Usage:");
            }

            await runListeningWorkflow("client", ["client", packageRoot, "--port", "0", "--no-open"], async (baseUrl) => {
                expect((await fetch(`${baseUrl}/`)).status).toBe(200);
            });
            await runListeningWorkflow("serve", ["serve", packageRoot, "--port", "0"], async (baseUrl) => {
                expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
            });
            await runListeningWorkflow("dev", ["dev", packageRoot, "--port", "0", "--client-port", "0", "--no-open"], async (baseUrl) => {
                expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
            });

            expect(workflowIds).toEqual([
                "create", "validate", "build", "generate", "build-outcome-library", "inspect", "sample", "sim", "sim-comparison", "report", "diff", "replay", "build-wasm", "run",
                "par export", "par import", "build-par-workbook", "import", "reel generate", "fairness seed-commit", "fairness commit", "fairness reveal", "fairness verify",
                "certification build", "certification verify", "init", "edit-noninteractive-recovery", "optimize-invalid-policy", "certification-missing-verb-recovery", "fairness-missing-verb-recovery",
                "par-missing-verb-recovery", "reel-missing-verb-recovery", "client", "serve", "dev",
            ]);
            expect([...exercisedPublicWorkflows].sort()).toEqual([...PACKAGED_PUBLIC_WORKFLOW_SCENARIOS].sort());
        } finally {
            fs.rmSync(workflowRoot, {recursive: true, force: true});
        }
    });

    // A "pokie build" package (GamePackageGenerator's canonical output) carries none of the
    // pre-migration provenance (embedded blueprint, build-info.json, src/generated nesting -- see
    // GamePackageGenerator's own doc comment) that the older format used to write directly into the
    // package. Running a real `npm pack` against one proves that contract at the one boundary that
    // actually matters to a consumer: what a real `npm publish` would ship, not just what's on disk.
    smokeIt("`npm pack`s a package built by the installed binary itself: ships the canonical runtime/source files, nothing from the pre-migration build-info/blueprint/src-generated format", () => {
        const blueprintPath = path.join(installDir!, "npm-pack-built-package.blueprint.json");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "npm-pack-built-package", name: "Npm Pack Built Package", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                reelStrips: [
                    ["A", "A", "B"],
                    ["A", "A", "B"],
                    ["A", "A", "B"],
                ],
            }),
        );
        const packageRoot = path.join(installDir!, "npm-pack-built-package");
        const build = spawnSync(pokieBinPath, ["build", blueprintPath, "--target", "tsPackage", "--out", packageRoot], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(build.status).toBe(0);

        // --dry-run: proves what would ship without actually writing/cleaning up a tarball. This built
        // package's own scripts (build/start/server/client) never include prepack/postpack/prepare, so
        // --ignore-scripts changes nothing here -- kept anyway, matching this file's own real-tarball
        // pack above, so packing this package can never run its "build" script a second time.
        const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
            cwd: packageRoot,
            encoding: "utf-8",
        });
        const [{files}] = JSON.parse(packOutput) as Array<{files: Array<{path: string}>}>;
        const packedPaths = files.map((file) => file.path);

        // package-lock.json is deliberately not asserted here -- npm's own default pack rules always
        // exclude it (see npm-packlist's strict default rules), regardless of anything this package
        // itself does.
        for (const canonicalFile of BUILT_PACKAGE_FILES.filter((file) => file !== "package-lock.json")) {
            expect(packedPaths).toContain(canonicalFile);
        }
        for (const packedPath of packedPaths) {
            expect(packedPath).not.toMatch(/^src\/generated\//);
            expect(packedPath.toLowerCase()).not.toContain("build-info");
            expect(packedPath.toLowerCase()).not.toContain("blueprint");
        }
    });
});

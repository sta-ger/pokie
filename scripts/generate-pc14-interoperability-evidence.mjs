#!/usr/bin/env node
// PC-14 is completed evidence. Re-run its published runners in a private,
// provenance-bound checkout and compare their raw output without ever writing
// the completed evidence directory.
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
const publishedPc14LockfileSha256 = "sha256:755c40dc3a866cc206cd2548b151c1de8e96b102b4bee8aac5682ffaed1fef54";
// The published runner writes its package locator into one generated identity.
// A private mount gives the historical source the locator it originally owned;
// it is never a host checkout supplied by the successor.
const publishedPc14RuntimePackageIdentity = "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-14-20260830075634";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];

function run(command, arguments_, options) {
    const result = spawnSync(command, arguments_, options);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`PC-14 evidence guard command failed: ${command} ${arguments_.join(" ")}`);
    return result;
}

function sha256(bytes) {
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readImmutableEvidenceSnapshot() {
    return new Map(committedFiles.map((file) => [file, readFileSync(path.join(evidenceDirectory, file))]));
}

function assertImmutableEvidenceWasNotRewritten(snapshot) {
    for (const file of committedFiles) {
        if (!readFileSync(path.join(evidenceDirectory, file)).equals(snapshot.get(file))) {
            throw new Error(`PC-14 immutable evidence was rewritten while verifying it: ${file}.`);
        }
    }
}

/** Reject a proposed output whose raw bytes, including provenance, drift. */
export function assertFreshEvidenceMatchesImmutable(freshEvidenceDirectory, ...provenanceSubstitutes) {
    if (provenanceSubstitutes.length > 0) {
        throw new Error("PC-14 evidence provenance is fixed; callers cannot substitute the immutable evidence directory.");
    }
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(freshEvidenceDirectory, file));
        const immutable = readFileSync(path.join(evidenceDirectory, file));
        if (!fresh.equals(immutable)) {
            throw new Error(`PC-14 immutable evidence is not reproducible: fresh ${file} differs byte-for-byte from the immutable result.`);
        }
    }
}

function assertImmutableEvidenceMatchesPublishedRevision() {
    for (const file of committedFiles) {
        const immutable = readFileSync(path.join(evidenceDirectory, file));
        const published = run("git", ["show", `${publishedPc14Revision}:docs/evidence/phase7-product-coherence/pc-14-artifact-torture/${file}`], {
            cwd: repositoryRoot,
            encoding: "buffer",
        }).stdout;
        if (!immutable.equals(published)) throw new Error(`PC-14 immutable evidence was modified: ${file} differs byte-for-byte from its published result.`);
    }
}

function assertPublishedLockfile(historicalRoot) {
    const historicalLockfile = readFileSync(path.join(historicalRoot, "package-lock.json"));
    const publishedLockfile = run("git", ["show", `${publishedPc14Revision}:package-lock.json`], {cwd: repositoryRoot, encoding: "buffer"}).stdout;
    if (!historicalLockfile.equals(publishedLockfile) || sha256(historicalLockfile) !== publishedPc14LockfileSha256) {
        throw new Error("PC-14 historical dependency lockfile does not match the published PC-14 lockfile.");
    }
}

function installHistoricalDependencies(historicalRoot, npmCacheDirectory) {
    const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
    if (!existsSync(npmCli)) throw new Error("PC-14 verification requires the Node-bundled npm CLI.");
    assertPublishedLockfile(historicalRoot);
    run(process.execPath, [npmCli, "ci", "--no-audit", "--no-fund", "--prefer-offline", "--cache", npmCacheDirectory], {
        cwd: historicalRoot,
        stdio: "inherit",
    });
    assertPublishedLockfile(historicalRoot);
    process.stdout.write(`PC-14 installed the published lockfile dependency graph (${publishedPc14LockfileSha256}).\n`);
}

function writeHistoricalJestGuardConfig(historicalRoot) {
    const configPath = path.join(historicalRoot, ".pc14-evidence-guard.jest.config.mjs");
    writeFileSync(configPath, [
        'import config from "./jest.config.mjs";',
        "export default {...config, projects: config.projects.map((project) => project.displayName === \"studio-client-components\" ? {...project, moduleNameMapper: {\"^pokie$\": \"<rootDir>/src/index.ts\", ...project.moduleNameMapper}} : project)};",
        "",
    ].join("\n"));
    return configPath;
}

function historicalSandboxArguments(historicalRoot, commandArguments) {
    const identityParts = publishedPc14RuntimePackageIdentity.split(path.sep).filter(Boolean);
    const identityDirectories = [];
    let current = "";
    for (const part of identityParts.slice(0, -1)) {
        current = `${current}/${part}`;
        identityDirectories.push(current);
    }
    const nodeRuntimeDirectory = path.dirname(process.execPath);
    const nodeRuntimeDirectories = [];
    current = "";
    for (const part of nodeRuntimeDirectory.split(path.sep).filter(Boolean).slice(0, -1)) {
        current = `${current}/${part}`;
        if (!identityDirectories.includes(current)) nodeRuntimeDirectories.push(current);
    }
    return [
        "--die-with-parent", "--tmpfs", "/", "--proc", "/proc", "--dev", "/dev",
        "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64", "--ro-bind", "/etc", "/etc",
        ...identityDirectories.flatMap((directory) => ["--dir", directory]),
        ...nodeRuntimeDirectories.flatMap((directory) => ["--dir", directory]),
        "--ro-bind", nodeRuntimeDirectory, nodeRuntimeDirectory,
        "--bind", historicalRoot, publishedPc14RuntimePackageIdentity,
        "--tmpfs", "/tmp", "--chdir", publishedPc14RuntimePackageIdentity,
        process.execPath, ...commandArguments,
    ];
}

function runHistoricalRunner(historicalRoot, guardConfigPath, testPath, environment) {
    const historicalJestPath = path.join(publishedPc14RuntimePackageIdentity, "node_modules", "jest", "bin", "jest.js");
    const historicalConfigPath = path.join(publishedPc14RuntimePackageIdentity, path.basename(guardConfigPath));
    run("bwrap", historicalSandboxArguments(historicalRoot, [
        "--experimental-vm-modules", "--max-old-space-size=1408", historicalJestPath,
        "--runInBand", "--no-cache", "--config", historicalConfigPath, "--runTestsByPath", testPath,
    ]), {cwd: historicalRoot, env: environment, stdio: "inherit"});
}

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});
    assertImmutableEvidenceMatchesPublishedRevision();
    const immutableEvidenceSnapshot = readImmutableEvidenceSnapshot();
    const executionDirectory = mkdtempSync(path.join(os.tmpdir(), "pokie-pc14-evidence-"));
    const historicalRoot = path.join(executionDirectory, "historical-pc14");
    let historicalWorktreeCreated = false;
    try {
        run("git", ["worktree", "add", "--detach", historicalRoot, publishedPc14Revision], {cwd: repositoryRoot, stdio: "inherit"});
        historicalWorktreeCreated = true;
        installHistoricalDependencies(historicalRoot, path.join(executionDirectory, "npm-cache"));
        const freshOutputDirectory = path.join(historicalRoot, ".pc14-evidence-guard-output");
        const historicalTemporaryDirectory = path.join(historicalRoot, "node_modules", ".cache", "pokie-tmp");
        mkdirSync(freshOutputDirectory);
        mkdirSync(historicalTemporaryDirectory, {recursive: true});
        const guardConfigPath = writeHistoricalJestGuardConfig(historicalRoot);
        const historicalOutputDirectory = path.join(publishedPc14RuntimePackageIdentity, path.basename(freshOutputDirectory));
        const historicalTemporaryPath = path.join(publishedPc14RuntimePackageIdentity, "node_modules", ".cache", "pokie-tmp");
        const environment = {
            ...process.env,
            TMPDIR: historicalTemporaryPath,
            PC14_FIXED_RUNNER_CLOCK: "2024-01-02T03:04:05.000Z",
            PC14_FIXED_RUNNER_IDENTITY: "pc14-fixed-runner",
            PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR: historicalOutputDirectory,
            PC14_INTEROPERABILITY_PERSISTED_RESULT: path.join(historicalOutputDirectory, "interoperability-result.json"),
        };
        process.stdout.write("PC-14 verifying historical CLI, Studio API, and Studio UI runners in published order.\n");
        runHistoricalRunner(historicalRoot, guardConfigPath, "tests/cli/ArtifactInteroperabilityTorture.integration.test.ts", environment);
        runHistoricalRunner(historicalRoot, guardConfigPath, "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts", environment);
        runHistoricalRunner(historicalRoot, guardConfigPath, "tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx", environment);
        assertFreshEvidenceMatchesImmutable(freshOutputDirectory);
        assertImmutableEvidenceMatchesPublishedRevision();
        process.stdout.write("PC-14 byte-compared four fresh runner outputs with immutable evidence.\n");
        process.stdout.write(`PASS PC-14 historical runners reproduced immutable evidence from ${publishedPc14Revision}.\n`);
    } finally {
        try {
            assertImmutableEvidenceWasNotRewritten(immutableEvidenceSnapshot);
        } finally {
            if (historicalWorktreeCreated) run("git", ["worktree", "remove", "--force", historicalRoot], {cwd: repositoryRoot, stdio: "inherit"});
            rmSync(executionDirectory, {recursive: true, force: true});
        }
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();

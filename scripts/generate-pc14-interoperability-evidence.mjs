#!/usr/bin/env node
// PC-14 is completed evidence. Verify it with the published PC-14 driver,
// whose fixed runner inputs are part of the evidence contract.
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
// PC-14's package writer records its runtime-package symlink literally in
// the artifact identity.  Materialise the published source at that *virtual*
// path inside a private mount namespace; it is an identity fixture, never a
// pre-existing worktree supplied by the host.
const publishedPc14RuntimePackageIdentity = "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-14-20260830075634";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];

function run(command, arguments_, options) {
    const result = spawnSync(command, arguments_, options);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`PC-14 verification command failed: ${command} ${arguments_.join(" ")}`);
    return result;
}

function installHistoricalInputs(historicalRoot) {
    const configPath = path.join(historicalRoot, "jest.config.mjs");
    const config = readFileSync(configPath, "utf-8");
    const mapper = "const studioClientComponentsModuleNameMapper = {";
    if (!config.includes(mapper)) throw new Error("Published PC-14 Studio resolver declaration is unavailable.");
    writeFileSync(configPath, config.replace(mapper, `${mapper}\n    "^pokie$": "<rootDir>/src/index.ts",`));
}

function installHistoricalDependencies(historicalRoot) {
    const installedDependencies = path.join(repositoryRoot, "node_modules");
    if (!existsSync(installedDependencies)) throw new Error("PC-14 verification requires the clone-installed node_modules directory.");
    const historicalDependencies = path.join(historicalRoot, "node_modules");
    mkdirSync(historicalDependencies);
    for (const entry of readdirSync(installedDependencies)) {
        if (entry === ".cache") continue;
        const source = path.join(installedDependencies, entry);
        const target = path.join(historicalDependencies, entry);
        if (entry === ".bin") symlinkSync(source, target, "dir");
        else run("cp", ["-a", source, target], {cwd: historicalRoot});
    }
}

export function assertFreshEvidenceMatchesImmutable(freshEvidenceDirectory, immutableEvidenceDirectory = evidenceDirectory) {
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(freshEvidenceDirectory, file));
        const immutable = readFileSync(path.join(immutableEvidenceDirectory, file));
        if (!fresh.equals(immutable)) {
            throw new Error(`PC-14 immutable evidence is not reproducible: fresh ${file} differs byte-for-byte from the immutable result.`);
        }
    }
}

function historicalSandboxArguments(historicalRoot) {
    const identityParts = publishedPc14RuntimePackageIdentity.split(path.sep).filter(Boolean);
    const identityDirectories = [];
    let current = "";
    for (const part of identityParts.slice(0, -1)) {
        current = `${current}/${part}`;
        identityDirectories.push(current);
    }
    const nodeRuntimeDirectory = path.dirname(process.execPath);
    const nodeRuntimeParts = nodeRuntimeDirectory.split(path.sep).filter(Boolean);
    const nodeRuntimeDirectories = [];
    current = "";
    for (const part of nodeRuntimeParts.slice(0, -1)) {
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
        process.execPath, path.join(publishedPc14RuntimePackageIdentity, "scripts", "generate-pc14-interoperability-evidence.mjs"), "--write",
    ];
}

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});
    const executionDirectory = mkdtempSync(path.join(process.platform === "win32" ? os.tmpdir() : "/tmp", "pokie-pc14-evidence-"));
    const historicalRoot = path.join(executionDirectory, "historical-pc14");
    let historicalWorktreeCreated = false;
    try {
        run("git", ["worktree", "add", "--detach", historicalRoot, publishedPc14Revision], {cwd: repositoryRoot, stdio: "inherit"});
        historicalWorktreeCreated = true;
        installHistoricalInputs(historicalRoot);
        installHistoricalDependencies(historicalRoot);
        process.stdout.write("PC-14 verifying historical CLI, Studio API, and Studio UI runners in published order.\n");
        run("bwrap", historicalSandboxArguments(historicalRoot), {
            cwd: historicalRoot,
            env: {...process.env, PC14_INTEROPERABILITY_REGENERATION_CHILD: "1"},
            stdio: "inherit",
        });
        assertFreshEvidenceMatchesImmutable(path.join(historicalRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture"));
        process.stdout.write("PC-14 byte-compared four fresh runner outputs with immutable evidence.\n");
        process.stdout.write(`PASS PC-14 historical runners reproduced immutable evidence from ${publishedPc14Revision}.\n`);
    } finally {
        if (historicalWorktreeCreated) run("git", ["worktree", "remove", "--force", historicalRoot], {cwd: repositoryRoot, stdio: "inherit"});
        rmSync(executionDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();

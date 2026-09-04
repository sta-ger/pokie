#!/usr/bin/env node
// PC-14 is completed evidence. Verify it with the published PC-14 driver,
// whose fixed runner inputs are part of the evidence contract.
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
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
// PC-14's package writer records its runtime-package symlink literally in
// the artifact identity. This is the published worktree *name*, not a host
// path. Materialise the disposable source at its sibling virtual location in
// a private mount namespace, so the verifier never consults a retained PC-14
// checkout while retaining the provenance that the published output records.
const publishedPc14RuntimePackageWorktreeName = "task_PC-14-20260830075634";
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

function sha256(bytes) {
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

export function assertFreshEvidenceMatchesImmutable(freshEvidenceDirectory, immutableEvidenceDirectory = evidenceDirectory) {
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(freshEvidenceDirectory, file));
        const immutable = readFileSync(path.join(immutableEvidenceDirectory, file));
        if (!fresh.equals(immutable)) {
            let differingByte = 0;
            while (differingByte < fresh.length && differingByte < immutable.length && fresh[differingByte] === immutable[differingByte]) differingByte += 1;
            const freshContext = fresh.subarray(differingByte, differingByte + 160).toString("utf-8");
            const immutableContext = immutable.subarray(differingByte, differingByte + 160).toString("utf-8");
            throw new Error(`PC-14 immutable evidence is not reproducible: fresh ${file} differs byte-for-byte from the immutable result at byte ${differingByte}; fresh=${JSON.stringify(freshContext)} immutable=${JSON.stringify(immutableContext)}.`);
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

function publishedPc14RuntimePackageIdentity() {
    return path.join(path.dirname(repositoryRoot), publishedPc14RuntimePackageWorktreeName);
}

function historicalSandboxArguments(historicalRoot, runtimePackageIdentity) {
    const identityParts = runtimePackageIdentity.split(path.sep).filter(Boolean);
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
        "--bind", historicalRoot, runtimePackageIdentity,
        "--tmpfs", "/tmp", "--chdir", runtimePackageIdentity,
        process.execPath, path.join(runtimePackageIdentity, "scripts", "generate-pc14-interoperability-evidence.mjs"), "--write",
    ];
}

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});
    assertImmutableEvidenceMatchesPublishedRevision();
    const executionDirectory = mkdtempSync(path.join(process.platform === "win32" ? os.tmpdir() : "/tmp", "pokie-pc14-evidence-"));
    const historicalRoot = path.join(executionDirectory, "historical-pc14");
    let historicalWorktreeCreated = false;
    try {
        run("git", ["worktree", "add", "--detach", historicalRoot, publishedPc14Revision], {cwd: repositoryRoot, stdio: "inherit"});
        historicalWorktreeCreated = true;
        installHistoricalDependencies(historicalRoot, path.join(executionDirectory, "npm-cache"));
        installHistoricalInputs(historicalRoot);
        process.stdout.write("PC-14 verifying historical CLI, Studio API, and Studio UI runners in published order.\n");
        run("bwrap", historicalSandboxArguments(historicalRoot, publishedPc14RuntimePackageIdentity()), {
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

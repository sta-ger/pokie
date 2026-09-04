#!/usr/bin/env node
// PC-14 is completed evidence. Its runners execute only from the revision
// and runtime locator that produced it; a successor checkout is not a valid
// substitute for that historical provenance.
import {existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "4731f5f6fbfed54b89006988accd72067532f67d";
const publishedPc14RuntimePackageIdentity = "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-14-20260830075634";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];

function run(command, arguments_, options) {
    const result = spawnSync(command, arguments_, options);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`PC-14 evidence guard command failed: ${command} ${arguments_.join(" ")}`);
    return result;
}

function firstByteDifferenceExcerpt(fresh, immutable) {
    const offset = fresh.findIndex((byte, index) => byte !== immutable[index]);
    const start = Math.max(0, offset - 160);
    const end = offset + 240;
    return `first difference at byte ${offset}; fresh: ${JSON.stringify(fresh.subarray(start, end).toString("utf8"))}; immutable: ${JSON.stringify(immutable.subarray(start, end).toString("utf8"))}`;
}

/** Reject a proposed output whose raw bytes, including provenance, drift. */
export function assertFreshEvidenceMatchesImmutable(freshEvidenceDirectory) {
    if (realpathSync(freshEvidenceDirectory) === realpathSync(evidenceDirectory)) {
        throw new Error("PC-14 evidence provenance is fixed; immutable evidence cannot be substituted for fresh runner output.");
    }
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(freshEvidenceDirectory, file));
        const immutable = readFileSync(path.join(evidenceDirectory, file));
        if (!fresh.equals(immutable)) {
            throw new Error(`PC-14 immutable evidence is not reproducible: fresh ${file} differs byte-for-byte from the immutable result (${firstByteDifferenceExcerpt(fresh, immutable)}).`);
        }
    }
}

function publishedEvidenceBytes() {
    return new Map(committedFiles.map((file) => [file, readFileSync(path.join(evidenceDirectory, file))]));
}

function assertImmutableEvidenceMatchesPublishedRevision() {
    for (const [file, immutable] of publishedEvidenceBytes()) {
        const published = run("git", ["show", `${publishedPc14Revision}:docs/evidence/phase7-product-coherence/pc-14-artifact-torture/${file}`], {
            cwd: repositoryRoot,
            encoding: "buffer",
        }).stdout;
        if (!immutable.equals(published)) throw new Error(`PC-14 immutable evidence was modified: ${file} differs byte-for-byte from its published result.`);
    }
}

function historicalSandboxArguments(historicalRoot) {
    const identityDirectories = [];
    let current = "";
    for (const segment of publishedPc14RuntimePackageIdentity.split(path.sep).filter(Boolean).slice(0, -1)) {
        current = `${current}/${segment}`;
        identityDirectories.push(current);
    }
    const nodeRuntimeDirectory = path.dirname(process.execPath);
    const nodeRuntimeDirectories = [];
    current = "";
    for (const segment of nodeRuntimeDirectory.split(path.sep).filter(Boolean).slice(0, -1)) {
        current = `${current}/${segment}`;
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
        process.execPath, path.join(publishedPc14RuntimePackageIdentity, "scripts", "generate-pc14-interoperability-evidence.mjs"),
    ];
}

function installHistoricalDependencies(historicalRoot, executionDirectory) {
    const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
    if (!existsSync(npmCli)) throw new Error("PC-14 verification requires the Node-bundled npm CLI.");
    run(process.execPath, [npmCli, "ci", "--no-audit", "--no-fund", "--prefer-offline", "--cache", path.join(executionDirectory, "npm-cache")], {
        cwd: historicalRoot,
        stdio: "inherit",
    });
    // This locator is mounted only in the private namespace below. It is
    // deliberately not the current PC-15 checkout.
    symlinkSync(publishedPc14RuntimePackageIdentity, path.join(historicalRoot, "node_modules", "pokie"), "junction");
}

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});
    assertImmutableEvidenceMatchesPublishedRevision();
    const immutableBefore = publishedEvidenceBytes();
    const executionDirectory = mkdtempSync(path.join(os.tmpdir(), "pokie-pc14-evidence-"));
    const historicalRoot = path.join(executionDirectory, "historical-pc14");
    let historicalWorktreeCreated = false;
    try {
        run("git", ["worktree", "add", "--detach", historicalRoot, publishedPc14Revision], {cwd: repositoryRoot, stdio: "inherit"});
        historicalWorktreeCreated = true;
        installHistoricalDependencies(historicalRoot, executionDirectory);
        const freshEvidenceDirectory = path.join(historicalRoot, ".pc14-fresh-evidence");
        mkdirSync(freshEvidenceDirectory);
        process.stdout.write("PC-14 verifying historical CLI, Studio API, and Studio UI runners in published order.\n");
        run("bwrap", historicalSandboxArguments(historicalRoot), {
            cwd: historicalRoot,
            env: {
                ...process.env,
                PC14_INTEROPERABILITY_REGENERATION_CHILD: "1",
                PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR: path.join(publishedPc14RuntimePackageIdentity, ".pc14-fresh-evidence"),
                PC14_INTEROPERABILITY_PERSISTED_RESULT: path.join(publishedPc14RuntimePackageIdentity, ".pc14-fresh-evidence", "interoperability-result.json"),
            },
            stdio: "inherit",
        });
        assertFreshEvidenceMatchesImmutable(freshEvidenceDirectory);
        for (const [file, bytes] of immutableBefore) {
            if (!readFileSync(path.join(evidenceDirectory, file)).equals(bytes)) throw new Error(`PC-14 immutable evidence was modified during verification: ${file}.`);
        }
        process.stdout.write(`PASS PC-14 historical runners reproduced immutable evidence from ${publishedPc14Revision}.\n`);
    } finally {
        if (historicalWorktreeCreated) run("git", ["worktree", "remove", "--force", historicalRoot], {cwd: repositoryRoot, stdio: "inherit"});
        rmSync(executionDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();

#!/usr/bin/env node
// PC-14 is completed evidence. Its historical runner is retained in the
// PC-14 revision; this successor-side command only guards that boundary.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];

function run(command, arguments_, options) {
    const result = spawnSync(command, arguments_, options);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`PC-14 evidence guard command failed: ${command} ${arguments_.join(" ")}`);
    return result;
}

/** Reject a proposed output whose raw bytes, including provenance, drift. */
export function assertFreshEvidenceMatchesImmutable(freshEvidenceDirectory) {
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

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});
    assertImmutableEvidenceMatchesPublishedRevision();
    process.stdout.write(`PASS PC-14 immutable evidence matches published revision ${publishedPc14Revision}.\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();

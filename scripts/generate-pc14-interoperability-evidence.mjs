#!/usr/bin/env node
// PC-14 is a completed roadmap step. Its emitted runner records are an
// immutable audit snapshot, not a PC-15 fixture to regenerate from the
// current runtime (whose checkout-local package links are intentionally part
// of the recorded artifact identity).
import {readFileSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];

function publishedEvidence(file) {
    const result = spawnSync("git", ["show", `${publishedPc14Revision}:docs/evidence/phase7-product-coherence/pc-14-artifact-torture/${file}`], {
        cwd: repositoryRoot,
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`Published PC-14 evidence file is unavailable: ${file}.`);
    return Buffer.from(result.stdout);
}

function validateImmutableEvidence() {
    if (process.argv.includes("--write")) {
        throw new Error("PC-14 evidence is immutable; this command only validates the published result.");
    }
    const revision = spawnSync("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, encoding: "utf-8"});
    if (revision.error !== undefined) throw revision.error;
    if (revision.status !== 0 || revision.stdout.trim() !== publishedPc14Revision) {
        throw new Error(`Published PC-14 revision is unavailable: ${publishedPc14Revision}.`);
    }
    for (const file of committedFiles) {
        const published = publishedEvidence(file);
        const committed = readFileSync(path.join(evidenceDirectory, file));
        if (!published.equals(committed)) {
            throw new Error(`PC-14 immutable evidence differs from its published snapshot: ${file}.`);
        }
    }
    process.stdout.write(`PASS PC-14 immutable evidence matches published revision ${publishedPc14Revision}.\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();

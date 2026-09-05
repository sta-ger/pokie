#!/usr/bin/env node
// PC-14 is completed evidence. This successor-side entry point is deliberately
// archival: it validates the checked-in bytes and refuses every rewrite request.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];
const immutableSha256 = new Map([
    ["cli-real-artifact-result.json", "67bb756e5b104a0afa8df437233f709e4daf162929bc9a0ad0c65cf2cb1bdd94"],
    ["studio-real-artifact-result.json", "d22c6ae879f8bf49efe2064effb09e0155379759c90b3e3b391ed1e011389609"],
    ["studio-ui-real-artifact-result.json", "5cd041b4d45bfede2bd6a5779e577c0cf48df1fef73294ba3510f4dd066799aa"],
    ["interoperability-result.json", "fed792e8e3fa5e46bbc5f699ced471a1680fb05d36bece3862d375a1cc46111a"],
]);

function digest(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

/** Validate completed evidence without executing, reproducing, or altering it. */
export function validatePc14Archive() {
    const files = new Map();
    for (const file of committedFiles) {
        const bytes = readFileSync(path.join(evidenceDirectory, file));
        const actual = digest(bytes);
        const expected = immutableSha256.get(file);
        if (actual !== expected) throw new Error(`PC-14 immutable evidence was modified: ${file} sha256 ${actual} does not match the archived digest.`);
        files.set(file, JSON.parse(bytes.toString("utf8")));
    }
    const merged = files.get("interoperability-result.json");
    for (const input of merged.runner_inputs ?? []) {
        const runner = files.get(input.file);
        if (!runner) throw new Error(`PC-14 archive is malformed: unknown runner input ${input.file}.`);
        const actual = `sha256:${digest(Buffer.from(`${JSON.stringify(runner, null, 2)}\n`))}`;
        if (actual !== input.sha256) throw new Error(`PC-14 archive is malformed: runner input digest differs for ${input.file}.`);
    }
    return Object.fromEntries([...files].map(([file, value]) => [file, digest(Buffer.from(`${JSON.stringify(value, null, 2)}\n`))]));
}

function main(argv = process.argv.slice(2)) {
    if (argv.length > 0) throw new Error("PC-14 evidence is immutable; this command only performs archival integrity checks and never rewrites it.");
    validatePc14Archive();
    process.stdout.write("PASS PC-14 completed evidence archive is byte-intact and rewrite-protected.\n");
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}

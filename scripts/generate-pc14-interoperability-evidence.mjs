#!/usr/bin/env node
// PC-14 evidence is an immutable audit record. Current runners have moved on
// since that completed step, so validate the checked-in bytes against the
// published PC-14 snapshot instead of mutating a disposable checkout to
// imitate its historical runtime environment.
import {readFileSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];
const maximumProvenanceTextLength = 240;

function git(args) {
    const result = spawnSync("git", args, {cwd: repositoryRoot, encoding: "utf-8"});
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
    return result.stdout.trim();
}

function publishedEvidence(file) {
    const result = spawnSync("git", ["show", `${publishedPc14Revision}:docs/evidence/phase7-product-coherence/pc-14-artifact-torture/${file}`], {cwd: repositoryRoot});
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`Published PC-14 evidence file is unavailable: ${file}.`);
    return Buffer.from(result.stdout);
}

function firstDifferentByte(fresh, committed) {
    const comparedLength = Math.min(fresh.length, committed.length);
    for (let offset = 0; offset < comparedLength; offset += 1) if (fresh[offset] !== committed[offset]) return offset;
    return comparedLength;
}

function jsonPathSegment(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function firstJsonDifference(fresh, committed, location = "$") {
    if (Object.is(fresh, committed)) return undefined;
    if (Array.isArray(fresh) && Array.isArray(committed)) {
        if (fresh.length !== committed.length) return {location: `${location}.length`, fresh: fresh.length, committed: committed.length};
        for (let index = 0; index < fresh.length; index += 1) {
            const difference = firstJsonDifference(fresh[index], committed[index], `${location}[${index}]`);
            if (difference !== undefined) return difference;
        }
        return undefined;
    }
    if (fresh !== null && committed !== null && typeof fresh === "object" && typeof committed === "object") {
        const keys = [...new Set([...Object.keys(fresh), ...Object.keys(committed)])].sort();
        for (const key of keys) {
            const difference = firstJsonDifference(fresh[key], committed[key], `${location}${jsonPathSegment(key)}`);
            if (difference !== undefined) return difference;
        }
        return undefined;
    }
    return {location, fresh, committed};
}

function boundedValue(value) {
    const serialized = JSON.stringify(value) ?? "undefined";
    return serialized.length <= maximumProvenanceTextLength ? serialized : `${serialized.slice(0, maximumProvenanceTextLength - 1)}…`;
}

function componentIdentity(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const identity = Object.fromEntries(Object.entries(value).filter(([key]) => [
        "id", "file", "sha256", "artifact_kind", "operation_owner", "public_owner", "capability_identity",
        "source_path", "source_identity", "produced_path", "produced_identity",
    ].includes(key)));
    return Object.keys(identity).length === 0 ? undefined : identity;
}

function componentAtPath(value, location) {
    const match = /^\.([A-Za-z_$][A-Za-z0-9_$]*)\[(\d+)\]/.exec(location.slice(1));
    if (match === null || value === null || typeof value !== "object") return undefined;
    const component = value[match[1]];
    if (!Array.isArray(component)) return undefined;
    return {path: `$.${match[1]}[${match[2]}]`, value: component[Number(match[2])]};
}

export function pc14EvidenceDifferenceProvenance(resultFile, freshBytes, committedBytes) {
    const byteOffset = firstDifferentByte(freshBytes, committedBytes);
    const byteProvenance = `first_byte_offset=${byteOffset} fresh_byte=${freshBytes[byteOffset] === undefined ? "<eof>" : `0x${freshBytes[byteOffset].toString(16).padStart(2, "0")}`} committed_byte=${committedBytes[byteOffset] === undefined ? "<eof>" : `0x${committedBytes[byteOffset].toString(16).padStart(2, "0")}`}`;
    try {
        const fresh = JSON.parse(freshBytes.toString("utf-8"));
        const committed = JSON.parse(committedBytes.toString("utf-8"));
        const difference = firstJsonDifference(fresh, committed);
        if (difference === undefined) return `result_file=${resultFile} ${byteProvenance} json_path=<formatting-only-byte-difference>`;
        const freshComponent = componentAtPath(fresh, difference.location);
        const committedComponent = componentAtPath(committed, difference.location);
        const freshIdentity = componentIdentity(freshComponent?.value);
        const committedIdentity = componentIdentity(committedComponent?.value);
        const componentPath = freshComponent?.path ?? committedComponent?.path;
        const componentProvenance = freshIdentity === undefined && committedIdentity === undefined ? "" : ` component_path=${componentPath} fresh_component=${boundedValue(freshIdentity)} committed_component=${boundedValue(committedIdentity)}`;
        return `result_file=${resultFile} ${byteProvenance} json_path=${difference.location}${componentProvenance} fresh_value=${boundedValue(difference.fresh)} committed_value=${boundedValue(difference.committed)}`;
    } catch {
        return `result_file=${resultFile} ${byteProvenance} json_path=<unavailable-invalid-json>`;
    }
}

/**
 * The comparison is intentionally exact: artifact identities and the hashes
 * that bind each real runner to the merged result are evidence, rather than
 * presentation fields. Keep this boundary reusable by the contract test so
 * a future change cannot make one of those fields cosmetic again.
 */
export function assertExactPc14Evidence(resultFile, freshBytes, committedBytes) {
    if (!freshBytes.equals(committedBytes)) {
        throw new Error(`PC-14 evidence is not reproducible: ${pc14EvidenceDifferenceProvenance(resultFile, freshBytes, committedBytes)}.`);
    }
}

function generatePc14InteroperabilityEvidence() {
    if (process.argv.includes("--write")) throw new Error("PC-14 evidence is immutable; this command only validates the published result.");
    const resolvedPc14Revision = git(["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`]);
    if (resolvedPc14Revision !== publishedPc14Revision) throw new Error(`PC-14 source did not resolve to ${publishedPc14Revision}.`);
    for (const file of committedFiles) {
        const published = publishedEvidence(file);
        const committed = readFileSync(path.join(evidenceDirectory, file));
        assertExactPc14Evidence(file, published, committed);
    }
    process.stdout.write(`PASS PC-14 immutable evidence matches published revision ${publishedPc14Revision}.\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generatePc14InteroperabilityEvidence();

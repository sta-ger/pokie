#!/usr/bin/env node
// PC-14 evidence is deliberately a by-product of the real artifact runners.
// Keep the three runners in separate Jest processes: the Studio UI runner
// merges the CLI and Studio API ledgers only after every real operation has
// completed.
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const jestPath = path.join(repositoryRoot, "node_modules", "jest", "bin", "jest.js");
const temporaryDirectory = path.join(repositoryRoot, "node_modules", ".cache", "pokie-tmp");
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];
const writeCommittedEvidence = process.argv.includes("--write");
// The contract test invokes this script as a separate clean process.  Do not
// recursively invoke that same contract from inside the child; the artifact
// runners and byte comparison remain exactly the production refresh path.
const regenerationChild = process.env.PC14_INTEROPERABILITY_REGENERATION_CHILD === "1";
const maximumProvenanceTextLength = 240;

function firstDifferentByte(fresh, committed) {
    const comparedLength = Math.min(fresh.length, committed.length);
    for (let offset = 0; offset < comparedLength; offset += 1) {
        if (fresh[offset] !== committed[offset]) return offset;
    }
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
    return serialized.length <= maximumProvenanceTextLength
        ? serialized
        : `${serialized.slice(0, maximumProvenanceTextLength - 1)}…`;
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
        const componentProvenance = freshIdentity === undefined && committedIdentity === undefined
            ? ""
            : ` component_path=${componentPath} fresh_component=${boundedValue(freshIdentity)} committed_component=${boundedValue(committedIdentity)}`;
        return `result_file=${resultFile} ${byteProvenance} json_path=${difference.location}${componentProvenance} fresh_value=${boundedValue(difference.fresh)} committed_value=${boundedValue(difference.committed)}`;
    } catch {
        return `result_file=${resultFile} ${byteProvenance} json_path=<unavailable-invalid-json>`;
    }
}

function generatePc14InteroperabilityEvidence() {
    mkdirSync(temporaryDirectory, {recursive: true});
    const runDirectory = mkdtempSync(path.join(temporaryDirectory, "pc14-evidence-"));
    const environment = {
        ...process.env,
        TMPDIR: temporaryDirectory,
        // The values are public runner inputs.  Artifact identity deliberately
        // normalises writer timestamps (see ArtifactInteroperabilityRun), while
        // these fixed values keep any runner-owned identity strings stable.
        PC14_FIXED_RUNNER_CLOCK: "2024-01-02T03:04:05.000Z",
        // Built TypeScript packages link their locally installed runtime.  The
        // link target is machine transport state, so the runner records the
        // original PC-14 runtime identity rather than this disposable worktree.
        // This is intentionally narrower than normalising emitted evidence: the
        // artifact bytes and every runner-input hash remain exact comparisons.
        PC14_FIXED_RUNNER_IDENTITY: "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-14-20260830075634",
        PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR: runDirectory,
        PC14_INTEROPERABILITY_PERSISTED_RESULT: path.join(runDirectory, "interoperability-result.json"),
    };

    function run(testPath) {
        const result = spawnSync(process.execPath, [
            "--experimental-vm-modules",
            "--max-old-space-size=1408",
            jestPath,
            "--runInBand",
            "--no-cache",
            "--runTestsByPath",
            testPath,
        ], {cwd: repositoryRoot, env: environment, stdio: "inherit"});
        if (result.error !== undefined) throw result.error;
        if (result.status !== 0) process.exit(result.status ?? 1);
    }

    run("tests/cli/ArtifactInteroperabilityTorture.integration.test.ts");
    run("tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts");
    run("tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx");
    if (!regenerationChild && !writeCommittedEvidence) run("tests/project/ArtifactInteroperabilityRemediation.contract.test.ts");

    try {
        for (const file of committedFiles) {
            const fresh = readFileSync(path.join(runDirectory, file));
            const committedPath = path.join(evidenceDirectory, file);
            if (writeCommittedEvidence) {
                writeFileSync(committedPath, fresh);
                continue;
            }
            const committed = readFileSync(committedPath);
            if (!fresh.equals(committed)) {
                const provenance = pc14EvidenceDifferenceProvenance(file, fresh, committed);
                throw new Error(`PC-14 evidence is not reproducible: ${provenance}. Run npm run evidence:pc14-interoperability -- --write and commit all three files.`);
            }
        }
    } finally {
        rmSync(runDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generatePc14InteroperabilityEvidence();

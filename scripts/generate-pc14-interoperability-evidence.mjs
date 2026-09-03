#!/usr/bin/env node
// PC-14 evidence belongs to the published PC-14 source revision.  The
// versioned driver owns its CLI, Studio API, Studio UI and raw-byte proof;
// current PC-15 runners must not be used to regenerate historical evidence.
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
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

function run(command, args, options) {
    const result = spawnSync(command, args, {stdio: "inherit", ...options});
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? 1}.`);
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
 * presentation fields.  Keep this boundary reusable by the contract test so
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
    // TMPDIR can be nested below node_modules in the targeted-test lane;
    // Jest deliberately ignores test paths there.  This prefix is still a
    // unique disposable directory, never a saved worktree location.
    const worktreeParentDirectory = mkdtempSync(path.join(repositoryRoot, ".pc14-evidence-"));
    const historicalSourceDirectory = path.join(worktreeParentDirectory, "source");
    let worktreeAdded = false;
    try {
        git(["worktree", "add", "--detach", historicalSourceDirectory, resolvedPc14Revision]);
        worktreeAdded = true;
        const historicalHeadRevision = git(["-C", historicalSourceDirectory, "rev-parse", "HEAD"]);
        if (historicalHeadRevision !== resolvedPc14Revision) {
            throw new Error(`PC-14 historical worktree did not resolve to ${resolvedPc14Revision}.`);
        }
        // This clean checkout is the only runtime source supplied to the
        // isolated runners. Validate its revision before exposing its path as
        // a runner-scoped package-link input.
        const runtimeSourceRevision = git(["-C", historicalSourceDirectory, "rev-parse", "HEAD"]);
        if (runtimeSourceRevision !== resolvedPc14Revision) {
            throw new Error(`PC-14 runtime source did not resolve to ${resolvedPc14Revision}.`);
        }
        // Give the detached checkout its own dependency directory.  Hard
        // links preserve the installed package bytes without a mutable module
        // resolver walking back into the current source checkout; excluding
        // cache output keeps every invocation disposable.
        const historicalNodeModulesDirectory = path.join(historicalSourceDirectory, "node_modules");
        mkdirSync(historicalNodeModulesDirectory);
        for (const entry of readdirSync(path.join(repositoryRoot, "node_modules"))) {
            if (entry !== ".cache") run("cp", ["-al", path.join(repositoryRoot, "node_modules", entry), path.join(historicalNodeModulesDirectory, entry)], {cwd: historicalSourceDirectory});
        }
        // The Studio-components project predates the source mapper that its
        // package-name import needs.  Add that resolver only to this
        // disposable checkout, pointing at this exact detached revision.
        const historicalJestConfigPath = path.join(historicalSourceDirectory, "jest.config.mjs");
        const historicalJestConfig = readFileSync(historicalJestConfigPath, "utf-8");
        const studioMapperDeclaration = "const studioClientComponentsModuleNameMapper = {";
        if (!historicalJestConfig.includes(studioMapperDeclaration)) throw new Error("Published PC-14 Studio resolver declaration is unavailable.");
        writeFileSync(historicalJestConfigPath, historicalJestConfig.replace(studioMapperDeclaration, `${studioMapperDeclaration}\n    "^pokie$": "<rootDir>/src/index.ts",`));
        // This runner-local file is deliberately the sole link input. The
        // generated-package builder receives it through the real runner, not
        // through an ambient process override.
        writeFileSync(path.join(historicalSourceDirectory, ".pc14-runtime-package-link"), historicalSourceDirectory);
        // --write only updates the disposable checkout.  The parent retains
        // ownership of the immutable evidence comparison, so it can report
        // the first byte and identity provenance without weakening the raw
        // result bytes emitted by the published driver.
        run(process.execPath, [path.join(historicalSourceDirectory, "scripts", "generate-pc14-interoperability-evidence.mjs"), "--write"], {
            cwd: historicalSourceDirectory,
            env: {
                ...process.env,
                PC14_INTEROPERABILITY_REGENERATION_CHILD: "1",
            },
        });
        for (const file of committedFiles) {
            const fresh = readFileSync(path.join(historicalSourceDirectory, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture", file));
            const committed = readFileSync(path.join(evidenceDirectory, file));
            assertExactPc14Evidence(file, fresh, committed);
        }
    } finally {
        if (worktreeAdded) git(["worktree", "remove", "--force", historicalSourceDirectory]);
        rmSync(worktreeParentDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generatePc14InteroperabilityEvidence();

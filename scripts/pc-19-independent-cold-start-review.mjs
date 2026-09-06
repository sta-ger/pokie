#!/usr/bin/env node
/**
 * Validates the machine-checkable portion of PC-19's independent review record.
 *
 * Independence itself is a reviewer attestation: this validator deliberately does
 * not read a checkout or any earlier Phase 7 evidence.  It instead rejects a run
 * unless the reviewer froze a complete blind list before recording comparison
 * dispositions, and unless every retained claim is bound to one candidate.
 */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {readFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

export const PC19_SCHEMA_VERSION = 1;

export const REQUIRED_COVERAGE_IDS = [
    "known-findings",
    "blind-cli-exploration",
    "blind-studio-exploration",
    "systemic-cli-sweep",
    "systemic-studio-sweep",
    "duplicate-audit",
    "artifact-torture",
    "cli-studio-semantic-parity",
    "player-examples-parity",
    "lifecycle-recovery",
    "role-math-par",
    "role-game-frontend-package",
    "role-qa-simulation-report-replay",
    "role-outcome-library-integration",
    "role-stake-deployment-export",
    "role-new-project-preparation-retry",
];

const REQUIRED_FILES = ["PROVENANCE.json", "frozen-findings.json", "comparison.json", "coverage.json", "finding-register.json"];
const BLOCKING_SEVERITIES = new Set(["P0", "P1"]);
const OPEN_STATUSES = new Set(["open", "unresolved", "accepted", "blocked"]);

function fail(message) {
    throw new Error(`PC-19 independent-review evidence is invalid: ${message}`);
}

function digest(contents) {
    return createHash("sha256").update(contents).digest("hex");
}

function isUtc(value) {
    return typeof value === "string" && (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/).test(value) && !Number.isNaN(Date.parse(value));
}

function isRelativeEvidencePath(value) {
    return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.split((/[\\/]+/)).includes("..");
}

async function readJson(directory, filename) {
    const target = path.join(directory, filename);
    if (!existsSync(target)) fail(`missing ${filename}`);
    let contents;
    try {
        contents = await readFile(target, "utf8");
    } catch (error) {
        throw new Error(`PC-19 independent-review evidence is invalid: cannot read ${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        return {contents, value: JSON.parse(contents)};
    } catch {
        fail(`${filename} is not JSON`);
        throw new Error("unreachable");
    }
}

function assertCandidate(candidate) {
    if (!candidate || typeof candidate !== "object" || typeof candidate.id !== "string" || candidate.id.length === 0
        || typeof candidate.packageSpecifier !== "string" || candidate.packageSpecifier.length === 0
        || typeof candidate.installedExecutable !== "string" || !path.isAbsolute(candidate.installedExecutable)
        || typeof candidate.packageSha256 !== "string" || !(/^[a-f0-9]{64}$/i).test(candidate.packageSha256)) {
        fail("provenance must identify the installed package, executable, and package SHA-256");
    }
}

function assertFinding(finding, label) {
    if (!finding || typeof finding !== "object" || typeof finding.id !== "string" || finding.id.length === 0
        || !["P0", "P1", "P2", "P3"].includes(finding.severity)
        || typeof finding.reproducer !== "string" || finding.reproducer.length === 0
        || typeof finding.publicSurface !== "string" || finding.publicSurface.length === 0
        || typeof finding.owner !== "string" || finding.owner.length === 0
        || typeof finding.status !== "string" || finding.status.length === 0
        || !isRelativeEvidencePath(finding.evidence)) {
        fail(`${label} must include id, severity, reproducer, public surface, owner, status, and a relative evidence path`);
    }
    if (finding.severity === "P2" && typeof finding.material !== "boolean") fail(`${label} must classify P2 materiality before release gating`);
}

function assertDistinctIds(entries, label) {
    const ids = entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) fail(`${label} has duplicate finding IDs`);
}

async function assertEvidenceFile(directory, relativePath, label) {
    if (!isRelativeEvidencePath(relativePath)) fail(`${label} has an unsafe evidence path`);
    const target = path.resolve(directory, relativePath);
    if (!target.startsWith(`${path.resolve(directory)}${path.sep}`) || !existsSync(target)) fail(`${label} names missing evidence: ${relativePath}`);
    if ((await readFile(target, "utf8")).trim().length === 0) fail(`${label} evidence is empty: ${relativePath}`);
}

/** Validate an append-only PC-19 run directory without consulting prior campaign records. */
export async function validatePc19IndependentColdStartReview(directory) {
    const reviewDirectory = path.resolve(directory);
    for (const filename of REQUIRED_FILES) {
        if (!existsSync(path.join(reviewDirectory, filename))) fail(`missing required record ${filename}`);
    }
    const provenance = await readJson(reviewDirectory, "PROVENANCE.json");
    const frozen = await readJson(reviewDirectory, "frozen-findings.json");
    const comparison = await readJson(reviewDirectory, "comparison.json");
    const coverage = await readJson(reviewDirectory, "coverage.json");
    const register = await readJson(reviewDirectory, "finding-register.json");

    if (provenance.value.schemaVersion !== PC19_SCHEMA_VERSION || !isUtc(provenance.value.startedAt) || !isUtc(provenance.value.frozenAt)
        || Date.parse(provenance.value.startedAt) > Date.parse(provenance.value.frozenAt)) {
        fail("provenance must have this schema version and chronological start/freeze timestamps");
    }
    assertCandidate(provenance.value.candidate);
    if (typeof provenance.value.reviewer !== "string" || provenance.value.reviewer.length === 0
        || provenance.value.cleanRoomAttestation !== "I recorded blind findings before reading roadmap, source, completed evidence, known findings, fixes, or prior acceptance evidence.") {
        fail("provenance lacks the required reviewer-owned clean-room attestation");
    }
    if (!Array.isArray(provenance.value.commandRecords) || provenance.value.commandRecords.length === 0
        || !provenance.value.commandRecords.every((record) => record && typeof record === "object" && typeof record.commandId === "string" && isUtc(record.startedAt) && isUtc(record.endedAt) && typeof record.exitStatus === "number" && isRelativeEvidencePath(record.stdout) && isRelativeEvidencePath(record.stderr))) {
        fail("provenance must retain timestamped command streams and exit statuses");
    }
    if (!provenance.value.studioProfile || !path.isAbsolute(provenance.value.studioProfile.path) || typeof provenance.value.studioProfile.browser !== "string" || !isUtc(provenance.value.studioProfile.startedAt)
        || !isRelativeEvidencePath(provenance.value.studioProfile.browserTranscript)
        || !Array.isArray(provenance.value.artifactLedger) || provenance.value.artifactLedger.length === 0) {
        fail("provenance must retain fresh Studio profile metadata, browser transcript, and artifact ledger");
    }
    await Promise.all(provenance.value.commandRecords.flatMap((record) => [
        assertEvidenceFile(reviewDirectory, record.stdout, `command ${record.commandId} stdout`),
        assertEvidenceFile(reviewDirectory, record.stderr, `command ${record.commandId} stderr`),
    ]));
    await assertEvidenceFile(reviewDirectory, provenance.value.studioProfile.browserTranscript, "Studio browser transcript");
    await Promise.all(provenance.value.artifactLedger.map((entry, index) => assertEvidenceFile(reviewDirectory, entry, `artifact ledger ${index + 1}`)));

    if (frozen.value.schemaVersion !== PC19_SCHEMA_VERSION || frozen.value.reviewId !== provenance.value.reviewId || frozen.value.candidateId !== provenance.value.candidate.id
        || frozen.value.frozenAt !== provenance.value.frozenAt || !Array.isArray(frozen.value.findings)) {
        fail("frozen findings must bind to the provenance review, candidate, and freeze timestamp");
    }
    const frozenHash = digest(frozen.contents);
    if (provenance.value.frozenFindingsSha256 !== frozenHash) fail("frozen findings hash differs from the pre-comparison provenance record");
    frozen.value.findings.forEach((finding) => assertFinding(finding, "a frozen finding"));
    assertDistinctIds(frozen.value.findings, "frozen findings");
    await Promise.all(frozen.value.findings.map((finding) => assertEvidenceFile(reviewDirectory, finding.evidence, `frozen finding ${finding.id}`)));

    if (comparison.value.schemaVersion !== PC19_SCHEMA_VERSION || comparison.value.reviewId !== provenance.value.reviewId
        || comparison.value.candidateId !== provenance.value.candidate.id || comparison.value.frozenFindingsSha256 !== frozenHash
        || !isUtc(comparison.value.comparedAt) || Date.parse(comparison.value.comparedAt) < Date.parse(provenance.value.frozenAt)
        || !Array.isArray(comparison.value.dispositions)) {
        fail("comparison must be a post-freeze record bound to the exact frozen findings hash");
    }
    const dispositionIds = comparison.value.dispositions.map((entry) => entry?.findingId);
    if (dispositionIds.length !== frozen.value.findings.length || new Set(dispositionIds).size !== dispositionIds.length
        || frozen.value.findings.some((finding) => !dispositionIds.includes(finding.id))
        || comparison.value.dispositions.some((entry) => !entry || typeof entry.disposition !== "string" || entry.disposition.length === 0 || !isRelativeEvidencePath(entry.evidence))) {
        fail("comparison must retain exactly one post-freeze disposition and evidence path for every blind finding");
    }
    await Promise.all(comparison.value.dispositions.map((entry) => assertEvidenceFile(reviewDirectory, entry.evidence, `comparison ${entry.findingId}`)));

    if (coverage.value.schemaVersion !== PC19_SCHEMA_VERSION || coverage.value.reviewId !== provenance.value.reviewId || coverage.value.candidateId !== provenance.value.candidate.id || !Array.isArray(coverage.value.records)) {
        fail("coverage must bind every check to this review and candidate");
    }
    const coverageIds = coverage.value.records.map((entry) => entry?.id);
    if (new Set(coverageIds).size !== coverageIds.length || REQUIRED_COVERAGE_IDS.some((id) => !coverageIds.includes(id))) {
        fail(`coverage is missing required review records: ${REQUIRED_COVERAGE_IDS.filter((id) => !coverageIds.includes(id)).join(", ")}`);
    }
    for (const record of coverage.value.records) {
        if (!record || record.candidateId !== provenance.value.candidate.id || record.status !== "complete" || !isRelativeEvidencePath(record.evidence)) {
            fail("every coverage record needs current-candidate identity, complete status, and evidence");
        }
        await assertEvidenceFile(reviewDirectory, record.evidence, `coverage ${record.id}`);
    }

    if (register.value.schemaVersion !== PC19_SCHEMA_VERSION || register.value.reviewId !== provenance.value.reviewId || register.value.candidateId !== provenance.value.candidate.id || !Array.isArray(register.value.findings)) {
        fail("finding register must bind to this review and candidate");
    }
    register.value.findings.forEach((finding) => assertFinding(finding, "a register finding"));
    assertDistinctIds(register.value.findings, "finding register");
    if (frozen.value.findings.some((finding) => !register.value.findings.some((entry) => entry.id === finding.id))) fail("finding register omits a frozen blind finding");
    for (const finding of register.value.findings) {
        await assertEvidenceFile(reviewDirectory, finding.evidence, `finding register ${finding.id}`);
        if (BLOCKING_SEVERITIES.has(finding.severity) && OPEN_STATUSES.has(finding.status)) fail(`release-blocking ${finding.severity} finding remains unresolved: ${finding.id}`);
        if (finding.severity === "P2" && finding.material && OPEN_STATUSES.has(finding.status)) fail(`material P2 finding remains unresolved: ${finding.id}`);
        if (finding.status === "resolved") {
            if (!finding.delta || typeof finding.delta.reviewId !== "string" || finding.delta.reviewId.length === 0 || !path.isAbsolute(finding.delta.cleanContext) || !isRelativeEvidencePath(finding.delta.evidence)) {
                fail(`resolved finding ${finding.id} lacks a clean-context independent delta pass`);
            }
            await assertEvidenceFile(reviewDirectory, finding.delta.evidence, `delta pass ${finding.id}`);
        }
    }
    return {candidateId: provenance.value.candidate.id, frozenFindingsSha256: frozenHash, coverageIds};
}

function usage() {
    throw new Error("Usage: node scripts/pc-19-independent-cold-start-review.mjs --review-dir <append-only-review-run>");
}

export async function main(argv = process.argv) {
    if (argv.length !== 4 || argv[2] !== "--review-dir") usage();
    const result = await validatePc19IndependentColdStartReview(argv[3]);
    process.stdout.write(`PC19_INDEPENDENT_REVIEW_PASS candidate=${result.candidateId} coverage=${result.coverageIds.length}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}

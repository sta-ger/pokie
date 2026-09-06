import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {REQUIRED_COVERAGE_IDS, validatePc19IndependentColdStartReview} from "../../scripts/pc-19-independent-cold-start-review.mjs";

const attestation = "I recorded blind findings before reading roadmap, source, completed evidence, known findings, fixes, or prior acceptance evidence.";

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

async function writeReview(directory, mutate = (review) => review) {
    await mkdir(path.join(directory, "evidence"), {recursive: true});
    const files = ["command.stdout.txt", "command.stderr.txt", "browser.md", "artifacts.tsv", "blind.md", "comparison.md", "coverage.md"];
    await Promise.all(files.map((file) => writeFile(path.join(directory, "evidence", file), `${file}\n`)));
    const candidate = {id: "candidate-sha-123", packageSpecifier: "pokie@1.3.0", installedExecutable: "/clean-room/node_modules/.bin/pokie", packageSha256: "a".repeat(64)};
    const frozen = {schemaVersion: 1, reviewId: "review-1", candidateId: candidate.id, frozenAt: "2026-09-06T10:00:00Z", findings: [{id: "BLIND-1", severity: "P3", material: false, reproducer: "visible route", publicSurface: "Studio Home", owner: "independent reviewer", status: "open", evidence: "evidence/blind.md"}]};
    const frozenContents = `${JSON.stringify(frozen, null, 2)}\n`;
    const review = {
        provenance: {schemaVersion: 1, reviewId: "review-1", startedAt: "2026-09-06T09:00:00Z", frozenAt: frozen.frozenAt, frozenFindingsSha256: sha256(frozenContents), reviewer: "independent reviewer", cleanRoomAttestation: attestation, candidate, commandRecords: [{commandId: "C001", startedAt: "2026-09-06T09:00:00Z", endedAt: "2026-09-06T09:01:00Z", exitStatus: 0, stdout: "evidence/command.stdout.txt", stderr: "evidence/command.stderr.txt"}], studioProfile: {path: "/clean-room/profile", browser: "Chromium", startedAt: "2026-09-06T09:02:00Z", browserTranscript: "evidence/browser.md"}, artifactLedger: ["evidence/artifacts.tsv"]},
        frozen,
        comparison: {schemaVersion: 1, reviewId: "review-1", candidateId: candidate.id, frozenFindingsSha256: sha256(frozenContents), comparedAt: "2026-09-06T11:00:00Z", dispositions: [{findingId: "BLIND-1", disposition: "fixed and independently rerun", evidence: "evidence/comparison.md"}]},
        coverage: {schemaVersion: 1, reviewId: "review-1", candidateId: candidate.id, records: REQUIRED_COVERAGE_IDS.map((id) => ({id, candidateId: candidate.id, status: "complete", evidence: "evidence/coverage.md"}))},
        register: {schemaVersion: 1, reviewId: "review-1", candidateId: candidate.id, findings: [{...frozen.findings[0], status: "resolved", delta: {reviewId: "delta-1", cleanContext: "/clean-room/delta-profile", evidence: "evidence/comparison.md"}}]},
    };
    const result = mutate(review);
    await writeFile(path.join(directory, "frozen-findings.json"), frozenContents);
    await Promise.all([
        writeFile(path.join(directory, "PROVENANCE.json"), `${JSON.stringify(result.provenance, null, 2)}\n`),
        writeFile(path.join(directory, "comparison.json"), `${JSON.stringify(result.comparison, null, 2)}\n`),
        writeFile(path.join(directory, "coverage.json"), `${JSON.stringify(result.coverage, null, 2)}\n`),
        writeFile(path.join(directory, "finding-register.json"), `${JSON.stringify(result.register, null, 2)}\n`),
    ]);
}

test("accepts a current-candidate review with a frozen blind list and complete closure", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-pc19-"));
    try {
        await writeReview(directory);
        await assert.doesNotReject(() => validatePc19IndependentColdStartReview(directory));
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test("rejects comparison before freeze, missing role coverage, and an unresolved material defect", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-pc19-"));
    try {
        await writeReview(directory, (review) => {
            review.comparison.comparedAt = "2026-09-06T09:59:59Z";
            return review;
        });
        await assert.rejects(() => validatePc19IndependentColdStartReview(directory), /post-freeze/i);
        await writeReview(directory, (review) => {
            review.coverage.records = review.coverage.records.filter((record) => record.id !== "role-stake-deployment-export");
            return review;
        });
        await assert.rejects(() => validatePc19IndependentColdStartReview(directory), /role-stake-deployment-export/);
        await writeReview(directory, (review) => {
            review.register.findings = [{id: "P2-1", severity: "P2", material: true, reproducer: "cancel", publicSurface: "Studio", owner: "owner", status: "open", evidence: "evidence/blind.md"}, ...review.register.findings];
            return review;
        });
        await assert.rejects(() => validatePc19IndependentColdStartReview(directory), /material P2/i);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test("rejects a changed frozen list even when the comparison otherwise names its findings", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-pc19-"));
    try {
        await writeReview(directory);
        await writeFile(path.join(directory, "frozen-findings.json"), `${JSON.stringify({schemaVersion: 1, findings: []})}\n`);
        await assert.rejects(() => validatePc19IndependentColdStartReview(directory), /bind to the provenance|hash differs/i);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

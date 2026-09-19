import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS, P805_SCHEMA_VERSION, validateP805ProductReadinessCampaign} from "../../scripts/p8-05-product-readiness-campaign.mjs";

const initial = {candidateId:"1".repeat(40), candidatePackageSha256:"a".repeat(64)};
const retest = {candidateId:"2".repeat(40), candidatePackageSha256:"b".repeat(64)};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const stamp = (offset) => new Date(Date.parse("2026-09-19T20:00:00.000Z") + offset).toISOString();
const rendered = {execution:"public-launcher-rendered-controls", viewports:["wide", "narrow"], consoleExceptions:0, unhandledRequestFailures:0, documentOverflow:false, inaccessiblePrimaryActions:0, unexplainedDisabledControls:0, recovery:{reloadReconnect:true, projectSwitch:true, staleResponseIsolation:true, unsavedWorkProtection:true, serverRestart:true}, jobs:{success:true, actionableFailure:true, cooperativeCancellation:true, retryWithoutPartialArtifacts:true}};

async function campaignFixture() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-p8-05-campaign-"));
    let sequence = 0;
    const evidence = async (candidate, kind, at) => {
        const contents = `P8-05 bounded ${kind} ${++sequence}\n`;
        const relativePath = `records/${sequence}.txt`;
        await mkdir(path.join(directory, "records"), {recursive:true});
        await writeFile(path.join(directory, relativePath), contents);
        return {evidenceId:`e-${sequence}`, path:relativePath, sha256:hash(contents), sizeBytes:Buffer.byteLength(contents), capturedAt:at, kind, ...candidate};
    };
    const write = (name, value) => writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
    const initialAudits = [];
    for (const [index, persona] of P805_PERSONAS.entries()) {
        const startedAt = stamp(100 + index * 100), endedAt = stamp(150 + index * 100);
        initialAudits.push({auditId:`initial-${persona}`, persona, phase:"initial", startedAt, endedAt, ...initial, cleanContext:{workspace:`/tmp/p8-05-initial-${persona}`, configurationRoot:`/tmp/p8-05-initial-config-${persona}`, browserProfile:`/tmp/p8-05-initial-profile-${persona}`, reused:false}, observations:P805_REQUIRED_OBSERVATIONS[persona], timings:{startupMs:12, actionMs:24}, rendered, evidence:[await evidence(initial, "cli-transcript", stamp(110 + index * 100)), await evidence(initial, "screenshot", stamp(120 + index * 100))]});
    }
    const findingEvidence = await evidence(initial, "finding", stamp(700));
    const finding = {id:"F-1", severity:"P2", material:true, persona:"ui-ux", publicSurface:"Studio Simulation", reproducer:"Run then cancel", owner:"cli/studio", status:"resolved", evidence:findingEvidence};
    const retests = [];
    for (const [index, persona] of P805_PERSONAS.entries()) {
        const startedAt = stamp(1_000 + index * 100), endedAt = stamp(1_050 + index * 100);
        retests.push({auditId:`retest-${persona}`, persona, phase:"retest", startedAt, endedAt, ...retest, cleanContext:{workspace:`/tmp/p8-05-retest-${persona}`, configurationRoot:`/tmp/p8-05-retest-config-${persona}`, browserProfile:`/tmp/p8-05-retest-profile-${persona}`, reused:false}, observations:P805_REQUIRED_OBSERVATIONS[persona], timings:{startupMs:12, actionMs:24}, rendered, evidence:[await evidence(retest, "cli-transcript", stamp(1_010 + index * 100)), await evidence(retest, "screenshot", stamp(1_020 + index * 100))]});
    }
    await write("PROVENANCE.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", startedAt:stamp(1), cleanRoomAttestation:"I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.", initialCandidate:initial});
    await write("initial-audits.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", audits:initialAudits});
    await write("frozen-findings.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", ...initial, frozenAt:stamp(800), findings:[finding]});
    await write("finding-register.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", findings:[finding]});
    await write("regressions.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", regressions:[{findingId:"F-1", testPath:"tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx", commitId:retest.candidateId, assertions:["cancelled job has no report"]}]});
    await write("retests.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", startedAt:stamp(950), audits:retests});
    await write("closeout.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:"p8-05-fixture", ...retest, closedAt:stamp(1_700), releaseReady:true, appendOnly:true, cleanup:{noOwnedProcessesRemain:true, failedOrCancelledArtifactsRemoved:true}, dispositions:[{findingId:"F-1", status:"resolved", retestEvidenceId:retests[3].evidence[0].evidenceId}]});
    return {directory, async cleanup() { await rm(directory, {recursive:true, force:true}); }};
}

test("requires exactly five clean initial audits, frozen severity, regressions, and new-candidate clean retests", async () => {
    const fixture = await campaignFixture();
    try {
        const result = await validateP805ProductReadinessCampaign(fixture.directory, retest);
        assert.deepEqual(result.personas, P805_PERSONAS);
        assert.equal(result.candidateId, retest.candidateId);
    } finally { await fixture.cleanup(); }
});

test("fails closed when a material finding is left accepted after retest", async () => {
    const fixture = await campaignFixture();
    try {
        const target = path.join(fixture.directory, "finding-register.json");
        const register = JSON.parse(await readFile(target, "utf8"));
        register.findings[0].status = "accepted";
        await writeFile(target, `${JSON.stringify(register)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, retest), /release-blocking finding remains accepted/i);
    } finally { await fixture.cleanup(); }
});

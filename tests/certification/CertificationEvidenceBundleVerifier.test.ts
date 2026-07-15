import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleManifest,
    CertificationEvidenceBundleVerifier,
    CertificationEvidenceSampleRecord,
    computeCertificationEvidenceContentHash,
    computeCertificationSampleRecordHash,
    computeRoundArtifactHash,
    OutcomeLibraryBundleManifest,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildSourceOutcomeLibraryBundle, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationEvidenceBundleTestFixtures.js";

function readSourceManifest(bundleDir: string): OutcomeLibraryBundleManifest {
    return JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf-8")) as OutcomeLibraryBundleManifest;
}

function writeSourceManifest(bundleDir: string, manifest: OutcomeLibraryBundleManifest): void {
    fs.writeFileSync(path.join(bundleDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
}

function readCertManifest(certDir: string): CertificationEvidenceBundleManifest {
    return JSON.parse(fs.readFileSync(path.join(certDir, "manifest.json"), "utf-8")) as CertificationEvidenceBundleManifest;
}

function writeCertManifest(certDir: string, manifest: CertificationEvidenceBundleManifest): void {
    fs.writeFileSync(path.join(certDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
}

function readCertSampleLines(certDir: string, samplesFile: string): CertificationEvidenceSampleRecord[] {
    return fs
        .readFileSync(path.join(certDir, samplesFile), "utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as CertificationEvidenceSampleRecord);
}

function writeCertSampleLines(certDir: string, samplesFile: string, records: readonly CertificationEvidenceSampleRecord[]): void {
    fs.writeFileSync(path.join(certDir, samplesFile), records.map((record) => `${JSON.stringify(record)}\n`).join(""));
}

function sha256OfBytes(bytes: Buffer): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

// Rewrites samplesHash/evidenceContentHash to match "records"/"updatedModes" so the rest of the manifest stays
// internally self-consistent (per CertificationEvidenceBundleValidator's own checks) — isolating whatever the
// caller actually tampered as the one thing left for the live cross-check (CertificationEvidenceBundleVerifier)
// to catch, rather than also tripping an unrelated self-consistency issue.
function rewriteCertSamplesAndFixUpHashes(
    certDir: string,
    manifest: CertificationEvidenceBundleManifest,
    modeName: string,
    records: readonly CertificationEvidenceSampleRecord[],
): void {
    const modeEntry = manifest.modes.find((entry) => entry.modeName === modeName)!;
    writeCertSampleLines(certDir, modeEntry.samplesFile, records);
    const newSamplesHash = sha256OfBytes(fs.readFileSync(path.join(certDir, modeEntry.samplesFile)));
    const updatedModes = manifest.modes.map((entry) => (entry.modeName === modeName ? {...entry, samplesHash: newSamplesHash} : entry));
    const draft = {...manifest, modes: updatedModes};
    writeCertManifest(certDir, {...draft, evidenceContentHash: computeCertificationEvidenceContentHash(draft)});
}

describe("CertificationEvidenceBundleVerifier", () => {
    let tmpRoot: string;
    let bundleDir: string;
    let certDir: string;
    let verifier: CertificationEvidenceBundleVerifier;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cert-bundle-verifier-"));
        bundleDir = path.join(tmpRoot, "bundle");
        certDir = path.join(tmpRoot, "certification");
        verifier = new CertificationEvidenceBundleVerifier();

        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 8}], certDir);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("verifies cleanly right after a build, against the unchanged source bundle", async () => {
        const issues = await verifier.verify(certDir);
        expect(issues).toEqual([]);
    });

    it("short-circuits on a structurally broken evidence bundle without attempting a source-bundle cross-check", async () => {
        fs.rmSync(path.join(certDir, "manifest.json"));

        const issues = await verifier.verify(certDir);

        expect(issues).toEqual([{code: "certification-evidence-bundle-manifest-missing", severity: "error", message: expect.any(String)}]);
    });

    it("honors an explicit sourceBundleDir override instead of the manifest's own recorded one", async () => {
        const movedBundleDir = path.join(tmpRoot, "bundle-moved");
        fs.renameSync(bundleDir, movedBundleDir);

        const failed = await verifier.verify(certDir);
        expect(failed.map((issue) => issue.code)).toContain("certification-evidence-verify-source-bundle-unreadable");

        const succeeded = await verifier.verify(certDir, {sourceBundleDir: movedBundleDir});
        expect(succeeded).toEqual([]);
    });

    it("detects that the source bundle's own manifest.json changed since certification", async () => {
        const sourceManifest = readSourceManifest(bundleDir);
        writeSourceManifest(bundleDir, {...sourceManifest, generatedAt: new Date(0).toISOString()});

        const issues = await verifier.verify(certDir);

        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-verify-source-bundle-manifest-changed");
    });

    it("detects that a mode's own analysis/metrics drifted from what was certified", async () => {
        const sourceManifest = readSourceManifest(bundleDir);
        const tamperedModes = sourceManifest.modes.map((modeEntry, index) =>
            index === 0 ? {...modeEntry, analysis: {...modeEntry.analysis, rtp: modeEntry.analysis.rtp + 1}} : modeEntry,
        );
        writeSourceManifest(bundleDir, {...sourceManifest, modes: tamperedModes});

        const issues = await verifier.verify(certDir);
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("certification-evidence-verify-source-bundle-manifest-changed");
        expect(codes).toContain("certification-evidence-verify-metrics-mismatch");
    });

    it("detects that the source library was rebuilt with different content since certification", async () => {
        // Same modeName/ids ("0".."4"), but a different libraryId changes every outcome's own roundId, and
        // therefore its RoundArtifact hash and this mode's own libraryHash — while leaving payoutMultiplier/
        // weight (and so "analysis") numerically identical, isolating the mode-identity/sample-content codes
        // from the metrics code exercised by the previous test.
        const rebuiltMode = buildOutcomeLibraryBundleModeInput("base", "base-lib-rebuilt");
        await new OutcomeLibraryBundleWriter(CERTIFICATION_TEST_POKIE_VERSION).writeToDirectory([rebuiltMode], bundleDir);

        const issues = await verifier.verify(certDir);
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("certification-evidence-verify-source-bundle-manifest-changed");
        expect(codes).toContain("certification-evidence-verify-manifest-mode-mismatch");
        expect(codes).toContain("certification-evidence-verify-sample-record-hash-mismatch");
        expect(codes).not.toContain("certification-evidence-verify-metrics-mismatch");
    });

    it("still detects source-mode-missing when a certified mode is dropped entirely from a rebuilt bundle", async () => {
        const otherMode = buildOutcomeLibraryBundleModeInput("bonus", "bonus-lib");
        await new OutcomeLibraryBundleWriter(CERTIFICATION_TEST_POKIE_VERSION).writeToDirectory([otherMode], bundleDir);

        const issues = await verifier.verify(certDir);

        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-verify-source-mode-missing");
    });

    it("rejects an unsafe samplesFile path in the manifest without ever reading outside certDir", async () => {
        const manifest = readCertManifest(certDir);
        const tamperedModes = manifest.modes.map((entry) => ({...entry, samplesFile: "../outside.jsonl"}));
        writeCertManifest(certDir, {...manifest, modes: tamperedModes});
        fs.writeFileSync(path.join(tmpRoot, "outside.jsonl"), "should never be read\n");

        const issues = await verifier.verify(certDir);

        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-verify-path-unsafe");
    });

    it("handles an invalid JSON sample line during verify without throwing, still cross-checking the rest of the mode", async () => {
        const manifest = readCertManifest(certDir);
        const modeEntry = manifest.modes[0];
        const samplesPath = path.join(certDir, modeEntry.samplesFile);
        const lines = fs
            .readFileSync(samplesPath, "utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        lines[2] = "not json{{{";
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        const issues = await verifier.verify(certDir);
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("certification-evidence-bundle-sample-line-invalid-json");
        expect(codes).not.toContain("certification-evidence-verify-malformed");
        expect(codes).not.toContain("certification-evidence-verify-sample-sequence-mismatch");
    });

    it("detects a recordHash forged self-consistently with its own {id, weight, artifact}, via the live index cross-check", async () => {
        const manifest = readCertManifest(certDir);
        const modeEntry = manifest.modes[0];
        const records = readCertSampleLines(certDir, modeEntry.samplesFile);
        const original = records[0];
        const forgedWeight = original.weight + 1;
        const forgedRecord: CertificationEvidenceSampleRecord = {
            ...original,
            weight: forgedWeight,
            recordHash: computeCertificationSampleRecordHash({id: original.outcomeId, weight: forgedWeight, artifact: original.artifact}),
        };
        const updatedRecords = records.map((record, index) => (index === 0 ? forgedRecord : record));
        rewriteCertSamplesAndFixUpHashes(certDir, manifest, modeEntry.modeName, updatedRecords);

        const issues = await verifier.verify(certDir);
        const codes = issues.map((issue) => issue.code);

        // Self-consistent (weight/recordHash agree with each other), so nothing in
        // CertificationEvidenceBundleValidator's own offline checks can catch this — only the live index
        // cross-check (this evidence's recordHash no longer matches the live bundle's own index entry) can.
        expect(codes.filter((code) => code.startsWith("certification-evidence-bundle-"))).toEqual([]);
        expect(codes).toContain("certification-evidence-verify-sample-record-hash-mismatch");
    });

    it("detects a sample substituted with a different, individually valid, still-existing outcome id (sequence mismatch)", async () => {
        const manifest = readCertManifest(certDir);
        const modeEntry = manifest.modes[0];
        const records = readCertSampleLines(certDir, modeEntry.samplesFile);
        const reader = new OutcomeLibraryBundleReader();
        const index = await reader.readModeIndex(bundleDir, modeEntry.modeName);
        const substituteId = index.entries.map((entry) => entry.id).find((id) => id !== records[0].outcomeId)!;
        const substituteOutcome = (await reader.readOutcomeById(bundleDir, modeEntry.modeName, substituteId))!;
        const substituteIndexEntry = index.entries.find((entry) => entry.id === substituteId)!;

        const substitutedRecord: CertificationEvidenceSampleRecord = {
            modeName: modeEntry.modeName,
            sampleIndex: 0,
            seed: modeEntry.sampleSeed,
            outcomeId: substituteOutcome.id,
            weight: substituteOutcome.weight,
            recordHash: substituteIndexEntry.recordHash,
            artifactHash: computeRoundArtifactHash(substituteOutcome.artifact),
            artifact: substituteOutcome.artifact,
        };
        const updatedRecords = records.map((record, index2) => (index2 === 0 ? substitutedRecord : record));
        rewriteCertSamplesAndFixUpHashes(certDir, manifest, modeEntry.modeName, updatedRecords);

        const issues = await verifier.verify(certDir);
        const codes = issues.map((issue) => issue.code);

        // The substituted outcome is completely genuine and untampered — only "this isn't what position 0's
        // own seed would actually draw" (the sequence check) can tell the two apart.
        expect(codes.filter((code) => code.startsWith("certification-evidence-bundle-"))).toEqual([]);
        expect(codes).not.toContain("certification-evidence-verify-sample-record-hash-mismatch");
        expect(codes).toContain("certification-evidence-verify-sample-sequence-mismatch");
    });
});

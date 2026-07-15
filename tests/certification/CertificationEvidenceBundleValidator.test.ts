import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleManifest,
    CertificationEvidenceBundleValidator,
    computeCertificationEvidenceContentHash,
} from "pokie";
import {buildSourceOutcomeLibraryBundle, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationEvidenceBundleTestFixtures.js";

function sha256OfBytes(bytes: Buffer): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function readManifest(certDir: string): CertificationEvidenceBundleManifest {
    return JSON.parse(fs.readFileSync(path.join(certDir, "manifest.json"), "utf-8")) as CertificationEvidenceBundleManifest;
}

function writeManifest(certDir: string, manifest: CertificationEvidenceBundleManifest): void {
    fs.writeFileSync(path.join(certDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
}

describe("CertificationEvidenceBundleValidator", () => {
    let tmpRoot: string;
    let bundleDir: string;
    let certDir: string;
    let validator: CertificationEvidenceBundleValidator;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cert-bundle-validator-"));
        bundleDir = path.join(tmpRoot, "bundle");
        certDir = path.join(tmpRoot, "certification");
        validator = new CertificationEvidenceBundleValidator();

        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 8}], certDir);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("reports no issues for a freshly built, untouched bundle", async () => {
        const issues = await validator.validate(certDir);
        expect(issues).toEqual([]);
    });

    it("reports manifest-missing when manifest.json doesn't exist", async () => {
        fs.rmSync(path.join(certDir, "manifest.json"));
        const issues = await validator.validate(certDir);
        expect(issues).toEqual([{code: "certification-evidence-bundle-manifest-missing", severity: "error", message: expect.any(String)}]);
    });

    it("reports manifest-invalid-json when manifest.json isn't valid JSON", async () => {
        fs.writeFileSync(path.join(certDir, "manifest.json"), "not json{{{");
        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toEqual(["certification-evidence-bundle-manifest-invalid-json"]);
    });

    it("reports schema-version-unsupported when the manifest's schemaVersion doesn't match", async () => {
        const manifest = readManifest(certDir);
        writeManifest(certDir, {...manifest, schemaVersion: 999});
        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toEqual(["certification-evidence-bundle-manifest-schema-version-unsupported"]);
    });

    it("detects a tampered samples file (samples-hash-mismatch)", async () => {
        const manifest = readManifest(certDir);
        const samplesPath = path.join(certDir, manifest.modes[0].samplesFile);
        const original = fs.readFileSync(samplesPath, "utf-8");
        const lines = original.split("\n").filter((line) => line.length > 0);
        const tampered = JSON.parse(lines[0]);
        tampered.weight = tampered.weight + 1;
        lines[0] = JSON.stringify(tampered);
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-samples-hash-mismatch");
    });

    it("detects an artifact tampered without breaking JSON shape (sample-artifact-hash-mismatch)", async () => {
        const manifest = readManifest(certDir);
        const samplesPath = path.join(certDir, manifest.modes[0].samplesFile);
        const lines = fs
            .readFileSync(samplesPath, "utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        const record = JSON.parse(lines[0]);
        record.artifact = {...record.artifact, totalWin: (record.artifact.totalWin as number) + 999};
        lines[0] = JSON.stringify(record);
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        const issues = await validator.validate(certDir);
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("certification-evidence-bundle-samples-hash-mismatch");
        expect(codes).toContain("certification-evidence-bundle-sample-artifact-hash-mismatch");
    });

    it("detects a missing samples file", async () => {
        const manifest = readManifest(certDir);
        fs.rmSync(path.join(certDir, manifest.modes[0].samplesFile));

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-samples-file-missing");
    });

    it("detects an invalid JSON line in the samples file", async () => {
        const manifest = readManifest(certDir);
        const samplesPath = path.join(certDir, manifest.modes[0].samplesFile);
        const lines = fs
            .readFileSync(samplesPath, "utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        lines[0] = "not json{{{";
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-sample-line-invalid-json");
    });

    it("detects a sample count mismatch when a line is removed", async () => {
        const manifest = readManifest(certDir);
        const samplesPath = path.join(certDir, manifest.modes[0].samplesFile);
        const lines = fs
            .readFileSync(samplesPath, "utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        lines.pop();
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        const issues = await validator.validate(certDir);
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("certification-evidence-bundle-samples-hash-mismatch");
        expect(codes).toContain("certification-evidence-bundle-sample-count-mismatch");
    });

    it("detects an unexpected extra file listed in manifest.files", async () => {
        const manifest = readManifest(certDir);
        writeManifest(certDir, {...manifest, files: [...manifest.files, "unexpected.json"]});

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-manifest-files-unexpected-entry");
    });

    it("detects a missing files entry in manifest.files", async () => {
        const manifest = readManifest(certDir);
        writeManifest(certDir, {...manifest, files: manifest.files.filter((file) => file !== "manifest.json")});

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-manifest-files-missing-entry");
    });

    it("detects a forged recordHash that no longer matches its own {outcomeId, weight, artifact}, even with a matching samplesHash", async () => {
        const manifest = readManifest(certDir);
        const modeEntry = manifest.modes[0];
        const samplesPath = path.join(certDir, modeEntry.samplesFile);
        const lines = fs
            .readFileSync(samplesPath, "utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        const record = JSON.parse(lines[0]);
        record.recordHash = `sha256:${"0".repeat(64)}`;
        lines[0] = JSON.stringify(record);
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        // Update samplesHash/evidenceContentHash so the file-level and manifest-level hash checks stay clean,
        // isolating the forged recordHash as the one thing this validator's own per-sample check must catch.
        const newSamplesHash = sha256OfBytes(fs.readFileSync(samplesPath));
        const updatedModes = manifest.modes.map((entry) => (entry.modeName === modeEntry.modeName ? {...entry, samplesHash: newSamplesHash} : entry));
        const draft = {...manifest, modes: updatedModes};
        writeManifest(certDir, {...draft, evidenceContentHash: computeCertificationEvidenceContentHash(draft)});

        const issues = await validator.validate(certDir);
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("certification-evidence-bundle-sample-record-hash-mismatch");
        expect(codes).not.toContain("certification-evidence-bundle-samples-hash-mismatch");
    });

    it("detects a manifest-level analysis tamper via the unified evidenceContentHash check, with no other field touched", async () => {
        const manifest = readManifest(certDir);
        const tamperedModes = manifest.modes.map((entry, index) => (index === 0 ? {...entry, analysis: {...entry.analysis, rtp: entry.analysis.rtp + 1}} : entry));
        writeManifest(certDir, {...manifest, modes: tamperedModes}); // evidenceContentHash deliberately left stale

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-content-hash-mismatch");
    });

    it("detects tampering of deepValidation.issues via the unified evidenceContentHash check", async () => {
        const manifest = readManifest(certDir);
        writeManifest(certDir, {
            ...manifest,
            deepValidation: {...manifest.deepValidation, issues: [{code: "forged-issue", severity: "warning", message: "forged"}]},
        });

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-content-hash-mismatch");
    });

    it("reports no content-hash-mismatch for a freshly built, untouched bundle", async () => {
        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).not.toContain("certification-evidence-bundle-content-hash-mismatch");
    });

    it("rejects an unknown top-level field in manifest.json", async () => {
        const manifest = readManifest(certDir);
        writeManifest(certDir, {...manifest, unexpectedTopLevelField: "surprise"} as unknown as CertificationEvidenceBundleManifest);

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-manifest-malformed");
    });

    it("rejects an unknown field on a mode entry", async () => {
        const manifest = readManifest(certDir);
        const tamperedModes = manifest.modes.map((entry) => ({...entry, unexpectedModeField: "surprise"}));
        writeManifest(certDir, {...manifest, modes: tamperedModes} as unknown as CertificationEvidenceBundleManifest);

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-mode-field-invalid");
    });

    it("rejects an unknown field on a sample record", async () => {
        const manifest = readManifest(certDir);
        const modeEntry = manifest.modes[0];
        const samplesPath = path.join(certDir, modeEntry.samplesFile);
        const lines = fs
            .readFileSync(samplesPath, "utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        const record = JSON.parse(lines[0]);
        record.unexpectedSampleField = "surprise";
        lines[0] = JSON.stringify(record);
        fs.writeFileSync(samplesPath, `${lines.join("\n")}\n`);

        // Re-fix the samples hash (and evidenceContentHash) so this test isolates the sample-shape rejection
        // from an incidental samples-hash-mismatch/content-hash-mismatch that would fire regardless.
        const newSamplesHash = sha256OfBytes(fs.readFileSync(samplesPath));
        const updatedModes = manifest.modes.map((entry) => (entry.modeName === modeEntry.modeName ? {...entry, samplesHash: newSamplesHash} : entry));
        const draft = {...manifest, modes: updatedModes};
        writeManifest(certDir, {...draft, evidenceContentHash: computeCertificationEvidenceContentHash(draft)});

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-sample-line-malformed");
    });

    it("rejects an unknown field on a mode's own analysis object", async () => {
        const manifest = readManifest(certDir);
        const tamperedModes = manifest.modes.map((entry) => ({...entry, analysis: {...entry.analysis, unexpectedAnalysisField: 1}}));
        writeManifest(certDir, {...manifest, modes: tamperedModes} as unknown as CertificationEvidenceBundleManifest);

        const issues = await validator.validate(certDir);
        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-bundle-mode-field-invalid");
    });
});

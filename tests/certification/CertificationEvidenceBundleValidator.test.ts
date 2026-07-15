import fs from "fs";
import os from "os";
import path from "path";
import {CertificationEvidenceBundleBuilder, CertificationEvidenceBundleManifest, CertificationEvidenceBundleValidator} from "pokie";
import {buildSourceOutcomeLibraryBundle, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationEvidenceBundleTestFixtures.js";

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
});

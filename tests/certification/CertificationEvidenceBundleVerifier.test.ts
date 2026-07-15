import fs from "fs";
import os from "os";
import path from "path";
import {CertificationEvidenceBundleBuilder, CertificationEvidenceBundleVerifier, OutcomeLibraryBundleManifest, OutcomeLibraryBundleWriter} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildSourceOutcomeLibraryBundle, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationEvidenceBundleTestFixtures.js";

function readSourceManifest(bundleDir: string): OutcomeLibraryBundleManifest {
    return JSON.parse(fs.readFileSync(path.join(bundleDir, "manifest.json"), "utf-8")) as OutcomeLibraryBundleManifest;
}

function writeSourceManifest(bundleDir: string, manifest: OutcomeLibraryBundleManifest): void {
    fs.writeFileSync(path.join(bundleDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
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
        expect(codes).toContain("certification-evidence-verify-sample-outcome-changed");
        expect(codes).not.toContain("certification-evidence-verify-metrics-mismatch");
    });

    it("still detects source-mode-missing when a certified mode is dropped entirely from a rebuilt bundle", async () => {
        const otherMode = buildOutcomeLibraryBundleModeInput("bonus", "bonus-lib");
        await new OutcomeLibraryBundleWriter(CERTIFICATION_TEST_POKIE_VERSION).writeToDirectory([otherMode], bundleDir);

        const issues = await verifier.verify(certDir);

        expect(issues.map((issue) => issue.code)).toContain("certification-evidence-verify-source-mode-missing");
    });
});

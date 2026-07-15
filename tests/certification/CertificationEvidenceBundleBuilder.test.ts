import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
    CertificationEvidenceBundleBuilder,
    CertificationEvidenceBundleManifest,
    CertificationEvidenceBundleModeSampleInput,
    CertificationEvidenceSampleRecord,
    computeRoundArtifactHash,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleWriter,
    ValidationIssue,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildSourceOutcomeLibraryBundle, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationEvidenceBundleTestFixtures.js";

function copyDirectoryShallow(fromDir: string, toDir: string): void {
    fs.mkdirSync(toDir, {recursive: true});
    for (const file of fs.readdirSync(fromDir)) {
        fs.copyFileSync(path.join(fromDir, file), path.join(toDir, file));
    }
}

function siblingLeftovers(outDir: string): string[] {
    const parent = path.dirname(outDir);
    const base = path.basename(outDir);
    return fs.readdirSync(parent).filter((name) => name !== base && name.startsWith(base));
}

function readSampleLines(certDir: string, samplesFile: string): CertificationEvidenceSampleRecord[] {
    return fs
        .readFileSync(path.join(certDir, samplesFile), "utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as CertificationEvidenceSampleRecord);
}

describe("CertificationEvidenceBundleBuilder", () => {
    let tmpRoot: string;
    let bundleDir: string;
    let certDir: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cert-bundle-builder-"));
        bundleDir = path.join(tmpRoot, "bundle");
        certDir = path.join(tmpRoot, "certification");
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("builds a certification bundle whose manifest reuses the source bundle's own hash/metrics verbatim", async () => {
        const writeResult = await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const sourceModeEntry = writeResult.manifest!.modes[0];

        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        const modes: CertificationEvidenceBundleModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 10}];
        const result = await builder.buildFromBundle(bundleDir, modes, certDir);

        expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(result.manifest).toBeDefined();
        const manifest = result.manifest as CertificationEvidenceBundleManifest;

        expect(manifest.game).toEqual(writeResult.manifest!.game);
        expect(manifest.artifactPokieVersion).toBe(writeResult.manifest!.artifactPokieVersion);
        expect(manifest.sourceBundleDir).toBe(bundleDir);
        expect(manifest.modes).toHaveLength(1);

        const modeEntry = manifest.modes[0];
        expect(modeEntry.libraryHash).toBe(sourceModeEntry.libraryHash);
        expect(modeEntry.outcomeCount).toBe(sourceModeEntry.outcomeCount);
        expect(modeEntry.totalWeight).toBe(sourceModeEntry.totalWeight);
        expect(modeEntry.analysis).toEqual(sourceModeEntry.analysis);
        expect(modeEntry.sampleSeed).toBe("cert-seed-1");
        expect(modeEntry.sampleCount).toBe(10);
        expect(modeEntry.samplesFile).toBe("samples_base.jsonl");

        expect([...result.files].sort()).toEqual(["manifest.json", "samples_base.jsonl"].sort());
        for (const file of result.files) {
            expect(fs.existsSync(path.join(certDir, file))).toBe(true);
        }
    });

    it("writes sample records cross-checkable against the source bundle's own index recordHash/artifact", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        const result = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 12}], certDir);

        const modeEntry = result.manifest!.modes[0];
        const records = readSampleLines(certDir, modeEntry.samplesFile);
        expect(records).toHaveLength(12);

        const reader = new OutcomeLibraryBundleReader();
        const index = await reader.readModeIndex(bundleDir, "base");

        records.forEach((record, position) => {
            expect(record.sampleIndex).toBe(position);
            expect(record.modeName).toBe("base");
            expect(record.seed).toBe("cert-seed-1");
            expect(record.artifactHash).toBe(computeRoundArtifactHash(record.artifact));

            const indexEntry = index.entries.find((entry) => entry.id === record.outcomeId);
            expect(indexEntry).toBeDefined();
            expect(record.weight).toBe(indexEntry!.weight);
            expect(record.recordHash).toBe(indexEntry!.recordHash);
        });

        const recomputedSamplesHash = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(path.join(certDir, modeEntry.samplesFile))).digest("hex")}`;
        expect(modeEntry.samplesHash).toBe(recomputedSamplesHash);
    });

    it("produces a byte-identical sample sequence for the same bundle/seed (deterministic output)", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const fixedNow = () => new Date("2026-07-15T00:00:00.000Z");

        const certDirA = path.join(tmpRoot, "certification-a");
        const certDirB = path.join(tmpRoot, "certification-b");
        const modes: CertificationEvidenceBundleModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 25}];

        const builderA = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, fixedNow);
        const builderB = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, fixedNow);

        await builderA.buildFromBundle(bundleDir, modes, certDirA);
        await builderB.buildFromBundle(bundleDir, modes, certDirB);

        expect(fs.readFileSync(path.join(certDirA, "manifest.json"), "utf-8")).toBe(fs.readFileSync(path.join(certDirB, "manifest.json"), "utf-8"));
        expect(fs.readFileSync(path.join(certDirA, "samples_base.jsonl"), "utf-8")).toBe(fs.readFileSync(path.join(certDirB, "samples_base.jsonl"), "utf-8"));
    });

    it("produces a different sample id sequence for a different seed", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const resultA = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "seed-a", sampleCount: 25}], path.join(tmpRoot, "cert-a"));
        const resultB = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "seed-b", sampleCount: 25}], path.join(tmpRoot, "cert-b"));

        const idsA = readSampleLines(path.join(tmpRoot, "cert-a"), resultA.manifest!.modes[0].samplesFile).map((record) => record.outcomeId);
        const idsB = readSampleLines(path.join(tmpRoot, "cert-b"), resultB.manifest!.modes[0].samplesFile).map((record) => record.outcomeId);
        expect(idsA).not.toEqual(idsB);
    });

    it("leaves no stray temp/staging/stale sibling directories behind after a successful build", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], certDir);

        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it("rejects an empty modes array without writing anything", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(bundleDir, [], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues).toEqual([{code: "certification-evidence-build-modes-empty", severity: "error", message: expect.any(String)}]);
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("rejects an invalid mode name", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(bundleDir, [{modeName: "not a valid name!", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-mode-name-invalid");
    });

    it("rejects a duplicate mode name", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(
            bundleDir,
            [
                {modeName: "base", seed: "s1", sampleCount: 1},
                {modeName: "base", seed: "s2", sampleCount: 1},
            ],
            certDir,
        );

        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-duplicate-mode-name");
    });

    it("rejects mode names differing only in case", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(
            bundleDir,
            [
                {modeName: "base", seed: "s1", sampleCount: 1},
                {modeName: "BASE", seed: "s2", sampleCount: 1},
            ],
            certDir,
        );

        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-mode-name-case-collision");
    });

    it("rejects an empty seed", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "", sampleCount: 1}], certDir);

        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-seed-invalid");
    });

    it("rejects a non-positive sampleCount", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "s", sampleCount: 0}], certDir);

        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-sample-count-invalid");
    });

    it("rejects a mode that doesn't exist in the source bundle", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(bundleDir, [{modeName: "bogus", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-mode-not-found-in-bundle");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("refuses to write anything when the source bundle's own deep validation reports an error", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const failingValidator: OutcomeLibraryBundleValidating = {
            validate: (): Promise<ValidationIssue[]> =>
                Promise.resolve([{code: "outcome-library-bundle-hash-mismatch", severity: "error", message: "boom"}]),
        };
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, failingValidator);

        const result = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("outcome-library-bundle-hash-mismatch");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("reports a clear error when the source bundle's manifest can't be read at all", async () => {
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(path.join(tmpRoot, "does-not-exist"), [{modeName: "base", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-source-bundle-manifest-unreadable");
    });

    it("embeds the source bundle's own deep validation issues verbatim in the manifest", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest!.deepValidation.issues).toEqual([]);
        expect(result.manifest!.deepValidation.ranAt).toBe(result.manifest!.generatedAt);
    });

    it("produces the same evidenceContentHash regardless of generatedAt or the source bundle's own path (deterministic content identity)", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const bundleDirCopy = path.join(tmpRoot, "bundle-copy");
        copyDirectoryShallow(bundleDir, bundleDirCopy);
        const modes: CertificationEvidenceBundleModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 10}];

        const builderA = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
        const builderB = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, () => new Date("2027-06-15T12:00:00.000Z"));

        const resultA = await builderA.buildFromBundle(bundleDir, modes, path.join(tmpRoot, "cert-a"));
        const resultB = await builderB.buildFromBundle(bundleDirCopy, modes, path.join(tmpRoot, "cert-b"));

        expect(resultA.manifest!.generatedAt).not.toBe(resultB.manifest!.generatedAt);
        expect(resultA.manifest!.sourceBundleDir).not.toBe(resultB.manifest!.sourceBundleDir);
        expect(resultA.manifest!.evidenceContentHash).toBe(resultB.manifest!.evidenceContentHash);
    });

    it("aborts without writing anything when the source bundle drifts between the initial snapshot and the final pre-publish check", async () => {
        await buildSourceOutcomeLibraryBundle(bundleDir, ["base"]);
        const realReader = new OutcomeLibraryBundleReader();
        let readManifestCalls = 0;
        // Simulates a concurrent rebuild landing exactly between the initial snapshot (capture before
        // sampling) and the final pre-publish re-check (both of which call readManifest — see
        // CertificationEvidenceBundleBuilder.detectSourceBundleDrift) by actually rewriting the bundle on disk
        // via the real writer right before the second call's own read.
        const driftingReader: OutcomeLibraryBundleReading = {
            readManifest: async (dir: string) => {
                readManifestCalls++;
                if (readManifestCalls === 2) {
                    await new OutcomeLibraryBundleWriter(CERTIFICATION_TEST_POKIE_VERSION).writeToDirectory(
                        [buildOutcomeLibraryBundleModeInput("base", "base-lib-drifted")],
                        dir,
                    );
                }
                return realReader.readManifest(dir);
            },
            readModeIndex: (dir, modeName) => realReader.readModeIndex(dir, modeName),
            iterateModeOutcomes: (dir, modeName) => realReader.iterateModeOutcomes(dir, modeName),
            readOutcomeById: (dir, modeName, id) => realReader.readOutcomeById(dir, modeName, id),
            drawOutcome: (dir, modeName, randomSource) => realReader.drawOutcome(dir, modeName, randomSource),
            readLibrary: (dir, modeName) => realReader.readLibrary(dir, modeName),
        };

        const builder = new CertificationEvidenceBundleBuilder(CERTIFICATION_TEST_POKIE_VERSION, driftingReader);
        const result = await builder.buildFromBundle(bundleDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-evidence-build-source-bundle-drift");
        expect(fs.existsSync(certDir)).toBe(false);
    });
});

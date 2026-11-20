import {ensureAtomicDirectoryExchange} from "../testUtils/atomicDirectoryExchange.js";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
    CertificationPackBuildCancelledError,
    CertificationPackBuilder,
    CertificationPackManifest,
    CertificationPackModeSampleInput,
    CertificationPackValidating,
    CertificationPackSampleRecord,
    computeRoundRecordHash,
    OutcomeLibraryFolderReader,
    OutcomeLibraryFolderReading,
    OutcomeLibraryFolderValidating,
    OutcomeLibraryFolderWriter,
    ValidationIssue,
} from "@fromstan/pokie";
import {buildOutcomeLibraryFolderModeInput} from "../weightedoutcome/folder/OutcomeLibraryFolderTestFixtures.js";
import {buildSourceOutcomeLibraryFolder, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationPackTestFixtures.js";

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

function readSampleLines(certDir: string, samplesFile: string): CertificationPackSampleRecord[] {
    return fs
        .readFileSync(path.join(certDir, samplesFile), "utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as CertificationPackSampleRecord);
}

ensureAtomicDirectoryExchange();

describe("CertificationPackBuilder", () => {
    let tmpRoot: string;
    let libraryDir: string;
    let certDir: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cert-bundle-builder-"));
        libraryDir = path.join(tmpRoot, "folder");
        certDir = path.join(tmpRoot, "certification");
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("builds a certification bundle whose manifest reuses the source bundle's own hash/metrics verbatim", async () => {
        const writeResult = await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const sourceModeEntry = writeResult.manifest!.modes[0];

        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        const modes: CertificationPackModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 10}];
        const result = await builder.buildFromBundle(libraryDir, modes, certDir);

        expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(result.manifest).toBeDefined();
        const manifest = result.manifest as CertificationPackManifest;

        expect(manifest.game).toEqual(writeResult.manifest!.game);
        expect(manifest.artifactPokieVersion).toBe(writeResult.manifest!.artifactPokieVersion);
        expect(manifest.sourceLibraryDir).toBe(libraryDir);
        expect(manifest.modes).toHaveLength(1);

        const modeEntry = manifest.modes[0];
        expect(modeEntry.libraryHash).toBe(sourceModeEntry.libraryHash);
        expect(modeEntry.outcomeCount).toBe(sourceModeEntry.outcomeCount);
        expect(modeEntry.totalWeight).toBe(sourceModeEntry.totalWeight);
        expect(modeEntry.analysis).toEqual(sourceModeEntry.analysis);
        expect(modeEntry.sampleSeed).toBe("cert-seed-1");
        expect(modeEntry.sampleCount).toBe(10);
        expect(modeEntry.samplesFile).toBe("samples_base.jsonl");

        expect([...result.files].sort()).toEqual(["manifest.json", "samples_base.jsonl", "pack.json", "pack.txt", "pack.md", "pack.html", "pack.pdf"].sort());
        for (const file of result.files) {
            expect(fs.existsSync(path.join(certDir, file))).toBe(true);
        }
    });

    it.each(["Rendering pdf", "Publishing pack"])("cancels at %s without publishing or replacing an empty destination", async stage => {
        await buildSourceOutcomeLibraryFolder(libraryDir);
        fs.mkdirSync(certDir);
        const inode = fs.statSync(certDir).ino;
        const controller = new AbortController();
        const build = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION).buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 2}], certDir, {
            signal: controller.signal, onStage: current => {
                if (current !== stage) return;
                setImmediate(() => controller.abort());
            },
        });
        await expect(build).rejects.toBeInstanceOf(CertificationPackBuildCancelledError);
        expect(fs.statSync(certDir).ino).toBe(inode);
        expect(fs.readdirSync(certDir)).toEqual([]);
        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it("rejects source drift queued at the final publication yield", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir);
        const result = await new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION).buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 2}], certDir, {
            onStage: stage => {
                if (stage !== "Publishing pack") return;
                setImmediate(() => {
                    const file = path.join(libraryDir, "manifest.json");
                    const source = JSON.parse(fs.readFileSync(file, "utf8"));
                    source.generatedAt = "changed-at-commit";
                    fs.writeFileSync(file, JSON.stringify(source));
                });
            },
        });
        expect(result.manifest).toBeUndefined();
        expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "certification-pack-build-source-bundle-drift"})]));
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("reports PDF write and cleanup failures without a successful pack", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, undefined,
            (file, contents) => {
                if (file.endsWith(".pdf")) throw new Error("PDF write failed");
                fs.writeFileSync(file, contents);

            });
        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 2}], certDir)).rejects.toThrow("PDF write failed");
        expect(fs.existsSync(certDir)).toBe(false);
        const cleanupFails = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            directory => {
                if (directory.includes(".staging-")) throw new Error("cleanup probe");
                fs.rmSync(directory, {recursive: true, force: true});

            });
        await expect(cleanupFails.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 2}], certDir)).rejects.toThrow(/staging cleanup failed.*cleanup probe/);
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("refuses invalid templates, source overlap and forged replacement authorization", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir);
        const templateFile = path.join(tmpRoot, "bad-template.json");
        fs.writeFileSync(templateFile, JSON.stringify({schemaVersion: 999}));
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir, {output: {templateFile}});
        expect(result).toMatchObject({manifest: undefined, files: [], issues: [{code: "certification-pack-input-invalid"}]});
        expect(fs.existsSync(certDir)).toBe(false);
        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], path.join(libraryDir, "nested"))).rejects.toThrow(/overlap/);
        fs.mkdirSync(certDir);
        fs.writeFileSync(path.join(certDir, "manifest.json"), JSON.stringify({generatedBy: "pokie certification build"}));
        const before = fs.readFileSync(path.join(certDir, "manifest.json"));
        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir)).rejects.toThrow(/new or empty/);
        expect(fs.readFileSync(path.join(certDir, "manifest.json"))).toEqual(before);
    });

    it("writes sample records cross-checkable against the source bundle's own index recordHash/artifact", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 12}], certDir);

        const modeEntry = result.manifest!.modes[0];
        const records = readSampleLines(certDir, modeEntry.samplesFile);
        expect(records).toHaveLength(12);

        const reader = new OutcomeLibraryFolderReader();
        const index = await reader.readModeIndex(libraryDir, "base");

        records.forEach((record, position) => {
            expect(record.sampleIndex).toBe(position);
            expect(record.modeName).toBe("base");
            expect(record.seed).toBe("cert-seed-1");
            expect(record.artifactHash).toBe(computeRoundRecordHash(record.artifact));

            const indexEntry = index.entries.find((entry) => entry.id === record.outcomeId);
            expect(indexEntry).toBeDefined();
            expect(record.weight).toBe(indexEntry!.weight);
            expect(record.recordHash).toBe(indexEntry!.recordHash);
        });

        const recomputedSamplesHash = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(path.join(certDir, modeEntry.samplesFile))).digest("hex")}`;
        expect(modeEntry.samplesHash).toBe(recomputedSamplesHash);
    });

    it("produces a byte-identical sample sequence for the same bundle/seed (deterministic output)", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const fixedNow = () => new Date("2026-07-15T00:00:00.000Z");

        const certDirA = path.join(tmpRoot, "certification-a");
        const certDirB = path.join(tmpRoot, "certification-b");
        const modes: CertificationPackModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 25}];

        const builderA = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, fixedNow);
        const builderB = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, fixedNow);

        await builderA.buildFromBundle(libraryDir, modes, certDirA);
        await builderB.buildFromBundle(libraryDir, modes, certDirB);

        expect(fs.readFileSync(path.join(certDirA, "manifest.json"), "utf-8")).toBe(fs.readFileSync(path.join(certDirB, "manifest.json"), "utf-8"));
        expect(fs.readFileSync(path.join(certDirA, "samples_base.jsonl"), "utf-8")).toBe(fs.readFileSync(path.join(certDirB, "samples_base.jsonl"), "utf-8"));
    });

    it("produces a different sample id sequence for a different seed", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const resultA = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "seed-a", sampleCount: 25}], path.join(tmpRoot, "cert-a"));
        const resultB = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "seed-b", sampleCount: 25}], path.join(tmpRoot, "cert-b"));

        const idsA = readSampleLines(path.join(tmpRoot, "cert-a"), resultA.manifest!.modes[0].samplesFile).map((record) => record.outcomeId);
        const idsB = readSampleLines(path.join(tmpRoot, "cert-b"), resultB.manifest!.modes[0].samplesFile).map((record) => record.outcomeId);
        expect(idsA).not.toEqual(idsB);
    });

    it("leaves no stray temp/staging/stale sibling directories behind after a successful build", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], certDir);

        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it.each([false, true])("cancels after observing published files (existing empty destination: %s)", async existing => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        if (existing) fs.mkdirSync(certDir);
        const identity = existing ? fs.statSync(certDir).ino : undefined;
        const controller = new AbortController();
        let observed = false;
        const builder = new CertificationPackBuilder(
            CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, undefined,
            undefined, undefined, undefined, undefined, undefined, undefined,
            () => {
                expect(JSON.parse(fs.readFileSync(path.join(certDir, "manifest.json"), "utf8"))).toHaveProperty("evidenceContentHash");
                expect(fs.readFileSync(path.join(certDir, "pack.pdf")).toString()).toContain("%PDF-1.4");
                observed = true;
                controller.abort();
            },
        );
        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], certDir, {signal: controller.signal}))
            .rejects.toThrow(CertificationPackBuildCancelledError);
        expect(observed).toBe(true);
        if (existing) {
            expect(fs.statSync(certDir).ino).toBe(identity);
            expect(fs.readdirSync(certDir)).toEqual([]);
        } else expect(fs.existsSync(certDir)).toBe(false);
        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it.each([[false, "replacement"], [true, "replacement"], [false, "rewrite"], [true, "rewrite"]] as const)("rejects same-name mutation after installation and preserves the competing file (empty: %s, %s)", async (existing, mutation) => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        if (existing) fs.mkdirSync(certDir);
        const identity = existing ? fs.statSync(certDir).ino : undefined;
        const builder = new CertificationPackBuilder(
            CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, undefined,
            undefined, undefined, undefined, undefined, undefined, undefined,
            () => {
                const member = path.join(certDir, "pack.pdf");
                if (mutation === "replacement") fs.unlinkSync(member);
                fs.writeFileSync(member, "competing replacement");
            },
        );
        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir)).rejects.toThrow(/claimed|ownership changed/);
        expect(fs.readdirSync(certDir)).toEqual(["pack.pdf"]);
        expect(fs.readFileSync(path.join(certDir, "pack.pdf"), "utf8")).toBe("competing replacement");
        if (existing) expect(fs.statSync(certDir).ino).toBe(identity);
        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it("passes cancellation into deep validation and stops before sampling", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const controller = new AbortController();
        const validate = jest.fn((_dir: string, options?: {signal?: AbortSignal; throwIfAborted?: () => void}) => {
            expect(options?.signal).toBe(controller.signal);
            controller.abort();
            options?.throwIfAborted?.();
            return Promise.resolve([]);
        });
        const onSample = jest.fn();
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, {validate});
        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir, {signal: controller.signal, onSample})).rejects.toThrow(CertificationPackBuildCancelledError);
        expect(onSample).not.toHaveBeenCalled();
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("yields within a large single mode so cancellation stops sampling and cleans staging", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const controller = new AbortController();
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        let sampled = 0;

        await expect(builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 512}], certDir, {
            signal: controller.signal,
            onSample: (completed) => {
                sampled = completed;
                // This timer can only run if the sampling loop gives the event loop a turn.
                if (completed === 32) setTimeout(() => controller.abort(), 0);
            },
        })).rejects.toThrow(CertificationPackBuildCancelledError);

        expect(sampled).toBeGreaterThanOrEqual(32);
        expect(sampled).toBeLessThan(512);
        expect(fs.existsSync(certDir)).toBe(false);
        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it("rejects an empty modes array without writing anything", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(libraryDir, [], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues).toEqual([{code: "certification-pack-build-modes-empty", severity: "error", message: expect.any(String)}]);
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("rejects an invalid mode name", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "not a valid name!", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-mode-name-invalid");
    });

    it("rejects a duplicate mode name", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(
            libraryDir,
            [
                {modeName: "base", seed: "s1", sampleCount: 1},
                {modeName: "base", seed: "s2", sampleCount: 1},
            ],
            certDir,
        );

        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-duplicate-mode-name");
    });

    it("rejects mode names differing only in case", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(
            libraryDir,
            [
                {modeName: "base", seed: "s1", sampleCount: 1},
                {modeName: "BASE", seed: "s2", sampleCount: 1},
            ],
            certDir,
        );

        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-mode-name-case-collision");
    });

    it("rejects an empty seed", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "", sampleCount: 1}], certDir);

        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-seed-invalid");
    });

    it("rejects a non-positive sampleCount", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 0}], certDir);

        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-sample-count-invalid");
    });

    it("rejects a mode that doesn't exist in the source bundle", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "bogus", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-mode-not-found-in-bundle");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("refuses to write anything when the source bundle's own deep validation reports an error", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const failingValidator: OutcomeLibraryFolderValidating = {
            validate: (): Promise<ValidationIssue[]> =>
                Promise.resolve([{code: "outcome-library-folder-hash-mismatch", severity: "error", message: "boom"}]),
        };
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, failingValidator);

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("outcome-library-folder-hash-mismatch");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("reports a clear error when the source bundle's manifest can't be read at all", async () => {
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(path.join(tmpRoot, "does-not-exist"), [{modeName: "base", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-source-bundle-manifest-unreadable");
    });

    it("embeds the source bundle's own deep validation issues verbatim in the manifest", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 1}], certDir);

        expect(result.manifest!.deepValidation.issues).toEqual([]);
        expect(result.manifest!.deepValidation.ranAt).toBe(result.manifest!.generatedAt);
    });

    it("produces the same evidenceContentHash regardless of generatedAt or the source bundle's own path (deterministic content identity)", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const libraryDirCopy = path.join(tmpRoot, "bundle-copy");
        copyDirectoryShallow(libraryDir, libraryDirCopy);
        const modes: CertificationPackModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 10}];

        const builderA = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
        const builderB = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, undefined, undefined, undefined, () => new Date("2027-06-15T12:00:00.000Z"));

        const resultA = await builderA.buildFromBundle(libraryDir, modes, path.join(tmpRoot, "cert-a"));
        const resultB = await builderB.buildFromBundle(libraryDirCopy, modes, path.join(tmpRoot, "cert-b"));

        expect(resultA.manifest!.generatedAt).not.toBe(resultB.manifest!.generatedAt);
        expect(resultA.manifest!.sourceLibraryDir).not.toBe(resultB.manifest!.sourceLibraryDir);
        expect(resultA.manifest!.evidenceContentHash).toBe(resultB.manifest!.evidenceContentHash);
    });

    it("aborts without writing anything when the source bundle drifts between the initial snapshot and the final pre-publish check", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const realReader = new OutcomeLibraryFolderReader();
        let readManifestCalls = 0;
        // Simulates a concurrent rebuild landing exactly between the initial snapshot (capture before
        // sampling) and the final pre-publish re-check (both of which call readManifest — see
        // CertificationPackBuilder.detectSourceBundleDrift) by actually rewriting the bundle on disk
        // via the real writer right before the second call's own read.
        const driftingReader: OutcomeLibraryFolderReading = {
            readManifest: async (dir: string) => {
                readManifestCalls++;
                if (readManifestCalls === 2) {
                    await new OutcomeLibraryFolderWriter(CERTIFICATION_TEST_POKIE_VERSION).writeToDirectory(
                        [buildOutcomeLibraryFolderModeInput("base", "base-lib-drifted")],
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

        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, driftingReader);
        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-source-bundle-drift");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("succeeds unaffected when the source bundle changes and reverts back to its exact original bytes before any sampling reads it again", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const backupDir = path.join(tmpRoot, "bundle-backup");
        copyDirectoryShallow(libraryDir, backupDir);

        const realReader = new OutcomeLibraryFolderReader();
        let readManifestCalls = 0;
        // Intercepts only the very first readManifest call (the initial snapshot, before readModeIndexes or any
        // sampling runs) to simulate the bundle transiently changing and reverting back to its exact original
        // bytes entirely within that window — proving sampling (which pins one in-memory index snapshot per
        // mode and never re-reads it) is completely unaffected either way, and the final pre-publish check
        // (seeing the bundle back in its original state) reports no drift.
        const flickeringReader: OutcomeLibraryFolderReading = {
            readManifest: async (dir: string) => {
                readManifestCalls++;
                if (readManifestCalls === 1) {
                    await new OutcomeLibraryFolderWriter(CERTIFICATION_TEST_POKIE_VERSION).writeToDirectory(
                        [buildOutcomeLibraryFolderModeInput("base", "base-lib-transient")],
                        dir,
                    );
                    for (const file of fs.readdirSync(backupDir)) {
                        fs.copyFileSync(path.join(backupDir, file), path.join(dir, file));
                    }
                }
                return realReader.readManifest(dir);
            },
            readModeIndex: (dir, modeName) => realReader.readModeIndex(dir, modeName),
            iterateModeOutcomes: (dir, modeName) => realReader.iterateModeOutcomes(dir, modeName),
            readOutcomeById: (dir, modeName, id) => realReader.readOutcomeById(dir, modeName, id),
            drawOutcome: (dir, modeName, randomSource) => realReader.drawOutcome(dir, modeName, randomSource),
            readLibrary: (dir, modeName) => realReader.readLibrary(dir, modeName),
        };

        const modes: CertificationPackModeSampleInput[] = [{modeName: "base", seed: "cert-seed-1", sampleCount: 10}];
        const cleanResult = await new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION).buildFromBundle(
            libraryDir,
            modes,
            path.join(tmpRoot, "cert-clean"),
        );
        const flickeringResult = await new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, flickeringReader).buildFromBundle(
            libraryDir,
            modes,
            path.join(tmpRoot, "cert-flickering"),
        );

        expect(flickeringResult.manifest).toBeDefined();
        expect(flickeringResult.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(flickeringResult.manifest!.evidenceContentHash).toBe(cleanResult.manifest!.evidenceContentHash);
    });

    it("detects index drift at the final pre-publish check even when the index's own libraryHash field is left unchanged", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const realReader = new OutcomeLibraryFolderReader();
        let readModeIndexCalls = 0;
        // The first readModeIndex call (the initial, pre-sampling snapshot) sees the real index untouched, so
        // sampling itself proceeds against genuine content; every call after that (the final pre-publish
        // re-check) sees two entries' own byteOffset/byteLength/recordHash swapped, while "libraryHash" — a
        // single string field elsewhere in the same object — is left completely untouched, simulating a
        // hand-tampered index file a libraryHash-only comparison would never catch.
        const tamperedFinalIndexReader: OutcomeLibraryFolderReading = {
            readManifest: (dir) => realReader.readManifest(dir),
            readModeIndex: async (dir, modeName) => {
                readModeIndexCalls++;
                const realIndex = await realReader.readModeIndex(dir, modeName);
                if (readModeIndexCalls <= 1) {
                    return realIndex;
                }
                const [first, second] = realIndex.entries;
                const swapped = realIndex.entries.map((entry, index) => {
                    if (index === 0) {
                        return {...entry, byteOffset: second.byteOffset, byteLength: second.byteLength, recordHash: second.recordHash};
                    }
                    if (index === 1) {
                        return {...entry, byteOffset: first.byteOffset, byteLength: first.byteLength, recordHash: first.recordHash};
                    }
                    return entry;
                });
                return {...realIndex, entries: swapped};
            },
            iterateModeOutcomes: (dir, modeName) => realReader.iterateModeOutcomes(dir, modeName),
            readOutcomeById: (dir, modeName, id) => realReader.readOutcomeById(dir, modeName, id),
            drawOutcome: (dir, modeName, randomSource) => realReader.drawOutcome(dir, modeName, randomSource),
            readLibrary: (dir, modeName) => realReader.readLibrary(dir, modeName),
        };

        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION, tamperedFinalIndexReader);
        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-build-source-bundle-drift");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("aborts without publishing when the staging directory itself fails self-validation", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const failingSelfValidator: CertificationPackValidating = {
            validate: () => Promise.resolve([{code: "certification-pack-bundle-content-hash-mismatch", severity: "error", message: "forced failure for this test"}]),
        };
        const builder = new CertificationPackBuilder(
            CERTIFICATION_TEST_POKIE_VERSION,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            failingSelfValidator,
        );

        const result = await builder.buildFromBundle(libraryDir, [{modeName: "base", seed: "s", sampleCount: 3}], certDir);

        expect(result.manifest).toBeUndefined();
        expect(result.issues.map((issue) => issue.code)).toContain("certification-pack-bundle-content-hash-mismatch");
        expect(fs.existsSync(certDir)).toBe(false);
    });

    it("preserves a late claimant at the shared commit boundary and publishes on a clean retry", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        let claimOnCommit = true;
        const builder = new CertificationPackBuilder(
            CERTIFICATION_TEST_POKIE_VERSION,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            () => {
                if (!claimOnCommit) return;
                fs.mkdirSync(certDir);
                fs.writeFileSync(path.join(certDir, "caller-owned.txt"), "untouched");
            },
        );
        const modes = [{modeName: "base", seed: "cert-seed-1", sampleCount: 3}];

        await expect(builder.buildFromBundle(libraryDir, modes, certDir)).rejects.toThrow(/claimed/i);
        expect(fs.readFileSync(path.join(certDir, "caller-owned.txt"), "utf-8")).toBe("untouched");
        expect(siblingLeftovers(certDir)).toEqual([]);

        fs.rmSync(certDir, {recursive: true, force: true});
        claimOnCommit = false;
        await expect(builder.buildFromBundle(libraryDir, modes, certDir)).resolves.toMatchObject({outDir: certDir, issues: []});
        expect(fs.existsSync(path.join(certDir, "manifest.json"))).toBe(true);
        expect(siblingLeftovers(certDir)).toEqual([]);
    });

    it("accepts caller-owned empty directories and rejects occupied or symlinked directories", async () => {
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const builder = new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION);
        const modes = [{modeName: "base", seed: "cert-seed-1", sampleCount: 3}];
        fs.mkdirSync(certDir);
        const identity = fs.statSync(certDir).ino;
        await expect(builder.buildFromBundle(libraryDir, modes, certDir)).resolves.toMatchObject({issues: [], manifest: {schemaVersion: 2}});
        expect(fs.statSync(certDir).ino).toBe(identity);
        for (const file of fs.readdirSync(certDir)) fs.unlinkSync(path.join(certDir, file));

        fs.writeFileSync(path.join(certDir, "caller-owned.txt"), "untouched");
        await expect(builder.buildFromBundle(libraryDir, modes, certDir)).rejects.toThrow(/new or empty/);
        expect(fs.readFileSync(path.join(certDir, "caller-owned.txt"), "utf-8")).toBe("untouched");

        const externalDir = path.join(tmpRoot, "external");
        fs.mkdirSync(externalDir);
        fs.rmSync(certDir, {recursive: true, force: true});
        fs.symlinkSync(externalDir, certDir, "dir");
        await expect(builder.buildFromBundle(libraryDir, modes, certDir)).rejects.toThrow(/empty physical directory/i);
        expect(fs.readdirSync(externalDir)).toEqual([]);
    });
});

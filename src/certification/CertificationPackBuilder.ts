import {resolveSafeCertificationPackFilePath} from "./internal/resolveSafeCertificationPackFilePath.js";
import {parseCertificationJson} from "./internal/parseCertificationJson.js";
import {acquireCertificationPack, certificationSourceHash, packHash} from "./internal/acquireCertificationPack.js";
import {CertificationPackRenderer, DEFAULT_CERTIFICATION_PACK_TEMPLATE, validateCertificationPackTemplate} from "./CertificationPackRenderer.js";
import {certificationPackFileName, validateCertificationPackInputs, validateCertificationPackOutput, type CertificationPackTemplate, type CertificationPackFormat, type CertificationPack} from "./CertificationPack.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {computeRoundRecordHash} from "../artifact/computeRoundRecordHash.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {SeededWeightedOutcomeRandomSource} from "../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {capturePublishDirectoryOwnership, preflightAtomicDirectoryPublication, publishDirectoryAtomically, removePublishedDirectoryIfOwned, type PublishedDirectoryOwnership} from "../stakeengine/internal/publishDirectoryAtomically.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {OutcomeLibraryFolderIndex, OutcomeLibraryFolderIndexModeEntry} from "../weightedoutcome/folder/OutcomeLibraryFolderIndex.js";
import type {OutcomeLibraryFolderModeIndex} from "../weightedoutcome/folder/OutcomeLibraryFolderModeIndex.js";
import {OutcomeLibraryFolderReader} from "../weightedoutcome/folder/OutcomeLibraryFolderReader.js";
import type {OutcomeLibraryFolderReading} from "../weightedoutcome/folder/OutcomeLibraryFolderReading.js";
import {OutcomeLibraryFolderValidator} from "../weightedoutcome/folder/OutcomeLibraryFolderValidator.js";
import type {OutcomeLibraryFolderValidating} from "../weightedoutcome/folder/OutcomeLibraryFolderValidating.js";
import {readAndVerifyOutcomeAtByteRange} from "../weightedoutcome/folder/internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "../weightedoutcome/folder/internal/selectIndexEntryByCumulativeWeight.js";
import {computeCertificationPackContentHash} from "./computeCertificationPackContentHash.js";
import {
    CERTIFICATION_PACK_INDEX_SCHEMA_VERSION,
    type CertificationPackIndex,
    type CertificationPackModeEntry,
} from "./CertificationPackIndex.js";
import type {CertificationPackBuildResult} from "./CertificationPackBuildResult.js";
import {CertificationPackBuildCancelledError, type CertificationPackBuildOptions} from "./CertificationPackBuildOptions.js";
import type {CertificationPackBuilding} from "./CertificationPackBuilding.js";
import type {CertificationPackModeSampleInput} from "./CertificationPackModeSampleInput.js";
import {CertificationPackValidator} from "./CertificationPackValidator.js";
import type {CertificationPackValidating} from "./CertificationPackValidating.js";
import type {CertificationPackSampleRecord} from "./CertificationPackSampleRecord.js";
import {isPositiveSafeInteger, MODE_NAME_PATTERN} from "./internal/certificationPackBundleShapeGuards.js";
import {assertSafeToReplaceCertificationPackDirectory} from "./internal/assertSafeToReplaceCertificationPackDirectory.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

function hashManifest(manifest: OutcomeLibraryFolderIndex): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(manifest)));
}

function assertNotCancelled(options: CertificationPackBuildOptions | undefined): void {
    if (options?.signal?.aborted) throw new CertificationPackBuildCancelledError();
}

// The exact hash of a whole mode index, not just its own libraryHash field — closes a gap a libraryHash-only
// comparison would leave open: libraryHash is itself just one field *inside* the index, so a hand-tampered index
// file could have its entries (byteOffset/byteLength/recordHash, even their order) rewritten while the
// libraryHash *string* is left untouched. Hashing the whole object makes that indistinguishable from any other
// content change.
function hashIndex(index: OutcomeLibraryFolderModeIndex): string {
    return sha256OfBytes(JSON.stringify(toCanonicalJson(index)));
}

// Builds a canonical POKIE certification/evidence bundle *on top of* an already-built, already-valid Outcome
// Library Bundle — deliberately never a second calculation path: every hash/metric this writes is either read
// verbatim off the source bundle's own manifest.json (libraryHash/outcomeCount/totalWeight/analysis), or
// produced by selecting and reading samples directly against one pinned-in-memory snapshot of a mode's own
// index (see "Pinned-snapshot sampling" below) — the exact same selection/verification algorithms the
// pre-generated runtime and OutcomeLibraryFolderReader themselves use, just invoked directly against a snapshot
// this class captured itself, rather than through a wrapper that would re-read the index on every call. Refuses
// to write anything (the same "no partial artifact" guarantee OutcomeLibraryFolderWriter and StakeEngineExporter
// already carry) if the source bundle itself doesn't deep-validate cleanly — evidence built on top of a library
// that doesn't even validate against its own rules can't be trusted either.
//
// Pinned-snapshot sampling: each requested mode's own index is read exactly ONCE, before any sampling begins,
// and held in memory for the rest of the build — every one of that mode's sampleCount draws selects an entry
// (via selectIndexEntryByCumulativeWeight, the exact same cumulative-weight walk OutcomeLibraryFolderReader.
// drawOutcome uses internally) against that SAME captured OutcomeLibraryFolderModeIndex object, then reads and
// verifies that exact entry's own byte range (via readAndVerifyOutcomeAtByteRange, the same byte-range read +
// recordHash check readOutcomeById/drawOutcome themselves rely on) directly — never through drawOutcome, which
// would re-read a fresh index on every single call and could therefore observe a different snapshot mid-mode.
//
// Snapshot consistency: the source bundle's own manifest and each sampled mode's own index are hashed *exactly*
// (the whole object, not just one field) once, before any sampling begins, and re-read and compared again right
// before publishing — a bundle directory is plain files on disk, not a transaction, so this before/after
// comparison is the compensating control against the source bundle being rebuilt or otherwise mutated while
// sampling was in progress. Any drift detected there aborts the whole build (nothing is written), the same way
// a deep-validation error does.
//
// Publish-time self-check: immediately before publishing, the fully-assembled staging directory is itself
// validated via CertificationPackValidating — an internal inconsistency there (a bug in this class
// producing a manifest that doesn't hash to its own evidenceContentHash, say) aborts the publish exactly like
// any other error, rather than ever making a broken bundle visible at outDir.
export class CertificationPackBuilder<T extends string | number = string> implements CertificationPackBuilding {
    private readonly pokieVersion: string;
    private readonly reader: OutcomeLibraryFolderReading<T>;
    private readonly bundleValidator: OutcomeLibraryFolderValidating;
    private readonly randomSourceFactory: (seed: string) => WeightedOutcomeRandomSource;
    private readonly now: () => Date;
    private readonly writeFile: (filePath: string, contents: string | Buffer) => void;
    private readonly readFileBytes: (filePath: string) => Buffer;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;
    private readonly selfValidator: CertificationPackValidating;
    private readonly beforeCommit: (() => void) | undefined;
    private readonly afterCommit: (() => void) | undefined;

    constructor(
        pokieVersion: string,
        reader: OutcomeLibraryFolderReading<T> = new OutcomeLibraryFolderReader<T>(),
        bundleValidator: OutcomeLibraryFolderValidating = new OutcomeLibraryFolderValidator(),
        randomSourceFactory: (seed: string) => WeightedOutcomeRandomSource = (seed) => new SeededWeightedOutcomeRandomSource(seed),
        now: () => Date = () => new Date(),
        writeFile: (filePath: string, contents: string | Buffer) => void = (filePath, contents) => fs.writeFileSync(filePath, contents),
        readFileBytes: (filePath: string) => Buffer = (filePath) => fs.readFileSync(filePath),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
        // Appended last (rather than grouped next to bundleValidator) so existing positional constructor calls
        // never shift — see every other constructor parameter above.
        selfValidator: CertificationPackValidating = new CertificationPackValidator(),
        // Lets the direct builder contract test the final shared-publication
        // boundary while preserving the production writer's single path.
        beforeCommit: (() => void) | undefined = undefined,
        afterCommit: (() => void) | undefined = undefined,
    ) {
        this.pokieVersion = pokieVersion;
        this.reader = reader;
        this.bundleValidator = bundleValidator;
        this.randomSourceFactory = randomSourceFactory;
        this.now = now;
        this.writeFile = writeFile;
        this.readFileBytes = readFileBytes;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
        this.selfValidator = selfValidator;
        this.beforeCommit = beforeCommit;
        this.afterCommit = afterCommit;
    }

    public async buildFromBundle(
        libraryDir: string,
        modes: readonly CertificationPackModeSampleInput[],
        outDir: string,
        options?: CertificationPackBuildOptions,
    ): Promise<CertificationPackBuildResult> {
        assertNotCancelled(options);
        // Ownership is a publication precondition, not a post-sampling
        // cleanup decision. This leaves an external directory untouched and
        // avoids allocating adjacent staging output for a refused request.
        assertSafeToReplaceCertificationPackDirectory(outDir);
        const physical = (file: string): string => {
            const absolute = path.resolve(file);
            if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
            return path.join(physical(path.dirname(absolute)), path.basename(absolute));
        };
        const outputIdentity = physical(outDir);
        for (const input of [libraryDir, options?.pack?.modelSource, ...(options?.pack?.reportFiles ?? []), ...(options?.pack?.replayFiles ?? []), options?.output?.templateFile]) {
            if (!input) continue;
            const inputIdentity = physical(input);
            if (inputIdentity === outputIdentity || inputIdentity.startsWith(outputIdentity + path.sep) || outputIdentity.startsWith(inputIdentity + path.sep)) throw new Error("Certification source/output overlap is not permitted, including symlink aliases.");
        }
        const destinationOwnership = capturePublishDirectoryOwnership(outDir);
        preflightAtomicDirectoryPublication(outDir, true);
        const upfrontIssues = this.validateModesInput(modes);
        if (upfrontIssues.some((issue) => issue.severity === "error")) {
            return {outDir, files: [], manifest: undefined, issues: upfrontIssues};
        }

        let sourceManifest: OutcomeLibraryFolderIndex;
        try {
            if (!resolveSafeCertificationPackFilePath(libraryDir, "manifest.json")) throw new Error("Source manifest is missing, symlinked or unsafe.");
            sourceManifest = await this.reader.readManifest(libraryDir);
        } catch (error) {
            return this.failed(outDir, upfrontIssues, [
                {
                    code: "certification-pack-build-source-bundle-manifest-unreadable",
                    severity: "error",
                    message: `Could not read "${libraryDir}"'s own manifest.json: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ]);
        }
        if (sourceManifest.files.some(file => !resolveSafeCertificationPackFilePath(libraryDir, file))) return this.failed(outDir, upfrontIssues, [{code: "certification-pack-source-unsafe", severity: "error", message: "Source inventory contains a missing, symlinked or escaping file."}]);
        const initialManifestHash = hashManifest(sourceManifest);

        const deepValidationIssues = await this.bundleValidator.validate(libraryDir, {deep: true, signal: options?.signal, throwIfAborted: () => assertNotCancelled(options)});
        assertNotCancelled(options);
        if (deepValidationIssues.some((issue) => issue.severity === "error")) {
            return this.failed(outDir, upfrontIssues, deepValidationIssues);
        }

        const missingModeIssues: ValidationIssue[] = [];
        for (const modeInput of modes) {
            if (sourceManifest.modes.every((entry) => entry.modeName !== modeInput.modeName)) {
                missingModeIssues.push({
                    code: "certification-pack-build-mode-not-found-in-bundle",
                    severity: "error",
                    message: `mode "${modeInput.modeName}" is not present in "${libraryDir}"'s own manifest.json.`,
                    details: {modeName: modeInput.modeName},
                });
            }
        }
        if (missingModeIssues.length > 0) {
            return this.failed(outDir, upfrontIssues, [...deepValidationIssues, ...missingModeIssues]);
        }

        // Snapshot capture: each requested mode's own index, read exactly once, before any sampling begins —
        // every draw for that mode selects/reads against this same in-memory object (see sampleMode), and its
        // exact hash (not just its own libraryHash field) is re-checked once more right before publishing (see
        // detectSourceBundleDrift).
        let initialIndexes: Map<string, OutcomeLibraryFolderModeIndex>;
        try {
            initialIndexes = await this.readModeIndexes(libraryDir, modes);
        } catch (error) {
            return this.failed(outDir, upfrontIssues, [
                ...deepValidationIssues,
                {
                    code: "certification-pack-build-source-bundle-index-unreadable",
                    severity: "error",
                    message: `Could not read a requested mode's own index in "${libraryDir}": ${error instanceof Error ? error.message : String(error)}.`,
                },
            ]);
        }

        assertNotCancelled(options);
        options?.onStage?.("Acquiring model and evidence");
        let pack;
        let templateArtifactHash: string | null = null;
        let template: CertificationPackTemplate = DEFAULT_CERTIFICATION_PACK_TEMPLATE;
        const formats: readonly CertificationPackFormat[] = options?.output?.formats ?? ["json", "console", "markdown", "html", "pdf"];
        try {
            validateCertificationPackInputs(options?.pack ?? {});
            validateCertificationPackOutput(options?.output ?? {});
            if (!formats.length || new Set(formats).size !== formats.length || formats.some(format => !["json", "console", "markdown", "html", "pdf"].includes(format))) throw new Error("Pack formats must be a nonempty unique selection of json, console, markdown, html, pdf; YAML is unimplemented.");
            if (options?.output?.templateFile) {
                certificationSourceHash(options.output.templateFile);
                templateArtifactHash = sha256OfBytes(fs.readFileSync(options.output.templateFile));
                template = parseCertificationJson(fs.readFileSync(options.output.templateFile, "utf8")) as CertificationPackTemplate;
            }
            validateCertificationPackTemplate(template);
            pack = await acquireCertificationPack(sourceManifest, initialManifestHash, options?.pack, options?.signal, libraryDir);
        } catch (error) {
            if (error instanceof Error && (/cleanup failed/).test(error.message)) throw error;
            assertNotCancelled(options);
            return this.failed(outDir, upfrontIssues, [{code: "certification-pack-input-invalid", severity: "error", message: error instanceof Error ? error.message : String(error)}]);
        }
        const presentation = {template, templateHash: packHash(template), templateArtifactHash, formats};
        const stagingDir = `${outDir}.staging-${crypto.randomBytes(6).toString("hex")}`;
        fs.mkdirSync(stagingDir, {recursive: true});
        let publication: PublishedDirectoryOwnership | undefined;
        try {
            const modeEntries: CertificationPackModeEntry[] = [];
            const totalSamples = modes.reduce((total, mode) => total + mode.sampleCount, 0);
            let completedSamples = 0;
            for (const modeInput of modes) {
                assertNotCancelled(options);
                // Safe: checked to exist against sourceManifest.modes above.
                const sourceEntry = sourceManifest.modes.find((entry) => entry.modeName === modeInput.modeName)!;
                // Safe: captured for every requested mode in readModeIndexes above.
                const capturedIndex = initialIndexes.get(modeInput.modeName)!;
                modeEntries.push(await this.sampleMode(libraryDir, modeInput, sourceEntry, capturedIndex, stagingDir, options, () => {
                    completedSamples++;
                    options?.onSample?.(completedSamples, totalSamples);
                }));
            }

            const driftIssue = await this.detectSourceBundleDrift(libraryDir, modes, initialManifestHash, initialIndexes);
            if (driftIssue !== undefined) {
                return this.failed(outDir, upfrontIssues, [...deepValidationIssues, driftIssue]);
            }

            const relativeFiles = [...modeEntries.map((entry) => entry.samplesFile), ...formats.map(certificationPackFileName), "manifest.json"];
            const generatedAt = this.now().toISOString();

            const draftManifest = {
                pack,
                presentation,
                schemaVersion: CERTIFICATION_PACK_INDEX_SCHEMA_VERSION,
                generatedBy: "pokie certification build",
                pokieVersion: this.pokieVersion,
                game: sourceManifest.game,
                ...(sourceManifest.configHash !== undefined ? {configHash: sourceManifest.configHash} : {}),
                artifactPokieVersion: sourceManifest.artifactPokieVersion,
                sourceLibraryManifestHash: initialManifestHash,
                modes: modeEntries,
                deepValidation: {ranAt: generatedAt, issues: deepValidationIssues},
                files: relativeFiles,
            };
            const manifest: CertificationPackIndex = {
                ...draftManifest,
                generatedAt,
                sourceLibraryDir: libraryDir,
                evidenceContentHash: computeCertificationPackContentHash(draftManifest),
            };
            const renderer = new CertificationPackRenderer();
            for (const format of formats) {
                assertNotCancelled(options);
                options?.onStage?.(`Rendering ${format}`);
                const rendered = await renderer.render(manifest, format, template, options?.signal);
                this.writeFile(path.join(stagingDir, certificationPackFileName(format)), rendered);
            }
            assertNotCancelled(options);
            this.writeFile(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);

            // Publish-time self-check: validates the fully-assembled staging directory exactly the way any
            // other consumer would validate a published bundle — an internal inconsistency here is a bug in
            // this class, not a caller error, but it must never make it to outDir either way.
            const stagingIssues = await this.selfValidator.validate(stagingDir, options?.signal);
            assertNotCancelled(options);
            if (stagingIssues.some((issue) => issue.severity === "error")) {
                return this.failed(outDir, upfrontIssues, [...deepValidationIssues, ...stagingIssues]);
            }

            assertNotCancelled(options);
            // Reacquire every explicit authority before commit, closing changes during sampling/rendering.
            const finalPack = await acquireCertificationPack(sourceManifest, initialManifestHash, options?.pack, options?.signal, libraryDir);
            if (packHash(finalPack) !== packHash(pack)) throw new Error("Pack trusted sources changed before publication.");
            if (options?.output?.templateFile && (packHash(parseCertificationJson(fs.readFileSync(options.output.templateFile, "utf8"))) !== presentation.templateHash || sha256OfBytes(fs.readFileSync(options.output.templateFile)) !== templateArtifactHash)) throw new Error("Template changed before publication.");
            options?.onStage?.("Publishing pack");
            // Let a host deliver cancellation queued during the last source/reproduction check.
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
            assertNotCancelled(options);
            this.assertAuthorityBytesUnchanged(pack, templateArtifactHash, options);
            const finalSourceDrift = await this.detectSourceBundleDrift(libraryDir, modes, initialManifestHash, initialIndexes);
            if (finalSourceDrift) return this.failed(outDir, upfrontIssues, [finalSourceDrift]);
            assertNotCancelled(options);
            const published = publishDirectoryAtomically({
                outDir,
                ownership: destinationOwnership,
                preserveEmptyDestination: true,
                renameDirectory: this.renameDirectory,
                removeDirectory: this.removeDirectory,
                beforeCommit: () => {
                    this.beforeCommit?.();
                    assertNotCancelled(options);

                },
                afterCommit: this.afterCommit,
                writeFilesIntoTempDir: (tempDir) => {
                    for (const file of relativeFiles) {
                        this.renameDirectory(path.join(stagingDir, file), path.join(tempDir, file));
                    }
                },
            });
            publication = published.publication;
            const artifactHashes = Object.fromEntries(relativeFiles.map(file => [file, sha256OfBytes(this.readFileBytes(path.join(outDir, file)))]));
            assertNotCancelled(options);

            const finalIssues = [...upfrontIssues, ...deepValidationIssues];
            if (published.cleanupWarning !== undefined) {
                finalIssues.push({code: "certification-pack-build-stale-cleanup-failed", severity: "warning", message: published.cleanupWarning, details: {outDir}});
            }

            return {outDir, files: relativeFiles, artifactHashes, manifest, issues: finalIssues, publication};
        } catch (error) {
            if (publication !== undefined) {
                if (!removePublishedDirectoryIfOwned(publication)) throw new Error(`Certification rollback cleanup failed at "${outDir}": publication ownership changed; preserve competing files and inspect the retained output. Original failure: ${String(error)}`);
                publication = undefined;
            }
            throw error;
        } finally {
            this.cleanupStaging(stagingDir, publication);
        }
    }

    private assertAuthorityBytesUnchanged(pack: CertificationPack, templateArtifactHash: string | null, options?: CertificationPackBuildOptions): void {
        const inputs = options?.pack;
        const modelHash = inputs?.modelSource ? certificationSourceHash(inputs.modelSource) : null;
        if (modelHash !== pack.identity.modelArtifactHash) throw new Error("Model bytes changed before pack commit.");
        const reports = inputs?.reportFiles ?? [], 
            replays = inputs?.replayFiles ?? [];
        if (reports.length !== pack.statistics.estimates.length || replays.length !== pack.reproduction.recordings.length) throw new Error("Evidence selection changed before pack commit.");
        const attachments = [...reports.map((file, index) => ({file, hash: pack.statistics.estimates[index].hash})), ...replays.map((file, index) => ({file, hash: pack.reproduction.recordings[index].hash}))];
        for (const {file, hash} of attachments) {
            certificationSourceHash(file);
            if (sha256OfBytes(fs.readFileSync(file)) !== hash) throw new Error("Evidence attachment bytes changed before pack commit.");
        }
        const templateFile = options?.output?.templateFile;
        if (templateFile) certificationSourceHash(templateFile);
        if ((templateFile ? sha256OfBytes(fs.readFileSync(templateFile)) : null) !== templateArtifactHash) throw new Error("Template bytes changed before pack commit.");
    }

    private cleanupStaging(stagingDir: string, publication?: PublishedDirectoryOwnership): void {
        try {
            this.removeDirectory(stagingDir);
        } catch (error) {
            if (publication !== undefined) removePublishedDirectoryIfOwned(publication);
            throw new Error(`Certification staging cleanup failed at "${stagingDir}": ${error instanceof Error ? error.message : String(error)}. Inspect and remove only this operation-owned staging directory before retrying.`);
        }
    }

    // outDir is never created/touched for any of these failure paths — every one of them returns before
    // publishDirectoryAtomically is ever called.
    private failed(outDir: string, upfrontIssues: readonly ValidationIssue[], rest: readonly ValidationIssue[]): CertificationPackBuildResult {
        return {outDir, files: [], manifest: undefined, issues: [...upfrontIssues, ...rest]};
    }

    private async readModeIndexes(
        libraryDir: string,
        modes: readonly CertificationPackModeSampleInput[],
    ): Promise<Map<string, OutcomeLibraryFolderModeIndex>> {
        const indexes = new Map<string, OutcomeLibraryFolderModeIndex>();
        for (const modeInput of modes) {
            indexes.set(modeInput.modeName, await this.reader.readModeIndex(libraryDir, modeInput.modeName));
        }
        return indexes;
    }

    // Re-reads the source bundle's own manifest and each sampled mode's own index, comparing the exact hash of
    // each against the snapshot captured before sampling began — never just one field (like libraryHash) picked
    // out of the index, which a hand-tampered index (entries reordered/rewritten, its libraryHash field left
    // stale) could otherwise slip past. Returns the drift ValidationIssue if anything differs, or a read itself
    // fails (the source bundle disappearing mid-sample is drift too), or undefined if the snapshot held.
    private async detectSourceBundleDrift(
        libraryDir: string,
        modes: readonly CertificationPackModeSampleInput[],
        initialManifestHash: string,
        initialIndexes: ReadonlyMap<string, OutcomeLibraryFolderModeIndex>,
    ): Promise<ValidationIssue | undefined> {
        let finalManifest: OutcomeLibraryFolderIndex;
        try {
            finalManifest = await this.reader.readManifest(libraryDir);
        } catch (error) {
            return {
                code: "certification-pack-build-source-bundle-drift",
                severity: "error",
                message: `the source bundle at "${libraryDir}" could no longer be read after sampling (${error instanceof Error ? error.message : String(error)}); refusing to publish evidence against a possibly-inconsistent snapshot.`,
            };
        }
        if (hashManifest(finalManifest) !== initialManifestHash) {
            return {
                code: "certification-pack-build-source-bundle-drift",
                severity: "error",
                message: `the source bundle's own manifest.json at "${libraryDir}" changed while evidence was being sampled; refusing to publish evidence against an inconsistent snapshot.`,
            };
        }

        for (const modeInput of modes) {
            let finalIndex: OutcomeLibraryFolderModeIndex;
            try {
                finalIndex = await this.reader.readModeIndex(libraryDir, modeInput.modeName);
            } catch (error) {
                return {
                    code: "certification-pack-build-source-bundle-drift",
                    severity: "error",
                    message: `mode "${modeInput.modeName}"'s own index in "${libraryDir}" could no longer be read after sampling (${error instanceof Error ? error.message : String(error)}); refusing to publish evidence against a possibly-inconsistent snapshot.`,
                    details: {modeName: modeInput.modeName},
                };
            }
            // Safe: every requested mode's index was captured in initialIndexes before sampling began.
            const initialIndex = initialIndexes.get(modeInput.modeName)!;
            if (hashIndex(finalIndex) !== hashIndex(initialIndex)) {
                return {
                    code: "certification-pack-build-source-bundle-drift",
                    severity: "error",
                    message: `mode "${modeInput.modeName}"'s own index in "${libraryDir}" changed while evidence was being sampled; refusing to publish evidence against an inconsistent snapshot.`,
                    details: {modeName: modeInput.modeName},
                };
            }
        }

        return undefined;
    }

    // Samples "modeInput.sampleCount" outcomes deterministically from "index" — a snapshot already captured
    // before this call, never re-read here or by anything this method calls. Each draw:
    // 1. selects a winning index entry via selectIndexEntryByCumulativeWeight against index.entries (the exact
    //    same cumulative-weight walk OutcomeLibraryFolderReader.drawOutcome uses internally, invoked directly
    //    against the pinned snapshot rather than through a wrapper that would re-read a fresh index);
    // 2. reads and verifies that exact entry's own byte range via readAndVerifyOutcomeAtByteRange (the same
    //    byte-range read + recordHash check readOutcomeById/drawOutcome themselves rely on) — never drawOutcome
    //    itself, which would re-read the index on every single call.
    // Sampling uses a captured in-memory index, so yielding does not weaken the snapshot guarantee.  It does,
    // however, let the server receive cancellation while a single very large mode is still being sampled.
    private async sampleMode(
        libraryDir: string,
        modeInput: CertificationPackModeSampleInput,
        sourceEntry: OutcomeLibraryFolderIndexModeEntry,
        index: OutcomeLibraryFolderModeIndex,
        stagingDir: string,
        options: CertificationPackBuildOptions | undefined,
        onSample: () => void,
    ): Promise<CertificationPackModeEntry> {
        const randomSource = this.randomSourceFactory(modeInput.seed);
        const outcomesFilePath = path.join(libraryDir, index.outcomesFile);

        const lines: string[] = [];
        for (let sampleIndex = 0; sampleIndex < modeInput.sampleCount; sampleIndex++) {
            assertNotCancelled(options);
            const winningEntry = selectIndexEntryByCumulativeWeight(modeInput.modeName, index.entries, randomSource);
            const outcome = readAndVerifyOutcomeAtByteRange<T>(modeInput.modeName, outcomesFilePath, winningEntry);

            const record: CertificationPackSampleRecord<T> = {
                modeName: modeInput.modeName,
                sampleIndex,
                seed: modeInput.seed,
                outcomeId: outcome.id,
                weight: outcome.weight,
                recordHash: winningEntry.recordHash,
                artifactHash: computeRoundRecordHash(outcome.artifact),
                artifact: outcome.artifact,
            };
            lines.push(`${JSON.stringify(toCanonicalJson(record))}\n`);
            onSample();
            // A macrotask, rather than a resolved Promise, is intentional: the HTTP cancellation request
            // must be able to run between batches.  Keep the batch modest enough to make progress truthful
            // without turning normal certification runs into one event-loop turn per sample.
            if ((sampleIndex + 1) % 32 === 0) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                assertNotCancelled(options);
            }
        }

        const samplesFile = `samples_${modeInput.modeName}.jsonl`;
        const samplesPath = path.join(stagingDir, samplesFile);
        this.writeFile(samplesPath, lines.join(""));
        const samplesHash = sha256OfBytes(this.readFileBytes(samplesPath));

        return {
            modeName: modeInput.modeName,
            betMode: sourceEntry.betMode,
            stake: sourceEntry.stake,
            libraryId: sourceEntry.libraryId,
            libraryHash: sourceEntry.libraryHash,
            outcomeCount: sourceEntry.outcomeCount,
            totalWeight: sourceEntry.totalWeight,
            analysis: sourceEntry.analysis,
            sampleSeed: modeInput.seed,
            sampleCount: modeInput.sampleCount,
            samplesFile,
            samplesHash,
        };
    }

    private validateModesInput(modes: readonly CertificationPackModeSampleInput[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        if (modes.length === 0) {
            issues.push({code: "certification-pack-build-modes-empty", severity: "error", message: "at least one mode must be given."});
            return issues;
        }

        const seenExact = new Map<string, number>();
        const seenCaseInsensitive = new Map<string, string>();
        for (const modeInput of modes) {
            if (!MODE_NAME_PATTERN.test(modeInput.modeName)) {
                issues.push({
                    code: "certification-pack-build-mode-name-invalid",
                    severity: "error",
                    message: `mode name "${modeInput.modeName}" must match ${MODE_NAME_PATTERN}.`,
                    details: {modeName: modeInput.modeName},
                });
                continue;
            }

            const priorCount = seenExact.get(modeInput.modeName) ?? 0;
            seenExact.set(modeInput.modeName, priorCount + 1);
            if (priorCount > 0) {
                issues.push({
                    code: "certification-pack-build-duplicate-mode-name",
                    severity: "error",
                    message: `mode name "${modeInput.modeName}" is used by more than one mode.`,
                    details: {modeName: modeInput.modeName},
                });
                continue;
            }

            const lowerCased = modeInput.modeName.toLowerCase();
            const priorCasing = seenCaseInsensitive.get(lowerCased);
            if (priorCasing !== undefined) {
                issues.push({
                    code: "certification-pack-build-mode-name-case-collision",
                    severity: "error",
                    message: `mode names "${priorCasing}" and "${modeInput.modeName}" differ only in case.`,
                    details: {modeName: modeInput.modeName},
                });
                continue;
            }
            seenCaseInsensitive.set(lowerCased, modeInput.modeName);

            if (typeof modeInput.seed !== "string" || modeInput.seed.trim().length === 0) {
                issues.push({
                    code: "certification-pack-build-seed-invalid",
                    severity: "error",
                    message: `mode "${modeInput.modeName}": seed must be a non-empty string.`,
                    details: {modeName: modeInput.modeName},
                });
            }

            if (!isPositiveSafeInteger(modeInput.sampleCount)) {
                issues.push({
                    code: "certification-pack-build-sample-count-invalid",
                    severity: "error",
                    message: `mode "${modeInput.modeName}": sampleCount must be a positive safe integer.`,
                    details: {modeName: modeInput.modeName},
                });
            }
        }

        return issues;
    }
}

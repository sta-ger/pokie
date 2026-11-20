import {CertificationPackBuildCancelledError} from "./CertificationPackBuildOptions.js";
import {certificationPackFileName} from "./CertificationPack.js";
import {parseCertificationJson} from "./internal/parseCertificationJson.js";
import {CertificationPackRenderer, validateCertificationPackTemplate} from "./CertificationPackRenderer.js";
import {packHash} from "./internal/acquireCertificationPack.js";
import {validateCertificationPack} from "./internal/validateCertificationPack.js";
import fs from "fs";
import path from "path";
import {computeRoundRecordHash} from "../artifact/computeRoundRecordHash.js";
import type {RoundRecord} from "../artifact/RoundRecord.js";
import {RoundRecordValidator} from "../artifact/RoundRecordValidator.js";
import {resolveSafeCertificationPackFilePath} from "./internal/resolveSafeCertificationPackFilePath.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {computeCertificationPackContentHash} from "./computeCertificationPackContentHash.js";
import {computeCertificationSampleRecordHash} from "./computeCertificationSampleRecordHash.js";
import {CERTIFICATION_PACK_INDEX_SCHEMA_VERSION, type CertificationPackModeEntry} from "./CertificationPackIndex.js";
import type {CertificationPackValidating} from "./CertificationPackValidating.js";
import {isModeEntryShape, isManifestShape, isNonEmptyString, isSampleRecordShape, MODE_NAME_PATTERN} from "./internal/certificationPackBundleShapeGuards.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// Validates a candidate certification/evidence bundle directory *by itself* — never throws (top-level
// catch-all "certification-pack-bundle-malformed"), mirroring OutcomeLibraryFolderValidator's own
// never-throw contract, except explicit cancellation. Reads index.json plus every mode's own samples_<modeName>.jsonl, recomputing:
// - the whole manifest's own evidenceContentHash (covers schemaVersion/pokieVersion/game/configHash/
//   artifactPokieVersion/sourceLibraryManifestHash/every mode's own metrics+samplesHash/deep-validation issues in
//   one unified check — see computeCertificationPackContentHash);
// - each mode's own samplesHash, over the exact bytes of its samples file (never a second, differently-derived
//   hash);
// - each sample's own recordHash, recomputed from its own {outcomeId, weight, artifact} — see
//   computeCertificationSampleRecordHash — the same hash an Outcome Library Bundle's own index entry carries;
// - each sample's own artifactHash, via computeRoundRecordHash — the same content hash every other
//   RoundRecord consumer in this codebase computes and compares;
// - each sample's own artifact against RoundRecordValidator — never a second definition of "a valid
//   RoundRecord".
// Deliberately doesn't (and can't) check whether this evidence still reflects the *current* state of the
// source Outcome Library Bundle it was built from — that needs the source bundle to still be reachable, and is
// exactly what CertificationPackVerifying adds on top of this validator.
export class CertificationPackValidator implements CertificationPackValidating {
    public async validate(certDir: string, signal?: AbortSignal): Promise<ValidationIssue[]> {
        try {
            return await this.validateInternal(certDir, signal);
        } catch (error) {
            if (signal?.aborted || error instanceof CertificationPackBuildCancelledError) throw new CertificationPackBuildCancelledError();
            return Promise.resolve([
                {
                    code: "certification-pack-bundle-malformed",
                    severity: "error",
                    message: `"${certDir}" could not be validated as a certification/evidence bundle: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ]);
        }
    }

    private async validateInternal(certDir: string, signal?: AbortSignal): Promise<ValidationIssue[]> {
        checkCancellation(signal);
        const manifestPath = path.join(certDir, "index.json");
        if (!fs.existsSync(manifestPath)) {
            return [{code: "certification-pack-bundle-manifest-missing", severity: "error", message: `"${manifestPath}" does not exist.`}];
        }

        if (resolveSafeCertificationPackFilePath(certDir, "index.json") === undefined) throw new Error("Unsafe manifest path.");
        let raw: string;
        try {
            raw = fs.readFileSync(manifestPath, "utf-8");
        } catch (error) {
            return [
                {
                    code: "certification-pack-bundle-manifest-unreadable",
                    severity: "error",
                    message: `could not read "${manifestPath}": ${error instanceof Error ? error.message : String(error)}.`,
                },
            ];
        }

        let parsed: unknown;
        try {
            parsed = parseCertificationJson(raw);
        } catch (error) {
            return [
                {
                    code: "certification-pack-bundle-manifest-invalid-json",
                    severity: "error",
                    message: `"${manifestPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ];
        }

        if (!isManifestShape(parsed)) {
            return [
                {
                    code: "certification-pack-bundle-manifest-malformed",
                    severity: "error",
                    message: `"${manifestPath}" does not match the expected CertificationPackIndex shape.`,
                },
            ];
        }

        if (parsed.schemaVersion !== CERTIFICATION_PACK_INDEX_SCHEMA_VERSION) {
            return [
                {
                    code: "certification-pack-bundle-manifest-schema-version-unsupported",
                    severity: "error",
                    message: `"${manifestPath}" has schemaVersion ${String(parsed.schemaVersion)}, expected ${CERTIFICATION_PACK_INDEX_SCHEMA_VERSION}.`,
                },
            ];
        }

        const manifest = parsed;
        const issues: ValidationIssue[] = [];
        try {
            validateCertificationPack(manifest.pack, manifest);
            const presentation = manifest.presentation;
            if (Object.keys(presentation).sort().join(",") !== "formats,template,templateArtifactHash,templateHash") throw new Error("Unknown pack presentation fields.");
            validateCertificationPackTemplate(presentation.template);
            if (presentation.templateArtifactHash !== null && !(/^sha256:[a-f0-9]{64}$/).test(presentation.templateArtifactHash)) throw new Error("Invalid template raw artifact identity.");
            if (packHash(presentation.template) !== presentation.templateHash || !Array.isArray(presentation.formats) || !presentation.formats.length || new Set(presentation.formats).size !== presentation.formats.length) throw new Error("Invalid template identity or formats.");
            for (const format of presentation.formats) {
                checkCancellation(signal);
                const file = resolveSafeCertificationPackFilePath(certDir, certificationPackFileName(format));
                if (!file) throw new Error("Unsafe pack output path.");
                const expected = await new CertificationPackRenderer().render(manifest, format, presentation.template, signal);
                checkCancellation(signal);
                if (!fs.readFileSync(file).equals(Buffer.from(expected))) throw new Error(`Rendered ${format} differs from canonical pack; regenerate all requested files.`);
            }
        } catch (error) {
            checkCancellation(signal);
            issues.push({code: "certification-pack-invalid", severity: "error", message: error instanceof Error ? error.message : String(error)});
        }

        try {
            const recomputedContentHash = computeCertificationPackContentHash(manifest);
            if (recomputedContentHash !== manifest.evidenceContentHash) {
                issues.push({
                    code: "certification-pack-bundle-content-hash-mismatch",
                    severity: "error",
                    message: `"${manifestPath}" does not hash to its own recorded evidenceContentHash — some field of the manifest (game/configHash/artifactPokieVersion/sourceLibraryManifestHash/a mode's own metrics or samplesHash/deep-validation issues) was changed since this evidence was built.`,
                });
            }
        } catch (error) {
            issues.push({
                code: "certification-pack-bundle-content-hash-not-computable",
                severity: "error",
                message: `"${manifestPath}" can't be re-canonicalized to recompute its own evidenceContentHash: ${error instanceof Error ? error.message : String(error)}.`,
            });
        }

        const seenExact = new Set<string>();
        const seenCaseInsensitive = new Map<string, string>();
        for (const modeEntry of manifest.modes) {
            checkCancellation(signal);
            if (!isModeEntryShape(modeEntry)) {
                issues.push({
                    code: "certification-pack-bundle-mode-field-invalid",
                    severity: "error",
                    message: `index.json has a "modes" entry that doesn't match the expected shape: ${JSON.stringify(modeEntry)}.`,
                });
                continue;
            }

            if (!MODE_NAME_PATTERN.test(modeEntry.modeName)) {
                issues.push({
                    code: "certification-pack-bundle-mode-name-invalid",
                    severity: "error",
                    message: `mode name "${modeEntry.modeName}" must match ${MODE_NAME_PATTERN}.`,
                    details: {modeName: modeEntry.modeName},
                });
                continue;
            }
            if (seenExact.has(modeEntry.modeName)) {
                issues.push({
                    code: "certification-pack-bundle-duplicate-mode-name",
                    severity: "error",
                    message: `mode name "${modeEntry.modeName}" is used by more than one mode.`,
                    details: {modeName: modeEntry.modeName},
                });
                continue;
            }
            seenExact.add(modeEntry.modeName);

            const lowerCased = modeEntry.modeName.toLowerCase();
            const priorCasing = seenCaseInsensitive.get(lowerCased);
            if (priorCasing !== undefined) {
                issues.push({
                    code: "certification-pack-bundle-mode-name-case-collision",
                    severity: "error",
                    message: `mode names "${priorCasing}" and "${modeEntry.modeName}" differ only in case.`,
                    details: {modeName: modeEntry.modeName},
                });
                continue;
            }
            seenCaseInsensitive.set(lowerCased, modeEntry.modeName);

            if (modeEntry.samplesFile !== `samples_${modeEntry.modeName}.jsonl`) {
                issues.push({
                    code: "certification-pack-bundle-mode-filename-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": samplesFile "${modeEntry.samplesFile}" isn't exactly "samples_${modeEntry.modeName}.jsonl".`,
                    details: {modeName: modeEntry.modeName},
                });
                continue;
            }

            const safeSamplesPath = fs.existsSync(path.join(certDir, modeEntry.samplesFile)) ? resolveSafeCertificationPackFilePath(certDir, modeEntry.samplesFile) : path.join(certDir, modeEntry.samplesFile);
            if (safeSamplesPath === undefined) {
                issues.push({
                    code: "certification-pack-bundle-path-unsafe",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": samplesFile "${modeEntry.samplesFile}" is not a safe filename.`,
                    details: {modeName: modeEntry.modeName},
                });
                continue;
            }

            await this.validateSamplesFile(safeSamplesPath, modeEntry, issues, signal);
        }

        this.validateFilesInventory(certDir, manifest, issues);

        return issues;
    }

    private async validateSamplesFile(samplesPath: string, modeEntry: CertificationPackModeEntry, issues: ValidationIssue[], signal?: AbortSignal): Promise<void> {
        if (!fs.existsSync(samplesPath)) {
            issues.push({
                code: "certification-pack-bundle-samples-file-missing",
                severity: "error",
                message: `mode "${modeEntry.modeName}": "${modeEntry.samplesFile}" does not exist.`,
                details: {modeName: modeEntry.modeName},
            });
            return;
        }

        const bytes = fs.readFileSync(samplesPath);
        if (sha256OfBytes(bytes) !== modeEntry.samplesHash) {
            issues.push({
                code: "certification-pack-bundle-samples-hash-mismatch",
                severity: "error",
                message: `mode "${modeEntry.modeName}": "${modeEntry.samplesFile}" content doesn't hash to its own recorded samplesHash.`,
                details: {modeName: modeEntry.modeName},
            });
        }

        const lines = bytes
            .toString("utf-8")
            .split("\n")
            .filter((line) => line.length > 0);
        if (lines.length !== modeEntry.sampleCount) {
            issues.push({
                code: "certification-pack-bundle-sample-count-mismatch",
                severity: "error",
                message: `mode "${modeEntry.modeName}": "${modeEntry.samplesFile}" has ${lines.length} sample line(s), expected ${modeEntry.sampleCount}.`,
                details: {modeName: modeEntry.modeName},
            });
        }

        for (const [position, line] of lines.entries()) {
            if (position % 32 === 0) await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            checkCancellation(signal);
            let parsedLine: unknown;
            try {
                parsedLine = parseCertificationJson(line);
            } catch (error) {
                issues.push({
                    code: "certification-pack-bundle-sample-line-invalid-json",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position} of "${modeEntry.samplesFile}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
                    details: {modeName: modeEntry.modeName, position},
                });
                continue;
            }

            if (!isSampleRecordShape(parsedLine)) {
                issues.push({
                    code: "certification-pack-bundle-sample-line-malformed",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position} of "${modeEntry.samplesFile}" doesn't match the expected sample record shape.`,
                    details: {modeName: modeEntry.modeName, position},
                });
                continue;
            }

            if (parsedLine.sampleIndex !== position) {
                issues.push({
                    code: "certification-pack-bundle-sample-index-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own sampleIndex is ${parsedLine.sampleIndex}, expected ${position}.`,
                    details: {modeName: modeEntry.modeName, position},
                });
            }
            if (parsedLine.modeName !== modeEntry.modeName) {
                issues.push({
                    code: "certification-pack-bundle-sample-mode-name-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own modeName is "${parsedLine.modeName}".`,
                    details: {modeName: modeEntry.modeName, position},
                });
            }
            if (parsedLine.seed !== modeEntry.sampleSeed) {
                issues.push({
                    code: "certification-pack-bundle-sample-seed-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own seed doesn't match this mode's recorded sampleSeed.`,
                    details: {modeName: modeEntry.modeName, position},
                });
            }

            try {
                const recomputedRecordHash = computeCertificationSampleRecordHash({id: parsedLine.outcomeId, weight: parsedLine.weight, artifact: parsedLine.artifact});
                if (recomputedRecordHash !== parsedLine.recordHash) {
                    issues.push({
                        code: "certification-pack-bundle-sample-record-hash-mismatch",
                        severity: "error",
                        message: `mode "${modeEntry.modeName}": line ${position}'s own {outcomeId, weight, artifact} doesn't hash to its own recorded recordHash.`,
                        details: {modeName: modeEntry.modeName, position},
                    });
                }
            } catch (error) {
                issues.push({
                    code: "certification-pack-bundle-sample-record-not-json-safe",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own {outcomeId, weight, artifact} can't be re-canonicalized: ${error instanceof Error ? error.message : String(error)}.`,
                    details: {modeName: modeEntry.modeName, position},
                });
            }

            let recomputedArtifactHash: string;
            try {
                recomputedArtifactHash = computeRoundRecordHash(parsedLine.artifact as RoundRecord);
            } catch (error) {
                issues.push({
                    code: "certification-pack-bundle-sample-artifact-not-json-safe",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own artifact can't be re-canonicalized: ${error instanceof Error ? error.message : String(error)}.`,
                    details: {modeName: modeEntry.modeName, position},
                });
                continue;
            }
            if (recomputedArtifactHash !== parsedLine.artifactHash) {
                issues.push({
                    code: "certification-pack-bundle-sample-artifact-hash-mismatch",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own artifact doesn't hash to its own recorded artifactHash.`,
                    details: {modeName: modeEntry.modeName, position},
                });
            }

            const artifactIssues = new RoundRecordValidator().validate(parsedLine.artifact as RoundRecord);
            if (artifactIssues.some((issue) => issue.severity === "error")) {
                issues.push({
                    code: "certification-pack-bundle-sample-artifact-invalid",
                    severity: "error",
                    message: `mode "${modeEntry.modeName}": line ${position}'s own artifact fails RoundRecordValidator.`,
                    details: {modeName: modeEntry.modeName, position, issues: artifactIssues},
                });
            }
        }
    }

    private validateFilesInventory(certDir: string, manifest: import("./CertificationPackIndex.js").CertificationPackIndex, issues: ValidationIssue[]): void {
        const expected = new Set<string>(["index.json", ...manifest.modes.map((modeEntry) => modeEntry.samplesFile), ...(Array.isArray(manifest.presentation.formats) ? manifest.presentation.formats.map(certificationPackFileName) : [])]);
        const seen = new Set<string>();

        for (const file of manifest.files) {
            if (!isNonEmptyString(file)) {
                issues.push({
                    code: "certification-pack-bundle-manifest-files-invalid",
                    severity: "error",
                    message: `index.json's "files" entry is not a non-empty string: ${JSON.stringify(file)}.`,
                });
                continue;
            }
            if (seen.has(file)) {
                issues.push({
                    code: "certification-pack-bundle-manifest-files-duplicate",
                    severity: "error",
                    message: `index.json's "files" lists "${file}" more than once.`,
                });
                continue;
            }
            seen.add(file);

            if (resolveSafeCertificationPackFilePath(certDir, file) === undefined) {
                issues.push({
                    code: "certification-pack-bundle-manifest-files-entry-unsafe",
                    severity: "error",
                    message: `index.json's "files" entry "${file}" is missing or not a safe physical file.`,
                });
            }

            if (!expected.has(file)) {
                issues.push({
                    code: "certification-pack-bundle-manifest-files-unexpected-entry",
                    severity: "error",
                    message: `index.json's "files" lists "${file}", which isn't "index.json" or any current mode's own samplesFile.`,
                });
            }
        }

        for (const file of fs.readdirSync(certDir)) {
            if (!expected.has(file)) issues.push({code: "certification-pack-bundle-unexpected-file", severity: "error", message: `Unexpected pack file: ${file}`});
        }
        for (const file of expected) {
            if (!seen.has(file)) {
                issues.push({
                    code: "certification-pack-bundle-manifest-files-missing-entry",
                    severity: "error",
                    message: `index.json's "files" is missing "${file}".`,
                });
            }
        }
    }
}

function checkCancellation(signal?: AbortSignal): void {
    if (signal?.aborted) throw new CertificationPackBuildCancelledError();
}

import crypto from "crypto";
import fs from "fs";
import path from "path";
import {RoundArtifactValidator} from "../../artifact/RoundArtifactValidator.js";
import {toCanonicalJson} from "../../json/toCanonicalJson.js";
import {isPositiveSafeInteger} from "../../pregenerated/internal/isPositiveSafeInteger.js";
import {resolveSafeStakeEngineFilePath} from "../../stakeengine/internal/resolveSafeStakeEngineFilePath.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {compareIds} from "../internal/compareIds.js";
import {WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION} from "../WeightedOutcomeLibrary.js";
import {computeOnlineWeightedOutcomeLibraryAnalysis} from "./internal/computeOnlineWeightedOutcomeLibraryAnalysis.js";
import {iterateOutcomesJsonl} from "./internal/iterateOutcomesJsonl.js";
import {readAndVerifyOutcomeAtByteRange} from "./internal/readOutcomeAtByteRange.js";
import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION, type OutcomeLibraryBundleManifest, type OutcomeLibraryBundleManifestModeEntry} from "./OutcomeLibraryBundleManifest.js";
import {OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION, type OutcomeLibraryBundleIndexEntry, type OutcomeLibraryBundleModeIndex} from "./OutcomeLibraryBundleModeIndex.js";
import type {OutcomeLibraryBundleValidateOptions, OutcomeLibraryBundleValidating} from "./OutcomeLibraryBundleValidating.js";

const MODE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const LIBRARY_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidLibraryHash(value: unknown): value is string {
    return typeof value === "string" && LIBRARY_HASH_PATTERN.test(value);
}

// Validates a whole candidate outcome-library bundle directory. Two layers, mirroring the Stake Engine
// import validator's own "structural first, expensive content check opt-in" discipline — but here the split
// matters even more, since the whole point of a streaming bundle is to *avoid* loading everything, so a fast
// structural check must never force a full materialization:
//
// - shallow (default): manifest.json plus every mode's own small index_<modeName>.json — never opens any
//   outcomes_<modeName>.jsonl for content, only a cheap fs.stat size sanity check plus (see validateEntries'
//   caller) an exact byte-layout check of the index's own recorded ranges.
// - deep (opt-in via {deep: true}): additionally streams every outcomes line per mode — never accumulating an
//   array of them, the same end-to-end-streaming discipline OutcomeLibraryBundleWriter itself follows (see
//   internal/computeOnlineWeightedOutcomeLibraryAnalysis) — to catch corruption a byte-layout check alone can't
//   (a record whose content was tampered without changing its byte length, a hash that no longer matches).
//
// Never throws: a top-level catch-all reports "outcome-library-bundle-malformed" instead.
export class OutcomeLibraryBundleValidator<T extends string | number = string> implements OutcomeLibraryBundleValidating {
    private readonly roundArtifactValidator = new RoundArtifactValidator<T>();

    public async validate(bundleDir: string, options?: OutcomeLibraryBundleValidateOptions): Promise<ValidationIssue[]> {
        try {
            return await this.validateInternal(bundleDir, options?.deep ?? false);
        } catch (error) {
            return [
                {
                    code: "outcome-library-bundle-malformed",
                    severity: "error",
                    message: `Outcome library bundle could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private async validateInternal(bundleDir: string, deep: boolean): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];

        const manifest = this.readManifest(bundleDir, issues);
        if (manifest === undefined) {
            return issues;
        }

        for (const modeEntry of manifest.modes) {
            await this.validateMode(bundleDir, manifest, modeEntry, deep, issues);
        }

        return issues;
    }

    private readManifest(bundleDir: string, issues: ValidationIssue[]): OutcomeLibraryBundleManifest | undefined {
        const manifestPath = path.join(bundleDir, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
            issues.push({code: "outcome-library-bundle-manifest-missing", severity: "error", message: `"${bundleDir}" has no manifest.json.`});
            return undefined;
        }

        let raw: string;
        try {
            raw = fs.readFileSync(manifestPath, "utf-8");
        } catch (error) {
            issues.push({
                code: "outcome-library-bundle-manifest-unreadable",
                severity: "error",
                message: `manifest.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
            });
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            issues.push({
                code: "outcome-library-bundle-manifest-invalid-json",
                severity: "error",
                message: `manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            });
            return undefined;
        }

        if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {modes?: unknown}).modes) || (parsed as {modes: unknown[]}).modes.length === 0) {
            issues.push({
                code: "outcome-library-bundle-manifest-malformed",
                severity: "error",
                message: 'manifest.json must be {"modes": [...]} with at least one mode.',
            });
            return undefined;
        }

        const manifest = parsed as OutcomeLibraryBundleManifest;
        if (manifest.schemaVersion !== OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION) {
            issues.push({
                code: "outcome-library-bundle-manifest-schema-version-unsupported",
                severity: "error",
                message: `manifest.json's schemaVersion (${manifest.schemaVersion}) is not supported (expected ${OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION}).`,
            });
            return undefined;
        }

        const modeEntriesOk = this.validateManifestModeEntries(manifest.modes, issues);
        const filesOk = this.validateManifestFiles(manifest, issues);
        if (!modeEntriesOk || !filesOk) {
            return undefined;
        }

        return manifest;
    }

    // Validates every manifest mode entry's own field types (betMode/stake/libraryId/libraryHash/outcomeCount/
    // totalWeight/indexFile/outcomesFile), the mode name itself (format, duplicates, case collisions — the same
    // rules OutcomeLibraryBundleWriteValidator enforces when a bundle is written, checked again here since a
    // hand-edited or otherwise-produced manifest.json was never guaranteed to go through that writer), and the
    // exact filename convention every mode's own indexFile/outcomesFile must follow
    // ("index_<modeName>.json"/"outcomes_<modeName>.jsonl") — not just that they *resolve* safely (see
    // validateMode's own path-safety check), but that they're exactly the filenames this bundle format always
    // uses, so two modes can never be confused for one another via a mismatched or swapped filename.
    private validateManifestModeEntries(rawModes: unknown, issues: ValidationIssue[]): boolean {
        if (!Array.isArray(rawModes)) {
            return false;
        }

        let ok = true;
        const seenNames = new Map<string, string>();

        rawModes.forEach((rawEntry, position) => {
            const entry = rawEntry as Partial<OutcomeLibraryBundleManifestModeEntry> | null;
            if (typeof entry !== "object" || entry === null) {
                issues.push({
                    code: "outcome-library-bundle-manifest-mode-field-invalid",
                    severity: "error",
                    message: `manifest.json's modes[${position}] must be an object.`,
                    details: {position},
                });
                ok = false;
                return;
            }

            if (!this.validateModeName("manifest.json", entry.modeName, position, seenNames, issues)) {
                ok = false;
                return;
            }
            const modeName = entry.modeName as string;

            const fieldInvalid = (field: string, requirement: string): void => {
                issues.push({
                    code: "outcome-library-bundle-manifest-mode-field-invalid",
                    severity: "error",
                    message: `mode "${modeName}": manifest.json's "${field}" ${requirement}.`,
                    details: {modeName, field},
                });
                ok = false;
            };

            if (!isNonEmptyString(entry.betMode)) {
                fieldInvalid("betMode", "must be a non-empty string");
            }
            if (!isFinitePositiveNumber(entry.stake)) {
                fieldInvalid("stake", "must be a finite number > 0");
            }
            if (!isNonEmptyString(entry.libraryId)) {
                fieldInvalid("libraryId", "must be a non-empty string");
            }
            if (!isValidLibraryHash(entry.libraryHash)) {
                fieldInvalid("libraryHash", 'must match "sha256:<64 hex chars>"');
            }
            if (!isPositiveSafeInteger(entry.outcomeCount)) {
                fieldInvalid("outcomeCount", "must be a positive safe integer");
            }
            if (!isPositiveSafeInteger(entry.totalWeight)) {
                fieldInvalid("totalWeight", "must be a positive safe integer");
            }
            if (typeof entry.analysis !== "object" || entry.analysis === null) {
                fieldInvalid("analysis", "must be an object");
            }

            if (!this.validateModeFilename("manifest.json", modeName, "indexFile", `index_${modeName}.json`, entry.indexFile, issues)) {
                ok = false;
            }
            if (!this.validateModeFilename("manifest.json", modeName, "outcomesFile", `outcomes_${modeName}.jsonl`, entry.outcomesFile, issues)) {
                ok = false;
            }
        });

        return ok;
    }

    // Shared mode-name validation: format ([A-Za-z0-9_-]+), duplicates, and case-insensitive collisions —
    // "seenNames" is scoped to one caller's own pass (manifest.json here; a mode index never lists more than its
    // own single mode, so it never needs this).
    private validateModeName(source: string, modeName: unknown, position: number, seenNames: Map<string, string>, issues: ValidationIssue[]): boolean {
        if (!isNonEmptyString(modeName) || !MODE_NAME_PATTERN.test(modeName)) {
            issues.push({
                code: "outcome-library-bundle-mode-name-invalid",
                severity: "error",
                message: `${source}'s modes[${position}] has an invalid modeName (${JSON.stringify(modeName)}); must be a non-empty string matching [A-Za-z0-9_-]+.`,
                details: {position, modeName},
            });
            return false;
        }

        const lowerName = modeName.toLowerCase();
        const existing = seenNames.get(lowerName);
        if (existing === undefined) {
            seenNames.set(lowerName, modeName);
            return true;
        }

        if (existing === modeName) {
            issues.push({
                code: "outcome-library-bundle-duplicate-mode-name",
                severity: "error",
                message: `${source} has more than one mode named "${modeName}".`,
                details: {modeName},
            });
        } else {
            issues.push({
                code: "outcome-library-bundle-mode-name-case-collision",
                severity: "error",
                message: `${source} has modeNames "${modeName}" and "${existing}", which differ only in case and would collide on a case-insensitive filesystem.`,
                details: {modeName, collidesWith: existing},
            });
        }
        return false;
    }

    // A mode's own filename field must be both a *safe* path (never absolute/".."/nested — see
    // resolveSafeStakeEngineFilePath) and *exactly* the filename this bundle format's own naming convention
    // dictates for that field/modeName — never just "some filename that happens to resolve safely".
    private validateModeFilename(source: string, modeName: string, field: string, expected: string, actual: unknown, issues: ValidationIssue[]): boolean {
        if (!isNonEmptyString(actual) || path.basename(actual) !== actual) {
            issues.push({
                code: "outcome-library-bundle-path-unsafe",
                severity: "error",
                message: `mode "${modeName}"'s "${field}" (${JSON.stringify(actual)}) is not a safe filename.`,
                details: {modeName, field},
            });
            return false;
        }
        if (actual !== expected) {
            issues.push({
                code: "outcome-library-bundle-mode-filename-mismatch",
                severity: "error",
                message: `${source}: mode "${modeName}"'s "${field}" ("${actual}") must be exactly "${expected}" — this bundle format's own naming convention, derived from the mode's name.`,
                details: {modeName, field, actual, expected},
            });
            return false;
        }
        return true;
    }

    // Validates manifest.files as an exact, unique set: "manifest.json" itself, and every current mode's own
    // indexFile/outcomesFile — nothing missing, nothing extra, no duplicate or case-colliding entry, and no
    // entry that isn't itself a safe filename. Only runs against modes whose own fields already validated
    // cleanly (validateManifestModeEntries runs first) — an inconsistent files list on top of an already-broken
    // modes array would only add noise, not a new diagnosis.
    private validateManifestFiles(manifest: OutcomeLibraryBundleManifest, issues: ValidationIssue[]): boolean {
        if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.some((file) => typeof file !== "string" || file.trim().length === 0)) {
            issues.push({
                code: "outcome-library-bundle-manifest-files-invalid",
                severity: "error",
                message: 'manifest.json\'s "files" must be present as a non-empty array of non-empty strings.',
            });
            return false;
        }
        if (!Array.isArray(manifest.modes) || manifest.modes.some((mode) => !isNonEmptyString(mode.indexFile) || !isNonEmptyString(mode.outcomesFile))) {
            // Already reported via validateManifestModeEntries — nothing further to check here.
            return false;
        }

        let ok = true;
        const seen = new Map<string, string>();
        const actual = new Set<string>();

        for (const file of manifest.files) {
            const lowerFile = file.toLowerCase();
            const existing = seen.get(lowerFile);
            if (existing !== undefined) {
                issues.push({
                    code: "outcome-library-bundle-manifest-files-duplicate",
                    severity: "error",
                    message:
                        existing === file
                            ? `manifest.json's "files" lists "${file}" more than once.`
                            : `manifest.json's "files" lists "${file}" and "${existing}", which differ only in case and would collide on a case-insensitive filesystem.`,
                    details: {file},
                });
                ok = false;
                continue;
            }
            seen.set(lowerFile, file);

            if (path.basename(file) !== file || file === "." || file === "..") {
                issues.push({
                    code: "outcome-library-bundle-manifest-files-entry-unsafe",
                    severity: "error",
                    message: `manifest.json's "files" entry "${file}" is not a safe filename.`,
                    details: {file},
                });
                ok = false;
                continue;
            }

            actual.add(file);
        }

        const expected = new Set<string>(["manifest.json", ...manifest.modes.flatMap((mode) => [mode.indexFile, mode.outcomesFile])]);

        for (const file of expected) {
            if (!actual.has(file)) {
                issues.push({
                    code: "outcome-library-bundle-manifest-files-missing-entry",
                    severity: "error",
                    message: `manifest.json's "files" is missing the expected entry "${file}".`,
                    details: {file},
                });
                ok = false;
            }
        }
        for (const file of actual) {
            if (!expected.has(file)) {
                issues.push({
                    code: "outcome-library-bundle-manifest-files-unexpected-entry",
                    severity: "error",
                    message: `manifest.json's "files" lists "${file}", which is not manifest.json itself or a current mode's own index/outcomes file.`,
                    details: {file},
                });
                ok = false;
            }
        }

        return ok;
    }

    private async validateMode(
        bundleDir: string,
        manifest: OutcomeLibraryBundleManifest,
        modeEntry: OutcomeLibraryBundleManifestModeEntry,
        deep: boolean,
        issues: ValidationIssue[],
    ): Promise<void> {
        const modeName = modeEntry.modeName;

        const indexPath = isNonEmptyString(modeEntry.indexFile) ? resolveSafeStakeEngineFilePath(bundleDir, modeEntry.indexFile) : undefined;
        const outcomesPath = isNonEmptyString(modeEntry.outcomesFile) ? resolveSafeStakeEngineFilePath(bundleDir, modeEntry.outcomesFile) : undefined;
        if (indexPath === undefined || outcomesPath === undefined) {
            issues.push({
                code: "outcome-library-bundle-path-unsafe",
                severity: "error",
                message: `mode "${modeName}"'s indexFile/outcomesFile is not a safe filename — absolute paths, ".."/nested paths, and anything resolving outside the bundle directory are refused.`,
                details: {modeName},
            });
            return;
        }

        const index = this.readModeIndex(indexPath, modeName, issues);
        if (index === undefined) {
            return;
        }

        if (index.schemaVersion !== OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION) {
            issues.push({
                code: "outcome-library-bundle-mode-index-schema-version-unsupported",
                severity: "error",
                message: `mode "${modeName}": index schemaVersion (${index.schemaVersion}) is not supported (expected ${OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION}).`,
                details: {modeName},
            });
            return;
        }
        if (index.librarySchemaVersion !== WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION) {
            issues.push({
                code: "outcome-library-bundle-mode-index-library-schema-version-unsupported",
                severity: "error",
                message: `mode "${modeName}": index librarySchemaVersion (${index.librarySchemaVersion}) is not supported (expected ${WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION}).`,
                details: {modeName},
            });
            return;
        }
        if (index.modeName !== modeName) {
            issues.push({
                code: "outcome-library-bundle-mode-index-mode-name-mismatch",
                severity: "error",
                message: `mode "${modeName}": index_${modeName}.json's own modeName ("${index.modeName}") does not match manifest.json's for this entry.`,
                details: {modeName},
            });
        }
        if (index.libraryId !== modeEntry.libraryId) {
            issues.push({
                code: "outcome-library-bundle-mode-index-library-id-mismatch",
                severity: "error",
                message: `mode "${modeName}": index_${modeName}.json's libraryId ("${index.libraryId}") does not match manifest.json's ("${modeEntry.libraryId}").`,
                details: {modeName},
            });
        }
        if (index.libraryHash !== modeEntry.libraryHash) {
            issues.push({
                code: "outcome-library-bundle-mode-index-hash-mismatch-with-manifest",
                severity: "error",
                message: `mode "${modeName}": index_${modeName}.json's libraryHash does not match manifest.json's.`,
                details: {modeName},
            });
        }
        if (index.outcomesFile !== modeEntry.outcomesFile) {
            issues.push({
                code: "outcome-library-bundle-mode-index-outcomes-file-mismatch",
                severity: "error",
                message: `mode "${modeName}": index_${modeName}.json's own outcomesFile ("${index.outcomesFile}") does not match manifest.json's ("${modeEntry.outcomesFile}").`,
                details: {modeName},
            });
        }

        const entriesOk = this.validateEntries(modeName, index.entries, issues);
        if (entriesOk) {
            const totalWeight = index.entries.reduce((sum, entry) => sum + entry.weight, 0);
            if (index.entries.length !== index.outcomeCount || index.entries.length !== modeEntry.outcomeCount) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-count-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": index has ${index.entries.length} entries, but recorded outcomeCount is ${index.outcomeCount} (index) / ${modeEntry.outcomeCount} (manifest).`,
                    details: {modeName},
                });
            }
            if (!Number.isSafeInteger(totalWeight)) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-total-weight-overflow",
                    severity: "error",
                    message: `mode "${modeName}": the sum of all index entry weights (${totalWeight}) overflows a safe integer.`,
                    details: {modeName},
                });
            } else if (totalWeight !== index.totalWeight || totalWeight !== modeEntry.totalWeight) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-total-weight-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": the sum of index entry weights (${totalWeight}) does not match the recorded totalWeight (${index.totalWeight} in the index, ${modeEntry.totalWeight} in the manifest).`,
                    details: {modeName},
                });
            }
        }

        let stat: fs.Stats;
        try {
            stat = fs.statSync(outcomesPath);
        } catch {
            issues.push({code: "outcome-library-bundle-outcomes-file-missing", severity: "error", message: `mode "${modeName}": outcomes file is missing.`, details: {modeName}});
            return;
        }

        const layoutOk = entriesOk && this.validateByteLayout(modeName, index.entries, outcomesPath, stat.size, issues);

        if (deep) {
            // Random-access verification trusts the index's own byteOffset/byteLength to point somewhere
            // meaningful, so it only runs once the byte layout itself checked out clean. validateModeDeep, by
            // contrast, streams the outcomes file top to bottom independently of any byte-offset accounting (see
            // iterateOutcomesJsonl) and cross-checks by id — it can, and deliberately does, still run and report
            // real content-level corruption (a duplicate/extra/missing id, a tampered hash) even when the byte
            // layout is itself broken, rather than being silently skipped whenever two different corruptions
            // happen to coincide.
            if (layoutOk) {
                this.validateRandomAccessConsistency(modeName, outcomesPath, index.entries, issues);
            }
            await this.validateModeDeep(outcomesPath, manifest, modeEntry, index, issues);
        }
    }

    // For every index entry, independently reads exactly that entry's own recorded byte range and verifies the
    // record found there really is that entry's own {id, weight} — reusing readAndVerifyOutcomeAtByteRange, the
    // exact same check OutcomeLibraryBundleReader itself relies on before ever handing a caller a drawn/looked-up
    // outcome. This is deliberately independent of validateModeDeep's own sequential per-line pass below: that
    // pass matches every record against the index *by id*, via a map, so it would never notice a file whose
    // lines were physically reordered (or otherwise shifted) while every id/weight still appears somewhere in
    // the file — exactly the corruption a byte-range random-access read (the whole point of this bundle format)
    // would silently return the wrong outcome for.
    private validateRandomAccessConsistency(
        modeName: string,
        outcomesPath: string,
        entries: readonly OutcomeLibraryBundleIndexEntry[],
        issues: ValidationIssue[],
    ): void {
        for (const entry of entries) {
            try {
                readAndVerifyOutcomeAtByteRange(modeName, outcomesPath, entry);
            } catch (error) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-byte-range-mismatch",
                    severity: "error",
                    message: error instanceof Error ? error.message : String(error),
                    details: {modeName, id: entry.id},
                });
            }
        }
    }

    // Verifies the index's own byte ranges genuinely describe the outcomes file's real on-disk layout — never
    // opening a record's own JSON content (that's deep mode's job): every range starts where the previous one's
    // own newline-terminated line ended (so ranges are contiguous, in the same order the entries array is
    // already sorted in — i.e. canonical id order — never overlapping and never leaving a gap), the very first
    // range starts at byte 0, the byte immediately after each range really is a "\n" (confirming a range ends
    // exactly where the writer would have placed a line break, not partway into one), and the file's own exact
    // size accounts for every byte the index describes and not one more — so neither a truncated file nor one
    // with trailing/extra bytes past the last recorded record can slip past a merely-cheap size check.
    private validateByteLayout(modeName: string, entries: readonly OutcomeLibraryBundleIndexEntry[], outcomesPath: string, fileSize: number, issues: ValidationIssue[]): boolean {
        if (entries.length === 0) {
            return true;
        }

        let ok = true;
        let expectedOffset = 0;
        const fd = fs.openSync(outcomesPath, "r");
        try {
            const separator = Buffer.alloc(1);

            for (let position = 0; position < entries.length; position++) {
                const entry = entries[position];
                if (entry.byteOffset !== expectedOffset) {
                    issues.push({
                        code: "outcome-library-bundle-mode-index-byte-range-not-contiguous",
                        severity: "error",
                        message:
                            `mode "${modeName}": index entry at position ${position} (id "${entry.id}") has byteOffset ${entry.byteOffset}, but the previous ` +
                            `entry's own range ends at ${expectedOffset} — ranges must be contiguous, in canonical id order, with no gap or overlap.`,
                        details: {modeName, position, id: entry.id},
                    });
                    ok = false;
                }

                const separatorPosition = entry.byteOffset + entry.byteLength;
                if (separatorPosition < fileSize) {
                    fs.readSync(fd, separator, 0, 1, separatorPosition);
                    if (separator[0] !== 0x0a) {
                        issues.push({
                            code: "outcome-library-bundle-mode-index-entry-not-newline-terminated",
                            severity: "error",
                            message: `mode "${modeName}": the byte immediately after outcome "${entry.id}"'s own recorded range is not a newline — its byteOffset/byteLength don't describe a real line boundary.`,
                            details: {modeName, id: entry.id},
                        });
                        ok = false;
                    }
                }

                expectedOffset = separatorPosition + 1;
            }
        } finally {
            fs.closeSync(fd);
        }

        if (expectedOffset > fileSize) {
            issues.push({
                code: "outcome-library-bundle-outcomes-file-too-small",
                severity: "error",
                message: `mode "${modeName}": the outcomes file (${fileSize} bytes) is smaller than the index's own recorded byte ranges require (${expectedOffset} bytes).`,
                details: {modeName},
            });
            ok = false;
        } else if (expectedOffset < fileSize) {
            issues.push({
                code: "outcome-library-bundle-outcomes-file-has-trailing-bytes",
                severity: "error",
                message: `mode "${modeName}": the outcomes file (${fileSize} bytes) has ${fileSize - expectedOffset} trailing byte(s) beyond what the index's own recorded ranges account for.`,
                details: {modeName},
            });
            ok = false;
        }

        return ok;
    }

    private readModeIndex(indexPath: string, modeName: string, issues: ValidationIssue[]): OutcomeLibraryBundleModeIndex | undefined {
        if (!fs.existsSync(indexPath)) {
            issues.push({code: "outcome-library-bundle-mode-index-missing", severity: "error", message: `mode "${modeName}": index file is missing.`, details: {modeName}});
            return undefined;
        }

        let raw: string;
        try {
            raw = fs.readFileSync(indexPath, "utf-8");
        } catch (error) {
            issues.push({
                code: "outcome-library-bundle-mode-index-unreadable",
                severity: "error",
                message: `mode "${modeName}": index file could not be read: ${error instanceof Error ? error.message : String(error)}`,
                details: {modeName},
            });
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            issues.push({
                code: "outcome-library-bundle-mode-index-invalid-json",
                severity: "error",
                message: `mode "${modeName}": index file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                details: {modeName},
            });
            return undefined;
        }

        if (
            typeof parsed !== "object" ||
            parsed === null ||
            !Array.isArray((parsed as {entries?: unknown}).entries) ||
            !isNonEmptyString((parsed as {modeName?: unknown}).modeName) ||
            !isNonEmptyString((parsed as {libraryId?: unknown}).libraryId) ||
            !isPositiveSafeInteger((parsed as {librarySchemaVersion?: unknown}).librarySchemaVersion) ||
            !isValidLibraryHash((parsed as {libraryHash?: unknown}).libraryHash) ||
            !isPositiveSafeInteger((parsed as {outcomeCount?: unknown}).outcomeCount) ||
            !isPositiveSafeInteger((parsed as {totalWeight?: unknown}).totalWeight) ||
            !isNonEmptyString((parsed as {outcomesFile?: unknown}).outcomesFile)
        ) {
            issues.push({
                code: "outcome-library-bundle-mode-index-malformed",
                severity: "error",
                message: `mode "${modeName}": index file does not match the expected shape.`,
                details: {modeName},
            });
            return undefined;
        }

        return parsed as OutcomeLibraryBundleModeIndex;
    }

    // Returns whether every entry validated cleanly (no malformed entry, no duplicate, already sorted) — the
    // count/total-weight cross-checks above, and the deep per-line pass below, only run when this is true, since
    // they'd otherwise be comparing against data already known to be unreliable.
    private validateEntries(modeName: string, entries: readonly unknown[], issues: ValidationIssue[]): boolean {
        const seenIds = new Set<string>();
        let previousId: string | undefined;
        let ok = true;

        entries.forEach((rawEntry, position) => {
            const entry = rawEntry as Partial<OutcomeLibraryBundleIndexEntry> | null;
            if (
                typeof entry !== "object" ||
                entry === null ||
                !isNonEmptyString(entry.id) ||
                !isPositiveSafeInteger(entry.weight) ||
                !isSafeNonNegativeInteger(entry.byteOffset) ||
                !isSafeNonNegativeInteger(entry.byteLength) ||
                entry.byteLength === 0
            ) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-entry-invalid",
                    severity: "error",
                    message: `mode "${modeName}": index entry at position ${position} is not {id: non-empty string, weight: positive safe integer, byteOffset/byteLength: non-negative safe integers}.`,
                    details: {modeName, position},
                });
                ok = false;
                return;
            }

            if (seenIds.has(entry.id)) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-duplicate-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id "${entry.id}" appears more than once in the index.`,
                    details: {modeName, id: entry.id},
                });
                ok = false;
                return;
            }
            seenIds.add(entry.id);

            if (previousId !== undefined && compareIds(previousId, entry.id) > 0) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-entries-not-sorted",
                    severity: "error",
                    message: `mode "${modeName}": index entries must be canonically sorted by id — entry at position ${position} ("${entry.id}") comes before "${previousId}".`,
                    details: {modeName, position},
                });
                ok = false;
            }
            previousId = entry.id;
        });

        return ok;
    }

    // Streams every outcomes line (never materializing the whole file, and never accumulating an array of
    // outcomes — the same end-to-end streaming discipline OutcomeLibraryBundleWriter itself follows), cross-
    // checking each record against the index by id (never by row position — a hand-edited/reordered file must
    // still validate correctly), running RoundArtifactValidator against each one's own artifact and checking
    // cross-outcome homogeneity (game/config/pokieVersion/betMode/stake consistency) the same way
    // buildWeightedOutcomeLibrary itself would — and recomputes the mode's own hash incrementally, in this same
    // pass (see streamModeOutcomesToTempFile's own doc comment for why a hash never needs a second pass, unlike
    // the exact analyzer statistics, which do — see computeOnlineWeightedOutcomeLibraryAnalysis). Also cross-
    // checks the outcomes' own common provenance/betMode/stake against manifest.json's own claimed game/
    // configHash (top-level) and betMode/stake (per mode entry) — a check the cross-*outcome* consistency check
    // above can never catch on its own, since it only ever compares outcomes against each other, never against
    // the manifest itself. Deliberately does not compare against manifest.pokieVersion: that field records which
    // pokie *tool* version built this bundle file, a different, unrelated quantity from an artifact's own
    // provenance.pokieVersion (which pokie version *computed* that artifact) — the two are never required to
    // match, so it would be wrong to treat a difference there as corruption.
    private async validateModeDeep(
        outcomesPath: string,
        manifest: OutcomeLibraryBundleManifest,
        modeEntry: OutcomeLibraryBundleManifestModeEntry,
        index: OutcomeLibraryBundleModeIndex,
        issues: ValidationIssue[],
    ): Promise<void> {
        const modeName = modeEntry.modeName;
        const indexById = new Map(index.entries.map((entry) => [entry.id, entry]));
        const seenIds = new Set<string>();
        let sawError = false;
        let validCount = 0;
        let reference: {gameId: unknown; gameVersion: unknown; configHash: unknown; pokieVersion: unknown; betMode: unknown; stake: unknown} | undefined;

        const hash = crypto.createHash("sha256");
        hash.update(`{"libraryId":${JSON.stringify(index.libraryId)},"outcomes":[`);
        let hashedCount = 0;

        for await (const line of iterateOutcomesJsonl(outcomesPath)) {
            if (line.status === "invalid-json") {
                issues.push({
                    code: "outcome-library-bundle-outcomes-line-invalid-json",
                    severity: "error",
                    message: `mode "${modeName}": outcomes line ${line.position} is not valid JSON: ${line.error}`,
                    details: {modeName, position: line.position},
                });
                sawError = true;
                continue;
            }

            const value = line.value;
            if (
                typeof value !== "object" ||
                value === null ||
                typeof (value as {id?: unknown}).id !== "string" ||
                typeof (value as {weight?: unknown}).weight !== "number" ||
                typeof (value as {artifact?: unknown}).artifact !== "object" ||
                (value as {artifact?: unknown}).artifact === null
            ) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-line-malformed",
                    severity: "error",
                    message: `mode "${modeName}": outcomes line ${line.position} is not {id, weight, artifact}.`,
                    details: {modeName, position: line.position},
                });
                sawError = true;
                continue;
            }

            const outcome = value as {id: string; weight: number; artifact: {payoutMultiplier?: unknown; stake?: unknown; betMode?: unknown; provenance?: {game?: {id?: unknown; version?: unknown}; configHash?: unknown; pokieVersion?: unknown}}};
            if (seenIds.has(outcome.id)) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-duplicate-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id "${outcome.id}" appears more than once in the outcomes file.`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            }
            seenIds.add(outcome.id);

            const indexEntry = indexById.get(outcome.id);
            if (indexEntry === undefined) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-extra-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id "${outcome.id}" is in the outcomes file but has no counterpart in the index.`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            }
            if (indexEntry.weight !== outcome.weight) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-weight-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}"'s weight in the outcomes file (${outcome.weight}) does not match the index's (${indexEntry.weight}).`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            }

            const artifactIssues = this.roundArtifactValidator.validate(outcome.artifact as never);
            if (artifactIssues.length > 0) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-artifact-invalid",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has an invalid artifact: ${artifactIssues.map((issue) => issue.code).join(", ")}.`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            }

            const current = {
                gameId: outcome.artifact.provenance?.game?.id,
                gameVersion: outcome.artifact.provenance?.game?.version,
                configHash: outcome.artifact.provenance?.configHash,
                pokieVersion: outcome.artifact.provenance?.pokieVersion,
                betMode: outcome.artifact.betMode,
                stake: outcome.artifact.stake,
            };
            if (reference === undefined) {
                reference = current;

                // Cross-checked once, against the first outcome only: every later outcome is already required
                // (see the "inconsistent-provenance"/"inconsistent-bet-mode"/"inconsistent-stake" checks below)
                // to agree with this same reference, so checking the reference itself against manifest.json's
                // own claims is enough to catch a manifest whose game/version/configHash/betMode/stake doesn't
                // actually match what this mode's outcomes were built from — a gap the existing cross-*outcome*
                // consistency check alone can't catch, since it never reads manifest.json at all.
                if (current.gameId !== manifest.game.id || current.gameVersion !== manifest.game.version || current.configHash !== manifest.configHash) {
                    issues.push({
                        code: "outcome-library-bundle-outcomes-manifest-provenance-mismatch",
                        severity: "error",
                        message:
                            `mode "${modeName}": this mode's outcomes have provenance (game id "${String(current.gameId)}", version ` +
                            `"${String(current.gameVersion)}", configHash "${String(current.configHash)}") that does not match manifest.json's own ` +
                            `game (id "${manifest.game.id}", version "${manifest.game.version}") / configHash ("${String(manifest.configHash)}").`,
                        details: {modeName},
                    });
                    sawError = true;
                    continue;
                }
                if (current.betMode !== modeEntry.betMode || current.stake !== modeEntry.stake) {
                    issues.push({
                        code: "outcome-library-bundle-outcomes-manifest-mode-mismatch",
                        severity: "error",
                        message:
                            `mode "${modeName}": this mode's outcomes have betMode ${JSON.stringify(current.betMode)}/stake ${String(current.stake)}, ` +
                            `which does not match manifest.json's own betMode ${JSON.stringify(modeEntry.betMode)}/stake ${String(modeEntry.stake)} for this mode.`,
                        details: {modeName},
                    });
                    sawError = true;
                    continue;
                }
            } else if (
                current.gameId !== reference.gameId ||
                current.gameVersion !== reference.gameVersion ||
                current.configHash !== reference.configHash ||
                current.pokieVersion !== reference.pokieVersion
            ) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-inconsistent-provenance",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has different provenance (game id/version, configHash, or pokieVersion) than this mode's other outcomes.`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            } else if (current.betMode !== reference.betMode) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-inconsistent-bet-mode",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has betMode ${JSON.stringify(current.betMode)}, expected ${JSON.stringify(reference.betMode)}.`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            } else if (current.stake !== reference.stake) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-inconsistent-stake",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" has stake ${String(current.stake)}, expected ${String(reference.stake)}.`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            }

            let canonicalLine: string;
            try {
                canonicalLine = JSON.stringify(toCanonicalJson(outcome));
            } catch (error) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-not-json-safe",
                    severity: "error",
                    message: `mode "${modeName}": outcome "${outcome.id}" is not JSON-safe: ${error instanceof Error ? error.message : String(error)}`,
                    details: {modeName, id: outcome.id},
                });
                sawError = true;
                continue;
            }

            validCount++;
            if (hashedCount > 0) {
                hash.update(",");
            }
            hash.update(canonicalLine);
            hashedCount++;
        }

        for (const id of indexById.keys()) {
            if (!seenIds.has(id)) {
                issues.push({
                    code: "outcome-library-bundle-outcomes-missing-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id "${id}" is in the index but has no counterpart in the outcomes file.`,
                    details: {modeName, id},
                });
                sawError = true;
            }
        }

        if (validCount !== index.entries.length) {
            issues.push({
                code: "outcome-library-bundle-outcomes-count-mismatch",
                severity: "error",
                message: `mode "${modeName}": the outcomes file has ${validCount} valid record(s) but the index has ${index.entries.length} entries.`,
                details: {modeName},
            });
            sawError = true;
        }

        if (sawError) {
            return;
        }

        hash.update(`],"schemaVersion":${JSON.stringify(index.librarySchemaVersion)}}`);
        const recomputedHash = `sha256:${hash.digest("hex")}`;
        if (recomputedHash !== modeEntry.libraryHash) {
            issues.push({
                code: "outcome-library-bundle-hash-mismatch",
                severity: "error",
                message: `mode "${modeName}": the recomputed libraryHash (${recomputedHash}) does not match the manifest's recorded one (${modeEntry.libraryHash}).`,
                details: {modeName},
            });
        }

        const recomputedAnalysis = await computeOnlineWeightedOutcomeLibraryAnalysis(outcomesPath, index.totalWeight);
        if (JSON.stringify(recomputedAnalysis) !== JSON.stringify(modeEntry.analysis)) {
            issues.push({
                code: "outcome-library-bundle-analysis-mismatch",
                severity: "error",
                message: `mode "${modeName}": the recomputed analysis does not match the manifest's recorded one.`,
                details: {modeName},
            });
        }
    }
}

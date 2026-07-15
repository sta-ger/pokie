import fs from "fs";
import path from "path";
import {resolveSafeStakeEngineFilePath} from "../../stakeengine/internal/resolveSafeStakeEngineFilePath.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {buildWeightedOutcomeLibrary, type WeightedOutcomeInput} from "../buildWeightedOutcomeLibrary.js";
import {compareIds} from "../internal/compareIds.js";
import {computeWeightedOutcomeLibraryHash} from "../computeWeightedOutcomeLibraryHash.js";
import {WeightedOutcomeLibraryAnalyzer} from "../WeightedOutcomeLibraryAnalyzer.js";
import {WeightedOutcomeLibraryBuildError} from "../WeightedOutcomeLibraryBuildError.js";
import {iterateOutcomesJsonl} from "./internal/iterateOutcomesJsonl.js";
import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION, type OutcomeLibraryBundleManifest, type OutcomeLibraryBundleManifestModeEntry} from "./OutcomeLibraryBundleManifest.js";
import {OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION, type OutcomeLibraryBundleIndexEntry, type OutcomeLibraryBundleModeIndex} from "./OutcomeLibraryBundleModeIndex.js";
import type {OutcomeLibraryBundleValidateOptions, OutcomeLibraryBundleValidating} from "./OutcomeLibraryBundleValidating.js";

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// Validates a whole candidate outcome-library bundle directory. Two layers, mirroring the Stake Engine
// import validator's own "structural first, expensive content check opt-in" discipline — but here the split
// matters even more, since the whole point of a streaming bundle is to *avoid* loading everything, so a fast
// structural check must never force a full materialization:
//
// - shallow (default): manifest.json plus every mode's own small index_<modeName>.json — never opens any
//   outcomes_<modeName>.jsonl for content, only a cheap fs.stat size sanity check.
// - deep (opt-in via {deep: true}): additionally streams every outcomes line per mode and fully rebuilds each
//   mode's library, to catch corruption a byte-count sanity check alone can't (a truncated/tampered record,
//   an id/weight that disagrees with the index, a hash that no longer matches).
//
// Never throws: a top-level catch-all reports "outcome-library-bundle-malformed" instead.
export class OutcomeLibraryBundleValidator<T extends string | number = string> implements OutcomeLibraryBundleValidating {
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
            await this.validateMode(bundleDir, modeEntry, deep, issues);
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

        return manifest;
    }

    private async validateMode(bundleDir: string, modeEntry: OutcomeLibraryBundleManifestModeEntry, deep: boolean, issues: ValidationIssue[]): Promise<void> {
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
            if (totalWeight !== index.totalWeight || totalWeight !== modeEntry.totalWeight) {
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
        const lastEntry = index.entries[index.entries.length - 1];
        if (lastEntry !== undefined && stat.size < lastEntry.byteOffset + lastEntry.byteLength) {
            issues.push({
                code: "outcome-library-bundle-outcomes-file-too-small",
                severity: "error",
                message: `mode "${modeName}": the outcomes file (${stat.size} bytes) is smaller than the index's own last recorded byte range requires.`,
                details: {modeName},
            });
            return;
        }

        if (deep && entriesOk) {
            await this.validateModeDeep(outcomesPath, modeEntry, index, issues);
        }
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
            !isNonEmptyString((parsed as {libraryId?: unknown}).libraryId) ||
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
                !isFinitePositiveNumber(entry.weight) ||
                !isSafeNonNegativeInteger(entry.byteOffset) ||
                !isSafeNonNegativeInteger(entry.byteLength) ||
                entry.byteLength === 0
            ) {
                issues.push({
                    code: "outcome-library-bundle-mode-index-entry-invalid",
                    severity: "error",
                    message: `mode "${modeName}": index entry at position ${position} is not {id: non-empty string, weight: finite number > 0, byteOffset/byteLength: non-negative safe integers}.`,
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

    // Streams every outcomes line (never materializing the whole file), cross-checking each record against the
    // index by id (never by row position — a hand-edited/reordered file must still validate correctly), then
    // rebuilds the whole mode's library (via buildWeightedOutcomeLibrary — the same builder every other
    // in-memory library goes through, never a second definition of "valid") to recompute its hash and analysis.
    private async validateModeDeep(
        outcomesPath: string,
        modeEntry: OutcomeLibraryBundleManifestModeEntry,
        index: OutcomeLibraryBundleModeIndex,
        issues: ValidationIssue[],
    ): Promise<void> {
        const modeName = modeEntry.modeName;
        const indexById = new Map(index.entries.map((entry) => [entry.id, entry]));
        const seenIds = new Set<string>();
        const outcomes: WeightedOutcomeInput<T>[] = [];
        let sawError = false;

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

            const outcome = value as {id: string; weight: number; artifact: unknown};
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

            outcomes.push(outcome as unknown as WeightedOutcomeInput<T>);
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

        if (outcomes.length !== index.entries.length) {
            issues.push({
                code: "outcome-library-bundle-outcomes-count-mismatch",
                severity: "error",
                message: `mode "${modeName}": the outcomes file has ${outcomes.length} valid record(s) but the index has ${index.entries.length} entries.`,
                details: {modeName},
            });
            sawError = true;
        }

        if (sawError) {
            return;
        }

        let library;
        try {
            library = buildWeightedOutcomeLibrary<T>({libraryId: index.libraryId, outcomes, schemaVersion: index.librarySchemaVersion});
        } catch (error) {
            issues.push({
                code: "outcome-library-bundle-library-invalid",
                severity: "error",
                message: `mode "${modeName}": ${error instanceof WeightedOutcomeLibraryBuildError ? error.message : String(error)}`,
                details: {modeName},
            });
            return;
        }

        const recomputedHash = computeWeightedOutcomeLibraryHash(library);
        if (recomputedHash !== modeEntry.libraryHash) {
            issues.push({
                code: "outcome-library-bundle-hash-mismatch",
                severity: "error",
                message: `mode "${modeName}": the recomputed libraryHash (${recomputedHash}) does not match the manifest's recorded one (${modeEntry.libraryHash}).`,
                details: {modeName},
            });
        }

        const recomputedAnalysis = new WeightedOutcomeLibraryAnalyzer<T>().analyze(library);
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

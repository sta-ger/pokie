import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import type {StakeEngineImportBundle, StakeEngineImportModeFiles} from "./StakeEngineImportBundle.js";
import type {StakeEngineImportValidating} from "./StakeEngineImportValidating.js";
import type {StakeEngineIndex, StakeEngineIndexModeEntry} from "./StakeEngineIndex.js";
import {STAKE_ENGINE_MANIFEST_SCHEMA_VERSION, type StakeEngineManifest, type StakeEngineManifestModeEntry} from "./StakeEngineManifest.js";

type ParsedCsvRow = {readonly id: number; readonly weight: number; readonly payoutMultiplier: number};
type ParsedBookLine = {readonly id: number; readonly payoutMultiplier: number};

// Validates a whole candidate Stake Engine export directory — assembled into a StakeEngineImportBundle by
// StakeEngineImporter (the only place that touches the filesystem) — additively: index.json shape, manifest
// recognition, index/manifest cross-checks (mode names/cost/filenames must agree between the two files — a
// mismatch signals a tampered/corrupted directory, not something to silently prefer one source over the other
// for), and per-mode CSV/books cross-checks matched by id (never by row position, since a hand-edited package
// might reorder rows). Never throws.
export class StakeEngineImportValidator implements StakeEngineImportValidating {
    public validate(bundle: StakeEngineImportBundle): ValidationIssue[] {
        try {
            return this.validateInternal(bundle);
        } catch (error) {
            return [
                {
                    code: "stakeengine-import-malformed",
                    severity: "error",
                    message: `Stake Engine import bundle could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(bundle: StakeEngineImportBundle): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!bundle.indexFileExists) {
            issues.push({code: "stakeengine-import-index-missing", severity: "error", message: `"${bundle.stakeDir}" has no index.json.`});
            return issues;
        }

        const index = this.parseIndex(bundle.rawIndex, issues);

        if (!bundle.manifestFileExists) {
            issues.push({
                code: "stakeengine-import-manifest-missing",
                severity: "error",
                message: `"${bundle.stakeDir}" has no pokie-manifest.json — import only ever round-trips a directory "pokie stakeengine export" itself produced.`,
            });
        }

        const manifest = bundle.manifestFileExists ? this.parseManifest(bundle.rawManifest, issues) : undefined;

        if (index === undefined || manifest === undefined) {
            return issues;
        }

        if (manifest.schemaVersion !== STAKE_ENGINE_MANIFEST_SCHEMA_VERSION) {
            issues.push({
                code: "stakeengine-import-manifest-schema-version-unsupported",
                severity: "error",
                message: `pokie-manifest.json's schemaVersion (${manifest.schemaVersion}) is not supported (expected ${STAKE_ENGINE_MANIFEST_SCHEMA_VERSION}).`,
            });
            return issues;
        }

        const manifestModesByName = new Map(manifest.modes.map((mode) => [mode.name, mode]));
        const indexModesByName = new Map(index.modes.map((mode) => [mode.name, mode]));

        for (const indexMode of index.modes) {
            this.crossCheckMode(indexMode, manifestModesByName.get(indexMode.name), issues);
        }
        for (const manifestMode of manifest.modes) {
            if (!indexModesByName.has(manifestMode.name)) {
                issues.push({
                    code: "stakeengine-import-mode-missing-in-index",
                    severity: "error",
                    message: `mode "${manifestMode.name}" is in pokie-manifest.json but not in index.json.`,
                    details: {modeName: manifestMode.name},
                });
            }
        }

        const modeFilesByName = new Map(bundle.modeFiles.map((modeFiles) => [modeFiles.modeName, modeFiles]));
        for (const indexMode of index.modes) {
            const modeFiles = modeFilesByName.get(indexMode.name);
            const manifestMode = manifestModesByName.get(indexMode.name);
            if (modeFiles !== undefined) {
                this.validateModeFiles(indexMode.name, modeFiles, manifestMode, issues);
            }
        }

        return issues;
    }

    private crossCheckMode(indexMode: StakeEngineIndexModeEntry, manifestMode: StakeEngineManifestModeEntry | undefined, issues: ValidationIssue[]): void {
        if (manifestMode === undefined) {
            issues.push({
                code: "stakeengine-import-mode-missing-in-manifest",
                severity: "error",
                message: `mode "${indexMode.name}" is in index.json but not in pokie-manifest.json.`,
                details: {modeName: indexMode.name},
            });
            return;
        }
        if (indexMode.cost !== manifestMode.cost) {
            issues.push({
                code: "stakeengine-import-mode-cost-mismatch",
                severity: "error",
                message: `mode "${indexMode.name}": index.json's cost (${indexMode.cost}) does not match pokie-manifest.json's (${manifestMode.cost}).`,
                details: {modeName: indexMode.name},
            });
        }
        if (indexMode.events !== manifestMode.events) {
            issues.push({
                code: "stakeengine-import-mode-events-filename-mismatch",
                severity: "error",
                message: `mode "${indexMode.name}": index.json's events filename ("${indexMode.events}") does not match pokie-manifest.json's ("${manifestMode.events}").`,
                details: {modeName: indexMode.name},
            });
        }
        if (indexMode.weights !== manifestMode.weights) {
            issues.push({
                code: "stakeengine-import-mode-weights-filename-mismatch",
                severity: "error",
                message: `mode "${indexMode.name}": index.json's weights filename ("${indexMode.weights}") does not match pokie-manifest.json's ("${manifestMode.weights}").`,
                details: {modeName: indexMode.name},
            });
        }
    }

    private validateModeFiles(
        modeName: string,
        modeFiles: StakeEngineImportModeFiles,
        manifestMode: StakeEngineManifestModeEntry | undefined,
        issues: ValidationIssue[],
    ): void {
        if (!modeFiles.csvFileExists) {
            issues.push({code: "stakeengine-import-csv-missing", severity: "error", message: `mode "${modeName}": lookup CSV file is missing.`, details: {modeName}});
        }
        if (!modeFiles.booksFileExists) {
            issues.push({code: "stakeengine-import-books-missing", severity: "error", message: `mode "${modeName}": books file is missing.`, details: {modeName}});
        }
        if (!modeFiles.csvFileExists || !modeFiles.booksFileExists) {
            return;
        }

        const csvRows = this.parseCsvRows(modeName, modeFiles.csvLines, issues);
        const bookLines = this.parseBookLines(modeName, modeFiles.bookLines, issues);
        if (csvRows === undefined || bookLines === undefined) {
            return;
        }

        if (manifestMode !== undefined && csvRows.length !== manifestMode.outcomeCount) {
            issues.push({
                code: "stakeengine-import-outcome-count-mismatch",
                severity: "error",
                message: `mode "${modeName}": pokie-manifest.json's outcomeCount (${manifestMode.outcomeCount}) does not match the actual row/line count (${csvRows.length}).`,
                details: {modeName},
            });
        }

        if (csvRows.length !== bookLines.length) {
            issues.push({
                code: "stakeengine-import-csv-books-count-mismatch",
                severity: "error",
                message: `mode "${modeName}": the lookup CSV has ${csvRows.length} row(s) but books has ${bookLines.length} line(s).`,
                details: {modeName},
            });
        }

        const csvById = new Map(csvRows.map((row) => [row.id, row]));
        const booksById = new Map(bookLines.map((line) => [line.id, line]));

        for (const [id, csvRow] of csvById) {
            const bookLine = booksById.get(id);
            if (bookLine === undefined) {
                issues.push({
                    code: "stakeengine-import-csv-books-id-set-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id} is in the lookup CSV but has no counterpart in books.`,
                    details: {modeName, id},
                });
                continue;
            }
            if (csvRow.payoutMultiplier !== bookLine.payoutMultiplier) {
                issues.push({
                    code: "stakeengine-import-csv-books-payout-multiplier-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id}'s lookup CSV payoutMultiplier (${csvRow.payoutMultiplier}) does not match its books payoutMultiplier (${bookLine.payoutMultiplier}).`,
                    details: {modeName, id},
                });
            }
        }
        for (const id of booksById.keys()) {
            if (!csvById.has(id)) {
                issues.push({
                    code: "stakeengine-import-csv-books-id-set-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id} is in books but has no counterpart in the lookup CSV.`,
                    details: {modeName, id},
                });
            }
        }
    }

    private parseCsvRows(modeName: string, csvLines: readonly string[], issues: ValidationIssue[]): ParsedCsvRow[] | undefined {
        const rows: ParsedCsvRow[] = [];
        let sawError = false;

        csvLines.forEach((line, position) => {
            const fields = line.split(",");
            if (fields.length !== 3 || fields.some((field) => !(/^-?\d+$/).test(field))) {
                issues.push({
                    code: "stakeengine-import-csv-malformed-row",
                    severity: "error",
                    message: `mode "${modeName}": lookup CSV row ${position} ("${line}") is not exactly 3 comma-separated integer fields.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }

            const [idField, weightField, payoutMultiplierField] = fields;
            const id = parseStakeEngineOutcomeId(idField);
            if (id === undefined) {
                issues.push({
                    code: "stakeengine-import-outcome-id-not-integer",
                    severity: "error",
                    message: `mode "${modeName}": lookup CSV row ${position}'s id ("${idField}") is not a canonical non-negative integer string.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }

            const weight = Number(weightField);
            if (!Number.isInteger(weight) || weight <= 0) {
                issues.push({
                    code: "stakeengine-import-outcome-weight-not-positive-integer",
                    severity: "error",
                    message: `mode "${modeName}": outcome ${id}'s weight (${weightField}) is not a positive integer.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }

            rows.push({id, weight, payoutMultiplier: Number(payoutMultiplierField)});
        });

        return sawError ? undefined : rows;
    }

    private parseBookLines(modeName: string, bookLines: readonly unknown[], issues: ValidationIssue[]): ParsedBookLine[] | undefined {
        const lines: ParsedBookLine[] = [];
        let sawError = false;

        bookLines.forEach((rawLine, position) => {
            if (
                typeof rawLine !== "object" ||
                rawLine === null ||
                typeof (rawLine as {id?: unknown}).id !== "number" ||
                !Array.isArray((rawLine as {events?: unknown}).events) ||
                typeof (rawLine as {payoutMultiplier?: unknown}).payoutMultiplier !== "number"
            ) {
                issues.push({
                    code: "stakeengine-import-books-malformed-line",
                    severity: "error",
                    message: `mode "${modeName}": books line ${position} is not {"id": number, "events": array, "payoutMultiplier": number}.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }

            const {id, payoutMultiplier} = rawLine as {id: number; payoutMultiplier: number};
            if (!Number.isSafeInteger(id) || id < 0) {
                issues.push({
                    code: "stakeengine-import-outcome-id-not-integer",
                    severity: "error",
                    message: `mode "${modeName}": books line ${position}'s id (${id}) is not a non-negative safe integer.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }

            lines.push({id, payoutMultiplier});
        });

        return sawError ? undefined : lines;
    }

    private parseIndex(rawIndex: unknown, issues: ValidationIssue[]): StakeEngineIndex | undefined {
        if (typeof rawIndex !== "object" || rawIndex === null || !Array.isArray((rawIndex as {modes?: unknown}).modes)) {
            issues.push({code: "stakeengine-import-index-malformed", severity: "error", message: 'index.json must be {"modes": [...]}.'});
            return undefined;
        }

        const rawModes = (rawIndex as {modes: unknown[]}).modes;
        if (rawModes.length === 0) {
            issues.push({code: "stakeengine-import-index-malformed", severity: "error", message: "index.json's modes array must not be empty."});
            return undefined;
        }

        const seenNames = new Set<string>();
        const modes: StakeEngineIndexModeEntry[] = [];
        let sawError = false;

        rawModes.forEach((rawMode, position) => {
            if (
                typeof rawMode !== "object" ||
                rawMode === null ||
                typeof (rawMode as {name?: unknown}).name !== "string" ||
                (rawMode as {name: string}).name.trim().length === 0 ||
                typeof (rawMode as {cost?: unknown}).cost !== "number" ||
                typeof (rawMode as {events?: unknown}).events !== "string" ||
                typeof (rawMode as {weights?: unknown}).weights !== "string"
            ) {
                issues.push({
                    code: "stakeengine-import-index-malformed",
                    severity: "error",
                    message: `index.json modes[${position}] must be {"name": string, "cost": number, "events": string, "weights": string}.`,
                    details: {position},
                });
                sawError = true;
                return;
            }

            const mode = rawMode as StakeEngineIndexModeEntry;
            if (seenNames.has(mode.name)) {
                issues.push({
                    code: "stakeengine-import-index-malformed",
                    severity: "error",
                    message: `index.json has more than one mode named "${mode.name}".`,
                    details: {modeName: mode.name},
                });
                sawError = true;
                return;
            }
            seenNames.add(mode.name);
            modes.push(mode);
        });

        return sawError ? undefined : {modes};
    }

    private parseManifest(rawManifest: unknown, issues: ValidationIssue[]): StakeEngineManifest | undefined {
        if (
            typeof rawManifest !== "object" ||
            rawManifest === null ||
            (rawManifest as {generatedBy?: unknown}).generatedBy !== "pokie stakeengine export" ||
            !Array.isArray((rawManifest as {modes?: unknown}).modes)
        ) {
            issues.push({
                code: "stakeengine-import-manifest-unrecognized",
                severity: "error",
                message: 'pokie-manifest.json does not parse, or was not written by "pokie stakeengine export".',
            });
            return undefined;
        }

        return rawManifest as StakeEngineManifest;
    }
}

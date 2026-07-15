import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import {resolveSafeStakeEngineFilePath} from "./internal/resolveSafeStakeEngineFilePath.js";
import type {StakeEngineImportBookLineResult, StakeEngineImportBundle, StakeEngineImportModeFiles} from "./StakeEngineImportBundle.js";
import type {StakeEngineImportValidating} from "./StakeEngineImportValidating.js";
import type {StakeEngineIndex, StakeEngineIndexModeEntry} from "./StakeEngineIndex.js";
import {STAKE_ENGINE_MANIFEST_SCHEMA_VERSION, type StakeEngineManifest, type StakeEngineManifestModeEntry} from "./StakeEngineManifest.js";

type ParsedCsvRow = {readonly id: number; readonly weight: number; readonly payoutMultiplier: number};
type ParsedBookLine = {readonly id: number; readonly payoutMultiplier: number};

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

function isSafePositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// Validates a whole candidate Stake Engine export directory — assembled into a StakeEngineImportBundle by
// StakeEngineImporter (the only place that touches the filesystem) — additively: index.json/pokie-manifest.json
// field-level shape (every required field and its type, not just "is this an object"), path-safety of every
// mode's own filenames, mode-name rules identical to StakeEngineExportValidator's own (format, duplicates,
// case-insensitive collisions), index/manifest cross-checks, and per-mode CSV/books cross-checks matched by id
// (never by row position, since a hand-edited package might reorder rows). Never throws.
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

        if (bundle.index.status === "missing") {
            issues.push({code: "stakeengine-import-index-missing", severity: "error", message: `"${bundle.stakeDir}" has no index.json.`});
            return issues;
        }
        if (bundle.index.status === "unreadable") {
            issues.push({code: "stakeengine-import-index-unreadable", severity: "error", message: `index.json could not be read: ${bundle.index.error}`});
            return issues;
        }
        if (bundle.index.status === "invalid") {
            issues.push({code: "stakeengine-import-index-invalid-json", severity: "error", message: `index.json is not valid JSON: ${bundle.index.error}`});
            return issues;
        }
        const index = this.parseIndex(bundle.stakeDir, bundle.index.value, issues);

        let manifest: StakeEngineManifest | undefined;
        if (bundle.manifest.status === "missing") {
            issues.push({
                code: "stakeengine-import-manifest-missing",
                severity: "error",
                message: `"${bundle.stakeDir}" has no pokie-manifest.json — import only ever round-trips a directory "pokie stakeengine export" itself produced.`,
            });
        } else if (bundle.manifest.status === "unreadable") {
            issues.push({
                code: "stakeengine-import-manifest-unreadable",
                severity: "error",
                message: `pokie-manifest.json could not be read: ${bundle.manifest.error}`,
            });
        } else if (bundle.manifest.status === "invalid") {
            issues.push({
                code: "stakeengine-import-manifest-invalid-json",
                severity: "error",
                message: `pokie-manifest.json is not valid JSON: ${bundle.manifest.error}`,
            });
        } else {
            manifest = this.parseManifest(bundle.stakeDir, bundle.manifest.value, issues);
        }

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

    // Doesn't cross-check events/weights filenames between index.json and the manifest: both are now
    // independently required (in validateModeFilename) to be exactly "books_<name>.jsonl.zst"/"lookup_<name>.csv"
    // for their own mode's own name — so once both files individually validate for the same modeName, their
    // filenames are already guaranteed identical (the same deterministic formula, applied to the same name).
    // A genuine disagreement is unreachable: whichever file uses a different filename fails its own
    // stakeengine-import-mode-filename-mismatch check first, and validation never even reaches this method.
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
    }

    private validateModeFiles(
        modeName: string,
        modeFiles: StakeEngineImportModeFiles,
        manifestMode: StakeEngineManifestModeEntry | undefined,
        issues: ValidationIssue[],
    ): void {
        if (modeFiles.csv.status === "missing") {
            issues.push({code: "stakeengine-import-csv-missing", severity: "error", message: `mode "${modeName}": lookup CSV file is missing.`, details: {modeName}});
        } else if (modeFiles.csv.status === "unreadable") {
            issues.push({
                code: "stakeengine-import-csv-unreadable",
                severity: "error",
                message: `mode "${modeName}": lookup CSV could not be read: ${modeFiles.csv.error}`,
                details: {modeName},
            });
        }
        if (modeFiles.books.status === "missing") {
            issues.push({code: "stakeengine-import-books-missing", severity: "error", message: `mode "${modeName}": books file is missing.`, details: {modeName}});
        } else if (modeFiles.books.status === "unreadable") {
            issues.push({
                code: "stakeengine-import-books-unreadable",
                severity: "error",
                message: `mode "${modeName}": books could not be read: ${modeFiles.books.error}`,
                details: {modeName},
            });
        } else if (modeFiles.books.status === "invalid") {
            issues.push({
                code: "stakeengine-import-books-invalid-zstd",
                severity: "error",
                message: `mode "${modeName}": books could not be decompressed: ${modeFiles.books.error}`,
                details: {modeName},
            });
        }
        if (modeFiles.csv.status !== "ok" || modeFiles.books.status !== "ok") {
            return;
        }

        const csvRows = this.parseCsvRows(modeName, modeFiles.csv.value, issues);
        const bookLines = this.parseBookLines(modeName, modeFiles.books.value, issues);
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

        const totalWeight = csvRows.reduce((sum, row) => sum + row.weight, 0);
        if (!Number.isSafeInteger(totalWeight)) {
            issues.push({
                code: "stakeengine-import-total-weight-overflow",
                severity: "error",
                message: `mode "${modeName}": the sum of all outcome weights (${totalWeight}) overflows a safe integer.`,
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
        const seenIds = new Set<number>();
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
            if (seenIds.has(id)) {
                issues.push({
                    code: "stakeengine-import-duplicate-csv-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id} appears more than once in the lookup CSV.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }
            seenIds.add(id);

            const weight = Number(weightField);
            if (!isSafeNonNegativeInteger(weight) || weight <= 0) {
                issues.push({
                    code: "stakeengine-import-outcome-weight-not-positive-integer",
                    severity: "error",
                    message: `mode "${modeName}": outcome ${id}'s weight (${weightField}) is not a positive safe integer.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }

            const payoutMultiplier = Number(payoutMultiplierField);
            if (!isSafeNonNegativeInteger(payoutMultiplier)) {
                issues.push({
                    code: "stakeengine-import-outcome-payout-multiplier-not-safe-integer",
                    severity: "error",
                    message: `mode "${modeName}": outcome ${id}'s lookup CSV payoutMultiplier (${payoutMultiplierField}) is not a non-negative safe integer.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }

            rows.push({id, weight, payoutMultiplier});
        });

        return sawError ? undefined : rows;
    }

    private parseBookLines(modeName: string, bookLines: readonly StakeEngineImportBookLineResult[], issues: ValidationIssue[]): ParsedBookLine[] | undefined {
        const lines: ParsedBookLine[] = [];
        const seenIds = new Set<number>();
        let sawError = false;

        bookLines.forEach((lineResult, position) => {
            if (lineResult.status === "invalid") {
                issues.push({
                    code: "stakeengine-import-books-invalid-json-line",
                    severity: "error",
                    message: `mode "${modeName}": books line ${position} is not valid JSON: ${lineResult.error}`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }

            const rawLine = lineResult.value;
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
            if (!isSafeNonNegativeInteger(id)) {
                issues.push({
                    code: "stakeengine-import-outcome-id-not-integer",
                    severity: "error",
                    message: `mode "${modeName}": books line ${position}'s id (${id}) is not a non-negative safe integer.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }
            if (seenIds.has(id)) {
                issues.push({
                    code: "stakeengine-import-duplicate-book-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id} appears more than once in books.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }
            seenIds.add(id);

            if (!isSafeNonNegativeInteger(payoutMultiplier)) {
                issues.push({
                    code: "stakeengine-import-outcome-payout-multiplier-not-safe-integer",
                    severity: "error",
                    message: `mode "${modeName}": outcome ${id}'s books payoutMultiplier (${payoutMultiplier}) is not a non-negative safe integer.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }

            lines.push({id, payoutMultiplier});
        });

        return sawError ? undefined : lines;
    }

    private validateModeName(
        source: "index.json" | "pokie-manifest.json",
        modeName: unknown,
        position: number,
        seenNames: Map<string, string>,
        issues: ValidationIssue[],
    ): boolean {
        if (!isNonEmptyString(modeName) || !MODE_NAME_PATTERN.test(modeName)) {
            issues.push({
                code: "stakeengine-import-mode-name-invalid",
                severity: "error",
                message: `${source} modes[${position}] has an invalid modeName (${JSON.stringify(modeName)}); must be a non-empty string matching [A-Za-z0-9_-]+.`,
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
                code: "stakeengine-import-duplicate-mode-name",
                severity: "error",
                message: `${source} has more than one mode named "${modeName}".`,
                details: {modeName},
            });
        } else {
            issues.push({
                code: "stakeengine-import-mode-name-case-collision",
                severity: "error",
                message: `${source} has modeNames "${modeName}" and "${existing}", which differ only in case and would collide on a case-insensitive filesystem.`,
                details: {modeName, collidesWith: existing},
            });
        }
        return false;
    }

    // Beyond bare path-safety, a mode's own "events"/"weights" filename must match Stake's own naming
    // convention exactly (the same one StakeEngineExporter itself always writes — see its buildMode): a mode
    // named "base" must use "books_base.jsonl.zst"/"lookup_base.csv", nothing else. This closes filename reuse
    // structurally (two distinct, already-unique mode names can never derive the same filename), but "seenFiles"
    // (scoped per source — index.json and pokie-manifest.json each get their own map, mirroring how mode-name
    // collisions are tracked per source) still catches it explicitly and reports a dedicated diagnostic, rather
    // than relying solely on the naming-convention check to make it structurally unreachable.
    private validateModeFilename(
        stakeDir: string,
        modeName: string,
        field: "events" | "weights",
        fileName: unknown,
        seenFiles: Map<string, {modeName: string; field: "events" | "weights"; fileName: string}>,
        issues: ValidationIssue[],
    ): boolean {
        if (!isNonEmptyString(fileName) || resolveSafeStakeEngineFilePath(stakeDir, fileName) === undefined) {
            issues.push({
                code: "stakeengine-import-mode-filename-unsafe",
                severity: "error",
                message: `mode "${modeName}"'s "${field}" filename (${JSON.stringify(fileName)}) is not a safe filename — absolute paths, ".."/nested paths, and anything resolving outside the export directory are refused.`,
                details: {modeName, field},
            });
            return false;
        }

        let ok = true;

        const expected = field === "events" ? `books_${modeName}.jsonl.zst` : `lookup_${modeName}.csv`;
        if (fileName !== expected) {
            issues.push({
                code: "stakeengine-import-mode-filename-mismatch",
                severity: "error",
                message: `mode "${modeName}"'s "${field}" filename ("${fileName}") must be exactly "${expected}" — Stake's own naming convention, derived from the mode's name.`,
                details: {modeName, field, fileName, expected},
            });
            ok = false;
        }

        const lowerFileName = fileName.toLowerCase();
        const existing = seenFiles.get(lowerFileName);
        if (existing === undefined) {
            seenFiles.set(lowerFileName, {modeName, field, fileName});
        } else if (existing.fileName === fileName) {
            issues.push({
                code: "stakeengine-import-filename-reused",
                severity: "error",
                message: `"${fileName}" is used by more than one mode/field: mode "${existing.modeName}"'s "${existing.field}", and mode "${modeName}"'s "${field}".`,
                details: {fileName, modeName, field, reusedFrom: existing.modeName},
            });
            ok = false;
        } else {
            issues.push({
                code: "stakeengine-import-filename-case-collision",
                severity: "error",
                message: `"${fileName}" (mode "${modeName}"'s "${field}") and "${existing.fileName}" (mode "${existing.modeName}"'s "${existing.field}") differ only in case and would collide on a case-insensitive filesystem.`,
                details: {fileName, modeName, field, collidesWith: existing.fileName},
            });
            ok = false;
        }

        return ok;
    }

    private parseIndex(stakeDir: string, rawIndex: unknown, issues: ValidationIssue[]): StakeEngineIndex | undefined {
        if (typeof rawIndex !== "object" || rawIndex === null || !Array.isArray((rawIndex as {modes?: unknown}).modes)) {
            issues.push({code: "stakeengine-import-index-malformed", severity: "error", message: 'index.json must be {"modes": [...]}.'});
            return undefined;
        }

        const rawModes = (rawIndex as {modes: unknown[]}).modes;
        if (rawModes.length === 0) {
            issues.push({code: "stakeengine-import-index-malformed", severity: "error", message: "index.json's modes array must not be empty."});
            return undefined;
        }

        const seenNames = new Map<string, string>();
        const seenFiles = new Map<string, {modeName: string; field: "events" | "weights"; fileName: string}>();
        const modes: StakeEngineIndexModeEntry[] = [];
        let sawError = false;

        rawModes.forEach((rawMode, position) => {
            if (typeof rawMode !== "object" || rawMode === null) {
                issues.push({
                    code: "stakeengine-import-index-malformed",
                    severity: "error",
                    message: `index.json modes[${position}] must be an object.`,
                    details: {position},
                });
                sawError = true;
                return;
            }

            const mode = rawMode as {name?: unknown; cost?: unknown; events?: unknown; weights?: unknown};
            if (!this.validateModeName("index.json", mode.name, position, seenNames, issues)) {
                sawError = true;
                return;
            }
            const modeName = mode.name as string;

            if (!isFinitePositiveNumber(mode.cost)) {
                issues.push({
                    code: "stakeengine-import-mode-cost-invalid",
                    severity: "error",
                    message: `mode "${modeName}": index.json's cost (${JSON.stringify(mode.cost)}) must be a finite number > 0.`,
                    details: {modeName},
                });
                sawError = true;
                return;
            }

            const eventsOk = this.validateModeFilename(stakeDir, modeName, "events", mode.events, seenFiles, issues);
            const weightsOk = this.validateModeFilename(stakeDir, modeName, "weights", mode.weights, seenFiles, issues);
            if (!eventsOk || !weightsOk) {
                sawError = true;
                return;
            }

            modes.push({name: modeName, cost: mode.cost as number, events: mode.events as string, weights: mode.weights as string});
        });

        return sawError ? undefined : {modes};
    }

    private parseManifest(stakeDir: string, rawManifest: unknown, issues: ValidationIssue[]): StakeEngineManifest | undefined {
        if (
            typeof rawManifest !== "object" ||
            rawManifest === null ||
            (rawManifest as {generatedBy?: unknown}).generatedBy !== "pokie stakeengine export" ||
            !Array.isArray((rawManifest as {modes?: unknown}).modes)
        ) {
            issues.push({
                code: "stakeengine-import-manifest-unrecognized",
                severity: "error",
                message: 'pokie-manifest.json does not match the expected shape, or was not written by "pokie stakeengine export".',
            });
            return undefined;
        }

        const manifest = rawManifest as {
            schemaVersion?: unknown;
            pokieVersion?: unknown;
            generatedAt?: unknown;
            game?: unknown;
            configHash?: unknown;
            files?: unknown;
            modes: unknown[];
        };
        let sawError = false;
        const fieldInvalid = (field: string, requirement: string): void => {
            issues.push({
                code: "stakeengine-import-manifest-field-invalid",
                severity: "error",
                message: `pokie-manifest.json's "${field}" ${requirement}.`,
                details: {field},
            });
            sawError = true;
        };

        if (typeof manifest.schemaVersion !== "number" || !Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
            fieldInvalid("schemaVersion", "must be a positive integer");
        }
        if (!isNonEmptyString(manifest.pokieVersion)) {
            fieldInvalid("pokieVersion", "must be a non-empty string");
        }
        if (!isNonEmptyString(manifest.generatedAt)) {
            fieldInvalid("generatedAt", "must be a non-empty string");
        }
        const game = manifest.game as {id?: unknown; name?: unknown; version?: unknown} | null;
        if (typeof game !== "object" || game === null || !isNonEmptyString(game.id) || !isNonEmptyString(game.name) || !isNonEmptyString(game.version)) {
            fieldInvalid("game", 'must be an object with non-empty string "id"/"name"/"version"');
        }
        if (manifest.configHash !== undefined && typeof manifest.configHash !== "string") {
            fieldInvalid("configHash", "must be a string when present");
        }
        if (
            manifest.files === undefined ||
            !Array.isArray(manifest.files) ||
            manifest.files.length === 0 ||
            manifest.files.some((file) => typeof file !== "string" || file.trim().length === 0)
        ) {
            fieldInvalid("files", "must be present as a non-empty array of non-empty strings");
        }

        const seenNames = new Map<string, string>();
        const seenFiles = new Map<string, {modeName: string; field: "events" | "weights"; fileName: string}>();
        const modes: StakeEngineManifestModeEntry[] = [];

        manifest.modes.forEach((rawMode, position) => {
            if (typeof rawMode !== "object" || rawMode === null) {
                issues.push({
                    code: "stakeengine-import-manifest-mode-field-invalid",
                    severity: "error",
                    message: `pokie-manifest.json modes[${position}] must be an object.`,
                    details: {position},
                });
                sawError = true;
                return;
            }

            const mode = rawMode as {
                name?: unknown;
                betMode?: unknown;
                stake?: unknown;
                cost?: unknown;
                outcomeCount?: unknown;
                libraryId?: unknown;
                libraryHash?: unknown;
                events?: unknown;
                weights?: unknown;
            };

            if (!this.validateModeName("pokie-manifest.json", mode.name, position, seenNames, issues)) {
                sawError = true;
                return;
            }
            const modeName = mode.name as string;

            const modeFieldInvalid = (field: string, requirement: string): void => {
                issues.push({
                    code: "stakeengine-import-manifest-mode-field-invalid",
                    severity: "error",
                    message: `mode "${modeName}": pokie-manifest.json's "${field}" ${requirement}.`,
                    details: {modeName, field},
                });
                sawError = true;
            };

            if (!isNonEmptyString(mode.betMode)) {
                modeFieldInvalid("betMode", "must be a non-empty string");
            }
            if (!isFinitePositiveNumber(mode.stake)) {
                issues.push({
                    code: "stakeengine-import-mode-stake-invalid",
                    severity: "error",
                    message: `mode "${modeName}": pokie-manifest.json's stake (${JSON.stringify(mode.stake)}) must be a finite number > 0.`,
                    details: {modeName},
                });
                sawError = true;
            }
            if (!isFinitePositiveNumber(mode.cost)) {
                issues.push({
                    code: "stakeengine-import-mode-cost-invalid",
                    severity: "error",
                    message: `mode "${modeName}": pokie-manifest.json's cost (${JSON.stringify(mode.cost)}) must be a finite number > 0.`,
                    details: {modeName},
                });
                sawError = true;
            }
            if (!isSafePositiveInteger(mode.outcomeCount)) {
                issues.push({
                    code: "stakeengine-import-manifest-outcome-count-invalid",
                    severity: "error",
                    message: `mode "${modeName}": pokie-manifest.json's outcomeCount (${JSON.stringify(mode.outcomeCount)}) must be a positive safe integer.`,
                    details: {modeName},
                });
                sawError = true;
            }
            if (!isNonEmptyString(mode.libraryId)) {
                issues.push({
                    code: "stakeengine-import-manifest-library-id-invalid",
                    severity: "error",
                    message: `mode "${modeName}": pokie-manifest.json's libraryId must be a non-empty string.`,
                    details: {modeName},
                });
                sawError = true;
            }
            if (!isNonEmptyString(mode.libraryHash) || !LIBRARY_HASH_PATTERN.test(mode.libraryHash)) {
                issues.push({
                    code: "stakeengine-import-manifest-library-hash-invalid",
                    severity: "error",
                    message: `mode "${modeName}": pokie-manifest.json's libraryHash (${JSON.stringify(mode.libraryHash)}) must match "sha256:<64 hex chars>".`,
                    details: {modeName},
                });
                sawError = true;
            }
            const eventsOk = this.validateModeFilename(stakeDir, modeName, "events", mode.events, seenFiles, issues);
            const weightsOk = this.validateModeFilename(stakeDir, modeName, "weights", mode.weights, seenFiles, issues);
            if (!eventsOk || !weightsOk) {
                sawError = true;
            }

            if (
                isNonEmptyString(mode.betMode) &&
                isFinitePositiveNumber(mode.stake) &&
                isFinitePositiveNumber(mode.cost) &&
                isSafePositiveInteger(mode.outcomeCount) &&
                isNonEmptyString(mode.libraryId) &&
                isNonEmptyString(mode.libraryHash) &&
                eventsOk &&
                weightsOk
            ) {
                modes.push({
                    name: modeName,
                    betMode: mode.betMode,
                    stake: mode.stake,
                    cost: mode.cost,
                    outcomeCount: mode.outcomeCount,
                    libraryId: mode.libraryId,
                    libraryHash: mode.libraryHash,
                    events: mode.events as string,
                    weights: mode.weights as string,
                });
            }
        });

        // Only reached once every top-level field and every mode entry validated cleanly — "files" is guaranteed
        // a non-empty array of non-empty strings at this point, and "modes" is guaranteed complete (one entry
        // per manifest.modes[], each with a validated, safe, convention-matching events/weights filename), so
        // the exact-set comparison below has a trustworthy expected set to compare against.
        if (!sawError && this.validateManifestFilesSet(stakeDir, manifest.files as string[], modes, issues)) {
            sawError = true;
        }

        if (sawError) {
            return undefined;
        }

        return {
            schemaVersion: manifest.schemaVersion as number,
            generatedBy: "pokie stakeengine export",
            pokieVersion: manifest.pokieVersion as string,
            generatedAt: manifest.generatedAt as string,
            game: game as {id: string; name: string; version: string},
            ...(manifest.configHash !== undefined ? {configHash: manifest.configHash as string} : {}),
            modes,
            files: manifest.files as string[],
        };
    }

    // Validates pokie-manifest.json's own "files" field as an exact, unique set: index.json, pokie-manifest.json
    // itself, and every *current* mode's own CSV/books filenames — nothing missing, nothing extra, no duplicate
    // or case-colliding entry, and no entry that isn't itself a safe filename. This is deliberately independent
    // of index.json's own filenames (which are cross-checked against the manifest's own mode entries elsewhere,
    // in crossCheckMode) — "files" describes the manifest's own understanding of what this export directory
    // should contain, exactly the same convention StakeEngineExporter's own manifest.files already follows.
    private validateManifestFilesSet(stakeDir: string, files: readonly string[], modes: readonly StakeEngineManifestModeEntry[], issues: ValidationIssue[]): boolean {
        let sawError = false;
        const seen = new Map<string, string>();
        const actual = new Set<string>();

        for (const file of files) {
            const lowerFile = file.toLowerCase();
            const existing = seen.get(lowerFile);
            if (existing !== undefined) {
                issues.push({
                    code: "stakeengine-import-manifest-files-duplicate",
                    severity: "error",
                    message:
                        existing === file
                            ? `pokie-manifest.json's "files" lists "${file}" more than once.`
                            : `pokie-manifest.json's "files" lists "${file}" and "${existing}", which differ only in case and would collide on a case-insensitive filesystem.`,
                    details: {file},
                });
                sawError = true;
                continue;
            }
            seen.set(lowerFile, file);

            if (resolveSafeStakeEngineFilePath(stakeDir, file) === undefined) {
                issues.push({
                    code: "stakeengine-import-manifest-files-entry-unsafe",
                    severity: "error",
                    message: `pokie-manifest.json's "files" entry "${file}" is not a safe filename — absolute paths, ".."/nested paths, and anything resolving outside the export directory are refused.`,
                    details: {file},
                });
                sawError = true;
                continue;
            }

            actual.add(file);
        }

        const expected = new Set<string>(["index.json", "pokie-manifest.json", ...modes.flatMap((mode) => [mode.weights, mode.events])]);

        for (const file of expected) {
            if (!actual.has(file)) {
                issues.push({
                    code: "stakeengine-import-manifest-files-missing-entry",
                    severity: "error",
                    message: `pokie-manifest.json's "files" is missing the expected entry "${file}".`,
                    details: {file},
                });
                sawError = true;
            }
        }
        for (const file of actual) {
            if (!expected.has(file)) {
                issues.push({
                    code: "stakeengine-import-manifest-files-unexpected-entry",
                    severity: "error",
                    message: `pokie-manifest.json's "files" lists "${file}", which is not index.json, pokie-manifest.json, or a current mode's own CSV/books file.`,
                    details: {file},
                });
                sawError = true;
            }
        }

        return sawError;
    }
}

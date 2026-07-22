import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {parseStakeEngineOutcomeId} from "../internal/parseStakeEngineOutcomeId.js";
import {resolveSafeStakeEngineFilePath} from "../internal/resolveSafeStakeEngineFilePath.js";
import type {StakeEngineStandaloneBookLineResult, StakeEngineStandaloneBundle, StakeEngineStandaloneModeFiles} from "./StakeEngineStandaloneBundle.js";
import type {StakeEngineStandaloneValidating} from "./StakeEngineStandaloneValidating.js";

type ParsedIndexMode = {readonly name: string; readonly cost: number; readonly events: string; readonly weights: string};
type ParsedCsvRow = {readonly id: number; readonly weight: bigint; readonly payoutMultiplier: number};
type ParsedBookLine = {readonly id: number; readonly payoutMultiplier: number};

const MODE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function isFinitePositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// Validates a whole candidate Stake Engine outcome directory -- assembled into a StakeEngineStandaloneBundle by
// StakeEngineOutcomeSourceReader (the only place that touches the filesystem) -- with no pokie-manifest.json
// involved anywhere: index.json's own field shapes, path-safety of every mode's own filenames (never a stricter
// "must match lookup_<name>.csv" naming convention -- unlike StakeEngineImportValidator, this never assumes the
// directory was written by "pokie stakeengine export"), mode-name rules (format, duplicates, case-insensitive
// collisions), and per-mode CSV/books cross-checks matched by id (never by row position, since a hand-edited or
// third-party-produced package might reorder rows). Never throws.
export class StakeEngineStandaloneValidator implements StakeEngineStandaloneValidating {
    public validate(bundle: StakeEngineStandaloneBundle): ValidationIssue[] {
        try {
            return this.validateInternal(bundle);
        } catch (error) {
            return [
                {
                    code: "stakeengine-standalone-malformed",
                    severity: "error",
                    message: `Stake Engine outcome directory could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(bundle: StakeEngineStandaloneBundle): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (bundle.index.status === "missing") {
            issues.push({code: "stakeengine-standalone-index-missing", severity: "error", message: `"${bundle.stakeDir}" has no index.json.`});
            return issues;
        }
        if (bundle.index.status === "unreadable") {
            issues.push({code: "stakeengine-standalone-index-unreadable", severity: "error", message: `index.json could not be read: ${bundle.index.error}`});
            return issues;
        }
        if (bundle.index.status === "invalid") {
            issues.push({code: "stakeengine-standalone-index-invalid-json", severity: "error", message: `index.json is not valid JSON: ${bundle.index.error}`});
            return issues;
        }

        const index = this.parseIndex(bundle.stakeDir, bundle.index.value, issues);
        if (index === undefined) {
            return issues;
        }

        const modeFilesByName = new Map(bundle.modeFiles.map((modeFiles) => [modeFiles.modeName, modeFiles]));
        for (const indexMode of index) {
            const modeFiles = modeFilesByName.get(indexMode.name);
            if (modeFiles !== undefined) {
                this.validateModeFiles(indexMode.name, modeFiles, issues);
            }
        }

        return issues;
    }

    private validateModeFiles(modeName: string, modeFiles: StakeEngineStandaloneModeFiles, issues: ValidationIssue[]): void {
        if (modeFiles.csv.status === "missing") {
            issues.push({code: "stakeengine-standalone-csv-missing", severity: "error", message: `mode "${modeName}": lookup CSV file is missing.`, details: {modeName}});
        } else if (modeFiles.csv.status === "unreadable") {
            issues.push({
                code: "stakeengine-standalone-csv-unreadable",
                severity: "error",
                message: `mode "${modeName}": lookup CSV could not be read: ${modeFiles.csv.error}`,
                details: {modeName},
            });
        }
        if (modeFiles.books.status === "missing") {
            issues.push({code: "stakeengine-standalone-books-missing", severity: "error", message: `mode "${modeName}": books file is missing.`, details: {modeName}});
        } else if (modeFiles.books.status === "unreadable") {
            issues.push({
                code: "stakeengine-standalone-books-unreadable",
                severity: "error",
                message: `mode "${modeName}": books could not be read: ${modeFiles.books.error}`,
                details: {modeName},
            });
        } else if (modeFiles.books.status === "invalid") {
            issues.push({
                code: "stakeengine-standalone-books-invalid-zstd",
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

        if (csvRows.length === 0) {
            issues.push({
                code: "stakeengine-standalone-mode-outcomes-empty",
                severity: "error",
                message: `mode "${modeName}": the lookup CSV has no rows -- a mode must enumerate at least one outcome.`,
                details: {modeName},
            });
            return;
        }

        if (csvRows.length !== bookLines.length) {
            issues.push({
                code: "stakeengine-standalone-csv-books-count-mismatch",
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
                    code: "stakeengine-standalone-csv-books-id-set-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id} is in the lookup CSV but has no counterpart in books.`,
                    details: {modeName, id},
                });
                continue;
            }
            if (csvRow.payoutMultiplier !== bookLine.payoutMultiplier) {
                issues.push({
                    code: "stakeengine-standalone-csv-books-payout-multiplier-mismatch",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id}'s lookup CSV payoutMultiplier (${csvRow.payoutMultiplier}) does not match its books payoutMultiplier (${bookLine.payoutMultiplier}).`,
                    details: {modeName, id},
                });
            }
        }
        for (const id of booksById.keys()) {
            if (!csvById.has(id)) {
                issues.push({
                    code: "stakeengine-standalone-csv-books-id-set-mismatch",
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
                    code: "stakeengine-standalone-csv-malformed-row",
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
                    code: "stakeengine-standalone-outcome-id-not-integer",
                    severity: "error",
                    message: `mode "${modeName}": lookup CSV row ${position}'s id ("${idField}") is not a canonical non-negative integer string.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }
            if (seenIds.has(id)) {
                issues.push({
                    code: "stakeengine-standalone-duplicate-csv-id",
                    severity: "error",
                    message: `mode "${modeName}": outcome id ${id} appears more than once in the lookup CSV.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }
            seenIds.add(id);

            const weight = BigInt(weightField);
            if (weight <= 0n || weight > 0xffff_ffff_ffff_ffffn) {
                issues.push({
                    code: "stakeengine-standalone-outcome-weight-not-positive-integer",
                    severity: "error",
                    message: `mode "${modeName}": outcome ${id}'s weight (${weightField}) is not a positive uint64 integer.`,
                    details: {modeName, id},
                });
                sawError = true;
                return;
            }

            const payoutMultiplier = Number(payoutMultiplierField);
            if (!isSafeNonNegativeInteger(payoutMultiplier)) {
                issues.push({
                    code: "stakeengine-standalone-outcome-payout-multiplier-not-safe-integer",
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

    private parseBookLines(modeName: string, bookLines: readonly StakeEngineStandaloneBookLineResult[], issues: ValidationIssue[]): ParsedBookLine[] | undefined {
        const lines: ParsedBookLine[] = [];
        const seenIds = new Set<number>();
        let sawError = false;

        bookLines.forEach((lineResult, position) => {
            if (lineResult.status === "invalid") {
                issues.push({
                    code: "stakeengine-standalone-books-invalid-json-line",
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
                    code: "stakeengine-standalone-books-malformed-line",
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
                    code: "stakeengine-standalone-outcome-id-not-integer",
                    severity: "error",
                    message: `mode "${modeName}": books line ${position}'s id (${id}) is not a non-negative safe integer.`,
                    details: {modeName, position},
                });
                sawError = true;
                return;
            }
            if (seenIds.has(id)) {
                issues.push({
                    code: "stakeengine-standalone-duplicate-book-id",
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
                    code: "stakeengine-standalone-outcome-payout-multiplier-not-safe-integer",
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

    private validateModeName(modeName: unknown, position: number, seenNames: Map<string, string>, issues: ValidationIssue[]): boolean {
        if (typeof modeName !== "string" || modeName.trim().length === 0 || !MODE_NAME_PATTERN.test(modeName)) {
            issues.push({
                code: "stakeengine-standalone-mode-name-invalid",
                severity: "error",
                message: `index.json modes[${position}] has an invalid name (${JSON.stringify(modeName)}); must be a non-empty string matching [A-Za-z0-9_-]+.`,
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
                code: "stakeengine-standalone-duplicate-mode-name",
                severity: "error",
                message: `index.json has more than one mode named "${modeName}".`,
                details: {modeName},
            });
        } else {
            issues.push({
                code: "stakeengine-standalone-mode-name-case-collision",
                severity: "error",
                message: `index.json has modeNames "${modeName}" and "${existing}", which differ only in case and would collide on a case-insensitive filesystem.`,
                details: {modeName, collidesWith: existing},
            });
        }
        return false;
    }

    // Path-safety only -- unlike StakeEngineImportValidator's own validateModeFilename, this never requires a
    // mode's own "events"/"weights" filename to match a "books_<name>.jsonl.zst"/"lookup_<name>.csv" naming
    // convention: that's "pokie stakeengine export"'s own convention, not part of Stake's actual schema, and a
    // genuinely foreign directory has no reason to follow it. Two modes resolving to the exact same file is still
    // flagged (by resolved absolute path, not by raw filename string) -- a real, security-relevant collision
    // regardless of naming convention.
    private validateModeFilename(
        stakeDir: string,
        modeName: string,
        field: "events" | "weights",
        fileName: unknown,
        seenPaths: Map<string, {modeName: string; field: "events" | "weights"}>,
        issues: ValidationIssue[],
    ): boolean {
        if (typeof fileName !== "string" || fileName.trim().length === 0) {
            issues.push({
                code: "stakeengine-standalone-mode-filename-unsafe",
                severity: "error",
                message: `mode "${modeName}"'s "${field}" filename (${JSON.stringify(fileName)}) must be a non-empty string.`,
                details: {modeName, field},
            });
            return false;
        }

        const resolvedPath = resolveSafeStakeEngineFilePath(stakeDir, fileName);
        if (resolvedPath === undefined) {
            issues.push({
                code: "stakeengine-standalone-mode-filename-unsafe",
                severity: "error",
                message: `mode "${modeName}"'s "${field}" filename (${JSON.stringify(fileName)}) is not a safe filename -- absolute paths, ".."/nested paths, and anything resolving outside the directory are refused.`,
                details: {modeName, field},
            });
            return false;
        }

        const key = resolvedPath.toLowerCase();
        const existing = seenPaths.get(key);
        if (existing !== undefined) {
            issues.push({
                code: "stakeengine-standalone-filename-reused",
                severity: "error",
                message: `"${fileName}" is used by more than one mode/field: mode "${existing.modeName}"'s "${existing.field}", and mode "${modeName}"'s "${field}".`,
                details: {fileName, modeName, field, reusedFrom: existing.modeName},
            });
            return false;
        }
        seenPaths.set(key, {modeName, field});
        return true;
    }

    private parseIndex(stakeDir: string, rawIndex: unknown, issues: ValidationIssue[]): ParsedIndexMode[] | undefined {
        if (typeof rawIndex !== "object" || rawIndex === null || !Array.isArray((rawIndex as {modes?: unknown}).modes)) {
            issues.push({code: "stakeengine-standalone-index-malformed", severity: "error", message: 'index.json must be {"modes": [...]}.'});
            return undefined;
        }

        const rawModes = (rawIndex as {modes: unknown[]}).modes;
        if (rawModes.length === 0) {
            issues.push({code: "stakeengine-standalone-index-malformed", severity: "error", message: "index.json's modes array must not be empty."});
            return undefined;
        }

        const seenNames = new Map<string, string>();
        const seenPaths = new Map<string, {modeName: string; field: "events" | "weights"}>();
        const modes: ParsedIndexMode[] = [];
        let sawError = false;

        rawModes.forEach((rawMode, position) => {
            if (typeof rawMode !== "object" || rawMode === null) {
                issues.push({code: "stakeengine-standalone-index-malformed", severity: "error", message: `index.json modes[${position}] must be an object.`, details: {position}});
                sawError = true;
                return;
            }

            const mode = rawMode as {name?: unknown; cost?: unknown; events?: unknown; weights?: unknown};
            if (!this.validateModeName(mode.name, position, seenNames, issues)) {
                sawError = true;
                return;
            }
            const modeName = mode.name as string;

            if (!isFinitePositiveNumber(mode.cost)) {
                issues.push({
                    code: "stakeengine-standalone-mode-cost-invalid",
                    severity: "error",
                    message: `mode "${modeName}": index.json's cost (${JSON.stringify(mode.cost)}) must be a finite number > 0.`,
                    details: {modeName},
                });
                sawError = true;
                return;
            }

            const eventsOk = this.validateModeFilename(stakeDir, modeName, "events", mode.events, seenPaths, issues);
            const weightsOk = this.validateModeFilename(stakeDir, modeName, "weights", mode.weights, seenPaths, issues);
            if (!eventsOk || !weightsOk) {
                sawError = true;
                return;
            }

            modes.push({name: modeName, cost: mode.cost as number, events: mode.events as string, weights: mode.weights as string});
        });

        return sawError ? undefined : modes;
    }
}

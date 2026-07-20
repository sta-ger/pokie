import type {ValidationIssue} from "../../validation/ValidationIssue.js";

// Plain-value helpers shared by every sheet mapper — pure functions operating on already-flattened
// SheetGrid cells (see SheetGrid.ts), not exceljs types. Mirrors loadGameBlueprint.ts/
// buildGameBuildInfo.ts's style of small standalone functions rather than a class, since there's no
// swappable behavior here to hide behind an interface.

export function cellToText(value: unknown): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
}

export function cellToNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    const text = cellToText(value);
    if (text === undefined) {
        return undefined;
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : undefined;
}

const TRUE_TEXTS = new Set(["true", "yes", "y", "1", "x"]);
const FALSE_TEXTS = new Set(["false", "no", "n", "0", ""]);

export function cellToBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") {
        return value;
    }
    if (value === null || value === undefined) {
        return false;
    }
    const text = String(value).trim().toLowerCase();
    if (TRUE_TEXTS.has(text)) {
        return true;
    }
    if (FALSE_TEXTS.has(text)) {
        return false;
    }
    return undefined;
}

export function isBlankRow(row: unknown[]): boolean {
    return row.every((cell) => cellToText(cell) === undefined);
}

// Matches a header row against a fixed, ordered set of expected column names (case-insensitive):
// pushes "parsheet-missing-column" (error) for every expected column not found (unless it's listed in
// `optionalColumns` -- absent there is simply backward compatibility with an older sheet shape, not an
// error), and "parsheet-unknown-column" (warning) for every header cell that isn't one of them. Returns
// a name -> column-index map (only for columns that were found) so callers can look up cells by name
// regardless of physical column order -- a caller must itself tolerate an optional column's index
// being absent from the result (see BetModesSheetMapper's "Target RTP", which degrades to "absent" via
// plain JS array-indexing-by-undefined rather than needing its own branch).
export function resolveColumnIndexes(
    headerRow: unknown[],
    expectedColumns: string[],
    sheetName: string,
    issues: ValidationIssue[],
    optionalColumns: ReadonlySet<string> = new Set(),
): Record<string, number> {
    const found: Record<string, number> = {};
    headerRow.forEach((cell, index) => {
        const name = cellToText(cell);
        if (name === undefined) {
            return;
        }
        const expected = expectedColumns.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
        if (expected) {
            found[expected] = index;
        } else {
            issues.push({
                code: "parsheet-unknown-column",
                severity: "warning",
                message: `Sheet "${sheetName}" has an unrecognized column "${name}", which is ignored.`,
                details: {sheet: sheetName, column: name},
            });
        }
    });

    for (const column of expectedColumns) {
        if (!(column in found) && !optionalColumns.has(column)) {
            issues.push({
                code: "parsheet-missing-column",
                severity: "error",
                message: `Sheet "${sheetName}" is missing required column "${column}".`,
                details: {sheet: sheetName, column},
            });
        }
    }

    return found;
}

export type ReelColumn = {reelIndex: number; columnIndex: number};

const REEL_COLUMN_PATTERN = /^reel\s+(\d+)$/i;

// The same "how many reel slots should the mapper build" logic resolveReelColumns uses internally to
// decide its own missing-column range — shared here so ReelStripsSheetMapper/PaylinesSheetMapper stay
// consistent with it: a valid declared "reels" is authoritative (so e.g. a trailing-missing reel still
// gets an empty placeholder slot), otherwise fall back to the highest "Reel <k>" actually found.
export function resolveExpectedReelCount(reels: number, columns: ReelColumn[]): number {
    if (Number.isInteger(reels) && reels > 0) {
        return reels;
    }
    if (columns.length === 0) {
        return 0;
    }
    return Math.max(...columns.map((column) => column.reelIndex));
}

// Matches a header row against the canonical "Reel 1".."Reel N" naming ReelStrips/Paylines both use
// (one physical column per reel, in that exact name — not just "whatever non-blank column happens to
// be there", which would silently let an unrelated column like "Notes" become reel data). Any header
// cell that isn't a "Reel <k>" cell (and isn't one of `ignoreColumnIndexes`, e.g. Paylines' own
// "Line" column) is reported as "parsheet-unknown-column" and excluded from the result entirely — it
// never becomes game data. A "Reel <k>" name repeated more than once is "parsheet-reel-column-duplicate"
// (only the first occurrence is used).
//
// "reels" is the blueprint's own declared reel count (from Manifest.Reels) — the source of truth for
// how many "Reel <k>" columns *should* exist. When it's a valid positive integer: a "Reel <k>" with
// k > reels is "parsheet-reel-column-out-of-range" (excluded from the result), and every index in
// 1..reels without a column — whether an interior gap or missing entirely off the end ("trailing") —
// is "parsheet-reel-column-missing". When "reels" isn't a valid positive integer (Manifest itself is
// broken — already reported elsewhere, e.g. blueprint-reels-invalid), there's no reliable expected
// count to check against, so this falls back to self-consistency only: no out-of-range check, and
// "missing" only covers gaps up to whatever the highest actually-found "Reel <k>" is.
export function resolveReelColumns(
    headerRow: unknown[],
    sheetName: string,
    issues: ValidationIssue[],
    reels: number,
    ignoreColumnIndexes: ReadonlySet<number> = new Set(),
): ReelColumn[] {
    const expectedReels = Number.isInteger(reels) && reels > 0 ? reels : undefined;
    const firstColumnForReelIndex = new Map<number, number>();
    const columns: ReelColumn[] = [];

    headerRow.forEach((cell, columnIndex) => {
        if (ignoreColumnIndexes.has(columnIndex)) {
            return;
        }
        const text = cellToText(cell);
        if (text === undefined) {
            return;
        }

        const match = REEL_COLUMN_PATTERN.exec(text);
        const reelIndex = match ? Number(match[1]) : NaN;
        if (!match || !Number.isInteger(reelIndex) || reelIndex < 1) {
            issues.push({
                code: "parsheet-unknown-column",
                severity: "warning",
                message: `Sheet "${sheetName}" has an unrecognized column "${text}", which is ignored.`,
                details: {sheet: sheetName, column: text},
            });
            return;
        }

        if (expectedReels !== undefined && reelIndex > expectedReels) {
            issues.push({
                code: "parsheet-reel-column-out-of-range",
                severity: "error",
                message: `Sheet "${sheetName}" has a "Reel ${reelIndex}" column, but the blueprint only has ${expectedReels} reel(s) (per Manifest).`,
                details: {sheet: sheetName, reelIndex, reels: expectedReels},
            });
            return;
        }

        if (firstColumnForReelIndex.has(reelIndex)) {
            issues.push({
                code: "parsheet-reel-column-duplicate",
                severity: "error",
                message: `Sheet "${sheetName}" has more than one "Reel ${reelIndex}" column; only the first one is used.`,
                details: {sheet: sheetName, reelIndex},
            });
            return;
        }

        firstColumnForReelIndex.set(reelIndex, columnIndex);
        columns.push({reelIndex, columnIndex});
    });

    const maxReelIndexToCheck = resolveExpectedReelCount(reels, columns);
    for (let reelIndex = 1; reelIndex <= maxReelIndexToCheck; reelIndex++) {
        if (!firstColumnForReelIndex.has(reelIndex)) {
            issues.push({
                code: "parsheet-reel-column-missing",
                severity: "error",
                message: `Sheet "${sheetName}" is missing a "Reel ${reelIndex}" column.`,
                details: {sheet: sheetName, reelIndex},
            });
        }
    }

    return columns.sort((a, b) => a.reelIndex - b.reelIndex);
}

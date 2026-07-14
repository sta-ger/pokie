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
// pushes "parsheet-missing-column" (error) for every expected column not found, and
// "parsheet-unknown-column" (warning) for every header cell that isn't one of them. Returns a
// name -> column-index map (only for columns that were found) so callers can look up cells by name
// regardless of physical column order.
export function resolveColumnIndexes(
    headerRow: unknown[],
    expectedColumns: string[],
    sheetName: string,
    issues: ValidationIssue[],
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
        if (!(column in found)) {
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

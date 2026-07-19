import type {GameBlueprintFreeGames} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {MechanicsSheetMapping} from "./MechanicsSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Scatter Symbol", "Matches", "Free Games"];

export class MechanicsSheetMapper implements MechanicsSheetMapping {
    public readonly sheetName = "Mechanics";

    public fromRows(rows: SheetGrid): {value: GameBlueprintFreeGames | undefined; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const scatterIndex = columns["Scatter Symbol"];
        const matchesIndex = columns.Matches;
        const freeGamesIndex = columns["Free Games"];
        if (scatterIndex === undefined || matchesIndex === undefined || freeGamesIndex === undefined) {
            return {value: undefined, issues};
        }

        let scatterSymbol: string | undefined;
        let conflictReported = false;
        const awardsByCount: Record<string, number> = {};

        dataRows.forEach((row, rowOffset) => {
            if (isBlankRow(row)) {
                return;
            }
            const rowNumber = rowOffset + 2;
            const rowScatter = cellToText(row[scatterIndex]);
            if (rowScatter === undefined) {
                issues.push({
                    code: "parsheet-mechanics-missing-scatter",
                    severity: "error",
                    message: `Sheet "${this.sheetName}", row ${rowNumber}: "Scatter Symbol" is blank, so this row is ignored.`,
                    details: {sheet: this.sheetName, row: rowNumber},
                });
                return;
            }

            if (scatterSymbol === undefined) {
                scatterSymbol = rowScatter;
            } else if (rowScatter !== scatterSymbol) {
                if (!conflictReported) {
                    issues.push({
                        code: "parsheet-mechanics-multiple-scatter-symbols",
                        severity: "error",
                        message: `Sheet "${this.sheetName}" lists more than one scatter symbol ("${scatterSymbol}" and "${rowScatter}"), but a blueprint can only have one free-games award -- only rows for "${scatterSymbol}" are used.`,
                        details: {sheet: this.sheetName, row: rowNumber, kept: scatterSymbol, ignored: rowScatter},
                    });
                    conflictReported = true;
                }
                return;
            }

            const matches = cellToNumber(row[matchesIndex]);
            if (matches === undefined) {
                issues.push({
                    code: "parsheet-mechanics-invalid-matches-cell",
                    severity: "error",
                    message: `Sheet "${this.sheetName}", row ${rowNumber}: "Matches" is not a number, so this row is ignored.`,
                    details: {sheet: this.sheetName, row: rowNumber},
                });
                return;
            }

            const freeGamesAwarded = cellToNumber(row[freeGamesIndex]);
            if (freeGamesAwarded === undefined) {
                issues.push({
                    code: "parsheet-mechanics-invalid-freegames-cell",
                    severity: "error",
                    message: `Sheet "${this.sheetName}", row ${rowNumber}: "Free Games" is not a number, so this row is ignored.`,
                    details: {sheet: this.sheetName, row: rowNumber},
                });
                return;
            }

            const matchesKey = String(matches);
            if (matchesKey in awardsByCount) {
                issues.push({
                    code: "parsheet-mechanics-duplicate-entry",
                    severity: "warning",
                    message: `Sheet "${this.sheetName}" has more than one row for ${matches} matches; the last one is used.`,
                    details: {sheet: this.sheetName, row: rowNumber, matches},
                });
            }
            awardsByCount[matchesKey] = freeGamesAwarded;
        });

        if (scatterSymbol === undefined) {
            return {value: undefined, issues};
        }
        return {value: {scatterSymbol, awardsByCount}, issues};
    }

    public toRows(freeGames: GameBlueprintFreeGames): SheetGrid {
        const rows: SheetGrid = [COLUMNS];
        const matchCounts = Object.keys(freeGames.awardsByCount)
            .map(Number)
            .sort((a, b) => a - b);
        for (const matches of matchCounts) {
            rows.push([freeGames.scatterSymbol, matches, freeGames.awardsByCount[String(matches)]]);
        }
        return rows;
    }
}

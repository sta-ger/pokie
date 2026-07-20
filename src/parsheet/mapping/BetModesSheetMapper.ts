import type {BetMode} from "../../gamepackage/BetMode.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {BetModesSheetMapping} from "./BetModesSheetMapping.js";
import {cellToBoolean, cellToNumber, cellToText, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Id", "Label", "Cost Multiplier", "Target RTP", "Runtime Type", "Is Default", "Forced Free Games"];
const VALID_RUNTIME_TYPES = new Set(["base", "ante", "buyFeature"]);

export class BetModesSheetMapper implements BetModesSheetMapping {
    public readonly sheetName = "BetModes";

    public fromRows(rows: SheetGrid): {value: BetMode[]; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const idIndex = columns.Id;
        const labelIndex = columns.Label;
        const costIndex = columns["Cost Multiplier"];
        const targetRtpIndex = columns["Target RTP"];
        const runtimeTypeIndex = columns["Runtime Type"];
        const isDefaultIndex = columns["Is Default"];
        const forcedFreeGamesIndex = columns["Forced Free Games"];

        const betModes: BetMode[] = [];
        if (
            idIndex !== undefined &&
            labelIndex !== undefined &&
            costIndex !== undefined &&
            targetRtpIndex !== undefined &&
            runtimeTypeIndex !== undefined &&
            isDefaultIndex !== undefined &&
            forcedFreeGamesIndex !== undefined
        ) {
            dataRows.forEach((row, rowOffset) => {
                if (isBlankRow(row)) {
                    return;
                }
                const rowNumber = rowOffset + 2;
                const id = cellToText(row[idIndex]);
                if (id === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-missing-id",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Id" is blank, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber},
                    });
                    return;
                }

                const rawCost = row[costIndex];
                const costMultiplier = cellToNumber(rawCost);
                if (cellToText(rawCost) !== undefined && costMultiplier === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-invalid-cost-multiplier-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Cost Multiplier" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, id},
                    });
                    return;
                }

                const rawTargetRtp = row[targetRtpIndex];
                const targetRtp = cellToNumber(rawTargetRtp);
                if (cellToText(rawTargetRtp) !== undefined && targetRtp === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-invalid-targetrtp-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Target RTP" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, id},
                    });
                    return;
                }

                const rawRuntimeType = cellToText(row[runtimeTypeIndex]);
                if (rawRuntimeType !== undefined && !VALID_RUNTIME_TYPES.has(rawRuntimeType)) {
                    issues.push({
                        code: "parsheet-betmodes-invalid-runtimetype-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Runtime Type" must be blank, "base", "ante", or "buyFeature", so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, id},
                    });
                    return;
                }

                const rawIsDefault = row[isDefaultIndex];
                const isDefault = cellToBoolean(rawIsDefault);
                if (isDefault === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-invalid-isdefault-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Is Default" is not a recognizable true/false value, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, id},
                    });
                    return;
                }

                const rawForcedFreeGames = row[forcedFreeGamesIndex];
                const forcedFreeGames = cellToNumber(rawForcedFreeGames);
                if (cellToText(rawForcedFreeGames) !== undefined && forcedFreeGames === undefined) {
                    issues.push({
                        code: "parsheet-betmodes-invalid-forcedfreegames-cell",
                        severity: "error",
                        message: `Sheet "${this.sheetName}", row ${rowNumber}: "Forced Free Games" is not a number, so this row is ignored.`,
                        details: {sheet: this.sheetName, row: rowNumber, id},
                    });
                    return;
                }

                const betMode: BetMode = {id};
                const label = cellToText(row[labelIndex]);
                if (label !== undefined) {
                    betMode.label = label;
                }
                if (costMultiplier !== undefined) {
                    betMode.costMultiplier = costMultiplier;
                }
                if (targetRtp !== undefined) {
                    betMode.targetRtp = targetRtp;
                }
                if (rawRuntimeType !== undefined) {
                    betMode.runtimeType = rawRuntimeType as BetMode["runtimeType"];
                }
                if (isDefault) {
                    betMode.isDefault = true;
                }
                if (forcedFreeGames !== undefined) {
                    betMode.forcedFreeGames = forcedFreeGames;
                }
                betModes.push(betMode);
            });
        }

        return {value: betModes, issues};
    }

    public toRows(betModes: BetMode[]): SheetGrid {
        return [
            COLUMNS,
            ...betModes.map((mode) => [
                mode.id,
                mode.label ?? "",
                mode.costMultiplier ?? "",
                mode.targetRtp ?? "",
                mode.runtimeType ?? "",
                mode.isDefault === true,
                mode.forcedFreeGames ?? "",
            ]),
        ];
    }
}

import type {GameBlueprintWinModel} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {WinModelSheetMapping} from "./WinModelSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow} from "./sheetCellParsing.js";

const COLUMNS = ["Key", "Value"];
const KNOWN_KEYS = ["Type", "Minimum Cluster Size"];

export class WinModelSheetMapper implements WinModelSheetMapping {
    public readonly sheetName = "WinModel";

    public fromRows(rows: SheetGrid): {value: GameBlueprintWinModel | undefined; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const headerRow = header ?? [];
        const keyIndex = headerRow.findIndex((cell) => cellToText(cell)?.toLowerCase() === "key");
        const valueIndex = headerRow.findIndex((cell) => cellToText(cell)?.toLowerCase() === "value");

        const values = new Map<string, string>();
        if (keyIndex !== -1 && valueIndex !== -1) {
            for (const row of dataRows) {
                if (isBlankRow(row)) {
                    continue;
                }
                const key = cellToText(row[keyIndex]);
                if (key === undefined) {
                    continue;
                }
                const knownKey = KNOWN_KEYS.find((candidate) => candidate.toLowerCase() === key.toLowerCase());
                if (!knownKey) {
                    issues.push({
                        code: "parsheet-winmodel-unknown-key",
                        severity: "warning",
                        message: `Sheet "${this.sheetName}" has an unrecognized key "${key}", which is ignored.`,
                        details: {sheet: this.sheetName, key},
                    });
                    continue;
                }
                if (values.has(knownKey)) {
                    issues.push({
                        code: "parsheet-winmodel-duplicate-key",
                        severity: "warning",
                        message: `Sheet "${this.sheetName}" has more than one "${knownKey}" row; the last one is used.`,
                        details: {sheet: this.sheetName, key: knownKey},
                    });
                }
                values.set(knownKey, cellToText(row[valueIndex]) ?? "");
            }
        }

        const rawType = values.get("Type");
        const type = rawType?.toLowerCase();
        const minimumClusterSize = cellToNumber(values.get("Minimum Cluster Size"));

        if (type === undefined) {
            issues.push({
                code: "parsheet-winmodel-missing-type",
                severity: "error",
                message: `Sheet "${this.sheetName}" is present but has no "Type" value, so its win model can't be recovered.`,
                details: {sheet: this.sheetName},
            });
            return {value: undefined, issues};
        }

        if (type !== "clusters" && minimumClusterSize !== undefined) {
            issues.push({
                code: "parsheet-winmodel-cluster-size-ignored",
                severity: "warning",
                message: `Sheet "${this.sheetName}" has a "Minimum Cluster Size" value, but "Type" is "${type}" -- it only applies to "clusters" and is ignored.`,
                details: {sheet: this.sheetName, type},
            });
        }

        switch (type) {
            case "lines":
                return {value: {type: "lines"}, issues};
            case "ways":
                return {value: {type: "ways"}, issues};
            case "clusters":
                return {
                    value: minimumClusterSize !== undefined ? {type: "clusters", minimumClusterSize} : {type: "clusters"},
                    issues,
                };
            default:
                issues.push({
                    code: "parsheet-winmodel-invalid-type",
                    severity: "error",
                    message: `Sheet "${this.sheetName}" has "Type" = "${rawType}", but it must be one of: lines, ways, clusters.`,
                    details: {sheet: this.sheetName, type: rawType},
                });
                return {value: undefined, issues};
        }
    }

    public toRows(winModel: GameBlueprintWinModel): SheetGrid {
        const rows: SheetGrid = [COLUMNS, ["Type", winModel.type]];
        if (winModel.type === "clusters" && winModel.minimumClusterSize !== undefined) {
            rows.push(["Minimum Cluster Size", winModel.minimumClusterSize]);
        }
        return rows;
    }
}

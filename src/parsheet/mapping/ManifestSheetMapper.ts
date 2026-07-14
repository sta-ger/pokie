import type {GameBlueprintManifest} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ManifestSheetMapping, ManifestSheetValue} from "./ManifestSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow, resolveColumnIndexes} from "./sheetCellParsing.js";

const COLUMNS = ["Key", "Value"];
const KNOWN_KEYS = ["Id", "Name", "Version", "Description", "Author", "Reels", "Rows"];

export class ManifestSheetMapper implements ManifestSheetMapping {
    public readonly sheetName = "Manifest";

    public fromRows(rows: SheetGrid): {value: ManifestSheetValue; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const [header, ...dataRows] = rows;
        const columns = resolveColumnIndexes(header ?? [], COLUMNS, this.sheetName, issues);
        const keyIndex = columns.Key;
        const valueIndex = columns.Value;

        const values = new Map<string, string>();
        if (keyIndex !== undefined && valueIndex !== undefined) {
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
                        code: "parsheet-manifest-unknown-key",
                        severity: "warning",
                        message: `Sheet "${this.sheetName}" has an unrecognized key "${key}", which is ignored.`,
                        details: {sheet: this.sheetName, key},
                    });
                    continue;
                }
                if (values.has(knownKey)) {
                    issues.push({
                        code: "parsheet-manifest-duplicate-key",
                        severity: "warning",
                        message: `Sheet "${this.sheetName}" has more than one "${knownKey}" row; the last one is used.`,
                        details: {sheet: this.sheetName, key: knownKey},
                    });
                }
                values.set(knownKey, cellToText(row[valueIndex]) ?? "");
            }
        }

        const manifest: GameBlueprintManifest = {
            id: values.get("Id") ?? "",
            name: values.get("Name") ?? "",
            version: values.get("Version") ?? "",
        };
        // A blank Value cell (toRows always writes a Description/Author row, even an empty one — see
        // toRows below) is indistinguishable from the row never having been given a value at all, so
        // both are treated as "omit the field", not as manifest.description/author === "".
        const description = values.get("Description");
        if (description) {
            manifest.description = description;
        }
        const author = values.get("Author");
        if (author) {
            manifest.author = author;
        }

        return {
            value: {
                manifest,
                reels: cellToNumber(values.get("Reels")) ?? 0,
                rows: cellToNumber(values.get("Rows")) ?? 0,
            },
            issues,
        };
    }

    public toRows(manifest: GameBlueprintManifest, reels: number, rows: number): SheetGrid {
        return [
            COLUMNS,
            ["Id", manifest.id],
            ["Name", manifest.name],
            ["Version", manifest.version],
            ["Description", manifest.description ?? ""],
            ["Author", manifest.author ?? ""],
            ["Reels", reels],
            ["Rows", rows],
        ];
    }
}

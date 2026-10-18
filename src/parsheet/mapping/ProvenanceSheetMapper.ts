import {parseParSheetConversionReport} from "../ParSheetConversionReport.js";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {computeBlueprintHash} from "../computeBlueprintHash.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ParSheetProvenance} from "./ParSheetProvenance.js";
import type {ProvenanceSheetMapping} from "./ProvenanceSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow} from "./sheetCellParsing.js";

const COLUMNS = ["Key", "Value"];
const KNOWN_KEYS = ["Schema Version", "Pokie Version", "Exported At", "Source", "Blueprint Hash", "Lossless Eligible", "Conversion Evidence"];

// Meta fields are optional, but ignored or ambiguous content must be disclosed before a lossless
// claim. Whether the parsed provenance is
// complete, whether its schema version/hash format are well-formed, and whether its hash matches the
// just-imported blueprint are all judged by ParSheetImporter instead, once it has the fully
// assembled blueprint to compare against (see ParSheetImporter.verifyProvenance).
export class ProvenanceSheetMapper implements ProvenanceSheetMapping {
    public readonly sheetName = "Meta";

    public fromRows(rows: SheetGrid): {value: ParSheetProvenance; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const ignored = (message: string) => issues.push({code: "parsheet-meta-ignored-content", severity: "warning", message, details: {sheet: this.sheetName}});
        const [header, ...dataRows] = rows;
        const headerRow = header ?? [];
        const keyIndex = headerRow.findIndex((cell) => cellToText(cell)?.toLowerCase() === "key");
        const valueIndex = headerRow.findIndex((cell) => cellToText(cell)?.toLowerCase() === "value");

        headerRow.forEach((cell, index) => {
            if (cellToText(cell) !== undefined && index !== keyIndex && index !== valueIndex) ignored(`Sheet "Meta" has an ignored or duplicate column "${cellToText(cell)}".`);
        });
        const values = new Map<string, string>();
        if (keyIndex !== -1 && valueIndex !== -1) {
            for (const row of dataRows) {
                if (isBlankRow(row)) {
                    continue;
                }
                const key = cellToText(row[keyIndex]);
                if (key === undefined) {
                    ignored('Sheet "Meta" has a nonempty row without a Key; the row is ignored.');
                    continue;
                }
                const knownKey = KNOWN_KEYS.find((candidate) => candidate.toLowerCase() === key.toLowerCase());
                if (knownKey) {
                    if (values.has(knownKey)) ignored(`Sheet "Meta" repeats key "${knownKey}"; the last value is used.`);
                    values.set(knownKey, cellToText(row[valueIndex]) ?? "");
                } else {
                    ignored(`Sheet "Meta" has unrecognized key "${key}", which is ignored.`);
                }
            }
        }

        const provenance: ParSheetProvenance = {};
        const schemaVersion = cellToNumber(values.get("Schema Version"));
        if (schemaVersion !== undefined) {
            provenance.schemaVersion = schemaVersion;
        }
        const pokieVersion = values.get("Pokie Version");
        if (pokieVersion !== undefined) {
            provenance.pokieVersion = pokieVersion;
        }
        const exportedAt = values.get("Exported At");
        if (exportedAt !== undefined) {
            provenance.exportedAt = exportedAt;
        }
        const source = values.get("Source");
        if (source !== undefined) {
            provenance.source = source;
        }
        const blueprintHash = values.get("Blueprint Hash");
        if (blueprintHash !== undefined) {
            provenance.blueprintHash = blueprintHash;
        }
        const losslessEligible = values.get("Lossless Eligible");
        if (losslessEligible === "true") provenance.losslessEligible = true;
        if (losslessEligible === "false") provenance.losslessEligible = false;
        if (losslessEligible !== undefined && losslessEligible !== "true" && losslessEligible !== "false") {
            provenance.losslessEligible = false;
            issues.push({code: "parsheet-provenance-lossless-invalid", severity: "warning", message: 'Meta "Lossless Eligible" must be the literal true or false.', details: {value: losslessEligible, losslessEligible: false}});
        }

        const history = values.get("Conversion Evidence");
        if (history !== undefined) {
            try {
                provenance.conversionReport = parseParSheetConversionReport(JSON.parse(history));
            } catch {
                provenance.losslessEligible = false;
                issues.push({code: "parsheet-provenance-history-invalid", severity: "warning", message: "Meta Conversion Evidence is malformed; prior losses cannot be established.", details: {losslessEligible: false}});
            }
        }
        return {value: provenance, issues};
    }

    public toRows(blueprint: GameBlueprint, pokieVersion: string, exportedAt: Date, sourcePath: string | undefined, losslessEligible?: boolean, conversionReport?: import("../ParSheetConversionReport.js").ParSheetConversionReport): SheetGrid {
        return [
            COLUMNS,
            ["Schema Version", GAME_BLUEPRINT_SCHEMA_VERSION],
            ["Pokie Version", pokieVersion],
            ["Exported At", exportedAt.toISOString()],
            ["Source", sourcePath ?? ""],
            ["Blueprint Hash", computeBlueprintHash(blueprint)],
            ["Lossless Eligible", String(losslessEligible ?? true)],
            ...(conversionReport === undefined ? [] : [["Conversion Evidence", JSON.stringify(conversionReport)]]),
        ];
    }
}

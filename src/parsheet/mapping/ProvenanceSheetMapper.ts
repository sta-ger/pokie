import crypto from "crypto";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ParSheetProvenance} from "./ParSheetProvenance.js";
import type {ProvenanceSheetMapping} from "./ProvenanceSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow} from "./sheetCellParsing.js";

const COLUMNS = ["Key", "Value"];
const KNOWN_KEYS = ["Schema Version", "Pokie Version", "Exported At", "Source", "Blueprint Hash"];

export class ProvenanceSheetMapper implements ProvenanceSheetMapping {
    public readonly sheetName = "Meta";

    public fromRows(rows: SheetGrid): {value: ParSheetProvenance; issues: ValidationIssue[]} {
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
                if (knownKey) {
                    values.set(knownKey, cellToText(row[valueIndex]) ?? "");
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

        const issues: ValidationIssue[] = [];
        if (Object.keys(provenance).length > 0) {
            issues.push({
                code: "parsheet-provenance-present",
                severity: "info",
                message: `This file was exported by pokie${provenance.pokieVersion ? ` v${provenance.pokieVersion}` : ""}${
                    provenance.exportedAt ? ` on ${provenance.exportedAt}` : ""
                }.`,
                details: {...provenance},
            });
        }

        return {value: provenance, issues};
    }

    public toRows(blueprint: GameBlueprint, pokieVersion: string, exportedAt: Date, sourcePath: string | undefined): SheetGrid {
        const blueprintHash = `sha256:${crypto.createHash("sha256").update(JSON.stringify(blueprint)).digest("hex")}`;
        return [
            COLUMNS,
            ["Schema Version", GAME_BLUEPRINT_SCHEMA_VERSION],
            ["Pokie Version", pokieVersion],
            ["Exported At", exportedAt.toISOString()],
            ["Source", sourcePath ?? ""],
            ["Blueprint Hash", blueprintHash],
        ];
    }
}

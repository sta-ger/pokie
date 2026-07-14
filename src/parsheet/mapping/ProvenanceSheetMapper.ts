import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {computeBlueprintHash} from "../computeBlueprintHash.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ParSheetProvenance} from "./ParSheetProvenance.js";
import type {ProvenanceSheetMapping} from "./ProvenanceSheetMapping.js";
import {cellToNumber, cellToText, isBlankRow} from "./sheetCellParsing.js";

const COLUMNS = ["Key", "Value"];
const KNOWN_KEYS = ["Schema Version", "Pokie Version", "Exported At", "Source", "Blueprint Hash"];

// A pure parse of the "Meta" sheet's Key/Value rows into ParSheetProvenance — no ValidationIssue of
// its own, since every field here is optional/informational at the sheet-shape level (nothing here
// is "wrong" the way a blank required Symbol cell would be). Whether the parsed provenance is
// complete, whether its schema version/hash format are well-formed, and whether its hash matches the
// just-imported blueprint are all judged by ParSheetImporter instead, once it has the fully
// assembled blueprint to compare against (see ParSheetImporter.verifyProvenance).
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

        return {value: provenance, issues: []};
    }

    public toRows(blueprint: GameBlueprint, pokieVersion: string, exportedAt: Date, sourcePath: string | undefined): SheetGrid {
        return [
            COLUMNS,
            ["Schema Version", GAME_BLUEPRINT_SCHEMA_VERSION],
            ["Pokie Version", pokieVersion],
            ["Exported At", exportedAt.toISOString()],
            ["Source", sourcePath ?? ""],
            ["Blueprint Hash", computeBlueprintHash(blueprint)],
        ];
    }
}

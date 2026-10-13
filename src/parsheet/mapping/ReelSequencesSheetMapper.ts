import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {SheetGrid} from "../SheetGrid.js";
import type {ReelSequencesSheetMapping} from "./ReelSequencesSheetMapping.js";
import {resolveColumnIndexes} from "./sheetCellParsing.js";

export const PAR_SEQUENCE_CONTEXT = "logical-round-v1";
export const PAR_SEQUENCE_SAMPLING = "binary64-integer-ratios-v1";
const COLUMNS = ["Reel", "Variant", "Type", "ID", "Weight", "Position", "Symbol", "Context", "Sampling", "Length"];
type Definition = {type: string; id: string; weight: number; length: number; positions: Map<number, string>};

/** One row per ordered symbol. Text weights preserve every finite binary64 value through XLSX. */
export class ReelSequencesSheetMapper implements ReelSequencesSheetMapping {
    public readonly sheetName = "ReelSequences";

    public toRows(reels: NonNullable<GameBlueprint["reelSequences"]>): SheetGrid {
        const rows: SheetGrid = [[...COLUMNS]];
        reels.forEach((reel, reelIndex) => {
            const variants = reel.type === "weighted" ? reel.variants : [{id: "", weight: 0, symbols: reel.symbols}];
            variants.forEach((variant, variantIndex) =>
                variant.symbols.forEach((symbol, position) => {
                    rows.push([
                        reelIndex + 1,
                        variantIndex + 1,
                        reel.type,
                        variant.id,
                        reel.type === "weighted" ? String(variant.weight) : "",
                        position + 1,
                        symbol,
                        PAR_SEQUENCE_CONTEXT,
                        PAR_SEQUENCE_SAMPLING,
                        variant.symbols.length,
                    ]);
                }),
            );
        });
        return rows;
    }

    public fromRows(
        rows: SheetGrid,
        reels: number,
    ): {value: NonNullable<GameBlueprint["reelSequences"]>; issues: ValidationIssue[]} {
        const issues: ValidationIssue[] = [];
        const columns = resolveColumnIndexes(rows[0] ?? [], COLUMNS, this.sheetName, issues);
        const definitions = new Map<number, Map<number, Definition>>();
        const error = (row: number, column: string, message: string): void => {
            issues.push({
                code: "parsheet-reelsequences-invalid",
                severity: "error",
                message: `Sheet "${this.sheetName}", row ${row}, column "${column}": ${message}`,
                details: {sheet: this.sheetName, row, column},
            });
        };
        const headers = rows[0] ?? [];
        for (const name of COLUMNS) if (
            headers.filter((cell) => typeof cell === "string" && cell.toLowerCase() === name.toLowerCase()).length >
                1
        ) error(1, name, "Duplicate column.");
        rows.slice(1).forEach((row, index) => {
            const number = index + 2;
            const cell = (name: string): unknown => row[columns[name]];
            const reel = Number(cell("Reel")),
                variant = Number(cell("Variant")),
                position = Number(cell("Position"));
            if (!Number.isSafeInteger(reel) || reel < 1 || reel > reels) return error(number, "Reel", "Expected a one-based reel index within Manifest.Reels.");
            if (!Number.isSafeInteger(variant) || variant < 1 || variant > rows.length) return error(number, "Variant", "Expected a contiguous one-based variant index.");
            if (!Number.isSafeInteger(position) || position < 1 || position > rows.length) return error(number, "Position", "Expected a contiguous one-based symbol position.");
            if (cell("Context") !== PAR_SEQUENCE_CONTEXT || cell("Sampling") !== PAR_SEQUENCE_SAMPLING) error(
                number,
                "Context / Sampling",
                `Only ${PAR_SEQUENCE_CONTEXT} / ${PAR_SEQUENCE_SAMPLING} is supported.`,
            );
            const type = cell("Type"),
                id = cell("ID") ?? "",
                rawWeight = cell("Weight") ?? "";
            if (type !== "exact" && type !== "weighted") return error(number, "Type", "Expected exact or weighted.");
            if (typeof id !== "string" || (type === "weighted" && !id.trim())) return error(
                number,
                "ID",
                "Expected a nonempty text ID for a weighted variant (IDs are case-sensitive).",
            );
            const length = Number(cell("Length"));
            if (!Number.isSafeInteger(length) || length < 1 || length > rows.length || position > length) error(
                number,
                "Length / Position",
                "Length must cover every ordered position in the complete sequence.",
            );
            const weight = type === "exact" ? 0 : Number(rawWeight);
            if (type === "exact" && (id !== "" || rawWeight !== "" || variant !== 1)) error(number, "Variant / ID / Weight", "Exact reels have one array and no variant ID or weight.");
            if (type === "weighted" && (String(rawWeight).trim() === "" || !Number.isFinite(weight) || weight < 0)) error(number, "Weight", "Expected a finite nonnegative relative weight.");
            const symbol = cell("Symbol");
            if (typeof symbol !== "string" || !symbol.length) return error(number, "Symbol", "Expected a nonempty text symbol ID.");
            let reelDefinitions = definitions.get(reel);
            if (!reelDefinitions) definitions.set(reel, (reelDefinitions = new Map()));
            let definition = reelDefinitions.get(variant);
            if (!definition) reelDefinitions.set(variant, (definition = {type, id, weight, length, positions: new Map()}));
            if (
                definition.type !== type ||
                definition.id !== id ||
                definition.weight !== weight ||
                definition.length !== length
            ) error(number, "Type / ID / Weight", "Variant metadata must agree at every position.");
            if (definition.positions.has(position)) error(number, "Position", "Duplicate symbol position.");
            definition.positions.set(position, symbol);
            return undefined;
        });
        const value: NonNullable<GameBlueprint["reelSequences"]> = [];
        for (let reel = 1; reel <= (Number.isSafeInteger(reels) && reels > 0 ? reels : 0); reel++) {
            const variants = [...(definitions.get(reel) ?? new Map<number, Definition>()).entries()].sort(
                ([a], [b]) => a - b,
            );
            if (!variants.length) error(1, "Reel", `Missing reel ${reel}.`);
            const arrays = variants.map(([index, definition], offset) => {
                if (index !== offset + 1) error(1, "Variant", `Reel ${reel} has a missing variant index.`);
                const positions = [...definition.positions.entries()].sort(([a], [b]) => a - b);
                if (positions.length !== definition.length || positions.some(([position], i) => position !== i + 1)) error(1, "Position", `Reel ${reel}, variant ${index} has missing positions.`);
                return {id: definition.id, weight: definition.weight, symbols: positions.map(([, symbol]) => symbol)};
            });
            const type = variants[0]?.[1].type;
            if (variants.some(([, definition]) => definition.type !== type)) error(1, "Type", `Reel ${reel} mixes exact and weighted definitions.`);
            value.push(
                type === "exact"
                    ? {type: "exact", symbols: arrays[0]?.symbols ?? []}
                    : {type: "weighted", variants: arrays},
            );
        }
        return {value, issues};
    }
}

import ExcelJS from "exceljs";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "../generated/GameBlueprint.js";
import type {GameBlueprintValidating} from "../generated/GameBlueprintValidating.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {computeBlueprintHash} from "./computeBlueprintHash.js";
import {AvailableBetsSheetMapper} from "./mapping/AvailableBetsSheetMapper.js";
import type {AvailableBetsSheetMapping} from "./mapping/AvailableBetsSheetMapping.js";
import {ManifestSheetMapper} from "./mapping/ManifestSheetMapper.js";
import type {ManifestSheetMapping} from "./mapping/ManifestSheetMapping.js";
import type {ParSheetProvenance} from "./mapping/ParSheetProvenance.js";
import {PaylinesSheetMapper} from "./mapping/PaylinesSheetMapper.js";
import type {PaylinesSheetMapping} from "./mapping/PaylinesSheetMapping.js";
import {PaytableSheetMapper} from "./mapping/PaytableSheetMapper.js";
import type {PaytableSheetMapping} from "./mapping/PaytableSheetMapping.js";
import {ProvenanceSheetMapper} from "./mapping/ProvenanceSheetMapper.js";
import type {ProvenanceSheetMapping} from "./mapping/ProvenanceSheetMapping.js";
import {ReelStripsSheetMapper} from "./mapping/ReelStripsSheetMapper.js";
import type {ReelStripsSheetMapping} from "./mapping/ReelStripsSheetMapping.js";
import {SymbolsSheetMapper} from "./mapping/SymbolsSheetMapper.js";
import type {SymbolsSheetMapping} from "./mapping/SymbolsSheetMapping.js";
import type {ParSheetImporting} from "./ParSheetImporting.js";
import type {ParSheetImportResult} from "./ParSheetImportResult.js";
import type {SheetGrid} from "./SheetGrid.js";

// "Manifest"/"Symbols"/"Paytable" are the minimum needed to describe a playable blueprint at all
// (mirrors GameBlueprint's own required fields); the rest are optional, matching reelStrips/
// paylines/availableBets being optional on GameBlueprint itself. "Meta" is provenance-only — see
// ProvenanceSheetMapping.
const REQUIRED_SHEETS = ["Manifest", "Symbols", "Paytable"];
const OPTIONAL_SHEETS = ["ReelStrips", "Paylines", "AvailableBets", "Meta"];
const KNOWN_SHEETS = [...REQUIRED_SHEETS, ...OPTIONAL_SHEETS];
const BLUEPRINT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class ParSheetImporter implements ParSheetImporting {
    private readonly manifestMapper: ManifestSheetMapping;
    private readonly symbolsMapper: SymbolsSheetMapping;
    private readonly reelStripsMapper: ReelStripsSheetMapping;
    private readonly paytableMapper: PaytableSheetMapping;
    private readonly paylinesMapper: PaylinesSheetMapping;
    private readonly availableBetsMapper: AvailableBetsSheetMapping;
    private readonly provenanceMapper: ProvenanceSheetMapping;
    private readonly validator: GameBlueprintValidating;
    private readonly readWorkbook: (filePath: string) => Promise<ExcelJS.Workbook>;

    constructor(
        manifestMapper: ManifestSheetMapping = new ManifestSheetMapper(),
        symbolsMapper: SymbolsSheetMapping = new SymbolsSheetMapper(),
        reelStripsMapper: ReelStripsSheetMapping = new ReelStripsSheetMapper(),
        paytableMapper: PaytableSheetMapping = new PaytableSheetMapper(),
        paylinesMapper: PaylinesSheetMapping = new PaylinesSheetMapper(),
        availableBetsMapper: AvailableBetsSheetMapping = new AvailableBetsSheetMapper(),
        provenanceMapper: ProvenanceSheetMapping = new ProvenanceSheetMapper(),
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        readWorkbook: (filePath: string) => Promise<ExcelJS.Workbook> = async (filePath) => {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            return workbook;
        },
    ) {
        this.manifestMapper = manifestMapper;
        this.symbolsMapper = symbolsMapper;
        this.reelStripsMapper = reelStripsMapper;
        this.paytableMapper = paytableMapper;
        this.paylinesMapper = paylinesMapper;
        this.availableBetsMapper = availableBetsMapper;
        this.provenanceMapper = provenanceMapper;
        this.validator = validator;
        this.readWorkbook = readWorkbook;
    }

    public async importFromFile(filePath: string): Promise<ParSheetImportResult> {
        const workbook = await this.readWorkbook(filePath);
        const issues: ValidationIssue[] = [];

        const sheetsByName = new Map(workbook.worksheets.map((worksheet): [string, ExcelJS.Worksheet] => [worksheet.name, worksheet]));
        for (const name of sheetsByName.keys()) {
            if (!KNOWN_SHEETS.includes(name)) {
                issues.push({
                    code: "parsheet-unknown-sheet",
                    severity: "warning",
                    message: `Sheet "${name}" is not a recognized PAR sheet and is ignored.`,
                    details: {sheet: name},
                });
            }
        }
        for (const name of REQUIRED_SHEETS) {
            if (!sheetsByName.has(name)) {
                issues.push({
                    code: "parsheet-missing-sheet",
                    severity: "error",
                    message: `Required sheet "${name}" is missing.`,
                    details: {sheet: name},
                });
            }
        }

        const gridFor = (name: string): SheetGrid => {
            const worksheet = sheetsByName.get(name);
            return worksheet ? sheetToGrid(worksheet) : [];
        };

        const manifestResult = this.manifestMapper.fromRows(gridFor("Manifest"));
        const symbolsResult = this.symbolsMapper.fromRows(gridFor("Symbols"));
        const paytableResult = this.paytableMapper.fromRows(gridFor("Paytable"));
        issues.push(...manifestResult.issues, ...symbolsResult.issues, ...paytableResult.issues);

        const blueprint: GameBlueprint = {
            manifest: manifestResult.value.manifest,
            reels: manifestResult.value.reels,
            rows: manifestResult.value.rows,
            symbols: symbolsResult.value.symbols,
            paytable: paytableResult.value,
        };
        if (symbolsResult.value.wilds.length > 0) {
            blueprint.wilds = symbolsResult.value.wilds;
        }
        if (symbolsResult.value.scatters.length > 0) {
            blueprint.scatters = symbolsResult.value.scatters;
        }

        if (sheetsByName.has("ReelStrips")) {
            const reelStripsResult = this.reelStripsMapper.fromRows(gridFor("ReelStrips"));
            issues.push(...reelStripsResult.issues);
            blueprint.reelStrips = reelStripsResult.value;
        }
        if (sheetsByName.has("Paylines")) {
            const paylinesResult = this.paylinesMapper.fromRows(gridFor("Paylines"));
            issues.push(...paylinesResult.issues);
            if (paylinesResult.value.length > 0) {
                blueprint.paylines = paylinesResult.value;
            }
        }
        if (sheetsByName.has("AvailableBets")) {
            const availableBetsResult = this.availableBetsMapper.fromRows(gridFor("AvailableBets"));
            issues.push(...availableBetsResult.issues);
            if (availableBetsResult.value.length > 0) {
                blueprint.availableBets = availableBetsResult.value;
            }
        }
        let provenance: ParSheetProvenance | undefined;
        if (sheetsByName.has("Meta")) {
            provenance = this.provenanceMapper.fromRows(gridFor("Meta")).value;
            issues.push(...this.verifyProvenance(provenance, blueprint));
        } else {
            issues.push({
                code: "parsheet-provenance-missing",
                severity: "warning",
                message: 'This file has no "Meta" sheet, so its origin/export history is unknown.',
            });
        }

        issues.push(...this.validator.validate(blueprint));

        return {blueprint, provenance, issues};
    }

    // Judges the "Meta" sheet's parsed provenance against the blueprint ParSheetImporter just
    // assembled: incomplete/malformed provenance (missing/non-numeric schema version, missing/badly
    // formatted hash) is reported once as "parsheet-provenance-malformed" and nothing further is
    // checked (there's nothing reliable left to compare). Otherwise a schema version this pokie
    // doesn't recognize is "parsheet-provenance-schema-mismatch", and a well-formed hash that doesn't
    // match a fresh computeBlueprintHash(blueprint) is "parsheet-provenance-hash-mismatch" — the
    // workbook was hand-edited (or otherwise changed) since "pokie par export" produced it. Only when
    // every check passes is the informational "parsheet-provenance-present" issue reported.
    private verifyProvenance(provenance: ParSheetProvenance, blueprint: GameBlueprint): ValidationIssue[] {
        const problems: string[] = [];
        if (provenance.schemaVersion === undefined) {
            problems.push('"Schema Version" is missing or not a number');
        }
        const hashPresentAndWellFormed = provenance.blueprintHash !== undefined && BLUEPRINT_HASH_PATTERN.test(provenance.blueprintHash);
        if (provenance.blueprintHash === undefined) {
            problems.push('"Blueprint Hash" is missing');
        } else if (!hashPresentAndWellFormed) {
            problems.push('"Blueprint Hash" is not a well-formed sha256 hash');
        }

        if (problems.length > 0) {
            return [
                {
                    code: "parsheet-provenance-malformed",
                    severity: "warning",
                    message: `The "Meta" sheet is present but its provenance is incomplete/invalid: ${problems.join("; ")}.`,
                    details: {...provenance, problems},
                },
            ];
        }

        const issues: ValidationIssue[] = [];
        if (provenance.schemaVersion !== GAME_BLUEPRINT_SCHEMA_VERSION) {
            issues.push({
                code: "parsheet-provenance-schema-mismatch",
                severity: "warning",
                message: `The "Meta" sheet records schema version ${provenance.schemaVersion}, but this "pokie" understands version ${GAME_BLUEPRINT_SCHEMA_VERSION}.`,
                details: {recorded: provenance.schemaVersion, expected: GAME_BLUEPRINT_SCHEMA_VERSION},
            });
        }

        const recomputedHash = computeBlueprintHash(blueprint);
        if (provenance.blueprintHash !== recomputedHash) {
            issues.push({
                code: "parsheet-provenance-hash-mismatch",
                severity: "warning",
                message: 'This workbook\'s recorded "Blueprint Hash" does not match the imported data — it may have been edited by hand since "pokie par export" produced it.',
                details: {recorded: provenance.blueprintHash, recomputed: recomputedHash},
            });
        } else {
            issues.push({
                code: "parsheet-provenance-present",
                severity: "info",
                message: `This file was exported by pokie${provenance.pokieVersion ? ` v${provenance.pokieVersion}` : ""}${
                    provenance.exportedAt ? ` on ${provenance.exportedAt}` : ""
                }, and its recorded hash matches the imported data.`,
                details: {...provenance},
            });
        }

        return issues;
    }
}

function sheetToGrid(worksheet: ExcelJS.Worksheet): SheetGrid {
    const grid: SheetGrid = [];
    worksheet.eachRow({includeEmpty: true}, (row) => {
        const cells: unknown[] = [];
        row.eachCell({includeEmpty: true}, (cell) => {
            cells.push(cellValueToPrimitive(cell.value));
        });
        grid.push(cells);
    });
    return grid;
}

// Reduces exceljs's own CellValue union (formulas, rich text, hyperlinks, errors, dates, ...) down to
// the plain string/number/boolean/undefined shape every mapping/*.ts file works with — a formula cell
// reads back as its last computed result, rich text as its plain concatenated text, a hyperlink cell
// as its display text, and an error cell as blank (there is no sensible plain value for "#N/A").
function cellValueToPrimitive(value: ExcelJS.CellValue): unknown {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value !== "object") {
        return value;
    }
    if ("richText" in value) {
        return value.richText.map((fragment) => fragment.text).join("");
    }
    if ("formula" in value || "sharedFormula" in value) {
        return cellValueToPrimitive(value.result ?? null);
    }
    if ("hyperlink" in value) {
        return value.text;
    }
    return undefined;
}

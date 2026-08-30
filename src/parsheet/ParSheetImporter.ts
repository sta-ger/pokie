import ExcelJS from "exceljs";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "../generated/GameBlueprint.js";
import type {GameBlueprintValidating} from "../generated/GameBlueprintValidating.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {computeBlueprintHash} from "./computeBlueprintHash.js";
import {AvailableBetsSheetMapper} from "./mapping/AvailableBetsSheetMapper.js";
import type {AvailableBetsSheetMapping} from "./mapping/AvailableBetsSheetMapping.js";
import {BetModesSheetMapper} from "./mapping/BetModesSheetMapper.js";
import type {BetModesSheetMapping} from "./mapping/BetModesSheetMapping.js";
import {ManifestSheetMapper} from "./mapping/ManifestSheetMapper.js";
import type {ManifestSheetMapping} from "./mapping/ManifestSheetMapping.js";
import {MechanicsSheetMapper} from "./mapping/MechanicsSheetMapper.js";
import type {MechanicsSheetMapping} from "./mapping/MechanicsSheetMapping.js";
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
import {WinModelSheetMapper} from "./mapping/WinModelSheetMapper.js";
import type {WinModelSheetMapping} from "./mapping/WinModelSheetMapping.js";
import type {ParSheetImporting} from "./ParSheetImporting.js";
import type {ParSheetImportResult} from "./ParSheetImportResult.js";
import type {SheetGrid} from "./SheetGrid.js";
import {cellToText} from "./mapping/sheetCellParsing.js";

// "Manifest"/"Symbols"/"Paytable" are the minimum needed to describe a playable blueprint at all
// (mirrors GameBlueprint's own required fields); the rest are optional, matching reelStrips/
// paylines/availableBets/winModel/mechanics/betModes being optional on GameBlueprint itself. "Meta"
// is provenance-only — see ProvenanceSheetMapping.
// Exported so ProjectTargetResolver's parWorkbook adapter (see project/internal/looksLikeParWorkbookFile.ts)
// can recognize "this .xlsx has the required PAR sheets" against the exact same list this importer itself
// requires, rather than maintaining a second copy that could silently drift out of sync.
export const REQUIRED_SHEETS = ["Manifest", "Symbols", "Paytable"];
const OPTIONAL_SHEETS = ["ReelStrips", "Paylines", "AvailableBets", "WinModel", "Mechanics", "BetModes", "Meta"];
const KNOWN_SHEETS = [...REQUIRED_SHEETS, ...OPTIONAL_SHEETS];
const BLUEPRINT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
type ConversionFact = NonNullable<ParSheetImportResult["conversionEvidence"]>["facts"][number];

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
    private readonly winModelMapper: WinModelSheetMapping;
    private readonly mechanicsMapper: MechanicsSheetMapping;
    private readonly betModesMapper: BetModesSheetMapping;

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
        // Appended after every pre-existing param, same reason as ParSheetExporter's own trailing
        // winModel/mechanics/betModes mappers — never break an existing positional caller.
        winModelMapper: WinModelSheetMapping = new WinModelSheetMapper(),
        mechanicsMapper: MechanicsSheetMapping = new MechanicsSheetMapper(),
        betModesMapper: BetModesSheetMapping = new BetModesSheetMapper(),
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
        this.winModelMapper = winModelMapper;
        this.mechanicsMapper = mechanicsMapper;
        this.betModesMapper = betModesMapper;
    }

    public async importFromFile(filePath: string): Promise<ParSheetImportResult> {
        const workbook = await this.readWorkbookOrThrow(filePath);
        const issues: ValidationIssue[] = [];
        const facts: ConversionFact[] = [];

        const sheetsByName = new Map(workbook.worksheets.map((worksheet): [string, ExcelJS.Worksheet] => [worksheet.name, worksheet]));
        for (const name of sheetsByName.keys()) {
            if (!KNOWN_SHEETS.includes(name)) {
                facts.push({kind: "ignored", code: "parsheet-unknown-sheet", message: `Sheet "${name}" is not a recognized PAR sheet and is ignored.`, details: {sheet: name}});
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
                facts.push({kind: "inferredOrDefaulted", code: "parsheet-missing-sheet", message: `Required sheet "${name}" is missing.`, details: {sheet: name}});
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
            return worksheet ? sheetToGrid(worksheet, name, issues, facts) : [];
        };

        const manifestRows = gridFor("Manifest");
        const manifestResult = this.manifestMapper.fromRows(manifestRows);
        recordManifestDefaults(manifestRows, facts);
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
            const reelStripsResult = this.reelStripsMapper.fromRows(gridFor("ReelStrips"), manifestResult.value.reels);
            issues.push(...reelStripsResult.issues);
            blueprint.reelStrips = reelStripsResult.value;
        }
        if (sheetsByName.has("Paylines")) {
            const paylinesResult = this.paylinesMapper.fromRows(gridFor("Paylines"), manifestResult.value.reels);
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
        if (sheetsByName.has("WinModel")) {
            const winModelResult = this.winModelMapper.fromRows(gridFor("WinModel"));
            issues.push(...winModelResult.issues);
            if (winModelResult.value !== undefined) {
                blueprint.winModel = winModelResult.value;
            }
        }
        if (sheetsByName.has("Mechanics")) {
            const mechanicsResult = this.mechanicsMapper.fromRows(gridFor("Mechanics"));
            issues.push(...mechanicsResult.issues);
            if (mechanicsResult.value !== undefined) {
                blueprint.mechanics = {freeGames: mechanicsResult.value};
            }
        }
        if (sheetsByName.has("BetModes")) {
            const betModesResult = this.betModesMapper.fromRows(gridFor("BetModes"));
            issues.push(...betModesResult.issues);
            if (betModesResult.value.length > 0) {
                blueprint.betModes = betModesResult.value;
            }
        }
        let provenance: ParSheetProvenance | undefined;
        // Keep Meta independently from the mapper grid: mapper input
        // materializes formula results, whereas durable evidence must retain
        // the user's original Meta cells verbatim for later inspection.
        let metaSheet: readonly (readonly unknown[])[] | undefined;
        if (sheetsByName.has("Meta")) {
            metaSheet = rawSheetToGrid(sheetsByName.get("Meta")!);
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

        // Mapper diagnostics are the only place some parsers report that an
        // input was discarded (for example an unknown Key/column or a
        // duplicate row). Promote those observations into explicit evidence;
        // leaving them as generic diagnostics would let a matching Meta hash
        // incorrectly advertise an edited workbook as lossless.
        for (const issue of issues) {
            if (!facts.some((fact) => fact.code === issue.code && fact.message === issue.message)) {
                facts.push({kind: conversionFactKindForIssue(issue), code: issue.code, message: issue.message, ...(issue.details === undefined ? {} : {details: issue.details})});
            }
        }
        // A canonical export has matching Meta provenance and no importer
        // transformation.  Validation warnings can describe the playable
        // model (for example a payout recommendation) without changing any
        // PAR-representable field; ignored/formula/default facts are the
        // actual loss boundary. Errors remain ineligible even if a malformed
        // workbook happens to carry a matching hash.
        const importedBlueprintHash = computeBlueprintHash(blueprint);
        const provenanceHashMatches = provenance?.blueprintHash === importedBlueprintHash;
        const losslessEligible = provenanceHashMatches &&
            provenance?.losslessEligible !== false &&
            !issues.some((issue) => issue.severity === "error") &&
            !facts.some((fact) => fact.kind === "ignored" || fact.kind === "formulaMaterialized" || fact.kind === "inferredOrDefaulted");
        return {blueprint, provenance, issues, conversionEvidence: {metaSheet, facts, losslessEligible, importedBlueprintHash, provenanceHashMatches}};
    }

    // Wraps whatever readWorkbook throws (ExcelJS's own raw errors -- e.g. "Can't find end of central
    // directory: is this a zip file?" for a non-.xlsx/corrupt file, complete with a jszip documentation
    // URL that has nothing to do with POKIE) in the same "Could not read/parse ..." convention every
    // other file-loading entry point in this codebase already uses (see loadGameBlueprint,
    // readPokiePackageConfig) -- so a bad input file always surfaces a clean, POKIE-authored message,
    // never a third-party library's own internals verbatim.
    private async readWorkbookOrThrow(filePath: string): Promise<ExcelJS.Workbook> {
        try {
            return await this.readWorkbook(filePath);
        } catch (error) {
            throw new Error(
                `Could not read "${filePath}" as a PAR sheet XLSX workbook: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
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
        const schemaSupported = provenance.schemaVersion === GAME_BLUEPRINT_SCHEMA_VERSION;
        if (!schemaSupported) {
            issues.push({
                code: "parsheet-provenance-schema-mismatch",
                severity: "warning",
                message: `The "Meta" sheet records schema version ${provenance.schemaVersion}, but this "pokie" understands version ${GAME_BLUEPRINT_SCHEMA_VERSION}.`,
                details: {recorded: provenance.schemaVersion, expected: GAME_BLUEPRINT_SCHEMA_VERSION},
            });
        }

        const recomputedHash = computeBlueprintHash(blueprint);
        const hashMatches = provenance.blueprintHash === recomputedHash;
        if (!hashMatches) {
            issues.push({
                code: "parsheet-provenance-hash-mismatch",
                severity: "warning",
                message: 'This workbook\'s recorded "Blueprint Hash" does not match the imported data — it may have been edited by hand since "pokie par export" produced it.',
                details: {recorded: provenance.blueprintHash, recomputed: recomputedHash},
            });
        }

        // Only reported when *both* checks above pass — a schema version this pokie doesn't
        // recognize is reason enough to withhold "present" even if the hash happens to still match.
        if (schemaSupported && hashMatches) {
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

/**
 * Mapper contracts intentionally use ValidationIssue for both validation and
 * conversion reporting. Every PAR mapper observation is conversion evidence:
 * an invalid, missing, duplicate, or unsupported cell either changes what
 * reaches the model or prevents it from being recovered. Ordinary Blueprint
 * validation and Meta provenance verification remain diagnostics because
 * they do not themselves transform workbook input.
 */
function conversionFactKindForIssue(issue: ValidationIssue): ConversionFact["kind"] {
    return issue.code.startsWith("parsheet-") && !issue.code.startsWith("parsheet-provenance-")
        ? "ignored"
        : "diagnostic";
}

// ManifestSheetMapper intentionally supplies a structurally usable model even
// for a hand-edited workbook with missing cells (the validator then describes
// why that model is invalid).  Preserve each such materialization as an
// explicit conversion fact: users must never have to infer a default from a
// later generic validation error.
function recordManifestDefaults(rows: SheetGrid, facts: ConversionFact[]): void {
    const [header, ...dataRows] = rows;
    const keyIndex = (header ?? []).findIndex((cell) => cellToText(cell)?.toLowerCase() === "key");
    const valueIndex = (header ?? []).findIndex((cell) => cellToText(cell)?.toLowerCase() === "value");
    const values = new Map<string, unknown>();
    if (keyIndex >= 0 && valueIndex >= 0) {
        for (const row of dataRows) {
            const key = cellToText(row[keyIndex]);
            if (key !== undefined) values.set(key.toLowerCase(), row[valueIndex]);
        }
    }
    for (const [key, value] of [["Id", ""], ["Name", ""], ["Version", ""], ["Reels", 0], ["Rows", 0]] as const) {
        const raw = values.get(key.toLowerCase());
        const missing = raw === undefined || cellToText(raw) === undefined || (key === "Reels" || key === "Rows") && Number.isNaN(Number(cellToText(raw)));
        if (missing) {
            facts.push({
                kind: "inferredOrDefaulted",
                code: "parsheet-manifest-defaulted-value",
                message: `Sheet "Manifest" has no usable "${key}" value; imported Blueprint uses ${JSON.stringify(value)}.`,
                details: {sheet: "Manifest", key, value},
            });
        }
    }
}

// Converts one worksheet to a plain SheetGrid, same as before, but also reports a "parsheet-formula-cell"
// warning (once per sheet, counting every affected cell) whenever cellValueToPrimitive silently downgraded
// a formula cell to its last computed result -- see that function's own doc comment for why the formula
// itself is never imported. One aggregated issue per sheet, not one per cell: a sheet built from a
// spreadsheet template can easily have dozens of formula cells (e.g. a "Total" column), and a separate
// issue per cell would drown out every other diagnostic without adding information a reader couldn't
// already get by opening the workbook itself.
function sheetToGrid(worksheet: ExcelJS.Worksheet, sheetName: string, issues: ValidationIssue[], facts: ConversionFact[]): SheetGrid {
    const grid: SheetGrid = [];
    let formulaCellCount = 0;
    worksheet.eachRow({includeEmpty: true}, (row) => {
        const cells: unknown[] = [];
        row.eachCell({includeEmpty: true}, (cell) => {
            if (isFormulaCellValue(cell.value)) {
                formulaCellCount++;
            }
            cells.push(cellValueToPrimitive(cell.value));
        });
        grid.push(cells);
    });
    if (formulaCellCount > 0) {
        facts.push({
            kind: "formulaMaterialized",
            code: "parsheet-formula-cell",
            message: `Sheet "${sheetName}" has ${formulaCellCount} cell(s) containing a formula; its last computed result was imported as a plain value.`,
            details: {sheet: sheetName, count: formulaCellCount},
        });
        issues.push({
            code: "parsheet-formula-cell",
            severity: "warning",
            message:
                `Sheet "${sheetName}" has ${formulaCellCount} cell(s) containing a formula -- "pokie par import" ` +
                "never evaluates formulas; each cell's last computed result is imported as a plain value instead.",
            details: {sheet: sheetName, count: formulaCellCount},
        });
    }
    return grid;
}

function isFormulaCellValue(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
    return typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value);
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
    if (isFormulaCellValue(value)) {
        return cellValueToPrimitive(value.result ?? null);
    }
    if ("hyperlink" in value) {
        return value.text;
    }
    return undefined;
}

function rawSheetToGrid(worksheet: ExcelJS.Worksheet): readonly (readonly unknown[])[] {
    const grid: unknown[][] = [];
    worksheet.eachRow({includeEmpty: true}, (row) => {
        const cells: unknown[] = [];
        row.eachCell({includeEmpty: true}, (cell) => {
            const value = cell.value;
            // ExcelJS values are plain data, but clone them so callers cannot
            // observe a later workbook mutation through this import result.
            cells.push(value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value);
        });
        grid.push(cells);
    });
    return grid;
}

import ExcelJS from "exceljs";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {AvailableBetsSheetMapper} from "./mapping/AvailableBetsSheetMapper.js";
import type {AvailableBetsSheetMapping} from "./mapping/AvailableBetsSheetMapping.js";
import {ManifestSheetMapper} from "./mapping/ManifestSheetMapper.js";
import type {ManifestSheetMapping} from "./mapping/ManifestSheetMapping.js";
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
import type {ParSheetExporting} from "./ParSheetExporting.js";
import type {SheetGrid} from "./SheetGrid.js";

export class ParSheetExporter implements ParSheetExporting {
    private readonly pokieVersion: string;
    private readonly manifestMapper: ManifestSheetMapping;
    private readonly symbolsMapper: SymbolsSheetMapping;
    private readonly reelStripsMapper: ReelStripsSheetMapping;
    private readonly paytableMapper: PaytableSheetMapping;
    private readonly paylinesMapper: PaylinesSheetMapping;
    private readonly availableBetsMapper: AvailableBetsSheetMapping;
    private readonly provenanceMapper: ProvenanceSheetMapping;
    private readonly now: () => Date;
    private readonly writeWorkbook: (workbook: ExcelJS.Workbook, filePath: string) => Promise<void>;

    constructor(
        pokieVersion: string,
        manifestMapper: ManifestSheetMapping = new ManifestSheetMapper(),
        symbolsMapper: SymbolsSheetMapping = new SymbolsSheetMapper(),
        reelStripsMapper: ReelStripsSheetMapping = new ReelStripsSheetMapper(),
        paytableMapper: PaytableSheetMapping = new PaytableSheetMapper(),
        paylinesMapper: PaylinesSheetMapping = new PaylinesSheetMapper(),
        availableBetsMapper: AvailableBetsSheetMapping = new AvailableBetsSheetMapper(),
        provenanceMapper: ProvenanceSheetMapping = new ProvenanceSheetMapper(),
        now: () => Date = () => new Date(),
        writeWorkbook: (workbook: ExcelJS.Workbook, filePath: string) => Promise<void> = (workbook, filePath) => workbook.xlsx.writeFile(filePath),
    ) {
        this.pokieVersion = pokieVersion;
        this.manifestMapper = manifestMapper;
        this.symbolsMapper = symbolsMapper;
        this.reelStripsMapper = reelStripsMapper;
        this.paytableMapper = paytableMapper;
        this.paylinesMapper = paylinesMapper;
        this.availableBetsMapper = availableBetsMapper;
        this.provenanceMapper = provenanceMapper;
        this.now = now;
        this.writeWorkbook = writeWorkbook;
    }

    // Preflights the *entire* export before touching the filesystem at all: if the blueprint fails
    // any check below, this returns without ever constructing a workbook or calling writeWorkbook —
    // no file is created, and an existing file at `filePath` is left completely untouched. There is
    // no "partial" export; either every sheet gets written, or none do.
    public async exportToFile(blueprint: GameBlueprint, filePath: string, sourcePath?: string): Promise<ValidationIssue[]> {
        const issues = this.preflight(blueprint);
        if (issues.some((issue) => issue.severity === "error")) {
            return issues;
        }

        const workbook = new ExcelJS.Workbook();
        addSheet(workbook, this.manifestMapper.sheetName, this.manifestMapper.toRows(blueprint.manifest, blueprint.reels, blueprint.rows));
        addSheet(
            workbook,
            this.symbolsMapper.sheetName,
            this.symbolsMapper.toRows({symbols: blueprint.symbols, wilds: blueprint.wilds ?? [], scatters: blueprint.scatters ?? []}),
        );
        addSheet(workbook, this.paytableMapper.sheetName, this.paytableMapper.toRows(blueprint.paytable));
        // The preflight above guarantees reelStrips is defined whenever we get here.
        addSheet(workbook, this.reelStripsMapper.sheetName, this.reelStripsMapper.toRows(blueprint.reelStrips as string[][]));
        if (blueprint.paylines) {
            addSheet(workbook, this.paylinesMapper.sheetName, this.paylinesMapper.toRows(blueprint.paylines));
        }
        if (blueprint.availableBets) {
            addSheet(workbook, this.availableBetsMapper.sheetName, this.availableBetsMapper.toRows(blueprint.availableBets));
        }
        addSheet(workbook, this.provenanceMapper.sheetName, this.provenanceMapper.toRows(blueprint, this.pokieVersion, this.now(), sourcePath));

        await this.writeWorkbook(workbook, filePath);
        return issues;
    }

    private preflight(blueprint: GameBlueprint): ValidationIssue[] {
        // "pokie par export" only ever represents literal reelStrips (see docs/cli.md) — never
        // reelStripGeneration/symbolWeights. This is checked *before* looking at reelStrips at all:
        // a blueprint that has both a literal reelStrips (e.g. left over from a previous materialize
        // step) and reelStripGeneration/symbolWeights would otherwise export "successfully" while
        // silently dropping the generation/weighting data — exactly the lossy export this guards
        // against, regardless of what reelStrips happens to contain.
        const unsupportedFields: string[] = [];
        if (blueprint.reelStripGeneration !== undefined) {
            unsupportedFields.push('"reelStripGeneration"');
        }
        if (blueprint.symbolWeights !== undefined) {
            unsupportedFields.push('"symbolWeights"');
        }
        if (unsupportedFields.length > 0) {
            const alsoHasReelStrips = blueprint.reelStrips !== undefined;
            return [
                {
                    code: "parsheet-unsupported-reel-source",
                    severity: "error",
                    message:
                        `The blueprint uses ${unsupportedFields.join(" and ")}, which "pokie par export" cannot represent` +
                        (alsoHasReelStrips
                            ? ' — even though "reelStrips" is also present, exporting only that would silently drop the generation/weighting data'
                            : "") +
                        ".",
                    details: {
                        reelStripGeneration: blueprint.reelStripGeneration !== undefined,
                        symbolWeights: blueprint.symbolWeights !== undefined,
                        reelStrips: alsoHasReelStrips,
                    },
                    suggestion:
                        'Materialize the blueprint into a literal "reelStrips" array first (e.g. via resolveReelStripGeneration + ' +
                        'materializeReelStrips, or by hand), then export that.',
                },
            ];
        }

        if (!blueprint.reelStrips) {
            return [
                {
                    code: "parsheet-missing-reel-strips",
                    severity: "error",
                    message: 'The blueprint has no literal "reelStrips" to export.',
                    suggestion: 'Add a literal "reelStrips" array to the blueprint first.',
                },
            ];
        }

        return [];
    }
}

function addSheet(workbook: ExcelJS.Workbook, sheetName: string, grid: SheetGrid): void {
    const worksheet = workbook.addWorksheet(sheetName);
    grid.forEach((row) => {
        worksheet.addRow(row);
    });
}

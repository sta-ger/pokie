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

    public async exportToFile(blueprint: GameBlueprint, filePath: string, sourcePath?: string): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        const workbook = new ExcelJS.Workbook();

        addSheet(workbook, this.manifestMapper.sheetName, this.manifestMapper.toRows(blueprint.manifest, blueprint.reels, blueprint.rows));
        addSheet(
            workbook,
            this.symbolsMapper.sheetName,
            this.symbolsMapper.toRows({symbols: blueprint.symbols, wilds: blueprint.wilds ?? [], scatters: blueprint.scatters ?? []}),
        );
        addSheet(workbook, this.paytableMapper.sheetName, this.paytableMapper.toRows(blueprint.paytable));

        // "pokie par export" only supports literal reelStrips (see docs/cli.md) — a blueprint built
        // around reelStripGeneration/symbolWeights instead has no literal strips to write. The rest of
        // the workbook is still written; only the "ReelStrips" sheet is skipped.
        if (blueprint.reelStrips) {
            addSheet(workbook, this.reelStripsMapper.sheetName, this.reelStripsMapper.toRows(blueprint.reelStrips));
        } else {
            issues.push({
                code: "parsheet-missing-reel-strips",
                severity: "error",
                message:
                    'The blueprint has no literal "reelStrips" to export' +
                    (blueprint.reelStripGeneration || blueprint.symbolWeights
                        ? " (\"reelStripGeneration\"/\"symbolWeights\" are not supported by \"pokie par export\")"
                        : "") +
                    '; the "ReelStrips" sheet is omitted.',
                suggestion: 'Run "pokie build --dry-run" or otherwise materialize the blueprint\'s reel strips into "reelStrips" first.',
            });
        }

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
}

function addSheet(workbook: ExcelJS.Workbook, sheetName: string, grid: SheetGrid): void {
    const worksheet = workbook.addWorksheet(sheetName);
    grid.forEach((row) => {
        worksheet.addRow(row);
    });
}

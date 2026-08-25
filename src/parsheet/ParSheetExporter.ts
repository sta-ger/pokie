import ExcelJS from "exceljs";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {GameBlueprintValidating} from "../generated/GameBlueprintValidating.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {convertSharedWeightsToReelStrips} from "../project/buildGameModelReels.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {AvailableBetsSheetMapper} from "./mapping/AvailableBetsSheetMapper.js";
import type {AvailableBetsSheetMapping} from "./mapping/AvailableBetsSheetMapping.js";
import {BetModesSheetMapper} from "./mapping/BetModesSheetMapper.js";
import type {BetModesSheetMapping} from "./mapping/BetModesSheetMapping.js";
import {ManifestSheetMapper} from "./mapping/ManifestSheetMapper.js";
import type {ManifestSheetMapping} from "./mapping/ManifestSheetMapping.js";
import {MechanicsSheetMapper} from "./mapping/MechanicsSheetMapper.js";
import type {MechanicsSheetMapping} from "./mapping/MechanicsSheetMapping.js";
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
import type {ParSheetExportOptions, ParSheetExporting} from "./ParSheetExporting.js";
import type {SheetGrid} from "./SheetGrid.js";
import {writeFileAtomically} from "./writeFileAtomically.js";

export type ParSheetBlueprintPreparation =
    | {readonly blueprint: GameBlueprint; readonly issues: ValidationIssue[]}
    | {readonly blueprint: undefined; readonly issues: ValidationIssue[]};

// PAR workbooks store literal reel strips. A canonical Blueprint may instead author its reels as
// generated specs, shared weights, or the engine defaults; export freezes that valid source into a
// deterministic literal snapshot without changing the authored Blueprint. This is deliberately a
// shared preflight so direct exporter, registry and CLI callers cannot disagree about what is exportable.
export function prepareBlueprintForParSheetExport(
    blueprint: unknown,
    validator: GameBlueprintValidating = new GameBlueprintValidator(),
): ParSheetBlueprintPreparation {
    const validationIssues = validator.validate(blueprint);
    const unseededGenerationIssues = findUnseededGenerationIssues(blueprint);
    if (validationIssues.some((issue) => issue.severity === "error") || unseededGenerationIssues.length > 0) {
        return {blueprint: undefined, issues: [...validationIssues, ...unseededGenerationIssues]};
    }

    const authored = blueprint as GameBlueprint;
    if (authored.reelStripGeneration !== undefined) {
        const resolution = resolveReelStripGeneration(authored);
        if (!resolution.success) {
            const failures = resolution.reels.filter((reel) => !reel.success);
            return {
                blueprint: undefined,
                issues: [
                    ...validationIssues,
                    {
                        code: "parsheet-reel-generation-failed",
                        severity: "error",
                        message: `Cannot export "reelStripGeneration": ${failures
                            .map((reel) => `reelStripGeneration[${reel.reelIndex}] could not satisfy its constraints`)
                            .join("; ")}.`,
                        suggestion: "Adjust the named reelStripGeneration entry so it can generate a strip, then export again.",
                    },
                ],
            };
        }
        return {blueprint: removeSharedWeights(materializeReelStrips(authored, resolution.reelStripGeneration)), issues: validationIssues};
    }

    if (authored.reelStrips !== undefined) return {blueprint: removeSharedWeights({...authored}), issues: validationIssues};

    // `symbolWeights` and the omitted engine-default weighting both describe playable canonical
    // Blueprints but have no physical strip. Freeze the same deterministic sample Studio presents.
    return {
        blueprint: removeSharedWeights({...authored, reelStrips: convertSharedWeightsToReelStrips(authored)}),
        issues: validationIssues,
    };
}

// The Blueprint validator also requires a generated reel's seed. Keep this PAR-specific check in
// the shared preflight as well: a workbook is a literal snapshot, so every public PAR boundary can
// explain the snapshot requirement in its own terms rather than relying on a later generator call.
function findUnseededGenerationIssues(blueprint: unknown): ValidationIssue[] {
    if (typeof blueprint !== "object" || blueprint === null || !Array.isArray((blueprint as {reelStripGeneration?: unknown}).reelStripGeneration)) {
        return [];
    }

    return (blueprint as {reelStripGeneration: unknown[]}).reelStripGeneration.flatMap((entry, index) => {
        if (
            typeof entry !== "object" ||
            entry === null ||
            (entry as {type?: unknown}).type !== "generated" ||
            (entry as {seed?: unknown}).seed !== undefined
        ) {
            return [];
        }
        return [{
            code: "parsheet-reel-generation-seed-required",
            severity: "error" as const,
            message: `Cannot export "reelStripGeneration[${index}].seed": generated PAR workbook snapshots require an authored integer seed.`,
            suggestion: `Add an integer "seed" to "reelStripGeneration[${index}]" and export again.`,
        }];
    });
}

function removeSharedWeights(blueprint: GameBlueprint): GameBlueprint {
    if (blueprint.symbolWeights === undefined) return blueprint;
    const snapshot = {...blueprint};
    Reflect.deleteProperty(snapshot, "symbolWeights");
    return snapshot;
}

export class ParSheetExporter implements ParSheetExporting {
    private readonly pokieVersion: string;
    private readonly manifestMapper: ManifestSheetMapping;
    private readonly symbolsMapper: SymbolsSheetMapping;
    private readonly reelStripsMapper: ReelStripsSheetMapping;
    private readonly paytableMapper: PaytableSheetMapping;
    private readonly paylinesMapper: PaylinesSheetMapping;
    private readonly availableBetsMapper: AvailableBetsSheetMapping;
    private readonly provenanceMapper: ProvenanceSheetMapping;
    private readonly validator: GameBlueprintValidating;
    private readonly now: () => Date;
    private readonly writeWorkbook: (workbook: ExcelJS.Workbook, filePath: string) => Promise<void>;
    private readonly winModelMapper: WinModelSheetMapping;
    private readonly mechanicsMapper: MechanicsSheetMapping;
    private readonly betModesMapper: BetModesSheetMapping;

    constructor(
        pokieVersion: string,
        manifestMapper: ManifestSheetMapping = new ManifestSheetMapper(),
        symbolsMapper: SymbolsSheetMapping = new SymbolsSheetMapper(),
        reelStripsMapper: ReelStripsSheetMapping = new ReelStripsSheetMapper(),
        paytableMapper: PaytableSheetMapping = new PaytableSheetMapper(),
        paylinesMapper: PaylinesSheetMapping = new PaylinesSheetMapper(),
        availableBetsMapper: AvailableBetsSheetMapping = new AvailableBetsSheetMapper(),
        provenanceMapper: ProvenanceSheetMapping = new ProvenanceSheetMapper(),
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        now: () => Date = () => new Date(),
        writeWorkbook: (workbook: ExcelJS.Workbook, filePath: string) => Promise<void> = defaultWriteWorkbook,
        // Appended after every pre-existing param (rather than grouped with the other sheet mappers
        // above) so that no existing positional caller of this constructor is broken by their arrival --
        // see the class-level API-evolution rule this codebase follows for public constructors.
        winModelMapper: WinModelSheetMapping = new WinModelSheetMapper(),
        mechanicsMapper: MechanicsSheetMapping = new MechanicsSheetMapper(),
        betModesMapper: BetModesSheetMapping = new BetModesSheetMapper(),
    ) {
        this.pokieVersion = pokieVersion;
        this.manifestMapper = manifestMapper;
        this.symbolsMapper = symbolsMapper;
        this.reelStripsMapper = reelStripsMapper;
        this.paytableMapper = paytableMapper;
        this.paylinesMapper = paylinesMapper;
        this.availableBetsMapper = availableBetsMapper;
        this.provenanceMapper = provenanceMapper;
        this.validator = validator;
        this.now = now;
        this.writeWorkbook = writeWorkbook;
        this.winModelMapper = winModelMapper;
        this.mechanicsMapper = mechanicsMapper;
        this.betModesMapper = betModesMapper;
    }

    // Runs full validation itself — the caller (CLI or any other library consumer) never needs to
    // validate first. Preflights the *entire* export before touching the filesystem at all: if the
    // blueprint fails any check below, this returns without ever constructing a workbook or calling
    // writeWorkbook — no file is created, and an existing file at `filePath` is left completely
    // untouched (writeWorkbook's own default implementation is itself atomic — see
    // writeFileAtomically.ts — so even a write/rename failure past this point can't leave a partial
    // file behind either). There is no "partial" export; either every sheet gets written, or none do.
    public async exportToFile(blueprint: unknown, filePath: string, sourcePath?: string, options?: ParSheetExportOptions): Promise<ValidationIssue[]> {
        assertNotCancelled(options);
        // Mirrors BuildCommand: a blueprint GameBlueprintValidator rejects is never treated as a
        // well-shaped GameBlueprint at all, since fields the mappers below assume exist (symbols,
        // paytable, ...) might not.
        const prepared = prepareBlueprintForParSheetExport(blueprint, this.validator);
        const issues = prepared.issues;
        if (prepared.blueprint === undefined) return issues;
        const typedBlueprint = prepared.blueprint;

        const workbook = new ExcelJS.Workbook();
        addSheet(
            workbook,
            this.manifestMapper.sheetName,
            this.manifestMapper.toRows(typedBlueprint.manifest, typedBlueprint.reels, typedBlueprint.rows),
        );
        addSheet(
            workbook,
            this.symbolsMapper.sheetName,
            this.symbolsMapper.toRows({symbols: typedBlueprint.symbols, wilds: typedBlueprint.wilds ?? [], scatters: typedBlueprint.scatters ?? []}),
        );
        addSheet(workbook, this.paytableMapper.sheetName, this.paytableMapper.toRows(typedBlueprint.paytable));
        // checkReelSource above guarantees reelStrips is defined whenever we get here.
        addSheet(workbook, this.reelStripsMapper.sheetName, this.reelStripsMapper.toRows(typedBlueprint.reelStrips as string[][]));
        if (typedBlueprint.paylines) {
            addSheet(workbook, this.paylinesMapper.sheetName, this.paylinesMapper.toRows(typedBlueprint.paylines));
        }
        if (typedBlueprint.availableBets) {
            addSheet(workbook, this.availableBetsMapper.sheetName, this.availableBetsMapper.toRows(typedBlueprint.availableBets));
        }
        if (typedBlueprint.winModel) {
            addSheet(workbook, this.winModelMapper.sheetName, this.winModelMapper.toRows(typedBlueprint.winModel));
        }
        if (typedBlueprint.mechanics?.freeGames) {
            addSheet(workbook, this.mechanicsMapper.sheetName, this.mechanicsMapper.toRows(typedBlueprint.mechanics.freeGames));
        }
        if (typedBlueprint.betModes) {
            addSheet(workbook, this.betModesMapper.sheetName, this.betModesMapper.toRows(typedBlueprint.betModes));
        }
        addSheet(
            workbook,
            this.provenanceMapper.sheetName,
            this.provenanceMapper.toRows(typedBlueprint, this.pokieVersion, this.now(), sourcePath),
        );

        options?.onProgress?.({message: "Serializing PAR workbook"});
        assertNotCancelled(options);
        if (this.writeWorkbook === defaultWriteWorkbook) {
            await writeFileAtomically(filePath, (tempPath) => workbook.xlsx.writeFile(tempPath), () => {
                options?.onProgress?.({message: "Committing PAR workbook"});
                assertNotCancelled(options);
            });
        } else {
            await this.writeWorkbook(workbook, filePath);
            options?.onProgress?.({message: "Committing PAR workbook"});
            assertNotCancelled(options);
        }
        return issues;
    }

}

const defaultWriteWorkbook = (workbook: ExcelJS.Workbook, filePath: string): Promise<void> =>
    writeFileAtomically(filePath, (tempPath) => workbook.xlsx.writeFile(tempPath));

function assertNotCancelled(options: ParSheetExportOptions | undefined): void {
    if (options?.signal?.aborted) throw new Error("PAR workbook export was cancelled.");
}

function addSheet(workbook: ExcelJS.Workbook, sheetName: string, grid: SheetGrid): void {
    const worksheet = workbook.addWorksheet(sheetName);
    grid.forEach((row) => {
        worksheet.addRow(row);
    });
}

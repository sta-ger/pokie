import fs from "fs";
import path from "path";
import {
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    loadGameBlueprint,
    ParSheetExporter,
    ParSheetExporting,
    ParSheetImporter,
    ParSheetImporting,
    ValidationIssue,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

const USAGE =
    "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]\n" +
    "   or: pokie par export <config.json> [--out <output.xlsx>]";
const IMPORT_USAGE = "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]";
const EXPORT_USAGE = "Usage: pokie par export <config.json> [--out <output.xlsx>]";

type ImportFormat = "summary" | "json";
type ImportOptions = {inputPath: string; outPath: string; format: ImportFormat};
type ExportOptions = {blueprintPath: string; outPath: string};

// One CLI verb ("pokie par <import|export>") rather than two top-level commands, matching how PAR
// sheet import/export is really one round-trip feature with a shared vocabulary (see
// src/parsheet/ParSheetImporting.ts / ParSheetExporting.ts) — unlike every other CliCommandHandling
// in cli/commands, this one owns its own subcommand dispatch instead of a flat option list.
export class ParCommand implements CliCommandHandling {
    private readonly importer: ParSheetImporting;
    private readonly exporter: ParSheetExporting;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly writeFile: (filePath: string, contents: string) => void;

    constructor(
        pokieVersion: string,
        importer: ParSheetImporting = new ParSheetImporter(),
        exporter: ParSheetExporting = new ParSheetExporter(pokieVersion),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
    ) {
        this.importer = importer;
        this.exporter = exporter;
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.writeFile = writeFile;
    }

    public getName(): string {
        return "par";
    }

    public getDescription(): string {
        return 'Import/export a GameBlueprint to/from a PAR sheet XLSX workbook ("pokie par import <input.xlsx>" / "pokie par export <config.json>").';
    }

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        switch (subcommand) {
            case "import":
                return this.runImport(rest);
            case "export":
                return this.runExport(rest);
            default:
                // Promise.reject rather than a plain throw so an unknown/missing subcommand behaves
                // the same as every other command's usage errors — a rejected promise, not a
                // synchronous throw (see e.g. BuildCommand.run()'s own try/Promise.reject).
                return Promise.reject(new Error(USAGE));
        }
    }

    private async runImport(args: string[]): Promise<number> {
        const options = this.parseImportArgs(args);
        const result = await this.importer.importFromFile(options.inputPath);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (options.format === "json") {
            console.log(JSON.stringify({blueprint: result.blueprint, issues: result.issues}, null, 4));
        } else {
            this.printImportSummary(options.inputPath, result.blueprint, errors, warnings);
        }

        if (errors.length > 0) {
            return 1;
        }

        this.writeFile(options.outPath, `${JSON.stringify(result.blueprint, null, 4)}\n`);
        if (options.format !== "json") {
            console.log(`\nWrote blueprint to "${options.outPath}".`);
        }
        return 0;
    }

    private async runExport(args: string[]): Promise<number> {
        const options = this.parseExportArgs(args);
        const blueprint = this.loadBlueprint(options.blueprintPath);

        // Mirrors BuildCommand: a blueprint the validator already rejects is never handed to the
        // exporter at all, since fields the exporter/mappers assume exist (symbols, paytable, ...)
        // might not, unlike the "valid blueprint, just no literal reelStrips" case exportToFile
        // itself reports as its own diagnostic (see ParSheetExporter).
        const validationIssues = this.validator.validate(blueprint);
        const validationErrors = validationIssues.filter((issue) => issue.severity === "error");
        if (validationErrors.length > 0) {
            console.error(`Blueprint "${options.blueprintPath}" has ${validationErrors.length} error(s):`);
            for (const issue of validationErrors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            return 1;
        }

        const exportIssues = await this.exporter.exportToFile(blueprint as GameBlueprint, options.outPath, options.blueprintPath);
        const issues = [...validationIssues, ...exportIssues];
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");

        console.log(`Exported "${options.blueprintPath}" to "${options.outPath}".`);
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }
        if (errors.length > 0) {
            console.error(`\n${errors.length} error(s):`);
            for (const issue of errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            return 1;
        }

        return 0;
    }

    private printImportSummary(inputPath: string, blueprint: GameBlueprint, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
        console.log(`Imported "${inputPath}"`);
        console.log(`  game             ${blueprint.manifest.name} (id: "${blueprint.manifest.id}", v${blueprint.manifest.version})`);
        console.log(`  reels x rows     ${blueprint.reels} x ${blueprint.rows}`);
        console.log(`  symbols          ${blueprint.symbols.length}`);

        if (warnings.length > 0) {
            console.log(`\nWarnings (${warnings.length}):`);
            for (const issue of warnings) {
                console.log(`  - ${issue.code}: ${issue.message}`);
            }
        }
        if (errors.length > 0) {
            console.log(`\nErrors (${errors.length}):`);
            for (const issue of errors) {
                console.log(`  - ${issue.code}: ${issue.message}`);
            }
        }
    }

    private parseImportArgs(args: string[]): ImportOptions {
        const [inputPath, ...rest] = args;
        if (!inputPath) {
            throw new Error(IMPORT_USAGE);
        }

        let outPath = defaultBlueprintPath(inputPath);
        let format: ImportFormat = "summary";
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${IMPORT_USAGE}`);
                    }
                    outPath = value;
                    i++;
                    break;
                }
                case "--format": {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${IMPORT_USAGE}`);
                    }
                    format = "json";
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${IMPORT_USAGE}`);
            }
        }

        return {inputPath, outPath, format};
    }

    private parseExportArgs(args: string[]): ExportOptions {
        const [blueprintPath, ...rest] = args;
        if (!blueprintPath) {
            throw new Error(EXPORT_USAGE);
        }

        let outPath = defaultParSheetPath(blueprintPath);
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${EXPORT_USAGE}`);
                    }
                    outPath = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${EXPORT_USAGE}`);
            }
        }

        return {blueprintPath, outPath};
    }
}

function defaultBlueprintPath(inputPath: string): string {
    const base = path.basename(inputPath, path.extname(inputPath));
    return path.join(path.dirname(inputPath), `${base}.blueprint.json`);
}

function defaultParSheetPath(blueprintPath: string): string {
    const base = path.basename(blueprintPath).replace(/\.blueprint\.json$/i, "").replace(/\.json$/i, "");
    return path.join(path.dirname(blueprintPath), `${base}.par.xlsx`);
}

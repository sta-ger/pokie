import fs from "fs";
import path from "path";
import {
    describeUnsupportedProjectOperation,
    GameBlueprint,
    loadGameBlueprint,
    PAR_IMPORT_OPERATION,
    ParSheetExporter,
    ParSheetExporting,
    ParSheetImporter,
    ParSheetImporting,
    ProjectResolving,
    ProjectTargetResolver,
    ValidationIssue,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {CommanderErrorMessages, createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE =
    "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]\n" +
    "   or: pokie par export <config.json> [--out <output.xlsx>]";
const IMPORT_USAGE = "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]";
const EXPORT_USAGE = "Usage: pokie par export <config.json> [--out <output.xlsx>]";

type ImportFormat = "summary" | "json";

// One CLI verb ("pokie par <import|export>") rather than two top-level commands, matching how PAR
// sheet import/export is really one round-trip feature with a shared vocabulary (see
// src/parsheet/ParSheetImporting.ts / ParSheetExporting.ts) — unlike every other CliCommandHandling
// in cli/commands, this one owns its own subcommand dispatch instead of a flat option list.
export class ParCommand implements CliCommandHandling {
    private readonly importer: ParSheetImporting;
    private readonly exporter: ParSheetExporting;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly resolveProject: ProjectResolving;

    constructor(
        pokieVersion: string,
        importer: ParSheetImporting = new ParSheetImporter(),
        exporter: ParSheetExporting = new ParSheetExporter(pokieVersion),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        // Appended after every pre-existing param, same "never break an existing positional caller"
        // convention BuildCommand's own resolveProject param follows -- see executeImport()'s own doc
        // comment for what this adds on top of the importer itself.
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
    ) {
        this.importer = importer;
        this.exporter = exporter;
        this.loadBlueprint = loadBlueprint;
        this.writeFile = writeFile;
        this.resolveProject = resolveProject;
    }

    public getName(): string {
        return "par";
    }

    public getDescription(): string {
        return 'Import/export a GameBlueprint to/from a PAR sheet XLSX workbook ("pokie par import <input.xlsx>" / "pokie par export <config.json>").';
    }

    // Two ordinary-word verbs ("import"/"export") sharing one parent Commander instance — real nested
    // subcommands (see cli/commands/internal/CommanderCliAdapter.ts), so Commander itself both
    // dispatches by exact verb name and validates each verb's own args/options. The messages passed
    // to translateCommanderError are picked per-verb (from args[0], read before parsing) since a
    // structural error caught at the shared parent.parseAsync() call doesn't otherwise say which
    // subcommand it came from; an empty/unrecognized verb falls back to the plain USAGE the original
    // hand-rolled switch's own `default` case threw.
    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rather than lean on
        // Commander's own incidental "commander.help" throw for this (still handled below via
        // noCommand, e.g. for "pokie par help"), reject it explicitly up front with the same plain
        // USAGE the original hand-rolled switch's own `default` case threw.
        if (args.length === 0) {
            return Promise.reject(new Error(USAGE));
        }

        let exitCode = 0;
        const parent = createCommanderCliCommand("par");

        parent
            .command("import")
            .argument("<input.xlsx>")
            .argument("[excess...]")
            .option("--out <blueprint.json>")
            .option("--format <value>", "only \"json\" is supported", (value: string): ImportFormat => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${IMPORT_USAGE}`);
                }
                return "json";
            }, "summary" as ImportFormat)
            .action(async (inputPath: string, excess: string[], options: {out?: string; format: ImportFormat}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${IMPORT_USAGE}`);
                }
                const outPath = options.out ?? defaultBlueprintPath(inputPath);
                exitCode = await this.executeImport(inputPath, outPath, options.format);
            });

        parent
            .command("export")
            .argument("<config.json>")
            .argument("[excess...]")
            .option("--out <output.xlsx>")
            .action(async (blueprintPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${EXPORT_USAGE}`);
                }
                const outPath = options.out ?? defaultParSheetPath(blueprintPath);
                exitCode = await this.executeExport(blueprintPath, outPath);
            });

        const verb = args[0];
        let verbMessages: CommanderErrorMessages = {};
        if (verb === "import") {
            verbMessages = {
                missingArgument: IMPORT_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${IMPORT_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--out") return `--out requires a file path. ${IMPORT_USAGE}`;
                    if (flag === "--format") return `--format only supports "json". ${IMPORT_USAGE}`;
                    return `Unknown option "${flag}". ${IMPORT_USAGE}`;
                },
            };
        } else if (verb === "export") {
            verbMessages = {
                missingArgument: EXPORT_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${EXPORT_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a file path. ${EXPORT_USAGE}` : `Unknown option "${flag}". ${EXPORT_USAGE}`),
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCode)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {...verbMessages, unknownCommand: USAGE, noCommand: USAGE});
            });
    }

    // Routes `inputPath` through the same ProjectTargetResolver every migrated CLI command already
    // crosses (see BuildCommand's own analogous check) before ever handing it to the real
    // ParSheetImporting -- but only ever rejects a *recognized*-but-wrong-type target (a tsPackage/
    // outcomeLibrary/stakeAdapter/blueprint/wasm path someone pointed "pokie par import" at by mistake)
    // with a capability diagnostic explaining exactly why import can't run against it. An unrecognized
    // path -- resolve() returns undefined, e.g. a missing file or an ordinary/corrupt .xlsx that isn't a
    // PAR sheet workbook at all -- falls straight through to the real importer exactly as it always has,
    // so its own "load-error"/"missing sheet" diagnostics are unaffected.
    private async checkImportTarget(inputPath: string): Promise<void> {
        const project = await this.resolveProject.resolve(inputPath);
        if (project === undefined || project.type === "parWorkbook") {
            return;
        }
        const diagnostic = describeUnsupportedProjectOperation(project, PAR_IMPORT_OPERATION);
        if (diagnostic !== undefined) {
            throw new UnsupportedProjectOperationError(diagnostic);
        }
    }

    private async executeImport(inputPath: string, outPath: string, format: ImportFormat): Promise<number> {
        await this.checkImportTarget(inputPath);
        const result = await this.importer.importFromFile(inputPath);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (format === "json") {
            console.log(JSON.stringify(result, null, 4));
        } else {
            this.printImportSummary(inputPath, result.blueprint, errors, warnings);
        }

        if (errors.length > 0) {
            return 1;
        }

        this.writeFile(outPath, `${JSON.stringify(result.blueprint, null, 4)}\n`);
        if (format !== "json") {
            console.log(`\nWrote blueprint to "${outPath}".`);
        }
        return 0;
    }

    private async executeExport(blueprintPath: string, outPath: string): Promise<number> {
        const blueprint = this.loadBlueprint(blueprintPath);

        // exporter.exportToFile validates the blueprint completely on its own (GameBlueprintValidator
        // plus its own reel-source/lossy-export checks) and never writes anything when it reports an
        // error — so on error, nothing was created/modified at outPath, and printing a success line
        // here would be a lie.
        const issues = await this.exporter.exportToFile(blueprint, outPath, blueprintPath);
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not export "${blueprintPath}" to "${outPath}" (${errors.length} error(s)):`);
            for (const issue of errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            return 1;
        }

        console.log(`Exported "${blueprintPath}" to "${outPath}".`);
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
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

}

function defaultBlueprintPath(inputPath: string): string {
    const base = path.basename(inputPath, path.extname(inputPath));
    return path.join(path.dirname(inputPath), `${base}.blueprint.json`);
}

function defaultParSheetPath(blueprintPath: string): string {
    const base = path.basename(blueprintPath).replace(/\.blueprint\.json$/i, "").replace(/\.json$/i, "");
    return path.join(path.dirname(blueprintPath), `${base}.par.xlsx`);
}

import {Command} from "commander";
import fs from "fs";
import path from "path";
import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanner,
    ArtifactImportOutputPlan,
    ArtifactDestinationCheck,
    describeUnsupportedProjectOperation,
    GameBlueprint,
    loadGameBlueprint,
    PAR_IMPORT_OPERATION,
    ParSheetExporter,
    ParSheetExporting,
    ParSheetImporter,
    ParSheetImporting,
    prepareBlueprintForParSheetExport,
    ProjectResolving,
    PokieProject,
    ProjectTargetResolver,
    PROJECT_TYPE_CAPABILITIES,
    ValidationIssue,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {CommanderErrorMessages, createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {BlueprintFileWriteResult, writeBlueprintFileAtomically} from "./internal/writeBlueprintFileAtomically.js";

const USAGE =
    "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]\n" +
    "   or: pokie par export <config.json> [--out <output.xlsx>]";
const IMPORT_USAGE = "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]";
const EXPORT_USAGE = "Usage: pokie par export <config.json> [--out <output.xlsx>]";

type ImportFormat = "summary" | "json";
type BlueprintFileWriting = (filePath: string, contents: string) => void | BlueprintFileWriteResult;
type ParSheetDestinationChecking = (sourcePath: string, destinationPath: string) => ArtifactDestinationCheck;

// One CLI verb ("pokie par <import|export>") rather than two top-level commands, matching how PAR
// sheet import/export is really one round-trip feature with a shared vocabulary (see
// src/parsheet/ParSheetImporting.ts / ParSheetExporting.ts) — unlike every other CliCommandHandling
// in cli/commands, this one owns its own subcommand dispatch instead of a flat option list.
export class ParCommand implements CliCommandHandling {
    private readonly importer: ParSheetImporting;
    private readonly exporter: ParSheetExporting;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly writeFile: BlueprintFileWriting;
    private readonly resolveProject: ProjectResolving;
    private readonly checkDestination: ParSheetDestinationChecking;
    private readonly planner = new ArtifactConversionPlanner();

    constructor(
        pokieVersion: string,
        importer: ParSheetImporting = new ParSheetImporter(),
        exporter: ParSheetExporting = new ParSheetExporter(pokieVersion),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        writeFile: BlueprintFileWriting = writeBlueprintFileAtomically,
        // Appended after every pre-existing param, same "never break an existing positional caller"
        // convention BuildCommand's own resolveProject param follows -- see executeImport()'s own doc
        // comment for what this adds on top of the importer itself.
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        // Direct PAR commands publish the same single-file artifact as `pokie build --target
        // parWorkbook`. Keep that build-owned safety policy in one place, while injecting the small
        // check for unit callers that do not use the filesystem.
        checkDestination: ParSheetDestinationChecking = (sourcePath, destinationPath) =>
            new ArtifactBuilderRegistry(pokieVersion).checkDestination("parWorkbook", destinationPath, sourcePath),
    ) {
        this.importer = importer;
        this.exporter = exporter;
        this.loadBlueprint = loadBlueprint;
        this.writeFile = writeFile;
        this.resolveProject = resolveProject;
        this.checkDestination = checkDestination;
    }

    public getName(): string {
        return "par";
    }

    public getDescription(): string {
        return 'Import/export a GameBlueprint to/from a PAR sheet XLSX workbook ("pokie par import <input.xlsx>" / "pokie par export <config.json>").';
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    // This is deliberately the same source preflight as executeExport, without either its
    // destination check or exporter call, for `pokie export --to workbook --dry-run`.
    public validateExportSource(blueprintPath: string): void {
        const blueprint = this.loadBlueprint(blueprintPath);
        const errors = prepareBlueprintForParSheetExport(blueprint).issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            throw new Error("The GameBlueprint source does not satisfy the PAR workbook export contract.");
        }
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

        const exitCodeRef = {value: 0};
        const parent = this.buildCommand(exitCodeRef);
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
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {...verbMessages, unknownCommand: USAGE, noCommand: USAGE});
            });
    }

    /** Executes the exact generic-import operation prepared by ImportCommand. */
    public runPreparedImport(
        source: PokieProject,
        plan: ArtifactImportOutputPlan,
        inputPath: string,
        outPath: string,
        format: ImportFormat = "summary",
    ): Promise<number> {
        this.planner.assertImportOutputPlanCurrent(plan, source, outPath);
        return this.executeImport(inputPath, outPath, format, {source, plan});
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by whichever verb's action actually runs;
    // run() supplies its own real box and reads it back once parsing resolves, while
    // getCommanderCommand() never parses this tree at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("par").description(this.getDescription());

        parent
            .command("import")
            .description("Import a PAR sheet XLSX workbook into a GameBlueprint JSON file.")
            .argument("<input.xlsx>", "an existing PAR sheet workbook")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <blueprint.json>", "output path (default: <input.xlsx> with a .blueprint.json extension)")
            .option("--format <value>", "only \"json\" is supported (default: a human-readable summary)", (value: string): ImportFormat => {
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
                exitCodeRef.value = await this.executeImport(inputPath, outPath, options.format);
            });

        parent
            .command("export")
            .description("Export a GameBlueprint JSON config to a PAR sheet XLSX workbook.")
            .argument("<config.json>", "an existing GameBlueprint JSON config")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <output.xlsx>", "output path (default: <config.json> with a .par.xlsx extension)")
            .action(async (blueprintPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${EXPORT_USAGE}`);
                }
                const outPath = options.out ?? defaultParSheetPath(blueprintPath);
                exitCodeRef.value = await this.executeExport(blueprintPath, outPath);
            });

        return parent;
    }

    private async executeImport(
        inputPath: string,
        outPath: string,
        format: ImportFormat,
        prepared?: {readonly source: PokieProject; readonly plan: ArtifactImportOutputPlan},
    ): Promise<number> {
        if (prepared === undefined) {
            // `par import` is a public import entry point in its own right.  Do
            // not let its legacy spelling take a separate read/write path from
            // `pokie import`: bind the reader and atomic writer to one prepared
            // exchange-import operation before either can run.
            const source = await this.prepareImportSource(inputPath);
            const plan = this.planner.planImportOutput(source, "blueprint", outPath);
            return this.executeImport(inputPath, outPath, format, {source, plan});
        }
        const execution = await this.planner.executeImportOutputPlan(prepared.plan, prepared.source, outPath, {
            read: () => this.importer.importFromFile(inputPath),
            canPublish: (result) => result.issues.every((issue) => issue.severity !== "error"),
            assertDestinationAvailable: () => this.assertDestinationIsAvailable(inputPath, outPath),
            // Return the allocated path, not merely the writer's diagnostic,
            // so the prepared import has an unambiguous rollback target if a
            // later lifecycle phase is cancelled or fails.
            publish: (result) => {
                this.writeFile(outPath, `${JSON.stringify(result.blueprint, null, 4)}\n`);
                return outPath;
            },
            rollback: (publishedPath) => fs.rmSync(publishedPath, {force: true}),
        });
        return this.reportAndPublishImport(inputPath, outPath, format, execution.read, execution.published, undefined);
    }

    private async prepareImportSource(inputPath: string): Promise<PokieProject> {
        const project = await this.resolveProject.resolve(inputPath);
        if (project === undefined) {
            // The importer remains the authority for workbook-format diagnostics.
            // Model that legacy exchange input explicitly, rather than allowing
            // an unplanned reader/writer fallback outside the planner lifecycle.
            return {
                type: "parWorkbook",
                rootPath: path.resolve(inputPath),
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "legacy PAR exchange input",
            };
        }
        if (project.type === "parWorkbook") return project;
        const diagnostic = describeUnsupportedProjectOperation(project, PAR_IMPORT_OPERATION);
        if (diagnostic !== undefined) throw new UnsupportedProjectOperationError(diagnostic);
        throw new Error(`"${inputPath}" is not a recognized PAR workbook.`);
    }

    /** Presents the terminal result only; prepared imports have already run their reader/publisher lifecycle. */
    private reportAndPublishImport(
        inputPath: string,
        outPath: string,
        format: ImportFormat,
        result: Awaited<ReturnType<ParSheetImporting["importFromFile"]>>,
        published?: boolean,
        writeResult?: void | BlueprintFileWriteResult,
    ): number {
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

        // Import diagnostics take precedence over output conflicts: a malformed workbook must still
        // explain what to repair, and it has not attempted any output write at this point. Once the
        // workbook is valid, enforce the exact source-alias/no-overwrite policy artifact builds use.
        if (published === undefined) {
            this.assertDestinationIsAvailable(inputPath, outPath);
            writeResult = this.writeFile(outPath, `${JSON.stringify(result.blueprint, null, 4)}\n`);
        }
        if (writeResult?.status === "conflict") {
            // writeBlueprintFileAtomically closes the small race after the preflight check. Re-read
            // the shared policy for the same actionable diagnostic a non-racing conflict receives.
            this.assertDestinationIsAvailable(inputPath, outPath);
            throw new Error(`"${outPath}" became occupied while importing; choose a different --out path and try again.`);
        }
        if (format !== "json") {
            console.log(`\nWrote blueprint to "${outPath}".`);
        }
        return 0;
    }

    private async executeExport(blueprintPath: string, outPath: string): Promise<number> {
        const blueprint = this.loadBlueprint(blueprintPath);

        // Keep shared PAR validation ahead of the destination precondition. This preserves the
        // actionable field-level diagnostic (and its no-write guarantee) for an invalid Blueprint,
        // even if a stale file happens to occupy --out. The exporter repeats this shared preflight
        // before writing, as it must for direct library callers too.
        const preflight = prepareBlueprintForParSheetExport(blueprint);
        const preflightErrors = preflight.issues.filter((issue) => issue.severity === "error");
        if (preflightErrors.length > 0) {
            this.printExportErrors(blueprintPath, outPath, preflightErrors);
            return 1;
        }

        this.assertDestinationIsAvailable(blueprintPath, outPath);
        const issues = await this.exporter.exportToFile(blueprint, outPath, blueprintPath);
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            this.printExportErrors(blueprintPath, outPath, errors);
            return 1;
        }

        console.log(`Exported "${blueprintPath}" to "${outPath}".`);
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
            if (issue.suggestion) {
                console.log(`    suggestion: ${issue.suggestion}`);
            }
        }

        return 0;
    }

    private assertDestinationIsAvailable(sourcePath: string, destinationPath: string): void {
        const destination = this.checkDestination(sourcePath, destinationPath);
        if (!destination.available) {
            throw new Error(destination.message);
        }
    }

    private printExportErrors(blueprintPath: string, outPath: string, errors: ValidationIssue[]): void {
        console.error(`Could not export "${blueprintPath}" to "${outPath}" (${errors.length} error(s)):`);
        for (const issue of errors) {
            console.error(`  - ${issue.code}: ${issue.message}`);
            if (issue.suggestion) {
                console.error(`    suggestion: ${issue.suggestion}`);
            }
        }
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
                if (issue.suggestion) {
                    console.log(`    suggestion: ${issue.suggestion}`);
                }
            }
        }
        if (errors.length > 0) {
            console.log(`\nErrors (${errors.length}):`);
            for (const issue of errors) {
                console.log(`  - ${issue.code}: ${issue.message}`);
                if (issue.suggestion) {
                    console.log(`    suggestion: ${issue.suggestion}`);
                }
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

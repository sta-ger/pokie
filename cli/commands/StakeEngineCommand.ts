import {Command} from "commander";
import fs from "fs";
import path from "path";
import {
    loadWeightedOutcomeLibraryFromBundle,
    StakeEngineBundleStreamingExporter,
    StakeEngineBundleStreamingExporting,
    StakeEngineExporter,
    StakeEngineExporting,
    StakeEngineExportModeInput,
    StakeEngineExportValidator,
    StakeEngineImporter,
    StakeEngineImporting,
    StakeEngineImportWriter,
    StakeEngineImportWriting,
    StakeEngineOutcomeSourceReader,
    StakeEngineOutcomeSourceReading,
    StakeEngineOutcomeSourceReadResult,
    StakeEngineStandaloneAnalysis,
    StakeEngineStandaloneAnalysisDiff,
    StakeEngineStandaloneAnalysisDiffer,
    StakeEngineStandaloneAnalysisDiffing,
    StakeEngineStandaloneAnalysisMetricDiff,
    StakeEngineStandaloneAnalyzer,
    StakeEngineStandaloneExactDecimal,
    ValidationIssue,
    WeightedOutcomeLibrary,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {CommanderErrorMessages, createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE =
    "Usage: pokie stakeengine export <config.json> [--out <dir>]\n" +
    "   or: pokie stakeengine import <stakeDir> [--out <dir>]\n" +
    "   or: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]\n" +
    "   or: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]";
const EXPORT_USAGE = "Usage: pokie stakeengine export <config.json> [--out <dir>]";
const IMPORT_USAGE = "Usage: pokie stakeengine import <stakeDir> [--out <dir>]";
const ANALYZE_USAGE = "Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]";
const DIFF_USAGE = "Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]";
const CONFIG_HINT =
    '<config.json> lists one WeightedOutcomeLibrary source per Stake mode, either a plain JSON file — ' +
    '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — or a canonical ' +
    'outcome-library bundle (see docs/outcome-library-bundle.md) — {"modeName": "base", "cost": 1, "bundleDir": ' +
    '"./bundle", "bundleModeName": "base"} ("bundleModeName" defaults to "modeName" when omitted); exactly one ' +
    "of \"libraryPath\"/\"bundleDir\" is required per mode — see docs/stake-engine-export.md for the format.";
const STAKE_DIR_HINT =
    '<stakeDir> must be a directory produced by "pokie stakeengine export" (index.json, per-mode lookup ' +
    "CSV/books, and its own pokie-manifest.json). Reconstruction does not accept a compatible foreign directory " +
    'without that manifest; use "pokie stakeengine analyze" (including its --out report) or "pokie stakeengine diff" ' +
    "instead — see docs/stake-engine-import.md for details.";
const ANALYZE_STAKE_DIR_HINT =
    "<stakeDir> is any Stake Engine outcome directory (index.json, per-mode lookup CSV, per-mode zstd-compressed " +
    'JSONL books) — POKIE\'s own export or a third party\'s, with or without a pokie-manifest.json — see ' +
    "docs/stake-engine-standalone.md for details.";
const DIFF_STAKE_DIR_HINT =
    "<leftStakeDir> and <rightStakeDir> are each any Stake Engine outcome directory (index.json, per-mode lookup " +
    'CSV, per-mode zstd-compressed JSONL books) — POKIE\'s own export or a third party\'s, with or without a ' +
    "pokie-manifest.json — see docs/stake-engine-standalone.md for details.";

// Exit codes for "pokie stakeengine diff", deliberately distinct from every other stakeengine subcommand's plain
// 0/1: modeled on the Unix diff(1) convention (0 identical, 1 differs, 2 trouble) so a caller can tell "the two
// directories genuinely differ" apart from "one of them couldn't even be read" without parsing stdout/stderr.
const DIFF_EXIT_NO_MATERIAL_DIFFERENCE = 0;
const DIFF_EXIT_MATERIAL_DIFFERENCE = 1;
const DIFF_EXIT_INVALID_INPUT = 2;

type ExportOptions = {configPath: string; outDir: string};
type ImportOptions = {stakeDir: string; outDir: string};
type AnalyzeFormat = "summary" | "json";
type AnalyzeOptions = {stakeDir: string; format: AnalyzeFormat; out?: string};
type AnalyzeReport = {stakeDir: string; issues: ValidationIssue[]; analysis: StakeEngineStandaloneAnalysis | undefined};
type DiffOptions = {leftStakeDir: string; rightStakeDir: string; format: AnalyzeFormat; out?: string};
type DiffReport = {
    stakeDir: {left: string; right: string};
    issues: {left: ValidationIssue[]; right: ValidationIssue[]};
    diff: StakeEngineStandaloneAnalysisDiff | undefined;
};

type ExportDescriptorModeEntry = {
    modeName: string;
    cost: number;
    libraryPath?: string;
    bundleDir?: string;
    bundleModeName?: string;
};
type ExportDescriptor = {modes: ExportDescriptorModeEntry[]};

function newOutputPathMessage(file: string, reason: string): string {
    return `Cannot write Stake Engine diff to "${file}" because ${reason}. Choose a new unused --out path and retry.`;
}

// Diff reports are derived artifacts, so publishing one must never replace a prior result that
// appeared after validation. A hard link provides create-only publication on the destination's
// filesystem: another process wins the race instead of having its bytes replaced.
function writeNewStakeEngineDiffFileAtomically(file: string, contents: string): void {
    const directory = path.dirname(file);
    let temporaryDirectory: string | undefined;
    try {
        temporaryDirectory = fs.mkdtempSync(path.join(directory, ".pokie-stakeengine-diff-"));
        const temporaryFile = path.join(temporaryDirectory, path.basename(file));
        fs.writeFileSync(temporaryFile, contents, "utf-8");
        fs.linkSync(temporaryFile, file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new Error(newOutputPathMessage(file, "that destination already exists"));
        }
        throw error;
    } finally {
        if (temporaryDirectory !== undefined) {
            fs.rmSync(temporaryDirectory, {recursive: true, force: true});
        }
    }
}

// Two CLI verbs ("pokie stakeengine export"/"pokie stakeengine import") sharing one command, the same way
// ParCommand owns both "par import"/"par export" — cli/pokie.ts dispatches by exact name match, so two separate
// classes could never both return getName() === "stakeengine".
export class StakeEngineCommand implements CliCommandHandling {
    private readonly exporter: StakeEngineExporting;
    private readonly importer: StakeEngineImporting;
    private readonly loadJson: (filePath: string) => unknown;
    private readonly importWriter: StakeEngineImportWriting;
    private readonly loadLibraryFromBundle: (bundleDir: string, modeName: string) => Promise<WeightedOutcomeLibrary>;
    private readonly bundleStreamingExporter: StakeEngineBundleStreamingExporting;
    private readonly outcomeSourceReader: StakeEngineOutcomeSourceReading;
    private readonly standaloneAnalyzer: StakeEngineStandaloneAnalyzer;
    private readonly standaloneAnalysisDiffer: StakeEngineStandaloneAnalysisDiffing;
    private readonly writeAnalyzeFile: (file: string, contents: string) => void;
    private readonly writeNewDiffFile: (file: string, contents: string) => void;

    constructor(
        pokieVersion: string,
        exporter: StakeEngineExporting = new StakeEngineExporter(pokieVersion),
        importer: StakeEngineImporting = new StakeEngineImporter(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        importWriter: StakeEngineImportWriting = new StakeEngineImportWriter(pokieVersion),
        loadLibraryFromBundle: (bundleDir: string, modeName: string) => Promise<WeightedOutcomeLibrary> = (bundleDir, modeName) =>
            loadWeightedOutcomeLibraryFromBundle(bundleDir, modeName),
        bundleStreamingExporter: StakeEngineBundleStreamingExporting = new StakeEngineBundleStreamingExporter(pokieVersion),
        outcomeSourceReader: StakeEngineOutcomeSourceReading = new StakeEngineOutcomeSourceReader(),
        standaloneAnalyzer: StakeEngineStandaloneAnalyzer = new StakeEngineStandaloneAnalyzer(),
        writeAnalyzeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        standaloneAnalysisDiffer: StakeEngineStandaloneAnalysisDiffing = new StakeEngineStandaloneAnalysisDiffer(),
        writeNewDiffFile: (file: string, contents: string) => void = writeNewStakeEngineDiffFileAtomically,
    ) {
        this.exporter = exporter;
        this.importer = importer;
        this.loadJson = loadJson;
        this.importWriter = importWriter;
        this.loadLibraryFromBundle = loadLibraryFromBundle;
        this.bundleStreamingExporter = bundleStreamingExporter;
        this.outcomeSourceReader = outcomeSourceReader;
        this.standaloneAnalyzer = standaloneAnalyzer;
        this.writeAnalyzeFile = writeAnalyzeFile;
        this.standaloneAnalysisDiffer = standaloneAnalysisDiffer;
        this.writeNewDiffFile = writeNewDiffFile;
    }

    public getName(): string {
        return "stakeengine";
    }

    public getDescription(): string {
        return (
            "Export WeightedOutcomeLibrary JSON files to the Stake Engine math-sdk static file format, reconstruct only " +
            "a POKIE-produced export with pokie-manifest.json back into libraries, " +
            "standalone-analyze an arbitrary Stake Engine outcome directory with no pokie-manifest.json required, or diff " +
            "two such directories/analyses. Compatible foreign directories without that manifest are for analyze/report " +
            "or diff, not reconstruction " +
            '("pokie stakeengine export <config.json>" / "pokie stakeengine import <stakeDir>" / ' +
            '"pokie stakeengine analyze <stakeDir>" / "pokie stakeengine diff <leftStakeDir> <rightStakeDir>").'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    // The target-oriented export alias must be able to prove an adapter source is usable without
    // constructing a staging directory. Resolve every configured library (including bundle-backed
    // modes) and apply the same request validator the concrete exporter applies before writing.
    public async validateExportSource(configPath: string): Promise<void> {
        const descriptor = this.loadDescriptor(configPath);
        const configDir = path.dirname(configPath);
        const modes = await Promise.all(
            descriptor.modes.map(async (entry): Promise<StakeEngineExportModeInput> => ({
                modeName: entry.modeName,
                cost: entry.cost,
                library:
                    entry.libraryPath !== undefined
                        ? (this.loadJsonChecked(path.resolve(configDir, entry.libraryPath), `mode "${entry.modeName}"'s outcome library`) as WeightedOutcomeLibrary)
                        : await this.loadLibraryFromBundle(path.resolve(configDir, entry.bundleDir as string), entry.bundleModeName ?? entry.modeName),
            })),
        );
        if (new StakeEngineExportValidator().validate(modes).some((issue) => issue.severity === "error")) {
            throw new Error("The Stake Engine source does not satisfy the export contract.");
        }
    }

    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rather than lean on
        // Commander's own incidental "commander.help" throw for this (still handled below via
        // noCommand, e.g. for "pokie stakeengine help"), reject it explicitly up front with the same
        // combined usage+hint text the original hand-rolled switch's own `default` case threw.
        if (args.length === 0) {
            return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }

        const exitCodeRef = {value: 0};
        const parent = this.buildCommand(exitCodeRef);
        const verb = args[0];
        let verbMessages: CommanderErrorMessages = {};
        if (verb === "export") {
            verbMessages = {
                missingArgument: `${EXPORT_USAGE}\n${CONFIG_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${EXPORT_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a directory path. ${EXPORT_USAGE}` : `Unknown option "${flag}". ${EXPORT_USAGE}`),
            };
        } else if (verb === "import") {
            verbMessages = {
                missingArgument: `${IMPORT_USAGE}\n${STAKE_DIR_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${IMPORT_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a directory path. ${IMPORT_USAGE}` : `Unknown option "${flag}". ${IMPORT_USAGE}`),
            };
        } else if (verb === "analyze") {
            verbMessages = {
                missingArgument: `${ANALYZE_USAGE}\n${ANALYZE_STAKE_DIR_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${ANALYZE_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--format") return `--format only supports "json". ${ANALYZE_USAGE}`;
                    if (flag === "--out") return `--out requires a file path. ${ANALYZE_USAGE}`;
                    return `Unknown option "${flag}". ${ANALYZE_USAGE}`;
                },
            };
        } else if (verb === "diff") {
            verbMessages = {
                missingArgument: `${DIFF_USAGE}\n${DIFF_STAKE_DIR_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${DIFF_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--format") return `--format only supports "json". ${DIFF_USAGE}`;
                    if (flag === "--out") return `--out requires a file path. ${DIFF_USAGE}`;
                    return `Unknown option "${flag}". ${DIFF_USAGE}`;
                },
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    ...verbMessages,
                    unknownCommand: `${USAGE}\n${CONFIG_HINT}`,
                    noCommand: `${USAGE}\n${CONFIG_HINT}`,
                });
            });
    }

    // Four ordinary-word verbs ("export"/"import"/"analyze"/"diff") sharing one parent Commander
    // instance — real nested subcommands (see cli/commands/internal/CommanderCliAdapter.ts), so
    // Commander itself both dispatches by exact verb name and validates each verb's own
    // args/options. The messages passed to translateCommanderError are picked per-verb (from
    // args[0], read before parsing) since a structural error caught at the shared
    // parent.parseAsync() call doesn't otherwise say which subcommand it came from; an
    // empty/unrecognized verb falls back to the combined USAGE+hint the original hand-rolled
    // switch's own `default` case threw.
    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by whichever verb's action actually runs;
    // run() supplies its own real box and reads it back once parsing resolves, while
    // getCommanderCommand() never parses this tree at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("stakeengine").description(this.getDescription());

        parent
            .command("export")
            .description("Export WeightedOutcomeLibrary JSON files to the Stake Engine math-sdk static file format.")
            .argument("<config.json>", CONFIG_HINT)
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <dir>", "output directory (default: a \"stakeengine\" sibling of <config.json>)")
            .action(async (configPath: string, excess: string[], options: {out?: string}) => {
                // An empty-string positional is present as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the
                // same as an entirely missing one (`!configPath`).
                if (!configPath || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${EXPORT_USAGE}` : `${EXPORT_USAGE}\n${CONFIG_HINT}`);
                }
                const outDir = options.out ?? path.join(path.dirname(configPath), "stakeengine");
                exitCodeRef.value = await this.runExport({configPath, outDir});
            });

        parent
            .command("import")
            .description(
                "Reconstruct WeightedOutcomeLibrary JSON files only from a POKIE-produced Stake Engine export with pokie-manifest.json; " +
                "use analyze/report or diff for compatible foreign directories.",
            )
            .argument("<stakeDir>", STAKE_DIR_HINT)
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <dir>", "output directory (default: <stakeDir> suffixed with \"-imported\")")
            .action(async (stakeDir: string, excess: string[], options: {out?: string}) => {
                if (!stakeDir || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${IMPORT_USAGE}` : `${IMPORT_USAGE}\n${STAKE_DIR_HINT}`);
                }
                const outDir = options.out ?? path.join(path.dirname(stakeDir), `${path.basename(stakeDir)}-imported`);
                exitCodeRef.value = await this.runImport({stakeDir, outDir});
            });

        parent
            .command("analyze")
            .description("Standalone-analyze an arbitrary Stake Engine outcome directory with no pokie-manifest.json required.")
            .argument("<stakeDir>", ANALYZE_STAKE_DIR_HINT)
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option(
                "--format <format>",
                'output format ("summary" or "json", default "summary")',
                (value: string) => {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${ANALYZE_USAGE}`);
                    }
                    return "json" as AnalyzeFormat;
                },
                "summary" as AnalyzeFormat,
            )
            .option("--out <file>", "write the analysis report JSON to this path")
            .action(async (stakeDir: string, excess: string[], options: {format: AnalyzeFormat; out?: string}) => {
                if (!stakeDir || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${ANALYZE_USAGE}` : `${ANALYZE_USAGE}\n${ANALYZE_STAKE_DIR_HINT}`);
                }
                exitCodeRef.value = await this.runAnalyze({stakeDir, format: options.format, out: options.out});
            });

        parent
            .command("diff")
            .description("Diff two Stake Engine outcome directories/analyses.")
            .argument("<leftStakeDir>", DIFF_STAKE_DIR_HINT)
            .argument("<rightStakeDir>", DIFF_STAKE_DIR_HINT)
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option(
                "--format <format>",
                'output format ("summary" or "json", default "summary")',
                (value: string) => {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${DIFF_USAGE}`);
                    }
                    return "json" as AnalyzeFormat;
                },
                "summary" as AnalyzeFormat,
            )
            .option("--out <file>", "write the diff report JSON to this path")
            .action(async (leftStakeDir: string, rightStakeDir: string, excess: string[], options: {format: AnalyzeFormat; out?: string}) => {
                // A single combined check, not one per side, matches the pre-Commander behavior:
                // either side missing (or an empty-string positional) produces the same message.
                if (!leftStakeDir || !rightStakeDir || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${DIFF_USAGE}` : `${DIFF_USAGE}\n${DIFF_STAKE_DIR_HINT}`);
                }
                exitCodeRef.value = await this.runDiff({leftStakeDir, rightStakeDir, format: options.format, out: options.out});
            });

        return parent;
    }

    private async runExport(options: ExportOptions): Promise<number> {
        const descriptor = this.loadDescriptor(options.configPath);
        const configDir = path.dirname(options.configPath);

        // When every mode in this run comes from a canonical outcome-library bundle, stream each one directly
        // from its bundle (see StakeEngineBundleStreamingExporter) — never materializing a WeightedOutcomeLibrary,
        // never calling readLibrary(). Mixing in even one "libraryPath" mode falls back to the existing,
        // already-stabilized path (StakeEngineExporter), which needs every mode's library fully in memory anyway
        // — a deliberate scope boundary, not an oversight: it keeps this CLI command from having to reconcile
        // two different per-mode construction mechanisms into one combined index.json/manifest.
        const allBundleSourced = descriptor.modes.every((entry) => entry.bundleDir !== undefined);

        const result = allBundleSourced
            ? await this.bundleStreamingExporter.exportToDirectory(
                descriptor.modes.map((entry) => ({
                    modeName: entry.modeName,
                    cost: entry.cost,
                    bundleDir: path.resolve(configDir, entry.bundleDir as string),
                    bundleModeName: entry.bundleModeName ?? entry.modeName,
                })),
                options.outDir,
            )
            : await this.exporter.exportToDirectory(
                await Promise.all(
                    descriptor.modes.map(async (entry): Promise<StakeEngineExportModeInput> => ({
                        modeName: entry.modeName,
                        cost: entry.cost,
                        library:
                            entry.libraryPath !== undefined
                                ? (this.loadJsonChecked(path.resolve(configDir, entry.libraryPath), `mode "${entry.modeName}"'s outcome library`) as WeightedOutcomeLibrary)
                                : await this.loadLibraryFromBundle(path.resolve(configDir, entry.bundleDir as string), entry.bundleModeName ?? entry.modeName),
                    })),
                ),
                options.outDir,
            );

        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not export "${options.configPath}" to "${options.outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Exported "${options.configPath}" to "${options.outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    // Writes exactly the shape "pokie stakeengine export" already reads back (see loadDescriptor/parseExportArgs
    // above) — libraries/<modeName>.json per mode, a config.json naming them, and (when available) a
    // source-provenance.json — so the import's own output can be fed straight back into
    // "pokie stakeengine export <outDir>/config.json" with no further editing. Written via StakeEngineImportWriter,
    // which publishes the whole --out directory atomically (temp-dir-then-swap, the same discipline
    // StakeEngineExporter uses) — a failure never leaves partial files, never alters an existing --out, and a
    // mode no longer present in this import never leaves its old library file behind.
    private async runImport(options: ImportOptions): Promise<number> {
        const result = await this.importer.importFromDirectory(options.stakeDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const infos = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not import "${options.stakeDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        const written = await this.importWriter.writeToDirectory(result, options.outDir);

        console.log(`Imported "${options.stakeDir}" to "${options.outDir}":`);
        console.log(`  wrote  manifest.json`);
        console.log(`  wrote  config.json`);
        for (const mode of result.modes) {
            console.log(`  wrote  index_${mode.modeName}.json`);
            console.log(`  wrote  outcomes_${mode.modeName}.jsonl`);
            console.log(`  wrote  libraries/${mode.modeName}.json`);
        }
        if (result.sourceProvenance !== undefined) {
            console.log(`  wrote  source-provenance.json`);
        }
        for (const issue of [...infos, ...written.issues]) {
            console.log(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    // Standalone counterpart to runImport: never requires a pokie-manifest.json, and never round-trips against a
    // known WeightedOutcomeLibrary source -- it reads+normalizes (StakeEngineOutcomeSourceReader), validates, and
    // computes exact weighted statistics (StakeEngineStandaloneAnalyzer) over whatever the directory actually
    // contains, printing/writing the same machine-readable JSON shape ValidateCommand/SimCommand already use
    // ("--format json"/"--out <file>").
    private async runAnalyze(options: AnalyzeOptions): Promise<number> {
        const readResult = await this.outcomeSourceReader.readFromDirectory(options.stakeDir);
        const errors = readResult.issues.filter((issue) => issue.severity === "error");
        const analysis = errors.length === 0 ? this.standaloneAnalyzer.analyze(readResult) : undefined;
        const report: AnalyzeReport = {stakeDir: options.stakeDir, issues: [...readResult.issues], analysis};

        if (options.out) {
            this.writeAnalyzeFile(options.out, JSON.stringify(report, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printAnalyzeSummary(report);
            if (options.out) {
                console.log(`\nReport written to "${options.out}".`);
            }
        }

        return errors.length === 0 ? 0 : 1;
    }

    // Standalone counterpart to DiffCommand's "pokie diff", for a pair of Stake Engine outcome directories rather
    // than a pair of pokie sim reports: reads+analyzes each side (the same read -> analyze pipeline runAnalyze
    // uses) and hands both StakeEngineStandaloneAnalysis results to StakeEngineStandaloneAnalysisDiffer. Never
    // attempts an event-level (per-outcome) diff -- an outcome's own "id" is just its row position in that
    // directory's own lookup CSV, not a canonical identity stable across two independently generated directories,
    // so aligning outcomes 1:1 across left/right would silently compare unrelated outcomes that merely share a
    // row number. Diffing stays at the mode/aggregate-metric/classification-category level the differ already
    // computes, where "same modeName"/"same category" *is* a stable, meaningful identity.
    private async runDiff(options: DiffOptions): Promise<number> {
        this.preflightDiffOutput(options);
        const [leftRead, rightRead]: [StakeEngineOutcomeSourceReadResult, StakeEngineOutcomeSourceReadResult] = await Promise.all([
            this.outcomeSourceReader.readFromDirectory(options.leftStakeDir),
            this.outcomeSourceReader.readFromDirectory(options.rightStakeDir),
        ]);
        const leftErrors = leftRead.issues.filter((issue) => issue.severity === "error");
        const rightErrors = rightRead.issues.filter((issue) => issue.severity === "error");
        const diff =
            leftErrors.length === 0 && rightErrors.length === 0
                ? this.standaloneAnalysisDiffer.diff(this.standaloneAnalyzer.analyze(leftRead), this.standaloneAnalyzer.analyze(rightRead))
                : undefined;

        const report: DiffReport = {
            stakeDir: {left: options.leftStakeDir, right: options.rightStakeDir},
            issues: {left: [...leftRead.issues], right: [...rightRead.issues]},
            diff,
        };

        if (options.out) {
            this.writeNewDiffFile(options.out, JSON.stringify(report, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printDiffSummary(report);
            if (options.out) {
                console.log(`\nDiff written to "${options.out}".`);
            }
        }

        if (report.diff === undefined) {
            return DIFF_EXIT_INVALID_INPUT;
        }
        return this.diffHasMaterialDifference(report.diff) ? DIFF_EXIT_MATERIAL_DIFFERENCE : DIFF_EXIT_NO_MATERIAL_DIFFERENCE;
    }

    private preflightDiffOutput(options: DiffOptions): void {
        if (options.out === undefined) {
            return;
        }

        const outputPath = this.canonicalPlannedPath(options.out);
        const inputDirectory = [options.leftStakeDir, options.rightStakeDir].find((stakeDir) => this.isPathWithin(outputPath, this.canonicalPlannedPath(stakeDir)));
        if (inputDirectory !== undefined) {
            throw new Error(newOutputPathMessage(options.out, `it is inside input directory "${inputDirectory}"`));
        }

        try {
            fs.lstatSync(options.out);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return;
            }
            throw new Error(
                `Cannot prepare Stake Engine diff output at "${options.out}": ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        throw new Error(newOutputPathMessage(options.out, "that destination already exists"));
    }

    private canonicalPlannedPath(file: string): string {
        const resolved = path.resolve(file);
        let existingAncestor = resolved;
        const missingParts: string[] = [];
        let reachedRoot = false;
        while (!reachedRoot) {
            try {
                return path.join(fs.realpathSync(existingAncestor), ...missingParts.reverse());
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    return resolved;
                }
                const parent = path.dirname(existingAncestor);
                if (parent === existingAncestor) {
                    reachedRoot = true;
                    continue;
                }
                missingParts.push(path.basename(existingAncestor));
                existingAncestor = parent;
            }
        }
        return resolved;
    }

    private isPathWithin(candidate: string, directory: string): boolean {
        const relative = path.relative(directory, candidate);
        return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    }

    // "Material" deliberately reuses the differ's own threshold-gated warnings (see
    // StakeEngineStandaloneAnalysisDiffer's constructor) rather than "any nonzero delta" -- two independently
    // regenerated directories almost always carry float noise in every metric, which would make the exit code
    // fire on effectively every diff and give it no signal value. Added/removed modes are always material: there
    // is no threshold that makes a whole missing mode a rounding error.
    private diffHasMaterialDifference(diff: StakeEngineStandaloneAnalysisDiff): boolean {
        if (diff.onlyInLeft.length > 0 || diff.onlyInRight.length > 0) {
            return true;
        }
        return Object.values(diff.perMode).some((modeDiff) => modeDiff.warnings.length > 0);
    }

    private printDiffSummary(report: DiffReport): void {
        console.log(`Diffing "${report.stakeDir.left}" -> "${report.stakeDir.right}"`);

        const leftErrors = report.issues.left.filter((issue) => issue.severity === "error");
        const rightErrors = report.issues.right.filter((issue) => issue.severity === "error");
        if (leftErrors.length > 0) {
            console.log(`\nErrors reading "${report.stakeDir.left}" (${leftErrors.length}):`);
            this.printIssues(leftErrors);
        }
        if (rightErrors.length > 0) {
            console.log(`\nErrors reading "${report.stakeDir.right}" (${rightErrors.length}):`);
            this.printIssues(rightErrors);
        }

        if (report.diff === undefined) {
            return;
        }

        if (report.diff.onlyInLeft.length > 0) {
            console.log(`\nRemoved modes (only in "${report.stakeDir.left}"): ${report.diff.onlyInLeft.join(", ")}`);
        }
        if (report.diff.onlyInRight.length > 0) {
            console.log(`\nAdded modes (only in "${report.stakeDir.right}"): ${report.diff.onlyInRight.join(", ")}`);
        }

        for (const [modeName, modeDiff] of Object.entries(report.diff.perMode)) {
            console.log(`\nMode "${modeName}":`);
            console.log(`  rtp                   ${this.formatDiffMetric(modeDiff.rtp)}`);
            console.log(`  hitFrequency          ${this.formatDiffMetric(modeDiff.hitFrequency)}`);
            console.log(`  zeroWinFrequency      ${this.formatDiffMetric(modeDiff.zeroWinFrequency)}`);
            console.log(`  variance              ${this.formatDiffMetric(modeDiff.variance)}`);
            console.log(`  standardDeviation     ${this.formatDiffMetric(modeDiff.standardDeviation)}`);
            console.log(`  maxPayoutMultiplier   ${this.formatDiffMetric(modeDiff.maxPayoutMultiplier)}`);
            console.log(`  maxRatio              ${this.formatDiffMetric(modeDiff.maxRatio)}`);
            console.log(`  maxWinProbability     ${this.formatDiffMetric(modeDiff.maxWinProbability)}`);
            if (modeDiff.nonInvertibleRatioCount.delta !== 0) {
                console.log(`  nonInvertibleRatioCount   ${this.formatDiffMetric(modeDiff.nonInvertibleRatioCount)}`);
            }

            for (const category of modeDiff.eventClassificationBreakdown) {
                console.log(`  event "${category.category}"   ${this.formatCategorySide(category.left)} -> ${this.formatCategorySide(category.right)}`);
            }

            const changedBuckets = modeDiff.payoutDistribution.filter((bucket) => bucket.left !== bucket.right);
            if (changedBuckets.length > 0) {
                console.log(`  payout distribution buckets changed   ${changedBuckets.length} of ${modeDiff.payoutDistribution.length}`);
            }

            if (modeDiff.warnings.length > 0) {
                console.log(`  warnings:`);
                for (const warning of modeDiff.warnings) {
                    console.log(`    - ${warning}`);
                }
            }
        }

        console.log(this.diffHasMaterialDifference(report.diff) ? "\nMaterial differences detected." : "\nNo material differences detected.");
    }

    private formatDiffMetric(metric: StakeEngineStandaloneAnalysisMetricDiff): string {
        const percent = metric.percentDelta === null ? "n/a" : `${this.formatSigned(metric.percentDelta, 2)}%`;
        return `${metric.left} -> ${metric.right} (${this.formatSigned(metric.delta, 6)}, ${percent})`;
    }

    // Exact-decimal category metrics (see StakeEngineStandaloneExactDecimal) are printed verbatim -- never
    // subtracted -- because a uint64-scale value can arrive as a canonical decimal string specifically to avoid
    // float precision loss; computing "left -> right" here, rather than "delta", keeps that precision intact for
    // a human reader the same way the JSON report already does for a machine one.
    private formatCategorySide(side: {occurrenceFrequency: StakeEngineStandaloneExactDecimal; averageOccurrencesPerOutcome: StakeEngineStandaloneExactDecimal} | null): string {
        return side === null ? "absent" : `occurrenceFrequency ${side.occurrenceFrequency}`;
    }

    private formatSigned(value: number, decimals: number): string {
        const rounded = value.toFixed(decimals);
        return value > 0 ? `+${rounded}` : rounded;
    }

    private printAnalyzeSummary(report: AnalyzeReport): void {
        console.log(`Analyzing "${report.stakeDir}"`);

        const errors = report.issues.filter((issue) => issue.severity === "error");
        const nonErrors = report.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.log(`\nErrors (${errors.length}):`);
            this.printIssues(errors);
        }

        for (const mode of report.analysis?.modes ?? []) {
            console.log(`\nMode "${mode.modeName}" (cost ${mode.cost}, ${mode.outcomeCount} outcome(s), total weight ${mode.totalWeight}):`);
            console.log(`  rtp                 ${mode.rtp}`);
            console.log(`  hitFrequency        ${mode.hitFrequency}`);
            console.log(`  standardDeviation   ${mode.standardDeviation}`);
            console.log(`  maxRatio            ${mode.maxRatio} (probability ${mode.maxWinProbability})`);
            if (mode.nonInvertibleRatioCount > 0) {
                console.log(`  nonInvertibleRatioCount   ${mode.nonInvertibleRatioCount}`);
            }
            for (const category of mode.eventClassificationBreakdown) {
                console.log(`  event "${category.category}"   occurrenceFrequency ${category.occurrenceFrequency}, avgPerOutcome ${category.averageOccurrencesPerOutcome}`);
            }
        }

        if (nonErrors.length > 0) {
            console.log(`\nWarnings/info (${nonErrors.length}):`);
            for (const issue of nonErrors) {
                console.log(`  - ${issue.code}: ${issue.message}`);
            }
        }
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    // Wraps whatever the injected loadJson throws (a raw Node `fs`/`JSON.parse` error for the default
    // implementation -- e.g. a bare "ENOENT: no such file or directory, open '...'" with no "Could not
    // read/parse ..." framing and no CONFIG_HINT, unlike every other error loadDescriptor's own checks
    // below already produce) in the same clean, POKIE-authored convention loadGameBlueprint/DiffCommand/
    // ParSheetImporter already use, so a missing/corrupt file -- the single most likely real mistake here
    // -- never leaks a raw runtime error straight to the user (real finding, P5-POLISH-20 audit).
    private loadJsonChecked(filePath: string, description: string): unknown {
        try {
            return this.loadJson(filePath);
        } catch (error) {
            throw new Error(`Could not read ${description} at "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private loadDescriptor(configPath: string): ExportDescriptor {
        const parsed = this.loadJsonChecked(configPath, "Stake Engine export config");
        if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {modes?: unknown}).modes)) {
            throw new Error(`"${configPath}" is not a valid Stake Engine export config. ${CONFIG_HINT}`);
        }

        const modes = (parsed as {modes: unknown[]}).modes.map((entry, position) => {
            if (typeof entry !== "object" || entry === null) {
                throw new Error(`"${configPath}": modes[${position}] must be an object. ${CONFIG_HINT}`);
            }
            const e = entry as {modeName?: unknown; cost?: unknown; libraryPath?: unknown; bundleDir?: unknown; bundleModeName?: unknown};
            if (typeof e.modeName !== "string" || typeof e.cost !== "number") {
                throw new Error(`"${configPath}": modes[${position}] must have a string "modeName" and a number "cost". ${CONFIG_HINT}`);
            }

            const hasLibraryPath = typeof e.libraryPath === "string";
            const hasBundleDir = typeof e.bundleDir === "string";
            if (hasLibraryPath === hasBundleDir) {
                throw new Error(`"${configPath}": modes[${position}] must specify exactly one of "libraryPath" or "bundleDir". ${CONFIG_HINT}`);
            }
            if (hasBundleDir && e.bundleModeName !== undefined && typeof e.bundleModeName !== "string") {
                throw new Error(`"${configPath}": modes[${position}]'s "bundleModeName" must be a string when present. ${CONFIG_HINT}`);
            }

            return {
                modeName: e.modeName,
                cost: e.cost,
                ...(hasLibraryPath
                    ? {libraryPath: e.libraryPath as string}
                    : {bundleDir: e.bundleDir as string, bundleModeName: e.bundleModeName as string | undefined}),
            };
        });

        return {modes};
    }

}

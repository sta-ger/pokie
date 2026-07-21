import fs from "fs";
import path from "path";
import {
    loadWeightedOutcomeLibraryFromBundle,
    StakeEngineBundleStreamingExporter,
    StakeEngineBundleStreamingExporting,
    StakeEngineExporter,
    StakeEngineExporting,
    StakeEngineExportModeInput,
    StakeEngineImporter,
    StakeEngineImporting,
    StakeEngineImportWriter,
    StakeEngineImportWriting,
    StakeEngineOutcomeSourceReader,
    StakeEngineOutcomeSourceReading,
    StakeEngineStandaloneAnalysis,
    StakeEngineStandaloneAnalyzer,
    ValidationIssue,
    WeightedOutcomeLibrary,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

const USAGE =
    "Usage: pokie stakeengine export <config.json> [--out <dir>]\n" +
    "   or: pokie stakeengine import <stakeDir> [--out <dir>]\n" +
    "   or: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]";
const EXPORT_USAGE = "Usage: pokie stakeengine export <config.json> [--out <dir>]";
const IMPORT_USAGE = "Usage: pokie stakeengine import <stakeDir> [--out <dir>]";
const ANALYZE_USAGE = "Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]";
const CONFIG_HINT =
    '<config.json> lists one WeightedOutcomeLibrary source per Stake mode, either a plain JSON file — ' +
    '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — or a canonical ' +
    'outcome-library bundle (see docs/outcome-library-bundle.md) — {"modeName": "base", "cost": 1, "bundleDir": ' +
    '"./bundle", "bundleModeName": "base"} ("bundleModeName" defaults to "modeName" when omitted); exactly one ' +
    "of \"libraryPath\"/\"bundleDir\" is required per mode — see docs/stake-engine-export.md for the format.";
const STAKE_DIR_HINT =
    '<stakeDir> is a directory previously produced by "pokie stakeengine export" (index.json, per-mode lookup ' +
    "CSV/books, and its own pokie-manifest.json) — see docs/stake-engine-import.md for details.";
const ANALYZE_STAKE_DIR_HINT =
    "<stakeDir> is any Stake Engine outcome directory (index.json, per-mode lookup CSV, per-mode zstd-compressed " +
    'JSONL books) — POKIE\'s own export or a third party\'s, with or without a pokie-manifest.json — see ' +
    "docs/stake-engine-standalone.md for details.";

type ExportOptions = {configPath: string; outDir: string};
type ImportOptions = {stakeDir: string; outDir: string};
type AnalyzeFormat = "summary" | "json";
type AnalyzeOptions = {stakeDir: string; format: AnalyzeFormat; out?: string};
type AnalyzeReport = {stakeDir: string; issues: ValidationIssue[]; analysis: StakeEngineStandaloneAnalysis | undefined};

type ExportDescriptorModeEntry = {
    modeName: string;
    cost: number;
    libraryPath?: string;
    bundleDir?: string;
    bundleModeName?: string;
};
type ExportDescriptor = {modes: ExportDescriptorModeEntry[]};

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
    private readonly writeFile: (file: string, contents: string) => void;

    constructor(
        pokieVersion: string,
        exporter: StakeEngineExporting = new StakeEngineExporter(pokieVersion),
        importer: StakeEngineImporting = new StakeEngineImporter(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        importWriter: StakeEngineImportWriting = new StakeEngineImportWriter(),
        loadLibraryFromBundle: (bundleDir: string, modeName: string) => Promise<WeightedOutcomeLibrary> = (bundleDir, modeName) =>
            loadWeightedOutcomeLibraryFromBundle(bundleDir, modeName),
        bundleStreamingExporter: StakeEngineBundleStreamingExporting = new StakeEngineBundleStreamingExporter(pokieVersion),
        outcomeSourceReader: StakeEngineOutcomeSourceReading = new StakeEngineOutcomeSourceReader(),
        standaloneAnalyzer: StakeEngineStandaloneAnalyzer = new StakeEngineStandaloneAnalyzer(),
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
    ) {
        this.exporter = exporter;
        this.importer = importer;
        this.loadJson = loadJson;
        this.importWriter = importWriter;
        this.loadLibraryFromBundle = loadLibraryFromBundle;
        this.bundleStreamingExporter = bundleStreamingExporter;
        this.outcomeSourceReader = outcomeSourceReader;
        this.standaloneAnalyzer = standaloneAnalyzer;
        this.writeFile = writeFile;
    }

    public getName(): string {
        return "stakeengine";
    }

    public getDescription(): string {
        return (
            "Export WeightedOutcomeLibrary JSON files to the Stake Engine math-sdk static file format, import one back, or " +
            "standalone-analyze an arbitrary Stake Engine outcome directory with no pokie-manifest.json required " +
            '("pokie stakeengine export <config.json>" / "pokie stakeengine import <stakeDir>" / "pokie stakeengine analyze <stakeDir>").'
        );
    }

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        switch (subcommand) {
            case "export":
                return this.runExport(rest);
            case "import":
                return this.runImport(rest);
            case "analyze":
                return this.runAnalyze(rest);
            default:
                return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }
    }

    private async runExport(args: string[]): Promise<number> {
        const options = this.parseExportArgs(args);
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
                                ? (this.loadJson(path.resolve(configDir, entry.libraryPath)) as WeightedOutcomeLibrary)
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
    private async runImport(args: string[]): Promise<number> {
        const options = this.parseImportArgs(args);
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
        console.log(`  wrote  config.json`);
        for (const mode of result.modes) {
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
    private async runAnalyze(args: string[]): Promise<number> {
        const options = this.parseAnalyzeArgs(args);
        const readResult = await this.outcomeSourceReader.readFromDirectory(options.stakeDir);
        const errors = readResult.issues.filter((issue) => issue.severity === "error");
        const analysis = errors.length === 0 ? this.standaloneAnalyzer.analyze(readResult) : undefined;
        const report: AnalyzeReport = {stakeDir: options.stakeDir, issues: [...readResult.issues], analysis};

        if (options.out) {
            this.writeFile(options.out, JSON.stringify(report, null, 4));
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

    private parseAnalyzeArgs(args: string[]): AnalyzeOptions {
        const [stakeDir, ...rest] = args;
        if (!stakeDir) {
            throw new Error(`${ANALYZE_USAGE}\n${ANALYZE_STAKE_DIR_HINT}`);
        }

        let format: AnalyzeFormat = "summary";
        let out: string | undefined;
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--format": {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${ANALYZE_USAGE}`);
                    }
                    format = "json";
                    i++;
                    break;
                }
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${ANALYZE_USAGE}`);
                    }
                    out = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${ANALYZE_USAGE}`);
            }
        }

        return {stakeDir, format, out};
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private loadDescriptor(configPath: string): ExportDescriptor {
        const parsed = this.loadJson(configPath);
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

    private parseExportArgs(args: string[]): ExportOptions {
        const [configPath, ...rest] = args;
        if (!configPath) {
            throw new Error(`${EXPORT_USAGE}\n${CONFIG_HINT}`);
        }

        let outDir = path.join(path.dirname(configPath), "stakeengine");
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a directory path. ${EXPORT_USAGE}`);
                    }
                    outDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${EXPORT_USAGE}`);
            }
        }

        return {configPath, outDir};
    }

    private parseImportArgs(args: string[]): ImportOptions {
        const [stakeDir, ...rest] = args;
        if (!stakeDir) {
            throw new Error(`${IMPORT_USAGE}\n${STAKE_DIR_HINT}`);
        }

        let outDir = path.join(path.dirname(stakeDir), `${path.basename(stakeDir)}-imported`);
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a directory path. ${IMPORT_USAGE}`);
                    }
                    outDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${IMPORT_USAGE}`);
            }
        }

        return {stakeDir, outDir};
    }
}

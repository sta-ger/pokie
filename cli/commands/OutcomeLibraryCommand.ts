import fs from "fs";
import path from "path";
import {
    DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
    ExactEnumerationCheckpoint,
    GenerateExactWeightedOutcomeLibraryOptions,
    GenerateExactWeightedOutcomeLibraryResult,
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    OutcomeLibraryBundleWriter,
    OutcomeLibraryBundleWriting,
    OutcomeSpaceEstimate,
    PokieGame,
    ValidationIssue,
    WeightedOutcomeInput,
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryGenerationCancelledError,
    WeightedOutcomeLibraryGenerationError,
    estimateExactOutcomeSpaceSize,
    generateExactWeightedOutcomeLibrary,
    loadPokieGame,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {CommanderErrorMessages, createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {streamJsonlOutcomes} from "./internal/streamJsonlOutcomes.js";

const USAGE =
    "Usage: pokie outcomelibrary generate <packageRoot> [options]\n" +
    "   or: pokie outcomelibrary build <config.json> [--out <dir>]\n" +
    "   or: pokie outcomelibrary validate <bundleDir> [--deep]";
const BUILD_USAGE = "Usage: pokie outcomelibrary build <config.json> [--out <dir>]";
const VALIDATE_USAGE = "Usage: pokie outcomelibrary validate <bundleDir> [--deep]";
const GENERATE_USAGE =
    "Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] [--stake <number>] " +
    "[--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
    "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
    "[--resume <file>] [--progress] [--format json]";
const GENERATE_HINT =
    "<packageRoot> is a package built by \"pokie build\" (or any package loadPokieGame() can require) whose game " +
    "opts into exact enumeration via PokieGame.createExactEnumerationSession -- see docs/weighted-outcome-library.md#generation. " +
    "Drives the same session/win-calculation runtime a live round uses; a stateful/unbounded mechanic (e.g. free " +
    "games) has no exact strategy and fails closed instead of guessing.";
const CONFIG_HINT =
    '<config.json> lists one outcome source per mode, either a plain WeightedOutcomeLibrary JSON file — ' +
    '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — which is fully loaded into ' +
    'memory, or a streaming JSONL file of outcomes (one canonical {"id","weight","artifact"} record per line, ' +
    'not wrapped in a library object) for a mode too large to hold in memory at once — {"modeName": "bonus", ' +
    '"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"} ("libraryId" is required for this form, ' +
    'since there\'s no wrapping library object to read it from; "schemaVersion" is optional). Exactly one of ' +
    '"libraryPath"/"outcomesPath" is required per mode — see docs/outcome-library-bundle.md for the format.';

// A raw reel-stop combination count/checkpoint sample size routinely exceeds Number.MAX_SAFE_INTEGER, so
// these two Commander option parsers (--max-outcome-space-size/--sample-size) accept a decimal string and
// parse it straight to bigint rather than round-tripping through a lossy `Number(value)` first.
function parsePositiveBigIntOption(value: string, flag: string): bigint {
    if (!(/^[0-9]+$/).test(value)) {
        throw new Error(`${flag} must be a positive integer. ${GENERATE_USAGE}`);
    }
    const parsed = BigInt(value);
    if (parsed <= BigInt(0)) {
        throw new Error(`${flag} must be a positive integer. ${GENERATE_USAGE}`);
    }
    return parsed;
}

// Same bigint-safe number-or-decimal-string convention OutcomeLibraryGeneratorDiagnostics's own
// totalOutcomeSpaceSize/sampledRawCount use (see toBigIntSafeDecimal) -- reported here purely for
// --estimate/--dry-run's own summary/JSON output, never round-tripped back through generation itself.
function formatBigIntSafely(value: bigint): number | string {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

type BuildDescriptorModeEntry = {
    modeName: string;
    libraryPath?: string;
    outcomesPath?: string;
    libraryId?: string;
    schemaVersion?: number;
};
type BuildDescriptor = {modes: BuildDescriptorModeEntry[]};

type GenerateFormat = "summary" | "json";

// The shape Commander hands the "generate" action's own options -- one property per declared flag,
// camelCased from its own flag name, same convention as SimCommand's own SimCliOptions.
type GenerateCliOptions = {
    mode?: string;
    stake?: number;
    configHash?: string;
    libraryId?: string;
    maxOutcomeSpaceSize?: bigint;
    bounded?: boolean;
    sampleSize?: bigint;
    seed?: string;
    estimate?: boolean;
    dryRun?: boolean;
    out?: string;
    resume?: string;
    progress?: boolean;
    format: GenerateFormat;
};

// The on-disk shape ExactEnumerationCheckpoint.processedRawIndex/progressTotal/grids[].weight (all
// bigint) is serialized as, since bigint has no native JSON representation -- see
// serializeCheckpoint/deserializeCheckpoint. Written by "generate" itself on cancellation (see
// WeightedOutcomeLibraryGenerationCancelledError.checkpoint) and read back via --resume.
type SerializedCheckpoint = {
    processedRawIndex: string;
    progressTotal: string;
    sourceEnumerationId: string;
    grids: [string, {grid: string[][]; weight: string}][];
};

// Three CLI verbs ("pokie outcomelibrary generate"/"build"/"validate") sharing one command, the same
// way StakeEngineCommand owns "export"/"import"/"analyze"/"diff" — cli/pokie.ts dispatches by exact
// name match, so two separate classes could never both return getName() === "outcomelibrary".
// "generate" is the only verb that ever drives a live game package's runtime (see
// generateExactWeightedOutcomeLibrary) -- "build"/"validate" only ever operate on an already-computed
// WeightedOutcomeLibrary/bundle, never load or execute a PokieGame.
export class OutcomeLibraryCommand implements CliCommandHandling {
    private readonly writer: OutcomeLibraryBundleWriting;
    private readonly validator: OutcomeLibraryBundleValidating;
    private readonly loadJson: (filePath: string) => unknown;
    private readonly streamOutcomes: (filePath: string) => AsyncGenerator<WeightedOutcomeInput>;
    private readonly pokieVersion: string;
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly generate: (options: GenerateExactWeightedOutcomeLibraryOptions) => Promise<GenerateExactWeightedOutcomeLibraryResult>;
    private readonly estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly fileExists: (filePath: string) => boolean;
    private readonly removeFile: (filePath: string) => void;
    private readonly process: NodeJS.Process;

    constructor(
        pokieVersion: string,
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
        validator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        streamOutcomes: (filePath: string) => AsyncGenerator<WeightedOutcomeInput> = streamJsonlOutcomes,
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        generate: (
            options: GenerateExactWeightedOutcomeLibraryOptions,
        ) => Promise<GenerateExactWeightedOutcomeLibraryResult> = generateExactWeightedOutcomeLibrary,
        estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate = estimateExactOutcomeSpaceSize,
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
        fileExists: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath),
        removeFile: (filePath: string) => void = (filePath) => fs.rmSync(filePath, {force: true}),
        processHandle: NodeJS.Process = process,
    ) {
        this.writer = writer;
        this.validator = validator;
        this.loadJson = loadJson;
        this.streamOutcomes = streamOutcomes;
        this.pokieVersion = pokieVersion;
        this.loadGame = loadGame;
        this.generate = generate;
        this.estimateSpace = estimateSpace;
        this.writeFile = writeFile;
        this.fileExists = fileExists;
        this.removeFile = removeFile;
        this.process = processHandle;
    }

    public getName(): string {
        return "outcomelibrary";
    }

    public getDescription(): string {
        return (
            "Generate a WeightedOutcomeLibrary from a built package's own runtime (exact reel-stop enumeration), or " +
            "build a canonical outcome-library persistence bundle from WeightedOutcomeLibrary JSON files, or validate one " +
            '("pokie outcomelibrary generate <packageRoot>" / "pokie outcomelibrary build <config.json>" / ' +
            '"pokie outcomelibrary validate <bundleDir>").'
        );
    }

    // Three ordinary-word verbs ("generate"/"build"/"validate") sharing one parent Commander instance —
    // real nested subcommands (see cli/commands/internal/CommanderCliAdapter.ts), so Commander itself
    // both dispatches by exact verb name and validates each verb's own args/options. The messages passed
    // to translateCommanderError are picked per-verb (from args[0], read before parsing) since a
    // structural error caught at the shared parent.parseAsync() call doesn't otherwise say which
    // subcommand it came from; an empty/unrecognized verb falls back to the combined USAGE+hint the
    // original hand-rolled switch's own `default` case threw.
    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rather than lean on
        // Commander's own incidental "commander.help" throw for this (still handled below via
        // noCommand, e.g. for "pokie outcomelibrary help"), reject it explicitly up front with the
        // same combined usage+hint text the original hand-rolled switch's own `default` case threw.
        if (args.length === 0) {
            return Promise.reject(new Error(`${USAGE}\n${CONFIG_HINT}`));
        }

        let exitCode = 0;
        const parent = createCommanderCliCommand("outcomelibrary");

        parent
            .command("build")
            .argument("<config.json>")
            .argument("[excess...]")
            .option("--out <dir>")
            .action(async (configPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${BUILD_USAGE}`);
                }
                const outDir = options.out ?? path.join(path.dirname(configPath), "outcomelibrary");
                exitCode = await this.executeBuild(configPath, outDir);
            });

        parent
            .command("validate")
            .argument("<bundleDir>")
            .argument("[excess...]")
            .option("--deep")
            .action(async (bundleDir: string, excess: string[], options: {deep?: boolean}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${VALIDATE_USAGE}`);
                }
                exitCode = await this.executeValidate(bundleDir, options.deep ?? false);
            });

        parent
            .command("generate")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .option("--mode <betModeId>")
            .option("--stake <number>", "", (value: string): number => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    throw new Error(`--stake must be a positive number. ${GENERATE_USAGE}`);
                }
                return parsed;
            })
            .option("--config-hash <hash>")
            .option("--library-id <id>")
            .option("--max-outcome-space-size <n>", "", (value: string): bigint => parsePositiveBigIntOption(value, "--max-outcome-space-size"))
            .option("--bounded")
            .option("--sample-size <n>", "", (value: string): bigint => parsePositiveBigIntOption(value, "--sample-size"))
            .option("--seed <string>")
            .option("--estimate")
            .option("--dry-run")
            .option("--out <file>")
            .option("--resume <file>")
            .option("--progress")
            .option(
                "--format <format>",
                "",
                (value: string): GenerateFormat => {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${GENERATE_USAGE}`);
                    }
                    return "json";
                },
                "summary" as GenerateFormat,
            )
            .action(async (packageRoot: string, excess: string[], options: GenerateCliOptions) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${GENERATE_USAGE}`);
                }
                exitCode = await this.executeGenerate(packageRoot, options);
            });

        const verb = args[0];
        let verbMessages: CommanderErrorMessages = {};
        if (verb === "build") {
            verbMessages = {
                missingArgument: `${BUILD_USAGE}\n${CONFIG_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${BUILD_USAGE}`,
                optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a directory path. ${BUILD_USAGE}` : `Unknown option "${flag}". ${BUILD_USAGE}`),
            };
        } else if (verb === "validate") {
            verbMessages = {
                missingArgument: VALIDATE_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${VALIDATE_USAGE}`,
            };
        } else if (verb === "generate") {
            verbMessages = {
                missingArgument: `${GENERATE_USAGE}\n${GENERATE_HINT}`,
                unknownOption: (flag) => `Unknown option "${flag}". ${GENERATE_USAGE}`,
                optionMissingArgument: (flag) => {
                    switch (flag) {
                        case "--mode":
                            return `--mode requires a bet mode id. ${GENERATE_USAGE}`;
                        case "--stake":
                            return `--stake must be a positive number. ${GENERATE_USAGE}`;
                        case "--config-hash":
                            return `--config-hash requires a value. ${GENERATE_USAGE}`;
                        case "--library-id":
                            return `--library-id requires a value. ${GENERATE_USAGE}`;
                        case "--max-outcome-space-size":
                            return `--max-outcome-space-size must be a positive integer. ${GENERATE_USAGE}`;
                        case "--sample-size":
                            return `--sample-size must be a positive integer. ${GENERATE_USAGE}`;
                        case "--seed":
                            return `--seed requires a value. ${GENERATE_USAGE}`;
                        case "--out":
                            return `--out requires a file path. ${GENERATE_USAGE}`;
                        case "--resume":
                            return `--resume requires a file path. ${GENERATE_USAGE}`;
                        case "--format":
                            return `--format only supports "json". ${GENERATE_USAGE}`;
                        default:
                            return `Unknown option "${flag}". ${GENERATE_USAGE}`;
                    }
                },
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCode)
            .catch((error: unknown) => {
                throw translateCommanderError(error, {
                    ...verbMessages,
                    unknownCommand: `${USAGE}\n${CONFIG_HINT}`,
                    noCommand: `${USAGE}\n${CONFIG_HINT}`,
                });
            });
    }

    // The runtime-to-library counterpart to executeBuild/executeValidate: loads a real, executable
    // package (loadPokieGame -- same loader "pokie sim"/"pokie report" use) and drives it through
    // generateExactWeightedOutcomeLibrary, never a plain JSON file. --estimate/--dry-run short-circuit
    // to the cheap, non-enumerating estimateExactOutcomeSpaceSize probe instead (see executeEstimate).
    private async executeGenerate(packageRoot: string, options: GenerateCliOptions): Promise<number> {
        // Validated before any I/O (loadGame included) -- same "invalid argv never touches the
        // filesystem" discipline every other command's own parseArgs() already follows.
        const bounded = this.buildBoundedOptions(options.bounded, options.sampleSize, options.seed);

        const game = await this.loadGame(packageRoot);

        if (options.estimate || options.dryRun) {
            return this.executeEstimate(game, options);
        }

        const manifest = game.getManifest();
        const libraryId = options.libraryId ?? `${manifest.id}${options.mode !== undefined ? `-${options.mode}` : ""}`;

        let resumeFrom: ExactEnumerationCheckpoint | undefined;
        if (options.resume !== undefined && this.fileExists(options.resume)) {
            resumeFrom = this.readCheckpoint(options.resume);
        }

        const controller = new AbortController();
        const onCancel = () => controller.abort();
        this.process.once("SIGINT", onCancel);

        try {
            const generateOptions: GenerateExactWeightedOutcomeLibraryOptions = {
                libraryId,
                game,
                pokieVersion: this.pokieVersion,
                ...(options.configHash !== undefined ? {configHash: options.configHash} : {}),
                ...(options.mode !== undefined ? {betMode: options.mode} : {}),
                ...(options.stake !== undefined ? {stake: options.stake} : {}),
                ...(options.maxOutcomeSpaceSize !== undefined ? {maxOutcomeSpaceSize: options.maxOutcomeSpaceSize} : {}),
                ...(bounded !== undefined ? {bounded} : {}),
                ...(resumeFrom !== undefined ? {resumeFrom} : {}),
                signal: controller.signal,
                ...(options.progress ? {onProgress: (processedRawIndex: bigint, progressTotal: bigint) => console.error(`  progress  ${processedRawIndex} / ${progressTotal}`)} : {}),
            };

            const result = await this.generate(generateOptions);

            // The sweep completed to a real, un-cancelled library -- a checkpoint left over from an
            // earlier cancelled attempt at this same --resume path is now stale, never silently reused
            // by a later, unrelated run of the same command.
            if (options.resume !== undefined && this.fileExists(options.resume)) {
                this.removeFile(options.resume);
            }

            this.printGenerateResult(result, options);
            return 0;
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationCancelledError) {
                if (options.resume === undefined) {
                    console.error(
                        `Generation of "${packageRoot}" was cancelled after ${error.processedRawIndex} / ${error.progressTotal} raw draws, ` +
                            "and no --resume <file> was given to save its progress -- rerun with --resume next time to avoid losing it.",
                    );
                    return 130;
                }
                this.writeFile(options.resume, JSON.stringify(this.serializeCheckpoint(error.checkpoint), null, 4));
                console.error(
                    `Generation of "${packageRoot}" was cancelled after ${error.processedRawIndex} / ${error.progressTotal} raw draws. ` +
                        `Checkpoint written to "${options.resume}" -- rerun the exact same command (with --resume "${options.resume}") to continue.`,
                );
                return 130;
            }
            if (error instanceof WeightedOutcomeLibraryGenerationError) {
                console.error(`Could not generate an outcome library from "${packageRoot}" (${error.getCode()}): ${error.message}`);
                return 1;
            }
            throw error;
        } finally {
            this.process.off("SIGINT", onCancel);
        }
    }

    // --estimate/--dry-run: the cheap, non-enumerating dry run over estimateExactOutcomeSpaceSize --
    // reads reel-strip sizes only, never sweeps a single reel-stop tuple or plays a round. Reports
    // exactly which strategy a real "generate" run would resolve to given the same --max-outcome-space-size/
    // --bounded flags, so a caller can decide whether to opt into --bounded before committing to a full run.
    private executeEstimate(game: PokieGame, options: GenerateCliOptions): number {
        let estimate: OutcomeSpaceEstimate;
        try {
            estimate = this.estimateSpace(game);
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationError) {
                console.error(`Cannot estimate "${game.getManifest().id}"'s exact outcome space (${error.getCode()}): ${error.message}`);
                return 1;
            }
            throw error;
        }

        const maxOutcomeSpaceSize = options.maxOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE;
        const strategy: "exact" | "bounded-coverage" = estimate.totalOutcomeSpaceSize > maxOutcomeSpaceSize ? "bounded-coverage" : "exact";
        const report = {
            game: game.getManifest(),
            reelsNumber: estimate.reelsNumber,
            reelsSymbolsNumber: estimate.reelsSymbolsNumber,
            reelSizes: estimate.reelSizes,
            totalOutcomeSpaceSize: formatBigIntSafely(estimate.totalOutcomeSpaceSize),
            maxOutcomeSpaceSize: formatBigIntSafely(maxOutcomeSpaceSize),
            strategy,
            requiresBounded: strategy === "bounded-coverage" && options.bounded !== true,
        };

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            console.log(`Estimated exact outcome space for "${report.game.id}":`);
            console.log(`  reels             ${report.reelsNumber} (visible symbols/reel: ${report.reelsSymbolsNumber})`);
            console.log(`  reel sizes        ${report.reelSizes.join(", ")}`);
            console.log(`  total raw space   ${report.totalOutcomeSpaceSize}`);
            console.log(`  strategy          ${report.strategy}${report.requiresBounded ? " (requires --bounded --sample-size <n> --seed <string>)" : ""}`);
        }

        return 0;
    }

    // --bounded requires --sample-size and --seed together (same "opt in as a group, not individually"
    // discipline as SimCommand's own convergence flags) -- and, symmetrically, --sample-size/--seed
    // without --bounded is rejected rather than silently ignored, so a caller who forgot --bounded finds
    // out immediately rather than unknowingly running an exact sweep with two dead flags.
    private buildBoundedOptions(bounded: boolean | undefined, sampleSize: bigint | undefined, seed: string | undefined): {sampleSize: bigint; seed: string} | undefined {
        if (!bounded) {
            if (sampleSize !== undefined || seed !== undefined) {
                throw new Error(`--sample-size and --seed require --bounded. ${GENERATE_USAGE}`);
            }
            return undefined;
        }
        if (sampleSize === undefined || seed === undefined) {
            throw new Error(`--bounded requires both --sample-size and --seed. ${GENERATE_USAGE}`);
        }
        return {sampleSize, seed};
    }

    private printGenerateResult(result: GenerateExactWeightedOutcomeLibraryResult, options: GenerateCliOptions): void {
        if (options.out !== undefined) {
            this.writeFile(options.out, JSON.stringify(result.library, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(result, null, 4));
        } else {
            console.log(`Generated outcome library "${result.library.libraryId}" (${result.diagnostics.strategy}):`);
            console.log(`  outcomes          ${result.library.outcomes.length}`);
            console.log(`  total raw space   ${result.diagnostics.totalOutcomeSpaceSize}`);
            console.log(`  sampled raw count ${result.diagnostics.sampledRawCount}`);
            if (result.diagnostics.seed !== undefined) {
                console.log(`  seed              ${result.diagnostics.seed}`);
            }
            if (options.out !== undefined) {
                console.log(`\nLibrary written to "${options.out}".`);
            }
        }
    }

    // ExactEnumerationCheckpoint.processedRawIndex/progressTotal/grids[].weight are all bigint, which
    // JSON.stringify can't represent at all (not even lossily) -- serialized to decimal strings here and
    // parsed back via BigInt() in readCheckpoint, the same "never silently truncate a big count" discipline
    // toBigIntSafeDecimal already uses for the (much smaller, number-representable) diagnostics fields.
    private serializeCheckpoint(checkpoint: ExactEnumerationCheckpoint): SerializedCheckpoint {
        return {
            processedRawIndex: checkpoint.processedRawIndex.toString(),
            progressTotal: checkpoint.progressTotal.toString(),
            sourceEnumerationId: checkpoint.sourceEnumerationId,
            grids: Array.from(checkpoint.grids.entries()).map(([key, entry]) => [key, {grid: entry.grid, weight: entry.weight.toString()}]),
        };
    }

    private readCheckpoint(filePath: string): ExactEnumerationCheckpoint {
        const parsed = this.loadJson(filePath) as Partial<SerializedCheckpoint>;
        if (
            typeof parsed !== "object" ||
            parsed === null ||
            typeof parsed.processedRawIndex !== "string" ||
            typeof parsed.progressTotal !== "string" ||
            typeof parsed.sourceEnumerationId !== "string" ||
            !Array.isArray(parsed.grids)
        ) {
            throw new Error(`"${filePath}" is not a valid --resume checkpoint file (see a WeightedOutcomeLibraryGenerationCancelledError's own checkpoint).`);
        }

        return {
            processedRawIndex: BigInt(parsed.processedRawIndex),
            progressTotal: BigInt(parsed.progressTotal),
            sourceEnumerationId: parsed.sourceEnumerationId,
            grids: new Map(parsed.grids.map(([key, entry]) => [key, {grid: entry.grid, weight: BigInt(entry.weight)}])),
        };
    }

    private async executeBuild(configPath: string, outDir: string): Promise<number> {
        const descriptor = this.loadDescriptor(configPath);
        const configDir = path.dirname(configPath);

        const modes: OutcomeLibraryBundleModeInput[] = descriptor.modes.map((entry) => {
            if (entry.libraryPath !== undefined) {
                const library = this.loadJson(path.resolve(configDir, entry.libraryPath)) as WeightedOutcomeLibrary;
                return {modeName: entry.modeName, libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes};
            }
            return {
                modeName: entry.modeName,
                // Safe: loadDescriptor already requires libraryId whenever outcomesPath is present.
                libraryId: entry.libraryId as string,
                schemaVersion: entry.schemaVersion,
                outcomes: this.streamOutcomes(path.resolve(configDir, entry.outcomesPath as string)),
            };
        });

        const result = await this.writer.writeToDirectory(modes, outDir);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        const warnings = result.issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`Could not build an outcome library bundle from "${configPath}" to "${outDir}" (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`Built an outcome library bundle from "${configPath}" to "${outDir}":`);
        for (const file of result.files) {
            console.log(`  wrote  ${file}`);
        }
        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private async executeValidate(bundleDir: string, deep: boolean): Promise<number> {
        const issues = await this.validator.validate(bundleDir, {deep});
        const errors = issues.filter((issue) => issue.severity === "error");
        const rest = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`"${bundleDir}" is not a valid outcome library bundle (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`"${bundleDir}" is a valid outcome library bundle${deep ? " (deep check)" : ""}.`);
        for (const issue of rest) {
            console.log(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private loadDescriptor(configPath: string): BuildDescriptor {
        const parsed = this.loadJson(configPath);
        if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {modes?: unknown}).modes)) {
            throw new Error(`"${configPath}" is not a valid outcome library bundle config. ${CONFIG_HINT}`);
        }

        const modes = (parsed as {modes: unknown[]}).modes.map((entry, position) => {
            if (typeof entry !== "object" || entry === null || typeof (entry as {modeName?: unknown}).modeName !== "string") {
                throw new Error(`"${configPath}": modes[${position}] must be an object with a string "modeName". ${CONFIG_HINT}`);
            }
            const e = entry as {modeName: string; libraryPath?: unknown; outcomesPath?: unknown; libraryId?: unknown; schemaVersion?: unknown};

            const hasLibraryPath = typeof e.libraryPath === "string";
            const hasOutcomesPath = typeof e.outcomesPath === "string";
            if (hasLibraryPath === hasOutcomesPath) {
                throw new Error(`"${configPath}": modes[${position}] must specify exactly one of "libraryPath" or "outcomesPath". ${CONFIG_HINT}`);
            }
            if (hasOutcomesPath && typeof e.libraryId !== "string") {
                throw new Error(`"${configPath}": modes[${position}] uses "outcomesPath" and so requires a string "libraryId". ${CONFIG_HINT}`);
            }
            if (e.schemaVersion !== undefined && typeof e.schemaVersion !== "number") {
                throw new Error(`"${configPath}": modes[${position}]'s "schemaVersion" must be a number when present. ${CONFIG_HINT}`);
            }

            return {
                modeName: e.modeName,
                ...(hasLibraryPath ? {libraryPath: e.libraryPath as string} : {outcomesPath: e.outcomesPath as string, libraryId: e.libraryId as string}),
                ...(e.schemaVersion !== undefined ? {schemaVersion: e.schemaVersion as number} : {}),
            };
        });

        return {modes};
    }

}

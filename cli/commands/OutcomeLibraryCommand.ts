import {Command} from "commander";
import fs from "fs";
import path from "path";
import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanner,
    computeArtifactInputBindingHash,
    ExactEnumerationCheckpoint,
    GenerateExactWeightedOutcomeLibraryResult,
    OutcomeLibraryGenerationRequest,
    ResolvedOutcomeLibraryGenerationRequest,
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleValidating,
    OutcomeLibraryBundleValidator,
    OutcomeLibraryBundleWriter,
    OutcomeLibraryBundleWriting,
    OutcomeLibraryBundleWriteValidator,
    OutcomeSpaceEstimate,
    PokieGame,
    ProjectTargetResolver,
    PROJECT_TYPE_CAPABILITIES,
    OUTCOME_LIBRARY_GENERATE_OPERATION,
    ValidationIssue,
    WeightedOutcomeInput,
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryValidator,
    WeightedOutcomeLibraryGenerationCancelledError,
    WeightedOutcomeLibraryGenerationError,
    estimateExactOutcomeSpaceSize,
    generateWeightedOutcomeLibrary,
    loadPokieGame,
    prepareOutcomeLibraryGenerationFromEstimate,
    resolveOutcomeLibraryGenerationDestination,
    describeUnsupportedProjectOperation,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {CommanderErrorMessages, createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
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
    "[--exact | --sample <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
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

// The bundle writer derives this from each mode's first accepted outcome before it publishes a
// bundle. `validateBuildSource` reads complete sources for its read-only preview, so it can enforce
// the same cross-mode contract before ExportCommand promises a successful outcomes export.
type BundleModeProvenance = {
    readonly modeName: string;
    readonly gameId: string;
    readonly gameVersion: string;
    readonly configHash: string | undefined;
    readonly pokieVersion: string;
};

type GenerateFormat = "summary" | "json";

// The shape Commander hands the "generate" action's own options -- one property per declared flag,
// camelCased from its own flag name, same convention as SimCommand's own SimCliOptions.
type GenerateCliOptions = {
    mode?: string;
    stake?: number;
    configHash?: string;
    libraryId?: string;
    maxOutcomeSpaceSize?: bigint;
    exact?: boolean;
    sample?: bigint;
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
    private readonly generate: (request: OutcomeLibraryGenerationRequest) => Promise<GenerateExactWeightedOutcomeLibraryResult>;
    private readonly estimateSpace: (game: PokieGame) => OutcomeSpaceEstimate;
    private readonly writeFile: (filePath: string, contents: string) => void;
    private readonly fileExists: (filePath: string) => boolean;
    private readonly removeFile: (filePath: string) => void;
    private readonly process: NodeJS.Process;
    private readonly planner = new ArtifactConversionPlanner();

    constructor(
        pokieVersion: string,
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
        validator: OutcomeLibraryBundleValidating = new OutcomeLibraryBundleValidator(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        streamOutcomes: (filePath: string) => AsyncGenerator<WeightedOutcomeInput> = streamJsonlOutcomes,
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        generate: (
            request: OutcomeLibraryGenerationRequest,
        ) => Promise<GenerateExactWeightedOutcomeLibraryResult> = generateWeightedOutcomeLibrary,
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

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    /** The public `generate` facade reuses this grammar without delegating a command invocation. */
    public getGenerateCommanderCommand(): Command {
        return this.buildCommand().commands.find((candidate) => candidate.name() === "generate")!;
    }

    /** Executes the generate grammar as an explicit prepared-operation surface. */
    public runGenerate(args: string[]): Promise<number> {
        return this.run(["generate", ...args]);
    }

    // ExportCommand uses this read-only counterpart to `build`: it resolves the exact same descriptor
    // and source files, then applies the structural checks that can run without staging an artifact.
    // Keeping it here prevents the target-oriented alias from inventing a second config format.
    public async validateBuildSource(configPath: string): Promise<void> {
        const descriptor = this.loadDescriptor(configPath);
        const configDir = path.dirname(configPath);
        const modes: OutcomeLibraryBundleModeInput[] = [];
        const provenances: BundleModeProvenance[] = [];
        const issues: ValidationIssue[] = [];
        const libraryValidator = new WeightedOutcomeLibraryValidator();

        for (const entry of descriptor.modes) {
            const library = entry.libraryPath !== undefined
                ? (this.loadJson(path.resolve(configDir, entry.libraryPath)) as WeightedOutcomeLibrary)
                : {
                    schemaVersion: entry.schemaVersion ?? 1,
                    libraryId: entry.libraryId as string,
                    outcomes: await this.readStreamedOutcomes(path.resolve(configDir, entry.outcomesPath as string)),
                };
            const libraryIssues = libraryValidator.validate(library);
            const bundleIssues = this.validateBundleWriterSpecificSourceContract(entry.modeName, library);
            issues.push(...libraryIssues, ...bundleIssues);
            modes.push({
                modeName: entry.modeName,
                libraryId: library.libraryId,
                schemaVersion: library.schemaVersion,
                outcomes: library.outcomes,
            });
            if (!libraryIssues.some((issue) => issue.severity === "error") && !bundleIssues.some((issue) => issue.severity === "error")) {
                provenances.push(this.provenanceOf(entry.modeName, library));
            }
        }
        issues.push(...new OutcomeLibraryBundleWriteValidator().validate(modes));
        issues.push(...this.validateCrossModeProvenance(provenances));
        const errors = issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            throw new Error(
                `The outcome-library source does not satisfy the export contract: ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")} ` +
                "Next: fix the listed source errors, then prepare the export again.",
            );
        }
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

        const exitCodeRef = {value: 0};
        const parent = this.buildCommand(exitCodeRef);
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
                        case "--sample":
                            return `--sample must be a positive integer. ${GENERATE_USAGE}`;
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

    // WeightedOutcomeLibraryValidator is intentionally usable by non-bundle callers, where a
    // positive fractional weight is valid. The persisted bundle's draw/index format is stricter:
    // every accepted weight and its total must be safe integers. Keep this read-only mirror here so
    // an outcomes dry-run cannot accept a source the writer later refuses after staging it.
    private validateBundleWriterSpecificSourceContract(modeName: string, library: WeightedOutcomeLibrary): ValidationIssue[] {
        const rawOutcomes = (library as {outcomes?: unknown}).outcomes;
        if (!Array.isArray(rawOutcomes)) return [];

        const issues: ValidationIssue[] = [];
        let totalWeight = 0;
        for (const outcome of rawOutcomes) {
            const weight = typeof outcome === "object" && outcome !== null ? (outcome as {weight?: unknown}).weight : undefined;
            if (typeof weight !== "number" || !Number.isSafeInteger(weight) || weight <= 0) {
                issues.push({
                    code: "outcome-library-bundle-write-weight-invalid",
                    severity: "error",
                    message: `mode "${modeName}": every outcome weight must be a positive safe integer.`,
                    details: {modeName},
                });
                continue;
            }
            totalWeight += weight;
        }
        if (issues.length === 0 && !Number.isSafeInteger(totalWeight)) {
            issues.push({
                code: "outcome-library-bundle-write-total-weight-overflow",
                severity: "error",
                message: `mode "${modeName}": the total outcome weight must be a safe integer.`,
                details: {modeName},
            });
        }
        return issues;
    }

    private provenanceOf(modeName: string, library: WeightedOutcomeLibrary): BundleModeProvenance {
        // Called only after WeightedOutcomeLibraryValidator and the bundle-specific checks found no
        // errors, which guarantees a non-empty mode and a complete first outcome provenance.
        const provenance = library.outcomes[0].artifact.provenance;
        return {
            modeName,
            gameId: provenance.game.id,
            gameVersion: provenance.game.version,
            configHash: provenance.configHash,
            pokieVersion: provenance.pokieVersion,
        };
    }

    private validateCrossModeProvenance(provenances: readonly BundleModeProvenance[]): ValidationIssue[] {
        const first = provenances[0];
        if (first === undefined) return [];
        return provenances.slice(1).flatMap((current) =>
            current.gameId !== first.gameId ||
            current.gameVersion !== first.gameVersion ||
            current.configHash !== first.configHash ||
            current.pokieVersion !== first.pokieVersion
                ? [{
                    code: "outcome-library-bundle-cross-mode-provenance-mismatch",
                    severity: "error" as const,
                    message: `mode "${current.modeName}" has different provenance (game id/version, configHash, or pokieVersion) than the bundle's other modes.`,
                    details: {modeName: current.modeName},
                }]
                : [],
        );
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by whichever verb's action actually runs;
    // run() supplies its own real box and reads it back once parsing resolves, while
    // getCommanderCommand() never parses this tree at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("outcomelibrary").description(this.getDescription());

        parent
            .command("build")
            .description("Build a canonical outcome-library persistence bundle from WeightedOutcomeLibrary JSON/JSONL files.")
            .argument("<config.json>", "lists one outcome source per mode -- see docs/outcome-library-bundle.md")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <dir>", "output directory (default: an \"outcomelibrary\" sibling of <config.json>)")
            .action(async (configPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${BUILD_USAGE}`);
                }
                const outDir = options.out ?? path.join(path.dirname(configPath), "outcomelibrary");
                exitCodeRef.value = await this.executeBuild(configPath, outDir);
            });

        parent
            .command("validate")
            .description("Validate an outcome-library persistence bundle.")
            .argument("<bundleDir>", "an existing outcome-library bundle directory built by \"pokie outcomelibrary build\"")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--deep", "also validate every outcome's own weight/artifact shape, not just the bundle's index")
            .action(async (bundleDir: string, excess: string[], options: {deep?: boolean}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${VALIDATE_USAGE}`);
                }
                exitCodeRef.value = await this.executeValidate(bundleDir, options.deep ?? false);
            });

        parent
            .command("generate")
            .description("Generate an exact or explicitly sampled WeightedOutcomeLibrary from a built package's own runtime.")
            .argument("<packageRoot>", GENERATE_HINT)
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--mode <betModeId>", "bet mode to generate for (default: the game's own default bet mode)")
            .option("--stake <number>", "stake to generate for (default: the game's own default stake)", (value: string): number => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    throw new Error(`--stake must be a positive number. ${GENERATE_USAGE}`);
                }
                return parsed;
            })
            .option("--config-hash <hash>", "verify the loaded package configuration identity before generation")
            .option("--library-id <id>", "id for the generated library (default: derived from the game manifest/mode)")
            .option(
                "--max-outcome-space-size <n>",
                "above this raw outcome count, exact generation fails safely; use --sample <n> --seed <string> for sampled draws",
                (value: string): bigint => parsePositiveBigIntOption(value, "--max-outcome-space-size"),
            )
            .option("--exact", "require exact enumeration (the default; mutually exclusive with --sample)")
            .option("--sample <n>", "directly perform n deterministic sampled draws (requires --seed; never sweeps the full space first)", (value: string): bigint => parsePositiveBigIntOption(value, "--sample"))
            .option("--bounded", "legacy: sample only when the exact-space cap is exceeded (requires --sample-size/--seed)")
            .option("--sample-size <n>", "legacy bounded sample size (requires --bounded)", (value: string): bigint => parsePositiveBigIntOption(value, "--sample-size"))
            .option("--seed <string>", "deterministic seed for --sample (or legacy --bounded)")
            .option("--estimate", "print the outcome space size/strategy without enumerating or sampling anything")
            .option("--dry-run", "alias for --estimate")
            .option("--out <file>", "write the generated library JSON to this path")
            .option("--resume <file>", "resume from a checkpoint written by an earlier cancelled run")
            .option("--progress", "print periodic progress to stderr while generating")
            .option(
                "--format <format>",
                'only "json" is supported (default: a human-readable summary)',
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
                exitCodeRef.value = await this.executeGenerate(packageRoot, options);
            });

        return parent;
    }

    // The runtime-to-library counterpart to executeBuild/executeValidate: loads a real, executable
    // package (loadPokieGame -- same loader "pokie sim"/"pokie report" use) and drives it through
    // generateExactWeightedOutcomeLibrary, never a plain JSON file. --estimate/--dry-run short-circuit
    // to the cheap, non-enumerating estimateExactOutcomeSpaceSize probe instead (see executeEstimate).
    private async executeGenerate(packageRoot: string, options: GenerateCliOptions): Promise<number> {
        // Validated before any I/O (loadGame included) -- same "invalid argv never touches the
        // filesystem" discipline every other command's own parseArgs() already follows.
        const sampling = this.buildSampledOptions(options);

        // A component's compatible sidecar authorizes metadata inspection only.
        // Check it before every initial runtime load; prepareRawGenerationOperation
        // repeats this check immediately before its rebind load, because the
        // source can be replaced after this preflight has completed.
        await this.assertGenerationSourceIsRunnable(packageRoot);

        if (options.estimate || options.dryRun) {
            const game = await this.loadGame(packageRoot);
            // Estimate is a real preflight, not a separate planning shortcut:
            // construct exactly the request execution would receive so loaded
            // configuration assertions and the resolved publication identity
            // fail or bind consistently before either path reports success.
            return this.executeEstimate(game, options, this.createGenerationRequest(game, packageRoot, options, sampling));
        }

        const controller = new AbortController();
        const onCancel = () => controller.abort();
        this.process.once("SIGINT", onCancel);

        let resolvedStrategy: ResolvedOutcomeLibraryGenerationRequest["preflight"]["strategy"] | undefined;
        try {
            const game = await this.loadGame(packageRoot);
            const request = this.createGenerationRequest(game, packageRoot, options, sampling, controller.signal);
            // The public request preparation is the one authority for source
            // provenance, destination identity, and conditional-bounded
            // strategy. Raw JSON publication consumes this resolved request;
            // it must not reconstruct a subtly different preflight.
            const resolvedRequest = prepareOutcomeLibraryGenerationFromEstimate(this.estimateSpace(game), request);
            resolvedStrategy = resolvedRequest.preflight.strategy;
            // A cap-exceeded default/exact request has no sampled settings to
            // carry into the conversion planner.  Reject it at the same CLI
            // diagnostic boundary as the generator instead of constructing a
            // malformed bounded-plan provenance record below.
            if (resolvedRequest.preflight.requiresSampledOptIn) {
                throw new WeightedOutcomeLibraryGenerationError(
                    "weighted-outcome-library-generation-space-exceeded",
                    `"${game.getManifest().id}"'s exact outcome space (${resolvedRequest.preflight.estimate.totalOutcomeSpaceSize} reel-stop combinations) exceeds ` +
                    `maxOutcomeSpaceSize (${resolvedRequest.preflight.maxExactOutcomeSpaceSize}). Pass a larger maxOutcomeSpaceSize, or opt into an explicitly-labelled ` +
                    "bounded-coverage strategy with --sample <n> --seed <string>.",
                );
            }
            const prepared = this.prepareRawGenerationOperation(
                packageRoot,
                options,
                sampling,
                controller.signal,
                resolvedRequest,
            );
            const execution = await this.planner.executeConversionPlan(prepared.plan, prepared.execution);
            this.printGenerateResult(execution.read, options);
            return 0;
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationCancelledError) {
                if (resolvedStrategy !== "exact") {
                    console.error(
                        `Generation of "${packageRoot}" was cancelled after ${error.processedRawIndex} / ${error.progressTotal} raw draws. ` +
                            "No incomplete library was published; bounded coverage has no exact checkpoint, so retry the same command to start a fresh deterministic sample.",
                    );
                    return 130;
                }
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
                // Destination safety is a synchronous invocation precondition
                // (the same public behavior raw --out historically exposed),
                // while other generation diagnostics are command results.
                if (error.getCode() === "weighted-outcome-library-generation-destination-conflict") throw error;
                console.error(`Could not generate an outcome library from "${packageRoot}" (${error.getCode()}): ${error.message}`);
                return 1;
            }
            throw error;
        } finally {
            this.process.off("SIGINT", onCancel);
        }
    }

    /**
     * Raw generation is a conversion operation too.  The CLI only supplies a
     * runtime reader and an optional raw-JSON file publisher; the planner
     * rebinds the package/checkpoint input before and after enumeration and
     * owns the cancellation rollback/cleanup ordering.  The explicit file
     * publication plan intentionally does not advertise raw JSON as a native
     * Outcome Library bundle conversion route.
     */
    private prepareRawGenerationOperation(
        packageRoot: string,
        options: GenerateCliOptions,
        sampling: {sampled?: {sampleSize: bigint; seed: string}; bounded?: {sampleSize: bigint; seed: string}},
        signal: AbortSignal,
        resolvedRequest: ResolvedOutcomeLibraryGenerationRequest,
    ) {
        const sourcePaths = [packageRoot, ...(options.resume === undefined ? [] : [options.resume])];
        // A generated package receives a local node_modules/pokie symlink so
        // it can run before npm install. That link points at the live CLI
        // runtime, whose Jest cache and unrelated concurrent work must not
        // make this package's prepared generation source look stale.
        const sourceBindingHash = () => computeArtifactInputBindingHash(sourcePaths, {ignoredDirectoryNames: ["node_modules"]});
        const currentSource = () => ({
            kind: "tsPackage" as const,
            canonicalLocation: path.resolve(packageRoot),
            recognitionProvenance: "CLI runnable POKIE package input",
            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
            configurationProvenance: {
                configurationHash: sourceBindingHash(),
                pokieVersion: this.pokieVersion,
                generationSemantics: resolvedRequest.preflight.strategy === "exact" ? "exact" as const : "boundedSample" as const,
                ...(resolvedRequest.preflight.strategy === "exact" ? {} : {
                    sampleCount: String(resolvedRequest.preflight.sample!.sampleSize),
                    sampleSeed: resolvedRequest.preflight.sample!.seed,
                }),
            },
        });
        const rawOutput = resolvedRequest.preflight.destination?.path;
        let publishedOutput = false;
        return {
            plan: this.planner.planRawOutcomeLibraryJsonPublication(currentSource(), rawOutput),
            execution: {
                currentSource,
                currentDestination: () => rawOutput,
                read: async () => {
                    await this.assertGenerationSourceIsRunnable(packageRoot);
                    const game = await this.loadGame(packageRoot);
                    const resumeFrom = options.resume !== undefined && this.fileExists(options.resume) ? this.readCheckpoint(options.resume) : undefined;
                    // Rebind the live package immediately before generation;
                    // a config change after planning cannot inherit the old
                    // request's provenance merely because its destination is
                    // still the same bound publication identity.
                    const reboundRequest = prepareOutcomeLibraryGenerationFromEstimate(this.estimateSpace(game),
                        this.createGenerationRequest(game, packageRoot, options, sampling, signal, resumeFrom),
                    );
                    if (
                        reboundRequest.configHash !== resolvedRequest.configHash ||
                        reboundRequest.preflight.destination?.path !== rawOutput ||
                        reboundRequest.preflight.strategy !== resolvedRequest.preflight.strategy ||
                        reboundRequest.preflight.maxExactOutcomeSpaceSize !== resolvedRequest.preflight.maxExactOutcomeSpaceSize ||
                        reboundRequest.preflight.sample?.sampleSize !== resolvedRequest.preflight.sample?.sampleSize ||
                        reboundRequest.preflight.sample?.seed !== resolvedRequest.preflight.sample?.seed
                    ) {
                        throw new WeightedOutcomeLibraryGenerationError(
                            "weighted-outcome-library-generation-configuration-conflict",
                            "The loaded package configuration or output destination changed after preflight. Re-run generation from a fresh preflight.",
                        );
                    }
                    return this.generate(reboundRequest);
                },
                canPublish: () => rawOutput !== undefined,
                // Generation can take long enough for another actor to create
                // the prepared output after read() rebound the request. Re-run
                // the *same* resolved domain contract at the final durable
                // publication boundary; never let the raw writer overwrite
                // that late-created destination.
                assertDestinationAvailable: () => {
                    if (rawOutput === undefined) return;
                    const reboundDestination = resolveOutcomeLibraryGenerationDestination(
                        rawOutput,
                        resolvedRequest.preflight.destination?.safety,
                    );
                    if (reboundDestination?.path !== rawOutput) {
                        throw new WeightedOutcomeLibraryGenerationError(
                            "weighted-outcome-library-generation-destination-conflict",
                            "The output destination changed after preflight. Re-run generation from a fresh preflight.",
                        );
                    }
                },
                publish: (result: GenerateExactWeightedOutcomeLibraryResult) => {
                    // The operation has already established a fresh destination.
                    // Keep the legacy injectable writer so test and embedding
                    // callers retain their narrow file-system boundary.
                    this.writeFile(rawOutput!, JSON.stringify(result.library, null, 4));
                    publishedOutput = true;
                },
                rollback: () => {
                    if (publishedOutput && rawOutput !== undefined) this.removeFile(rawOutput);
                },
                cleanup: ({error}: {readonly error?: unknown}) => {
                    if (error === undefined && options.resume !== undefined && this.fileExists(options.resume)) this.removeFile(options.resume);
                },
                onTerminalFailure: (error: unknown) => {
                    if (resolvedRequest.preflight.strategy === "exact" && error instanceof WeightedOutcomeLibraryGenerationCancelledError && options.resume !== undefined) {
                        this.writeFile(options.resume, JSON.stringify(this.serializeCheckpoint(error.checkpoint), null, 4));
                    }
                },
                signal,
            },
        };
    }

    /**
     * Generation is normally given a package directory, for which the runtime
     * loader remains the authoritative validation boundary. A `.wasm` input is
     * different: it must be resolved through the product contract first so a
     * compatible component, or any sidecar failure, can never reach that
     * loader. Keeping this narrow also preserves injectable package fixtures
     * used by the command's ordinary package-generation tests.
     */
    private async assertGenerationSourceIsRunnable(packageRoot: string): Promise<void> {
        if (path.extname(packageRoot).toLowerCase() !== ".wasm") return;

        const project = await new ProjectTargetResolver().resolve(packageRoot);
        if (project?.type !== "wasm") return;
        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_LIBRARY_GENERATE_OPERATION);
        if (diagnostic !== undefined) throw new Error(diagnostic.message);
    }

    // --estimate/--dry-run: the cheap, non-enumerating dry run over estimateExactOutcomeSpaceSize --
    // reads reel-strip sizes only, never sweeps a single reel-stop tuple or plays a round. Reports
    // exactly which strategy a real "generate" run would resolve to given the same --max-outcome-space-size/
    // --bounded flags, so a caller can decide whether to opt into --bounded before committing to a full run.
    private executeEstimate(game: PokieGame, options: GenerateCliOptions, request: OutcomeLibraryGenerationRequest): number {
        let resolvedRequest: ResolvedOutcomeLibraryGenerationRequest;
        try {
            resolvedRequest = prepareOutcomeLibraryGenerationFromEstimate(this.estimateSpace(game), request);
        } catch (error) {
            if (error instanceof WeightedOutcomeLibraryGenerationError) {
                console.error(`Cannot estimate "${game.getManifest().id}"'s exact outcome space (${error.getCode()}): ${error.message}`);
                return 1;
            }
            throw error;
        }

        const {preflight} = resolvedRequest;
        const {estimate} = preflight;
        const sample = preflight.sample;
        const report = {
            game: game.getManifest(),
            reelsNumber: estimate.reelsNumber,
            reelsSymbolsNumber: estimate.reelsSymbolsNumber,
            reelSizes: estimate.reelSizes,
            totalOutcomeSpaceSize: formatBigIntSafely(estimate.totalOutcomeSpaceSize),
            maxOutcomeSpaceSize: formatBigIntSafely(preflight.maxExactOutcomeSpaceSize),
            strategy: preflight.strategy,
            requiresBounded: preflight.requiresSampledOptIn,
            expectedRawWork: formatBigIntSafely(preflight.expectedRawWork),
            warnings: preflight.warnings,
            ...(sample !== undefined ? {sampleSize: formatBigIntSafely(sample.sampleSize), seed: sample.seed} : {}),
        };

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            console.log(`Estimated exact outcome space for "${report.game.id}":`);
            console.log(`  reels             ${report.reelsNumber} (visible symbols/reel: ${report.reelsSymbolsNumber})`);
            console.log(`  reel sizes        ${report.reelSizes.join(", ")}`);
            console.log(`  total raw space   ${report.totalOutcomeSpaceSize}`);
            console.log(`  strategy          ${report.strategy}${report.requiresBounded ? " (requires --sample <n> --seed <string>)" : ""}`);
        }

        return 0;
    }

    // --sample is the preferred explicit sampled workflow; its count and seed are an all-or-nothing
    // choice.  --bounded/--sample-size stays compatible with callers that only want sampling after the
    // exact-space cap is exceeded.  Every incomplete or mixed form fails before package I/O.
    private buildSampledOptions(options: GenerateCliOptions): {sampled?: {sampleSize: bigint; seed: string}; bounded?: {sampleSize: bigint; seed: string}} {
        const {bounded, exact, sample, sampleSize, seed} = options;
        if (exact && (sample !== undefined || bounded || sampleSize !== undefined || seed !== undefined)) {
            throw new Error(`--exact cannot be combined with sampled-generation options. ${GENERATE_USAGE}`);
        }
        if (sample !== undefined) {
            if (bounded || sampleSize !== undefined) {
                throw new Error(`--sample cannot be combined with --bounded or --sample-size. ${GENERATE_USAGE}`);
            }
            if (seed === undefined) {
                throw new Error(`--sample requires --seed. ${GENERATE_USAGE}`);
            }
            return {sampled: {sampleSize: sample, seed}};
        }
        if (!bounded) {
            if (sampleSize !== undefined || seed !== undefined) {
                throw new Error(`--sample-size and --seed require --bounded (legacy) or --sample <n>. ${GENERATE_USAGE}`);
            }
            return {};
        }
        if (sampleSize === undefined || seed === undefined) {
            throw new Error(`--bounded requires both --sample-size and --seed. ${GENERATE_USAGE}`);
        }
        return {bounded: {sampleSize, seed}};
    }

    /** The CLI grammar is a compatibility adapter; the generator only receives the public domain request. */
    private createGenerationRequest(
        game: PokieGame,
        packageRoot: string,
        options: GenerateCliOptions,
        sampling: {sampled?: {sampleSize: bigint; seed: string}; bounded?: {sampleSize: bigint; seed: string}},
        signal?: AbortSignal,
        resumeFrom?: ExactEnumerationCheckpoint,
    ): OutcomeLibraryGenerationRequest {
        const sample = sampling.sampled ?? sampling.bounded;
        let generation: OutcomeLibraryGenerationRequest["generation"] = "default";
        if (options.exact) generation = "exact";
        else if (sampling.sampled !== undefined) generation = "sampled";
        else if (sampling.bounded !== undefined) generation = "bounded";
        return {
            libraryId: options.libraryId ?? `${game.getManifest().id}${options.mode !== undefined ? `-${options.mode}` : ""}`,
            game,
            pokieVersion: this.pokieVersion,
            generation,
            // This remains a compatibility assertion only. The shared domain
            // preparation derives the loaded hash and rejects a mismatch.
            ...(options.configHash === undefined ? {} : {configHash: options.configHash}),
            ...(options.mode === undefined ? {} : {mode: options.mode}),
            ...(options.stake === undefined ? {} : {stake: options.stake}),
            ...(options.maxOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: options.maxOutcomeSpaceSize}),
            ...(sample === undefined ? {} : {sample}),
            ...(options.out === undefined ? {} : {
                outputDestination: options.out,
                outputDestinationSafety: {sourcePath: packageRoot, kind: "file", requireAvailable: true},
            }),
            ...(resumeFrom === undefined ? {} : {resumeFrom}),
            ...(signal === undefined ? {} : {signal}),
            ...(options.progress ? {onProgress: (processedRawIndex: bigint, progressTotal: bigint) => console.error(`  progress  ${processedRawIndex} / ${progressTotal}`)} : {}),
        };
    }

    private printGenerateResult(result: GenerateExactWeightedOutcomeLibraryResult, options: GenerateCliOptions): void {
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
        const cancellation = new AbortController();
        const onCancel = () => cancellation.abort();
        this.process.once("SIGINT", onCancel);
        const prepared = this.prepareDescriptorBuildOperation(configPath, outDir, cancellation.signal);
        const execution = await this.planner.executeConversionPlan(prepared.plan, prepared.execution).finally(() => this.process.off("SIGINT", onCancel));
        const result = execution.publication!;
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

    /**
     * Supplies the descriptor reader/writer to a caller-owned prepared operation.
     * This is deliberately not a command dispatch surface: ExportCommand uses the
     * returned plan and execution hooks directly, so it cannot delegate to a
     * second public CLI command after its source was prepared.
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering -- exposed as a format adapter for ExportCommand
    public prepareDescriptorBuildOperation(configPath: string, outDir: string, signal?: AbortSignal) {
        const currentSource = () => this.buildDescriptorSource(configPath);
        return {plan: this.planner.planIdentity(currentSource(), "outcomeLibrary", {destinationPath: outDir}), validate: () => this.validateBuildSource(configPath), execution: {
            currentSource,
            read: () => {
                const descriptor = this.loadDescriptor(configPath);
                const configDir = path.dirname(configPath);
                const modes: OutcomeLibraryBundleModeInput[] = descriptor.modes.map((entry) => entry.libraryPath !== undefined
                    ? (() => {
                        const library = this.loadJson(path.resolve(configDir, entry.libraryPath!)) as WeightedOutcomeLibrary;
                        return {modeName: entry.modeName, libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes};
                    })()
                    : {
                        modeName: entry.modeName,
                        libraryId: entry.libraryId as string,
                        schemaVersion: entry.schemaVersion,
                        outcomes: this.streamOutcomes(path.resolve(configDir, entry.outcomesPath as string)),
                    });
                return modes;
            },
            canPublish: () => true,
            assertDestinationAvailable: () => {
                const destination = new ArtifactBuilderRegistry(this.pokieVersion).checkDestination("outcomeLibrary", outDir, configPath);
                if (!destination.available) throw new Error(destination.message);
            },
            publish: (modes) => this.writer.writeToDirectory(modes, outDir),
            rollback: () => fs.promises.rm(outDir, {recursive: true, force: true}),
            ...(signal === undefined ? {} : {signal}),
        }};
    }

    private buildDescriptorSource(configPath: string): import("pokie").ArtifactIdentity {
        const canonicalLocation = path.resolve(configPath);
        const descriptor = this.loadDescriptor(canonicalLocation);
        const referencedInputs = descriptor.modes.map((entry) => path.resolve(
            path.dirname(canonicalLocation), entry.libraryPath ?? entry.outcomesPath!,
        ));
        return {
            kind: "outcomeLibrary",
            canonicalLocation,
            recognitionProvenance: "verified CLI Outcome Library build descriptor",
            capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
            configurationProvenance: {configurationHash: computeArtifactInputBindingHash([canonicalLocation, ...referencedInputs])},
        };
    }

    private async readStreamedOutcomes(filePath: string): Promise<WeightedOutcomeInput[]> {
        const outcomes: WeightedOutcomeInput[] = [];
        for await (const outcome of this.streamOutcomes(filePath)) {
            outcomes.push(outcome);
        }
        return outcomes;
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

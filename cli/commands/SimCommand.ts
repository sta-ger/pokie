import {Command} from "commander";
import {
    BetMode,
    describeUnavailableArtifactOperation,
    loadPokieGame,
    MAX_SIMULATION_WORKERS,
    OutcomeSourceSimulationReport,
    OutcomeSourceSimulationResult,
    ParallelSimulationRunner,
    ParallelSimulationRunOptions,
    PokieGame,
    PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    simulateOutcomeSourceProject,
    SimulationConfig,
    SimulationConvergenceOptions,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
    SimulationReportSet,
    SIM_OPERATION,
    WeightedOutcomeRandomSource,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {writeOutputFileAtomically} from "./internal/writeOutputFile.js";
import {describeRuntimePackageLoadError} from "./internal/describeLocalRuntimeError.js";

type SimFormat = "summary" | "json";

type SimOptions = {
    packageRoot: string;
    rounds: number;
    seed?: string;
    out?: string;
    format: SimFormat;
    workers: number;
    mode?: string;
    // Opt-in adaptive early stop (see --min-rounds/--rtp-tolerance/--check-interval/--stable-checks) --
    // undefined unless the caller supplied all three required flags, in which case `rounds` becomes a
    // maximum rather than a fixed target.
    convergence?: SimulationConvergenceOptions;
};

// The shape Commander hands the action -- one property per declared option, camelCased from its own
// flag name (e.g. "--check-interval" -> checkInterval). Kept distinct from SimOptions, whose
// `convergence` field is a genuine cross-field business object buildConvergenceOptions() derives
// from four of these properties, not something Commander itself could ever produce.
type SimCliOptions = {
    rounds: number;
    seed?: string;
    workers: number;
    out?: string;
    format: SimFormat;
    mode?: string;
    minRounds?: number;
    rtpTolerance?: number;
    checkInterval?: number;
    stableChecks?: number;
};

// Deliberately the non-generic (T = string) instantiation of simulateOutcomeSourceProject's own signature --
// same rationale as OutcomeSourceCommand's own SampleFn/ReplayCommand's own ReplayOutcomeSourceFn: this command
// only ever deals in plain string outcome ids off the CLI.
type SimulateOutcomeSourceFn = (
    project: PokieProject,
    modeName: string,
    rounds: number,
    randomSource: WeightedOutcomeRandomSource,
    seed?: string,
) => Promise<OutcomeSourceSimulationResult>;

// "--mode all" is a reserved mode id meaning "run every mode the game declares" (see runAllModes())
// rather than an actual bet mode -- a real game is very unlikely to ever declare a mode literally
// named "all", and this keeps the flag's grammar identical to --mode <betModeId> (one value, no new
// flag to parse) rather than inventing a whole separate --all-modes switch.
const ALL_MODES = "all";

const USAGE =
    "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] " +
    `[--mode <betModeId>|${ALL_MODES}] [--out <file>] [--format json] ` +
    "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]";

export class SimCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly reportBuilder: SimulationReportBuilding;
    // Overrides ParallelSimulationRunner's own default worker entry point — left undefined in every
    // real CLI invocation (cli/pokie.ts never sets it), since the library already knows how to find
    // its own bundled worker entry. Only tests (pointing at source rather than a built dist) supply
    // one.
    private readonly workerEntryUrl: URL | undefined;
    private readonly createParallelSimulationRunner: (
        packageRoot: string,
        rounds: number,
        options: ParallelSimulationRunOptions,
    ) => ParallelSimulationRunner;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.loadGame
    // (or a spawned simulation worker, which never sees this.loadGame at all -- see runSingleMode()) ever
    // touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op passthrough so
    // every existing caller/test keeps behaving exactly as before this boundary existed; cli/pokie.ts wires
    // the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    // Decides, ahead of resolveRuntimePackageRoot/loadGame, whether packageRoot is a resolved
    // "outcomeLibrary"/"stakeAdapter" project -- see execute()'s own routing. Defaults to the real
    // ProjectTargetResolver so every caller gets this routing for free; a test can still inject a stub.
    private readonly resolveProject: ProjectResolving;
    // The canonical outcome-source selector/session path a resolved "outcomeLibrary" project's simulation is
    // actually served through -- see simulateOutcomeSourceProject's own doc comment. Never reaches loadGame/
    // ParallelSimulationRunner; a resolved "stakeAdapter" project's own missing-capability diagnostic comes back
    // through this same function's {supported: false} result instead.
    private readonly simulateOutcomeSource: SimulateOutcomeSourceFn;
    // Builds the WeightedOutcomeRandomSource simulateOutcomeSource draws through -- same seeded/secure choice
    // OutcomeSourceCommand's own "sample" verb makes, so "--seed" behaves identically everywhere a caller draws
    // from a canonical outcome source.
    private readonly buildRandomSource: (seed?: string) => WeightedOutcomeRandomSource;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        writeFile: (file: string, contents: string) => void = writeOutputFileAtomically,
        reportBuilder: SimulationReportBuilding = new SimulationReportBuilder(),
        workerEntryUrl: URL | undefined = undefined,
        createParallelSimulationRunner: (
            packageRoot: string,
            rounds: number,
            options: ParallelSimulationRunOptions,
        ) => ParallelSimulationRunner = (packageRoot, rounds, options) => new ParallelSimulationRunner(packageRoot, rounds, options),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        simulateOutcomeSource: SimulateOutcomeSourceFn = simulateOutcomeSourceProject,
        buildRandomSource: (seed?: string) => WeightedOutcomeRandomSource = (seed) =>
            seed !== undefined ? new SeededWeightedOutcomeRandomSource(seed) : new SecureWeightedOutcomeRandomSource(),
    ) {
        this.loadGame = loadGame;
        this.writeFile = writeFile;
        this.reportBuilder = reportBuilder;
        this.workerEntryUrl = workerEntryUrl;
        this.createParallelSimulationRunner = createParallelSimulationRunner;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.resolveProject = resolveProject;
        this.simulateOutcomeSource = simulateOutcomeSource;
        this.buildRandomSource = buildRandomSource;
    }

    public getName(): string {
        return "sim";
    }

    public getDescription(): string {
        return "Run a simulation against a POKIE game package and report RTP/hit-frequency/max win.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<void> {
        const command = this.buildCommand();

        try {
            await command.parseAsync(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => {
                    switch (flag) {
                        case "--rounds":
                            return `--rounds must be a positive integer. ${USAGE}`;
                        case "--seed":
                            return `--seed requires a value. ${USAGE}`;
                        case "--workers":
                            return `--workers must be an integer between 1 and ${MAX_SIMULATION_WORKERS}. ${USAGE}`;
                        case "--out":
                            return `--out requires a file path. ${USAGE}`;
                        case "--format":
                            return `--format only supports "json". ${USAGE}`;
                        case "--mode":
                            return `--mode requires a bet mode id. ${USAGE}`;
                        case "--min-rounds":
                            return `--min-rounds must be a non-negative integer. ${USAGE}`;
                        case "--rtp-tolerance":
                            return `--rtp-tolerance must be a positive number. ${USAGE}`;
                        case "--check-interval":
                            return `--check-interval must be a positive integer. ${USAGE}`;
                        case "--stable-checks":
                            return `--stable-checks must be a positive integer. ${USAGE}`;
                        default:
                            return `Unknown option "${flag}". ${USAGE}`;
                    }
                },
            });
        }
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart.
    private buildCommand(): Command {
        return createCommanderCliCommand("sim")
            .description(this.getDescription())
            .argument("<packageRoot>", "an existing POKIE game package, or a native outcome-library bundle (with --mode)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--rounds <number>", `number of rounds to simulate (default: ${SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS})`, (value: string): number => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed <= 0) {
                    throw new Error(`--rounds must be a positive integer. ${USAGE}`);
                }
                return parsed;
            }, SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS)
            .option("--seed <string>", "seed for a reproducible simulation (default: a random seed)")
            .option(
                "--workers <number>",
                `number of parallel worker threads, 1-${MAX_SIMULATION_WORKERS} (default: 1)`,
                (value: string): number => {
                    const parsed = Number(value);
                    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SIMULATION_WORKERS) {
                        throw new Error(`--workers must be an integer between 1 and ${MAX_SIMULATION_WORKERS}. ${USAGE}`);
                    }
                    return parsed;
                },
                1,
            )
            .option("--out <file>", "write the simulation report JSON to this path")
            .option(
                "--format <format>",
                "only \"json\" is supported (default: a human-readable summary)",
                (value: string): SimFormat => {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${USAGE}`);
                    }
                    return "json";
                },
                "summary" as SimFormat,
            )
            .option("--mode <betModeId>", `bet mode to simulate (default: the game's own default bet mode; or "${ALL_MODES}" for every declared mode)`)
            .option("--min-rounds <number>", "adaptive convergence: minimum rounds before checking for stability (requires --rtp-tolerance/--check-interval)", (value: string): number => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    throw new Error(`--min-rounds must be a non-negative integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--rtp-tolerance <number>", "adaptive convergence: acceptable RTP half-width (requires --min-rounds/--check-interval)", (value: string): number => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    throw new Error(`--rtp-tolerance must be a positive number. ${USAGE}`);
                }
                return parsed;
            })
            .option("--check-interval <number>", "adaptive convergence: how often (in rounds) to check for stability (requires --min-rounds/--rtp-tolerance)", (value: string): number => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed <= 0) {
                    throw new Error(`--check-interval must be a positive integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--stable-checks <number>", "adaptive convergence: consecutive stable checks required (default: 1; requires the other three convergence flags)", (value: string): number => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed <= 0) {
                    throw new Error(`--stable-checks must be a positive integer. ${USAGE}`);
                }
                return parsed;
            })
            .action(async (packageRoot: string, excess: string[], rawOptions: SimCliOptions) => {
                // An empty-string positional ("pokie sim ''") is present as far as Commander's own
                // required-argument check is concerned, but the pre-Commander behavior this preserves
                // treated it the same as an entirely missing one (`!packageRoot`).
                if (!packageRoot) {
                    throw new Error(USAGE);
                }
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                }

                const convergence = this.buildConvergenceOptions(
                    rawOptions.minRounds,
                    rawOptions.rtpTolerance,
                    rawOptions.checkInterval,
                    rawOptions.stableChecks,
                );

                await this.execute({
                    packageRoot,
                    rounds: rawOptions.rounds,
                    seed: rawOptions.seed,
                    out: rawOptions.out,
                    format: rawOptions.format,
                    workers: rawOptions.workers,
                    mode: rawOptions.mode,
                    convergence,
                });
            });
    }

    // The original run()'s own business logic, unchanged -- only its entry point moved, from directly
    // inside run() to here, called from the Commander action once packageRoot/options are parsed.
    private async execute(options: SimOptions): Promise<void> {
        // A resolved "outcomeLibrary"/"stakeAdapter" project is routed through the outcome-source selector
        // path below instead -- neither ever reaches resolveRuntimePackageRoot/loadGame (see
        // simulateOutcomeSourceProject's own doc comment on why a "stakeAdapter" export can't be sampled at
        // all). A path that doesn't resolve to either of those two types -- including one ProjectResolving
        // doesn't recognize as any known project at all -- falls through to the original, unaffected
        // materialize-and-load flow.
        let project: PokieProject | undefined;
        try {
            project = await this.resolveProject.resolve(options.packageRoot);
        } catch (error) {
            throw describeRuntimePackageLoadError(options.packageRoot, error);
        }
        if (project !== undefined && (project.type === "outcomeLibrary" || project.type === "stakeAdapter")) {
            await this.runOutcomeSourceSim(project, options);
            return;
        }
        if (project?.type === "wasm") {
            const diagnostic = describeUnavailableArtifactOperation(project, SIM_OPERATION);
            if (diagnostic !== undefined) throw new UnsupportedProjectOperationError(diagnostic);
        }

        // Crossed exactly once per invocation -- every downstream step (the metadata load below,
        // runSingleMode()/runAllModes(), and the packageRoot ParallelSimulationRunner hands to its own
        // worker threads) reuses this same resolved runtimePath instead of re-resolving/re-materializing
        // options.packageRoot itself. This is also what makes --workers > 1 work for a Blueprint: a worker
        // thread can't receive this.loadGame as a closure (see ParallelSimulationRunner's own worker
        // entry), but it can receive a plain, already-materialized real package path.
        const resolution = await this.resolveRuntimePackageRoot(options.packageRoot);
        try {
            await this.executeAgainstRuntimePackage({...options, packageRoot: resolution.runtimePath});
        } finally {
            await resolution.release();
        }
    }

    private async runOutcomeSourceSim(project: PokieProject, options: SimOptions): Promise<void> {
        if (!options.mode || options.mode === ALL_MODES) {
            throw new Error(`--mode <modeName> is required to simulate a native outcome-library project. ${USAGE}`);
        }
        if (options.seed !== undefined && options.seed.trim().length === 0) {
            throw new Error("--seed must be a non-empty string for an exactly replayable outcome-library simulation. Omit --seed for a best-effort secure simulation.");
        }

        const result = await this.simulateOutcomeSource(
            project,
            options.mode,
            options.rounds,
            this.buildRandomSource(options.seed),
            options.seed,
        );
        if (!result.supported) {
            throw new UnsupportedProjectOperationError(result.diagnostic);
        }

        const report = result.report;
        if (options.out) {
            this.writeReport(options.out, JSON.stringify(report, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printOutcomeSourceSummary(report);
        }
        if (options.out) {
            this.printReportDestination(options.out, options.format === "json");
        }
    }

    private printOutcomeSourceSummary(report: OutcomeSourceSimulationReport): void {
        const statistics = report.statistics;
        console.log(`Simulated outcome library "${report.libraryId}" (hash "${report.libraryHash}"), mode "${report.modeName}"`);
        console.log(`  rounds          ${statistics.rounds}`);
        if (report.seed !== undefined) {
            console.log(`  seed            ${report.seed}`);
        }
        console.log(`  total bet       ${statistics.totalBet.toFixed(2)}`);
        console.log(`  total win       ${statistics.totalPayout.toFixed(2)}`);
        console.log(`  rtp             ${(statistics.rtp * 100).toFixed(2)}%`);
        console.log(`  hit frequency   ${((statistics.hitCount / statistics.rounds) * 100).toFixed(2)}%`);
        console.log(`  max win         ${statistics.maxWin.toFixed(2)}`);
        console.log(`  duration        ${report.durationMs}ms`);
    }

    private async executeAgainstRuntimePackage(options: SimOptions): Promise<void> {
        // Loaded once up front regardless of path (single mode, no mode, or --mode all) purely to read
        // the package's own declarative getBetModes() -- optional/feature-detected, exactly like every
        // other PokieGame capability -- for mode discovery (--mode all) and each mode's targetRtp.
        // ParallelSimulationRunner loads the package again itself (in-process or per worker thread) to
        // actually run rounds; that's unrelated and unaffected by this extra, cheap metadata-only load.
        const game = await this.loadGame(options.packageRoot);
        const declaredModes = game.getBetModes?.();

        if (options.mode === ALL_MODES) {
            await this.runAllModes(options, declaredModes);
            return;
        }

        const targetRtp = options.mode !== undefined ? declaredModes?.find((mode) => mode.id === options.mode)?.targetRtp : undefined;
        const report = await this.runSingleMode(options, options.mode, targetRtp);

        if (options.out) {
            this.writeReport(options.out, JSON.stringify(report, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printSummary(report);
        }
        if (options.out) {
            this.printReportDestination(options.out, options.format === "json");
        }
    }

    // Extracted so runAllModes() can run the exact same pipeline once per declared mode, rather than
    // reimplementing any part of it -- the only thing that differs between "--mode <id>" and
    // "--mode all" is how many times, and with which ids, this gets called.
    private async runSingleMode(options: SimOptions, modeId: string | undefined, targetRtp: number | undefined): Promise<SimulationReport> {
        const startedAt = Date.now();
        // workers===1 runs fully in-process (using this.loadGame, so an injected in-memory fake game
        // keeps working exactly as before --workers existed); workers>1 always (re)loads the package
        // for real inside separate worker threads — see ParallelSimulationRunner's own doc comment.
        const runner = this.createParallelSimulationRunner(options.packageRoot, options.rounds, {
            seed: options.seed,
            workers: options.workers,
            loadGame: this.loadGame,
            workerEntryUrl: this.workerEntryUrl,
            betModeId: modeId,
            convergence: options.convergence,
        });
        const result = await runner.run();
        const durationMs = Date.now() - startedAt;

        return this.reportBuilder.build({
            manifest: result.manifest,
            requestedRounds: options.rounds,
            seed: options.seed,
            statistics: result.statistics,
            durationMs,
            packageRoot: options.packageRoot,
            breakdown: result.breakdown,
            jackpot: result.jackpot,
            workers: result.workers,
            workerSeedStrategy: result.workerSeedStrategy,
            betMode: result.betMode,
            targetRtp,
            stopReason: result.stopReason,
            convergence: result.convergence,
        });
    }

    // Runs a full, independent simulation for EVERY mode the game declares (one full --rounds run
    // each, exactly as if "--mode <id>" had been invoked separately per mode -- see runSingleMode())
    // and bundles the results into a SimulationReportSet. Deliberately never computes any combined/
    // blended RTP or totals across modes -- see SimulationReportSet's own doc comment on why that
    // would be a made-up number without real traffic/player-selection weights.
    private async runAllModes(options: SimOptions, declaredModes: BetMode[] | undefined): Promise<void> {
        if (!declaredModes || declaredModes.length === 0) {
            throw new Error(
                `--mode ${ALL_MODES} requires the game package to declare its bet modes via getBetModes() -- ` +
                    `"${options.packageRoot}" doesn't. ${USAGE}`,
            );
        }

        const modes: Record<string, SimulationReport> = {};
        for (const declared of declaredModes) {
            modes[declared.id] = await this.runSingleMode(options, declared.id, declared.targetRtp);
        }

        const reportSet: SimulationReportSet = {
            game: Object.values(modes)[0].game,
            requestedRounds: options.rounds,
            seed: options.seed ?? null,
            workers: options.workers,
            modes,
        };

        if (options.out) {
            this.writeReport(options.out, JSON.stringify(reportSet, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(reportSet, null, 4));
        } else {
            Object.entries(modes).forEach(([modeId, report]) => {
                console.log(`\n=== Mode: ${modeId} ===`);
                this.printSummary(report);
            });
        }
        if (options.out) {
            this.printReportDestination(options.out, options.format === "json");
        }
    }

    private writeReport(file: string, contents: string): void {
        try {
            this.writeFile(file, contents);
        } catch (error) {
            throw new Error(
                `Could not write simulation report to "${file}": ${error instanceof Error ? error.message : String(error)}. ` +
                "Choose an existing writable directory and try --out <file> again.",
            );
        }
    }

    private printReportDestination(file: string, machineReadable: boolean): void {
        // A caller can pipe `pokie sim --format json` to JSON.parse even when it also persists --out.
        (machineReadable ? console.error : console.log)(`\nReport written to "${file}".`);
    }

    // --min-rounds/--rtp-tolerance/--check-interval must all be given together to enable adaptive
    // convergence (opt-in as a group, not individually) -- --stable-checks is optional but meaningless
    // on its own, so it requires the other three too. Any other combination is a usage error rather
    // than silently ignored, so a caller who mistyped one flag name finds out immediately.
    private buildConvergenceOptions(
        minRounds: number | undefined,
        rtpTolerance: number | undefined,
        checkIntervalRounds: number | undefined,
        stableChecks: number | undefined,
    ): SimulationConvergenceOptions | undefined {
        const requiredFlagsGiven = [minRounds, rtpTolerance, checkIntervalRounds].filter((value) => value !== undefined).length;

        if (requiredFlagsGiven === 0) {
            if (stableChecks !== undefined) {
                throw new Error(
                    `--stable-checks requires --min-rounds, --rtp-tolerance and --check-interval to also be set. ${USAGE}`,
                );
            }
            return undefined;
        }

        if (requiredFlagsGiven < 3) {
            throw new Error(
                `--min-rounds, --rtp-tolerance and --check-interval must all be provided together to enable adaptive convergence. ${USAGE}`,
            );
        }

        return {
            minRounds: minRounds as number,
            rtpTolerance: rtpTolerance as number,
            checkIntervalRounds: checkIntervalRounds as number,
            stableChecks,
        };
    }

    private printSummary(report: SimulationReport): void {
        console.log(`Simulated "${report.game.name}" (id: "${report.game.id}", v${report.game.version})`);
        const roundsSuffix = report.rounds !== report.requestedRounds ? ` (requested ${report.requestedRounds})` : "";
        console.log(`  rounds          ${report.rounds}${roundsSuffix}`);
        if (report.seed !== null) {
            console.log(`  seed            ${report.seed}`);
        }
        if (report.betMode !== undefined) {
            console.log(`  bet mode        ${report.betMode}`);
        }
        console.log(`  workers         ${report.workers ?? 1}`);
        console.log(`  total bet       ${report.totalBet.toFixed(2)}`);
        console.log(`  total win       ${report.totalWin.toFixed(2)}`);
        console.log(`  rtp             ${(report.rtp * 100).toFixed(2)}%`);
        if (report.targetRtp !== undefined) {
            console.log(`  target rtp      ${(report.targetRtp * 100).toFixed(2)}%`);
            console.log(`  rtp deviation   ${((report.rtpDeviation as number) * 100).toFixed(2)} pp`);
        }
        console.log(`  hit frequency   ${(report.hitFrequency * 100).toFixed(2)}%`);
        console.log(`  average payout  ${(report.averagePayout ?? 0).toFixed(2)}`);
        console.log(`  max win         ${report.maxWin.toFixed(2)}`);
        if (report.volatility !== undefined) {
            console.log(`  volatility      ${report.volatility.toFixed(2)}`);
        }
        if (report.maxWinFrequency !== undefined) {
            console.log(`  max win freq.   ${(report.maxWinFrequency * 100).toFixed(4)}%`);
        }
        console.log(`  duration        ${report.durationMs}ms (${report.spinsPerSecond} spins/s)`);
        if (report.stopReason && report.stopReason !== "maxRounds") {
            console.log(`  stop reason     ${report.stopReason}`);
        }
        if (report.convergence) {
            const c = report.convergence;
            console.log(
                `  convergence     minRounds ${c.minRounds}, rtpTolerance ${(c.rtpTolerance * 100).toFixed(2)}pp, ` +
                    `checkInterval ${c.checkIntervalRounds}, checks ${c.checksPerformed}, ` +
                    `stable ${c.consecutiveStableChecks}/${c.stableChecks}, achieved half-width ${(c.achievedRtpHalfWidth * 100).toFixed(3)}pp`,
            );
        }

        if (report.breakdown) {
            console.log("\nBreakdown:");
            Object.entries(report.breakdown.components).forEach(([category, component]) => {
                console.log(
                    `  ${category.padEnd(14)}rounds ${component.rounds}, rtp ${(component.rtp * 100).toFixed(2)}%, ` +
                        `contribution ${(component.contribution * 100).toFixed(2)} pp, ` +
                        `hit frequency ${(component.hitFrequency * 100).toFixed(2)}%, max win ${component.maxWin.toFixed(2)}`,
                );
            });
        }

        if (report.jackpot) {
            console.log(
                `\nJackpot: awards ${report.jackpot.awardCount}, total awarded ${report.jackpot.totalAwarded.toFixed(2)}, ` +
                    `total contributed ${report.jackpot.totalContributed.toFixed(2)}, contribution ${(report.jackpot.contribution * 100).toFixed(4)}pp`,
            );
            Object.entries(report.jackpot.pools).forEach(([poolId, pool]) => {
                console.log(
                    `  ${poolId.padEnd(14)}awards ${pool.awardCount}, total awarded ${pool.totalAwarded.toFixed(2)}, ` +
                        `contribution ${(pool.contribution * 100).toFixed(4)}pp`,
                );
            });
        }

        // The JSON artifact has always preserved warnings, but the default CLI summary is also a
        // decision surface: hiding a low-sample or non-reproducible-run warning there makes a
        // completed command look more conclusive than its report actually is. Keep the exact
        // persisted messages visible, rather than attempting to maintain a second warning policy.
        if (report.warnings && report.warnings.length > 0) {
            console.log("\nWarnings:");
            report.warnings.forEach((warning) => console.log(`  - ${warning}`));
        }
    }
}

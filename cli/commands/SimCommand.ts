import {
    BetMode,
    loadPokieGame,
    MAX_SIMULATION_WORKERS,
    ParallelSimulationRunner,
    ParallelSimulationRunOptions,
    PokieGame,
    SimulationConfig,
    SimulationConvergenceOptions,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
    SimulationReportSet,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";

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

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        reportBuilder: SimulationReportBuilding = new SimulationReportBuilder(),
        workerEntryUrl: URL | undefined = undefined,
        createParallelSimulationRunner: (
            packageRoot: string,
            rounds: number,
            options: ParallelSimulationRunOptions,
        ) => ParallelSimulationRunner = (packageRoot, rounds, options) => new ParallelSimulationRunner(packageRoot, rounds, options),
    ) {
        this.loadGame = loadGame;
        this.writeFile = writeFile;
        this.reportBuilder = reportBuilder;
        this.workerEntryUrl = workerEntryUrl;
        this.createParallelSimulationRunner = createParallelSimulationRunner;
    }

    public getName(): string {
        return "sim";
    }

    public getDescription(): string {
        return "Run a simulation against a POKIE game package and report RTP/hit-frequency/max win.";
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);
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
            this.writeFile(options.out, JSON.stringify(report, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(report, null, 4));
        } else {
            this.printSummary(report);
            if (options.out) {
                console.log(`\nReport written to "${options.out}".`);
            }
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
            this.writeFile(options.out, JSON.stringify(reportSet, null, 4));
        }

        if (options.format === "json") {
            console.log(JSON.stringify(reportSet, null, 4));
        } else {
            Object.entries(modes).forEach(([modeId, report]) => {
                console.log(`\n=== Mode: ${modeId} ===`);
                this.printSummary(report);
            });
            if (options.out) {
                console.log(`\nReport written to "${options.out}".`);
            }
        }
    }

    private parseArgs(args: string[]): SimOptions {
        const [packageRoot, ...rest] = args;
        if (!packageRoot) {
            throw new Error(USAGE);
        }

        let rounds = SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS;
        let seed: string | undefined;
        let out: string | undefined;
        let format: SimFormat = "summary";
        let workers = 1;
        let mode: string | undefined;
        let minRounds: number | undefined;
        let rtpTolerance: number | undefined;
        let checkIntervalRounds: number | undefined;
        let stableChecks: number | undefined;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--rounds": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed <= 0) {
                        throw new Error(`--rounds must be a positive integer. ${USAGE}`);
                    }
                    rounds = parsed;
                    i++;
                    break;
                }
                case "--seed": {
                    if (value === undefined) {
                        throw new Error(`--seed requires a value. ${USAGE}`);
                    }
                    seed = value;
                    i++;
                    break;
                }
                case "--workers": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SIMULATION_WORKERS) {
                        throw new Error(`--workers must be an integer between 1 and ${MAX_SIMULATION_WORKERS}. ${USAGE}`);
                    }
                    workers = parsed;
                    i++;
                    break;
                }
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${USAGE}`);
                    }
                    out = value;
                    i++;
                    break;
                }
                case "--format": {
                    if (value !== "json") {
                        throw new Error(`--format only supports "json". ${USAGE}`);
                    }
                    format = "json";
                    i++;
                    break;
                }
                case "--mode": {
                    if (value === undefined) {
                        throw new Error(`--mode requires a bet mode id. ${USAGE}`);
                    }
                    mode = value;
                    i++;
                    break;
                }
                case "--min-rounds": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
                        throw new Error(`--min-rounds must be a non-negative integer. ${USAGE}`);
                    }
                    minRounds = parsed;
                    i++;
                    break;
                }
                case "--rtp-tolerance": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isFinite(parsed) || parsed <= 0) {
                        throw new Error(`--rtp-tolerance must be a positive number. ${USAGE}`);
                    }
                    rtpTolerance = parsed;
                    i++;
                    break;
                }
                case "--check-interval": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed <= 0) {
                        throw new Error(`--check-interval must be a positive integer. ${USAGE}`);
                    }
                    checkIntervalRounds = parsed;
                    i++;
                    break;
                }
                case "--stable-checks": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed <= 0) {
                        throw new Error(`--stable-checks must be a positive integer. ${USAGE}`);
                    }
                    stableChecks = parsed;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        const convergence = this.buildConvergenceOptions(minRounds, rtpTolerance, checkIntervalRounds, stableChecks);

        return {packageRoot, rounds, seed, out, format, workers, mode, convergence};
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
    }
}

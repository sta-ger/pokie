import {loadPokieGame, PokieGame, SimulationConfig, SimulationReport, SimulationReportBuilder, SimulationReportBuilding} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {MAX_SIMULATION_WORKERS} from "../simulation/parallel/ParallelSimulationLimits.js";
import {ParallelSimulationRunner, ParallelSimulationRunOptions} from "../simulation/parallel/ParallelSimulationRunner.js";

type SimFormat = "summary" | "json";

type SimOptions = {
    packageRoot: string;
    rounds: number;
    seed?: string;
    out?: string;
    format: SimFormat;
    workers: number;
};

const USAGE =
    "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--out <file>] [--format json]";

export class SimCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly reportBuilder: SimulationReportBuilding;
    // Where the compiled simulationWorkerEntry.js lives — no default on purpose, same reason
    // ClientCommand/StudioCommand's clientRoot/studioRoot have none: resolving it needs
    // import.meta.url, which only works in cli/pokie.ts's real ESM build (see its
    // ownSimulationWorkerEntryUrl()). Only needed when --workers > 1 is actually requested; every
    // --workers 1 (the default) run never touches it (see ParallelSimulationRunner.runInProcess()).
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

        const startedAt = Date.now();
        // workers===1 runs fully in-process (using this.loadGame, so an injected in-memory fake game
        // keeps working exactly as before --workers existed); workers>1 always (re)loads the package
        // for real inside separate worker threads — see ParallelSimulationRunner's own doc comment.
        const runner = this.createParallelSimulationRunner(options.packageRoot, options.rounds, {
            seed: options.seed,
            workers: options.workers,
            loadGame: this.loadGame,
            workerEntryUrl: this.workerEntryUrl,
        });
        const result = await runner.run();
        const durationMs = Date.now() - startedAt;

        const report = this.reportBuilder.build({
            manifest: result.manifest,
            requestedRounds: options.rounds,
            seed: options.seed,
            statistics: result.statistics,
            durationMs,
            packageRoot: options.packageRoot,
            breakdown: result.breakdown,
            workers: result.workers,
            workerSeedStrategy: result.workerSeedStrategy,
        });

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
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {packageRoot, rounds, seed, out, format, workers};
    }

    private printSummary(report: SimulationReport): void {
        console.log(`Simulated "${report.game.name}" (id: "${report.game.id}", v${report.game.version})`);
        const roundsSuffix = report.rounds !== report.requestedRounds ? ` (requested ${report.requestedRounds})` : "";
        console.log(`  rounds          ${report.rounds}${roundsSuffix}`);
        if (report.seed !== null) {
            console.log(`  seed            ${report.seed}`);
        }
        console.log(`  workers         ${report.workers ?? 1}`);
        console.log(`  total bet       ${report.totalBet.toFixed(2)}`);
        console.log(`  total win       ${report.totalWin.toFixed(2)}`);
        console.log(`  rtp             ${(report.rtp * 100).toFixed(2)}%`);
        console.log(`  hit frequency   ${(report.hitFrequency * 100).toFixed(2)}%`);
        console.log(`  max win         ${report.maxWin.toFixed(2)}`);
        console.log(`  duration        ${report.durationMs}ms (${report.spinsPerSecond} spins/s)`);

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

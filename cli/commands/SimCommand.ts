import {AggregateSimulationRunner, loadPokieGame, PokieGame, PokieGameManifest, SimulationConfig, SimulationStatistics} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";

type SimFormat = "summary" | "json";

type SimOptions = {
    packageRoot: string;
    rounds: number;
    seed?: string;
    out?: string;
    format: SimFormat;
};

export type SimReport = {
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    rounds: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
};

const USAGE = "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--out <file>] [--format json]";

export class SimCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly writeFile: (file: string, contents: string) => void;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
    ) {
        this.loadGame = loadGame;
        this.writeFile = writeFile;
    }

    public getName(): string {
        return "sim";
    }

    public getDescription(): string {
        return "Run a simulation against a POKIE game package and report RTP/hit-frequency/max win.";
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);

        const game = await this.loadGame(options.packageRoot);
        const session = game.createSession(options.seed === undefined ? undefined : {seed: options.seed});
        // Simulations measure RTP/volatility, not risk of ruin — give the session a bankroll large
        // enough that `--rounds` is never truncated by running out of credits mid-run.
        session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

        const startedAt = Date.now();
        const statistics = new AggregateSimulationRunner(session, options.rounds).run().getStatistics();
        const durationMs = Date.now() - startedAt;

        const report = this.buildReport(game.getManifest(), options, statistics, durationMs);

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

        return {packageRoot, rounds, seed, out, format};
    }

    private buildReport(manifest: PokieGameManifest, options: SimOptions, statistics: SimulationStatistics, durationMs: number): SimReport {
        const spinsPerSecond = Math.round(statistics.rounds / (Math.max(durationMs, 1) / 1000));
        return {
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            requestedRounds: options.rounds,
            rounds: statistics.rounds,
            seed: options.seed ?? null,
            totalBet: statistics.totalBet,
            totalWin: statistics.totalPayout,
            rtp: statistics.rtp,
            hitFrequency: statistics.rounds > 0 ? statistics.hitCount / statistics.rounds : 0,
            maxWin: statistics.maxWin,
            durationMs,
            spinsPerSecond,
        };
    }

    private printSummary(report: SimReport): void {
        console.log(`Simulated "${report.game.name}" (id: "${report.game.id}", v${report.game.version})`);
        const roundsSuffix = report.rounds !== report.requestedRounds ? ` (requested ${report.requestedRounds})` : "";
        console.log(`  rounds          ${report.rounds}${roundsSuffix}`);
        if (report.seed !== null) {
            console.log(`  seed            ${report.seed}`);
        }
        console.log(`  total bet       ${report.totalBet.toFixed(2)}`);
        console.log(`  total win       ${report.totalWin.toFixed(2)}`);
        console.log(`  rtp             ${(report.rtp * 100).toFixed(2)}%`);
        console.log(`  hit frequency   ${(report.hitFrequency * 100).toFixed(2)}%`);
        console.log(`  max win         ${report.maxWin.toFixed(2)}`);
        console.log(`  duration        ${report.durationMs}ms (${report.spinsPerSecond} spins/s)`);
    }
}

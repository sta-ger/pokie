import {loadPokieGame, PokieGame, ReplayRecorder, ReplayRecording} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";

type ReplayOptions = {
    packageRoot: string;
    seed?: string;
    round: number;
    out?: string;
};

const USAGE = "Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]";

export class ReplayCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly recorder: ReplayRecording;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        recorder: ReplayRecording = new ReplayRecorder(),
    ) {
        this.loadGame = loadGame;
        this.writeFile = writeFile;
        this.recorder = recorder;
    }

    public getName(): string {
        return "replay";
    }

    public getDescription(): string {
        return "Best-effort replay of a single round (by seed + round index) from a POKIE game package.";
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);

        const game = await this.loadGame(options.packageRoot);
        const descriptor = this.recorder.record({game, seed: options.seed, round: options.round});
        const json = JSON.stringify(descriptor, null, 4);

        if (options.out) {
            this.writeFile(options.out, json);
        }

        console.log(json);
        if (options.out) {
            console.log(`\nReplay written to "${options.out}".`);
        }
    }

    private parseArgs(args: string[]): ReplayOptions {
        const [packageRoot, ...rest] = args;
        if (!packageRoot) {
            throw new Error(USAGE);
        }

        let seed: string | undefined;
        let round: number | undefined;
        let out: string | undefined;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--seed": {
                    if (value === undefined) {
                        throw new Error(`--seed requires a value. ${USAGE}`);
                    }
                    seed = value;
                    i++;
                    break;
                }
                case "--round": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed < 1) {
                        throw new Error(`--round must be a positive integer. ${USAGE}`);
                    }
                    round = parsed;
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
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        if (round === undefined) {
            throw new Error(`--round is required. ${USAGE}`);
        }

        return {packageRoot, seed, round, out};
    }
}

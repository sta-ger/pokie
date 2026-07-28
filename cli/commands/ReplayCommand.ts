import {loadPokieGame, PokieGame, ReplayRecorder, ReplayRecording} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

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

    // Commander declares/validates <packageRoot>, --seed/--out (unvalidated), --round (a custom parser
    // for a positive integer), and --format (validated to only accept "json", but per the original its
    // parsed value is never actually wired into anything else -- kept "validated but inert" here too).
    // --round is deliberately left a plain (non-required) option rather than Commander's own
    // .requiredOption() -- see the "required options" gotcha in CommanderCliAdapter.ts's callers -- so
    // its presence is checked manually in the action, in the same relative position (after all other
    // parsing/validation succeeds) the original's end-of-loop "if (round === undefined)" check occupied.
    // A trailing "[excess...]" catches any stray bare positional, matching the original loop's default
    // case treating any unmatched token as an "Unknown option".
    private parseArgs(args: string[]): ReplayOptions {
        let result: ReplayOptions | undefined;
        const command = createCommanderCliCommand("replay")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .option("--seed <string>")
            .option("--round <number>", "", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 1) {
                    throw new Error(`--round must be a positive integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--out <file>")
            .option("--format <format>", "", (value: string) => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${USAGE}`);
                }
                return value;
            })
            .action((packageRoot: string, excess: string[], options: {seed?: string; round?: number; out?: string; format?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                }
                if (options.round === undefined) {
                    throw new Error(`--round is required. ${USAGE}`);
                }
                result = {packageRoot, seed: options.seed, round: options.round, out: options.out};
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => {
                    switch (flag) {
                        case "--seed":
                            return `--seed requires a value. ${USAGE}`;
                        case "--round":
                            return `--round must be a positive integer. ${USAGE}`;
                        case "--out":
                            return `--out requires a file path. ${USAGE}`;
                        case "--format":
                            return `--format only supports "json". ${USAGE}`;
                        default:
                            return `Unknown option "${flag}". ${USAGE}`;
                    }
                },
            });
        }
        return result!;
    }
}

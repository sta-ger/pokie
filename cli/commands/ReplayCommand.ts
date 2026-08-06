import {Command} from "commander";
import {
    loadPokieGame,
    OutcomeSourceReplayResult,
    PokieGame,
    PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
    replayOutcomeSourceProject,
    ReplayRecorder,
    ReplayRecording,
} from "pokie";
import fs from "fs";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ReplayOptions = {
    packageRoot: string;
    seed?: string;
    round: number;
    out?: string;
    mode?: string;
};

// Deliberately the non-generic (T = string) instantiation of replayOutcomeSourceProject's own signature --
// same rationale as OutcomeSourceCommand's own SampleFn: this command only ever deals in plain string
// outcome ids off the CLI.
type ReplayOutcomeSourceFn = (project: PokieProject, modeName: string, seed: string, round: number) => Promise<OutcomeSourceReplayResult>;

const USAGE =
    "Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
    "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]";

export class ReplayCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly writeFile: (file: string, contents: string) => void;
    private readonly recorder: ReplayRecording;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.loadGame
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    // Decides, ahead of resolveRuntimePackageRoot/loadGame, whether packageRoot is a resolved
    // "outcomeLibrary"/"stakeAdapter" project -- see run()'s own routing. Defaults to the real
    // ProjectTargetResolver so every caller gets this routing for free; a test can still inject a stub.
    private readonly resolveProject: ProjectResolving;
    // The canonical outcome-source selector/session path a resolved "outcomeLibrary" project's replay is
    // actually served through -- see replayOutcomeSourceProject's own doc comment. Never reaches loadGame;
    // a resolved "stakeAdapter" project's own missing-capability diagnostic comes back through this same
    // function's {supported: false} result instead.
    private readonly replayOutcomeSource: ReplayOutcomeSourceFn;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        writeFile: (file: string, contents: string) => void = (file, contents) => fs.writeFileSync(file, contents, "utf-8"),
        recorder: ReplayRecording = new ReplayRecorder(),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        replayOutcomeSource: ReplayOutcomeSourceFn = replayOutcomeSourceProject,
    ) {
        this.loadGame = loadGame;
        this.writeFile = writeFile;
        this.recorder = recorder;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.resolveProject = resolveProject;
        this.replayOutcomeSource = replayOutcomeSource;
    }

    public getName(): string {
        return "replay";
    }

    public getDescription(): string {
        return "Best-effort replay of a single round (by seed + round index) from a POKIE game package.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<void> {
        let options: ReplayOptions;
        try {
            options = this.parseArgs(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw error;
        }

        // A resolved "outcomeLibrary"/"stakeAdapter" project is routed through the outcome-source selector
        // path below instead -- neither ever reaches resolveRuntimePackageRoot/loadGame (see
        // replayOutcomeSourceProject's own doc comment on why a "stakeAdapter" export can't be sampled at
        // all). A path that doesn't resolve to either of those two types -- including one ProjectResolving
        // doesn't recognize as any known project at all -- falls through to the original, unaffected
        // materialize-and-load flow.
        const project = await this.resolveProject.resolve(options.packageRoot);
        if (project !== undefined && (project.type === "outcomeLibrary" || project.type === "stakeAdapter")) {
            await this.runOutcomeSourceReplay(project, options);
            return;
        }

        const resolution = await this.resolveRuntimePackageRoot(options.packageRoot);
        let game: PokieGame;
        try {
            game = await this.loadGame(resolution.runtimePath);
        } finally {
            await resolution.release();
        }
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
    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read.
    private buildCommand(resultRef: {value?: ReplayOptions} = {}): Command {
        return createCommanderCliCommand("replay")
            .description(this.getDescription())
            .argument("<packageRoot>", "an existing POKIE game package, or a native outcome-library bundle (with --mode)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--seed <string>", "seed to replay against (required for a native outcome-library bundle)")
            .option("--round <number>", "round index to replay (required)", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 1) {
                    throw new Error(`--round must be a positive integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--out <file>", "write the replay descriptor JSON to this path")
            .option("--format <format>", "only \"json\" is supported (validated, but the output is always JSON)", (value: string) => {
                if (value !== "json") {
                    throw new Error(`--format only supports "json". ${USAGE}`);
                }
                return value;
            })
            // Only meaningful when packageRoot resolves to an "outcomeLibrary" project -- see
            // runOutcomeSourceReplay -- but declared/validated here alongside every other option rather
            // than a bespoke second parse, same as OutcomeSourceCommand's own "sample" verb.
            .option("--mode <modeName>", "outcome-library mode to replay (required when <packageRoot> is a native outcome-library bundle)")
            .action(
                (packageRoot: string, excess: string[], options: {seed?: string; round?: number; out?: string; format?: string; mode?: string}) => {
                    if (excess.length > 0) {
                        throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                    }
                    if (options.round === undefined) {
                        throw new Error(`--round is required. ${USAGE}`);
                    }
                    resultRef.value = {packageRoot, seed: options.seed, round: options.round, out: options.out, mode: options.mode};
                },
            );
    }

    private async runOutcomeSourceReplay(project: PokieProject, options: ReplayOptions): Promise<void> {
        if (!options.mode) {
            throw new Error(`--mode is required to replay a native outcome-library round. ${USAGE}`);
        }
        if (!options.seed) {
            throw new Error(`--seed is required to replay a native outcome-library round. ${USAGE}`);
        }

        const result = await this.replayOutcomeSource(project, options.mode, options.seed, options.round);
        if (!result.supported) {
            throw new UnsupportedProjectOperationError(result.diagnostic);
        }

        const json = JSON.stringify(result.replay, null, 4);
        if (options.out) {
            this.writeFile(options.out, json);
        }

        console.log(json);
        if (options.out) {
            console.log(`\nReplay written to "${options.out}".`);
        }
    }


    private parseArgs(args: string[]): ReplayOptions {
        const resultRef: {value?: ReplayOptions} = {};
        const command = this.buildCommand(resultRef);

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                throw error;
            }
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
                        case "--mode":
                            return `--mode requires a mode name. ${USAGE}`;
                        default:
                            return `Unknown option "${flag}". ${USAGE}`;
                    }
                },
            });
        }
        return resultRef.value!;
    }
}

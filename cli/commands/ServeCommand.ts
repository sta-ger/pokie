import {Command} from "commander";
import {
    describeUnsupportedProjectOperation,
    loadPokieGame,
    OUTCOME_SOURCE_SERVE_OPERATION,
    OutcomeSourceDevServer,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {describeLocalServerStartError, describeRuntimePackageLoadError} from "./internal/describeLocalRuntimeError.js";

const USAGE = "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]\n   or: pokie serve <outcomeLibraryPath> --mode <modeName> [--port <number>] [--host <string>]";

type ServeOptions = {packageRoot: string; host?: string; port?: number; mode?: string};

export class ServeCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.loadGame
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    // Decides, ahead of resolveRuntimePackageRoot/loadGame, whether packageRoot is a resolved
    // "outcomeLibrary"/"stakeAdapter" project -- see execute()'s own routing. Defaults to the real
    // ProjectTargetResolver so every caller gets this routing for free; a test can still inject a stub.
    private readonly resolveProject: ProjectResolving;
    // The canonical outcome-source-backed server a resolved "outcomeLibrary" project is actually served
    // through -- see OutcomeSourceDevServer's own doc comment. Never reaches loadGame/PokieDevServer; a
    // resolved "stakeAdapter" project's own missing-capability diagnostic is thrown before this is ever
    // called at all (see runOutcomeSourceServe).
    private readonly createOutcomeSourceServer: (project: PokieProject, modeName: string, options: PokieDevServerOptions) => PokieDevServerHandling;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (game, options) =>
            new PokieDevServer(game, options),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        createOutcomeSourceServer: (project: PokieProject, modeName: string, options: PokieDevServerOptions) => PokieDevServerHandling = (
            project,
            modeName,
            options,
        ) => new OutcomeSourceDevServer(project, modeName, options),
    ) {
        this.loadGame = loadGame;
        this.createServer = createServer;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.resolveProject = resolveProject;
        this.createOutcomeSourceServer = createOutcomeSourceServer;
    }

    public getName(): string {
        return "serve";
    }

    public getDescription(): string {
        return "Serve a POKIE game package over local HTTP (dev/reference server, not a casino backend/RGS).";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<void> {
        let options: ServeOptions;
        try {
            options = this.parseArgs(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw error;
        }

        // A resolved "outcomeLibrary"/"stakeAdapter" project is routed through the outcome-source-backed
        // server below instead -- neither ever reaches resolveRuntimePackageRoot/loadGame/PokieDevServer
        // (see runOutcomeSourceServe/OutcomeSourceDevServer's own doc comments on why a "stakeAdapter"
        // export can't be served at all). A path that doesn't resolve to either of those two types --
        // including one ProjectResolving doesn't recognize as any known project at all -- falls through to
        // the original, unaffected materialize-and-load flow.
        const project = await this.resolveProject.resolve(options.packageRoot);
        if (project !== undefined && (project.type === "outcomeLibrary" || project.type === "stakeAdapter")) {
            await this.runOutcomeSourceServe(project, options);
            return;
        }

        const resolution = await this.resolveRuntimePackageRoot(options.packageRoot);
        let game: PokieGame;
        try {
            game = await this.loadGame(resolution.runtimePath);
        } catch (error) {
            throw describeRuntimePackageLoadError(options.packageRoot, error);
        } finally {
            await resolution.release();
        }
        const server = this.createServer(game, {host: options.host, port: options.port});
        let address;
        try {
            address = await server.start();
        } catch (error) {
            throw describeLocalServerStartError(error, "POKIE dev server", "--port");
        }

        console.log(`POKIE dev server listening on http://${address.host}:${address.port}`);
        console.log("This is a local/dev reference server for a single game package — not a casino backend or RGS.");
    }

    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read.
    private buildCommand(resultRef: {value?: ServeOptions} = {}): Command {
        return createCommanderCliCommand("serve")
            .description(this.getDescription())
            .argument("<packageRoot>", "an existing POKIE game package, or a native outcome-library bundle (with --mode)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--port <number>", "port to listen on (default: 3000; pass 0 for an available port)", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    throw new Error(`--port must be a non-negative integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--host <string>", "host to listen on (default: loopback only)")
            // Only meaningful when packageRoot resolves to an "outcomeLibrary" project -- see
            // runOutcomeSourceServe -- but declared/validated here alongside every other option rather
            // than a bespoke second parse, same as ReplayCommand's own "--mode".
            .option("--mode <modeName>", "outcome-library mode to serve (required when <packageRoot> is a native outcome-library bundle)")
            .action((root: string, excess: string[], options: {port?: number; host?: string; mode?: string}) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!root || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                resultRef.value = {packageRoot: root, host: options.host, port: options.port, mode: options.mode};
            });
    }

    // The diagnostic check runs before the --mode requirement below, so a resolved "stakeAdapter" project
    // is rejected with the structured outcomeSource.serve capability diagnostic regardless of whether
    // --mode was even given -- it never reaches package runtime loading either way.
    private async runOutcomeSourceServe(project: PokieProject, options: ServeOptions): Promise<void> {
        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_SERVE_OPERATION);
        if (diagnostic !== undefined) {
            throw new UnsupportedProjectOperationError(diagnostic);
        }

        if (!options.mode) {
            throw new Error(`--mode <modeName> is required to serve a native outcome-library project. ${USAGE}`);
        }

        // `serve` is the native Outcome Library's local/dev entry point, just as `dev` is for a
        // runtime package. Keep its captured rounds inspectable for Studio/local troubleshooting;
        // a production host constructs OutcomeSourceDevServer with its explicit (normally partial)
        // SessionCapturePolicy instead of inheriting this CLI posture.
        const server = this.createOutcomeSourceServer(project, options.mode, {
            host: options.host,
            port: options.port,
            sessionCapturePolicyMode: "full",
        });
        let address;
        try {
            address = await server.start();
        } catch (error) {
            throw describeLocalServerStartError(error, "POKIE outcome-source dev server", "--port");
        }

        console.log(`POKIE outcome-source dev server listening on http://${address.host}:${address.port}`);
        console.log("Serving draws from a native outcome library — not a casino backend or RGS.");
    }


    private parseArgs(args: string[]): ServeOptions {
        const resultRef: {value?: ServeOptions} = {};
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
                        case "--port":
                            return `--port must be a non-negative integer. ${USAGE}`;
                        case "--host":
                            return `--host requires a value. ${USAGE}`;
                        default:
                            return `--mode requires a mode name. ${USAGE}`;
                    }
                },
            });
        }
        return resultRef.value!;
    }
}

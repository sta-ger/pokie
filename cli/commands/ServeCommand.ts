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
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

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
        return "Experimental: serve a POKIE game package over local HTTP (dev/reference server, not a casino backend/RGS).";
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);

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
        } finally {
            await resolution.release();
        }
        const server = this.createServer(game, {host: options.host, port: options.port});
        const address = await server.start();

        console.log(`POKIE dev server (experimental) listening on http://${address.host}:${address.port}`);
        console.log("This is a local/dev reference server for a single game package — not a casino backend or RGS.");
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

        const server = this.createOutcomeSourceServer(project, options.mode, {host: options.host, port: options.port});
        const address = await server.start();

        console.log(`POKIE outcome-source dev server (experimental) listening on http://${address.host}:${address.port}`);
        console.log("Serving draws from a native outcome library — not a casino backend or RGS.");
    }

    private parseArgs(args: string[]): ServeOptions {
        let result: ServeOptions | undefined;

        const command = createCommanderCliCommand("serve")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .option("--port <number>", "port to listen on", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    throw new Error(`--port must be a non-negative integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--host <string>", "host to listen on")
            // Only meaningful when packageRoot resolves to an "outcomeLibrary" project -- see
            // runOutcomeSourceServe -- but declared/validated here alongside every other option rather
            // than a bespoke second parse, same as ReplayCommand's own "--mode".
            .option("--mode <modeName>", "outcome-library mode to serve")
            .action((root: string, excess: string[], options: {port?: number; host?: string; mode?: string}) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!root || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                result = {packageRoot: root, host: options.host, port: options.port, mode: options.mode};
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
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
        return result!;
    }
}

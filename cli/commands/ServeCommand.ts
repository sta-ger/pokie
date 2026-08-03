import {loadPokieGame, PokieDevServer, PokieDevServerHandling, PokieDevServerOptions, PokieGame} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]";

export class ServeCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.loadGame
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (game, options) =>
            new PokieDevServer(game, options),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
    ) {
        this.loadGame = loadGame;
        this.createServer = createServer;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
    }

    public getName(): string {
        return "serve";
    }

    public getDescription(): string {
        return "Experimental: serve a POKIE game package over local HTTP (dev/reference server, not a casino backend/RGS).";
    }

    public async run(args: string[]): Promise<void> {
        let packageRoot!: string;
        let host: string | undefined;
        let port: number | undefined;

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
            .action((root: string, excess: string[], options: {port?: number; host?: string}) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!root || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                packageRoot = root;
                port = options.port;
                host = options.host;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--port" ? `--port must be a non-negative integer. ${USAGE}` : `--host requires a value. ${USAGE}`,
            });
        }

        const resolution = await this.resolveRuntimePackageRoot(packageRoot);
        let game: PokieGame;
        try {
            game = await this.loadGame(resolution.runtimePath);
        } finally {
            await resolution.release();
        }
        const server = this.createServer(game, {host, port});
        const address = await server.start();

        console.log(`POKIE dev server (experimental) listening on http://${address.host}:${address.port}`);
        console.log("This is a local/dev reference server for a single game package — not a casino backend or RGS.");
    }
}

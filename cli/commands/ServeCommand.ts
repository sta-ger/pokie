import {loadPokieGame, PokieDevServer, PokieDevServerHandling, PokieDevServerOptions, PokieGame} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

type ServeOptions = {
    packageRoot: string;
    host?: string;
    port?: number;
};

const USAGE = "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]";

export class ServeCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        createServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (game, options) =>
            new PokieDevServer(game, options),
    ) {
        this.loadGame = loadGame;
        this.createServer = createServer;
    }

    public getName(): string {
        return "serve";
    }

    public getDescription(): string {
        return "Experimental: serve a POKIE game package over local HTTP (dev/reference server, not a casino backend/RGS).";
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);

        const game = await this.loadGame(options.packageRoot);
        const server = this.createServer(game, {host: options.host, port: options.port});
        const address = await server.start();

        console.log(`POKIE dev server (experimental) listening on http://${address.host}:${address.port}`);
        console.log("This is a local/dev reference server for a single game package — not a casino backend or RGS.");
    }

    private parseArgs(args: string[]): ServeOptions {
        const [packageRoot, ...rest] = args;
        if (!packageRoot) {
            throw new Error(USAGE);
        }

        let host: string | undefined;
        let port: number | undefined;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--port": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
                        throw new Error(`--port must be a non-negative integer. ${USAGE}`);
                    }
                    port = parsed;
                    i++;
                    break;
                }
                case "--host": {
                    if (value === undefined) {
                        throw new Error(`--host requires a value. ${USAGE}`);
                    }
                    host = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {packageRoot, host, port};
    }
}

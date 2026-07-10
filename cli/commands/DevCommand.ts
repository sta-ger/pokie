import {
    loadPokieGame,
    PokieClientServer,
    PokieClientServerHandling,
    PokieClientServerOptions,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {openBrowser} from "../openBrowser.js";
import {waitForHealth} from "../waitForHealth.js";

type DevOptions = {
    packageRoot: string;
    host?: string;
    port?: number;
    clientHost?: string;
    clientPort?: number;
    noOpen: boolean;
};

const USAGE =
    "Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
    "[--client-port <number>] [--client-host <string>] [--no-open]";

export type DevCommandDependencies = {
    createClientServer?: (clientRoot: string, options: PokieClientServerOptions) => PokieClientServerHandling;
    waitForHealth?: typeof waitForHealth;
    openBrowser?: typeof openBrowser;
    clientRoot?: string;
    process?: NodeJS.Process;
};

// Runs `pokie serve` and `pokie client` together (as two HTTP listeners in this one process, not
// child processes), waits for the API to actually be ready, best-effort opens a browser pointed at
// the client, and cleanly stops both servers on SIGINT/SIGTERM. See docs/cli.md.
//
// `dependencies.clientRoot` (where the compiled cli/client assets live, dist/cli/client at
// runtime) has no default here on purpose — see ClientCommand's own comment on the same point:
// resolving it needs import.meta.url, which breaks a direct ts-jest unit-test import of this file.
// cli/pokie.ts computes it once and passes it in via `dependencies`.
export class DevCommand implements CliCommandHandling {
    private readonly loadGame: (packageRoot: string) => Promise<PokieGame>;
    private readonly createApiServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling;
    private readonly createClientServer: (
        clientRoot: string,
        options: PokieClientServerOptions,
    ) => PokieClientServerHandling;
    private readonly waitForHealthImpl: typeof waitForHealth;
    private readonly openBrowserImpl: typeof openBrowser;
    private readonly clientRoot: string;
    private readonly process: NodeJS.Process;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        createApiServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (
            game,
            options,
        ) => new PokieDevServer(game, options),
        dependencies: DevCommandDependencies = {},
    ) {
        this.loadGame = loadGame;
        this.createApiServer = createApiServer;
        this.createClientServer =
            dependencies.createClientServer ??
            ((clientRoot, options) => new PokieClientServer(clientRoot, options));
        this.waitForHealthImpl = dependencies.waitForHealth ?? waitForHealth;
        this.openBrowserImpl = dependencies.openBrowser ?? openBrowser;
        this.clientRoot = dependencies.clientRoot ?? "";
        this.process = dependencies.process ?? process;
    }

    public getName(): string {
        return "dev";
    }

    public getDescription(): string {
        return 'Experimental: run "pokie serve" and "pokie client" together, opening a browser preview.';
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);
        const game = await this.loadGame(options.packageRoot);

        // If any step from here on throws — the client server failing to bind its port, or the API
        // never becoming healthy — every server already started for this run must still be stopped
        // before the error propagates, so a failed `pokie dev` never leaves a listener orphaned on
        // its port for the next attempt to collide with.
        const startedServers: Array<{stop(): Promise<void>}> = [];
        try {
            const apiServer = this.createApiServer(game, {host: options.host, port: options.port});
            const apiAddress = await apiServer.start();
            startedServers.push(apiServer);

            const clientServer = this.createClientServer(this.clientRoot, {
                host: options.clientHost,
                port: options.clientPort,
                apiAddress,
            });
            const clientAddress = await clientServer.start();
            startedServers.push(clientServer);

            await this.waitForHealthImpl(`http://${apiAddress.host}:${apiAddress.port}/health`);

            console.log(`POKIE dev server (experimental) listening on http://${apiAddress.host}:${apiAddress.port}`);
            console.log(`POKIE client preview listening on http://${clientAddress.host}:${clientAddress.port}`);
            console.log("This is a local/dev reference setup for a single game package — not a casino backend or RGS.");

            if (!options.noOpen) {
                this.openBrowserImpl(`http://${clientAddress.host}:${clientAddress.port}`);
            }

            this.registerShutdown(apiServer, clientServer);
        } catch (error) {
            await this.stopAll(startedServers);
            throw error;
        }
    }

    // Best-effort: stops every already-started server in reverse start order, swallowing any
    // individual stop() failure so one server's shutdown error can't prevent the others from being
    // stopped, and so the *original* startup error (the reason stopAll was called at all) is always
    // what actually propagates out of run() — see the catch block in run().
    private async stopAll(servers: Array<{stop(): Promise<void>}>): Promise<void> {
        for (const server of servers.reverse()) {
            try {
                await server.stop();
            } catch {
                // Best-effort cleanup; the original startup error is what the caller of run() sees.
            }
        }
    }

    private registerShutdown(apiServer: PokieDevServerHandling, clientServer: PokieClientServerHandling): void {
        const shutdown = (): void => {
            Promise.all([apiServer.stop(), clientServer.stop()]).then(
                () => this.process.exit(0),
                () => this.process.exit(1),
            );
        };
        this.process.once("SIGINT", shutdown);
        this.process.once("SIGTERM", shutdown);
    }

    private parseArgs(args: string[]): DevOptions {
        const [packageRoot, ...rest] = args;
        if (!packageRoot) {
            throw new Error(USAGE);
        }

        let host: string | undefined;
        let port: number | undefined;
        let clientHost: string | undefined;
        let clientPort: number | undefined;
        let noOpen = false;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--port": {
                    port = this.parsePort(value, "--port");
                    i++;
                    break;
                }
                case "--host": {
                    host = this.requireValue(value, "--host");
                    i++;
                    break;
                }
                case "--client-port": {
                    clientPort = this.parsePort(value, "--client-port");
                    i++;
                    break;
                }
                case "--client-host": {
                    clientHost = this.requireValue(value, "--client-host");
                    i++;
                    break;
                }
                case "--no-open": {
                    noOpen = true;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {packageRoot, host, port, clientHost, clientPort, noOpen};
    }

    private parsePort(value: string | undefined, flag: string): number {
        const parsed = Number(value);
        if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
            throw new Error(`${flag} must be a non-negative integer. ${USAGE}`);
        }
        return parsed;
    }

    private requireValue(value: string | undefined, flag: string): string {
        if (value === undefined) {
            throw new Error(`${flag} requires a value. ${USAGE}`);
        }
        return value;
    }
}

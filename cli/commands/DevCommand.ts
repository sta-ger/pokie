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
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {openBrowser} from "../openBrowser.js";
import {waitForHealth} from "../waitForHealth.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

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
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.loadGame
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        createApiServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (
            game,
            options,
        ) => new PokieDevServer(game, options),
        dependencies: DevCommandDependencies = {},
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
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
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
    }

    public getName(): string {
        return "dev";
    }

    public getDescription(): string {
        return 'Experimental: run "pokie serve" and "pokie client" together, opening a browser preview.';
    }

    public async run(args: string[]): Promise<void> {
        let options: DevOptions;
        try {
            options = this.parseArgs(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw error;
        }
        const resolution = await this.resolveRuntimePackageRoot(options.packageRoot);
        let game: PokieGame;
        try {
            game = await this.loadGame(resolution.runtimePath);
        } finally {
            await resolution.release();
        }

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

    // Commander declares/validates <packageRoot>, --port/--client-port (each via its own custom
    // parser, so an invalid *provided* value fails with the exact legacy message), --host/--client-host
    // (unvalidated strings), and the native "--no-open" negatable boolean (defaults options.open to
    // true; --no-open sets it false) -- see cli/commands/internal/CommanderCliAdapter.ts. A trailing
    // "[excess...]" catches any stray bare positional the same way the original loop's default case
    // did (treated as an "Unknown option"), and a structurally *missing* --port/--client-port value
    // (the flag given with nothing after it) is mapped back to the exact same message text as an
    // invalid provided value via optionMissingArgument, matching the original parsePort's single
    // "value === undefined || ..." check.
    private parseArgs(args: string[]): DevOptions {
        let result: DevOptions | undefined;
        const command = createCommanderCliCommand("dev")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .option("--port <number>", "", (value: string) => this.parsePortValue(value, "--port"))
            .option("--host <string>")
            .option("--client-port <number>", "", (value: string) => this.parsePortValue(value, "--client-port"))
            .option("--client-host <string>")
            .option("--no-open")
            .action(
                (
                    packageRoot: string,
                    excess: string[],
                    options: {port?: number; host?: string; clientPort?: number; clientHost?: string; open?: boolean},
                ) => {
                    if (excess.length > 0) {
                        throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                    }
                    result = {
                        packageRoot,
                        host: options.host,
                        port: options.port,
                        clientHost: options.clientHost,
                        clientPort: options.clientPort,
                        noOpen: !options.open,
                    };
                },
            );

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
                    if (flag === "--port" || flag === "--client-port") {
                        return `${flag} must be a non-negative integer. ${USAGE}`;
                    }
                    if (flag === "--host" || flag === "--client-host") {
                        return `${flag} requires a value. ${USAGE}`;
                    }
                    return `Unknown option "${flag}". ${USAGE}`;
                },
            });
        }
        return result!;
    }

    private parsePortValue(value: string, flag: string): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new Error(`${flag} must be a non-negative integer. ${USAGE}`);
        }
        return parsed;
    }
}

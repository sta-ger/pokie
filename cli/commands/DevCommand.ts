import {Command} from "commander";
import {
    DEV_OPERATION,
    describeUnsupportedProjectOperation,
    loadPokieGame,
    PokieClientServer,
    PokieClientServerHandling,
    PokieClientServerOptions,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolution, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {openBrowser} from "../openBrowser.js";
import {waitForHealth} from "../waitForHealth.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {describeLocalServerStartError, describeRuntimePackageLoadError} from "./internal/describeLocalRuntimeError.js";

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
    // Stamped into the started PokieDevServer's own PokieDevServerOptions.pokieVersion, so a "full"
    // RoundArtifact's provenance carries the running POKIE version instead of PokieDevServer's own
    // "unknown" fallback. cli/registerCliCommands.ts wires the real, running version in; every existing
    // caller/test that omits this keeps that same "unknown" fallback.
    pokieVersion?: string;
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
    private readonly pokieVersion: string;
    // Crosses from "the packageRoot the caller gave us" to "a real, loadable runtime" before this.loadGame
    // ever touches it -- see materializeRuntimePackage.ts's own doc comment. Defaults to a no-op
    // passthrough so every existing caller/test keeps behaving exactly as before this boundary existed;
    // cli/pokie.ts wires the real, materializing one in.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;
    private readonly resolveProject: ProjectResolving;

    constructor(
        loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
        createApiServer: (game: PokieGame, options: PokieDevServerOptions) => PokieDevServerHandling = (
            game,
            options,
        ) => new PokieDevServer(game, options),
        dependencies: DevCommandDependencies = {},
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
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
        this.pokieVersion = dependencies.pokieVersion ?? "unknown";
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
        this.resolveProject = resolveProject;
    }

    public getName(): string {
        return "dev";
    }

    public getDescription(): string {
        return 'Run "pokie serve" and "pokie client" together as a local/dev reference setup (not a casino backend/RGS).';
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
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
        let project;
        try {
            project = await this.resolveProject.resolve(options.packageRoot);
        } catch (error) {
            throw describeRuntimePackageLoadError(options.packageRoot, error);
        }
        if (project?.type === "wasm") {
            const diagnostic = describeUnsupportedProjectOperation(project, DEV_OPERATION);
            if (diagnostic !== undefined) throw new UnsupportedProjectOperationError(diagnostic);
        }
        const game = await this.loadRuntimeGame(options.packageRoot);

        // If any step from here on throws — the client server failing to bind its port, or the API
        // never becoming healthy — every server already started for this run must still be stopped
        // before the error propagates, so a failed `pokie dev` never leaves a listener orphaned on
        // its port for the next attempt to collide with.
        const startedServers: Array<{stop(): Promise<void>}> = [];
        try {
            // "pokie dev" is a local inspection tool, not a production deployment -- it always requests
            // "full" capture (a complete, inspectable RoundArtifact persisted every round), independent
            // of any production/server default (see PokieDevServerOptions.sessionCapturePolicyMode's own
            // doc comment). Plain PokieDevServer/ServeCommand construction elsewhere is unaffected -- this
            // option is opt-in-only there, defaulting to "partial".
            const apiServer = this.createApiServer(game, {
                host: options.host,
                port: options.port,
                sessionCapturePolicyMode: "full",
                pokieVersion: this.pokieVersion,
            });
            let apiAddress;
            try {
                apiAddress = await apiServer.start();
            } catch (error) {
                throw describeLocalServerStartError(error, "POKIE dev API server", "--port");
            }
            startedServers.push(apiServer);

            const clientServer = this.createClientServer(this.clientRoot, {
                host: options.clientHost,
                port: options.clientPort,
                apiAddress,
            });
            let clientAddress;
            try {
                clientAddress = await clientServer.start();
            } catch (error) {
                throw describeLocalServerStartError(error, "POKIE client UI", "--client-port");
            }
            startedServers.push(clientServer);

            await this.waitForHealthImpl(`http://${apiAddress.host}:${apiAddress.port}/health`);

            console.log(`POKIE dev server listening on http://${apiAddress.host}:${apiAddress.port}`);
            console.log(`POKIE client UI listening on http://${clientAddress.host}:${clientAddress.port}`);
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

    // Commander declares/validates <packageRoot>, --port/--client-port (each via its own custom
    // parser, so an invalid *provided* value fails with the exact legacy message), --host/--client-host
    // (unvalidated strings), and the native "--no-open" negatable boolean (defaults options.open to
    // true; --no-open sets it false) -- see cli/commands/internal/CommanderCliAdapter.ts. A trailing
    // "[excess...]" catches any stray bare positional the same way the original loop's default case
    // did (treated as an "Unknown option"), and a structurally *missing* --port/--client-port value
    // (the flag given with nothing after it) is mapped back to the exact same message text as an
    // invalid provided value via optionMissingArgument, matching the original parsePort's single
    // "value === undefined || ..." check.
    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read.
    private buildCommand(resultRef: {value?: DevOptions} = {}): Command {
        return createCommanderCliCommand("dev")
            .description(this.getDescription())
            .argument("<packageRoot>", "an existing POKIE game package")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--port <number>", "port for the API server (default: 3000; pass 0 for an available port)", (value: string) => this.parsePortValue(value, "--port"))
            .option("--host <string>", "host for the API server (default: loopback only)")
            .option("--client-port <number>", "port for the client UI server (default: 3100; pass 0 for an available port)", (value: string) => this.parsePortValue(value, "--client-port"))
            .option("--client-host <string>", "host for the client UI server (default: loopback only)")
            .option("--no-open", "do not open a browser pointed at the client UI")
            .action(
                (
                    packageRoot: string,
                    excess: string[],
                    options: {port?: number; host?: string; clientPort?: number; clientHost?: string; open?: boolean},
                ) => {
                    if (excess.length > 0) {
                        throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                    }
                    resultRef.value = {
                        packageRoot,
                        host: options.host,
                        port: options.port,
                        clientHost: options.clientHost,
                        clientPort: options.clientPort,
                        noOpen: !options.open,
                    };
                },
            );
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

    // Resolver/materialization, package loading, and resolution cleanup are one local-runtime
    // preparation boundary. None should leak their implementation error through the public command.
    private async loadRuntimeGame(packageRoot: string): Promise<PokieGame> {
        let resolution: RuntimePackageResolution | undefined;
        try {
            resolution = await this.resolveRuntimePackageRoot(packageRoot);
            const game = await this.loadGame(resolution.runtimePath);
            const release = resolution.release();
            resolution = undefined;
            await release;
            return game;
        } catch (error) {
            if (resolution !== undefined) {
                try {
                    await resolution.release();
                } catch {
                    // The actionable package diagnostic is more useful than cleanup internals.
                }
            }
            throw describeRuntimePackageLoadError(packageRoot, error);
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
        const resultRef: {value?: DevOptions} = {};
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
        return resultRef.value!;
    }

    private parsePortValue(value: string, flag: string): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new Error(`${flag} must be a non-negative integer. ${USAGE}`);
        }
        return parsed;
    }
}

import {Command} from "commander";
import {PokieClientServer, PokieClientServerHandling, PokieClientServerOptions} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {openBrowser} from "../openBrowser.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 3000;

const USAGE =
    'Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>] [--no-open]';

// `pokie client` is a static-file server only — it never loads the game package or starts an API
// server of its own (see docs/cli.md). `packageRoot` is required for CLI-signature symmetry with
// `pokie serve`/`pokie dev` (and the scaffolded `"client": "pokie client ."` script), but is never
// actually read — the browser preview is entirely game-agnostic. Pair it with a separately-running
// `pokie serve` (default `127.0.0.1:3000`, overridable via --api-host/--api-port), or use
// `pokie dev` to run both together. Best-effort opens a browser pointed at the client once listening
// (--no-open opts out), the exact same open/no-open shape `pokie dev`/`pokie studio` already use, so
// every path into the canonical player -- `pokie dev`, or `pokie serve` + `pokie client` run by hand --
// ends up opening the same player surface the same way.
//
// `clientRoot` (where the compiled cli/client assets live, dist/cli/client at runtime) has no
// default here on purpose: resolving it needs import.meta.url, which only works in this file's
// real ESM build — never when ts-jest transforms it to CommonJS for a direct unit-test import (the
// same reason cli/pokie.ts's own import.meta.url use is never unit-tested directly, only via a
// spawned subprocess). cli/pokie.ts computes it once and passes it in, matching readOwnVersion().
export class ClientCommand implements CliCommandHandling {
    private readonly createServer: (clientRoot: string, options: PokieClientServerOptions) => PokieClientServerHandling;
    private readonly clientRoot: string;
    private readonly openBrowserImpl: typeof openBrowser;

    constructor(
        createServer: (
            clientRoot: string,
            options: PokieClientServerOptions,
        ) => PokieClientServerHandling = (clientRoot, options) => new PokieClientServer(clientRoot, options),
        clientRoot = "",
        openBrowserImpl: typeof openBrowser = openBrowser,
    ) {
        this.createServer = createServer;
        this.clientRoot = clientRoot;
        this.openBrowserImpl = openBrowserImpl;
    }

    public getName(): string {
        return "client";
    }

    public getDescription(): string {
        return "Serve the universal browser preview UI for a running \"pokie serve\" API.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public async run(args: string[]): Promise<void> {
        const resultRef: {host?: string; port?: number; apiHost?: string; apiPort?: number; noOpen?: boolean} = {};
        const command = this.buildCommand(resultRef);

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--port" || flag === "--api-port"
                        ? `${flag} must be a non-negative integer. ${USAGE}`
                        : `${flag} requires a value. ${USAGE}`,
            });
        }

        const resolvedApiHost = resultRef.apiHost ?? DEFAULT_API_HOST;
        const resolvedApiPort = resultRef.apiPort ?? DEFAULT_API_PORT;

        const server = this.createServer(this.clientRoot, {
            host: resultRef.host,
            port: resultRef.port,
            apiAddress: {host: resolvedApiHost, port: resolvedApiPort},
        });
        const address = await server.start();

        console.log(`POKIE client preview listening on http://${address.host}:${address.port}`);
        console.log(
            `Talking to a pokie serve API expected at http://${resolvedApiHost}:${resolvedApiPort} — start it separately ` +
                '(e.g. "pokie serve") or use "pokie dev" to run both together.',
        );

        // Best-effort, same as pokie dev/pokie studio's own "--no-open" -- opens the exact same
        // canonical player (cli/client, served statically by this same PokieClientServer) a two-step
        // "pokie serve" + "pokie client" workflow would otherwise leave the user to open by hand, so
        // the client-only path never falls behind pokie dev's own "opens a browser" behavior.
        if (!resultRef.noOpen) {
            this.openBrowserImpl(`http://${address.host}:${address.port}`);
        }
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `resultRef` is written by the action; run() supplies its own real box
    // and reads it back once parsing resolves, while getCommanderCommand() never parses this tree at
    // all, so its own default box is never read.
    private buildCommand(
        resultRef: {host?: string; port?: number; apiHost?: string; apiPort?: number; noOpen?: boolean} = {},
    ): Command {
        const parsePort = (flag: string) => (value: string) => {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < 0) {
                throw new Error(`${flag} must be a non-negative integer. ${USAGE}`);
            }
            return parsed;
        };

        return createCommanderCliCommand("client")
            .description(this.getDescription())
            .argument("<packageRoot>", "an existing POKIE game package (unused -- see this class's own doc comment)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--port <number>", "port to listen on (default: an available port)", parsePort("--port"))
            .option("--host <string>", "host to listen on (default: loopback only)")
            .option("--api-port <number>", `port of the pokie serve API to talk to (default: ${DEFAULT_API_PORT})`, parsePort("--api-port"))
            .option("--api-host <string>", `host of the pokie serve API to talk to (default: ${DEFAULT_API_HOST})`)
            .option("--no-open", "do not open a browser pointed at the client preview")
            .action(
                (
                    root: string,
                    excess: string[],
                    options: {port?: number; host?: string; apiPort?: number; apiHost?: string; open?: boolean},
                ) => {
                    // An empty-string positional is "present" as far as Commander's own required-argument
                    // check is concerned, but the pre-Commander behavior this preserves treated it the
                    // same as an entirely missing one.
                    if (!root || excess.length > 0) {
                        throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                    }
                    resultRef.host = options.host;
                    resultRef.port = options.port;
                    resultRef.apiHost = options.apiHost;
                    resultRef.apiPort = options.apiPort;
                    resultRef.noOpen = !options.open;
                },
            );
    }
}

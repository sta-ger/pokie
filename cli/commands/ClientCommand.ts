import {PokieClientServer, PokieClientServerHandling, PokieClientServerOptions} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 3000;

const USAGE =
    'Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]';

// `pokie client` is a static-file server only — it never loads the game package or starts an API
// server of its own (see docs/cli.md). `packageRoot` is required for CLI-signature symmetry with
// `pokie serve`/`pokie dev` (and the scaffolded `"client": "pokie client ."` script), but is never
// actually read — the browser preview is entirely game-agnostic. Pair it with a separately-running
// `pokie serve` (default `127.0.0.1:3000`, overridable via --api-host/--api-port), or use
// `pokie dev` to run both together.
//
// `clientRoot` (where the compiled cli/client assets live, dist/cli/client at runtime) has no
// default here on purpose: resolving it needs import.meta.url, which only works in this file's
// real ESM build — never when ts-jest transforms it to CommonJS for a direct unit-test import (the
// same reason cli/pokie.ts's own import.meta.url use is never unit-tested directly, only via a
// spawned subprocess). cli/pokie.ts computes it once and passes it in, matching readOwnVersion().
export class ClientCommand implements CliCommandHandling {
    private readonly createServer: (clientRoot: string, options: PokieClientServerOptions) => PokieClientServerHandling;
    private readonly clientRoot: string;

    constructor(
        createServer: (
            clientRoot: string,
            options: PokieClientServerOptions,
        ) => PokieClientServerHandling = (clientRoot, options) => new PokieClientServer(clientRoot, options),
        clientRoot = "",
    ) {
        this.createServer = createServer;
        this.clientRoot = clientRoot;
    }

    public getName(): string {
        return "client";
    }

    public getDescription(): string {
        return "Experimental: serve the universal browser preview UI for a running \"pokie serve\" API.";
    }

    public async run(args: string[]): Promise<void> {
        let host: string | undefined;
        let port: number | undefined;
        let apiHost: string | undefined;
        let apiPort: number | undefined;

        const parsePort = (flag: string) => (value: string) => {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < 0) {
                throw new Error(`${flag} must be a non-negative integer. ${USAGE}`);
            }
            return parsed;
        };

        const command = createCommanderCliCommand("client")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .option("--port <number>", "port to listen on", parsePort("--port"))
            .option("--host <string>", "host to listen on")
            .option("--api-port <number>", "port of the pokie serve API to talk to", parsePort("--api-port"))
            .option("--api-host <string>", "host of the pokie serve API to talk to")
            .action(
                (
                    root: string,
                    excess: string[],
                    options: {port?: number; host?: string; apiPort?: number; apiHost?: string},
                ) => {
                    // An empty-string positional is "present" as far as Commander's own required-argument
                    // check is concerned, but the pre-Commander behavior this preserves treated it the
                    // same as an entirely missing one.
                    if (!root || excess.length > 0) {
                        throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                    }
                    host = options.host;
                    port = options.port;
                    apiHost = options.apiHost;
                    apiPort = options.apiPort;
                },
            );

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--port" || flag === "--api-port"
                        ? `${flag} must be a non-negative integer. ${USAGE}`
                        : `${flag} requires a value. ${USAGE}`,
            });
        }

        const resolvedApiHost = apiHost ?? DEFAULT_API_HOST;
        const resolvedApiPort = apiPort ?? DEFAULT_API_PORT;

        const server = this.createServer(this.clientRoot, {
            host,
            port,
            apiAddress: {host: resolvedApiHost, port: resolvedApiPort},
        });
        const address = await server.start();

        console.log(`POKIE client preview (experimental) listening on http://${address.host}:${address.port}`);
        console.log(
            `Talking to a pokie serve API expected at http://${resolvedApiHost}:${resolvedApiPort} — start it separately ` +
                '(e.g. "pokie serve") or use "pokie dev" to run both together.',
        );
    }
}

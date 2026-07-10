import {PokieClientServer, PokieClientServerHandling, PokieClientServerOptions} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

type ClientOptions = {
    packageRoot: string;
    host?: string;
    port?: number;
    apiHost?: string;
    apiPort?: number;
};

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
        const options = this.parseArgs(args);
        const apiHost = options.apiHost ?? DEFAULT_API_HOST;
        const apiPort = options.apiPort ?? DEFAULT_API_PORT;

        const server = this.createServer(this.clientRoot, {
            host: options.host,
            port: options.port,
            apiAddress: {host: apiHost, port: apiPort},
        });
        const address = await server.start();

        console.log(`POKIE client preview (experimental) listening on http://${address.host}:${address.port}`);
        console.log(
            `Talking to a pokie serve API expected at http://${apiHost}:${apiPort} — start it separately ` +
                '(e.g. "pokie serve") or use "pokie dev" to run both together.',
        );
    }

    private parseArgs(args: string[]): ClientOptions {
        const [packageRoot, ...rest] = args;
        if (!packageRoot) {
            throw new Error(USAGE);
        }

        let host: string | undefined;
        let port: number | undefined;
        let apiHost: string | undefined;
        let apiPort: number | undefined;

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
                case "--api-port": {
                    apiPort = this.parsePort(value, "--api-port");
                    i++;
                    break;
                }
                case "--api-host": {
                    apiHost = this.requireValue(value, "--api-host");
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {packageRoot, host, port, apiHost, apiPort};
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

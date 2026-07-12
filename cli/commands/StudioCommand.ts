import {CliCommandHandling} from "../CliCommandHandling.js";
import {openBrowser} from "../openBrowser.js";
import {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../scaffold/GamePackageCreator.js";
import {StudioContextResolver} from "../studio/StudioContextResolver.js";
import {StudioContextResolving} from "../studio/StudioContextResolving.js";
import {StudioServer} from "../studio/StudioServer.js";
import {StudioServerHandling} from "../studio/StudioServerHandling.js";
import {StudioServerOptions} from "../studio/StudioServerOptions.js";

type StudioOptions = {
    projectRoot?: string;
    host?: string;
    port?: number;
    noOpen: boolean;
};

const USAGE = "Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]";

export type StudioCommandDependencies = {
    createServer?: (options: StudioServerOptions) => StudioServerHandling;
    openBrowser?: typeof openBrowser;
    contextResolver?: StudioContextResolving;
    gamePackageCreator?: GamePackageCreating;
    // Where the compiled cli/studio-client assets live (dist/cli/studio-client at runtime) — no
    // default here on purpose, same reason as DevCommand's own clientRoot: resolving it needs
    // import.meta.url, which only works in cli/pokie.ts's real ESM build. cli/pokie.ts computes it
    // once (ownStudioRoot()) and passes it in.
    studioRoot?: string;
    process?: NodeJS.Process;
};

// `pokie` with no arguments (and `pokie studio` explicitly) both run this command — see
// resolveCommandName.ts/cli/pokie.ts. This is the first minimal stage of POKIE Studio (see
// docs/cli.md): starts StudioServer (app shell + JSON API), waits for it to be listening, and
// best-effort opens a browser pointed at it, mirroring DevCommand's shape.
export class StudioCommand implements CliCommandHandling {
    private readonly createServer: (options: StudioServerOptions) => StudioServerHandling;
    private readonly openBrowserImpl: typeof openBrowser;
    private readonly contextResolver: StudioContextResolving;
    private readonly gamePackageCreator: GamePackageCreating;
    private readonly studioRoot: string;
    private readonly process: NodeJS.Process;

    constructor(pokieVersion: string, dependencies: StudioCommandDependencies = {}) {
        this.createServer = dependencies.createServer ?? ((options) => new StudioServer(options));
        this.openBrowserImpl = dependencies.openBrowser ?? openBrowser;
        this.contextResolver = dependencies.contextResolver ?? new StudioContextResolver();
        this.gamePackageCreator = dependencies.gamePackageCreator ?? new GamePackageCreator(pokieVersion);
        this.studioRoot = dependencies.studioRoot ?? "";
        this.process = dependencies.process ?? process;
    }

    public getName(): string {
        return "studio";
    }

    public getDescription(): string {
        return "Launch POKIE Studio, a local web app for creating/opening/inspecting game packages.";
    }

    public async run(args: string[]): Promise<void> {
        const options = this.parseArgs(args);
        const context = this.contextResolver.resolve(options.projectRoot);

        const server = this.createServer({
            host: options.host,
            port: options.port,
            studioRoot: this.studioRoot,
            initialContext: context,
            gamePackageCreator: this.gamePackageCreator,
        });
        const address = await server.start();

        console.log(`POKIE Studio listening on http://${address.host}:${address.port}`);

        if (!options.noOpen) {
            this.openBrowserImpl(`http://${address.host}:${address.port}`);
        }

        this.registerShutdown(server);
    }

    private registerShutdown(server: StudioServerHandling): void {
        const shutdown = (): void => {
            server.stop().then(
                () => this.process.exit(0),
                () => this.process.exit(1),
            );
        };
        this.process.once("SIGINT", shutdown);
        this.process.once("SIGTERM", shutdown);
    }

    private parseArgs(args: string[]): StudioOptions {
        let projectRoot: string | undefined;
        let rest = args;
        if (args.length > 0 && !args[0].startsWith("--")) {
            [projectRoot] = args;
            rest = args.slice(1);
        }

        let host: string | undefined;
        let port: number | undefined;
        let noOpen = false;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--port": {
                    port = this.parsePort(value);
                    i++;
                    break;
                }
                case "--host": {
                    host = this.requireValue(value, "--host");
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

        return {projectRoot, host, port, noOpen};
    }

    private parsePort(value: string | undefined): number {
        const parsed = Number(value);
        if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
            throw new Error(`--port must be a non-negative integer. ${USAGE}`);
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

import {STUDIO_OPERATION} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createMaterializingRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {openBrowser} from "../openBrowser.js";
import {StudioBlueprintService} from "../studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../studio/home/StudioHomeService.js";
import {createDefaultStudioProjectRegistrationService} from "../studio/StudioProjectRegistrationService.js";
import {StudioContextResolver} from "../studio/StudioContextResolver.js";
import {StudioContextResolving} from "../studio/StudioContextResolving.js";
import {StudioServer} from "../studio/StudioServer.js";
import {StudioServerHandling} from "../studio/StudioServerHandling.js";
import {StudioServerOptions} from "../studio/StudioServerOptions.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

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
    // Drives the Home nav's Open/Recent-Projects flows — see StudioHomeService.
    homeService?: StudioHomeService;
    // Drives the Blueprint Editor's five /api/home/blueprints/* endpoints — see StudioBlueprintService.
    blueprintService?: StudioBlueprintService;
    // Where the compiled cli/studio-client assets live (dist/cli/studio-client at runtime) — no
    // default here on purpose, same reason as DevCommand's own clientRoot: resolving it needs
    // import.meta.url, which only works in cli/pokie.ts's real ESM build. cli/pokie.ts computes it
    // once (ownStudioRoot()) and passes it in.
    studioRoot?: string;
    process?: NodeJS.Process;
};

// `pokie` with no arguments, `pokie .`/`pokie <path>`, and `pokie studio [.|<path>]` all run this
// command — see resolveCliInvocation.ts/cli/pokie.ts for how each is resolved to it. This is the
// first minimal stage of POKIE Studio (see docs/cli.md): starts StudioServer (app shell + JSON API),
// waits for it to be listening, and best-effort opens a browser pointed at it, mirroring DevCommand's
// shape.
export class StudioCommand implements CliCommandHandling {
    private readonly createServer: (options: StudioServerOptions) => StudioServerHandling;
    private readonly openBrowserImpl: typeof openBrowser;
    private readonly contextResolver: StudioContextResolving;
    private readonly homeService: StudioHomeService;
    private readonly blueprintService: StudioBlueprintService;
    private readonly studioRoot: string;
    private readonly process: NodeJS.Process;
    private readonly pokieVersion: string;
    // The one materializing resolver this command builds -- shared, by identity, between homeService's
    // own Open/Recent-Projects flow and the Project Dashboard/Play runtime StudioServer drives once
    // started (see run() below), rather than each independently building its own. Both go through the
    // exact same BlueprintProjectMaterializer instance (same cacheRoot, same pokiePackageRoot), so "one
    // materialization service" is true by construction, not just by the cache directory happening to
    // agree.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;

    constructor(pokieVersion: string, pokiePackageRoot: string, dependencies: StudioCommandDependencies = {}) {
        this.pokieVersion = pokieVersion;
        this.createServer = dependencies.createServer ?? ((options) => new StudioServer(options));
        this.openBrowserImpl = dependencies.openBrowser ?? openBrowser;
        this.contextResolver = dependencies.contextResolver ?? new StudioContextResolver();
        const projectRegistrationService = createDefaultStudioProjectRegistrationService();
        this.resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(pokieVersion, STUDIO_OPERATION, pokiePackageRoot);
        this.homeService =
            dependencies.homeService ??
            new StudioHomeService(
                pokieVersion,
                undefined,
                undefined,
                undefined,
                this.resolveRuntimePackageRoot,
                (location) => projectRegistrationService.describeLocation(location),
            );
        this.studioRoot = dependencies.studioRoot ?? "";
        this.blueprintService =
            dependencies.blueprintService ?? new StudioBlueprintService(pokieVersion, this.studioRoot, this.homeService);
        this.process = dependencies.process ?? process;
    }

    public getName(): string {
        return "studio";
    }

    public getDescription(): string {
        return "Launch POKIE Studio, a local web app for creating/opening/inspecting game packages.";
    }

    public async run(args: string[]): Promise<void> {
        let options: StudioOptions;
        try {
            options = this.parseArgs(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return;
            }
            throw error;
        }
        const context = this.contextResolver.resolve(options.projectRoot);

        const server = this.createServer({
            host: options.host,
            port: options.port,
            pokieVersion: this.pokieVersion,
            studioRoot: this.studioRoot,
            initialContext: context,
            homeService: this.homeService,
            blueprintService: this.blueprintService,
            resolveRuntimePackageRoot: this.resolveRuntimePackageRoot,
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

    // Commander's own "[projectRoot]" optional positional already handles an omitted leading
    // positional correctly (including when the first token is a "-"-prefixed flag, which leaves it
    // `null`) -- no manual `args[0].startsWith("--")` sniffing needed, unlike the original. A trailing
    // "[excess...]" catches any further stray bare positional (matching the original loop's default
    // case, which treated any unmatched token -- flag-shaped or not -- as an "Unknown option").
    private parseArgs(args: string[]): StudioOptions {
        let result: StudioOptions | undefined;
        const command = createCommanderCliCommand("studio")
            .argument("[projectRoot]")
            .argument("[excess...]")
            .option("--port <number>", "", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    throw new Error(`--port must be a non-negative integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--host <string>")
            .option("--no-open")
            .action((projectRoot: string | null, excess: string[], options: {port?: number; host?: string; open?: boolean}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                }
                result = {projectRoot: projectRoot ?? undefined, host: options.host, port: options.port, noOpen: !options.open};
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                throw error;
            }
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--port") {
                        return `--port must be a non-negative integer. ${USAGE}`;
                    }
                    if (flag === "--host") {
                        return `--host requires a value. ${USAGE}`;
                    }
                    return `Unknown option "${flag}". ${USAGE}`;
                },
            });
        }
        return result!;
    }
}

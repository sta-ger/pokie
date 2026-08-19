import {Command} from "commander";
import {PokieGamePackageValidator, STUDIO_OPERATION} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createMaterializingRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import {openBrowser} from "../openBrowser.js";
import {StudioBlueprintService} from "../studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../studio/home/StudioHomeService.js";
import {createStudioGameLoader, createStudioGamePackageValidator} from "../studio/loadStudioGame.js";
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

const USAGE = "Usage: pokie [projectRoot] [--port <number>] [--host <string>] [--no-open]";

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

// The private, implicit Studio entry delegates to this command for `pokie` with no arguments and
// `pokie .`/`pokie <path>`; see resolveCliInvocation.ts/cli/pokie.ts. This is the
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
    private readonly loadGame: NonNullable<StudioServerOptions["loadGame"]>;
    private readonly gamePackageValidator: PokieGamePackageValidator;
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
        this.loadGame = createStudioGameLoader(pokiePackageRoot);
        this.gamePackageValidator = createStudioGamePackageValidator(pokiePackageRoot);
        this.homeService =
            dependencies.homeService ??
            new StudioHomeService(
                pokieVersion,
                undefined,
                this.loadGame,
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

    public getCommanderCommand(): Command {
        return this.buildCommand();
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
            loadGame: this.loadGame,
            gamePackageValidator: this.gamePackageValidator,
            resolveRuntimePackageRoot: this.resolveRuntimePackageRoot,
        });
        const address = await server.start();

        console.log(`POKIE Studio listening on http://${address.host}:${address.port}`);

        if (!options.noOpen) {
            this.openBrowserImpl(`http://${address.host}:${address.port}`);
        }

        this.registerShutdown(server);
    }

    // Commander's own "[projectRoot]" optional positional already handles an omitted leading
    // positional correctly (including when the first token is a "-"-prefixed flag, which leaves it
    // `null`) -- no manual `args[0].startsWith("--")` sniffing needed, unlike the original. A trailing
    // "[excess...]" catches any further stray bare positional (matching the original loop's default
    // case, which treated any unmatched token -- flag-shaped or not -- as an "Unknown option").
    // Builds the exact Commander tree parseArgs() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and parseArgs() (for real parsing) use, so
    // the two can never drift apart. `resultRef` is written by the action; parseArgs() supplies its own
    // real box and reads it back once parsing resolves, while getCommanderCommand() never parses this
    // tree at all, so its own default box is never read.
    private buildCommand(resultRef: {value?: StudioOptions} = {}): Command {
        return createCommanderCliCommand("studio")
            .description(this.getDescription())
            .argument("[projectRoot]", "a game package/blueprint to open on launch (default: the Studio home screen)")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--port <number>", "port to listen on (default: an available port)", (value: string) => {
                const parsed = Number(value);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    throw new Error(`--port must be a non-negative integer. ${USAGE}`);
                }
                return parsed;
            })
            .option("--host <string>", "host to listen on (default: loopback only)")
            .option("--no-open", "do not open a browser pointed at Studio")
            .action((projectRoot: string | null, excess: string[], options: {port?: number; host?: string; open?: boolean}) => {
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${USAGE}`);
                }
                resultRef.value = {projectRoot: projectRoot ?? undefined, host: options.host, port: options.port, noOpen: !options.open};
            });
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
        const resultRef: {value?: StudioOptions} = {};
        const command = this.buildCommand(resultRef);

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
        return resultRef.value!;
    }
}

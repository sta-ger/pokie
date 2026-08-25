import {DEV_OPERATION, REPLAY_OPERATION, SERVE_OPERATION, SIM_OPERATION, VALIDATE_OPERATION} from "pokie";
import {CliCommandHandling} from "./CliCommandHandling.js";
import {BuildCommand} from "./commands/BuildCommand.js";
import {CertificationCommand} from "./commands/CertificationCommand.js";
import {ClientCommand} from "./commands/ClientCommand.js";
import {CreateCommand} from "./commands/CreateCommand.js";
import {DevCommand} from "./commands/DevCommand.js";
import {DiffCommand} from "./commands/DiffCommand.js";
import {EditCommand} from "./commands/EditCommand.js";
import {ExportCommand} from "./commands/ExportCommand.js";
import {FairnessCommand} from "./commands/FairnessCommand.js";
import {GenerateCommand} from "./commands/GenerateCommand.js";
import {InitCommand} from "./commands/InitCommand.js";
import {ImportCommand} from "./commands/ImportCommand.js";
import {InspectCommand} from "./commands/InspectCommand.js";
import {InternalStudioCommand} from "./commands/InternalStudioCommand.js";
import {ReelCommand} from "./commands/ReelCommand.js";
import {ReplayCommand} from "./commands/ReplayCommand.js";
import {ReportCommand} from "./commands/ReportCommand.js";
import {ServeCommand} from "./commands/ServeCommand.js";
import {SampleCommand} from "./commands/SampleCommand.js";
import {SimCommand} from "./commands/SimCommand.js";
import {StudioCommand} from "./commands/StudioCommand.js";
import {ValidateCommand} from "./commands/ValidateCommand.js";
import {createMaterializingRuntimePackageResolver} from "./materialize/materializeRuntimePackage.js";
import {withLocalPokieInstall} from "./prepare/PackageCommandRunner.js";

export type RegisterCliCommandsOptions = {
    version: string;
    pokiePackageRoot: string;
    clientRoot: string;
    studioRoot: string;
};

// The ONE place the full, real POKIE command tree is built -- every field/subcommand/option any of
// these register lives entirely inside the CliCommandHandling instances themselves (see
// CliCommandHandling.ts's own getCommanderCommand() doc comment), so this function's own return value
// is simultaneously what cli/pokie.ts's run() dispatches real argv against AND the one registration
// source tests/cli/cliCommandInventory.contract.test.ts's help-coverage block walks recursively --
// never a second, hand-maintained mirror of this list, and never a command-specific exception for one
// entry that a hand-maintained mirror happened to drop (e.g. "outcomesource"). Side-effect-free itself
// (no import.meta.url use here -- see cli/pokie.ts's own ownPackageDir()/readOwnVersion()/etc. doc
// comments on why those stay there and get passed in as plain strings instead), so it's safe for a test
// to import and call directly, unlike cli/pokie.ts itself (whose module body calls run().then(...)
// unconditionally on import).
export function registerCliCommands(options: RegisterCliCommandsOptions): CliCommandHandling[] {
    const {version, pokiePackageRoot, clientRoot, studioRoot} = options;
    return [
        new BuildCommand(version, undefined, undefined, undefined, undefined, undefined, pokiePackageRoot),
        new CertificationCommand(version),
        new ClientCommand(undefined, clientRoot),
        new CreateCommand(version),
        new DevCommand(
            undefined,
            undefined,
            {clientRoot, pokieVersion: version},
            createMaterializingRuntimePackageResolver(version, DEV_OPERATION, pokiePackageRoot),
        ),
        new DiffCommand(),
        new EditCommand(),
        new ExportCommand(version),
        new FairnessCommand(),
        new GenerateCommand(version),
        // withLocalPokieInstall(pokiePackageRoot): the same mechanism createMaterializingRuntimePackageResolver
        // wires into every Blueprint materialization below -- so a freshly scaffolded package's own "npm
        // install" resolves "pokie" against this exact running installation instead of the registry, even
        // when its own version has never been published.
        new InitCommand(version, undefined, withLocalPokieInstall(pokiePackageRoot)),
        new ImportCommand(version),
        new InspectCommand(),
        new ReelCommand(),
        new ReplayCommand(
            undefined,
            undefined,
            undefined,
            createMaterializingRuntimePackageResolver(version, REPLAY_OPERATION, pokiePackageRoot),
        ),
        new ReportCommand(),
        new ServeCommand(undefined, undefined, createMaterializingRuntimePackageResolver(version, SERVE_OPERATION, pokiePackageRoot)),
        new SampleCommand(),
        new SimCommand(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            createMaterializingRuntimePackageResolver(version, SIM_OPERATION, pokiePackageRoot),
        ),
        new InternalStudioCommand(new StudioCommand(version, pokiePackageRoot, {studioRoot})),
        new ValidateCommand(
            undefined,
            undefined,
            createMaterializingRuntimePackageResolver(version, VALIDATE_OPERATION, pokiePackageRoot),
        ),
    ];
}

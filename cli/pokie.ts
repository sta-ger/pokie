#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import {CliCommandHandling} from "./CliCommandHandling.js";
import {BuildCommand} from "./commands/BuildCommand.js";
import {CertificationCommand} from "./commands/CertificationCommand.js";
import {ClientCommand} from "./commands/ClientCommand.js";
import {CreateCommand} from "./commands/CreateCommand.js";
import {DevCommand} from "./commands/DevCommand.js";
import {DiffCommand} from "./commands/DiffCommand.js";
import {FairnessCommand} from "./commands/FairnessCommand.js";
import {InitCommand} from "./commands/InitCommand.js";
import {InspectCommand} from "./commands/InspectCommand.js";
import {NameCommand} from "./commands/NameCommand.js";
import {OutcomeLibraryCommand} from "./commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "./commands/OutcomeSourceCommand.js";
import {ParCommand} from "./commands/ParCommand.js";
import {ReelCommand} from "./commands/ReelCommand.js";
import {ReplayCommand} from "./commands/ReplayCommand.js";
import {ReportCommand} from "./commands/ReportCommand.js";
import {ServeCommand} from "./commands/ServeCommand.js";
import {SimCommand} from "./commands/SimCommand.js";
import {StakeEngineCommand} from "./commands/StakeEngineCommand.js";
import {StudioCommand} from "./commands/StudioCommand.js";
import {ValidateCommand} from "./commands/ValidateCommand.js";
import {DEV_OPERATION, REPLAY_OPERATION, SERVE_OPERATION, SIM_OPERATION, VALIDATE_OPERATION} from "pokie";
import {dispatch} from "./dispatch.js";
import {createMaterializingRuntimePackageResolver} from "./materialize/materializeRuntimePackage.js";

// This compiled file always lives at "<pokiePackageRoot>/dist/cli/pokie.js", regardless of how the
// running POKIE installation actually got onto disk -- a dev checkout, an npm-linked target (Node's own
// module loader resolves a symlinked entry to its real, target-side path before import.meta.url is ever
// read), a tarball install, or an ordinary registry install all share that same two-levels-up shape. That
// makes this the one safe place every materialization call site (below, and StudioCommand's own) gets
// both the running version and the running installation's own root from -- see readOwnPackageRoot()'s
// own doc comment for what the latter is for.
function ownPackageDir(): string {
    return path.dirname(fileURLToPath(import.meta.url));
}

function readOwnVersion(): string {
    const packageJsonPath = path.join(ownPackageDir(), "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {version: string};
    return pkg.version;
}

// The running POKIE installation's own root directory -- passed into every
// createMaterializingRuntimePackageResolver() call (and StudioCommand) as `pokiePackageRoot`, so a
// materialized Blueprint's own "npm install" can resolve "pokie" against this exact installation (via
// withLocalPokieInstall) instead of a registry. See this file's own ownPackageDir() doc comment for why
// the same "two levels up from this compiled file" computation is correct across every install mechanism.
function readOwnPackageRoot(): string {
    return path.join(ownPackageDir(), "../..");
}

// Where the compiled cli/client assets live relative to this compiled file (dist/cli/pokie.js) —
// computed once, here, and passed into ClientCommand/DevCommand, since resolving it needs
// import.meta.url (see those commands' own comments on why they don't compute it themselves).
function ownClientRoot(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return path.join(currentDir, "client");
}

// Same reasoning as ownClientRoot() above, for the separately-built POKIE Studio frontend
// (dist/cli/studio-client) — see StudioCommand's own comment on why studioRoot isn't computed there.
function ownStudioRoot(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return path.join(currentDir, "studio-client");
}

function run(): Promise<number> {
    const pokiePackageRoot = readOwnPackageRoot();
    const commands: CliCommandHandling[] = [
        new BuildCommand(readOwnVersion()),
        new CertificationCommand(readOwnVersion()),
        new ClientCommand(undefined, ownClientRoot()),
        new CreateCommand(readOwnVersion()),
        new DevCommand(
            undefined,
            undefined,
            {clientRoot: ownClientRoot()},
            createMaterializingRuntimePackageResolver(readOwnVersion(), DEV_OPERATION, pokiePackageRoot),
        ),
        new DiffCommand(),
        new FairnessCommand(),
        new InitCommand(readOwnVersion()),
        new InspectCommand(),
        new NameCommand(),
        new OutcomeLibraryCommand(readOwnVersion()),
        new OutcomeSourceCommand(),
        new ParCommand(readOwnVersion()),
        new ReelCommand(),
        new ReplayCommand(
            undefined,
            undefined,
            undefined,
            createMaterializingRuntimePackageResolver(readOwnVersion(), REPLAY_OPERATION, pokiePackageRoot),
        ),
        new ReportCommand(),
        new ServeCommand(undefined, undefined, createMaterializingRuntimePackageResolver(readOwnVersion(), SERVE_OPERATION, pokiePackageRoot)),
        new SimCommand(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            createMaterializingRuntimePackageResolver(readOwnVersion(), SIM_OPERATION, pokiePackageRoot),
        ),
        new StakeEngineCommand(readOwnVersion()),
        new StudioCommand(readOwnVersion(), pokiePackageRoot, {studioRoot: ownStudioRoot()}),
        new ValidateCommand(
            undefined,
            undefined,
            createMaterializingRuntimePackageResolver(readOwnVersion(), VALIDATE_OPERATION, pokiePackageRoot),
        ),
    ];
    return dispatch(commands, process.argv);
}

run().then((exitCode) => {
    process.exitCode = exitCode;
});

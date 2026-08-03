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
import {ParCommand} from "./commands/ParCommand.js";
import {ReplayCommand} from "./commands/ReplayCommand.js";
import {ReportCommand} from "./commands/ReportCommand.js";
import {ServeCommand} from "./commands/ServeCommand.js";
import {SimCommand} from "./commands/SimCommand.js";
import {StakeEngineCommand} from "./commands/StakeEngineCommand.js";
import {StudioCommand} from "./commands/StudioCommand.js";
import {ValidateCommand} from "./commands/ValidateCommand.js";
import {dispatch} from "./dispatch.js";
import {createMaterializingRuntimePackageResolver} from "./materialize/materializeRuntimePackage.js";

function readOwnVersion(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.join(currentDir, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {version: string};
    return pkg.version;
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
    const commands: CliCommandHandling[] = [
        new BuildCommand(readOwnVersion()),
        new CertificationCommand(readOwnVersion()),
        new ClientCommand(undefined, ownClientRoot()),
        new CreateCommand(readOwnVersion()),
        new DevCommand(undefined, undefined, {clientRoot: ownClientRoot()}, createMaterializingRuntimePackageResolver(readOwnVersion())),
        new DiffCommand(),
        new FairnessCommand(),
        new InitCommand(readOwnVersion()),
        new InspectCommand(),
        new NameCommand(),
        new OutcomeLibraryCommand(readOwnVersion()),
        new ParCommand(readOwnVersion()),
        new ReplayCommand(undefined, undefined, undefined, createMaterializingRuntimePackageResolver(readOwnVersion())),
        new ReportCommand(),
        new ServeCommand(undefined, undefined, createMaterializingRuntimePackageResolver(readOwnVersion())),
        new SimCommand(undefined, undefined, undefined, undefined, undefined, createMaterializingRuntimePackageResolver(readOwnVersion())),
        new StakeEngineCommand(readOwnVersion()),
        new StudioCommand(readOwnVersion(), {studioRoot: ownStudioRoot()}),
        new ValidateCommand(),
    ];
    return dispatch(commands, process.argv);
}

run().then((exitCode) => {
    process.exitCode = exitCode;
});

#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import {CliCommandHandling} from "./CliCommandHandling.js";
import {BuildCommand} from "./commands/BuildCommand.js";
import {ClientCommand} from "./commands/ClientCommand.js";
import {CreateCommand} from "./commands/CreateCommand.js";
import {DevCommand} from "./commands/DevCommand.js";
import {DiffCommand} from "./commands/DiffCommand.js";
import {InitCommand} from "./commands/InitCommand.js";
import {InspectCommand} from "./commands/InspectCommand.js";
import {ParCommand} from "./commands/ParCommand.js";
import {ReplayCommand} from "./commands/ReplayCommand.js";
import {ReportCommand} from "./commands/ReportCommand.js";
import {ServeCommand} from "./commands/ServeCommand.js";
import {SimCommand} from "./commands/SimCommand.js";
import {StakeEngineExportCommand} from "./commands/StakeEngineExportCommand.js";
import {StudioCommand} from "./commands/StudioCommand.js";
import {ValidateCommand} from "./commands/ValidateCommand.js";
import {resolveCliInvocation} from "./resolveCliInvocation.js";

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

function printUsage(commands: CliCommandHandling[]): void {
    console.log("Usage: pokie <command>\n");
    console.log("Commands:");
    for (const command of commands) {
        console.log(`  ${command.getName().padEnd(10)} ${command.getDescription()}`);
    }
}

async function run(): Promise<number> {
    const commands: CliCommandHandling[] = [
        new BuildCommand(readOwnVersion()),
        new ClientCommand(undefined, ownClientRoot()),
        new CreateCommand(readOwnVersion()),
        new DevCommand(undefined, undefined, {clientRoot: ownClientRoot()}),
        new DiffCommand(),
        new InitCommand(readOwnVersion()),
        new InspectCommand(),
        new ParCommand(readOwnVersion()),
        new ReplayCommand(),
        new ReportCommand(),
        new ServeCommand(),
        new SimCommand(),
        new StakeEngineExportCommand(readOwnVersion()),
        new StudioCommand(readOwnVersion(), {studioRoot: ownStudioRoot()}),
        new ValidateCommand(),
    ];
    // No arguments at all, "pokie ." / "pokie <existing path>", and every explicit command name
    // (including "studio" itself) are all resolved here rather than inline — see
    // resolveCliInvocation's own doc comment for the full precedence. An unrecognized token that
    // isn't an existing path either falls through to the usage printout below, same as before.
    const invocation = resolveCliInvocation(
        process.argv,
        commands.map((candidate) => candidate.getName()),
    );
    if (!invocation) {
        printUsage(commands);
        return 1;
    }

    // Always found in practice: resolveCliInvocation only ever names "studio" (registered above) or
    // a name it confirmed is one of the knownCommandNames it was given. The check stays explicit
    // rather than a non-null assertion so this file makes no assumption about that invariant.
    const command = commands.find((candidate) => candidate.getName() === invocation.commandName);
    if (!command) {
        printUsage(commands);
        return 1;
    }

    try {
        const exitCode = await command.run(invocation.args);
        return exitCode ?? 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

run().then((exitCode) => {
    process.exitCode = exitCode;
});

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
import {ReplayCommand} from "./commands/ReplayCommand.js";
import {ReportCommand} from "./commands/ReportCommand.js";
import {ServeCommand} from "./commands/ServeCommand.js";
import {SimCommand} from "./commands/SimCommand.js";
import {ValidateCommand} from "./commands/ValidateCommand.js";

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
        new ReplayCommand(),
        new ReportCommand(),
        new ServeCommand(),
        new SimCommand(),
        new ValidateCommand(),
    ];
    const [commandName] = process.argv.slice(2);
    const command = commands.find((candidate) => candidate.getName() === commandName);

    if (!command) {
        printUsage(commands);
        return commandName === undefined ? 0 : 1;
    }

    try {
        const exitCode = await command.run(process.argv.slice(3));
        return exitCode ?? 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

run().then((exitCode) => {
    process.exitCode = exitCode;
});

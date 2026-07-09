#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import {CliCommandHandling} from "./CliCommandHandling.js";
import {CreateCommand} from "./commands/CreateCommand.js";
import {InitCommand} from "./commands/InitCommand.js";

function readOwnVersion(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.join(currentDir, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {version: string};
    return pkg.version;
}

function printUsage(commands: CliCommandHandling[]): void {
    console.log("Usage: pokie <command>\n");
    console.log("Commands:");
    for (const command of commands) {
        console.log(`  ${command.getName().padEnd(10)} ${command.getDescription()}`);
    }
    console.log("\nMore commands (sim, validate, report, serve) are planned.");
}

async function run(): Promise<number> {
    const commands: CliCommandHandling[] = [new CreateCommand(readOwnVersion()), new InitCommand(readOwnVersion())];
    const [commandName] = process.argv.slice(2);
    const command = commands.find((candidate) => candidate.getName() === commandName);

    if (!command) {
        printUsage(commands);
        return commandName === undefined ? 0 : 1;
    }

    try {
        await command.run(process.argv.slice(3));
        return 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

run().then((exitCode) => {
    process.exitCode = exitCode;
});

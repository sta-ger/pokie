#!/usr/bin/env node
/**
 * Collect the public CLI only from its executable help surface.  This is deliberately
 * not coupled to the TypeScript command classes: a packed/installable CLI is the
 * contract a Phase 7 journey exercises.
 */
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_COVERAGE = path.join(repositoryRoot, "docs/evidence/p7-01-cli-inventory/coverage-map.json");
const HELP_ALIAS = "-h";

function fail(message) {
    throw new Error(`P7 CLI inventory: ${message}`);
}

function parseArguments(argv) {
    const result = {cli: undefined, coverage: DEFAULT_COVERAGE, evidenceDir: undefined};
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--cli" || argument === "--coverage" || argument === "--evidence-dir") {
            const value = argv[++index];
            if (!value) fail(`${argument} requires a value.`);
            result[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = path.resolve(value);
        } else {
            fail(`unknown argument ${JSON.stringify(argument)}. Usage: node scripts/check-cli-inventory.mjs --cli <built-or-packed-pokie.js> [--coverage <map.json>] [--evidence-dir <dir>]`);
        }
    }
    if (!result.cli) fail("--cli must name a freshly built or unpacked package's dist/cli/pokie.js.");
    if (!existsSync(result.cli)) fail(`CLI executable does not exist: ${result.cli}`);
    return result;
}

function runCli(cli, args, cwd) {
    const invocation = [cli, ...args];
    const result = spawnSync(process.execPath, invocation, {cwd, encoding: "utf8", maxBuffer: 1024 * 1024});
    const exitCode = result.status ?? 1;
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.error) fail(`${invocation.join(" ")} could not start: ${result.error.message}`);
    if (exitCode !== 0) fail(`${invocation.join(" ")} exited ${exitCode}: ${output.trim()}`);
    return {command: `${process.execPath} ${invocation.map((item) => JSON.stringify(item)).join(" ")}`, exitCode, output};
}

function commandNames(help) {
    const lines = help.split("\n");
    const commandsIndex = lines.findIndex((line) => line.trim() === "Commands:");
    if (commandsIndex < 0) return [];
    const names = [];
    for (const line of lines.slice(commandsIndex + 1)) {
        if (!line.trim()) continue;
        if (!/^\s{2,}/.test(line)) break;
        const match = line.trim().match(/^([a-z][a-z0-9-]*)\b/);
        if (match) names.push(match[1]);
    }
    return [...new Set(names)];
}

function optionTokens(help) {
    const tokens = new Set();
    for (const line of help.split("\n")) {
        if (!/^\s{2,}-/.test(line)) continue;
        for (const token of line.match(/(?:^|[\s,])(-{1,2}[a-z][a-z0-9-]*)\b/gi) ?? []) {
            tokens.add(token.trim().replace(/,$/, ""));
        }
    }
    return [...tokens].sort();
}

async function collect(cli) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-cli-inventory-"));
    const transcript = [`WORKDIR ${temporaryDirectory}`, `INPUT_PROVENANCE executable=${cli}`];
    try {
        const root = runCli(cli, ["--help"], temporaryDirectory);
        transcript.push(`COMMAND ${root.command}`, `EXIT ${root.exitCode}`);
        const queue = commandNames(root.output).map((name) => [name]);
        const seen = new Set();
        const commands = [];
        while (queue.length > 0) {
            const pathParts = queue.shift();
            const key = pathParts.join(" ");
            if (seen.has(key)) continue;
            seen.add(key);
            const response = runCli(cli, [...pathParts, "--help"], temporaryDirectory);
            transcript.push(`COMMAND ${response.command}`, `EXIT ${response.exitCode}`);
            const children = commandNames(response.output);
            commands.push({path: key, options: optionTokens(response.output), aliases: optionTokens(response.output).filter((token) => token.startsWith("-") && !token.startsWith("--"))});
            for (const child of children) queue.push([...pathParts, child]);
        }
        commands.sort((left, right) => left.path.localeCompare(right.path));
        return {inventory: {schemaVersion: 1, rootCommands: commandNames(root.output).sort(), commands}, transcript};
    } finally {
        await rm(temporaryDirectory, {recursive: true, force: true});
    }
}

function inventoryCapabilities(inventory) {
    const capabilities = new Set(inventory.rootCommands.map((name) => `command:${name}`));
    for (const command of inventory.commands) {
        if (command.path.includes(" ")) capabilities.add(`subcommand:${command.path}`);
        for (const option of command.options) {
            if (option.startsWith("--") && option !== "--help") capabilities.add(`option:${command.path}:${option}`);
            else if (option.startsWith("-") && option !== HELP_ALIAS && option !== "--help") capabilities.add(`alias:${command.path}:${option}`);
        }
    }
    return capabilities;
}

async function documentationCapabilities(coverage) {
    const capabilities = new Set();
    for (const relativeFile of coverage.documentationFiles) {
        const contents = await readFile(path.join(repositoryRoot, relativeFile), "utf8");
        for (const match of contents.matchAll(/<!--\s*pokie-cli-capability:\s*([a-z-]+)=([^\s]+)\s*-->/g)) {
            capabilities.add(`${match[1]}:${match[2]}`);
        }
    }
    return capabilities;
}

function checkCoverage(inventory, coverage, documented) {
    const ownerIds = new Set(coverage.owners.map((owner) => owner.id));
    if (!ownerIds.has("alias:help")) fail("coverage map must assign an owner to the built-in -h help alias.");
    const missing = [...inventoryCapabilities(inventory), ...documented].filter((id) => !ownerIds.has(id));
    const unexpectedHelpAliases = inventory.commands.flatMap((command) => command.aliases.filter((alias) => alias !== HELP_ALIAS).map((alias) => `${command.path}:${alias}`));
    const expectedRoots = coverage.initialInventory.rootCommands;
    const expectedVerbs = coverage.initialInventory.nestedVerbs;
    const actualVerbs = inventory.commands.filter((command) => command.path.includes(" ")).map((command) => command.path).sort();
    const differences = [
        ...missing.map((id) => `unowned public capability ${id}`),
        ...unexpectedHelpAliases.map((alias) => `unowned nonstandard alias ${alias}`),
        ...(JSON.stringify(inventory.rootCommands) === JSON.stringify(expectedRoots) ? [] : [`root command inventory changed: ${inventory.rootCommands.join(", ")}`]),
        ...(JSON.stringify(actualVerbs) === JSON.stringify(expectedVerbs) ? [] : [`nested verb inventory changed: ${actualVerbs.join(", ")}`]),
    ];
    if (differences.length > 0) fail(differences.join("; "));
}

async function writeEvidence(evidenceDir, first, second, coveragePath) {
    await mkdir(evidenceDir, {recursive: true});
    const firstJson = `${JSON.stringify(first.inventory, null, 2)}\n`;
    const secondJson = `${JSON.stringify(second.inventory, null, 2)}\n`;
    const firstHash = createHash("sha256").update(firstJson).digest("hex");
    const secondHash = createHash("sha256").update(secondJson).digest("hex");
    if (firstHash !== secondHash) fail(`independent rerun inventory differs (${firstHash} != ${secondHash}).`);
    await writeFile(path.join(evidenceDir, "inventory.json"), firstJson);
    await writeFile(path.join(evidenceDir, "inventory-rerun.json"), secondJson);
    await writeFile(
        path.join(evidenceDir, "collector-transcript.txt"),
        [...first.transcript, `ARTIFACT inventory.json sha256=${firstHash}`, "INDEPENDENT_RERUN", ...second.transcript, `ARTIFACT inventory-rerun.json sha256=${secondHash}`, `INPUT_PROVENANCE coverage=${coveragePath}`].join("\n") + "\n",
    );
}

async function main() {
    const arguments_ = parseArguments(process.argv);
    const coverage = JSON.parse(await readFile(arguments_.coverage, "utf8"));
    const first = await collect(arguments_.cli);
    const second = await collect(arguments_.cli);
    const documented = await documentationCapabilities(coverage);
    checkCoverage(first.inventory, coverage, documented);
    if (arguments_.evidenceDir) await writeEvidence(arguments_.evidenceDir, first, second, arguments_.coverage);
    console.log(`P7_CLI_INVENTORY_PASS roots=${first.inventory.rootCommands.length} nested=${first.inventory.commands.filter((command) => command.path.includes(" ")).length}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});

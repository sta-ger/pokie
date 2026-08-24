#!/usr/bin/env node
/** Collect the executable CLI contract and the configured public documentation contract. */
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
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
// Keep this list deliberately tied to public switches, rather than to a hand-maintained
// vocabulary.  A new enum-like switch is a public contract and must be added here with an
// owner before it can be documented.
const VALUE_KINDS = [["target", "--target"], ["source-type", "--source-type"], ["output-format", "--format"], ["mode", "--mode"], ["output", "--to"]];

function fail(message) { throw new Error(`P7 CLI inventory: ${message}`); }

function parseArguments(argv) {
    const result = {cli: undefined, coverage: DEFAULT_COVERAGE, evidenceDir: undefined};
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index];
        if (["--cli", "--coverage", "--evidence-dir"].includes(argument)) {
            const value = argv[++index];
            if (!value) fail(`${argument} requires a value.`);
            result[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = path.resolve(value);
        } else fail(`unknown argument ${JSON.stringify(argument)}. Usage: node scripts/check-cli-inventory.mjs --cli <built-or-packed-pokie.js> [--coverage <map.json>] [--evidence-dir <dir>]`);
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
        for (const token of line.match(/(?:^|[\s,])(-{1,2}[a-z][a-z0-9-]*)\b/gi) ?? []) tokens.add(token.trim().replace(/,$/, ""));
    }
    return [...tokens].sort();
}

function usageArguments(help) {
    const usage = help.split("\n").find((line) => /^Usage:\s+pokie\b/i.test(line));
    if (!usage) return [];
    // Commander keeps positional contracts on the Usage line.  Preserve the brackets so
    // required and optional positionals are different inventory entries.
    return [...usage.matchAll(/(?:<[^>]+>|\[[^\]]+\])/g)].map((match) => match[0]).filter((entry) => !entry.startsWith("[options"));
}

function valuesFromText(text) {
    const values = new Set();
    for (const match of text.matchAll(/(?:["'`])([a-z][a-z0-9-]*)(?:["'`])/gi)) values.add(match[1]);
    for (const match of text.matchAll(/\bone of\s*:?\s*([^\n.]+)|\b(?:supports?|values?|types?|formats?|modes?)\b\s*(?::|are|is)\s*([^\n.]+)/gi)) {
        for (const value of (match[1] ?? match[2]).match(/[a-z][a-z0-9-]*/gi) ?? []) values.add(value);
    }
    return [...values].filter((value) => !["a", "an", "and", "are", "default", "for", "is", "of", "one", "or", "target", "the", "to", "value", "values"].includes(value.toLowerCase()));
}

function advertisedValues(help) {
    const capabilities = new Set();
    const lines = help.split("\n");
    for (const [kind, option] of VALUE_KINDS) {
        for (const line of lines.filter((candidate) => candidate.includes(option))) {
            for (const value of valuesFromText(line)) capabilities.add(`${kind}:${value}`);
            // Export's Commander synopsis intentionally keeps the value placeholder generic;
            // its public description names the three accepted artifact forms in prose.
            if (option === "--to") for (const value of line.match(/\b(?:outcomes|adapter|workbook)\b/gi) ?? []) capabilities.add(`${kind}:${value.toLowerCase()}`);
            const inline = line.match(new RegExp(`${option}\\s+(?!<)([a-z][a-z0-9-]*(?:\\s*\\|\\s*[a-z][a-z0-9-]*)*)`, "i"));
            for (const value of inline?.[1].split("|").map((item) => item.trim()) ?? []) capabilities.add(`${kind}:${value}`);
        }
    }
    for (const [kind, label] of [["source-type", "(?:source(?:[- ]type)?|project type)"], ["target", "target"], ["output-format", "(?:output )?format"], ["mode", "mode"]]) {
        for (const match of help.matchAll(new RegExp(`${label}s?\\s*(?::|are|is)\\s*([^\\n.]+)`, "gi"))) {
            for (const value of valuesFromText(match[1])) capabilities.add(`${kind}:${value}`);
        }
    }
    return [...capabilities].sort();
}

export async function collect(cli) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pokie-p7-cli-inventory-"));
    const transcript = [`WORKDIR ${temporaryDirectory}`, `INPUT_PROVENANCE executable=${cli}`];
    try {
        const root = runCli(cli, ["--help"], temporaryDirectory);
        transcript.push(`COMMAND ${root.command}`, `EXIT ${root.exitCode}`);
        // The bare invocation is the implicit Studio command.  Its help is reachable through
        // a real root option, and is the executable contract behind documented `pokie --no-open`.
        const implicitRoot = runCli(cli, ["--no-open", "--help"], temporaryDirectory);
        transcript.push(`COMMAND ${implicitRoot.command}`, `EXIT ${implicitRoot.exitCode}`);
        const queue = commandNames(root.output).map((name) => [name]);
        const seen = new Set();
        const rootTokens = [...new Set([...optionTokens(root.output), ...optionTokens(implicitRoot.output)])].sort();
        const commands = [{path: "root", usage: usageArguments(implicitRoot.output).length > 0 ? usageArguments(implicitRoot.output) : usageArguments(root.output), options: rootTokens, aliases: rootTokens.filter((token) => token.startsWith("-") && !token.startsWith("--")), values: [...new Set([...advertisedValues(root.output), ...advertisedValues(implicitRoot.output)])].sort()}];
        while (queue.length > 0) {
            const pathParts = queue.shift();
            const key = pathParts.join(" ");
            if (seen.has(key)) continue;
            seen.add(key);
            const response = runCli(cli, [...pathParts, "--help"], temporaryDirectory);
            transcript.push(`COMMAND ${response.command}`, `EXIT ${response.exitCode}`);
            commands.push({path: key, usage: usageArguments(response.output), options: optionTokens(response.output), aliases: optionTokens(response.output).filter((token) => token.startsWith("-") && !token.startsWith("--")), values: advertisedValues(response.output)});
            for (const child of commandNames(response.output)) queue.push([...pathParts, child]);
        }
        commands.sort((left, right) => left.path.localeCompare(right.path));
        return {inventory: {schemaVersion: 2, rootCommands: commandNames(root.output).sort(), commands}, transcript};
    } finally { await rm(temporaryDirectory, {recursive: true, force: true}); }
}

export function inventoryCapabilities(inventory) {
    const capabilities = new Set(inventory.rootCommands.map((name) => `command:${name}`));
    for (const command of inventory.commands) {
        if (command.path !== "root" && command.path.includes(" ")) capabilities.add(`subcommand:${command.path}`);
        for (const option of command.options) {
            if (option.startsWith("--") && option !== "--help") capabilities.add(`option:${command.path}:${option}`);
            else if (option.startsWith("-") && !option.startsWith("--") && option !== HELP_ALIAS) capabilities.add(`alias:${command.path}:${option}`);
        }
        for (const argument of command.usage ?? []) capabilities.add(`argument:${command.path}:${argument}`);
        if (command.aliases.includes(HELP_ALIAS)) capabilities.add("alias:help");
        for (const value of command.values) capabilities.add(value);
    }
    return capabilities;
}

function globExpression(pattern) {
    return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`);
}

async function allFiles(root, relative = "") {
    const entries = await readdir(path.join(root, relative), {withFileTypes: true});
    const files = [];
    for (const entry of entries) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) files.push(...await allFiles(root, child));
        else if (entry.isFile()) files.push(child.replaceAll(path.sep, "/"));
    }
    return files;
}

async function configuredDocumentationFiles(coverage, root) {
    if (!coverage.documentationScope) return coverage.documentationFiles;
    const included = coverage.documentationScope.include.map(globExpression);
    const excluded = (coverage.documentationScope.exclude ?? []).map(globExpression);
    return (await allFiles(root)).filter((file) => included.some((expression) => expression.test(file)) && !excluded.some((expression) => expression.test(file))).sort();
}

function documentedCapabilities(contents, inventory) {
    const capabilities = new Set();
    const nestedVerbs = new Set(inventory.commands.filter((command) => command.path.includes(" ")).map((command) => command.path));
    const commandFor = (rootCommand, remainder) => {
        const verb = remainder.match(/^\s+([a-z][a-z0-9-]*)\b/i)?.[1];
        return verb && nestedVerbs.has(`${rootCommand} ${verb}`) ? `${rootCommand} ${verb}` : rootCommand;
    };
    const addInvocation = (rootCommand, remainder = "") => {
        const command = rootCommand ? commandFor(rootCommand, remainder) : "root";
        capabilities.add(command.includes(" ") ? `subcommand:${command}` : `command:${command}`);
        if (command === "root") capabilities.delete("command:root");
        for (const option of remainder.match(/(?<![\w-])--[a-z][a-z0-9-]*/gi) ?? []) capabilities.add(`option:${command}:${option}`);
        for (const alias of remainder.match(/(?<![\w-])-[a-z]\b/gi) ?? []) capabilities.add(`alias:${command}:${alias}`);
        for (const argument of remainder.match(/(?:<[^>]+>|\[[^\]]+\])/g) ?? []) capabilities.add(`argument:${command}:${argument}`);
        for (const [kind, option] of VALUE_KINDS) {
            const expression = new RegExp(`${option}\\s+(?!<)([a-z][a-z0-9-]*(?:\\s*\\|\\s*[a-z][a-z0-9-]*)*)`, "gi");
            for (const valueMatch of remainder.matchAll(expression)) for (const value of valueMatch[1].split("|").map((value) => value.trim())) capabilities.add(`value:${kind}:${command}:${value}`);
        }
        return command;
    };
    // A root invocation has no command token; it is still a public claim (notably --help,
    // -h and the implicit Studio flags).
    for (const match of contents.matchAll(/(?:\bnpx\s+)?\bpokie(?:\.js)?(?:(\s+)([a-z][a-z0-9-]*))?([^\n]*?)(?=(?:\bnpx\s+)?\bpokie(?:\.js)?\b|\n|$)/gi)) {
        const rootCommand = match[2];
        const remainder = `${rootCommand ? " " : ""}${rootCommand ?? ""}${match[3] ?? ""}`;
        addInvocation(rootCommand, remainder);
    }
    // Narrative option/value claims frequently sit below a `pokie …` heading rather than
    // repeat the complete invocation. Associate those claims with that public heading.
    let currentCommand;
    for (const line of contents.split("\n")) {
        const heading = line.match(/^#{1,6}\s+.*?\bpokie(?:\.js)?(?:\s+([a-z][a-z0-9-]*))?\b(.*)$/i);
        if (heading) currentCommand = addInvocation(heading[1], `${heading[1] ? " " : ""}${heading[1] ?? ""}${heading[2] ?? ""}`);
        if (!currentCommand) continue;
        for (const option of line.match(/(?<![\w-])--[a-z][a-z0-9-]*/gi) ?? []) capabilities.add(`option:${currentCommand}:${option}`);
        for (const alias of line.match(/(?<![\w-])-[a-z]\b/gi) ?? []) capabilities.add(`alias:${currentCommand}:${alias}`);
        for (const argument of line.match(/(?:<[^>]+>|\[[^\]]+\])/g) ?? []) capabilities.add(`argument:${currentCommand}:${argument}`);
        for (const [kind, option] of VALUE_KINDS) {
            const expression = new RegExp(`${option}\\s+(?!<)([a-z][a-z0-9-]*(?:\\s*\\|\\s*[a-z][a-z0-9-]*)*)`, "gi");
            for (const valueMatch of line.matchAll(expression)) for (const value of valueMatch[1].split("|").map((value) => value.trim())) capabilities.add(`value:${kind}:${currentCommand}:${value}`);
        }
    }
    for (const [kind, label] of [["target", "targets?"], ["source-type", "source types?"], ["output-format", "output formats?"], ["mode", "modes?"]]) {
        for (const match of contents.matchAll(new RegExp(`\\b${label}:([^\\n]+)`, "gi"))) {
            for (const value of match[1].matchAll(/`([a-z][a-z0-9-]*)`/gi)) capabilities.add(`value:${kind}:${value[1]}`);
        }
    }
    return capabilities;
}

export async function documentationCapabilities(coverage, inventory, coveragePath = DEFAULT_COVERAGE) {
    const capabilities = new Set();
    const root = coverage.documentationRoot ? path.resolve(path.dirname(coveragePath), coverage.documentationRoot) : repositoryRoot;
    for (const configuredFile of await configuredDocumentationFiles(coverage, root)) {
        const contents = await readFile(path.resolve(root, configuredFile), "utf8");
        for (const capability of documentedCapabilities(contents, inventory)) capabilities.add(capability);
    }
    return capabilities;
}

export function checkCoverage(inventory, coverage, documented) {
    const ownerIds = new Set(coverage.owners.map((owner) => owner.id));
    const hasOwner = (id) => ownerIds.has(id) || (id.startsWith("argument:") && ownerIds.has(`${id.split(":").slice(0, 2).join(":")}:*`));
    const executable = inventoryCapabilities(inventory);
    const missing = [...executable].filter((id) => !hasOwner(id));
    for (const capability of documented) {
        if (capability.startsWith("value:")) {
            const [, kind, command, value] = capability.split(":");
            const actual = command ? inventory.commands.find((entry) => entry.path === command)?.values.includes(`${kind}:${value}`) : inventory.commands.some((entry) => entry.values.includes(`${kind}:${value}`));
            if (!actual) missing.push(`stale documented capability ${capability}`);
            if (!ownerIds.has(`${kind}:${value}`)) missing.push(`unowned public capability ${kind}:${value}`);
        } else if (capability.startsWith("argument:")) {
            const [, command, ...parts] = capability.split(":");
            const argument = parts.join(":");
            const actual = inventory.commands.find((entry) => entry.path === command)?.usage.includes(argument);
            if (!actual) missing.push(`stale documented capability ${capability}`);
            if (!hasOwner(capability)) missing.push(`unowned public capability ${capability}`);
        } else if (capability.startsWith("alias:")) {
            const [, command, alias] = capability.split(":");
            const actual = inventory.commands.find((entry) => entry.path === command)?.aliases.includes(alias);
            if (!actual) missing.push(`stale documented capability ${capability}`);
            if (!ownerIds.has(alias === HELP_ALIAS ? "alias:help" : capability)) missing.push(`unowned public capability ${capability}`);
        } else if (capability.startsWith("option:")) {
            const [, command, option] = capability.split(":");
            const actual = inventory.commands.find((entry) => entry.path === command)?.options.includes(option);
            if (!actual) missing.push(`stale documented capability ${capability}`);
            if (!ownerIds.has(capability)) missing.push(`unowned public capability ${capability}`);
        } else {
            if (!executable.has(capability)) missing.push(`stale documented capability ${capability}`);
            if (!ownerIds.has(capability)) missing.push(`unowned public capability ${capability}`);
        }
    }
    const actualVerbs = inventory.commands.filter((command) => command.path.includes(" ")).map((command) => command.path).sort();
    const differences = [...new Set(missing)].map((id) => id.startsWith("stale documented capability") || id.startsWith("unowned public capability") ? id : `unowned public capability ${id}`);
    if (JSON.stringify(inventory.rootCommands) !== JSON.stringify(coverage.initialInventory.rootCommands)) differences.push(`root command inventory changed: ${inventory.rootCommands.join(", ")}`);
    if (JSON.stringify(actualVerbs) !== JSON.stringify(coverage.initialInventory.nestedVerbs)) differences.push(`nested verb inventory changed: ${actualVerbs.join(", ")}`);
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
    await writeFile(path.join(evidenceDir, "collector-transcript.txt"), [...first.transcript, `ARTIFACT inventory.json sha256=${firstHash}`, "INDEPENDENT_RERUN", ...second.transcript, `ARTIFACT inventory-rerun.json sha256=${secondHash}`, `INPUT_PROVENANCE coverage=${coveragePath}`].join("\n") + "\n");
}

export async function main(argv = process.argv) {
    const arguments_ = parseArguments(argv);
    const coverage = JSON.parse(await readFile(arguments_.coverage, "utf8"));
    const first = await collect(arguments_.cli);
    const second = await collect(arguments_.cli);
    checkCoverage(first.inventory, coverage, await documentationCapabilities(coverage, first.inventory, arguments_.coverage));
    if (arguments_.evidenceDir) await writeEvidence(arguments_.evidenceDir, first, second, arguments_.coverage);
    console.log(`P7_CLI_INVENTORY_PASS roots=${first.inventory.rootCommands.length} nested=${first.inventory.commands.filter((command) => command.path.includes(" ")).length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

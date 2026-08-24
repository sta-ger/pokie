import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checker = path.join(root, "scripts/check-cli-inventory.mjs");

async function fixture(extraHelp = "", documentation = "pokie build --target supported\n") {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-inventory-test-"));
    const cli = path.join(directory, "cli.mjs");
    const coverage = path.join(directory, "coverage.json");
    await writeFile(cli, `
const key = process.argv.slice(2).join(" ");
const help = key === "--help" ? "Usage: pokie\\n\\nOptions:\\n  -h, --help  help\\n\\nCommands:\\n  build  build an artifact\\n${extraHelp}" : key === "--no-open --help" ? "Usage: pokie [projectRoot]\\n\\nOptions:\\n  -h, --help  help\\n  --no-open  do not open\\n" : "Usage: pokie build <project>\\n\\nOptions:\\n  -h, --help  help\\n  --target <target>  one of: supported\\n  --source-type <type>  one of: blueprint\\n  --format <format>  one of: json\\n  --mode <mode>  one of: base\\n";
process.stdout.write(help);
`);
    await writeFile(path.join(directory, "docs.md"), documentation);
    await writeFile(coverage, JSON.stringify({
        documentationRoot: ".",
        documentationScope: {include: ["**/*.md"]},
        initialInventory: {rootCommands: ["build"], nestedVerbs: []},
        owners: [
            {id: "command:build", owner: "test"},
            {id: "alias:help", owner: "test"},
            {id: "option:root:--help", owner: "test"},
            {id: "option:root:--no-open", owner: "test"},
            {id: "argument:root:[projectRoot]", owner: "test"},
            {id: "argument:build:<project>", owner: "test"},
            {id: "option:build:--target", owner: "test"},
            {id: "option:build:--source-type", owner: "test"},
            {id: "option:build:--format", owner: "test"},
            {id: "option:build:--mode", owner: "test"},
            {id: "target:supported", owner: "test"},
            {id: "source-type:blueprint", owner: "test"},
            {id: "output-format:json", owner: "test"},
            {id: "mode:base", owner: "test"},
        ],
    }));
    return {directory, cli, coverage};
}

function run(cli, coverage, evidenceDir) {
    return spawnSync(process.execPath, [checker, "--cli", cli, "--coverage", coverage, "--evidence-dir", evidenceDir], {encoding: "utf8"});
}

test("collects root aliases and executable values across independent help walks", async () => {
    const {directory, cli, coverage} = await fixture();
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 0, result.stderr);
        const inventory = JSON.parse(await readFile(path.join(directory, "evidence/inventory.json"), "utf8"));
        assert.deepEqual(inventory.commands.find((command) => command.path === "root").aliases, ["-h"]);
        assert.deepEqual(inventory.commands.find((command) => command.path === "build").usage, ["<project>"]);
        assert.match(await readFile(path.join(directory, "evidence/collector-transcript.txt"), "utf8"), /INDEPENDENT_RERUN/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("checks root flags, positional contracts, and export --to values against owners", async () => {
    const {directory, cli, coverage} = await fixture("  export  export an artifact\\n", "`pokie --help`, `pokie -h`, and `pokie --no-open` are public. `pokie build <project> --target supported`. `pokie export <source> --to outcomes|adapter|workbook`.\n");
    try {
        await writeFile(cli, `
const key = process.argv.slice(2).join(" ");
const root = "Usage: pokie\\n\\nOptions:\\n  -h, --help  help\\n\\nCommands:\\n  build  build\\n  export  export\\n";
const studio = "Usage: pokie [projectRoot]\\n\\nOptions:\\n  -h, --help  help\\n  --no-open  do not open\\n";
const build = "Usage: pokie build <project>\\n\\nOptions:\\n  -h, --help  help\\n  --target <target> one of: supported\\n";
const exportHelp = "Usage: pokie export <source> [excess...]\\n\\nOptions:\\n  -h, --help help\\n  --to <artifact> outcomes, adapter, or workbook\\n";
process.stdout.write(key === "--help" ? root : key === "--no-open --help" ? studio : key === "export --help" ? exportHelp : build);
`);
        const map = JSON.parse(await readFile(coverage, "utf8"));
        map.initialInventory.rootCommands = ["build", "export"];
        map.owners.push({id: "command:export", owner: "test"}, {id: "option:export:--to", owner: "test"}, {id: "argument:export:<source>", owner: "test"}, {id: "argument:export:[excess...]", owner: "test"}, {id: "output:outcomes", owner: "test"}, {id: "output:adapter", owner: "test"}, {id: "output:workbook", owner: "test"});
        await writeFile(coverage, JSON.stringify(map));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 0, result.stderr);
        const mapWithoutOutputOwner = JSON.parse(await readFile(coverage, "utf8"));
        mapWithoutOutputOwner.owners = mapWithoutOutputOwner.owners.filter((entry) => entry.id !== "output:workbook");
        await writeFile(coverage, JSON.stringify(mapWithoutOutputOwner));
        const rejected = run(cli, coverage, path.join(directory, "rejected"));
        assert.equal(rejected.status, 1);
        assert.match(rejected.stderr, /output:workbook/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects unowned executable commands, aliases, and advertised values", async () => {
    const {directory, cli, coverage} = await fixture("  deploy  unowned\\n");
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /unowned public capability command:deploy/);
        await writeFile(cli, `process.stdout.write(process.argv.slice(2).join(" ") === "--help" ? "Options:\\n  -x, --experimental  experimental\\n\\nCommands:\\n  build  build\\n" : "Options:\\n  --target <target>  one of: supported, experimental\\n  --source-type <type>  one of: blueprint, rogue-source\\n  --format <format>  one of: json, rogue-format\\n  --mode <mode>  one of: base, rogue-mode\\n");`);
        const valueResult = run(cli, coverage, path.join(directory, "evidence-value"));
        assert.equal(valueResult.status, 1);
        assert.match(valueResult.stderr, /alias:root:-x/);
        assert.match(valueResult.stderr, /target:experimental/);
        assert.match(valueResult.stderr, /source-type:rogue-source/);
        assert.match(valueResult.stderr, /output-format:rogue-format/);
        assert.match(valueResult.stderr, /mode:rogue-mode/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects an ordinary unowned documentation claim without a marker", async () => {
    const {directory, cli, coverage} = await fixture("", "```sh\npokie build --target supported\npokie deploy --target experimental\n```\n");
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /command:deploy/);
        assert.match(result.stderr, /target:experimental/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("discovers narrative documentation and rejects command-scoped stale claims", async () => {
    const {directory, cli, coverage} = await fixture("", "The normal command is pokie build --target supported.\n");
    try {
        await mkdir(path.join(directory, "public-guides"));
        await writeFile(path.join(directory, "public-guides/narrative.md"), "A stale example is npx pokie build --source-type rogue-source --target supported --mode base -x.\n");
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /stale documented capability value:source-type:build:rogue-source/);
        assert.match(result.stderr, /stale documented capability alias:build:-x/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects documentation options that belong to another executable command", async () => {
    const {directory, cli, coverage} = await fixture("", "pokie build --dry-run\n");
    try {
        const map = JSON.parse(await readFile(coverage, "utf8"));
        map.owners.push({id: "option:other:--dry-run", owner: "test"});
        await writeFile(coverage, JSON.stringify(map));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /stale documented capability option:build:--dry-run/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

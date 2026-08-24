import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
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
const help = key === "--help" ? "Usage: pokie\\n\\nOptions:\\n  -h, --help  help\\n\\nCommands:\\n  build  build an artifact\\n${extraHelp}" : "Usage: pokie build\\n\\nOptions:\\n  -h, --help  help\\n  --target <target>  one of: supported\\n  --source-type <type>  one of: blueprint\\n  --format <format>  one of: json\\n  --mode <mode>  one of: base\\n";
process.stdout.write(help);
`);
    await writeFile(path.join(directory, "docs.md"), documentation);
    await writeFile(coverage, JSON.stringify({
        documentationRoot: ".",
        documentationFiles: ["docs.md"],
        initialInventory: {rootCommands: ["build"], nestedVerbs: []},
        owners: [
            {id: "command:build", owner: "test"},
            {id: "alias:help", owner: "test"},
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
        assert.match(await readFile(path.join(directory, "evidence/collector-transcript.txt"), "utf8"), /INDEPENDENT_RERUN/);
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

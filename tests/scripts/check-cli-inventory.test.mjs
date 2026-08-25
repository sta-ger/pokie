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
        findings: {
            versionHelp: {helpExitCode: 0, versionExitCode: 0, versionOutputIncludes: "Usage: pokie build"},
            implicitRoot: {helpExitCode: 0, usage: "Usage: pokie [projectRoot]", requiredOptions: ["--no-open"]},
        },
        owners: [
            {id: "command:build", owner: "test"},
            {id: "alias:root:-h", owner: "test"},
            {id: "alias:build:-h", owner: "test"},
            {id: "option:root:--help", owner: "test"},
            {id: "option:root:--no-open", owner: "test"},
            {id: "option:build:--help", owner: "test"},
            {id: "argument:root:[projectRoot]", owner: "test"},
            {id: "argument:build:<project>", owner: "test"},
            {id: "option:build:--target", owner: "test"},
            {id: "option:build:--source-type", owner: "test"},
            {id: "option:build:--format", owner: "test"},
            {id: "option:build:--mode", owner: "test"},
            {id: "value:build:--target:supported", owner: "test"},
            {id: "value:build:--source-type:blueprint", owner: "test"},
            {id: "value:build:--format:json", owner: "test"},
            {id: "value:build:--mode:base", owner: "test"},
            {id: "target:supported", owner: "test"},
            {id: "source-type:blueprint", owner: "test"},
            {id: "output-format:json", owner: "test"},
            {id: "mode:base", owner: "test"},
            {id: "finding:version-help", owner: "test"},
            {id: "finding:implicit-studio", owner: "test"},
            {id: "finding:documentation-claims", owner: "test"},
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
const build = "Usage: pokie build <project>\\n\\nOptions:\\n  -h, --help  help\\n  --target <target> one of: supported\\n  --source-type <type> one of: blueprint\\n  --format <format> one of: json\\n  --mode <mode> one of: base\\n";
const exportHelp = "Usage: pokie export <source> [excess...]\\n\\nOptions:\\n  -h, --help help\\n  --to <artifact> outcomes, adapter, or workbook\\n";
process.stdout.write(key === "--help" ? root : key === "--no-open --help" ? studio : key === "export --help" ? exportHelp : build);
`);
        const map = JSON.parse(await readFile(coverage, "utf8"));
        map.initialInventory.rootCommands = ["build", "export"];
        map.owners.push({id: "command:export", owner: "test"}, {id: "option:export:--help", owner: "test"}, {id: "alias:export:-h", owner: "test"}, {id: "option:export:--to", owner: "test"}, {id: "argument:export:<source>", owner: "test"}, {id: "argument:export:[excess...]", owner: "test"}, {id: "value:export:--to:outcomes", owner: "test"}, {id: "value:export:--to:adapter", owner: "test"}, {id: "value:export:--to:workbook", owner: "test"}, {id: "output:outcomes", owner: "test"}, {id: "output:adapter", owner: "test"}, {id: "output:workbook", owner: "test"});
        await writeFile(coverage, JSON.stringify(map));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 0, result.stderr);
        const mapWithoutOutputOwner = JSON.parse(await readFile(coverage, "utf8"));
        mapWithoutOutputOwner.owners = mapWithoutOutputOwner.owners.filter((entry) => entry.id !== "value:export:--to:workbook");
        await writeFile(coverage, JSON.stringify(mapWithoutOutputOwner));
        const rejected = run(cli, coverage, path.join(directory, "rejected"));
        assert.equal(rejected.status, 1);
        assert.match(rejected.stderr, /value:export:--to:workbook/);
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
        assert.match(valueResult.stderr, /value:build:--target:experimental/);
        assert.match(valueResult.stderr, /value:build:--source-type:rogue-source/);
        assert.match(valueResult.stderr, /value:build:--format:rogue-format/);
        assert.match(valueResult.stderr, /value:build:--mode:rogue-mode/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects an ordinary unowned documentation invocation without a marker", async () => {
    const {directory, cli, coverage} = await fixture("", "Try pokie deploy --target experimental.\n");
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /command:deploy/);
        assert.match(result.stderr, /option:deploy:--target/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects a punctuated narrative claim for an unknown command", async () => {
    const {directory, cli, coverage} = await fixture("", "Pokie deploy is available.\n");
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /command:deploy/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("discovers narrative documentation and rejects command-scoped stale claims", async () => {
    const {directory, cli, coverage} = await fixture("", "The normal command is pokie build --target supported.\n");
    try {
        await mkdir(path.join(directory, "public-guides"));
        await writeFile(path.join(directory, "public-guides/narrative.md"), "A stale example is npx pokie build --source-type rogue-source --target supported --mode base -x.\n");
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /stale documented capability value:build:--source-type:rogue-source/);
        assert.match(result.stderr, /stale documented capability alias:build:-x/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("keeps command context for ordinary claims below a CLI heading", async () => {
    const {directory, cli, coverage} = await fixture("", "## pokie build\n\nUse --target futureTarget.\n");
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /stale documented capability value:build:--target:futureTarget/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects an owned category claim when fresh help does not advertise its value", async () => {
    const {directory, cli, coverage} = await fixture("", "## pokie build\n\nThe target is obsolete.\n");
    try {
        const map = JSON.parse(await readFile(coverage, "utf8"));
        map.owners.push({id: "target:obsolete", owner: "stale fixture owner"});
        await writeFile(coverage, JSON.stringify(map));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /stale documented capability target:obsolete/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects arbitrary narrative category and heading-scoped positional claims", async () => {
    const {directory, cli, coverage} = await fixture("", "## pokie build\n\nThe target is futureTarget. The source type is rareSource. The output format is orbital. The output form is archive. The mode is turbo. Use <obsolete> [optional-profile] as the arguments.\n");
    try {
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /target:futureTarget/);
        assert.match(result.stderr, /source-type:rareSource/);
        assert.match(result.stderr, /output-format:orbital/);
        assert.match(result.stderr, /output:archive/);
        assert.match(result.stderr, /mode:turbo/);
        assert.match(result.stderr, /argument:build:\[optional-profile\]/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("rejects a version/help or implicit-root finding that no longer matches the fresh CLI", async () => {
    const {directory, cli, coverage} = await fixture();
    try {
        const map = JSON.parse(await readFile(coverage, "utf8"));
        map.findings.versionHelp.versionExitCode = 1;
        map.findings.implicitRoot.usage = "Usage: studio [options]";
        await writeFile(coverage, JSON.stringify(map));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /version\/help finding differs from the fresh CLI/);
        assert.match(result.stderr, /implicit-root finding differs from the fresh CLI/);
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

test("requires individual owners for newly advertised positionals, help flags, and arbitrary value switches", async () => {
    const {directory, cli, coverage} = await fixture("", "The build command supports --flavor pistachio.\n");
    try {
        await writeFile(cli, `
const key = process.argv.slice(2).join(" ");
const root = "Usage: pokie\\n\\nOptions:\\n  -h, --help  help\\n\\nCommands:\\n  build  build\\n";
const studio = "Usage: pokie [projectRoot]\\n\\nOptions:\\n  -h, --help  help\\n  --no-open  do not open\\n";
        const build = "Usage: pokie build <project> [profile]\\n\\nOptions:\\n  -h, --help  help\\n  --target <target> one of: supported\\n  --flavor <flavor> one of: vanilla or pistachio\\n";
process.stdout.write(key === "--help" ? root : key === "--no-open --help" ? studio : build);
`);
        const map = JSON.parse(await readFile(coverage, "utf8"));
        map.owners = map.owners.filter((entry) => entry.id !== "option:build:--help" && entry.id !== "alias:build:-h");
        await writeFile(coverage, JSON.stringify(map));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /argument:build:\[profile\]/);
        assert.match(result.stderr, /option:build:--help/);
        assert.match(result.stderr, /alias:build:-h/);
        assert.match(result.stderr, /value:build:--flavor:pistachio/);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("normalizes first-contact placeholders and ignores an unknown-command recovery example", async () => {
    const {directory, cli, coverage} = await fixture("", "Use pokie init <directory>, pokie create <name>, and pokie <command> --help. A close spelling, pokie creat, suggests pokie create --help.\n");
    try {
        await writeFile(cli, `
const key = process.argv.slice(2).join(" ");
const root = "Usage: pokie <command>\\n\\nOptions:\\n  -h, --help  help\\n\\nCommands:\\n  create  create\\n  init  init\\n";
const studio = "Usage: pokie [projectRoot]\\n\\nOptions:\\n  -h, --help  help\\n  --no-open  do not open\\n";
const create = "Usage: pokie create [name]\\n\\nOptions:\\n  -h, --help  help\\n";
const init = "Usage: pokie init [directory]\\n\\nOptions:\\n  -h, --help  help\\n";
process.stdout.write(key === "--help" ? root : key === "--no-open --help" ? studio : key === "create --help" ? create : init);
`);
        await writeFile(coverage, JSON.stringify({
            documentationRoot: ".",
            documentationScope: {include: ["**/*.md"]},
            initialInventory: {rootCommands: ["create", "init"], nestedVerbs: []},
            findings: {},
            owners: [
                "command:create", "command:init",
                "alias:root:-h", "alias:create:-h", "alias:init:-h",
                "option:root:--help", "option:root:--no-open", "option:create:--help", "option:init:--help",
                "argument:root:[projectRoot]", "argument:create:[name]", "argument:init:[directory]",
            ].map((id) => ({id, owner: "test"})),
        }));
        const result = run(cli, coverage, path.join(directory, "evidence"));
        assert.equal(result.status, 0, result.stderr);
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("checks the freshly built production CLI against the complete public documentation scope", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-production-inventory-test-"));
    try {
        const runBuildStep = (arguments_) => {
            const result = spawnSync(process.execPath, arguments_, {cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
            assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        };
        const tsc = path.join(root, "node_modules/typescript/bin/tsc");
        const shx = path.join(root, "node_modules/shx/lib/cli.js");
        // This is the smallest fresh CLI build boundary: the command module plus the ESM/CJS
        // package entry points that its `pokie` imports resolve through. Browser assets are not
        // loaded by recursive `--help` collection.
        runBuildStep([path.join(root, "generate-barrels.js")]);
        runBuildStep([tsc, "--project", "tsconfig.prod.json"]);
        runBuildStep([shx, "cp", "src/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs", "dist/esm/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs"]);
        runBuildStep([tsc, "--project", "tsconfig.prod.json", "--module", "CommonJS", "--outDir", "dist/cjs"]);
        runBuildStep([path.join(root, "write-cjs-package-json.js")]);
        runBuildStep([shx, "cp", "src/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs", "dist/cjs/simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs"]);
        runBuildStep([tsc, "--project", "tsconfig.cli.json"]);
        const {checkCoverage, collect, documentationCapabilities} = await import(checker);
        const collected = await collect(path.join(root, "dist/cli/pokie.js"));
        const inventory = collected.inventory;
        assert.equal(inventory.rootCommands.length, 20);
        assert.equal(inventory.commands.filter((command) => command.path.includes(" ")).length, 7);
        const coverageMap = JSON.parse(await readFile(path.join(root, "docs/evidence/p7-01-cli-inventory/coverage-map.json"), "utf8"));
        const publicClaims = await documentationCapabilities(coverageMap, inventory, path.join(root, "docs/evidence/p7-01-cli-inventory/coverage-map.json"));
        assert.ok(publicClaims.has("command:build"));
        assert.doesNotThrow(() => checkCoverage(inventory, coverageMap, publicClaims));
    } finally { await rm(directory, {recursive: true, force: true}); }
}, 180000);

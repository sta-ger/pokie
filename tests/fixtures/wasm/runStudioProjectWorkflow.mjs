// Controller-owned installed/rendered acceptance; requires an explicitly prepared candidate package.
// node tests/fixtures/wasm/runStudioProjectWorkflow.mjs /absolute/candidate/package/root
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

assert(process.argv[2], "Supply the prepared candidate package root; this runner never builds or installs it.");
const candidate = path.resolve(process.argv[2]);
assert(fs.existsSync(path.join(candidate, "dist/cli/pokie.js")), "The candidate must contain its built public CLI.");
const require = createRequire(import.meta.url);
const {GamePackageGenerator, loadPokieGameRuntime, WasmArtifactBuilder, PROJECT_TYPE_CAPABILITIES} = require(path.join(candidate, "dist/cjs/index.js"));
const temporaryRoot = fileURLToPath(new URL("../../../node_modules/.cache/pokie-tmp/", import.meta.url));
fs.mkdirSync(temporaryRoot, {recursive: true});
const directory = fs.mkdtempSync(path.join(temporaryRoot, "v2c22-installed-workflow-"));
const blueprint = {
    manifest: {id: "wasm-project-workflow", name: "WASM project workflow", version: "1.0.0"},
    reels: 3, rows: 1, symbols: ["A", "B", "C"], wilds: [], scatters: [],
    reelStrips: [["A", "B", "C"], ["A", "B", "C"], ["A", "B", "C"]], paylines: [[0, 0, 0]],
    availableBets: [0.05, 7.5, 1e-7], paytable: {A: {3: 5}, B: {3: 0}},
};
let loaded;
try {
    const generated = new GamePackageGenerator("1.3.0").generate(blueprint, directory);
    const dependencies = path.join(generated.projectRoot, "node_modules/@fromstan");
    fs.mkdirSync(dependencies, {recursive: true});
    fs.symlinkSync(candidate, path.join(dependencies, "pokie"), "dir");
    loaded = await loadPokieGameRuntime(generated.projectRoot);
    const source = path.join(directory, "parity.blueprint.json");
    const artifact = path.join(directory, "parity.wasm");
    fs.writeFileSync(source, JSON.stringify(blueprint));
    await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "V2C-22 installed workflow"}, artifact);
    const session = loaded.game.createSession({seed: "0"});
    const expected = blueprint.availableBets.map(bet => {
        session.setBet(bet);
        session.play();
        return {bet, screen: session.getSymbolsCombination().toMatrix(), win: session.getWinAmount(), credits: session.getCreditsAmount()};
    });
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./studioProjectWorkflow.browser.mjs", import.meta.url)), candidate, artifact, JSON.stringify(expected)], {encoding: "utf8", timeout: 180000});
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, "Installed/rendered WASM Project workflow failed.");
    assert(result.stdout.includes("PASS installed rendered WASM Project production Worker workflow"));
} finally {
    await loaded?.release();
    fs.rmSync(directory, {recursive: true, force: true});
}

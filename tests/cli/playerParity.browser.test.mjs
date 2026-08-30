import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {deflateSync} from "node:zlib";
import {test} from "@jest/globals";
import {
    canonicalPlayerComparisonKeys,
    canonicalPlayerSelector,
    chromiumExecutableCandidates,
    assertExactCandidatePlayerExport,
    comparePlayerRegions,
    comparePlayerScreenshots,
    exactCandidateConsumerManifest,
    desktopViewport,
    narrowViewport,
    pc12FixtureId,
    pc12FixtureSeed,
    studioLaunchArguments,
    validatePc12FixtureContract,
} from "../../scripts/pc-12-player-parity-browser.mjs";

const region = {
    cells: [{id: "0:0", symbol: "cherry", color: "rgb(255, 255, 0)"}],
    wins: ["Line: 1, win: 10"],
    features: ["Free games3"],
    totals: ["100", "10.00", "2.00"],
    paytable: ["Symbol3", "cherry10"],
    controls: [{label: "Select bet 1", disabled: true, pressed: "true"}],
    hover: ["Line: 1, win: 10"],
    styles: {player: {display: "block"}, grid: {display: "table"}},
    layout: {player: {width: 600, height: 420}, grid: {width: 240, height: 180}},
    overflow: false,
};

function png(width, height, pixels) {
    const chunk = (type, data) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = [];
    for (let row = 0; row < height; row++) rows.push(Buffer.from([0]), pixels.subarray(row * width * 4, (row + 1) * width * 4));
    return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

function runRuntimeCompiler(args) {
    const execution = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        encoding: "utf8",
    });
    assert.equal(
        execution.status,
        0,
        `PC-12 browser fixture runtime preparation failed: node ${args.join(" ")}\n${execution.stdout}\n${execution.stderr}`,
    );
}

async function prepareFixtureBrowserRuntime() {
    // The executable fixture must use the source candidate being tested, including its shared game
    // factory. Materialize the package's ESM/CJS runtime plus the two browser-facing consumers that
    // an ordinary package build creates: the public Studio CLI/static app and client/player export.
    // These are direct compiler boundaries, not the repository-wide npm build/prepack gate.
    runRuntimeCompiler([resolve(process.cwd(), "node_modules/typescript/bin/tsc"), "--project", "tsconfig.prod.json"]);
    runRuntimeCompiler([resolve(process.cwd(), "node_modules/typescript/bin/tsc"), "--project", "tsconfig.prod.json", "--module", "CommonJS", "--outDir", "dist/cjs"]);
    runRuntimeCompiler(["write-cjs-package-json.js"]);
    runRuntimeCompiler([resolve(process.cwd(), "node_modules/typescript/bin/tsc"), "--project", "tsconfig.cli.json"]);
    runRuntimeCompiler([resolve(process.cwd(), "node_modules/typescript/bin/tsc"), "--project", "tsconfig.client.json"]);
    runRuntimeCompiler([resolve(process.cwd(), "node_modules/vite/bin/vite.js"), "build", "--config", "cli/studio-client/vite.config.ts"]);
}

test("PC-12 browser parity contract targets only the canonical player region", () => {
    assert.equal(canonicalPlayerSelector, '[data-pokie-player="canonical-v1"]');
    assert.deepEqual(canonicalPlayerComparisonKeys, ["cells", "wins", "features", "totals", "paytable", "controls", "hover", "styles", "layout", "overflow"]);
    assert.doesNotThrow(() => comparePlayerRegions(region, {...region}));
});

test("PC-12 browser parity contract excludes host mount geometry but rejects material shared-player divergence", () => {
    assert.doesNotThrow(() => comparePlayerRegions(region, {...region, layout: {...region.layout, player: {width: 1000, height: 900}}}));
    assert.throws(() => comparePlayerRegions(region, {...region, controls: [{label: "Select bet 1", disabled: false, pressed: "true"}]}), /controls/);
    assert.throws(() => comparePlayerRegions(region, {...region, overflow: true}), /overflow/);
    assert.throws(() => comparePlayerRegions(region, {...region, cells: [{...region.cells[0], color: "rgb(0, 255, 0)"}]}), /cells/);
    assert.throws(() => comparePlayerRegions(region, {...region, styles: {...region.styles, player: {display: "grid"}}}), /styles/);
    assert.throws(() => comparePlayerRegions(region, {...region, layout: {...region.layout, grid: {width: 240, height: 220}}}), /layout/);
});

test("PC-12 browser parity provisions an isolated exact candidate consumer before loading examples", () => {
    const manifest = exactCandidateConsumerManifest({dependencies: {pokie: "^1.3.0", vite: "4.3.9"}}, "/tmp/pokie-1.3.0.tgz");
    assert.equal(manifest.dependencies.pokie, "file:/tmp/pokie-1.3.0.tgz");
    assert.equal(manifest.dependencies.vite, "4.3.9");
    assert.doesNotThrow(() => assertExactCandidatePlayerExport("/tmp/isolated/node_modules/pokie/dist/cli/client/player/index.js", "/tmp/isolated"));
    assert.doesNotThrow(() => assertExactCandidatePlayerExport("file:///tmp/isolated/node_modules/pokie/dist/cli/client/player/index.js", "/tmp/isolated"));
    assert.throws(() => assertExactCandidatePlayerExport("/workspace/dist/cli/client/player/index.js", "/tmp/isolated"), /isolated candidate install/);
});

test("PC-12 browser parity launches Studio through the public implicit-project form", () => {
    assert.deepEqual(
        studioLaunchArguments("/fixtures/same-game", 32192),
        ["dist/cli/pokie.js", "/fixtures/same-game", "--no-open", "--host", "127.0.0.1", "--port", "32192"],
    );
    assert.equal(studioLaunchArguments("/fixtures/same-game", 32192).includes("studio"), false);
});

test("PC-12 browser parity falls back to common Chromium executable names", () => {
    assert.deepEqual(chromiumExecutableCandidates({}), ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]);
    assert.deepEqual(chromiumExecutableCandidates({PC_12_CHROMIUM_BINARY: " /opt/chromium "}), ["/opt/chromium"]);
});

test("PC-12 browser parity's executable fixture preflight binds Studio and examples to one seeded free-games game", async () => {
    const studioProject = resolve(process.cwd(), "tests/cli/fixtures/playable-game-with-free-games");
    const supersedingProject = resolve(process.cwd(), "tests/cli/fixtures/playable-game-with-free-games-superseding");
    const examplesRoot = "/home/stager/Work/sta-ger/pokie-examples";
    const fixture = await validatePc12FixtureContract(studioProject, supersedingProject, examplesRoot);
    expect(fixture).toEqual(expect.objectContaining({fixtureId: pc12FixtureId, seed: pc12FixtureSeed, project: studioProject, supersedingProject}));
    expect(desktopViewport).toEqual({width: 1280, height: 800});
    expect(narrowViewport).toEqual({width: 390, height: 844});

    const execution = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/pc-12-player-parity-browser.mjs"), "--fixture-preflight"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {...process.env, PC_12_STUDIO_PROJECT: studioProject, PC_12_SUPERSEDING_PROJECT: supersedingProject, POKIE_EXAMPLES_PATH: examplesRoot},
    });
    expect(execution.status).toBe(0);
    expect(JSON.parse(execution.stdout)).toEqual(expect.objectContaining({status: "ok", fixture: expect.objectContaining({fixtureId: pc12FixtureId, seed: pc12FixtureSeed})}));
});

test("PC-12 browser parity compares canonical screenshots as pixels, with an anti-aliasing tolerance", () => {
    const matching = png(2, 1, Buffer.from([255, 255, 0, 255, 0, 255, 0, 255]));
    assert.deepEqual(comparePlayerScreenshots(matching, matching), {width: 2, height: 1, hostHeightDelta: 0, changedRatio: 0, meanDifference: 0});

    const divergent = png(2, 1, Buffer.from([0, 0, 255, 255, 0, 255, 0, 255]));
    assert.throws(() => comparePlayerScreenshots(matching, divergent), /screenshot diverged/);
});

test("PC-12 browser parity invokes its executable runner before browser setup", () => {
    const execution = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/pc-12-player-parity-browser.mjs")], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {PATH: process.env.PATH ?? ""},
    });

    assert.equal(execution.status, 1);
    assert.match(execution.stderr, /PC_12_STUDIO_PROJECT must name the deterministic same-game fixture package/);
});

test("PC-12 browser parity executes Studio and an isolated exact-consumer browser workflow, then cleans its staging", async () => {
    const runnerStaging = await mkdtemp(resolve(tmpdir(), "pokie-pc12-browser-test-"));
    const evidence = resolve(runnerStaging, "evidence");
    const studioProject = resolve(process.cwd(), "tests/cli/fixtures/playable-game-with-free-games");
    const supersedingProject = resolve(process.cwd(), "tests/cli/fixtures/playable-game-with-free-games-superseding");
    const examplesRoot = "/home/stager/Work/sta-ger/pokie-examples";

    try {
        await prepareFixtureBrowserRuntime();
        const execution = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/pc-12-player-parity-browser.mjs")], {
            cwd: process.cwd(),
            encoding: "utf8",
            timeout: 300_000,
            env: {
                ...process.env,
                PC_12_STUDIO_PROJECT: studioProject,
                PC_12_SUPERSEDING_PROJECT: supersedingProject,
                POKIE_EXAMPLES_PATH: examplesRoot,
                PC_12_EVIDENCE_DIR: evidence,
                PC_12_TEMP_DIR: runnerStaging,
            },
        });

        expect(execution.error).toBeUndefined();
        if (execution.status !== 0) {
            const transcript = await readFile(resolve(evidence, "TRANSCRIPT.txt"), "utf8").catch(() => "(runner transcript unavailable)");
            throw new Error(`Parity runner failed with ${execution.status}:\n${execution.stdout}\n${execution.stderr}\n${transcript}`);
        }
        const parity = JSON.parse(await readFile(resolve(evidence, "parity.json"), "utf8"));
        expect(parity).toEqual(expect.objectContaining({
            fixture: expect.objectContaining({id: pc12FixtureId, seed: pc12FixtureSeed}),
            comparison: expect.objectContaining({dom: "passed", computedStyle: "passed", layout: "passed", overflow: "passed"}),
        }));
        await expect(readFile(resolve(evidence, "studio-desktop.png"))).resolves.toBeInstanceOf(Buffer);
        await expect(readFile(resolve(evidence, "examples-mobile.png"))).resolves.toBeInstanceOf(Buffer);
        expect((await readdir(runnerStaging)).filter((entry) => entry.startsWith("pokie-pc12-"))).toEqual([]);
    } finally {
        await rm(runnerStaging, {recursive: true, force: true});
    }
}, 330_000);

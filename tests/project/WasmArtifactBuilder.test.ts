import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {WasmArtifactBuilder} from "../../src/project/WasmArtifactBuilder.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import {readWasmComponentManifest} from "../../src/project/readWasmComponentManifest.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {loadPokieWasmFileRuntime} from "../../src/wasm/node/PokieWasmFileRuntimeAdapter.js";

const blueprint = {
    manifest: {id: "wasm-fixture", name: "WASM Fixture", version: "1.0.0"},
    reels: 3,
    rows: 1,
    symbols: ["A", "B", "C"],
    reelStrips: [["A", "B", "C"], ["B", "C", "A"], ["C", "A", "B"]],
    paytable: {A: {3: 2}, B: {3: 1}, C: {3: 1}},
};

describe("WasmArtifactBuilder", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wasm-builder-test-")));
    });

    afterEach(() => fs.rmSync(workDir, {recursive: true, force: true}));

    it("publishes a valid integrity-bound canonical artifact that resolves and reads back", async () => {
        const sourcePath = path.join(workDir, "fixture.blueprint.json");
        const outputPath = path.join(workDir, "game.wasm");
        fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
        const result = await new WasmArtifactBuilder("1.3.0").build(
            {type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"},
            outputPath,
        );

        expect(result.outputPath).toBe(outputPath);
        expect(WebAssembly.validate(new Uint8Array(fs.readFileSync(outputPath)))).toBe(true);
        const project = await new ProjectTargetResolver().resolve(outputPath);
        expect(project).toBeDefined();
        const read = await readWasmComponentManifest(project!);
        expect(read).toMatchObject({supported: true, manifest: {component: {id: "wasm-fixture"}, artifact: {format: "pokie.wasm.v1", adapter: "pokie/wasm"}}});
        if (read.supported) expect(read.manifest.artifact?.bytes).toBeGreaterThan(8);
        if (read.supported) expect(read.manifest.artifact?.sha256).toBe(`sha256:${crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex")}`);
    });

    it("rejects a swapped module during resolution", async () => {
        const sourcePath = path.join(workDir, "fixture.blueprint.json");
        const outputPath = path.join(workDir, "game.wasm");
        fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
        await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, outputPath);
        fs.writeFileSync(outputPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00]));
        await expect(new ProjectTargetResolver().resolve(outputPath)).rejects.toThrow(/does not match its manifest/);
    });

    it("emits distinct executable modules for distinct game models", async () => {
        const firstSource = path.join(workDir, "first.blueprint.json");
        const secondSource = path.join(workDir, "second.blueprint.json");
        const firstOutput = path.join(workDir, "first.wasm");
        const secondOutput = path.join(workDir, "second.wasm");
        fs.writeFileSync(firstSource, JSON.stringify(blueprint));
        fs.writeFileSync(secondSource, JSON.stringify({...blueprint, manifest: {...blueprint.manifest, id: "wasm-fixture-second"}, reelStrips: [["A", "A", "B", "C"], ["A", "B", "B", "C"], ["A", "B", "C", "C"]], paytable: {A: {3: 9}, B: {3: 1}, C: {3: 1}}}));
        const builder = new WasmArtifactBuilder("1.3.0");
        await builder.build({type: "blueprint", rootPath: firstSource, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, firstOutput);
        await builder.build({type: "blueprint", rootPath: secondSource, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, secondOutput);

        expect(fs.readFileSync(firstOutput)).not.toEqual(fs.readFileSync(secondOutput));
        const firstRuntime = await loadPokieWasmFileRuntime(firstOutput, {nextRandom: () => 0.25});
        const secondRuntime = await loadPokieWasmFileRuntime(secondOutput, {nextRandom: () => 0.25});
        try {
            const firstRound = await firstRuntime.createSession("same-seed").play({bet: 1});
            const secondRound = await secondRuntime.createSession("same-seed").play({bet: 1});
            expect(firstRound.screen).not.toEqual(secondRound.screen);
            expect(firstRound.winMultiplier).not.toBe(secondRound.winMultiplier);
        } finally {
            firstRuntime.dispose();
            secondRuntime.dispose();
        }
    });

    it("rejects a valid canonical sidecar copied from another game and an unsupported adapter", async () => {
        const firstSource = path.join(workDir, "first.blueprint.json");
        const secondSource = path.join(workDir, "second.blueprint.json");
        const firstOutput = path.join(workDir, "first.wasm");
        const secondOutput = path.join(workDir, "second.wasm");
        fs.writeFileSync(firstSource, JSON.stringify(blueprint));
        fs.writeFileSync(secondSource, JSON.stringify({...blueprint, manifest: {...blueprint.manifest, id: "second"}, paytable: {A: {3: 8}, B: {3: 1}, C: {3: 1}}}));
        const builder = new WasmArtifactBuilder("1.3.0");
        await builder.build({type: "blueprint", rootPath: firstSource, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, firstOutput);
        await builder.build({type: "blueprint", rootPath: secondSource, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, secondOutput);
        const originalFirstSidecar = fs.readFileSync(`${firstOutput}.pokie-wasm.json`, "utf8");
        const mismatchedConfiguration = JSON.parse(originalFirstSidecar);
        mismatchedConfiguration.artifact.configurationHash = `sha256:${"0".repeat(64)}`;
        fs.writeFileSync(`${firstOutput}.pokie-wasm.json`, JSON.stringify(mismatchedConfiguration));
        await expect(new ProjectTargetResolver().resolve(firstOutput)).rejects.toThrow(/configuration does not match/);
        fs.writeFileSync(`${firstOutput}.pokie-wasm.json`, originalFirstSidecar);
        fs.copyFileSync(`${secondOutput}.pokie-wasm.json`, `${firstOutput}.pokie-wasm.json`);
        await expect(new ProjectTargetResolver().resolve(firstOutput)).rejects.toThrow(/does not match its manifest/);

        const manifest = JSON.parse(fs.readFileSync(`${secondOutput}.pokie-wasm.json`, "utf8"));
        manifest.artifact.adapter = "other/runtime";
        fs.writeFileSync(`${secondOutput}.pokie-wasm.json`, JSON.stringify(manifest));
        await expect(new ProjectTargetResolver().resolve(secondOutput)).rejects.toThrow(/does not satisfy PokieWasmComponentManifest/);
    });

    it("preserves occupied module or sidecar paths and writes nothing when pre-cancelled", async () => {
        const sourcePath = path.join(workDir, "fixture.blueprint.json");
        const outputPath = path.join(workDir, "game.wasm");
        fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
        fs.writeFileSync(outputPath, "pre-existing module");
        const builder = new WasmArtifactBuilder("1.3.0");
        await expect(builder.build({type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, outputPath)).rejects.toThrow(/already exists/);
        expect(fs.readFileSync(outputPath, "utf8")).toBe("pre-existing module");

        fs.rmSync(outputPath);
        fs.writeFileSync(`${outputPath}.pokie-wasm.json`, "pre-existing sidecar");
        await expect(builder.build({type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, outputPath)).rejects.toThrow(/already exists/);
        expect(fs.readFileSync(`${outputPath}.pokie-wasm.json`, "utf8")).toBe("pre-existing sidecar");

        fs.rmSync(`${outputPath}.pokie-wasm.json`);
        const controller = new AbortController();
        controller.abort();
        await expect(builder.build({type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, outputPath, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
        expect(fs.existsSync(outputPath)).toBe(false);
        expect(fs.existsSync(`${outputPath}.pokie-wasm.json`)).toBe(false);
    });

    it.each([["next_random", "nextXrandom"], ["play", "pLay"]])("rejects a hash-consistent module with a non-canonical %s ABI name", async (from, to) => {
        const sourcePath = path.join(workDir, "fixture.blueprint.json");
        const outputPath = path.join(workDir, "game.wasm");
        fs.writeFileSync(sourcePath, JSON.stringify(blueprint));
        await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: sourcePath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test"}, outputPath);
        const bytes = fs.readFileSync(outputPath);
        const offset = bytes.indexOf(Buffer.from(from));
        expect(offset).toBeGreaterThanOrEqual(0);
        bytes.write(to, offset, "utf8");
        fs.writeFileSync(outputPath, bytes);
        const manifest = JSON.parse(fs.readFileSync(`${outputPath}.pokie-wasm.json`, "utf8"));
        manifest.artifact.sha256 = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
        manifest.artifact.bytes = bytes.length;
        fs.writeFileSync(`${outputPath}.pokie-wasm.json`, JSON.stringify(manifest));

        await expect(new ProjectTargetResolver().resolve(outputPath)).rejects.toThrow(/module or game configuration does not match/i);
    });
});

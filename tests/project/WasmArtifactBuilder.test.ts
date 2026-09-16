import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {WasmArtifactBuilder} from "../../src/project/WasmArtifactBuilder.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import {readWasmComponentManifest} from "../../src/project/readWasmComponentManifest.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";

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
        expect(read).toMatchObject({supported: true, manifest: {component: {id: "wasm-fixture"}, artifact: {format: "pokie.wasm.v1", bytes: 8}}});
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
});

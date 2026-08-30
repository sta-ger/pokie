import fs from "fs";
import os from "os";
import path from "path";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {readWasmComponentManifest} from "../../src/project/readWasmComponentManifest.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import type {PokieProject} from "../../src/project/PokieProject.js";
import {POKIE_WASM_CONTRACT_VERSION} from "../../src/project/wasm/PokieWasmComponentManifest.js";

const SAMPLE_WASM_COMPONENT_MANIFEST = {
    schemaVersion: POKIE_WASM_CONTRACT_VERSION,
    component: {id: "sample-component", version: "0.1.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: ["pokie.clock.v1"]},
    capabilities: ["pokie.wasm.replay"],
};
const WASM_BINARY = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

describe("readWasmComponentManifest", () => {
    const resolver = new ProjectTargetResolver();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-read-wasm-manifest-test-")));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("reads back every field of a resolved wasm project's own manifest", async () => {
        const wasmFile = path.join(workDir, "game.wasm");
        fs.writeFileSync(wasmFile, WASM_BINARY);
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify(SAMPLE_WASM_COMPONENT_MANIFEST));

        const project = await resolver.resolve(wasmFile);
        const result = await readWasmComponentManifest(project as PokieProject);

        expect(result).toEqual({supported: true, manifest: SAMPLE_WASM_COMPONENT_MANIFEST});
    });

    it("reports unsupported for a project type that isn't wasm", async () => {
        const blueprintProject: PokieProject = {
            type: "blueprint",
            rootPath: path.join(workDir, "does-not-matter.json"),
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        } as PokieProject;

        const result = await readWasmComponentManifest(blueprintProject);

        expect(result).toEqual({
            supported: false,
            diagnostic: expect.objectContaining({missingCapability: "wasm.manifest.read"}),
        });
    });

    it("throws if the sidecar manifest changed on disk to something incompatible since resolution", async () => {
        const wasmFile = path.join(workDir, "game.wasm");
        fs.writeFileSync(wasmFile, WASM_BINARY);
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify(SAMPLE_WASM_COMPONENT_MANIFEST));

        const project = await resolver.resolve(wasmFile);
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify({...SAMPLE_WASM_COMPONENT_MANIFEST, schemaVersion: "2.0.0"}));

        await expect(readWasmComponentManifest(project as PokieProject)).rejects.toThrow(/not compatible with this POKIE build/);
    });

    it.each([
        ["missing", undefined, /no compatible PokieWasmComponentManifest sidecar was found.*Add a valid compatible sidecar.*never loads or executes/i],
        ["malformed", "{", /sidecar.*malformed.*not valid JSON.*Repair the malformed sidecar.*never loads or executes/i],
        ["incompatible", JSON.stringify({...SAMPLE_WASM_COMPONENT_MANIFEST, schemaVersion: "2.0.0"}), /not compatible with this POKIE build.*Update the incompatible sidecar.*never loads or executes/i],
    ])("preserves the %s sidecar inspection diagnostic after resolution", async (_kind, changedSidecar, expected) => {
        const wasmFile = path.join(workDir, "changed.wasm");
        fs.writeFileSync(wasmFile, WASM_BINARY);
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify(SAMPLE_WASM_COMPONENT_MANIFEST));
        const project = await resolver.resolve(wasmFile);

        if (changedSidecar === undefined) fs.rmSync(`${wasmFile}.pokie-wasm.json`);
        else fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, changedSidecar);

        await expect(readWasmComponentManifest(project as PokieProject)).rejects.toThrow(expected);
    });
});

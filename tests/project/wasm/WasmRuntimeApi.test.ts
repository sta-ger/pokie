import {instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";

const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x02, 0x15, 0x01, 0x05, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x0b, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64, 0x6f, 0x6d, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x08, 0x01, 0x04, 0x70, 0x6c, 0x61, 0x79, 0x00, 0x01,
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x10, 0x00, 0x0b,
]);
const manifest: PokieWasmComponentManifest = {
    schemaVersion: "1.0.0",
    component: {id: "fixture", version: "1.0.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: []},
    capabilities: ["runtime.play", "runtime.serialize"],
    artifact: {format: "pokie.wasm.v1", sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000", bytes: 8, abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
};

describe("Pokie WASM runtime API", () => {
    it("uses only host RNG and resumes the JSON-safe serialized continuation", async () => {
        const draws = [0.125, 0.875];
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => draws.shift()!});
        const session = runtime.createSession("seed");
        expect(await session.play({bet: 1})).toMatchObject({sequence: 1, draw: 0.125, command: {bet: 1}});
        const resumed = runtime.restoreSession(session.serialize());
        expect(await resumed.play()).toMatchObject({sequence: 2, draw: 0.875});
        expect(resumed.serialize()).toEqual({schemaVersion: "pokie.state.v1", seed: "seed", draws: [0.125, 0.875], sequence: 2});
        runtime.dispose();
        await expect(session.play()).rejects.toThrow(/disposed/);
    });

    it("fails deterministically for malformed state and invalid host draws", async () => {
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => 1});
        expect(() => runtime.restoreSession({schemaVersion: "other" as never, seed: "x", draws: [], sequence: 0})).toThrow(/Unsupported or malformed/);
        await expect(runtime.createSession("x").play()).rejects.toThrow(/RNG/);
    });
});

import {SeededRandomNumberGenerator} from "../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";

const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const manifest: PokieWasmComponentManifest = {
    schemaVersion: "1.0.0", component: {id: "golden", version: "1.0.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"}, host: {rng: "pokie.rng.v1", services: []}, capabilities: ["runtime.play", "runtime.serialize", "runtime.replay"],
    artifact: {format: "pokie.wasm.v1", sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000", bytes: 8, abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
};

describe("WASM runtime parity golden", () => {
    it("preserves host-owned deterministic draws and serialized continuation", async () => {
        const nodeRng = new SeededRandomNumberGenerator("wasm-parity-golden");
        const expected = Array.from({length: 6}, () => nodeRng.getRandomInt(0, 1_000_000) / 1_000_000);
        const supplied = [...expected];
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => supplied.shift()!});
        const session = runtime.createSession("wasm-parity-golden");
        const first = await Promise.all([{bet: 1}, {bet: 2}, {bet: 3}].map((command) => session.play(command)));
        const state = JSON.parse(JSON.stringify(session.serialize()));
        const resumed = runtime.restoreSession(state);
        const second = await Promise.all([{bet: 4}, {bet: 5}, {bet: 6}].map((command) => resumed.play(command)));
        expect([...first, ...second].map((round) => round.draw)).toEqual(expected);
        expect(resumed.serialize()).toEqual({schemaVersion: "pokie.state.v1", seed: "wasm-parity-golden", draws: expected, sequence: 6});
        runtime.dispose();
    });
});

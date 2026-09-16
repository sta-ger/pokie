import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";
import {PokieWasmWorkerProtocol} from "../../../src/wasm/worker.js";

const manifest: PokieWasmComponentManifest = {
    schemaVersion: "1.0.0",
    component: {id: "worker-fixture", version: "1.0.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: []},
    capabilities: ["runtime.play", "runtime.serialize"],
    artifact: {format: "pokie.wasm.v1", sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000", bytes: 8, abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
};
const abiBytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x02, 0x15, 0x01, 0x05, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x0b, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64, 0x6f, 0x6d, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00, 0x07, 0x08, 0x01, 0x04, 0x70, 0x6c, 0x61, 0x79, 0x00, 0x01,
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x10, 0x00, 0x0b,
]);
const gameModel = new TextEncoder().encode(JSON.stringify({
    schemaVersion: "pokie.game.v1", reels: 1, rows: 1, reelStrips: [["A", "B"]], paylines: [[0]], paytable: {A: {1: 2}, B: {1: 1}}, stopWidths: [1],
}));
const bytes = new Uint8Array([...abiBytes, 0x00, ...encodeUnsigned(gameModel.length + 14), 0x0d, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x2e, 0x67, 0x61, 0x6d, 0x65, 0x2e, 0x76, 0x31, ...gameModel]);

function encodeUnsigned(value: number): number[] {
    const bytes: number[] = [];
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (value !== 0);
    return bytes;
}

describe("PokieWasmWorkerProtocol", () => {
    it("owns transfer-safe bytes, host-issued draws, state restoration, and disposal", async () => {
        const protocol = new PokieWasmWorkerProtocol();
        expect(await protocol.handle({id: "before", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
        expect(await protocol.handle({id: "start", type: "instantiate", bytes, manifest, draws: [0.25, 0.75]})).toMatchObject({ok: true});
        expect(await protocol.handle({id: "one", type: "play", command: {bet: 1}})).toMatchObject({ok: true, result: {sequence: 1, draw: 0.25}});
        const state = await protocol.handle({id: "state", type: "serialize"});
        expect(state).toMatchObject({ok: true, result: {draws: [0.25], sequence: 1}});
        if (!state.ok) throw new Error(state.error);
        expect(await protocol.handle({id: "restore", type: "restore", state: state.result as never})).toMatchObject({ok: true});
        expect(await protocol.handle({id: "two", type: "play"})).toMatchObject({ok: true, result: {sequence: 2, draw: 0.75}});
        expect(await protocol.handle({id: "dispose", type: "dispose"})).toEqual({id: "dispose", ok: true});
    });
});

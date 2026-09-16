import crypto from "crypto";
import {SeededPokieWasmHost, instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";

const abiBytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x02, 0x15, 0x01, 0x05, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x0b, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64, 0x6f, 0x6d, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x08, 0x01, 0x04, 0x70, 0x6c, 0x61, 0x79, 0x00, 0x01,
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x10, 0x00, 0x0b,
]);
const model = new TextEncoder().encode(JSON.stringify({
    schemaVersion: "pokie.game.v1", reels: 1, rows: 1, reelStrips: [["A", "B"]], paylines: [[0]], paytable: {A: {1: 2}, B: {1: 1}}, stopWidths: [1],
}));
const descriptor = new TextEncoder().encode(JSON.stringify({
    schemaVersion: "1.0.0", component: {id: "fixture", version: "1.0.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: []}, capabilities: ["runtime.play", "runtime.serialize"],
    artifact: {format: "pokie.wasm.v1", abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash: `sha256:${crypto.createHash("sha256").update(model).digest("hex")}`},
}));
const descriptorName = new TextEncoder().encode("pokie.component.v1");
const bytes = new Uint8Array([
    ...abiBytes,
    0x00, ...encodeUnsigned(model.length + 14), 0x0d, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x2e, 0x67, 0x61, 0x6d, 0x65, 0x2e, 0x76, 0x31, ...model,
    0x00, ...encodeUnsigned(descriptor.length + descriptorName.length + 1), descriptorName.length, ...descriptorName, ...descriptor,
]);

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
function manifestFor(moduleBytes: Uint8Array): PokieWasmComponentManifest {
    return {
        schemaVersion: "1.0.0",
        component: {id: "fixture", version: "1.0.0"},
        serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
        host: {rng: "pokie.rng.v1", services: []},
        capabilities: ["runtime.play", "runtime.serialize"],
        artifact: {
            format: "pokie.wasm.v1",
            sha256: `sha256:${crypto.createHash("sha256").update(moduleBytes).digest("hex")}`,
            bytes: moduleBytes.byteLength,
            abiVersion: "1.0.0",
            adapter: "pokie/wasm",
            configurationHash: `sha256:${crypto.createHash("sha256").update(model).digest("hex")}`,
        },
    };
}

const manifest = manifestFor(bytes);

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

    it("restores a fresh serializable host without requiring callers to offset its stream", async () => {
        const first = await instantiatePokieWasm(bytes, manifest, new SeededPokieWasmHost("fresh-continuation"));
        const session = first.createSession("fresh-continuation");
        await session.play();
        const state = session.serialize();
        const expected = await session.play();
        const fresh = await instantiatePokieWasm(bytes, manifest, new SeededPokieWasmHost("fresh-continuation"));
        const restored = fresh.restoreSession(state);
        await expect(restored.play()).resolves.toEqual(expected);
        first.dispose();
        fresh.dispose();
    });

    it("hashes exactly the supplied byte view instead of its larger backing buffer", async () => {
        const padded = new Uint8Array(bytes.byteLength + 6);
        padded.set(bytes, 3);
        const runtime = await instantiatePokieWasm(padded.subarray(3, 3 + bytes.byteLength), manifest, {nextRandom: () => 0.125});
        await expect(runtime.createSession("byte-view").play()).resolves.toMatchObject({draw: 0.125});
    });

    it.each([
        ["byte count", {...manifest, artifact: {...manifest.artifact!, bytes: manifest.artifact!.bytes + 1}}, /byte count/],
        ["module SHA-256", {...manifest, artifact: {...manifest.artifact!, sha256: `sha256:${"0".repeat(64)}`}}, /SHA-256/],
        ["configuration hash", {...manifest, artifact: {...manifest.artifact!, configurationHash: `sha256:${"0".repeat(64)}`}}, /configuration hash/],
        ["ABI declaration", {...manifest, artifact: {...manifest.artifact!, abiVersion: "2.0.0"}}, /ABI/],
        ["embedded descriptor", {...manifest, component: {id: "other", version: manifest.component.version}}, /descriptor/],
    ])("rejects a direct runtime %s mismatch before instantiation", async (_name, mismatchedManifest, error) => {
        await expect(instantiatePokieWasm(bytes, mismatchedManifest, {nextRandom: () => 0.5})).rejects.toThrow(error);
    });

    it("fails deterministically for malformed state and invalid host draws", async () => {
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => 1});
        expect(() => runtime.restoreSession({schemaVersion: "other" as never, seed: "x", draws: [], sequence: 0})).toThrow(/Unsupported or malformed/);
        await expect(runtime.createSession("x").play()).rejects.toThrow(/RNG/);
    });

    it("rejects an otherwise valid module with a non-canonical ABI result signature before instantiation", async () => {
        const wrongSignature = bytes.slice();
        // The fixture's sole function type is () -> i32. Changing it to i64
        // leaves the binary valid but must not turn it into a POKIE ABI match.
        wrongSignature[14] = 0x7e;
        await expect(instantiatePokieWasm(wrongSignature, manifestFor(wrongSignature), {nextRandom: () => 0.5})).rejects.toThrow(/next_random signature/i);
    });

    it("independently rejects a valid module whose play signature differs from the canonical ABI", async () => {
        const playI64Abi = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x01, 0x09, 0x02, 0x60, 0x00, 0x01, 0x7f, 0x60, 0x00, 0x01, 0x7e,
            0x02, 0x15, 0x01, 0x05, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x0b, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64, 0x6f, 0x6d, 0x00, 0x00,
            0x03, 0x02, 0x01, 0x01, 0x07, 0x08, 0x01, 0x04, 0x70, 0x6c, 0x61, 0x79, 0x00, 0x01,
            0x0a, 0x06, 0x01, 0x04, 0x00, 0x42, 0x00, 0x0b,
        ]);
        const wrongPlaySignature = new Uint8Array([
            ...playI64Abi,
            0x00, ...encodeUnsigned(model.length + 14), 0x0d, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x2e, 0x67, 0x61, 0x6d, 0x65, 0x2e, 0x76, 0x31, ...model,
            0x00, ...encodeUnsigned(descriptor.length + descriptorName.length + 1), descriptorName.length, ...descriptorName, ...descriptor,
        ]);
        expect(WebAssembly.validate(wrongPlaySignature)).toBe(true);
        await expect(instantiatePokieWasm(wrongPlaySignature, manifestFor(wrongPlaySignature), {nextRandom: () => 0.5})).rejects.toThrow(/play signature/i);
    });
});

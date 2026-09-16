import crypto from "crypto";
import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";

type CanonicalWasmFixtureOptions = {
    readonly id?: string;
    readonly capabilities?: readonly string[];
    readonly trapping?: boolean;
};

const abiPrefix = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x02, 0x15, 0x01, 0x05, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x0b, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64, 0x6f, 0x6d, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x08, 0x01, 0x04, 0x70, 0x6c, 0x61, 0x79, 0x00, 0x01,
];

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

function customSection(name: string, contents: Uint8Array): number[] {
    const nameBytes = new TextEncoder().encode(name);
    const payload = [nameBytes.length, ...nameBytes, ...contents];
    return [0x00, ...encodeUnsigned(payload.length), ...payload];
}

function sha256(bytes: Uint8Array): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

/** Creates a byte-bound fixture used by portable runtime tests and benchmarks. */
export function createCanonicalWasmFixture(options: CanonicalWasmFixtureOptions = {}): {readonly bytes: Uint8Array<ArrayBuffer>; readonly manifest: PokieWasmComponentManifest} {
    const id = options.id ?? "portable-fixture";
    const capabilities = options.capabilities ?? ["runtime.play", "runtime.serialize", "runtime.replay"];
    const model = new TextEncoder().encode(JSON.stringify({
        schemaVersion: "pokie.game.v1", reels: 1, rows: 1, reelStrips: [["A", "B"]], paylines: [[0]], paytable: {A: {1: 2}, B: {1: 1}}, stopWidths: [1],
    }));
    const configurationHash = sha256(model);
    const descriptor = new TextEncoder().encode(JSON.stringify({
        schemaVersion: "1.0.0", component: {id, version: "1.0.0"},
        serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"}, host: {rng: "pokie.rng.v1", services: []}, capabilities,
        artifact: {format: "pokie.wasm.v1", abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash},
    }));
    const instructions = options.trapping ? [0x00] : [0x10, 0x00];
    const functionBody = [0x00, ...instructions, 0x0b];
    const codeSection = [0x0a, ...encodeUnsigned(2 + functionBody.length), 0x01, functionBody.length, ...functionBody];
    const bytes: Uint8Array<ArrayBuffer> = new Uint8Array([
        ...abiPrefix, ...codeSection,
        ...customSection("pokie.game.v1", model),
        ...customSection("pokie.component.v1", descriptor),
    ]);
    return {
        bytes,
        manifest: {
            schemaVersion: "1.0.0", component: {id, version: "1.0.0"},
            serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"}, host: {rng: "pokie.rng.v1", services: []}, capabilities,
            artifact: {format: "pokie.wasm.v1", sha256: sha256(bytes), bytes: bytes.byteLength, abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash},
        },
    };
}

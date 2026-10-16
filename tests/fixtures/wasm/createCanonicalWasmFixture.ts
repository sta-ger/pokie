import crypto from "crypto";
import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";
import {compileSharedSlotArtifact, stableSlotMathJson} from "../../../src/wasm/math/SharedSlotMath.js";
import {resolveSharedSlotMathModel} from "../../../src/generated/resolveSharedSlotMathModel.js";

type CanonicalWasmFixtureOptions = {
    readonly id?: string;
    readonly capabilities?: readonly string[];
    readonly trapping?: boolean;
    readonly stripLengths?: readonly number[];
    readonly reelStrips?: readonly (readonly string[])[];
    readonly wilds?: readonly string[];
    readonly scatters?: readonly string[];
    readonly paytable?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly serialization?: {readonly session: string; readonly play: string; readonly state: string};
    readonly host?: {readonly rng: string; readonly services: readonly string[]};
};


/** Production lowering only. Modified executables are rejection fixtures, never success evidence. */
export function createCanonicalWasmFixture(options: CanonicalWasmFixtureOptions = {}): {readonly bytes: Uint8Array<ArrayBuffer>; readonly manifest: PokieWasmComponentManifest} {
    const component = {id: options.id ?? "portable-fixture", version: "1.0.0"};
    const capabilities = options.capabilities ?? ["runtime.play", "runtime.serialize", "runtime.replay"];
    const serialization = options.serialization ?? {session: "pokie.session.v2", play: "pokie.play.v2", state: "pokie.state.v3"};
    const host = options.host ?? {rng: "pokie.rng.v2", services: []};
    const reelStrips = options.reelStrips ?? (options.stripLengths ?? [2, 2]).map(length => Array.from({length}, (_, i) => i % 2 === 0 ? "A" : "B"));
    const paytable = options.paytable ?? {A: {[String(reelStrips.length)]: 2}, B: {[String(reelStrips.length)]: 1}};
    const symbols = [...new Set([...reelStrips.flat(), ...(options.wilds ?? []), ...(options.scatters ?? []), ...Object.keys(paytable)])];
    const model = resolveSharedSlotMathModel({manifest: {...component, name: component.id}, reels: reelStrips.length, rows: 1, symbols,
        reelStrips: reelStrips.map(strip => [...strip]), paytable, wilds: options.wilds ? [...options.wilds] : undefined, scatters: options.scatters ? [...options.scatters] : undefined});
    const configurationHash = sha256(new TextEncoder().encode(stableSlotMathJson(model)));
    const descriptor = {schemaVersion: "1.0.0", component, serialization, host, capabilities,
        artifact: {format: "pokie.wasm.v1" as const, abiVersion: "2.0.0", adapter: "@fromstan/pokie/wasm" as const, configurationHash}};
    const bytes = compileSharedSlotArtifact(model, descriptor);
    if (options.trapping) {
        // A valid but incompatible executable, with an internally recomputed outer hash.
        const code = binarySections(bytes).find(section => section.id === 10)!;
        const offset = bytes.indexOf(0x28, code.start);
        bytes[offset + 2] = 1; // change $h's load offset; keep its signature and binary validity.
    }
    return {bytes, manifest: {...descriptor, artifact: {...descriptor.artifact, sha256: sha256(bytes), bytes: bytes.byteLength}}};
}

export function sha256(bytes: Uint8Array): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}
export function binarySections(bytes: Uint8Array): {id: number; start: number; end: number; header: number}[] {
    const sections: {id: number; start: number; end: number; header: number}[] = [];
    let cursor = 8;
    while (cursor < bytes.length) {
        const header = cursor,
            id = bytes[cursor++];
        let size = 0,
            factor = 1,
            byte: number;
        do {
            byte = bytes[cursor++];
            size += (byte & 127) * factor;
            factor *= 128;
        } while (byte & 128);
        sections.push({id, start: cursor, end: cursor + size, header});
        cursor += size;
    }
    return sections;
}

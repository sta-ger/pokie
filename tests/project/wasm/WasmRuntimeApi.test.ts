import crypto from "crypto";
import {SeededPokieWasmHost, instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmComponentManifest} from "../../../src/project/wasm/PokieWasmComponentManifest.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

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
    it("preserves nextRandom-only live execution and diagnoses unavailable deterministic restoration", async () => {
        const draws = [0.125, 0.875];
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => draws.shift()!});
        const session = runtime.createSession("seed");
        expect(await session.play({bet: 1})).toMatchObject({sequence: 1, draw: 0.125, creditsBefore: 1000, credits: 999, command: {bet: 1}});
        expect(() => runtime.restoreSession(session.serialize())).toThrow(/missing.*continuation/);
        expect(await session.play()).toMatchObject({sequence: 2, draw: 0.875});
        expect(session.serialize()).toEqual({schemaVersion: "pokie.state.v1", seed: "seed", draws: [0.125, 0.875], sequence: 2, credits: 998});
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

    it.each(["0", "wasm-parity-golden", "third-seed"])("owns initial and later continuation across fresh/advanced hosts for %s", async (seed) => {
        const fixture = createCanonicalWasmFixture({id: "owned-continuation"});
        const host = new SeededPokieWasmHost("different-host-label");
        host.nextRandom();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const session = runtime.createSession(seed);
        const initial = session.serialize();
        expect(initial).toMatchObject({sequence: 0, credits: 1000, draws: [expect.any(Number), expect.any(Number)], rngState: expect.any(Number)});
        const hostState = host.serializeState();
        expect(session.serialize()).toEqual(initial);
        expect(host.serializeState()).toBe(hostState);
        for (let sequence = 0; sequence < 3; sequence++) {
            const snapshot = JSON.parse(JSON.stringify(session.serialize()));
            const expected = await session.play({bet: 1});
            const after = session.serialize();
            for (const advance of [false, true]) {
                const receivingHost = new SeededPokieWasmHost("different-receiving-seed");
                if (advance) for (let draw = 0; draw < 11; draw++) receivingHost.nextRandom();
                const receiving = await instantiatePokieWasm(fixture.bytes, fixture.manifest, receivingHost);
                try {
                    expect(await receiving.restoreSession(snapshot).play({bet: 1})).toEqual(expected);
                    for (let repeat = 0; repeat < 2; repeat++) {
                        const replay = await receiving.replay(snapshot, [{bet: 1}]);
                        expect(replay).toEqual({rounds: [expected], stateBeforeFinal: snapshot, stateAfter: after});
                    }
                    expect(await receiving.replay(snapshot, [])).toEqual({rounds: [], stateAfter: snapshot});
                    const next = await receiving.replay(after, [{bet: 1}]);
                    expect(next.rounds).toEqual([await receiving.restoreSession(after).play({bet: 1})]);
                } finally {
                    receiving.dispose();
                }
            }
            // Replaying and creating a sibling must not move this live session.
            expect((await runtime.replay(snapshot, [{bet: 1}])).rounds).toEqual([expected]);
            const sibling = runtime.createSession("sibling-seed");
            await sibling.play({bet: 1});
            sibling.dispose();
            expect(session.serialize()).toEqual(after);
            const detached = session.serialize();
            (detached.draws as number[]).push(0);
            expect(session.serialize()).toEqual(after);
            expect(await session.play({bet: 1})).toEqual((await runtime.replay(after, [{bet: 1}])).rounds[0]);
        }
        expect((await runtime.replay(initial, [{bet: 1}])).stateBeforeFinal).toEqual(initial);
        runtime.dispose();
        expect(() => runtime.createSession(seed)).toThrow(/disposed/);
    });

    it("preserves authoritative old later-state values and migrates only empty seeded initial states", async () => {
        const fixture = createCanonicalWasmFixture();
        const host = new SeededPokieWasmHost("wasm-parity-golden");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        // Actual pre-correction serialized values, with no constructor draws.
        const old = {schemaVersion: "pokie.state.v1" as const, seed: "wasm-parity-golden",
            draws: [0.5967806649859995, 0.5375500756781548, 0.07866769284009933, 0.3642472343053669, 0.5574665090534836, 0.0013346921186894178],
            sequence: 3, credits: 1000, rngState: 1365295755};
        expect(await runtime.restoreSession(old).play({bet: 1})).toMatchObject({sequence: 4, draw: 0.14641731861047447, screen: [["A"], ["B"]], payout: 0, credits: 999});
        const legacyInitial = {schemaVersion: "pokie.state.v1" as const, seed: "0", draws: [], sequence: 0, credits: 1000};
        const migrated = await runtime.replay(legacyInitial, []);
        expect(migrated.stateAfter).toEqual(runtime.createSession("0").serialize());
        expect(() => runtime.restoreSession({...old, rngState: undefined})).toThrow(/missing.*continuation/);
        runtime.dispose();
    });

    it("restores numeric RNG zero and rejects malformed or incompatible continuations without moving a session", async () => {
        const fixture = createCanonicalWasmFixture();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        const session = runtime.createSession("0");
        const initial = session.serialize();
        const zero = {...initial, rngState: 0};
        const expectedHost = new SeededPokieWasmHost(0);
        const draw = expectedHost.nextRandom();
        expect(await runtime.restoreSession(zero).play({bet: 1})).toMatchObject({sequence: 1, draw});
        for (const invalid of [-1, 0x100000000, 0.5, NaN, "0", null, {}, [undefined], {nested: undefined}]) {
            expect(() => runtime.restoreSession({...initial, rngState: invalid as never})).toThrow(/malformed|Invalid seeded/);
        }
        expect(() => runtime.restoreSession(null as never)).toThrow(/malformed/);
        await expect(runtime.replay(initial, [null] as never)).rejects.toThrow(/Malformed.*commands/);
        expect(session.serialize()).toEqual(initial);
        await expect(session.play({bet: -1})).rejects.toThrow(/positive/);
        expect(session.serialize()).toEqual(initial);
        const poor = runtime.createSession("0", {credits: 0});
        const before = poor.serialize();
        await expect(poor.play({bet: 1})).rejects.toThrow(/insufficient/);
        expect(poor.serialize()).toEqual(before);
        const custom = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => 0.5});
        expect(() => custom.restoreSession(initial)).toThrow(/cannot restore.*continuation/);
        await expect(custom.replay({...initial, rngState: undefined, draws: []}, [])).rejects.toThrow(/cannot restore deterministic/);
        runtime.dispose();
        custom.dispose();
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

    it("enforces minPokieVersion at the direct portable runtime boundary", async () => {
        await expect(instantiatePokieWasm(bytes, {...manifest, minPokieVersion: "999.0.0"}, {nextRandom: () => 0.5}))
            .rejects.toThrow(/requires POKIE 999\.0\.0 or newer/);
    });

    it.each([
        ["serialization", {serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "other.state.v1"}}, /unsupported serialization identifiers/i],
        ["RNG protocol", {host: {rng: "other.rng.v1", services: []}}, /unsupported RNG protocol/i],
        ["host service", {host: {rng: "pokie.rng.v1", services: ["pokie.clock.v1"]}}, /unsupported required host service/i],
    ])("rejects an unsupported canonical %s before execution", async (_name, options, error) => {
        const fixture = createCanonicalWasmFixture(options);
        await expect(instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => 0.5})).rejects.toThrow(error);
    });

    it("executes only the play declaration and rejects sibling operations before drawing", async () => {
        const fixture = createCanonicalWasmFixture({capabilities: ["runtime.play"]});
        const nextRandom = jest.fn(() => 0.5);
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom});
        const session = runtime.createSession("play-only");
        await expect(session.play()).resolves.toMatchObject({sequence: 1});
        expect(() => session.serialize()).toThrow(/does not declare runtime\.serialize/i);
        await expect(runtime.replay({schemaVersion: "pokie.state.v1", seed: "play-only", draws: [], sequence: 0, credits: 1000}, [])).rejects.toThrow(/does not declare runtime\.replay/i);
        expect(nextRandom).toHaveBeenCalledTimes(2);
        runtime.dispose();
    });

    it("executes replay independently without public play or serialization declarations", async () => {
        const fixture = createCanonicalWasmFixture({capabilities: ["runtime.replay"]});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("replay-only"));
        const session = runtime.createSession("replay-only");
        await expect(session.play()).rejects.toThrow(/does not declare runtime\.play/i);
        expect(() => session.serialize()).toThrow(/does not declare runtime\.serialize/i);
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "replay-only", draws: [], sequence: 0, credits: 1000})).toThrow(/does not declare runtime\.serialize/i);
        await expect(runtime.replay({schemaVersion: "pokie.state.v1", seed: "replay-only", draws: [], sequence: 0, credits: 1000}, [{bet: 1}]))
            .resolves.toMatchObject({rounds: [{sequence: 1, command: {bet: 1}}]});
        runtime.dispose();
    });

    it("returns JSON-safe replay rounds and continuation fields", async () => {
        const fixture = createCanonicalWasmFixture({capabilities: ["runtime.replay"]});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("wire-safe-replay"));
        const initial = {schemaVersion: "pokie.state.v1" as const, seed: "wire-safe-replay", draws: [], sequence: 0, credits: 1000};
        const replay = await runtime.replay(initial, [{bet: 1}, {bet: 1}]);
        const wire = JSON.parse(JSON.stringify(replay));
        expect(wire).toEqual(replay);
        expect(wire.rounds).toHaveLength(2);
        expect(wire.stateBeforeFinal).toEqual(replay.rounds[0] === undefined ? undefined : expect.objectContaining({sequence: 1}));
        const continued = await runtime.replay(wire.stateAfter, [{bet: 1}]);
        expect(continued.rounds[0]?.sequence).toBe(3);
        runtime.dispose();
    });

    it("executes only serialization and restoration when runtime.play is omitted", async () => {
        const fixture = createCanonicalWasmFixture({capabilities: ["runtime.serialize"]});
        const nextRandom = jest.fn(() => 0.5);
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom});
        const state = {schemaVersion: "pokie.state.v1" as const, seed: "serialize-only", draws: [], sequence: 0, credits: 1000};
        const session = runtime.createSession("serialize-only");
        expect(session.serialize()).toEqual(state);
        expect(() => runtime.restoreSession(state)).toThrow(/cannot restore deterministic/);
        await expect(session.play()).rejects.toThrow(/does not declare runtime\.play/i);
        await expect(runtime.replay(state, [])).rejects.toThrow(/does not declare runtime\.replay/i);
        expect(nextRandom).not.toHaveBeenCalled();
        runtime.dispose();
    });

    it("fails deterministically for malformed state and invalid host draws", async () => {
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => 1});
        expect(() => runtime.restoreSession({schemaVersion: "other" as never, seed: "x", draws: [], sequence: 0, credits: 1000})).toThrow(/Unsupported or malformed/);
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

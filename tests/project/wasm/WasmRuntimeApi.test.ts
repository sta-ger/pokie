import {evaluatorValidationCases, binarySections, sha256, createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";
import {sharedSlotCustomSection, stableSlotMathJson, lowerSharedSlotMath, readSharedSlotMathResult} from "../../../src/wasm/math/SharedSlotMath.js";
import {SeededPokieWasmHost, instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import {readCanonicalPokieWasmModule} from "../../../src/wasm/PokieWasmCanonicalModule.js";
import {weightedBonusBlueprint} from "../../v2/fixtures/WeightedBonusGame.js";

it("rejects malformed feature progress before host restoration and keeps the settled checkpoint executable", async () => {
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const host = new SeededPokieWasmHost("feature-corruption");
    const restore = jest.spyOn(host, "restoreState");
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
    try {
        const session = runtime.createSession("feature-corruption");
        await session.play({bet: 0.05, roundId: "bonus", delivery: "stepwise"});
        const saved = session.serialize();
        if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
        const corrupt = JSON.parse(JSON.stringify(saved)) as typeof saved;
        (corrupt.feature.state as {remaining: number}).remaining = -1;
        const calls = restore.mock.calls.length;
        expect(() => runtime.restoreSession(corrupt)).toThrow();
        expect(restore).toHaveBeenCalledTimes(calls);
        expect(session.serialize()).toEqual(saved);
        expect(await session.play({delivery: "stepwise", continuation: {roundId: "bonus", cursor: 1}})).toMatchObject({stake: 0, win: 0.1});
    } finally {
        runtime.dispose();
    }
});

const fixture = createCanonicalWasmFixture({id: "fixture", reelStrips: [["A", "B"]], capabilities: ["runtime.play", "runtime.serialize"]});
const {bytes, manifest} = fixture;

describe("Pokie WASM runtime API", () => {
    it.each(evaluatorValidationCases)("rejects integrity-consistent $kind before draws and permits corrected loading on the same host", async ({fixture, repaired, code}) => {
        const nextRandom = jest.fn(() => 0.5);
        const host = {nextRandom};
        expect(WebAssembly.validate(fixture.bytes)).toBe(true);
        expect(sha256(fixture.bytes)).toBe(fixture.manifest.artifact!.sha256);
        expect(() => readCanonicalPokieWasmModule(fixture.bytes)).toThrow(code);
        await expect(instantiatePokieWasm(fixture.bytes, fixture.manifest, host)).rejects.toThrow(code);
        expect(nextRandom).not.toHaveBeenCalled();
        const runtime = await instantiatePokieWasm(repaired.bytes, repaired.manifest, host);
        try {
            const session = runtime.createSession("repaired");
            for (const sequence of [1, 2]) expect(await session.play()).toMatchObject({sequence, payout: 2, credits: 1000 + sequence});
            expect(nextRandom).toHaveBeenCalledTimes(6);
        } finally {
            runtime.dispose();
        }
    });

    it("accepts independent stop arrays above 32 total bits at the direct loader", async () => {
        const exact = createCanonicalWasmFixture({stripLengths: [1025, 1025, 1025]});
        expect(readCanonicalPokieWasmModule(exact.bytes).model.reelStrips.map(strip => strip.length)).toEqual([1025, 1025, 1025]);
        const runtime = await instantiatePokieWasm(exact.bytes, exact.manifest, {nextRandom: () => 0.9999});
        try {
            expect(await runtime.createSession("thirty-three-bits").play()).toMatchObject({stops: [1024, 1024, 1024], payout: 2});
        } finally {
            runtime.dispose();
        }
    });

    it("preserves nextRandom-only live execution and diagnoses unavailable deterministic restoration", async () => {
        const draws = [0.125, 0.875];
        const runtime = await instantiatePokieWasm(bytes, manifest, {nextRandom: () => draws.shift()!});
        const session = runtime.createSession("seed");
        expect(await session.play({bet: 1})).toMatchObject({sequence: 1, draw: 0.125, creditsBefore: 1000, credits: 999, command: {bet: 1}});
        expect(() => runtime.restoreSession(session.serialize())).toThrow(/missing.*continuation/);
        expect(await session.play()).toMatchObject({sequence: 2, draw: 0.875});
        expect(session.serialize()).toEqual({schemaVersion: "pokie.state.v3", artifactIdentity: manifest.artifact!.sha256, seed: "seed", drawCount: 2, sequence: 2, credits: 998});
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
        expect(initial).toMatchObject({sequence: 0, credits: 1000, drawCount: 2, rngState: expect.any(Number)});
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
            (detached as {seed: string}).seed = "mutated";
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
        await expect(custom.replay({...initial, rngState: undefined, drawCount: 0}, [])).rejects.toThrow(/cannot restore deterministic/);
        runtime.dispose();
        custom.dispose();
    });

    it("detaches nested custom-host continuation at serialize/restore and retains no caller extensions", async () => {
        const fixture = createCanonicalWasmFixture();
        let position = 0;
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {
            nextRandom: () => (++position % 10) / 10,
            serializeState: () => ({nested: {position}}),
            restoreState: (state) => {
                const value = state as {nested: {position: number}};
                position = value.nested.position;
                value.nested.position = 99;
            },
        });
        const session = runtime.createSession("live");
        const before = session.serialize();
        const extended = {...before, priorRounds: [{draws: [0.1]}]};
        const restored = runtime.restoreSession(extended);
        expect(before.rngState).toEqual({nested: {position: 0}});
        expect(restored.serialize()).toEqual(before);
        const detached = restored.serialize().rngState as {nested: {position: number}};
        detached.nested.position = 9;
        expect((await restored.play()).draw).toBe(0.1);
        expect(restored.serialize()).not.toHaveProperty("priorRounds");
        runtime.dispose();
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
        ["ABI declaration", {...manifest, artifact: {...manifest.artifact!, abiVersion: "999.0.0"}}, /ABI/],
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
        ["host service", {host: {rng: "pokie.rng.v2", services: ["pokie.clock.v1"]}}, /unsupported required host service/i],
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
        expect(session.serialize()).toEqual({schemaVersion: "pokie.state.v3", artifactIdentity: fixture.manifest.artifact!.sha256, seed: "serialize-only", drawCount: 0, sequence: 0, credits: 1000});
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

    it("rejects internally rehashed executable changes before any host draw", async () => {
        const corrupt = createCanonicalWasmFixture({trapping: true});
        expect(WebAssembly.validate(corrupt.bytes)).toBe(true);
        const nextRandom = jest.fn(() => 0.5);
        expect(() => readCanonicalPokieWasmModule(corrupt.bytes)).toThrow(/lowering\/model identity/);
        await expect(instantiatePokieWasm(corrupt.bytes, corrupt.manifest, {nextRandom})).rejects.toThrow(/lowering\/model identity/);
        expect(nextRandom).not.toHaveBeenCalled();
    });
    it("rejects unsupported models, duplicate/malformed sections, missing exports and corrupt layouts after rehashing", async () => {
        const canonical = readCanonicalPokieWasmModule(bytes);
        const withoutCustom = binarySections(bytes).filter(section => section.id !== 0).flatMap(section => [...bytes.slice(section.header, section.end)]);
        const fromModel = (model: unknown): Uint8Array<ArrayBuffer> => new Uint8Array([...bytes.slice(0, 8), ...withoutCustom,
            ...sharedSlotCustomSection("pokie.game.v2", typeof model === "string" ? model : stableSlotMathJson(model)),
            ...sharedSlotCustomSection("pokie.component.v2", stableSlotMathJson(canonical.descriptor))]);
        const duplicate = new Uint8Array([...bytes, ...sharedSlotCustomSection("pokie.game.v2", stableSlotMathJson(canonical.model))]);
        const changedExport = bytes.slice();
        const exportSection = binarySections(changedExport).find(section => section.id === 7)!;
        const playName = new TextEncoder().encode("play");
        const playOffset = changedExport.findIndex((_, i) => i >= exportSection.start && i < exportSection.end && playName.every((byte, j) => changedExport[i + j] === byte));
        changedExport[playOffset + 1] = "r".charCodeAt(0);
        const invalidLayout = bytes.slice();
        const dataSection = binarySections(invalidLayout).find(section => section.id === 11)!;
        let start = dataSection.start + 5;
        while (invalidLayout[start++] & 128) { /* consume image length */ }
        new DataView(invalidLayout.buffer).setUint32(start + 52, 0xffffffff, true);
        const invalidMemory = bytes.slice();
        const memorySection = binarySections(invalidMemory).find(section => section.id === 5)!;
        invalidMemory[memorySection.start + 2] = 0;
        const missingMemory = bytes.slice();
        const memoryName = new TextEncoder().encode("memory");
        const memoryOffset = missingMemory.findIndex((_, i) => i >= exportSection.start && i < exportSection.end && memoryName.every((byte, j) => missingMemory[i + j] === byte));
        missingMemory[memoryOffset + 5] = "z".charCodeAt(0);
        const cases = [
            duplicate, fromModel("{"), fromModel({...canonical.model, mathVersion: "pokie.math.v999"}),
            fromModel({...canonical.model, reels: 65}), changedExport, missingMemory, invalidLayout, invalidMemory,
        ];
        for (const binary of cases) {
            const nextRandom = jest.fn(() => 0);
            const rehashed = {...manifest, artifact: {...manifest.artifact!, bytes: binary.length, sha256: sha256(binary)}};
            expect(() => readCanonicalPokieWasmModule(binary)).toThrow();
            await expect(instantiatePokieWasm(binary, rehashed, {nextRandom})).rejects.toThrow();
            expect(nextRandom).not.toHaveBeenCalled();
        }
    });

    it.each(["random", "play"] as const)("checks the exact %s signature on a structurally valid negative module", async wrong => {
        const section = (id: number, data: number[]): number[] => [id, data.length, ...data];
        const name = (value: string): number[] => [value.length, ...new TextEncoder().encode(value)];
        const randomResult = wrong === "random" ? 0x7f : 0x7c;
        const playType = wrong === "play" ? [0x60, 0, 1, 0x7f] : [0x60, 1, 0x7c, 1, 0x7c];
        const body = wrong === "play" ? [0, 0x41, 0, 0x0b] : [0, 0x20, 0, 0x0b];
        const binary = new Uint8Array([...bytes.slice(0, 8),
            ...section(1, [2, 0x60, 0, 1, randomResult, ...playType]),
            ...section(2, [1, ...name("pokie"), ...name("next_random"), 0, 0]),
            ...section(3, [1, 1]), ...section(7, [1, ...name("play"), 0, 1]), ...section(10, [1, body.length, ...body])]);
        expect(WebAssembly.validate(binary)).toBe(true);
        const nextRandom = jest.fn(() => 0);
        const rehashed = {...manifest, artifact: {...manifest.artifact!, bytes: binary.length, sha256: sha256(binary)}};
        await expect(instantiatePokieWasm(binary, rehashed, {nextRandom})).rejects.toThrow(/signature/);
        expect(nextRandom).not.toHaveBeenCalled();
    });

    it("validates result cardinality and stop bounds without modulo repair", async () => {
        const canonical = readCanonicalPokieWasmModule(bytes);
        const {instance} = await WebAssembly.instantiate(bytes, {pokie: {"next_random": () => 0.5}});
        const layout = lowerSharedSlotMath(canonical.model);
        const payout = (instance.exports.play as (bet: number) => number)(1);
        const memory = instance.exports.memory as WebAssembly.Memory;
        const view = new DataView(memory.buffer);
        view.setUint32(layout.stops, canonical.model.reelStrips[0].length, true);
        expect(() => readSharedSlotMathResult(instance, canonical.model, payout)).toThrow(/out-of-range/);
        view.setUint32(layout.stops, 0, true);
        view.setUint32(72, layout.capacity + 1, true);
        expect(() => readSharedSlotMathResult(instance, canonical.model, payout)).toThrow(/too many components/);
    });

});


it.each(["stepwise", "composite"] as const)("V2C-21 validates retained %s results before direct/replay host mutation", async delivery => {
    const fixture = createCanonicalWasmFixture({blueprint: weightedBonusBlueprint()});
    const host = new SeededPokieWasmHost("receipt");
    const restore = jest.spyOn(host, "restoreState");
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
    try {
        const command = {bet: 0.05, delivery, roundId: "receipt"};
        const session = runtime.createSession("receipt");
        await session.play(command);
        const saved = session.serialize();
        if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
        for (const change of [{payout: -123}, {win: "invalid"}, {stops: [-999]}, {deliveryOnly: true}, {command: {kind: "invalid"}}, {winMultiplier: -1}, {creditsBefore: 1}]) {
            const corrupt = JSON.parse(JSON.stringify(saved)) as typeof saved;
            Object.assign(corrupt.feature.lastRound!, change);
            const calls = restore.mock.calls.length;
            expect(() => runtime.restoreSession(corrupt)).toThrow();
            await expect(runtime.replay(corrupt, [command])).rejects.toThrow();
            expect(restore).toHaveBeenCalledTimes(calls);
            expect(session.serialize()).toEqual(saved);
        }
        expect(await runtime.restoreSession(saved).play(command)).toEqual(saved.feature.lastRound);
        expect((await runtime.replay(saved, [command])).rounds).toEqual([saved.feature.lastRound]);
    } finally {
        runtime.dispose();
    }
});

it("binds bonus continuation receipts to accepted money, screen and cursor before direct/replay restoration", async () => {
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const host = new SeededPokieWasmHost("probe");
    const restore = jest.spyOn(host, "restoreState");
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
    const freshHost = new SeededPokieWasmHost("fresh");
    const freshRestore = jest.spyOn(freshHost, "restoreState");
    const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, freshHost);
    try {
        const session = runtime.createSession("probe");
        await session.play({bet: 0.05, roundId: "x", delivery: "stepwise"});
        for (const cursor of [1, 2]) {
            const command = {delivery: "stepwise", continuation: {roundId: "x", cursor}};
            const result = await session.play(command);
            expect(result).toMatchObject({sequence: cursor + 1, win: 0.1, stake: 0});
            expect(result.payout).toBeGreaterThan(0);
            const saved = session.serialize();
            if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            const money = {win: 0, winMultiplier: 0};
            const release = {payout: 0, creditsBefore: saved.credits};
            const screens = [[['INVALID']], [['C']], [['A'], ['A'], ['A']]].map(screen => ({screen, network: {...saved.feature.lastRound!.network, reelsSymbols: screen}}));
            const changes = cursor === 1 ? [money, release, ...screens] : [{command: {kind: "spin", delivery: "stepwise", continuation: {roundId: "x", cursor: 1}}}];
            for (const change of changes) {
                const corrupt = JSON.parse(JSON.stringify(saved)) as typeof saved;
                Object.assign(corrupt.feature.lastRound!, change);
                const calls = restore.mock.calls.length;
                const freshCalls = freshRestore.mock.calls.length;
                const rng = host.serializeState();
                expect(() => runtime.restoreSession(corrupt)).toThrow(/Retained|screen/);
                await expect(runtime.replay(corrupt, [command])).rejects.toThrow(/Retained|screen/);
                expect(() => fresh.restoreSession(corrupt)).toThrow(/Retained|screen/);
                expect(restore).toHaveBeenCalledTimes(calls);
                expect(freshRestore).toHaveBeenCalledTimes(freshCalls);
                expect(host.serializeState()).toEqual(rng);
                expect(session.serialize()).toEqual(saved);
            }
            for (const receiving of [runtime, fresh]) {
                const restored = receiving.restoreSession(JSON.parse(JSON.stringify(saved)));
                expect(await restored.play(command)).toEqual(result);
                expect(restored.serialize()).toEqual(saved);
                restored.dispose();
            }
            expect((await runtime.replay(saved, [command])).rounds).toEqual([result]);
        }
        const saved = session.serialize();
        const recovered = runtime.restoreSession(saved);
        for (const roundId of ["after-rejection", "reuse-again"]) {
            const command = {bet: 0.05, roundId, delivery: "composite"};
            expect(await recovered.play(command)).toEqual(await session.play(command));
            expect(recovered.serialize()).toEqual(session.serialize());
        }
    } finally {
        fresh.dispose();
        runtime.dispose();
    }
});

it.each(["plain", "anonymous", "composite", "bounded"])("rejects coordinated %s receipts before host effects and restores supported retries", async policy => {
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const host = new SeededPokieWasmHost("probe");
    const restore = jest.spyOn(host, "restoreState");
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
    const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
    try {
        const session = runtime.createSession("probe");
        const logical = policy === "composite" || policy === "bounded";
        if (logical) await session.play({bet: 0.05, roundId: "x", delivery: "stepwise"});
        const command = logical ? {delivery: "composite", continuation: {roundId: "x", cursor: 1}, ...(policy === "bounded" ? {maxSubrounds: 1} : {})}
            : {bet: 0.05, ...(policy === "plain" ? {roundId: "plain"} : {})};
        const result = await session.play(command);
        const expectedWin = policy === "bounded" ? 0.1 : 0.2;
        expect(result.win).toBeCloseTo(logical ? expectedWin : 0.35);
        const saved = session.serialize();
        if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
        for (const mutation of ["win", "payout", "screen"]) {
            const corrupt = JSON.parse(JSON.stringify(saved)) as typeof saved;
            if (mutation === "win") {
                Object.assign(corrupt.feature.lastRound!, {win: 0, winMultiplier: 0});
                if (logical) Object.assign(corrupt.feature.deliveryStart!, {totalWin: corrupt.feature.logicalRound!.totalWin});
            } else if (mutation === "payout") {
                Object.assign(corrupt.feature.lastRound!, {payout: 0, creditsBefore: saved.credits + result.stake});
                if (logical) Object.assign(corrupt.feature.deliveryStart!, {credits: saved.credits, totalPayout: corrupt.feature.logicalRound!.totalPayout});
            } else {
                const screen = [["A"], ["A"], ["A"]];
                Object.assign(corrupt.feature.lastRound!, {screen, network: {...result.network, reelsSymbols: screen}});
            }
            const calls = restore.mock.calls.length;
            const rng = host.serializeState();
            expect(() => runtime.restoreSession(corrupt)).toThrow(/money|screen/);
            await expect(runtime.replay(corrupt, [command])).rejects.toThrow(/money|screen/);
            expect(() => fresh.restoreSession(corrupt)).toThrow(/money|screen/);
            expect(restore).toHaveBeenCalledTimes(calls);
            expect(host.serializeState()).toEqual(rng);
            expect(session.serialize()).toEqual(saved);
        }
        const {deliveries: _deliveries, ...receipt} = result;
        if (policy !== "anonymous") {
            expect(await fresh.restoreSession(saved).play(command)).toEqual(receipt);
            expect((await runtime.replay(saved, [command])).rounds).toEqual([receipt]);
        }
        const recovered = fresh.restoreSession(saved);
        if (policy === "bounded") {
            const next = {delivery: "composite", continuation: {roundId: "x", cursor: 2}};
            expect(await recovered.play(next)).toEqual(await session.play(next));
        }
        for (let index = 0; index < 2; index++) {
            expect(await recovered.play({bet: 0.05})).toEqual(await session.play({bet: 0.05}));
            expect(recovered.serialize()).toEqual(session.serialize());
        }
    } finally {
        fresh.dispose();
        runtime.dispose();
    }
});

it.each(["stepwise", "composite", "plain"] as const)("rejects nested %s checkpoint projections and analytics before host effects, then restores and reuses", async policy => {
    const {checkpointProjectionMutations, mutateCheckpointProjection} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const host = new SeededPokieWasmHost("probe");
    const restore = jest.spyOn(host, "restoreState");
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
    const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
    try {
        const session = runtime.createSession("probe");
        const command = {bet: 0.05, roundId: "x", ...(policy === "plain" ? {} : {delivery: policy})};
        const result = await session.play(command);
        const saved = session.serialize();
        const before = host.serializeState();
        for (const mutation of checkpointProjectionMutations) {
            const corrupt = mutateCheckpointProjection(saved, mutation);
            // Completed composites have no active entries and already report completion.
            if (JSON.stringify(corrupt) === JSON.stringify(saved)) continue;
            const calls = restore.mock.calls.length;
            expect(() => runtime.restoreSession(corrupt)).toThrow(/network|analytics|plain money|boundedMechanics|weighted bonus|screenModifiers/i);
            expect(() => fresh.restoreSession(corrupt)).toThrow(/network|analytics|plain money|boundedMechanics|weighted bonus|screenModifiers/i);
            await expect(runtime.replay(corrupt, [command])).rejects.toThrow(/network|analytics|plain money|boundedMechanics|weighted bonus|screenModifiers/i);
            expect(restore).toHaveBeenCalledTimes(calls);
            expect(host.serializeState()).toEqual(before);
            expect(session.serialize()).toEqual(saved);
        }
        const {deliveries: _deliveries, ...receipt} = result;
        for (const target of [runtime, fresh]) {
            const restored = target.restoreSession(saved);
            const initial = restored.getInitialData!();
            expect(initial).toMatchObject(receipt.network!);
            initial.reelsSymbols[0][0] = "INVALID";
            initial.winEvaluationResult!.winningPositions.push([-999, 999]);
            initial.boundedMechanics!.weightedBonus!.payout = -123;
            expect(restored.serialize()).toEqual(saved);
            expect(restored.getInitialData?.()).toMatchObject(receipt.network!);
            expect(await restored.play(command)).toEqual(receipt);
            expect(await restored.play(command)).toEqual(receipt);
            restored.dispose();
        }
        expect((await runtime.replay(saved, [command])).rounds).toEqual([receipt]);
        const restored = fresh.restoreSession(saved);
        if (policy === "stepwise") {
            for (const cursor of [1, 2]) {
                const next = {delivery: "stepwise", continuation: {roundId: "x", cursor}};
                expect(await restored.play(next)).toEqual(await session.play(next));
            }
            const completed = restored.serialize();
            if (completed.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            expect(completed.feature.lastRound?.analytics).toMatchObject({position: 3, logicalCompletion: true, features: [{feature: "weightedBonus", completion: {duration: 2, win: 0.44999999999999996, entryPosition: 1}}]});
        }
        for (let index = 0; index < 2; index++) {
            const next = {bet: 0.05};
            expect(await restored.play(next)).toEqual(await session.play(next));
            expect(restored.serialize()).toEqual(session.serialize());
        }
    } finally {
        runtime.dispose();
        fresh.dispose();
    }
});

it("validates analytics at its shared owner before mutation and explicitly restores a used observer like a fresh one", async () => {
    const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
    const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
    const {SessionFeatureAnalyticsObserver} = await import("../../../src/simulation/SessionFeatureAnalyticsObserver.js");
    const first = createAuthoredSession(weightedBonusBlueprint(), new SeededRandomNumberGenerator("probe"));
    const second = createAuthoredSession(weightedBonusBlueprint(), new SeededRandomNumberGenerator("probe"));
    try {
        const observer = new SessionFeatureAnalyticsObserver(first.session);
        const fresh = new SessionFeatureAnalyticsObserver(second.session);
        const origin = observer.toState();
        observer.afterPlay(observer.beforePlay(), 0);
        const used = observer.toState();
        for (const active of [
            {weightedBonus: {duration: 999, win: 0, known: true, entryPosition: 1}},
            {weightedBonus: {duration: 0, win: 0, known: true, entryPosition: 0}},
            {weightedBonus: {duration: 0, win: 0, known: true, entryPosition: 1, extra: []}},
        ]) {
            expect(() => observer.restoreState({...used, active})).toThrow("Invalid active feature analytics continuation.");
            expect(observer.toState()).toEqual(used);
        }
        for (const target of [observer, fresh]) target.restoreState(origin);
        expect(observer.toState()).toEqual(origin);
        for (let index = 0; index < 2; index++) {
            expect(observer.afterPlay(observer.beforePlay(), 0)).toEqual(fresh.afterPlay(fresh.beforePlay(), 0));
            expect(observer.toState()).toEqual(fresh.toState());
        }
    } finally {
        first.dispose();
        second.dispose();
    }
});

it("initializes required feature analytics once for a supported empty replay origin", async () => {
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("probe"));
    try {
        const result = await runtime.replay({schemaVersion: "pokie.state.v2", seed: "probe", sequence: 0, drawCount: 0, credits: 1000}, [{bet: 0.05, roundId: "x", delivery: "stepwise"}]);
        expect(result.rounds[0]).toMatchObject({sequence: 1, win: 0.35, analytics: {position: 1, logicalEntry: true}});
        expect(runtime.restoreSession(result.stateAfter).serialize()).toEqual(result.stateAfter);
    } finally {
        runtime.dispose();
    }
});

it.each(["stepwise", "composite", "plain"] as const)("binds %s artifact awards, grants and feature events to model/native state across direct restore, replay and recovery", async policy => {
    const {checkpointFeatureObservationFixtures, mutateCheckpointProjection} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const {ScreenModifierEngine} = await import("../../../src/session/videoslot/modifiers/ScreenModifierEngine.js");
    for (const {id, blueprint, mutations, seed = "probe", maxSubrounds} of checkpointFeatureObservationFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const host = new SeededPokieWasmHost(seed);
        const restore = jest.spyOn(host, "restoreState");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("receiving"));
        try {
            const session = runtime.createSession(seed);
            const command = {bet: 0.05, roundId: "x", ...(policy === "plain" ? {} : {delivery: policy, ...(maxSubrounds ? {maxSubrounds} : {})})};
            const {deliveries: _deliveries, ...receipt} = await session.play(command);
            const saved = session.serialize();
            if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            if (id === "cascade") expect(saved.feature.logicalRound?.subrounds[0].artifacts ?? saved.feature.plainMath!.artifact.steps).toHaveLength(3);
            const before = host.serializeState();
            const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
            const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
            const {restoreDeclarativeObservation} = await import("../../../src/wasm/internal/restoreDeclarativeObservation.js");
            const nativeObservation = id === "freeGames" || id.startsWith("award-") ? createAuthoredSession(blueprint, new SeededRandomNumberGenerator(seed)) : undefined;
            if (nativeObservation) {
                nativeObservation.session.setBet(0.05);
                for (let index = 0; index < (policy === "composite" ? maxSubrounds ?? 1 : 1); index++) {
                    nativeObservation.session.setSelectionContext?.("logical:x");
                    nativeObservation.session.play();
                }
            }
            const native = saved.feature.state as {modifierState: import("../../../src/session/videoslot/modifiers/ScreenModifiers.js").ScreenModifierState};
            const engine = blueprint.mechanics?.modifiers && new ScreenModifierEngine({modifiers: blueprint.mechanics.modifiers, symbols: blueprint.symbols,
                wilds: blueprint.wilds ?? [], reels: blueprint.reels, rows: blueprint.rows, screenGeometry: blueprint.screenGeometry});
            for (const mutation of mutations) {
                const corrupt = mutateCheckpointProjection(saved, mutation);
                if (id.startsWith("award-")) {
                    const steps = corrupt.feature.logicalRound?.subrounds[0].artifacts ?? corrupt.feature.plainMath!.artifact.steps;
                    expect(steps!.flatMap(step => step.wins).reduce((sum, win) => sum + win.winAmount, 0)).toBe(receipt.win);
                    expect(corrupt.feature.lastRound!.network!.totalWin).toBe(receipt.network!.totalWin);
                    if (id === "award-bonus") {
                        expect(corrupt.feature.lastRound!.network!.winEvaluationResult!.lineWins).toEqual(receipt.network!.winEvaluationResult!.lineWins);
                        expect(corrupt.feature.lastRound!.network!.winEvaluationResult!.valueWins).toEqual(receipt.network!.winEvaluationResult!.valueWins);
                    }
                    if (id === "award-respins") expect(corrupt.feature.lastRound!.network!.boundedMechanics!.respins).toMatchObject({remaining: 2, executed: 0, granted: mutation[0] === "acceptedAward.respinGrant" ? 1 : 2});
                    else {
                        const expected = mutation[0] === "acceptedAward.omit" ? [0.2] : [0.05, 0.15];
                        if (id === "award-bonus") expected.splice(0, 2, 0.35 - 0.2, 0.2);
                        expect(steps!.flatMap(step => step.wins).map(win => win.winAmount)).toEqual(expected);
                    }
                }
                const calls = restore.mock.calls.length;
                const error = /modifier|sticky|holdAndWin|jackpot|chargedBetMode|win|position|logical|stops|draw|plain money|canonical feature|freeGamesTriggered|respins|bonus/i;
                if (nativeObservation) {
                    const steps = corrupt.feature.logicalRound?.subrounds[0].artifacts ?? corrupt.feature.plainMath!.artifact.steps;
                    expect(() => restoreDeclarativeObservation(nativeObservation.session, blueprint, steps!, receipt.screen!.map(reel => [...reel]), receipt.win!, undefined, nativeObservation.calculator, corrupt.feature.analyticsCheckpoint?.before, corrupt.feature.analyticsCheckpoint?.balances, corrupt.feature.logicalRound?.subrounds[0].stake ?? corrupt.feature.plainMath!.artifact.stake)).toThrow(error);
                    const validSteps = saved.feature.logicalRound?.subrounds[0].artifacts ?? saved.feature.plainMath!.artifact.steps;
                    expect(() => restoreDeclarativeObservation(nativeObservation.session, blueprint, validSteps!, receipt.screen!.map(reel => [...reel]), receipt.win!, undefined, nativeObservation.calculator, saved.feature.analyticsCheckpoint?.before, saved.feature.analyticsCheckpoint?.balances, saved.feature.logicalRound?.subrounds[0].stake ?? saved.feature.plainMath!.artifact.stake)).not.toThrow();
                }
                expect(() => runtime.restoreSession(corrupt)).toThrow(error);
                expect(() => fresh.restoreSession(corrupt)).toThrow(error);
                await expect(runtime.replay(corrupt, [command])).rejects.toThrow(error);
                if (engine && !mutation[0].endsWith("duplicate")) {
                    expect(() => engine.validateObservation(corrupt.feature.lastRound!.network!.modifiers, native.modifierState)).toThrow(error);
                    expect(() => engine.validateObservation(receipt.network!.modifiers, native.modifierState)).not.toThrow();
                }
                expect(restore).toHaveBeenCalledTimes(calls);
                expect(host.serializeState()).toEqual(before);
                expect(session.serialize()).toEqual(saved);
                expect(await session.play(command)).toEqual(receipt);
            }
            nativeObservation?.dispose();
            // Rejection recovery uses the existing owner. Explicit restoration below is separate.
            const reference = fresh.restoreSession(saved);
            const nextCommand = (state: ReturnType<typeof session.serialize>) => state.schemaVersion === "pokie.state.v4" && state.feature.logicalRound?.status === "pending"
                ? {delivery: "stepwise", continuation: {roundId: "x", cursor: state.feature.logicalRound.deliveryCursor}} : {bet: 0.05};
            for (let index = 0; index < 2; index++) {
                const command = nextCommand(session.serialize());
                expect(await session.play(command)).toEqual(await reference.play(command));
                expect(session.serialize()).toEqual(reference.serialize());
            }
            for (const target of [runtime, fresh]) {
                const restored = target.restoreSession(saved);
                expect(await restored.play(command)).toEqual(receipt);
                expect(await restored.play(command)).toEqual(receipt);
                restored.dispose();
            }
            expect((await runtime.replay(saved, [command])).rounds).toEqual([receipt]);
        } finally {
            runtime.dispose();
            fresh.dispose();
        }
    }
});

it("binds the analytics owner's prior state to real paid entries and continuations without changing observation behavior", async () => {
    const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
    const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
    const {SessionFeatureAnalyticsObserver} = await import("../../../src/simulation/SessionFeatureAnalyticsObserver.js");
    const {SessionRuntime} = await import("../../../src/runtime/SessionRuntime.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const built = createAuthoredSession(blueprint, new SeededRandomNumberGenerator("probe"));
    const runtime = new SessionRuntime(built.session);
    const observer = new SessionFeatureAnalyticsObserver(built.session);
    built.session.setBet(0.05);
    try {
        for (const cursor of [0, 1, 2]) {
            const before = observer.beforePlay();
            const prior = observer.toState();
            const command = cursor === 0 ? {kind: "spin" as const, bet: 0.05, roundId: "x", delivery: "stepwise" as const}
                : {kind: "spin" as const, delivery: "stepwise" as const, continuation: {roundId: "x", cursor}};
            const result = runtime.execute(command);
            if (result.status !== "played") throw new Error(result.reason);
            const corrupt = {...before, pending: true};
            observer.restoreState({...prior, logicalKnown: false});
            expect(() => observer.validateAcceptedTransition(corrupt, cursor === 0, cursor > 0)).toThrow("Analytics prior state contradicts");
            expect(observer.toState()).toEqual({...prior, logicalKnown: false});
            observer.restoreState(prior);
            expect(() => observer.validateAcceptedTransition(before, cursor === 0, cursor > 0)).not.toThrow();
            const accepted = observer.afterPlay(before, result.win, result.mode);
            expect(accepted).toMatchObject({logicalEntry: cursor === 0, carriedSubround: false, logicalCompletion: cursor === 2});
            if (cursor === 2) expect(accepted.features).toEqual([{feature: "weightedBonus", entry: false, retrigger: false, granted: 0, entryExecuted: false,
                completion: {duration: 2, win: 0.44999999999999996, entryPosition: 1}}]);
        }
    } finally {
        runtime.release();
        built.dispose();
    }
});

it("preserves a carried analytics observer's own duration through accepted native continuations", async () => {
    const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
    const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
    const {SessionFeatureAnalyticsObserver} = await import("../../../src/simulation/SessionFeatureAnalyticsObserver.js");
    const {SessionRuntime} = await import("../../../src/runtime/SessionRuntime.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => {
        outcome.weight = outcome.id === "large" ? 1 : 0;
        if (outcome.id === "large") outcome.duration = 4;
    });
    blueprint.mechanics!.weightedBonus!.feature.maxDuration = 4;
    const built = createAuthoredSession(blueprint, new SeededRandomNumberGenerator("probe"));
    const runtime = new SessionRuntime(built.session);
    built.session.setBet(0.05);
    try {
        // A native simulation observer can start mid-feature; it has no known entry.
        for (let index = 0; index < 3; index++) expect(runtime.execute({kind: "spin"})).toMatchObject({status: "played"});
        const observer = new SessionFeatureAnalyticsObserver(built.session);
        for (let index = 0; index < 2; index++) {
            const before = observer.beforePlay();
            const prior = observer.toState();
            const result = runtime.execute({kind: "spin"});
            if (result.status !== "played") throw new Error(result.reason);
            observer.validateAcceptedTransition(before, false, false);
            expect(observer.toState()).toEqual(prior);
            const accepted = observer.afterPlay(before, result.win);
            expect(accepted).toMatchObject({carriedSubround: true, logicalCompletion: false});
            if (index === 0) expect(observer.toState().active.weightedBonus).toMatchObject({known: false, duration: 1});
            else expect(accepted.features).toContainEqual(expect.objectContaining({feature: "weightedBonus", excludedCompletion: true}));
        }
    } finally {
        runtime.release();
        built.dispose();
    }
});

it("rejects retained instantaneous analytics features during a real pending progression", async () => {
    const {boundedBlueprint} = await import("../../v2/fixtures/BoundedMechanicsGame.js");
    const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
    const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
    const {SessionFeatureAnalyticsObserver} = await import("../../../src/simulation/SessionFeatureAnalyticsObserver.js");
    const {SessionRuntime} = await import("../../../src/runtime/SessionRuntime.js");
    const blueprint = boundedBlueprint("cascade-respins");
    blueprint.reelStrips = [["C"], ["C"], ["C"]];
    const built = createAuthoredSession(blueprint, new SeededRandomNumberGenerator("probe"));
    const runtime = new SessionRuntime(built.session);
    const observer = new SessionFeatureAnalyticsObserver(built.session);
    built.session.setBet(0.05);
    try {
        const entry = observer.beforePlay();
        expect(runtime.execute({kind: "spin"})).toMatchObject({status: "played"});
        observer.afterPlay(entry, 0);
        const before = observer.beforePlay();
        const prior = observer.toState();
        expect(runtime.execute({kind: "spin"})).toMatchObject({status: "played"});
        const corrupt = {...prior, active: {...prior.active, cascade: {known: true, duration: 0, win: 0, entryPosition: 1}}};
        observer.restoreState(corrupt);
        expect(() => observer.validateAcceptedTransition(before, false, false)).toThrow("Analytics prior state contradicts");
        expect(observer.toState()).toEqual(corrupt);
        observer.restoreState(prior);
        observer.validateAcceptedTransition(before, false, false);
        expect(observer.afterPlay(before, 0).activeKnownFeatures).toEqual(["respins"]);
    } finally {
        runtime.release();
        built.dispose();
    }
});

it.each(["plain", "stepwise", "composite"] as const)("binds %s known analytics provenance and accumulated wins to accepted accounting across restore/replay/reuse", async policy => {
    const {checkpointAccountingFixtures, mutateCheckpointProjection} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const {id, blueprint, mode, completion} of checkpointAccountingFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const host = new SeededPokieWasmHost("probe");
        const restore = jest.spyOn(host, "restoreState");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("receiving"));
        try {
            const session = runtime.createSession("probe");
            const delivery = policy === "plain" ? {} : {delivery: policy, ...(policy === "composite" ? {maxSubrounds: 1} : {})};
            await session.play({bet: 0.05, roundId: "x", mode, ...delivery});
            const command = policy === "plain" ? {} : {...delivery, continuation: {roundId: "x", cursor: 1}};
            const {deliveries: _deliveries, ...receipt} = await session.play(command);
            const saved = session.serialize();
            if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            expect(saved.feature.analytics?.active[id as "weightedBonus"]).toMatchObject({known: true, entryPosition: 1});
            const before = host.serializeState();
            for (const mutation of [["analyticsAccounting.inflated"], ["analyticsTransition.plainCarried"]] as const) {
                const corrupt = mutateCheckpointProjection(saved, mutation);
                const calls = restore.mock.calls.length;
                for (const target of [runtime, fresh]) {
                    expect(() => target.restoreSession(corrupt)).toThrow(/Analytics.*(accounting|prior state)/i);
                    await expect(target.replay(corrupt, [command])).rejects.toThrow(/Analytics.*(accounting|prior state)/i);
                }
                expect(restore).toHaveBeenCalledTimes(calls);
                expect(host.serializeState()).toEqual(before);
                expect(session.serialize()).toEqual(saved);
                if (policy !== "plain") expect(await session.play(command)).toEqual(receipt);
            }
            const reference = fresh.restoreSession(saved);
            const finish = policy === "plain" ? {} : {...delivery, continuation: {roundId: "x", cursor: 2}};
            const result = await session.play(finish);
            expect(await reference.play(finish)).toEqual(result);
            expect(result.analytics?.features).toContainEqual(expect.objectContaining({feature: id, completion: expect.objectContaining({win: completion, entryPosition: 1})}));
            expect(result.analytics?.logicalCompletion).toBe(true);
            for (let index = 0; index < 2; index++) {
                const next = {bet: 0.05};
                expect(await session.play(next)).toEqual(await reference.play(next));
            }
            for (const target of [runtime, fresh]) {
                const restored = target.restoreSession(saved);
                if (policy !== "plain") expect(await restored.play(command)).toEqual(receipt);
                expect(await restored.play(finish)).toEqual(result);
                restored.dispose();
            }
            expect((await runtime.replay(saved, policy === "plain" ? [finish] : [command, finish])).rounds).toEqual(policy === "plain" ? [result] : [receipt, result]);
        } finally {
            runtime.dispose();
            fresh.dispose();
        }
    }
});

it("rejects fabricated prior analytics wins at the observer owner before effects, then explicitly restores and completes", async () => {
    const {checkpointAccountingFixtures} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
    const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
    const {SessionFeatureAnalyticsObserver} = await import("../../../src/simulation/SessionFeatureAnalyticsObserver.js");
    const {SessionRuntime} = await import("../../../src/runtime/SessionRuntime.js");
    for (const {id, blueprint, mode, completion} of checkpointAccountingFixtures()) {
        const built = createAuthoredSession(blueprint, new SeededRandomNumberGenerator("probe"));
        const runtime = new SessionRuntime(built.session);
        const observer = new SessionFeatureAnalyticsObserver(built.session);
        try {
            for (const cursor of [0, 1, 2]) {
                const before = observer.beforePlay();
                const prior = observer.toState();
                const result = runtime.execute(cursor === 0 ? {kind: "spin", bet: 0.05, mode, roundId: "x", delivery: "stepwise"} : {kind: "spin", delivery: "stepwise", continuation: {roundId: "x", cursor}});
                if (result.status !== "played") throw new Error(result.reason);
                const accepted = {entryPosition: 1, wins: {[id]: prior.active[id as "weightedBonus"]?.win ?? 0}};
                if (cursor > 0) {
                    const corrupt = JSON.parse(JSON.stringify(prior)) as typeof prior;
                    corrupt.active[id as "weightedBonus"]!.win += 999;
                    observer.restoreState(corrupt);
                    expect(() => observer.validateAcceptedTransition(before, false, true, accepted)).toThrow("Analytics accumulated feature win");
                    expect(observer.toState()).toEqual(corrupt);
                    observer.restoreState(prior);
                }
                observer.validateAcceptedTransition(before, cursor === 0, cursor > 0, accepted);
                const observation = observer.afterPlay(before, result.win, result.mode);
                if (cursor === 2) expect(observation.features).toContainEqual(expect.objectContaining({feature: id, completion: expect.objectContaining({win: completion})}));
            }
        } finally {
            runtime.release();
            built.dispose();
        }
    }
});

it.each(["plain", "stepwise", "composite"] as const)("rejects coordinated %s authored payout, entry and collection transitions before host restoration", async policy => {
    const {checkpointTransitionFixtures, mutateCheckpointTransition} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const {createAuthoredSession} = await import("../../../src/generated/createAuthoredSession.js");
    const {SeededRandomNumberGenerator} = await import("../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js");
    const {restoreDeclarativeObservation} = await import("../../../src/wasm/internal/restoreDeclarativeObservation.js");
    for (const test of checkpointTransitionFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint: test.blueprint});
        const host = new SeededPokieWasmHost("probe");
        const restore = jest.spyOn(host, "restoreState");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("probe"));
        const native = createAuthoredSession(test.blueprint, new SeededRandomNumberGenerator("probe"));
        native.session.setBet(0.05);
        try {
            const session = runtime.createSession("probe");
            const entry = {bet: 0.05, roundId: "x", ...(test.mode ? {mode: test.mode} : {}), ...(policy === "plain" ? {} : {delivery: policy, maxSubrounds: 1})};
            const continuation = policy === "plain" ? {bet: 0.05, roundId: "continued"} : {delivery: policy, maxSubrounds: 1, continuation: {roundId: "x", cursor: 1}};
            const command = test.continuation ? continuation : entry;
            if (test.continuation) await session.play(entry);
            const {deliveries: _deliveries, ...receipt} = await session.play(command);
            expect(receipt.win).toBe(test.expectedWin);
            if (test.expectedPayout !== undefined) expect(receipt.payout).toBeCloseTo(test.expectedPayout, 12);
            if (test.expectedSum !== undefined) expect(Reflect.get(receipt.network!, "freeGamesSum")).toBe(test.expectedSum);
            if (test.expectedRemaining !== undefined) expect(receipt.network?.holdAndWin).toMatchObject({active: true, respinsRemaining: 2, payout: 0});
            const saved = session.serialize();
            if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            const corrupt = await mutateCheckpointTransition(saved, test, command);
            let expected = /Collection.*transition/i;
            if (test.id.includes("hold")) expected = /HoldAndWin.*(payout|entry|completion)/i;
            if (test.id.includes("free")) expected = /Free-games.*(bank|counters)/i;
            if (test.id.includes("jackpot")) expected = /Jackpot.*(award|payout)/i;
            if (test.id.includes("bonus")) expected = /bonus.*(selection|observation)/i;
            if (test.id === "transition-bonus-entry") expected = /Weighted bonus selection presence/i;
            const before = host.serializeState();
            const calls = restore.mock.calls.length;
            // Exercise the same malformed input at the stateless authority, then its
            // public restore/replay callers. The native codec validates shape first.
            const observe = (state: typeof saved) => {
                const decode = (value: unknown): Record<string, unknown> => {
                    const record = JSON.parse(JSON.stringify(value));
                    if (record.base) record.base = decode(record.base);
                    else record.reelStrips = test.blueprint.reelStrips;
                    return record;
                };
                (native.session as typeof native.session & {fromSessionState(value: unknown): unknown}).fromSessionState(decode(state.feature.state));
                const math = state.feature.logicalRound?.subrounds[0];
                return restoreDeclarativeObservation(native.session, test.blueprint, math?.artifacts ?? state.feature.plainMath!.artifact.steps!,
                    state.feature.lastRound!.screen!.map(reel => [...reel]), math?.win ?? state.feature.plainMath!.artifact.totalWin,
                    undefined, native.calculator, state.feature.analyticsCheckpoint!.before, state.feature.analyticsCheckpoint!.balances,
                    math?.stake ?? state.feature.plainMath!.artifact.stake, math?.payout ?? state.feature.plainMath!.payout);
            };
            expect(() => observe(corrupt)).toThrow(expected);
            expect(() => observe(saved)).not.toThrow();
            for (const target of [runtime, fresh]) {
                expect(() => target.restoreSession(corrupt)).toThrow(expected);
                await expect(target.replay(corrupt, [command])).rejects.toThrow(expected);
            }
            expect(restore).toHaveBeenCalledTimes(calls);
            expect(host.serializeState()).toEqual(before);
            expect(session.serialize()).toEqual(saved);
            expect(await session.play(command)).toEqual(receipt);
            const reference = fresh.restoreSession(saved);
            for (let index = 0; index < 2; index++) {
                const state = session.serialize();
                const round = state.schemaVersion === "pokie.state.v4" && state.feature.logicalRound;
                const next = round && round.status === "pending" ? {delivery: "stepwise", continuation: {roundId: "x", cursor: round.deliveryCursor}} : {bet: 0.05};
                const actual = await session.play(next);
                expect(actual).toEqual(await reference.play(next));
                if (test.nextWin !== undefined) expect(actual.win).toBe(test.nextWin);
                if (test.mode === "buy" && !test.continuation) {
                    expect(actual.payout).toBe(0);
                    expect(actual.credits).toBe(999.5);
                    if (index === 1) expect(Reflect.get(actual.network!, "freeGamesNum")).toBe(3);
                }
                if (test.expectedRemaining !== undefined) expect(actual.network?.holdAndWin).toMatchObject({active: index === 0, respinsRemaining: index === 0 ? 1 : 0, payout: index === 0 ? 0 : 2});
                expect(session.serialize()).toEqual(reference.serialize());
            }
            for (const target of [runtime, fresh]) {
                const repaired = target.restoreSession(saved);
                for (let retry = 0; retry < 2; retry++) expect(await repaired.play(command)).toEqual(receipt);
                repaired.dispose();
                expect((await target.replay(saved, [command])).rounds).toEqual([receipt]);
            }
        } finally {
            native.dispose();
            runtime.dispose();
            fresh.dispose();
        }
    }
});

it("rejects every fabricated initialized feature before host mutation and preserves first-play continuation", async () => {
    const {checkpointInitializationFixtures, mutateCheckpointInitialization} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const {id, blueprint} of checkpointInitializationFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const host = new SeededPokieWasmHost("probe");
        const restore = jest.spyOn(host, "restoreState");
        const next = jest.spyOn(host, "nextRandom");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
        try {
            const session = runtime.createSession("probe");
            const saved = JSON.parse(JSON.stringify(session.serialize()));
            const display = session.getInitialData!();
            expect(saved.sequence).toBe(0);
            const corrupt = mutateCheckpointInitialization(saved, id);
            const before = host.serializeState();
            const calls = restore.mock.calls.length;
            const draws = next.mock.calls.length;
            for (const receiving of [runtime, fresh]) {
                expect(() => receiving.restoreSession(corrupt)).toThrow(/canonical initialization/);
                await expect(receiving.replay(corrupt, [{bet: 0.05}])).rejects.toThrow(/canonical initialization/);
            }
            expect(restore).toHaveBeenCalledTimes(calls);
            expect(next).toHaveBeenCalledTimes(draws);
            expect(host.serializeState()).toEqual(before);
            expect(session.serialize()).toEqual(saved);
            expect(session.getInitialData!()).toEqual(display);
            const reference = fresh.restoreSession(saved);
            expect(reference.getInitialData!()).toEqual(display);
            for (let index = 0; index < 2; index++) {
                const result = await session.play({bet: 0.05});
                expect(await reference.play({bet: 0.05})).toEqual(result);
                expect(reference.serialize()).toEqual(session.serialize());
                if (index === 0) {
                    if (id === "initial-free-bank-counters") expect(result).toMatchObject({stake: 0.05, payout: expect.closeTo(0, 12), credits: 999.95});
                    if (id === "initial-collection") expect(result.network?.boundedMechanics?.collection).toMatchObject({value: 3, triggered: false, payout: 0});
                    if (id === "initial-respins") expect(result.stake).toBe(0.05);
                    if (id === "initial-sticky") expect(result.payout).toBeCloseTo(0, 12);
                    if (id === "initial-jackpot") expect(result.payout).toBeCloseTo(10.005, 12);
                    if (id === "initial-hold") expect(result).toMatchObject({stake: 0.05, payout: expect.closeTo(0, 12)});
                }
            }
            // Explicit restoration into a used runtime is separate from rejection recovery.
            for (const receiving of [runtime, fresh]) {
                const restored = receiving.restoreSession(saved);
                expect(restored.getInitialData!()).toEqual(display);
                const first = await restored.play({bet: 0.05});
                expect((await receiving.replay(saved, [{bet: 0.05}])).rounds).toEqual([first]);
                restored.dispose();
            }
        } finally {
            runtime.dispose();
            fresh.dispose();
        }
    }
});

it.each(["plain", "stepwise", "composite"] as const)("binds coordinated %s weighted counters to accepted mathematics at domain and restore boundaries", async policy => {
    const {checkpointCounterFixtures, mutateCheckpointCounters} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const {validateCheckpointFeasibility} = await import("../../../src/wasm/internal/validateCheckpointFeasibility.js");
    const {VideoSlotSession} = await import("../../../src/session/videoslot/VideoSlotSession.js");
    for (const {id, blueprint, plays = 1} of checkpointCounterFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const host = new SeededPokieWasmHost("probe");
        const restore = jest.spyOn(host, "restoreState");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
        const nativeRestore = jest.spyOn(VideoSlotSession.prototype, "fromSessionState");
        try {
            const session = runtime.createSession("probe");
            const command = {bet: 0.05, roundId: "counter", ...(policy === "plain" ? {} : {delivery: policy, maxSubrounds: 1})};
            if (id === "counter-reels-after-bonus") {
                await session.play({bet: 0.05, roundId: "previous", delivery: "composite"});
            }
            let receipt = await session.play(command);
            for (let index = 1; index < plays; index++) {
                const current = session.serialize() as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
                const round = current.feature.logicalRound;
                Reflect.deleteProperty(command, "continuation");
                if (round?.status === "pending") {
                    Reflect.deleteProperty(command, "bet");
                    Reflect.deleteProperty(command, "roundId");
                    Object.assign(command, {continuation: {roundId: round.id, cursor: round.deliveryCursor}});
                } else {
                    Object.assign(command, {bet: 0.05, roundId: `counter-${index}`});
                    const state = current.feature.state as {remaining?: number};
                    if (policy === "plain" && state.remaining! > 0) Reflect.deleteProperty(command, "roundId");
                }
                receipt = await session.play(command);
            }
            const saved = session.serialize();
            if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            const corrupt = mutateCheckpointCounters(saved, id);
            const position = saved.feature.analytics!.position;
            expect(position).toBe(id === "counter-reels-after-bonus" ? 4 : plays);
            if (id.endsWith("-reduced")) {
                if (id === "counter-bonus-reduced") expect(receipt.weightedBonusStatistics).toMatchObject({selections: 3, completed: 2});
                else expect(receipt.sequenceStatistics![0].selections).toBe(plays === 2 ? 2 : 3);
            }
            const expected = /Weighted (reel|bonus).*counter|weighted bonus completion/i;
            const validate = (state: typeof saved) => validateCheckpointFeasibility(blueprint, state);
            expect(() => validate(corrupt)).toThrow(expected);
            expect(() => validate(saved)).not.toThrow();
            const before = host.serializeState();
            const calls = restore.mock.calls.length;
            const nativeCalls = nativeRestore.mock.calls.length;
            for (const receiving of [runtime, fresh]) {
                const diagnostics = receiving.getDiagnostics();
                expect(() => receiving.restoreSession(corrupt)).toThrow(expected);
                await expect(receiving.replay(corrupt, [command])).rejects.toThrow(expected);
                expect(receiving.getDiagnostics()).toEqual(diagnostics);
            }
            expect(nativeRestore).toHaveBeenCalledTimes(nativeCalls);
            expect(restore).toHaveBeenCalledTimes(calls);
            expect(host.serializeState()).toEqual(before);
            expect(session.serialize()).toEqual(saved);
            expect(await session.play(command)).toEqual(receipt);
            const reference = fresh.restoreSession(saved);
            for (let index = 0; index < 2; index++) {
                const current = session.serialize();
                const round = current.schemaVersion === "pokie.state.v4" && current.feature.logicalRound;
                const next = round && round.status === "pending" ? {delivery: "stepwise", continuation: {roundId: round.id, cursor: round.deliveryCursor}} : {bet: 0.05};
                expect(await session.play(next)).toEqual(await reference.play(next));
                expect(session.serialize()).toEqual(reference.serialize());
            }
            for (const receiving of [runtime, fresh]) {
                const restored = receiving.restoreSession(saved);
                for (let retry = 0; retry < 2; retry++) expect(await restored.play(command)).toEqual(receipt);
                expect((await receiving.replay(saved, [command])).rounds).toEqual([receipt]);
                restored.dispose();
            }
        } finally {
            nativeRestore.mockRestore();
            runtime.dispose();
            fresh.dispose();
        }
    }
});


it.each(["plain", "stepwise", "composite"] as const)("retains model-feasible %s nontriggers, zero durations/grants and bounded continuations without replay", async policy => {
    const {checkpointCounterFixtures} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const conditional = weightedBonusBlueprint();
    Reflect.deleteProperty(conditional, "reelStrips");
    conditional.reelSequences = [
        {type: "weighted", variants: [{id: "mixed", symbols: ["A", "C"], weight: 1}, {id: "zero", symbols: ["A", "A"], weight: 0}]},
        {type: "exact", symbols: ["C"]}, {type: "exact", symbols: ["C"]},
    ];
    const never = JSON.parse(JSON.stringify(conditional)) as typeof conditional;
    never.reelSequences![0] = {type: "weighted", variants: [{id: "no-trigger", symbols: ["A"], weight: 1}, {id: "zero-trigger", symbols: ["C"], weight: 0}]};
    const zeroDuration = weightedBonusBlueprint();
    zeroDuration.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "small" ? 1 : 0);
    const free = checkpointCounterFixtures().find(test => test.id === "counter-reels-free-zero-reduced")!.blueprint;
    const bought = JSON.parse(JSON.stringify(free)) as typeof free;
    bought.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 3}];
    const respins = checkpointCounterFixtures().find(test => test.id === "counter-reels-respins-reduced")!.blueprint;
    respins.mechanics!.respins!.trigger.symbolId = "B";
    for (const [id, blueprint] of [["never", never], ["conditional", conditional], ["zero-duration", zeroDuration], ["zero-grant", free], ["bought", bought], ["respin-nontrigger", respins]] as const) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("probe"));
        const receiver = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("unused-seed"));
        try {
            let session = runtime.createSession("probe");
            const expected = receiver.restoreSession(session.serialize());
            let selected = false,
                missed = false;
            for (let index = 0; index < 12; index++) {
                const current = session.serialize() as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
                const round = current.feature.logicalRound;
                const command = round?.status === "pending" ? {delivery: policy === "plain" ? undefined : policy, maxSubrounds: 1, continuation: {roundId: round.id, cursor: round.deliveryCursor}}
                    : {bet: 0.05, ...((current.feature.state as {remaining?: number}).remaining! > 0 ? {} : {roundId: `${id}-${index}`}),
                        ...(policy === "plain" ? {} : {delivery: policy, maxSubrounds: 1})};
                if (id === "bought" && index % 3 === 0) Object.assign(command, {mode: "buy"});
                const result = await session.play(command);
                expect(result).toEqual(await expected.play(command));
                selected ||= !!result.network?.boundedMechanics?.weightedBonus?.selectedNow;
                missed ||= !result.network?.boundedMechanics?.weightedBonus;
                const saved = session.serialize();
                const diagnostics = runtime.getDiagnostics();
                const restored = runtime.restoreSession(JSON.parse(JSON.stringify(saved)));
                expect((await runtime.replay(saved, [])).stateAfter).toEqual(saved);
                expect(runtime.getDiagnostics().generatedDraws).toBe(diagnostics.generatedDraws);
                expect(restored.serialize()).toEqual(saved);
                session.dispose();
                session = restored;
                if (id === "bought") {
                    expect(result.network).toMatchObject({betModeId: "base", chargedBetModeId: "buy", freeGamesNum: index % 3 + 1});
                    expect(result.sequenceStatistics![0].selections).toBe(Math.floor(index / 3) + 1);
                }
                if (id === "never") expect(result.weightedBonusStatistics).toMatchObject({selections: 0, completed: 0});
                if (id === "zero-duration") expect(result.weightedBonusStatistics).toMatchObject({selections: index + 1, completed: index + 1});
                if (id === "zero-grant" || id === "respin-nontrigger") expect(result.sequenceStatistics![0].selections).toBe(index + 1);
            }
            if (id === "conditional") {
                expect(selected).toBe(true);
                expect(missed).toBe(true);
            }
        } finally {
            runtime.dispose();
            receiver.dispose();
        }
    }
});

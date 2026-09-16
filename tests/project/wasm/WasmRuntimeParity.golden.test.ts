import {SeededRandomNumberGenerator} from "../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmRound} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

describe("WASM runtime parity golden", () => {
    it("preserves seeded host draws, rounds, serialized continuation, and replay", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden"});
        const nodeRng = new SeededRandomNumberGenerator("wasm-parity-golden");
        const nodeDraws = Array.from({length: 6}, () => nodeRng.getRandomInt(0, 1_000_000) / 1_000_000);
        const supplied = [...nodeDraws];
        const firstRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => supplied.shift()!});
        const firstSession = firstRuntime.createSession("wasm-parity-golden");
        const commands = [{bet: 1}, {bet: 2}, {bet: 3}];
        const firstRounds: PokieWasmRound[] = [];
        for (const command of commands) firstRounds.push(await firstSession.play(command));
        const serialized = JSON.parse(JSON.stringify(firstSession.serialize()));
        expect(firstRounds.map((round) => round.draw)).toEqual(nodeDraws.slice(0, 3));
        expect(serialized).toEqual({schemaVersion: "pokie.state.v1", seed: "wasm-parity-golden", draws: nodeDraws.slice(0, 3), sequence: 3});

        const resumedSession = firstRuntime.restoreSession(serialized);
        const resumedRounds: PokieWasmRound[] = [];
        for (const command of commands) resumedRounds.push(await resumedSession.play(command));
        let replayRoundsCount = 0;
        const replayRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => nodeDraws[3 + replayRoundsCount++]!});
        const replayRounds = await replayRuntime.replay(serialized, commands);
        expect(replayRounds).toEqual(resumedRounds);
        expect(resumedSession.serialize()).toEqual({schemaVersion: "pokie.state.v1", seed: "wasm-parity-golden", draws: nodeDraws, sequence: 6});
        firstRuntime.dispose();
        replayRuntime.dispose();
    });

    it("rejects malformed portable state and reports canonical runtime traps", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden-invalid"});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => 0.25});
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "x", draws: [1], sequence: 1})).toThrow(/malformed/);
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "x", draws: [], sequence: -1})).toThrow(/malformed/);
        runtime.dispose();

        const trappingFixture = createCanonicalWasmFixture({id: "golden-trap", trapping: true});
        const trappingRuntime = await instantiatePokieWasm(trappingFixture.bytes, trappingFixture.manifest, {nextRandom: () => 0.25});
        await expect(trappingRuntime.createSession("trap").play()).rejects.toThrow(/unreachable|trap/i);
        trappingRuntime.dispose();
    });
});

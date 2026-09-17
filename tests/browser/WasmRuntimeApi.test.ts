import {instantiatePokieWasm, SeededPokieWasmHost} from "../../src/wasm/browser.js";
import {createCanonicalWasmFixture} from "../fixtures/wasm/createCanonicalWasmFixture.js";

describe("browser-safe WASM runtime API", () => {
    it("uses the browser entry point without Node adapters and preserves JSON-safe state", async () => {
        const fixture = createCanonicalWasmFixture({id: "browser-api"});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("browser-seed"));
        const session = runtime.createSession("browser-seed");
        expect(await session.play()).toMatchObject({sequence: 1});
        const state = JSON.parse(JSON.stringify(session.serialize()));
        expect(await runtime.replay(state, [{}])).toMatchObject({
            rounds: [{sequence: 2}],
            stateBeforeFinal: {sequence: 1},
            stateAfter: {sequence: 2},
        });
        expect(state).toMatchObject({schemaVersion: "pokie.state.v1", seed: "browser-seed", sequence: 1, draws: expect.any(Array), rngState: expect.any(Number)});
        runtime.dispose();
    });

    it("rejects a component requiring a newer POKIE runtime before browser instantiation", async () => {
        const fixture = createCanonicalWasmFixture({id: "browser-version"});
        await expect(instantiatePokieWasm(
            fixture.bytes,
            {...fixture.manifest, minPokieVersion: "999.0.0"},
            new SeededPokieWasmHost("browser-version"),
        )).rejects.toThrow(/requires POKIE 999\.0\.0 or newer/);
    });

    it("keeps replay executable without browser session play or serialization declarations", async () => {
        const fixture = createCanonicalWasmFixture({id: "browser-replay-only", capabilities: ["runtime.replay"]});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("browser-replay-only"));
        const session = runtime.createSession("browser-replay-only");
        await expect(session.play()).rejects.toThrow(/does not declare runtime\.play/i);
        expect(() => session.serialize()).toThrow(/does not declare runtime\.serialize/i);
        await expect(runtime.replay({schemaVersion: "pokie.state.v1", seed: "browser-replay-only", draws: [], sequence: 0, credits: 1000}, [{}]))
            .resolves.toMatchObject({rounds: [{sequence: 1}], stateAfter: {sequence: 1}});
        runtime.dispose();
    });
});

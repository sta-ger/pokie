import {instantiatePokieWasm, SeededPokieWasmHost} from "../../src/wasm/browser.js";
import {createCanonicalWasmFixture} from "../fixtures/wasm/createCanonicalWasmFixture.js";

describe("browser-safe WASM runtime API", () => {
    it("uses the browser entry point without Node adapters and preserves JSON-safe state", async () => {
        const fixture = createCanonicalWasmFixture({id: "browser-api"});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("browser-seed"));
        const session = runtime.createSession("browser-seed");
        expect(await session.play()).toMatchObject({sequence: 1});
        const state = JSON.parse(JSON.stringify(session.serialize()));
        expect(await runtime.replay(state, [{}])).toMatchObject([{sequence: 2}]);
        expect(state).toMatchObject({schemaVersion: "pokie.state.v1", seed: "browser-seed", sequence: 1, draws: expect.any(Array), rngState: expect.any(Number)});
        runtime.dispose();
    });
});

import {instantiatePokieWasm} from "../../src/wasm/browser.js";
import {createCanonicalWasmFixture} from "../fixtures/wasm/createCanonicalWasmFixture.js";

describe("browser-safe WASM runtime API", () => {
    it("uses the browser entry point without Node adapters and preserves JSON-safe state", async () => {
        const fixture = createCanonicalWasmFixture({id: "browser-api"});
        const draws = [0.125, 0.875];
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => draws.shift()!});
        const session = runtime.createSession("browser-seed");
        expect(await session.play()).toMatchObject({draw: 0.125, sequence: 1});
        const state = JSON.parse(JSON.stringify(session.serialize()));
        expect(await runtime.replay(state, [{}])).toMatchObject([{draw: 0.875, sequence: 2}]);
        expect(state).toEqual({schemaVersion: "pokie.state.v1", seed: "browser-seed", draws: [0.125], sequence: 1});
        runtime.dispose();
    });
});

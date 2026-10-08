import fs from "fs";
import path from "path";
import {POKIE_WASM_RUNTIME_API_VERSION, BoundedPokieWasmTraceCollector} from "pokie";
import * as browser from "pokie/browser";
import {instantiatePokieWasm, SeededPokieWasmHost} from "pokie/wasm";
import {createCanonicalWasmFixture} from "../fixtures/wasm/createCanonicalWasmFixture.js";

describe("browser-safe WASM runtime API", () => {
    it("uses the browser entry point without Node adapters and preserves JSON-safe state", async () => {
        const fixture = createCanonicalWasmFixture({id: "browser-api"});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("browser-seed"));
        const trace = new browser.BoundedPokieWasmTraceCollector(2);
        const session = runtime.createSession("browser-seed", {trace});
        expect(await session.play()).toMatchObject({sequence: 1});
        const state = JSON.parse(JSON.stringify(session.serialize()));
        expect(await runtime.replay(state, [{}])).toMatchObject({
            rounds: [{sequence: 2}],
            stateBeforeFinal: {sequence: 1},
            stateAfter: {sequence: 2},
        });
        expect(state).toMatchObject({schemaVersion: "pokie.state.v2", seed: "browser-seed", sequence: 1, drawCount: 4, rngState: expect.any(Number)});
        expect(trace.entries).toHaveLength(2);
        runtime.dispose();
        expect(trace.entries).toHaveLength(0);
    });

    it("replays the string-zero initial round through both portable public exports", async () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
        expect(pkg.exports["."].import.default).toBe("./dist/esm/index.js");
        expect(pkg.exports["."].require.default).toBe("./dist/cjs/index.js");
        expect(pkg.main).toBe(pkg.exports["."].require.default);
        expect(pkg.exports["./browser"].default).toBe("./dist/esm/browser.js");
        expect(pkg.exports["./wasm"].default).toBe("./dist/esm/wasm/browser.js");
        expect(browser.instantiatePokieWasm).toBe(instantiatePokieWasm);
        expect(browser.BoundedPokieWasmTraceCollector).toBe(BoundedPokieWasmTraceCollector);
        expect(browser.POKIE_WASM_RUNTIME_API_VERSION).toBe(POKIE_WASM_RUNTIME_API_VERSION);
        expect(POKIE_WASM_RUNTIME_API_VERSION).toBe("1.2.0");
        const fixture = createCanonicalWasmFixture();
        const runtime = await browser.instantiatePokieWasm(fixture.bytes, fixture.manifest, new browser.SeededPokieWasmHost("0"));
        try {
            const session = runtime.createSession("0");
            const initial = structuredClone(session.serialize());
            const first = await session.play({bet: 1});
            expect(first).toMatchObject({sequence: 1, screen: [["A"], ["B"]], payout: 0, credits: 999});
            const after = session.serialize();
            await session.play({bet: 1});
            expect(await runtime.replay(initial, [{bet: 1}])).toEqual({rounds: [first], stateBeforeFinal: initial, stateAfter: after});
            expect(await runtime.restoreSession(initial).play({bet: 1})).toEqual(first);
        } finally {
            runtime.dispose();
        }
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

import {PokieWasmWorkerProtocol} from "../../../src/wasm/worker.js";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../../../src/wasm/PokieWasmRuntime.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

describe("PokieWasmWorkerProtocol", () => {
    it("owns transfer-safe bytes, host-issued draws, state restoration, and disposal", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-fixture", capabilities: ["runtime.play", "runtime.serialize"]});
        const protocol = new PokieWasmWorkerProtocol();
        expect(await protocol.handle({id: "before", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
        expect(await protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75, 0.5, 0.125]})).toMatchObject({ok: true});
        expect(await protocol.handle({id: "one", type: "play", command: {bet: 1}})).toMatchObject({ok: true, result: {sequence: 1, draw: 0.25}});
        const state = await protocol.handle({id: "state", type: "serialize"});
        expect(state).toMatchObject({ok: true, result: {draws: [0.25, 0.75], sequence: 1}});
        if (!state.ok) throw new Error(state.error);
        expect(await protocol.handle({id: "restore", type: "restore", state: state.result as never})).toMatchObject({ok: true});
        expect(await protocol.handle({id: "two", type: "play"})).toMatchObject({ok: true, result: {sequence: 2, draw: 0.5}});
        expect(await protocol.handle({id: "dispose", type: "dispose"})).toEqual({id: "dispose", ok: true});
    });

    it("preserves the explicit seeded host continuation used by the main-thread runtime", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-seeded-parity"});
        const seed = "worker-seeded-parity";
        const workerDrawHost = new SeededPokieWasmHost(seed);
        const draws = [workerDrawHost.nextRandom(), workerDrawHost.nextRandom()];
        const protocol = new PokieWasmWorkerProtocol();
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed})).resolves.toMatchObject({ok: true});
        const workerRound = await protocol.handle({id: "play", type: "play", command: {bet: 1}});
        const workerState = await protocol.handle({id: "state", type: "serialize"});

        const mainRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(seed));
        const mainSession = mainRuntime.createSession(seed);
        const mainRound = await mainSession.play({bet: 1});
        expect(workerRound).toEqual({id: "play", ok: true, result: mainRound});
        expect(workerState).toEqual({id: "state", ok: true, result: mainSession.serialize()});
        mainSession.dispose();
        mainRuntime.dispose();
    });

    it("cancels acquired resources and rejects malformed protocol state", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-cancel"});
        const protocol = new PokieWasmWorkerProtocol();
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75]})).resolves.toMatchObject({ok: true});
        expect(await protocol.handle({id: "bad-state", type: "restore", state: {schemaVersion: "pokie.state.v1", seed: "x", draws: [2], sequence: 1, credits: 1000}})).toMatchObject({ok: false, error: expect.stringMatching(/malformed/)});
        expect(await protocol.handle({id: "still-active", type: "play"})).toMatchObject({ok: true, result: {draw: 0.25}});
        expect(await protocol.handle({id: "cancel", type: "cancel"})).toEqual({id: "cancel", ok: true});
        expect(await protocol.handle({id: "after", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
    });

    it("cleans up a trapped runtime before returning the worker error", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-trap", trapping: true});
        const protocol = new PokieWasmWorkerProtocol();
        await protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25]});
        expect(await protocol.handle({id: "trap", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/unreachable|trap/i)});
        expect(await protocol.handle({id: "after-trap", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
    });

    it("rejects malformed and unknown messages without releasing an active session", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-protocol"});
        const protocol = new PokieWasmWorkerProtocol();
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75]})).resolves.toMatchObject({ok: true});
        expect(await protocol.handle({id: "unknown", type: "unknown"})).toMatchObject({ok: false, error: expect.stringMatching(/Unsupported.*request type/i)});
        expect(await protocol.handle({id: "bad-play", type: "play", command: []})).toMatchObject({ok: false, error: expect.stringMatching(/Malformed/i)});
        expect(await protocol.handle({id: "still-active", type: "play"})).toMatchObject({ok: true, result: {draw: 0.25}});
    });
});

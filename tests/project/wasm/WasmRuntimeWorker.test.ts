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
        const draws = Array.from({length: 8}, () => workerDrawHost.nextRandom());
        const protocol = new PokieWasmWorkerProtocol();
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed})).resolves.toMatchObject({ok: true});
        const workerRound = await protocol.handle({id: "play", type: "play", command: {bet: 1}});
        const workerState = await protocol.handle({id: "state", type: "serialize"});

        const mainRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(seed));
        const mainSession = mainRuntime.createSession(seed);
        const mainRound = await mainSession.play({bet: 1});
        expect(workerRound).toEqual({id: "play", ok: true, result: mainRound});
        expect(workerState).toEqual({id: "state", ok: true, result: {...mainSession.serialize(), rngState: {cursor: 4, tape: JSON.stringify(draws), seed, rng: mainSession.serialize().rngState}}});
        mainSession.dispose();
        mainRuntime.dispose();
    });

    it.each(["0", "worker-continuation"])("restores the draw cursor and seeded position together for %s", async (seed) => {
        const fixture = createCanonicalWasmFixture();
        const drawHost = new SeededPokieWasmHost(seed);
        const draws = Array.from({length: 20}, () => drawHost.nextRandom());
        const worker = new PokieWasmWorkerProtocol();
        const start = {id: "start", type: "instantiate" as const, bytes: fixture.bytes, manifest: fixture.manifest, draws, seed};
        expect(await worker.handle(start)).toMatchObject({ok: true});
        for (let sequence = 0; sequence < 3; sequence++) {
            const before = await worker.handle({id: "before", type: "serialize"});
            if (!before.ok) throw new Error(before.error);
            const snapshot = structuredClone(before.result);
            const round = await worker.handle({id: "round", type: "play", command: {bet: 1}});
            expect(round).toMatchObject({ok: true, result: {sequence: sequence + 1}});
            const after = await worker.handle({id: "after", type: "serialize"});
            if (!after.ok) throw new Error(after.error);
            const continuation = await worker.handle({id: "continue", type: "replay", state: after.result, commands: [{bet: 1}]});
            expect(continuation).toMatchObject({ok: true});
            for (const advanced of [false, true]) {
                const fresh = new PokieWasmWorkerProtocol();
                expect(await fresh.handle(start)).toMatchObject({ok: true});
                if (advanced) {
                    await fresh.handle({id: "advance", type: "play"});
                    await fresh.handle({id: "advance", type: "play"});
                }
                for (let repeat = 0; repeat < 2; repeat++) {
                    const replay = await fresh.handle({id: "replay", type: "replay", state: snapshot, commands: [{bet: 1}]});
                    expect(replay).toMatchObject({ok: true, result: {rounds: [round.ok ? round.result : undefined], stateBeforeFinal: snapshot, stateAfter: after.ok ? after.result : undefined}});
                }
                expect(await fresh.handle({id: "restore", type: "restore", state: snapshot})).toMatchObject({ok: true});
                expect(await fresh.handle({id: "round", type: "play", command: {bet: 1}})).toEqual(round);
                expect(await fresh.handle({id: "empty", type: "replay", state: snapshot, commands: []})).toMatchObject({ok: true, result: {rounds: [], stateAfter: snapshot}});
                expect(await fresh.handle({id: "continue", type: "replay", state: after.result, commands: [{bet: 1}]})).toEqual(continuation);
                await fresh.handle({id: "dispose", type: "dispose"});
            }
            // Replay moves the same host, but the active session still owns after.
            expect(await worker.handle({id: "replay", type: "replay", state: snapshot, commands: [{bet: 1}]})).toMatchObject({ok: true});
        }
        await worker.handle({id: "dispose", type: "dispose"});
    });

    it("keeps exhaustion and bad continuations recoverable and releases a failed seeded initialization", async () => {
        const fixture = createCanonicalWasmFixture();
        const seed = "0";
        const host = new SeededPokieWasmHost(seed);
        const draws = Array.from({length: 4}, () => host.nextRandom());
        const worker = new PokieWasmWorkerProtocol();
        expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed})).toMatchObject({ok: true});
        const initial = await worker.handle({id: "initial", type: "serialize"});
        if (!initial.ok) throw new Error(initial.error);
        const first = await worker.handle({id: "first", type: "play"});
        const settled = await worker.handle({id: "settled", type: "serialize"});
        expect(await worker.handle({id: "exhausted", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/no host-provided/)});
        expect(await worker.handle({id: "settled", type: "serialize"})).toEqual(settled);
        expect(await worker.handle({id: "bad", type: "restore", state: {...initial.result as object, rngState: {cursor: 2, tape: JSON.stringify(draws), seed, rng: 0}}})).toMatchObject({ok: false, error: expect.stringMatching(/continuation/)});
        expect(await worker.handle({id: "restore", type: "restore", state: initial.result})).toMatchObject({ok: true});
        expect(await worker.handle({id: "first", type: "play"})).toEqual(first);
        const failed = new PokieWasmWorkerProtocol();
        expect(await failed.handle({id: "bad-draws", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.9, 0.9], seed})).toMatchObject({ok: false, error: expect.stringMatching(/do not match/)});
        expect(await failed.handle({id: "after", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
        const mismatched = new PokieWasmWorkerProtocol();
        expect(await mismatched.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [...draws, 0.5], seed})).toMatchObject({ok: true});
        expect(await mismatched.handle({id: "restore", type: "restore", state: initial.result})).toMatchObject({ok: false, error: expect.stringMatching(/incompatible/)});
        await mismatched.handle({id: "dispose", type: "dispose"});
        expect(await worker.handle({id: "replacement", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.9], seed})).toMatchObject({ok: false});
        expect(await worker.handle({id: "still-active", type: "serialize"})).toMatchObject({ok: true});
        await worker.handle({id: "cancel", type: "cancel"});
    });

    it("migrates an actual old numeric Worker continuation against the complete supplied tape", async () => {
        const fixture = createCanonicalWasmFixture();
        const seed = "wasm-parity-golden";
        const host = new SeededPokieWasmHost(seed);
        const draws = Array.from({length: 10}, () => host.nextRandom());
        const worker = new PokieWasmWorkerProtocol();
        expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed})).toMatchObject({ok: true});
        const old = {schemaVersion: "pokie.state.v1", seed, draws: draws.slice(0, 6), sequence: 3, credits: 1000, rngState: 1365295755};
        expect(await worker.handle({id: "restore", type: "restore", state: old})).toMatchObject({ok: true});
        expect(await worker.handle({id: "play", type: "play", command: {bet: 1}})).toMatchObject({ok: true, result: {sequence: 4, draw: 0.14641731861047447, screen: [["A"], ["B"]], credits: 999}});
        await worker.handle({id: "dispose", type: "dispose"});
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

    it("returns clone-safe replay continuations and can continue from stateAfter", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-replay-wire", capabilities: ["runtime.replay"]});
        const protocol = new PokieWasmWorkerProtocol();
        const initial = {schemaVersion: "pokie.state.v1" as const, seed: "worker-replay-wire", draws: [], sequence: 0, credits: 1000};
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75, 0.5, 0.125]})).resolves.toMatchObject({ok: true});
        const first = await protocol.handle({id: "replay", type: "replay", state: initial, commands: [{bet: 1}]});
        expect(first).toMatchObject({ok: true, result: {rounds: [{sequence: 1}], stateBeforeFinal: initial, stateAfter: {sequence: 1}}});
        if (!first.ok) throw new Error(first.error);
        const cloned = structuredClone(first.result) as {stateAfter: typeof initial; rounds: readonly {sequence: number}[]};
        expect(JSON.parse(JSON.stringify(cloned))).toEqual(cloned);
        const continued = await protocol.handle({id: "continue", type: "replay", state: cloned.stateAfter, commands: [{bet: 1}]});
        expect(continued).toMatchObject({ok: true, result: {rounds: [{sequence: 2}], stateAfter: {sequence: 2}}});
    });

    it("releases a replay-trapped runtime while declaration and request errors remain recoverable", async () => {
        const replayOnly = createCanonicalWasmFixture({id: "worker-replay-recoverable", capabilities: ["runtime.replay"]});
        const recoverable = new PokieWasmWorkerProtocol();
        const initial = {schemaVersion: "pokie.state.v1" as const, seed: "worker-replay-recoverable", draws: [], sequence: 0, credits: 1000};
        await recoverable.handle({id: "start", type: "instantiate", bytes: replayOnly.bytes, manifest: replayOnly.manifest, draws: [0.25, 0.75]});
        expect(await recoverable.handle({id: "declaration", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/does not declare runtime\.serialize/i)});
        expect(await recoverable.handle({id: "malformed", type: "replay", state: initial, commands: [null] as never})).toMatchObject({ok: false, error: expect.stringMatching(/Malformed/i)});
        expect(await recoverable.handle({id: "replay", type: "replay", state: initial, commands: [{}]})).toMatchObject({ok: true, result: {rounds: [{sequence: 1}]}});

        const trapping = createCanonicalWasmFixture({id: "worker-replay-trap", trapping: true});
        const poisoned = new PokieWasmWorkerProtocol();
        await poisoned.handle({id: "start", type: "instantiate", bytes: trapping.bytes, manifest: trapping.manifest, draws: [0.25]});
        expect(await poisoned.handle({id: "trap", type: "replay", state: initial, commands: [{}]})).toMatchObject({ok: false, error: expect.stringMatching(/unreachable|trap/i)});
        expect(await poisoned.handle({id: "after-trap", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
    });

    it("rejects malformed and unknown messages without releasing an active session", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-protocol"});
        const protocol = new PokieWasmWorkerProtocol();
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75]})).resolves.toMatchObject({ok: true});
        expect(await protocol.handle({id: "unknown", type: "unknown"})).toMatchObject({ok: false, error: expect.stringMatching(/Unsupported.*request type/i)});
        expect(await protocol.handle({id: "bad-play", type: "play", command: []})).toMatchObject({ok: false, error: expect.stringMatching(/Malformed/i)});
        expect(await protocol.handle({id: "still-active", type: "play"})).toMatchObject({ok: true, result: {draw: 0.25}});
    });

    it("exposes only the declared partial operations through the worker facade", async () => {
        const replayOnly = createCanonicalWasmFixture({id: "worker-replay-only", capabilities: ["runtime.replay"]});
        const replayProtocol = new PokieWasmWorkerProtocol();
        await expect(replayProtocol.handle({id: "start", type: "instantiate", bytes: replayOnly.bytes, manifest: replayOnly.manifest, draws: [0.25, 0.75]})).resolves.toMatchObject({ok: true});
        await expect(replayProtocol.handle({id: "replay", type: "replay", state: {schemaVersion: "pokie.state.v1", seed: "worker", draws: [], sequence: 0, credits: 1000}, commands: [{}]}))
            .resolves.toMatchObject({ok: true, result: {rounds: [{sequence: 1}]}});
        expect(await replayProtocol.handle({id: "play", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/does not declare runtime\.play/i)});
        expect(await replayProtocol.handle({id: "serialize", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/does not declare runtime\.serialize/i)});

        const serializeOnly = createCanonicalWasmFixture({id: "worker-serialize-only", capabilities: ["runtime.serialize"]});
        const serializeProtocol = new PokieWasmWorkerProtocol();
        await expect(serializeProtocol.handle({id: "start", type: "instantiate", bytes: serializeOnly.bytes, manifest: serializeOnly.manifest, draws: []})).resolves.toMatchObject({ok: true});
        expect(await serializeProtocol.handle({id: "serialize", type: "serialize"})).toMatchObject({ok: true, result: {sequence: 0}});
        expect(await serializeProtocol.handle({id: "play", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/does not declare runtime\.play/i)});
        await expect(serializeProtocol.handle({id: "replay", type: "replay", state: {schemaVersion: "pokie.state.v1", seed: "worker", draws: [], sequence: 0, credits: 1000}, commands: []}))
            .resolves.toMatchObject({ok: false, error: expect.stringMatching(/does not declare runtime\.replay/i)});
    });
});

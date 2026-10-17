import {PokieWasmWorkerProtocol} from "../../../src/wasm/worker.js";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../../../src/wasm/PokieWasmRuntime.js";
import {sha256CanonicalWasmBytes} from "../../../src/wasm/PokieWasmCanonicalModule.js";
import {evaluatorValidationCases, createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

type WorkerEventListener = (event: MessageEvent & ErrorEvent) => void;

describe("PokieWasmWorkerProtocol", () => {
    it.each(evaluatorValidationCases)("retains a settled session after rejected $kind replacement and accepts a corrected retry", async ({fixture, repaired, code}) => {
        const worker = new PokieWasmWorkerProtocol();
        const fresh = new PokieWasmWorkerProtocol();
        const start = {id: "start", type: "instantiate" as const, bytes: repaired.bytes, manifest: repaired.manifest, draws: Array(30).fill(0.5) as number[]};
        expect(await worker.handle(start)).toMatchObject({ok: true});
        expect(await worker.handle({id: "first", type: "play"})).toMatchObject({ok: true, result: {sequence: 1, payout: 2}});
        const before = await worker.handle({id: "state", type: "serialize"});
        if (!before.ok) throw new Error(before.error);
        expect(await worker.handle({...start, bytes: fixture.bytes, manifest: fixture.manifest})).toMatchObject({ok: false, error: expect.stringContaining(code)});
        expect(await worker.handle({id: "state", type: "serialize"})).toEqual(before);
        // Rejection recovery keeps the used session; explicit restore is a separate operation.
        const continued = await worker.handle({id: "next", type: "play"});
        expect(continued).toMatchObject({ok: true, result: {sequence: 2, payout: 2}});
        expect(await worker.handle({id: "restore", type: "restore", state: before.result})).toMatchObject({ok: true});
        expect(await worker.handle({id: "next", type: "play"})).toEqual(continued);
        expect(await fresh.handle(start)).toMatchObject({ok: true});
        expect(await fresh.handle({id: "restore", type: "restore", state: before.result})).toMatchObject({ok: true});
        expect(await fresh.handle({id: "next", type: "play"})).toEqual(continued);
        expect(await worker.handle(start)).toMatchObject({ok: true});
        for (const sequence of [1, 2]) expect(await worker.handle({id: "retry", type: "play"})).toMatchObject({ok: true, result: {sequence, payout: 2}});
        await worker.handle({id: "dispose", type: "dispose"});
        await fresh.handle({id: "dispose", type: "dispose"});
    });

    it("owns transfer-safe bytes, host-issued draws, state restoration, and disposal", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-fixture", capabilities: ["runtime.play", "runtime.serialize"]});
        const protocol = new PokieWasmWorkerProtocol();
        expect(await protocol.handle({id: "before", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
        expect(await protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75, 0.5, 0.125]})).toMatchObject({ok: true});
        expect(await protocol.handle({id: "one", type: "play", command: {bet: 1}})).toMatchObject({ok: true, result: {sequence: 1, draw: 0.25}});
        const state = await protocol.handle({id: "state", type: "serialize"});
        expect(state).toMatchObject({ok: true, result: {drawCount: 2, sequence: 1}});
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
        expect(workerState).toEqual({id: "state", ok: true, result: {...mainSession.serialize(), rngState: {version: "pokie.worker.v2", cursor: 4, tapeHash: await sha256CanonicalWasmBytes(new TextEncoder().encode(JSON.stringify(draws))), tapeLength: draws.length, seed, rng: mainSession.serialize().rngState}}});
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

    it("rejects invalid compact cursors/versions and later mismatched draws without losing the settled state", async () => {
        const fixture = createCanonicalWasmFixture();
        const seed = "0";
        const host = new SeededPokieWasmHost(seed);
        const draws = Array.from({length: 8}, () => host.nextRandom());
        draws[5] = 0.9;
        const worker = new PokieWasmWorkerProtocol();
        expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed})).toMatchObject({ok: true});
        const initial = await worker.handle({id: "state", type: "serialize"});
        if (!initial.ok) throw new Error(initial.error);
        const state = initial.result as {rngState: Record<string, unknown>};
        for (const patch of [{cursor: -1}, {cursor: 1.5}, {cursor: 99}, {cursor: 3}, {version: "pokie.worker.v3"}, {tapeHash: "other"}, {rng: null}]) {
            expect(await worker.handle({id: "bad", type: "restore", state: {...state, rngState: {...state.rngState, ...patch}}})).toMatchObject({ok: false});
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(initial);
        }
        const first = await worker.handle({id: "play", type: "play"});
        const settled = await worker.handle({id: "settled", type: "serialize"});
        expect(await worker.handle({id: "mismatch", type: "play"})).toMatchObject({ok: false, error: expect.stringMatching(/do not match/)});
        expect(await worker.handle({id: "settled", type: "serialize"})).toEqual(settled);
        expect(await worker.handle({id: "restore", type: "restore", state: initial.result})).toMatchObject({ok: true});
        expect(await worker.handle({id: "play", type: "play"})).toEqual(first);
        await worker.handle({id: "dispose", type: "dispose"});
    });

    it("cancels an in-flight initialization without publishing a runnable replacement", async () => {
        const fixture = createCanonicalWasmFixture();
        const worker = new PokieWasmWorkerProtocol();
        const pending = worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, seed: "0", traceCapacity: 2});
        expect(await worker.handle({id: "cancel", type: "cancel"})).toMatchObject({ok: true});
        // No runtime yet, but cancellation must invalidate pending acquisition too.
        expect(await pending).toMatchObject({ok: false, error: expect.stringMatching(/cancelled/)});
        expect(await worker.handle({id: "after", type: "play"})).toMatchObject({ok: false});
    });

    it("migrates P9-01 tape objects once and preserves finite Worker trace and cancellation", async () => {
        const fixture = createCanonicalWasmFixture();
        const seed = "0";
        const host = new SeededPokieWasmHost(seed);
        const draws = Array.from({length: 8}, () => host.nextRandom());
        const worker = new PokieWasmWorkerProtocol();
        expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed, traceCapacity: 2})).toMatchObject({ok: true});
        const verifier = new SeededPokieWasmHost(seed);
        verifier.nextRandom();
        verifier.nextRandom();
        const legacy = {schemaVersion: "pokie.state.v1", seed, draws: draws.slice(0, 2), sequence: 0, credits: 1000, rngState: {cursor: 2, tape: JSON.stringify(draws), seed, rng: verifier.serializeState()}};
        expect(await worker.handle({id: "restore", type: "restore", state: legacy})).toMatchObject({ok: true, result: {schemaVersion: "pokie.state.v3", rngState: {version: "pokie.worker.v2"}}});
        expect(worker.getDiagnostics()).toMatchObject({legacyPrefixDraws: 2});
        await worker.handle({id: "play", type: "play"});
        await worker.handle({id: "play", type: "play"});
        expect(worker.getDiagnostics()).toMatchObject({legacyPrefixDraws: 2});
        const replay = await worker.handle({id: "replay", type: "replay", state: legacy, commands: [{}], traceCapacity: 1});
        expect(replay).toMatchObject({ok: true, result: {trace: {entries: [{kind: "replay", sequence: 1}], dropped: 0, status: "completed"}}});
        expect(structuredClone(replay)).toEqual(replay);
        await worker.handle({id: "cancel", type: "cancel"});
        expect(await worker.handle({id: "trace", type: "trace"})).toMatchObject({ok: false});
        expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, seed})).toMatchObject({ok: true});
        expect(await worker.handle({id: "trace", type: "trace"})).toMatchObject({ok: true, result: null});
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

    it("rejects a changed executable before creating a Worker session", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-trap", trapping: true});
        const protocol = new PokieWasmWorkerProtocol();
        expect(await protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25]})).toMatchObject({ok: false, error: expect.stringMatching(/lowering\/model identity/)});
        expect(await protocol.handle({id: "after-trap", type: "serialize"})).toMatchObject({ok: false, error: expect.stringMatching(/Instantiate/)});
    });

    it("returns clone-safe replay continuations and can continue from stateAfter", async () => {
        const fixture = createCanonicalWasmFixture({id: "worker-replay-wire", capabilities: ["runtime.replay"]});
        const protocol = new PokieWasmWorkerProtocol();
        const initial = {schemaVersion: "pokie.state.v1" as const, seed: "worker-replay-wire", draws: [], sequence: 0, credits: 1000};
        await expect(protocol.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75, 0.5, 0.125]})).resolves.toMatchObject({ok: true});
        const first = await protocol.handle({id: "replay", type: "replay", state: initial, commands: [{bet: 1}]});
        expect(first).toMatchObject({ok: true, result: {rounds: [{sequence: 1}], stateBeforeFinal: {schemaVersion: "pokie.state.v3", sequence: 0, drawCount: 0}, stateAfter: {sequence: 1}}});
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
        expect(await poisoned.handle({id: "start", type: "instantiate", bytes: trapping.bytes, manifest: trapping.manifest, draws: [0.25]})).toMatchObject({ok: false, error: expect.stringMatching(/lowering\/model identity/)});
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

it("retains clone-safe feature checkpoints across Worker restore, replay, rejected commands and cancellation", async () => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const worker = new PokieWasmWorkerProtocol();
    expect(await worker.handle({id: "start", type: "instantiate", ...fixture, seed: "feature-worker", traceCapacity: 4})).toMatchObject({ok: true});
    expect(await worker.handle({id: "entry", type: "play", command: {bet: 0.05, roundId: "bonus", delivery: "stepwise"}})).toMatchObject({ok: true, result: {win: 0.35, stake: 0.05}});
    const snapshot = await worker.handle({id: "state", type: "serialize"});
    if (!snapshot.ok) throw new Error(snapshot.error);
    const checkpoint = JSON.parse(JSON.stringify(snapshot.result));
    expect(await worker.handle({id: "invalid", type: "play", command: {bet: 7.5, continuation: {roundId: "bonus", cursor: 1}}})).toMatchObject({ok: false});
    expect(await worker.handle({id: "unchanged", type: "serialize"})).toEqual({id: "unchanged", ok: true, result: checkpoint});
    for (const change of [{payout: -123}, {win: "invalid"}, {stops: [-999]}, {deliveryOnly: true}, {command: {kind: "invalid"}}]) {
        const corrupt = JSON.parse(JSON.stringify(checkpoint));
        Object.assign(corrupt.feature.lastRound, change);
        expect(await worker.handle({id: "corrupt", type: "restore", state: corrupt})).toMatchObject({ok: false});
        expect(await worker.handle({id: "corrupt-replay", type: "replay", state: corrupt, commands: []})).toMatchObject({ok: false});
        expect(await worker.handle({id: "retained", type: "serialize"})).toMatchObject({ok: true, result: checkpoint});
    }
    expect(await worker.handle({id: "restore", type: "restore", state: checkpoint})).toMatchObject({ok: true});
    const command = {delivery: "stepwise", continuation: {roundId: "bonus", cursor: 1}};
    const expected = await worker.handle({id: "continue", type: "play", command});
    expect(expected).toMatchObject({ok: true, result: {stake: 0, network: {boundedMechanics: {weightedBonus: {selectedNow: false, remaining: 1}}}}});
    const replay = await worker.handle({id: "replay", type: "replay", state: checkpoint, commands: [command], traceCapacity: 1});
    expect(replay).toMatchObject({ok: true, result: {rounds: [expected.ok ? expected.result : undefined], trace: {status: "completed"}}});
    expect(await worker.handle({id: "cancel", type: "cancel"})).toEqual({id: "cancel", ok: true});
    expect(await worker.handle({id: "gone", type: "serialize"})).toMatchObject({ok: false});
});

it("rejects coordinated bonus receipt contradictions through Worker restore/replay and reuses the settled session", async () => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const worker = new PokieWasmWorkerProtocol();
    const reference = new PokieWasmWorkerProtocol();
    for (const target of [worker, reference]) {
        expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
        expect(await target.handle({id: "entry", type: "play", command: {bet: 0.05, roundId: "x", delivery: "stepwise"}})).toMatchObject({ok: true});
    }
    const origin = await worker.handle({id: "origin", type: "serialize"});
    if (!origin.ok) throw new Error(origin.error);
    expect(await reference.handle({id: "align", type: "restore", state: JSON.parse(JSON.stringify(origin.result))})).toMatchObject({ok: true});
    try {
        for (const cursor of [1, 2]) {
            const command = {delivery: "stepwise", continuation: {roundId: "x", cursor}};
            const expected = await reference.handle({id: "play", type: "play", command});
            expect(await worker.handle({id: "play", type: "play", command})).toEqual(expected);
            const snapshot = await worker.handle({id: "state", type: "serialize"});
            if (!snapshot.ok) throw new Error(snapshot.error);
            const checkpoint = JSON.parse(JSON.stringify(snapshot.result));
            expect(checkpoint.feature.lastRound).toMatchObject({win: 0.1, sequence: cursor + 1});
            const screens = [[['INVALID']], [['C']], [['A'], ['A'], ['A']]].map(screen => ({screen, network: {...checkpoint.feature.lastRound.network, reelsSymbols: screen}}));
            const changes = cursor === 1 ? [{win: 0, winMultiplier: 0}, {payout: 0, creditsBefore: checkpoint.credits}, ...screens]
                : [{command: {kind: "spin", delivery: "stepwise", continuation: {roundId: "x", cursor: 1}}}];
            for (const change of changes) {
                const corrupt = JSON.parse(JSON.stringify(checkpoint));
                Object.assign(corrupt.feature.lastRound, change);
                const diagnostics = worker.getDiagnostics();
                expect(await worker.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error: expect.stringMatching(/Retained|screen/)});
                expect(await worker.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false, error: expect.stringMatching(/Retained|screen/)});
                expect(worker.getDiagnostics()).toEqual(diagnostics);
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(snapshot);
            }
            expect(await worker.handle({id: "restore", type: "restore", state: checkpoint})).toMatchObject({ok: true, result: checkpoint});
            expect(await worker.handle({id: "play", type: "play", command})).toEqual(expected);
        }
        for (const roundId of ["after-rejection", "reuse-again"]) {
            const request = {id: "next", type: "play" as const, command: {bet: 0.05, roundId, delivery: "composite"}};
            expect(await worker.handle(request)).toEqual(await reference.handle(request));
        }
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
        await reference.handle({id: "dispose", type: "dispose"});
    }
});

it.each(["plain", "anonymous", "composite", "bounded"])("rejects coordinated %s receipts in Worker restore/replay without replacing settled progress", async policy => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const worker = new PokieWasmWorkerProtocol();
    const reference = new PokieWasmWorkerProtocol();
    const logical = policy === "composite" || policy === "bounded";
    try {
        for (const target of [worker, reference]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
        if (logical) expect(await worker.handle({id: "entry", type: "play", command: {bet: 0.05, roundId: "x", delivery: "stepwise"}})).toMatchObject({ok: true});
        const command = logical ? {delivery: "composite", continuation: {roundId: "x", cursor: 1}, ...(policy === "bounded" ? {maxSubrounds: 1} : {})}
            : {bet: 0.05, ...(policy === "plain" ? {roundId: "plain"} : {})};
        const result = await worker.handle({id: "play", type: "play", command});
        expect(result).toMatchObject({ok: true});
        const saved = await worker.handle({id: "state", type: "serialize"});
        if (!saved.ok) throw new Error(saved.error);
        const state = JSON.parse(JSON.stringify(saved.result));
        for (const mutation of ["win", "payout", "screen"]) {
            const corrupt = JSON.parse(JSON.stringify(state));
            if (mutation === "win") {
                Object.assign(corrupt.feature.lastRound, {win: 0, winMultiplier: 0});
                if (logical) corrupt.feature.deliveryStart.totalWin = corrupt.feature.logicalRound.totalWin;
            } else if (mutation === "payout") {
                Object.assign(corrupt.feature.lastRound, {payout: 0, creditsBefore: state.credits + state.feature.lastRound.stake});
                if (logical) Object.assign(corrupt.feature.deliveryStart, {credits: state.credits, totalPayout: corrupt.feature.logicalRound.totalPayout});
            } else {
                const screen = [["A"], ["A"], ["A"]];
                Object.assign(corrupt.feature.lastRound, {screen, network: {...state.feature.lastRound.network, reelsSymbols: screen}});
            }
            const diagnostics = worker.getDiagnostics();
            expect(await worker.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error: expect.stringMatching(/money|screen/)});
            expect(await worker.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false, error: expect.stringMatching(/money|screen/)});
            expect(worker.getDiagnostics()).toEqual(diagnostics);
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(saved);
        }
        for (const target of [worker, reference]) expect(await target.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
        if (policy !== "anonymous") expect(await worker.handle({id: "play", type: "play", command})).toMatchObject({ok: true, result: state.feature.lastRound});
        if (policy === "bounded") {
            const request = {id: "play", type: "play" as const, command: {delivery: "composite", continuation: {roundId: "x", cursor: 2}}};
            expect(await worker.handle(request)).toEqual(await reference.handle(request));
        }
        for (let index = 0; index < 2; index++) {
            const request = {id: "next", type: "play" as const, command: {bet: 0.05}};
            expect(await worker.handle(request)).toEqual(await reference.handle(request));
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(await reference.handle({id: "state", type: "serialize"}));
        }
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
        await reference.handle({id: "dispose", type: "dispose"});
    }
});

it.each(["stepwise", "composite"])("restores Worker checkpoints after completed %s rounds followed by plain commands", async delivery => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const worker = new PokieWasmWorkerProtocol();
    const fresh = new PokieWasmWorkerProtocol();
    try {
        for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
        let result = await worker.handle({id: "play", type: "play", command: {bet: 0.05, roundId: "x", delivery}});
        if (!result.ok) throw new Error(result.error);
        let round = result.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmRound;
        while (round.logicalRound?.status === "pending") {
            result = await worker.handle({id: "play", type: "play", command: {delivery, continuation: {roundId: "x", cursor: round.logicalRound.deliveryCursor}}});
            if (!result.ok) throw new Error(result.error);
            round = result.result as typeof round;
        }
        const completed = await worker.handle({id: "state", type: "serialize"});
        if (!completed.ok) throw new Error(completed.error);
        for (const entryId of [undefined, "plain"]) {
            for (const target of [worker, fresh]) expect(await target.handle({id: "restore", type: "restore", state: completed.result as never})).toMatchObject({ok: true});
            for (let index = 0; index < 3; index++) {
                const before = await worker.handle({id: "state", type: "serialize"});
                if (!before.ok) throw new Error(before.error);
                const command = {bet: 0.05, ...(index === 0 && entryId ? {roundId: entryId} : {})};
                const expected = await fresh.handle({id: "play", type: "play", command});
                expect(expected).toMatchObject({ok: true});
                expect(await worker.handle({id: "play", type: "play", command})).toEqual(expected);
                if (!expected.ok) throw new Error(expected.error);
                const saved = await worker.handle({id: "state", type: "serialize"});
                if (!saved.ok) throw new Error(saved.error);
                const state = JSON.parse(JSON.stringify(saved.result));
                expect(state.feature.logicalRound).toBeUndefined();
                const replay = await fresh.handle({id: "replay", type: "replay", state: before.result as never, commands: [command]});
                expect(replay).toMatchObject({ok: true, result: {rounds: [expected.result], stateAfter: state}});
                for (const target of [worker, fresh]) expect(await target.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(await fresh.handle({id: "state", type: "serialize"}));
            }
        }
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
        await fresh.handle({id: "dispose", type: "dispose"});
    }
});

it.each(["stepwise", "composite", "plain"] as const)("rejects nested %s checkpoint projections and analytics without replacing a Worker session", async policy => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const {checkpointProjectionMutations, mutateCheckpointProjection} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const worker = new PokieWasmWorkerProtocol();
    const fresh = new PokieWasmWorkerProtocol();
    try {
        for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
        const command = {bet: 0.05, roundId: "x", ...(policy === "plain" ? {} : {delivery: policy})};
        expect(await worker.handle({id: "play", type: "play", command})).toMatchObject({ok: true});
        const saved = await worker.handle({id: "state", type: "serialize"});
        if (!saved.ok) throw new Error(saved.error);
        const state = saved.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
        for (const mutation of checkpointProjectionMutations) {
            const corrupt = mutateCheckpointProjection(state, mutation);
            if (JSON.stringify(corrupt) === JSON.stringify(state)) continue;
            const diagnostics = worker.getDiagnostics();
            expect(await worker.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error: expect.stringMatching(/network|analytics|plain money|boundedMechanics|weighted bonus|screenModifiers/i)});
            expect(await worker.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false, error: expect.stringMatching(/network|analytics|plain money|boundedMechanics|weighted bonus|screenModifiers/i)});
            expect(worker.getDiagnostics()).toEqual(diagnostics);
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(saved);
        }
        for (const target of [worker, fresh]) {
            expect(await target.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
            for (let index = 0; index < 2; index++) expect(await target.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: state.feature.lastRound});
        }
        if (policy === "stepwise") for (const cursor of [1, 2]) {
            const request = {id: "next", type: "play" as const, command: {delivery: "stepwise", continuation: {roundId: "x", cursor}}};
            expect(await worker.handle(request)).toEqual(await fresh.handle(request));
        }
        for (let index = 0; index < 2; index++) {
            const request = {id: "next", type: "play" as const, command: {bet: 0.05}};
            expect(await worker.handle(request)).toEqual(await fresh.handle(request));
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(await fresh.handle({id: "state", type: "serialize"}));
        }
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
        await fresh.handle({id: "dispose", type: "dispose"});
    }
});

it("initializes required feature analytics from the Worker empty replay origin", async () => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const worker = new PokieWasmWorkerProtocol();
    try {
        expect(await worker.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
        const result = await worker.handle({id: "replay", type: "replay", state: {schemaVersion: "pokie.state.v2", seed: "probe", sequence: 0, drawCount: 0, credits: 1000}, commands: [{bet: 0.05, roundId: "x", delivery: "stepwise"}]});
        expect(result).toMatchObject({ok: true, result: {rounds: [{sequence: 1, win: 0.35, analytics: {position: 1, logicalEntry: true}}]}});
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
    }
});

it.each(["stepwise", "composite", "plain"] as const)("rejects coordinated %s awards, grants, modifiers and sibling artifact events before replacing the Worker session", async policy => {
    const {checkpointFeatureObservationFixtures, mutateCheckpointProjection} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const {blueprint, mutations, seed = "probe", maxSubrounds} of checkpointFeatureObservationFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const worker = new PokieWasmWorkerProtocol();
        const fresh = new PokieWasmWorkerProtocol();
        try {
            for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed})).toMatchObject({ok: true});
            const command = {bet: 0.05, roundId: "x", ...(policy === "plain" ? {} : {delivery: policy, ...(maxSubrounds ? {maxSubrounds} : {})})};
            expect(await worker.handle({id: "play", type: "play", command})).toMatchObject({ok: true});
            const saved = await worker.handle({id: "state", type: "serialize"});
            if (!saved.ok) throw new Error(saved.error);
            const state = saved.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
            for (const mutation of mutations) {
                const corrupt = mutateCheckpointProjection(state, mutation);
                const diagnostics = worker.getDiagnostics();
                for (const target of [worker, fresh]) {
                    expect(await target.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error: expect.stringMatching(/modifier|sticky|holdAndWin|jackpot|chargedBetMode|win|position|logical|stops|draw|plain money|canonical feature|freeGamesTriggered|respins|bonus/i)});
                    expect(await target.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false, error: expect.stringMatching(/modifier|sticky|holdAndWin|jackpot|chargedBetMode|win|position|logical|stops|draw|plain money|canonical feature|freeGamesTriggered|respins|bonus/i)});
                }
                expect(worker.getDiagnostics()).toEqual(diagnostics);
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(saved);
                expect(await worker.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: state.feature.lastRound});
            }
            expect(await fresh.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
            for (let index = 0; index < 2; index++) {
                const current = await worker.handle({id: "state", type: "serialize"});
                if (!current.ok) throw new Error(current.error);
                const progress = (current.result as typeof state).feature.logicalRound;
                const next = progress?.status === "pending" ? {delivery: "stepwise", continuation: {roundId: "x", cursor: progress.deliveryCursor}} : {bet: 0.05};
                const request = {id: "next", type: "play" as const, command: next};
                expect(await worker.handle(request)).toEqual(await fresh.handle(request));
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(await fresh.handle({id: "state", type: "serialize"}));
            }
            for (const target of [worker, fresh]) {
                expect(await target.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
                for (let index = 0; index < 2; index++) expect(await target.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: state.feature.lastRound});
            }
        } finally {
            await worker.handle({id: "dispose", type: "dispose"});
            await fresh.handle({id: "dispose", type: "dispose"});
        }
    }
});

it.each(["plain", "stepwise", "composite"] as const)("rejects coordinated %s analytics accounting before Worker replacement and preserves known completion", async policy => {
    const {checkpointAccountingFixtures, mutateCheckpointProjection} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const {id, blueprint, mode, completion} of checkpointAccountingFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const worker = new PokieWasmWorkerProtocol();
        const fresh = new PokieWasmWorkerProtocol();
        try {
            for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
            const delivery = policy === "plain" ? {} : {delivery: policy, ...(policy === "composite" ? {maxSubrounds: 1} : {})};
            expect(await worker.handle({id: "entry", type: "play", command: {bet: 0.05, roundId: "x", mode, ...delivery}})).toMatchObject({ok: true});
            const command = policy === "plain" ? {} : {...delivery, continuation: {roundId: "x", cursor: 1}};
            expect(await worker.handle({id: "tail", type: "play", command})).toMatchObject({ok: true});
            const saved = await worker.handle({id: "state", type: "serialize"});
            if (!saved.ok) throw new Error(saved.error);
            const state = saved.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
            for (const mutation of [["analyticsAccounting.inflated"], ["analyticsTransition.plainCarried"]] as const) {
                const corrupt = mutateCheckpointProjection(state, mutation);
                const diagnostics = worker.getDiagnostics();
                for (const target of [worker, fresh]) {
                    expect(await target.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error: expect.stringMatching(/Analytics.*(accounting|prior state)/i)});
                    expect(await target.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false});
                }
                expect(worker.getDiagnostics()).toEqual(diagnostics);
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(saved);
                if (policy !== "plain") expect(await worker.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: state.feature.lastRound});
            }
            expect(await fresh.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
            const finish = policy === "plain" ? {} : {...delivery, continuation: {roundId: "x", cursor: 2}};
            const result = await worker.handle({id: "finish", type: "play", command: finish});
            expect(result).toEqual(await fresh.handle({id: "finish", type: "play", command: finish}));
            expect(result).toMatchObject({ok: true, result: {analytics: {logicalCompletion: true, features: expect.arrayContaining([expect.objectContaining({feature: id, completion: expect.objectContaining({win: completion, entryPosition: 1})})])}}});
            for (let index = 0; index < 2; index++) {
                const request = {id: "next", type: "play" as const, command: {bet: 0.05}};
                expect(await worker.handle(request)).toEqual(await fresh.handle(request));
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(await fresh.handle({id: "state", type: "serialize"}));
            }
            for (const target of [worker, fresh]) {
                expect(await target.handle({id: "restore", type: "restore", state})).toMatchObject({ok: true});
                expect(await target.handle({id: "finish", type: "play", command: finish})).toEqual(result);
            }
        } finally {
            await worker.handle({id: "dispose", type: "dispose"});
            await fresh.handle({id: "dispose", type: "dispose"});
        }
    }
});

it.each(["plain", "stepwise", "composite"] as const)("rejects coordinated %s authored payout, entry and collection transitions before Worker replacement", async policy => {
    const {checkpointTransitionFixtures, mutateCheckpointTransition} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const test of checkpointTransitionFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint: test.blueprint});
        const worker = new PokieWasmWorkerProtocol();
        const fresh = new PokieWasmWorkerProtocol();
        try {
            for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
            const entry = {bet: 0.05, roundId: "x", ...(test.mode ? {mode: test.mode} : {}), ...(policy === "plain" ? {} : {delivery: policy, maxSubrounds: 1})};
            const continuation = policy === "plain" ? {bet: 0.05, roundId: "continued"} : {delivery: policy, maxSubrounds: 1, continuation: {roundId: "x", cursor: 1}};
            const command = test.continuation ? continuation : entry;
            if (test.continuation) expect(await worker.handle({id: "entry", type: "play", command: entry})).toMatchObject({ok: true});
            const played = await worker.handle({id: "play", type: "play", command});
            expect(played).toMatchObject({ok: true, result: {win: test.expectedWin}});
            if (test.expectedPayout !== undefined) expect(played).toMatchObject({ok: true, result: {payout: expect.closeTo(test.expectedPayout, 12)}});
            if (test.expectedRemaining !== undefined) expect(played).toMatchObject({ok: true, result: {network: {holdAndWin: {active: true, respinsRemaining: 2, payout: 0}}}});
            const snapshot = await worker.handle({id: "state", type: "serialize"});
            if (!snapshot.ok) throw new Error(snapshot.error);
            const saved = snapshot.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
            const corrupt = await mutateCheckpointTransition(saved, test, command);
            const diagnostics = worker.getDiagnostics();
            for (const target of [worker, fresh]) {
                const error = expect.stringMatching(test.id === "transition-bonus-entry" ? /Weighted bonus selection presence/i : /Free-games.*(bank|counters)|HoldAndWin.*(payout|entry|completion)|Jackpot.*(award|payout)|bonus.*(selection|observation)|Collection.*transition/i);
                expect(await target.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error});
                expect(await target.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false, error});
            }
            expect(worker.getDiagnostics()).toEqual(diagnostics);
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(snapshot);
            expect(await worker.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: saved.feature.lastRound});
            expect(await fresh.handle({id: "restore", type: "restore", state: saved})).toMatchObject({ok: true});
            for (let index = 0; index < 2; index++) {
                const current = await worker.handle({id: "state", type: "serialize"});
                if (!current.ok) throw new Error(current.error);
                const round = (current.result as typeof saved).feature.logicalRound;
                const next = round?.status === "pending" ? {delivery: "stepwise", continuation: {roundId: "x", cursor: round.deliveryCursor}} : {bet: 0.05};
                const request = {id: "next", type: "play" as const, command: next};
                const actual = await worker.handle(request);
                expect(actual).toEqual(await fresh.handle(request));
                if (test.nextWin !== undefined) expect(actual).toMatchObject({ok: true, result: {win: test.nextWin}});
                if (test.mode === "buy" && !test.continuation) expect(actual).toMatchObject({ok: true, result: {payout: 0, credits: 999.5}});
                if (test.expectedRemaining !== undefined) expect(actual).toMatchObject({ok: true, result: {network: {holdAndWin: {active: index === 0, respinsRemaining: index === 0 ? 1 : 0, payout: index === 0 ? 0 : 2}}}});
                expect(await worker.handle({id: "state", type: "serialize"})).toEqual(await fresh.handle({id: "state", type: "serialize"}));
            }
            for (const target of [worker, fresh]) {
                expect(await target.handle({id: "restore", type: "restore", state: saved})).toMatchObject({ok: true});
                for (let retry = 0; retry < 2; retry++) expect(await target.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: saved.feature.lastRound});
            }
        } finally {
            await worker.handle({id: "dispose", type: "dispose"});
            await fresh.handle({id: "dispose", type: "dispose"});
        }
    }
});

it("rejects every fabricated initialized feature before Worker replacement and retains first-play results", async () => {
    const {checkpointInitializationFixtures, mutateCheckpointInitialization} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const {id, blueprint} of checkpointInitializationFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const worker = new PokieWasmWorkerProtocol();
        const fresh = new PokieWasmWorkerProtocol();
        try {
            for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
            const snapshot = await worker.handle({id: "state", type: "serialize"});
            if (!snapshot.ok) throw new Error(snapshot.error);
            const saved = snapshot.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
            const corrupt = mutateCheckpointInitialization(saved, id);
            const diagnostics = worker.getDiagnostics();
            for (const target of [worker, fresh]) {
                expect(await target.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error: expect.stringMatching(/canonical initialization/)});
                expect(await target.handle({id: "bad", type: "replay", state: corrupt, commands: [{bet: 0.05}]})).toMatchObject({ok: false, error: expect.stringMatching(/canonical initialization/)});
            }
            expect(worker.getDiagnostics()).toEqual(diagnostics);
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(snapshot);
            expect(await fresh.handle({id: "restore", type: "restore", state: saved})).toMatchObject({ok: true});
            const first = await worker.handle({id: "play", type: "play", command: {bet: 0.05}});
            expect(first).toMatchObject({ok: true, result: {stake: 0.05}});
            expect(await fresh.handle({id: "play", type: "play", command: {bet: 0.05}})).toEqual(first);
            const second = await worker.handle({id: "play", type: "play", command: {bet: 0.05}});
            expect(await fresh.handle({id: "play", type: "play", command: {bet: 0.05}})).toEqual(second);
            for (const target of [worker, fresh]) {
                expect(await target.handle({id: "restore", type: "restore", state: saved})).toMatchObject({ok: true});
                expect(await target.handle({id: "play", type: "play", command: {bet: 0.05}})).toEqual(first);
                expect(await target.handle({id: "play", type: "play", command: {bet: 0.05}})).toEqual(second);
            }
        } finally {
            await worker.handle({id: "dispose", type: "dispose"});
            await fresh.handle({id: "dispose", type: "dispose"});
        }
    }
});

it.each(["plain", "stepwise", "composite"] as const)("rejects coordinated %s weighted counters before Worker replacement", async policy => {
    const {checkpointCounterFixtures, mutateCheckpointCounters} = await import("../../fixtures/wasm/checkpointProjectionMutations.js");
    for (const {id, blueprint, plays = 1} of checkpointCounterFixtures()) {
        const fixture = createCanonicalWasmFixture({blueprint});
        const worker = new PokieWasmWorkerProtocol();
        const fresh = new PokieWasmWorkerProtocol();
        try {
            for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "probe"})).toMatchObject({ok: true});
            const command = {bet: 0.05, roundId: "counter", ...(policy === "plain" ? {} : {delivery: policy, maxSubrounds: 1})};
            if (id === "counter-reels-after-bonus") expect(await worker.handle({id: "previous", type: "play", command: {bet: 0.05, roundId: "previous", delivery: "composite"}})).toMatchObject({ok: true});
            expect(await worker.handle({id: "entry", type: "play", command})).toMatchObject({ok: true});
            for (let index = 1; index < plays; index++) {
                const current = await worker.handle({id: "state", type: "serialize"});
                if (!current.ok) throw new Error(current.error);
                const round = (current.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState).feature.logicalRound;
                Reflect.deleteProperty(command, "continuation");
                if (round?.status === "pending") {
                    Reflect.deleteProperty(command, "bet");
                    Reflect.deleteProperty(command, "roundId");
                    Object.assign(command, {continuation: {roundId: round.id, cursor: round.deliveryCursor}});
                } else {
                    Object.assign(command, {bet: 0.05, roundId: `counter-${index}`});
                    const state = (current.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState).feature.state as {remaining?: number};
                    if (policy === "plain" && state.remaining! > 0) Reflect.deleteProperty(command, "roundId");
                }
                expect(await worker.handle({id: `play-${index}`, type: "play", command})).toMatchObject({ok: true});
            }
            const snapshot = await worker.handle({id: "state", type: "serialize"});
            if (!snapshot.ok) throw new Error(snapshot.error);
            const saved = snapshot.result as import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState;
            if (id.endsWith("-reduced")) {
                expect(saved.sequence).toBe(plays);
                if (id === "counter-bonus-reduced") expect(saved.feature.lastRound!.weightedBonusStatistics).toMatchObject({selections: 3, completed: 2});
                else expect(saved.feature.lastRound!.sequenceStatistics![0].selections).toBe(plays === 2 ? 2 : 3);
            }
            const corrupt = mutateCheckpointCounters(saved, id);
            for (const target of [worker, fresh]) {
                const before = await target.handle({id: "state", type: "serialize"});
                const priorDiagnostics = target.getDiagnostics();
                const error = expect.stringMatching(/Weighted (reel|bonus).*counter|weighted bonus completion/i);
                expect(await target.handle({id: "bad", type: "restore", state: corrupt})).toMatchObject({ok: false, error});
                expect(target.getDiagnostics()).toEqual(priorDiagnostics);
                expect(await target.handle({id: "bad", type: "replay", state: corrupt, commands: [command]})).toMatchObject({ok: false, error});
                expect(target.getDiagnostics()).toEqual(priorDiagnostics);
                // Serialization itself records snapshot bytes; inspect rejection's
                // effects before taking the next observable session snapshot.
                expect(await target.handle({id: "state", type: "serialize"})).toEqual(before);
            }
            expect(await worker.handle({id: "state", type: "serialize"})).toEqual(snapshot);
            expect(await worker.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: saved.feature.lastRound});
            expect(await fresh.handle({id: "restore", type: "restore", state: saved})).toMatchObject({ok: true});
            for (let index = 0; index < 2; index++) {
                const current = await worker.handle({id: "state", type: "serialize"});
                if (!current.ok) throw new Error(current.error);
                const round = (current.result as typeof saved).feature.logicalRound;
                const next = round?.status === "pending" ? {delivery: "stepwise", continuation: {roundId: round.id, cursor: round.deliveryCursor}} : {bet: 0.05};
                const request = {id: "next", type: "play" as const, command: next};
                expect(await worker.handle(request)).toEqual(await fresh.handle(request));
            }
            for (const target of [worker, fresh]) {
                expect(await target.handle({id: "restore", type: "restore", state: saved})).toMatchObject({ok: true});
                for (let retry = 0; retry < 2; retry++) expect(await target.handle({id: "retry", type: "play", command})).toMatchObject({ok: true, result: saved.feature.lastRound});
            }
        } finally {
            await worker.handle({id: "dispose", type: "dispose"});
            await fresh.handle({id: "dispose", type: "dispose"});
        }
    }
});

it("runs bounded simulation with accepted progress through the shared accumulator and supports active cancellation", async () => {
    const fixture = createCanonicalWasmFixture({paytable: {A: {2: 0}}, availableBets: [0.05, 7.5, 1e-7]});
    const progress: number[] = [];
    const worker = new PokieWasmWorkerProtocol((_id, value) => progress.push(value.completed));
    expect(await worker.handle({id: "init", type: "instantiate", ...fixture, seed: "0"})).toMatchObject({ok: true});
    const result = await worker.handle({id: "simulation", type: "simulate", seed: "0", rounds: 257, bet: 1e-7});
    expect(result).toMatchObject({ok: true, result: [{statistics: {rounds: 257, totalPayout: 0}}]});
    expect(progress).toEqual([128, 256, 257]);
    if (!result.ok) throw new Error(result.error);
    const statistics = (result.result as {statistics: {totalBet: number}}[])[0].statistics;
    expect(statistics.totalBet).toBeCloseTo(257e-7, 14);
    const state = await worker.handle({id: "state", type: "serialize"});
    expect(JSON.stringify(state).length).toBeLessThan(500);
    await worker.handle({id: "dispose", type: "dispose"});

    let cancel: Promise<unknown> | undefined;
    const active = new PokieWasmWorkerProtocol((_id, value) => {
        if (value.completed === 128) cancel = active.handle({id: "cancel", type: "cancel"});
    });
    expect(await active.handle({id: "init", type: "instantiate", ...fixture, seed: "0"})).toMatchObject({ok: true});
    expect(await active.handle({id: "long", type: "simulate", seed: "0", rounds: 1000000})).toMatchObject({ok: false, error: expect.stringMatching(/cancelled|disposed/)});
    await cancel;
    expect(await active.handle({id: "after", type: "serialize"})).toMatchObject({ok: false});
    expect(await active.handle({id: "retry", type: "instantiate", ...fixture, seed: "0"})).toMatchObject({ok: true});
    expect(await active.handle({id: "play", type: "play"})).toMatchObject({ok: true, result: {sequence: 1}});
    await active.handle({id: "dispose", type: "dispose"});
});

it("offers replay-only initialization and rejects unavailable operations without allocating a play session", async () => {
    const fixture = createCanonicalWasmFixture({capabilities: ["runtime.replay"]});
    const worker = new PokieWasmWorkerProtocol();
    try {
        expect(await worker.handle({id: "init", type: "instantiate", ...fixture, seed: "0"})).toMatchObject({ok: true});
        expect(await worker.handle({id: "sim", type: "simulate", seed: "0", rounds: 5})).toMatchObject({ok: false, error: expect.stringContaining("runtime.play")});
        expect(await worker.handle({id: "state", type: "serialize"})).toMatchObject({ok: false, error: expect.stringContaining("runtime.serialize")});
        expect(await worker.handle({id: "replay", type: "replay-target", options: {seed: "0", round: 3}})).toMatchObject({ok: true, result: {finalRound: {sequence: 3}}});
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
    }
});

it("settles every pending transport request on errors, message errors, malformed and stale responses", async () => {
    const {PokieWasmWorkerClient} = await import("../../../src/wasm/PokieWasmWorkerClient.js");
    const scope = {project: "game.wasm", generation: "generation", artifact: "sha256:artifact", job: "job"};
    for (const failure of ["error", "messageerror", "malformed", "stale"]) {
        const listeners = new Map<string, WorkerEventListener>();
        let sent: {request: {id: string}} | undefined;
        let terminations = 0;
        const client = new PokieWasmWorkerClient(() => ({
            addEventListener: (type, listener) => listeners.set(type, listener),
            removeEventListener: type => {
                listeners.delete(type); 
            },
            terminate: () => {
                terminations++; 
            },
            postMessage: message => {
                sent = message as typeof sent; 
            },
        }), scope);
        const first = client.request({type: "serialize"});
        const second = client.request({type: "trace"});
        const rejected = Promise.all([expect(first).rejects.toThrow(/Worker/), expect(second).rejects.toThrow(/Worker/)]);
        const type = failure === "error" || failure === "messageerror" ? failure : "message";
        listeners.get(type)!({message: "Worker failed", data: failure === "stale" ? {scope: {...scope, generation: "old"}, id: sent!.request.id, ok: true, type: "response"} : {scope, id: sent!.request.id, type: "invalid"}} as MessageEvent & ErrorEvent);
        await rejected;
        expect(client.getDiagnostics()).toEqual({pending: 0, disposed: true});
        expect(terminations).toBe(1);
        expect(listeners.size).toBe(0);
        client.dispose();
        expect(terminations).toBe(1);
    }
    expect(() => new PokieWasmWorkerClient(() => {
        throw new Error("Worker construction failed"); 
    }, scope)).toThrow("Worker construction failed");
});

it("connects the browser API owner to durable Play, restore, report and replay DTOs using production transport dispatch", async () => {
    // This is a transport/boundary unit test; the installed Chromium workflow is controller-owned.
    const fs = await import("fs");
    const path = await import("path");
    const {BrowserWasmStudioApi} = await import("../../../cli/studio-client/src/wasm/BrowserWasmStudioApi.js");
    const {installPokieWasmWorker} = await import("../../../src/wasm/PokieWasmWorkerClient.js");
    const {StudioWasmBrowserService} = await import("../../../cli/studio/wasm/StudioWasmBrowserService.js");
    const {StudioJobService} = await import("../../../cli/studio/jobs/StudioJobService.js");
    const {FileStudioJobRepository} = await import("../../../cli/studio/jobs/FileStudioJobRepository.js");
    const {StudioRoundRecorder} = await import("../../../cli/studio/runtime/StudioRoundRecorder.js");
    const {StudioSimulationService} = await import("../../../cli/studio/simulation/StudioSimulationService.js");
    const {StudioReplayExecutionService} = await import("../../../cli/studio/replay/StudioReplayExecutionService.js");
    const api = await import("../../../cli/studio-client/src/api/apiClient.js");
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/wasm-owner-"));
    const file = path.join(directory, "game.wasm");
    const fixture = createCanonicalWasmFixture({availableBets: [0.05, 7.5, 1e-7], paytable: {A: {2: 0}}});
    fs.writeFileSync(file, fixture.bytes);
    fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    const context = {mode: "project" as const, projectRoot: file};
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const broker = new StudioWasmBrowserService(jobs, new StudioRoundRecorder());
    const simulation = new StudioSimulationService();
    simulation.attachJobService(jobs);
    const replay = new StudioReplayExecutionService();
    replay.attachJobService(jobs);
    let liveWorkers = 0;
    const owner = new BrowserWasmStudioApi(async (url, init) => {
        let result: {status: number; body: unknown};
        if (url === "/api/project/context") result = {status: 200, body: {status: "loaded", type: "wasm", projectRoot: file}};
        else if (url.startsWith("/api/project/wasm/")) result = await broker.handle(init?.method ?? "GET", url, init?.body ? JSON.parse(init.body) : undefined, context);
        else if (url.startsWith("/api/project/simulations/")) result = {status: 200, body: simulation.getStatusForProject(file, url.split("/").pop()!)};
        else if (url.startsWith("/api/project/replays/")) result = {status: 200, body: replay.getStatus(file, url.split("/").pop()!)};
        else throw new Error(`Unexpected boundary ${url}`);
        return {ok: result.status < 300, status: result.status, json: () => Promise.resolve(result.body)};
    }, () => {
        liveWorkers++;
        let terminated = false;
        let receive!: (event: MessageEvent & ErrorEvent) => void;
        const listeners = new Map<string, WorkerEventListener>();
        installPokieWasmWorker({
            addEventListener: (_type, listener) => {
                receive = listener; 
            },
            postMessage: data => queueMicrotask(() => {
                if (!terminated) listeners.get("message")?.({data: structuredClone(data)} as MessageEvent & ErrorEvent); 
            }),
        });
        return {
            postMessage: data => queueMicrotask(() => {
                if (!terminated) receive({data: structuredClone(data)} as MessageEvent & ErrorEvent); 
            }),
            addEventListener: (type, listener) => {
                listeners.set(type, listener); 
            },
            removeEventListener: type => {
                listeners.delete(type); 
            },
            terminate: () => {
                if (!terminated) liveWorkers--;
                terminated = true; 
            },
        };
    });
    try {
        await owner.fetch("/api/project/context");
        const created = await api.createPlaySession(owner.fetch, "0");
        expect(created.status).toBe("ok");
        if (created.status !== "ok") throw new Error("Play not admitted");
        const id = created.session.sessionId;
        for (const bet of [0.05, 7.5, 1e-7]) expect(await api.spinPlaySession(owner.fetch, id, bet)).toMatchObject({status: "ok", session: {bet, win: 0}});
        const settled = await api.spinPlaySession(owner.fetch, id, 0.05, undefined, {requestId: "last"});
        expect(await api.spinPlaySession(owner.fetch, id, 0.05, undefined, {requestId: "last"})).toEqual(settled);
        expect(await api.spinPlaySession(owner.fetch, id, 7.5, undefined, {requestId: "last"})).toMatchObject({status: "error", code: "invalid-command"});
        expect(await api.spinPlaySession(owner.fetch, id, 0.1)).toMatchObject({status: "error", code: "invalid-command"});
        if (settled.status !== "ok") throw new Error("No settled Play state");
        const state = settled.session.debug!.stateAfter;
        await expect(api.createPlaySession(owner.fetch, undefined, undefined, {...state as object, artifactIdentity: "foreign"})).rejects.toThrow(/incompatible artifact/);
        expect(await api.spinPlaySession(owner.fetch, id, 0.05)).toMatchObject({status: "ok"});
        const restored = await api.createPlaySession(owner.fetch, undefined, undefined, JSON.parse(JSON.stringify(state)));
        expect(restored).toMatchObject({status: "ok"});
        expect(liveWorkers).toBe(1);
        const started = await api.startSimulation(owner.fetch, 256, "0", 1);
        if (started.status !== "created") throw new Error("Simulation conflict");
        let view;
        const deadline = Date.now() + 3000;
        do {
            if (Date.now() > deadline) throw new Error("Browser simulation did not settle.");
            await new Promise(resolve => {
                setTimeout(resolve, 5);
            });
            view = await api.getSimulation(owner.fetch, started.job.id);
        } while (view.status === "running" || view.status === "queued");
        expect(view).toMatchObject({status: "completed", roundsCompleted: 256, report: {rounds: 256, seed: "0"}});
        const replayCount = jobs.list(file).filter(job => job.operation === "replay").length;
        for (const request of [
            {round: 3, simulationId: started.job.id},
            {round: 3, seed: "different", simulationId: started.job.id},
            {round: 3, seed: "0", modeName: "different", simulationId: started.job.id},
        ]) {
            await expect(owner.fetch("/api/project/replays", {method: "POST", body: JSON.stringify(request)})).rejects.toThrow(/retained seed/);
        }
        expect(jobs.list(file).filter(job => job.operation === "replay")).toHaveLength(replayCount);
        expect(liveWorkers).toBe(1); // Only the unchanged idle Play session.
        const reproduced = await api.runReplay(owner.fetch, 3, "0", started.job.id);
        if (reproduced.status !== "created") throw new Error("Replay conflict");
        let replayView;
        const replayDeadline = Date.now() + 3000;
        do {
            if (Date.now() > replayDeadline) throw new Error("Browser replay did not settle.");
            await new Promise(resolve => {
                setTimeout(resolve, 5);
            });
            replayView = await api.getReplay(owner.fetch, reproduced.job.id);
        } while (replayView.status === "running" || replayView.status === "queued");
        expect(replayView).toMatchObject({status: "completed", descriptor: {round: 3, seed: "0", totalBet: 0.15000000000000002}});
    } finally {
        owner.dispose();
        await broker.shutdown();
        expect(liveWorkers).toBe(0);
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

type CompleteWorkerRequest = () => void;
type OwnerFetch = import("../../../cli/studio-client/src/api/apiClient.js").FetchLike;
type OwnerResponse = Awaited<ReturnType<OwnerFetch>>;
function controlled<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return {promise, resolve, reject};
}
async function browserOwner(fixture = createCanonicalWasmFixture()) {
    const {cloneSessionData} = await import("../../../src/runtime/internal/cloneSessionData.js");
    const fs = await import("fs");
    const path = await import("path");
    const {BrowserWasmStudioApi} = await import("../../../cli/studio-client/src/wasm/BrowserWasmStudioApi.js");
    const {installPokieWasmWorker} = await import("../../../src/wasm/PokieWasmWorkerClient.js");
    const {StudioWasmBrowserService} = await import("../../../cli/studio/wasm/StudioWasmBrowserService.js");
    const {StudioJobService} = await import("../../../cli/studio/jobs/StudioJobService.js");
    const {FileStudioJobRepository} = await import("../../../cli/studio/jobs/FileStudioJobRepository.js");
    const {StudioRoundRecorder} = await import("../../../cli/studio/runtime/StudioRoundRecorder.js");
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/wasm-repair-"));
    const file = path.join(directory, "game.wasm");
    fs.writeFileSync(file, fixture.bytes);
    fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    let context: import("../../../cli/studio/StudioContext.js").StudioContext = {mode: "project", projectRoot: file};
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const recorder = new StudioRoundRecorder();
    const broker = new StudioWasmBrowserService(jobs, recorder, 10000);
    const controls: {before?: OwnerFetch; after?: (url: string, result: OwnerResponse) => Promise<OwnerResponse>; live: number; created: number; plays: number; dispatch?: (data: unknown, deliver: () => void) => void} = {live: 0, created: 0, plays: 0};
    const network: OwnerFetch = async (url, init) => {
        let result: {status: number; body: unknown};
        if (url === "/api/project/context") result = {status: 200, body: context.mode === "project" ? {status: "loaded", type: "wasm", projectRoot: file} : {status: "empty"}};
        else if (url === "/api/projects/close") {
            context = {mode: "home"};
            result = {status: 200, body: {context}};
        } else {
            try {
                const selected = context;
                result = await broker.handle(init?.method ?? "GET", url, init?.body ? JSON.parse(init.body) : undefined, selected, () => selected === context);
            } catch (error) {
                result = {status: 409, body: {error: error instanceof Error ? error.message : String(error)}};
            }
        }
        return {ok: result.status < 300, status: result.status, json: () => Promise.resolve(result.body)};
    };
    const workerRequests: Promise<void>[] = [];
    const owner = new BrowserWasmStudioApi(async (url, init) => {
        const result = await (controls.before ?? network)(url, init);
        return controls.after ? controls.after(url, result) : result;
    }, () => {
        controls.live++;
        controls.created++;
        let terminated = false;
        let receive!: WorkerEventListener;
        const listeners = new Map<string, WorkerEventListener>();
        let lastScope: unknown;
        const pending = new Map<string, CompleteWorkerRequest>();
        installPokieWasmWorker({addEventListener: (_type, listener) => {
            receive = listener;
        }, postMessage: data => {
            const message = data as {type: string; id: string};
            if (message.type === "response") {
                pending.get(message.id)?.();
                pending.delete(message.id);
            }
            if (!terminated) listeners.get("message")?.({data: structuredClone(data)} as MessageEvent & ErrorEvent);
        }});
        return {
            addEventListener: (type, listener) => {
                listeners.set(type, listener);
            },
            removeEventListener: type => {
                listeners.delete(type);
            },
            postMessage: data => {
                if ((data as {request: {type: string}}).request.type === "play") controls.plays++;
                const deliver = () => {
                    if (terminated) return;
                    const message = data as {scope: unknown; request: {id: string}};
                    lastScope = message.scope;
                    workerRequests.push(new Promise<void>(resolve => {
                        pending.set(message.request.id, resolve);
                    }));
                    const transferred = structuredClone(data) as {request: {state?: unknown}};
                    // Native structuredClone runs outside Jest's realm. Real Worker messages
                    // arrive with destination-realm objects; preserve every checkpoint value
                    // while giving JSON-safety validation that same destination prototype.
                    if (transferred.request.state) transferred.request.state = cloneSessionData(transferred.request.state);
                    receive({data: transferred} as MessageEvent & ErrorEvent);
                };
                if (controls.dispatch) controls.dispatch(data, deliver);
                else deliver();
            },
            terminate: () => {
                if (terminated) return;
                controls.live--;
                terminated = true;
                receive({data: {scope: lastScope, request: {id: "test-termination", type: "dispose"}}} as MessageEvent & ErrorEvent);
            },
        };
    });
    await owner.fetch("/api/project/context");
    const api = await import("../../../cli/studio-client/src/api/apiClient.js");
    return {owner, broker, jobs, recorder, controls, network, file, api, reopen: () => {
        context = {mode: "project", projectRoot: file};
    }, close: async (lostIdleOwner = false) => {
        controls.before = undefined;
        controls.after = undefined;
        owner.dispose();
        if (lostIdleOwner) await expect(broker.shutdown()).rejects.toThrow(/idle browser Worker cleanup/);
        else await broker.shutdown();
        await Promise.all(workerRequests);
        fs.rmSync(directory, {recursive: true, force: true});
    }};
}

it("V2C-22-SIMULATION-REPLAY-BINDING admits only retained single/all-mode steps through the production browser API", async () => {
    const path = await import("path");
    const {FileStudioJobRepository} = await import("../../../cli/studio/jobs/FileStudioJobRepository.js");
    const {bindReplayToSimulationReport, validateReplayRequest} = await import("../../../cli/studio/replay/validateReplayRequest.js");
    const {collectPokieWasmReplay} = await import("../../../src/wasm/PokieWasmReplay.js");
    const fixture = createCanonicalWasmFixture({blueprint: {
        manifest: {id: "sample-binding", name: "Sample binding", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
        reelStrips: [["A", "B"], ["A", "B"]], availableBets: [0.05, 7.5, 1e-7], paytable: {A: {2: 0}, B: {2: 1}},
        betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 2}],
    }});
    const test = await browserOwner(fixture);
    const repository = new FileStudioJobRepository(path.join(path.dirname(test.file), "jobs"));
    const sent: Record<string, unknown>[] = [];
    test.controls.dispatch = (data, deliver) => {
        sent.push(structuredClone((data as {request: Record<string, unknown>}).request));
        deliver();
    };
    test.controls.before = (url, init) => {
        const match = (/^\/api\/project\/(?:simulations|replays)\/([^/]+)$/).exec(url);
        if (match) return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(test.jobs.get(test.file, match[1]))});
        return test.network(url, init);
    };
    const run = async (operation: "simulations" | "replays", request: Record<string, unknown>) => {
        const response = await test.owner.fetch(`/api/project/${operation}`, {method: "POST", body: JSON.stringify(request)});
        expect(response.ok).toBe(true);
        const admitted = await response.json() as {id: string};
        const deadline = Date.now() + 3000;
        let job;
        do {
            if (Date.now() > deadline) throw new Error("Simulation sample binding did not settle");
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
            job = test.jobs.get(test.file, admitted.id)!;
        } while (job.status === "running" || job.status === "queued");
        expect(job).toMatchObject({status: "completed"});
        expect(test.controls.live).toBe(0);
        return job;
    };
    try {
        const artifactResponse = await test.network("/api/project/wasm/artifact");
        const artifact = await artifactResponse.json() as {projectRoot: string; generation: string; manifest: {artifact: {sha256: string}}};
        const binding = {owner: "sample-test", projectRoot: test.file, generation: artifact.generation, artifactIdentity: artifact.manifest.artifact.sha256, operation: "replay"};
        const single = await run("simulations", {rounds: 1, seed: "0", workers: 1, modeName: "ante"});
        const report = single.result!.detail!.report as import("../../../src/reporting/SimulationReport.js").SimulationReport;
        expect(report).toMatchObject({rounds: 1, seed: "0", workers: 1, betMode: "ante", totalBet: 0.1});
        const reject = async (request: Record<string, unknown>, diagnostic: string) => {
            const jobs = test.jobs.list(test.file);
            const history = test.recorder.list();
            const workers = test.controls.created;
            for (const response of [
                await test.network("/api/project/wasm/jobs", {method: "POST", body: JSON.stringify({...binding, request})}),
                await test.owner.fetch("/api/project/replays", {method: "POST", body: JSON.stringify(request)}),
            ]) {
                expect(response.ok).toBe(false);
                expect(await response.json()).toEqual({error: diagnostic});
            }
            expect(test.jobs.list(test.file)).toEqual(jobs);
            expect(test.recorder.list()).toEqual(history);
            expect(test.controls.created).toBe(workers);
            expect(test.controls.live).toBe(0);
        };
        const valid = {round: 1, seed: "0", simulationId: single.id};
        const diagnostic = "Simulation replay requires the retained seed, selected mode and step range from a single-worker run.";
        for (const request of [
            {...valid, round: 2}, {round: 1, simulationId: single.id}, {...valid, seed: "different"}, {...valid, modeName: "different"},
            {...valid, entryCommands: []}, {...valid, entryCommands: [{kind: "spin", bet: 7.5}]}, {...valid, unit: "logical-round"},
        ]) {
            expect(() => bindReplayToSimulationReport(validateReplayRequest(request), report)).toThrow(diagnostic);
            await reject(request, diagnostic);
        }
        for (const changed of [
            {...single, status: "failed" as const}, {...single, operation: "replay"}, {...single, projectId: "/another.wasm"},
            {...single, result: {...single.result!, detail: {}}},
            {...single, request: {...single.request, artifactIdentity: "foreign"}, result: {...single.result!, provenance: {...single.result!.provenance, artifactIdentity: "foreign"}}},
            {...single, result: {...single.result!, provenance: {...single.result!.provenance, configHash: "foreign"}}},
        ]) {
            repository.save(changed);
            await reject(valid, "The selected simulation does not match this WASM artifact and configuration. Run a new simulation.");
            repository.save(single);
        }
        for (const change of [{workers: 2}, {seed: null}, {rounds: 0, sampling: undefined}]) {
            repository.save({...single, result: {...single.result!, detail: {...single.result!.detail, report: {...report, ...change}}}});
            await reject(valid, diagnostic);
            repository.save(single);
        }
        for (const coordinated of [false, true]) {
            repository.save({...single, result: {...single.result!,
                provenance: {...single.result!.provenance, ...(coordinated ? {configHash: "foreign"} : {})},
                detail: {...single.result!.detail, report: {...report, reproducibility: {...report.reproducibility, configHash: "foreign"}}}}});
            await reject(valid, coordinated ? "The selected simulation does not match this WASM artifact and configuration. Run a new simulation." : "The project model changed since this simulation; run a new simulation before sampling it.");
            repository.save(single);
        }
        // Submitted copies are not sample authority: the completed report supplies mode/seed.
        repository.save({...single, request: {...single.request, seed: "different", modeName: "different"}});
        for (const unit of [undefined, "step"]) {
            const replay = await run("replays", {...valid, unit});
            expect(replay.request).toMatchObject({round: 1, seed: "0", modeName: "ante", expectedConfigHash: fixture.manifest.artifact!.configurationHash});
            expect(sent.filter(item => item.type === "replay-target").pop()).toMatchObject({options: {round: 1, seed: "0", modeName: "ante"}});
            expect(test.recorder.list()[0]).toMatchObject({studioSource: "simulation-sample", studioSeed: "0", studioModeName: "ante", bet: 0.1});
        }
        repository.save(single);
        const all = await run("simulations", {rounds: 2, seed: "0", workers: 1, modeName: "all"});
        const reports = all.result!.detail!.report as import("../../../src/reporting/SimulationReportSet.js").SimulationReportSet;
        expect(reports.modes).toMatchObject({base: {rounds: 2, totalBet: 0.1}, ante: {rounds: 2, totalBet: 0.2}});
        for (const modeName of [undefined, "all", "unknown", "toString", "__proto__"]) {
            const request = {round: 1, seed: "0", simulationId: all.id, modeName};
            const error = "Select a concrete mode from the all-mode simulation to replay.";
            expect(() => bindReplayToSimulationReport(validateReplayRequest(request), reports)).toThrow(error);
            await reject(request, error);
        }
        const reference = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        try {
            for (const modeName of ["ante", "base", "ante"]) {
                const replay = await run("replays", {round: 2, seed: "0", simulationId: all.id, modeName, unit: "step"});
                const observed = await collectPokieWasmReplay(reference, {round: 2, seed: "0", modeName, initialCredits: Number.MAX_SAFE_INTEGER});
                expect(replay.result!.detail!.descriptor).toMatchObject({round: 2, seed: "0", modePolicy: {betModeId: modeName}, totalBet: reports.modes[modeName].totalBet,
                    totalWin: reports.modes[modeName].totalWin, totalPayout: observed.totalPayout, screen: observed.finalRound!.screen, credits: observed.finalRound!.credits});
                const comparable = (state: import("../../../src/wasm/PokieWasmRuntimeApi.js").PokieWasmFeatureSessionState) => {
                    const source = state.feature.analytics!.source;
                    expect(source).toEqual(expect.any(String));
                    expect(state.feature.analyticsCheckpoint!.state.source).toBe(source);
                    expect(state.feature.lastRound!.analytics!.source).toBe(source);
                    // Observer identity is session-local; retain every mathematical/RNG field
                    // and assert the source links before normalizing the independent identities.
                    return JSON.parse(JSON.stringify(state, (key, value: unknown) => key === "source" && value === source ? "observer" : value)) as unknown;
                };
                expect(comparable((replay.result!.detail!.descriptor as {stateAfter: Parameters<typeof comparable>[0]}).stateAfter)).toEqual(comparable(observed.stateAfter as Parameters<typeof comparable>[0]));
            }
        } finally {
            reference.dispose();
        }
        expect(test.recorder.list()).toHaveLength(5);
    } finally {
        await test.close();
    }
});

it("V2C-22-OPTIONAL-SEED executes replay-only requests with one retained seed and safely reuses admission after rejection", async () => {
    const {StudioReplayExecutionService} = await import("../../../cli/studio/replay/StudioReplayExecutionService.js");
    const {validateReplayRequest} = await import("../../../cli/studio/replay/validateReplayRequest.js");
    const {collectPokieWasmReplay} = await import("../../../src/wasm/PokieWasmReplay.js");
    const fixture = createCanonicalWasmFixture({capabilities: ["runtime.replay"], availableBets: [0.05, 7.5, 1e-7]});
    const test = await browserOwner(fixture);
    const replay = new StudioReplayExecutionService();
    replay.attachJobService(test.jobs);
    test.controls.before = (url, init) => {
        if (url.startsWith("/api/project/replays/")) {
            const body = replay.getStatus(test.file, url.split("/").pop()!);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
        }
        return test.network(url, init);
    };
    const run = async (request: Record<string, unknown>) => {
        const response = await test.owner.fetch("/api/project/replays", {method: "POST", body: JSON.stringify(request)});
        expect(response.ok).toBe(true);
        const admitted = await response.json() as {id: string};
        const deadline = Date.now() + 3000;
        let view;
        do {
            if (Date.now() > deadline) throw new Error("Optional-seed replay did not settle");
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
            view = replay.getStatus(test.file, admitted.id)!;
        } while (view.status === "running" || view.status === "queued");
        expect(test.controls.live).toBe(0);
        return view;
    };
    try {
        const generated = await run({round: 1});
        expect(generated).toMatchObject({status: "completed", seed: expect.any(String), descriptor: {round: 1, seed: expect.any(String), totalBet: 0.05}});
        const seed = generated.seed!;
        expect(seed).toMatch(/^[0-9a-f-]{36}$/);
        expect(test.jobs.get(test.file, generated.id)?.request.seed).toBe(seed);
        expect(generated.descriptor).not.toHaveProperty("stateBefore");
        expect(generated.descriptor).not.toHaveProperty("stateAfter");
        expect(generated.descriptor).not.toHaveProperty("artifact");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(seed));
        try {
            const observed = await collectPokieWasmReplay(runtime, {round: 1, seed});
            expect(generated.descriptor).toMatchObject({seed, screen: observed.finalRound!.screen, credits: observed.finalRound!.credits,
                totalBet: observed.totalBet, totalWin: observed.totalWin, totalPayout: observed.totalPayout});
        } finally {
            await runtime.dispose();
        }
        const repeated = await run({round: 1, seed});
        expect(repeated.descriptor).toMatchObject({seed, screen: generated.descriptor!.screen, credits: generated.descriptor!.credits,
            totalBet: generated.descriptor!.totalBet, totalWin: generated.descriptor!.totalWin});
        const artifactResponse = await test.network("/api/project/wasm/artifact");
        const artifact = await artifactResponse.json() as {projectRoot: string; generation: string; manifest: {artifact: {sha256: string}}};
        const binding = {owner: "seed-test", projectRoot: artifact.projectRoot, generation: artifact.generation, artifactIdentity: artifact.manifest.artifact.sha256};
        for (const malformed of ["", "   ", 42, null, {}, []]) {
            const request = {round: 1, seed: malformed};
            const diagnostic = '"seed" must be a non-empty string when given.';
            expect(() => validateReplayRequest(request)).toThrow(diagnostic);
            const before = test.jobs.list(test.file).length;
            const direct = await test.network("/api/project/wasm/jobs", {method: "POST", body: JSON.stringify({...binding, operation: "replay", request})});
            expect(await direct.json()).toEqual({error: diagnostic});
            const publicResponse = await test.owner.fetch("/api/project/replays", {method: "POST", body: JSON.stringify(request)});
            expect(publicResponse.ok).toBe(false);
            expect(await publicResponse.json()).toEqual({error: diagnostic});
            expect(test.jobs.list(test.file)).toHaveLength(before);
            expect(test.controls.live).toBe(0);
            for (const seed of ["0", " exact seed "]) expect(await run({round: 1, seed})).toMatchObject({status: "completed", seed, descriptor: {seed}});
        }
        // Shape-valid input reaches execution and fails without poisoning later fresh sessions.
        expect(await run({round: 1, seed: "0", entryCommands: [{kind: "spin", bet: 0.1}]})).toMatchObject({status: "failed"});
        for (let index = 0; index < 2; index++) expect(await run({round: 1})).toMatchObject({status: "completed"});
        for (const [operation, request] of [["simulation", {rounds: 1}], ["browser-play", {action: "new"}], ["browser-play", {action: "restore", state: {}}]]) {
            const response = await test.network("/api/project/wasm/jobs", {method: "POST", body: JSON.stringify({...binding, operation, request})});
            expect(response.ok).toBe(false);
            expect(await response.json()).toMatchObject({error: expect.stringContaining("runtime.play")});
        }
        expect(test.jobs.get(test.file, generated.id)?.result?.detail?.descriptor).toEqual(generated.descriptor);
        expect(test.recorder.list()).toHaveLength(0);
        expect(test.controls.live).toBe(0);
    } finally {
        await test.close();
    }
});

it("V2C-22-RESTORE-REJECTION retains an executed foreign-checkpoint failure and the original playable owner", async () => {
    const fixture = createCanonicalWasmFixture({availableBets: [0.05, 7.5, 1e-7]});
    const test = await browserOwner(fixture);
    const reference = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
    const worker = new PokieWasmWorkerProtocol();
    const fresh = new PokieWasmWorkerProtocol();
    try {
        for (const target of [worker, fresh]) expect(await target.handle({id: "start", type: "instantiate", ...fixture, seed: "0"})).toMatchObject({ok: true});
        const created = await test.api.createPlaySession(test.owner.fetch, "0");
        if (created.status !== "ok") throw new Error("Creation rejected");
        const native = reference.createSession("0");
        for (const bet of [0.05, 7.5, 1e-7]) {
            await native.play({bet});
            expect(await worker.handle({id: "play", type: "play", command: {bet}})).toMatchObject({ok: true});
            expect(await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, bet)).toMatchObject({status: "ok"});
        }
        const saved = JSON.parse(JSON.stringify(native.serialize()));
        const restored = await test.api.createPlaySession(test.owner.fetch, undefined, undefined, saved);
        if (restored.status !== "ok") throw new Error("Restore rejected");
        const priorJobs = new Set(test.jobs.list().map(job => job.id));
        const foreign = {...saved, artifactIdentity: "foreign"};
        expect(() => reference.restoreSession(foreign)).toThrow(/incompatible artifact identity/);
        for (const target of [worker, fresh]) {
            expect(await target.handle({id: "bad", type: "restore", state: foreign})).toMatchObject({ok: false, error: expect.stringMatching(/incompatible artifact identity/)});
            expect(await target.handle({id: "bad", type: "replay", state: foreign, commands: [{bet: 0.05}]})).toMatchObject({ok: false, error: expect.stringMatching(/incompatible artifact identity/)});
        }
        expect(await worker.handle({id: "retained", type: "serialize"})).toMatchObject({ok: true, result: saved});
        await expect(test.api.createPlaySession(test.owner.fetch, undefined, undefined, foreign)).rejects.toThrow(/incompatible artifact identity/);
        const failed = test.jobs.list().filter(job => !priorJobs.has(job.id));
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({operation: "browser-play", status: "failed", request: {action: "restore", state: foreign}, error: expect.stringMatching(/incompatible artifact identity/)});
        expect(failed[0].result?.detail?.session).toBeUndefined();
        expect(test.controls.live).toBe(1);
        expect(test.recorder.list()).toHaveLength(3);
        for (const bet of [0.05, 7.5]) {
            const expected = await native.play({bet});
            expect(await worker.handle({id: "reuse", type: "play", command: {bet}})).toMatchObject({ok: true, result: expected});
            expect(await test.api.spinPlaySession(test.owner.fetch, restored.session.sessionId, bet)).toMatchObject({status: "ok", session: {credits: expected.credits, win: expected.payout, debug: {stateAfter: native.serialize()}}});
        }
        const explicit = await test.api.createPlaySession(test.owner.fetch, undefined, undefined, saved);
        if (explicit.status !== "ok") throw new Error("Explicit restore rejected");
        expect(explicit.session.debug?.stateAfter).toEqual(saved);
        expect(test.controls.live).toBe(1);
        const restoredNative = reference.restoreSession(saved);
        const expected = await restoredNative.play({bet: 0.05});
        for (const target of [worker, fresh]) {
            expect(await target.handle({id: "explicit", type: "restore", state: saved})).toMatchObject({ok: true, result: saved});
            expect(await target.handle({id: "reuse", type: "play", command: {bet: 0.05}})).toMatchObject({ok: true, result: expected});
        }
        expect(await test.api.spinPlaySession(test.owner.fetch, explicit.session.sessionId, 0.05)).toMatchObject({status: "ok", session: {credits: expected.credits, win: expected.payout, debug: {stateAfter: restoredNative.serialize()}}});
    } finally {
        for (const target of [worker, fresh]) await target.handle({id: "dispose", type: "dispose"});
        reference.dispose();
        await test.close();
    }
});

it.each(["stepwise", "composite"] as const)("V2C-22-RESTORE-CURSOR projects pending %s progress without recording a new spin", async delivery => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const test = await browserOwner(fixture);
    const reference = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
    try {
        const native = reference.createSession("0");
        await native.play({bet: 0.05, roundId: "saved", delivery, maxSubrounds: 1});
        const state = JSON.parse(JSON.stringify(native.serialize()));
        const {validateLogicalRound} = await import("../../../src/runtime/LogicalRound.js");
        expect(validateLogicalRound(state.feature.logicalRound)).toBeUndefined();
        const restored = await test.api.createPlaySession(test.owner.fetch, undefined, undefined, state);
        if (restored.status !== "ok") throw new Error("Restore rejected");
        expect(restored.session).toMatchObject({credits: state.credits, logicalRound: {roundId: "saved", cursor: 1, status: "pending", totalStake: 0.05}});
        expect(restored.session.debug?.stateAfter).toEqual(state);
        expect(test.recorder.list()).toHaveLength(0);
        const continuation = {roundId: restored.session.logicalRound!.roundId, cursor: restored.session.logicalRound!.cursor};
        const expected = await native.play({delivery: "composite", continuation});
        const result = await test.api.spinPlaySession(test.owner.fetch, restored.session.sessionId, undefined, undefined, {requestId: "resume", delivery: "composite", continuation});
        expect(result).toMatchObject({status: "ok", session: {credits: expected.credits, logicalRound: {status: "completed", totalStake: expected.logicalRound!.totalStake, totalWin: expected.logicalRound!.totalWin, totalPayout: expected.logicalRound!.totalPayout}, debug: {stateAfter: native.serialize()}}});
        expect(test.recorder.list()).toHaveLength(1);
    } finally {
        reference.dispose();
        await test.close();
    }
});
it.each([true, false])("V2C-22-PUBLICATION-RECOVERY retries dropped requests/responses with serialize=%s without another play", async serialize => {
    const fixture = createCanonicalWasmFixture({capabilities: serialize ? ["runtime.play", "runtime.serialize"] : ["runtime.play"]});
    const test = await browserOwner(fixture);
    try {
        const created = await test.api.createPlaySession(test.owner.fetch, "0");
        if (created.status !== "ok") throw new Error("Creation rejected");
        const url = `/api/project/play/sessions/${created.session.sessionId}/spin`;
        const input = {requestId: "accepted", bet: 1};
        let dropped = false;
        test.controls.before = (route, init) => {
            if (route.endsWith("/finish") && !dropped) {
                dropped = true;
                throw new Error("request dropped");
            }
            return test.network(route, init);
        };
        expect(await (await test.owner.fetch(url, {method: "POST", body: JSON.stringify(input)})).json()).toMatchObject({retryDisposition: "safe-to-retry"});
        expect(test.controls.plays).toBe(1);
        test.controls.before = undefined;
        test.controls.after = (route, response) => {
            if (route.endsWith("/finish")) throw new Error("response dropped");
            return Promise.resolve(response);
        };
        expect(await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "accepted"})).toMatchObject({status: "error", retryDisposition: "safe-to-retry"});
        expect(test.recorder.list()).toHaveLength(1);
        const retained = test.jobs.list().find(job => job.request.action === "spin")!;
        test.controls.after = undefined;
        const binding = {owner: retained.request.browserOwner, generation: retained.request.browserGeneration, artifactIdentity: retained.request.artifactIdentity};
        for (const key of ["owner", "generation", "artifactIdentity"]) {
            expect((await test.network(`/api/project/wasm/jobs/${retained.id}/finish`, {method: "POST", body: JSON.stringify({...binding, [key]: "obsolete"})})).status).toBe(409);
        }
        expect((await test.broker.handle("POST", `/api/project/wasm/jobs/${retained.id}/finish`, binding, {mode: "project", projectRoot: "/other.wasm"})).status).toBe(409);
        const retried = await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "accepted"});
        expect(retried).toEqual({status: "ok", session: retained.result!.detail!.session});
        expect(await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "accepted"})).toEqual(retried);
        expect(test.controls.plays).toBe(1);
        expect(test.recorder.list()).toHaveLength(1);
        expect(test.jobs.list()).toHaveLength(2);
        expect(await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "next"})).toMatchObject({status: "ok"});
        expect(test.controls.plays).toBe(2);
    } finally {
        await test.close();
    }
});
it.each([true, false].flatMap(serialize => ["new", "spin"].flatMap(action => ["request", "response"].map(drop => ({serialize, action, drop})))))("V2C-22-PUBLICATION-RECOVERY recovers $action after dropped $drop beyond the lease with serialize=$serialize", async ({serialize, action, drop}) => {
    jest.useFakeTimers({doNotFake: ["nextTick", "queueMicrotask", "setImmediate"]});
    const fixture = createCanonicalWasmFixture({capabilities: serialize ? ["runtime.play", "runtime.serialize"] : ["runtime.play"]});
    const test = await browserOwner(fixture);
    const reference = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
    try {
        const native = reference.createSession("0");
        let id: string | undefined;
        if (action === "spin") {
            const created = await test.api.createPlaySession(test.owner.fetch, "0");
            if (created.status !== "ok") throw new Error("Creation rejected");
            id = created.session.sessionId;
        }
        const url = id ? `/api/project/play/sessions/${id}/spin` : "/api/project/play/session";
        const input = id ? {bet: 1, requestId: "delayed"} : {seed: "0"};
        const invoke = () => test.owner.fetch(url, {method: "POST", body: JSON.stringify(input)}).then(result => result.json());
        const expected = id ? await native.play({bet: 1}) : undefined;
        if (drop === "request") test.controls.before = (route, init) => {
            if (route.endsWith("/finish")) throw new Error("finish request dropped");
            return test.network(route, init);
        };
        else test.controls.after = (route, response) => {
            if (route.endsWith("/finish")) throw new Error("accepted finish response dropped");
            return Promise.resolve(response);
        };
        expect(await invoke()).toMatchObject({status: "failed", retryDisposition: "safe-to-retry"});
        // Pass the real configured lease boundary while publication has no heartbeat.
        await jest.advanceTimersByTimeAsync(10001);
        const admitted = test.jobs.list().find(job => job.request.action === action)!;
        expect(admitted.status).toBe(drop === "request" ? "recovery-required" : "completed");
        expect(test.controls.live).toBe(1);
        test.controls.before = undefined;
        test.controls.after = undefined;
        const recovered = await invoke();
        expect(recovered).toMatchObject({status: "ok", session: {sessionId: id ?? admitted.id, credits: expected?.credits ?? 1000}});
        if (expected) expect(recovered).toMatchObject({session: {screen: expected.screen, stake: expected.stake, payout: expected.payout}});
        expect(test.controls.plays).toBe(id ? 1 : 0);
        expect(test.recorder.list()).toHaveLength(id ? 1 : 0);
        const retained = test.jobs.get(test.file, admitted.id)!;
        expect(retained.status).toBe(admitted.status);
        if (drop === "request") expect(retained.recovery).toBeDefined();
        const binding = {owner: retained.request.browserOwner, generation: retained.request.browserGeneration, artifactIdentity: retained.request.artifactIdentity, cleanup: true, status: "completed"};
        // Repeated publication cannot substitute a single edited field or a coordinated
        // round/checkpoint edit for the durable accepted result.
        for (const output of [{credits: -50}, {round: {credits: -50, stake: 99}, state: {credits: -50}, stateAfter: {credits: -50}}]) {
            const historical = await test.network(`/api/project/wasm/jobs/${retained.id}/finish`, {method: "POST", body: JSON.stringify({...binding, output})});
            expect(await historical.json()).toMatchObject({result: retained.result, browserSessionActive: true});
        }
        if (id) expect(await invoke()).toEqual(recovered);
        expect(test.controls.plays).toBe(id ? 1 : 0);
        const next = await test.api.spinPlaySession(test.owner.fetch, id ?? admitted.id, 1, undefined, {requestId: "successor"});
        expect(next).toMatchObject({status: "ok", session: {credits: (await native.play({bet: 1})).credits}});
        expect(test.controls.plays).toBe(id ? 2 : 1);
        expect(test.recorder.list()).toHaveLength(id ? 2 : 1);
        const obsolete = await test.network(`/api/project/wasm/jobs/${retained.id}/finish`, {method: "POST", body: JSON.stringify(binding)});
        expect(await obsolete.json()).toMatchObject({result: retained.result, browserSessionActive: false});
        expect(await test.api.spinPlaySession(test.owner.fetch, id ?? admitted.id, 1, undefined, {requestId: "successor-two"})).toMatchObject({status: "ok", session: {credits: (await native.play({bet: 1})).credits}});
        expect(test.controls.plays).toBe(id ? 3 : 2);
    } finally {
        reference.dispose();
        await test.close(action === "spin" || drop === "response");
        jest.useRealTimers();
    }
});
it.each(["artifact", "generation"].flatMap(replacement => ["new", "spin"].map(action => ({replacement, action}))))("V2C-22-PUBLICATION-BINDING preserves historical $action results without installing a session after $replacement replacement", async ({replacement, action}) => {
    const test = await browserOwner();
    const fs = await import("fs");
    try {
        let id: string | undefined;
        if (action === "spin") {
            const created = await test.api.createPlaySession(test.owner.fetch, "0");
            if (created.status !== "ok") throw new Error("Creation rejected");
            id = created.session.sessionId;
        }
        const invoke = () => id ? test.api.spinPlaySession(test.owner.fetch, id, 1, undefined, {requestId: "historical"}) : test.api.createPlaySession(test.owner.fetch, "0");
        test.controls.after = (route, response) => {
            if (route.endsWith("/finish")) throw new Error("accepted response lost");
            return Promise.resolve(response);
        };
        if (id) expect(await invoke()).toMatchObject({status: "error", message: expect.stringContaining("lost")});
        else await expect(invoke()).rejects.toThrow(/lost/);
        const retained = test.jobs.list().find(job => job.request.action === action)!;
        expect(retained.result?.detail?.session).toBeDefined();
        test.controls.after = undefined;
        if (replacement === "artifact") {
            const changed = createCanonicalWasmFixture({id: "replacement"});
            fs.writeFileSync(test.file, changed.bytes);
            fs.writeFileSync(`${test.file}.pokie-wasm.json`, JSON.stringify(changed.manifest));
        } else test.reopen();
        const binding = {owner: retained.request.browserOwner, generation: retained.request.browserGeneration, artifactIdentity: retained.request.artifactIdentity, cleanup: true};
        const historical = await test.network(`/api/project/wasm/jobs/${retained.id}/finish`, {method: "POST", body: JSON.stringify(binding)});
        expect(await historical.json()).toMatchObject({result: retained.result, browserSessionActive: false});
        if (id) expect(await invoke()).toMatchObject({status: "error", message: expect.stringContaining("historical Play result")});
        else await expect(invoke()).rejects.toThrow(/historical Play result/);
        expect(test.controls.live).toBe(0);
        expect(test.jobs.get(test.file, retained.id)).toEqual(retained);
        expect(await test.api.createPlaySession(test.owner.fetch, "0")).toMatchObject({status: "ok"});
        expect(test.controls.plays).toBe(id ? 1 : 0);
    } finally {
        await test.close();
    }
});
it("V2C-22-PUBLICATION-BINDING cannot reattach an historical session after shutdown begins during recovery validation", async () => {
    const test = await browserOwner();
    const entered = controlled<void>();
    const release = controlled<void>();
    try {
        test.controls.after = (route, response) => {
            if (route.endsWith("/finish")) throw new Error("accepted response lost");
            return Promise.resolve(response);
        };
        await expect(test.api.createPlaySession(test.owner.fetch, "0")).rejects.toThrow(/lost/);
        test.controls.after = undefined;
        const job = test.jobs.list()[0];
        const binding = {owner: job.request.browserOwner, generation: job.request.browserGeneration, artifactIdentity: job.request.artifactIdentity};
        await test.network(`/api/project/wasm/sessions/${job.id}/dispose`, {method: "POST", body: JSON.stringify(binding)});
        const artifact = test.broker.artifact.bind(test.broker);
        const spy = jest.spyOn(test.broker, "artifact").mockImplementation(async context => {
            const result = await artifact(context);
            entered.resolve();
            await release.promise;
            return result;
        });
        try {
            const recovering = test.api.createPlaySession(test.owner.fetch, "0");
            await entered.promise;
            await test.broker.shutdown();
            release.resolve();
            await expect(recovering).rejects.toThrow(/historical Play result/);
            expect(test.controls.live).toBe(0);
            expect(test.jobs.get(test.file, job.id)).toEqual(job);
        } finally {
            release.resolve();
            spy.mockRestore();
        }
    } finally {
        await test.close();
    }
});
it("V2C-22-PUBLICATION-RECOVERY carries a real committed feature prefix through Worker errors and the Play error DTO", async () => {
    const {weightedBonusBlueprint} = await import("../../v2/fixtures/WeightedBonusGame.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    const test = await browserOwner(fixture);
    const random = SeededPokieWasmHost.prototype.nextRandom;
    let draws = 0;
    let failed = false;
    const spy = jest.spyOn(SeededPokieWasmHost.prototype, "nextRandom").mockImplementation(function(this: SeededPokieWasmHost) {
        if (draws === 7 && !failed) {
            failed = true;
            throw new Error("successor interrupted");
        }
        draws++;
        return Reflect.apply(random, this, []);
    });
    try {
        const created = await test.api.createPlaySession(test.owner.fetch, "0");
        if (created.status !== "ok") throw new Error("Creation rejected");
        const command = {requestId: "prefix", delivery: "composite" as const, roundId: "prefix"};
        const failure = await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 0.05, undefined, command);
        expect(failure).toMatchObject({status: "error", retryDisposition: "safe-to-retry", committedProgress: {roundId: "prefix", cursor: 1, requestId: "prefix"}, session: {logicalRound: {status: "pending", totalStake: 0.05, cursor: 1}}});
        if (failure.status !== "error") throw new Error("Missing prefix");
        expect(failure.session!.credits).toBeCloseTo(1000.3, 10);
        expect(test.jobs.list().find(job => job.request.action === "spin")).toMatchObject({status: "failed", result: {detail: {session: failure.session}}});
        const state = failure.session!.debug!.stateAfter;
        expect(state).toMatchObject({sequence: 1, feature: {pendingCommand: {advanced: 1}}});
        const reference = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        let expectedState;
        try {
            const restored = reference.restoreSession(JSON.parse(JSON.stringify(state)));
            await restored.play({kind: "spin", ...command, bet: 0.05});
            expectedState = restored.serialize();
        } finally {
            reference.dispose();
        }
        const result = await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 0.05, undefined, command);
        expect(result).toMatchObject({status: "ok", session: {logicalRound: {status: "completed", totalStake: 0.05}, debug: {stateAfter: {sequence: 3}}}});
        expect(result).toMatchObject({status: "ok", session: {debug: {stateAfter: expectedState}}});
        expect(test.recorder.list()).toHaveLength(1);
    } finally {
        spy.mockRestore();
        await test.close();
    }
});
it.each(["cancel", "reject"] as const)("V2C-22-ASYNC-OWNERSHIP ignores a delayed execution heartbeat %s after completion and Worker rebinding", async outcome => {
    jest.useFakeTimers({doNotFake: ["nextTick", "queueMicrotask", "setImmediate"]});
    const test = await browserOwner();
    const heartbeat = controlled<OwnerResponse>();
    try {
        const created = await test.api.createPlaySession(test.owner.fetch, "0");
        if (created.status !== "ok") throw new Error("Creation rejected");
        const held = controlled<void>();
        const entered = controlled<void>();
        test.controls.dispatch = (data, deliver) => {
            if ((data as {request: {type: string}}).request.type === "play") {
                entered.resolve();
                held.promise.then(deliver);
            } else deliver();
        };
        let heartbeatSent = false;
        test.controls.before = (url, init) => {
            if (url.includes("/jobs/") && url.endsWith("/heartbeat")) {
                heartbeatSent = true;
                return heartbeat.promise;
            }
            return test.network(url, init);
        };
        const first = test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "first"});
        await entered.promise;
        expect(await test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "overlapping"})).toMatchObject({status: "error", code: "recovery-required", retryDisposition: "safe-to-retry"});
        await jest.advanceTimersByTimeAsync(250);
        expect(heartbeatSent).toBe(true);
        held.resolve();
        expect(await first).toMatchObject({status: "ok"});
        const nextHeld = controlled<void>();
        const nextEntered = controlled<void>();
        test.controls.dispatch = (data, deliver) => {
            if ((data as {request: {type: string}}).request.type === "play") {
                nextEntered.resolve();
                nextHeld.promise.then(deliver);
            } else deliver();
        };
        const next = test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1, undefined, {requestId: "second"});
        await nextEntered.promise;
        if (outcome === "reject") heartbeat.reject(new Error("late heartbeat failure"));
        else heartbeat.resolve({ok: true, status: 200, json: () => Promise.resolve({cancel: true})});
        await jest.advanceTimersByTimeAsync(0);
        expect(test.controls.live).toBe(1);
        nextHeld.resolve();
        expect(await next).toMatchObject({status: "ok"});
        expect(test.controls.live).toBe(1);
    } finally {
        await test.close();
        jest.useRealTimers();
    }
});
it("V2C-22-ASYNC-OWNERSHIP ignores an idle-session heartbeat after the Worker is rebound", async () => {
    jest.useFakeTimers({doNotFake: ["nextTick", "queueMicrotask", "setImmediate"]});
    const test = await browserOwner();
    const heartbeat = controlled<OwnerResponse>();
    try {
        const created = await test.api.createPlaySession(test.owner.fetch, "0");
        if (created.status !== "ok") throw new Error("Creation rejected");
        test.controls.before = (url, init) => url.includes("/sessions/") && url.endsWith("/heartbeat") ? heartbeat.promise : test.network(url, init);
        await jest.advanceTimersByTimeAsync(1000);
        const held = controlled<void>();
        const entered = controlled<void>();
        test.controls.dispatch = (data, deliver) => {
            if ((data as {request: {type: string}}).request.type === "play") {
                entered.resolve();
                held.promise.then(deliver);
            } else deliver();
        };
        const spin = test.api.spinPlaySession(test.owner.fetch, created.session.sessionId, 1);
        await entered.promise;
        heartbeat.reject(new Error("obsolete idle heartbeat"));
        await jest.advanceTimersByTimeAsync(0);
        expect(test.controls.live).toBe(1);
        held.resolve();
        expect(await spin).toMatchObject({status: "ok"});
    } finally {
        await test.close();
        jest.useRealTimers();
    }
});
it("V2C-22-ASYNC-OWNERSHIP permits a validated replacement when the previous idle heartbeat fails during publication", async () => {
    jest.useFakeTimers({doNotFake: ["nextTick", "queueMicrotask", "setImmediate"]});
    const test = await browserOwner();
    const heartbeat = controlled<OwnerResponse>();
    const finish = controlled<OwnerResponse>();
    const accepted = controlled<OwnerResponse>();
    try {
        expect(await test.api.createPlaySession(test.owner.fetch, "old")).toMatchObject({status: "ok"});
        test.controls.before = (url, init) => url.includes("/sessions/") && url.endsWith("/heartbeat") ? heartbeat.promise : test.network(url, init);
        await jest.advanceTimersByTimeAsync(1000);
        test.controls.after = (url, result) => {
            if (url.endsWith("/finish")) {
                accepted.resolve(result);
                return finish.promise;
            }
            return Promise.resolve(result);
        };
        const replacement = test.api.createPlaySession(test.owner.fetch, "new");
        const result = await accepted.promise;
        heartbeat.reject(new Error("previous idle owner expired"));
        await jest.advanceTimersByTimeAsync(0);
        expect(test.controls.live).toBe(1);
        finish.resolve(result);
        expect(await replacement).toMatchObject({status: "ok"});
        expect(test.controls.live).toBe(1);
    } finally {
        await test.close();
        jest.useRealTimers();
    }
});

it.each(["switch", "dispose"] as const)("V2C-22-ASYNC-OWNERSHIP cannot install delayed Play/context ownership after %s", async action => {
    const test = await browserOwner();
    const finish = controlled<OwnerResponse>();
    const accepted = controlled<OwnerResponse>();
    try {
        test.controls.after = (url, result) => {
            if (url.endsWith("/finish")) {
                accepted.resolve(result);
                return finish.promise;
            }
            return Promise.resolve(result);
        };
        const creating = test.api.createPlaySession(test.owner.fetch, "0");
        const terminal = await accepted.promise;
        // The test deliberately releases the response after changing its owner.
        Reflect.deleteProperty(test.controls, "after");
        const context = controlled<OwnerResponse>();
        const contextSent = controlled<void>();
        test.controls.before = (url, init) => {
            if (url === "/api/project/context") {
                contextSent.resolve();
                return context.promise;
            }
            return test.network(url, init);
        };
        const staleContext = test.owner.fetch("/api/project/context");
        await contextSent.promise;
        if (action === "dispose") test.owner.dispose();
        else expect(await test.api.closeProject(test.owner.fetch)).toEqual({mode: "home"});
        context.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "loaded", type: "wasm", projectRoot: "/obsolete.wasm"})});
        await staleContext;
        finish.resolve(terminal);
        await expect(creating).rejects.toThrow(/owner changed/);
        expect(test.controls.live).toBe(0);
        if (action === "switch") {
            test.controls.before = undefined;
            // A new Play while Home is selected must reach the real network, not
            // stale browser interception. Reopening creates a new server generation.
            expect((await test.owner.fetch("/api/project/wasm/artifact")).ok).toBe(false);
            test.reopen();
            await test.owner.fetch("/api/project/context");
            expect(await test.api.createPlaySession(test.owner.fetch, "0")).toMatchObject({status: "ok"});
            expect(test.controls.live).toBe(1);
        }
    } finally {
        await test.close();
    }
});
it("V2C-22-ASYNC-OWNERSHIP orders concurrent Project context responses by request generation", async () => {
    const test = await browserOwner();
    const old = controlled<OwnerResponse>();
    try {
        test.controls.before = () => old.promise;
        const stale = test.owner.fetch("/api/project/context");
        test.controls.before = undefined;
        await test.owner.fetch("/api/project/context");
        old.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "loaded", type: "wasm", projectRoot: "/obsolete.wasm"})});
        await stale;
        expect(await test.api.createPlaySession(test.owner.fetch, "0")).toMatchObject({status: "ok"});
    } finally {
        await test.close();
    }
});
it("V2C-22-PUBLICATION-RECOVERY pagehide publishes the latest cancellation prefix before asynchronous finish", async () => {
    const test = await browserOwner();
    const beaconSent = controlled<{url: string; body: string}>();
    const holdFinish = controlled<void>();
    const asynchronousFinish = controlled<void>();
    try {
        test.controls.before = async (url, init) => {
            if (url.endsWith("/finish")) {
                await holdFinish.promise;
            }
            const result = await test.network(url, init);
            if (url.endsWith("/finish")) asynchronousFinish.resolve();
            return result;
        };
        // Spy only observes the production progress callback; the real runtime computes the prefix.
        const {PokieWasmWorkerClient} = await import("../../../src/wasm/PokieWasmWorkerClient.js");
        const request = PokieWasmWorkerClient.prototype.request;
        const spy = jest.spyOn(PokieWasmWorkerClient.prototype, "request").mockImplementation(function(this: InstanceType<typeof PokieWasmWorkerClient>, command, onProgress) {
            return Reflect.apply(request, this, [command, (progress: import("../../../src/wasm/PokieWasmWorkerClient.js").PokieWasmWorkerProgress) => {
                onProgress?.(progress);
                if (progress.completed === 128) test.owner.dispose((url, body) => {
                    beaconSent.resolve({url, body});
                });
            }]);
        });
        try {
            await test.owner.fetch("/api/project/simulations", {method: "POST", body: JSON.stringify({rounds: 100000, seed: "0", workers: 1})}).catch(() => undefined);
            const beacon = await beaconSent.promise;
            expect(JSON.parse(beacon.body)).toMatchObject({status: "cancelled", progress: {completed: 128, statistics: {rounds: 128}}});
            const terminal = await test.network(beacon.url, {method: "POST", body: beacon.body});
            expect(await terminal.json()).toMatchObject({status: "cancelled", result: {detail: {rounds: 128, observedPrefix: {rounds: 128}}}});
            holdFinish.resolve();
            await asynchronousFinish.promise;
            expect(test.jobs.list()[0]).toMatchObject({status: "cancelled", result: {detail: {rounds: 128}}});
        } finally {
            spy.mockRestore();
            holdFinish.resolve();
        }
    } finally {
        await test.close();
    }
});


it("V2C-22-SIMULATION-REPLAY-FUNDING reproduces a loss-making accepted sample beyond standalone funding through browser admission and Worker execution", async () => {
    const {collectPokieWasmReplay} = await import("../../../src/wasm/PokieWasmReplay.js");
    const {POKIE_WASM_SIMULATION_CREDITS} = await import("../../../src/wasm/PokieWasmCommands.js");
    const fixture = createCanonicalWasmFixture({availableBets: [7.5], paytable: {A: {2: 0}, B: {2: 0}}});
    const test = await browserOwner(fixture);
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
    const run = async (operation: "simulations" | "replays", request: Record<string, unknown>) => {
        const response = await test.owner.fetch(`/api/project/${operation}`, {method: "POST", body: JSON.stringify(request)});
        expect(response.ok).toBe(true);
        const {id} = await response.json() as {id: string};
        for (let attempt = 0; attempt < 10000; attempt++) {
            const job = test.jobs.get(test.file, id)!;
            if (job.status !== "running" && job.status !== "queued") return job;
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
        }
        throw new Error("Funding regression did not settle.");
    };
    try {
        const simulation = await run("simulations", {rounds: 256, seed: "0", workers: 1});
        expect(simulation).toMatchObject({status: "completed", result: {detail: {report: {rounds: 256, totalBet: 1920, totalWin: 0}}}});
        // The public request cannot choose a funding policy, even with a coordinated override.
        const failed = await run("replays", {round: 256, seed: "0", initialCredits: POKIE_WASM_SIMULATION_CREDITS});
        expect(failed.status).toBe("failed");
        expect(failed.request.initialCredits).toBeUndefined();
        expect(test.recorder.list()).toHaveLength(0);
        const created = test.controls.created;
        const rejected = await test.owner.fetch("/api/project/replays", {method: "POST", body: JSON.stringify({round: 257, seed: "0", simulationId: simulation.id, initialCredits: POKIE_WASM_SIMULATION_CREDITS})});
        expect(rejected.ok).toBe(false);
        expect(test.controls.created).toBe(created);
        const expected = await collectPokieWasmReplay(runtime, {seed: "0", round: 256, initialCredits: POKIE_WASM_SIMULATION_CREDITS});
        const simulated = runtime.createSession("0", {credits: POKIE_WASM_SIMULATION_CREDITS});
        try {
            let last;
            for (let step = 0; step < 256; step++) last = await simulated.play({});
            expect(expected.stateAfter).toEqual(simulated.serialize());
            expect(expected.finalRound!.screen).toEqual(last!.screen);
            const continued = runtime.restoreSession(expected.stateAfter);
            try {
                expect(await continued.play({})).toEqual(await simulated.play({}));
                expect(continued.serialize()).toEqual(simulated.serialize());
            } finally {
                continued.dispose();
            }
        } finally {
            simulated.dispose();
        }
        for (let retry = 0; retry < 2; retry++) {
            const replay = await run("replays", {round: 256, seed: "0", simulationId: simulation.id, initialCredits: 0});
            expect(replay).toMatchObject({status: "completed", request: {initialCredits: POKIE_WASM_SIMULATION_CREDITS}, result: {detail: {descriptor: {
                round: 256, seed: "0", totalBet: 1920, totalWin: 0, credits: expected.finalRound!.credits, screen: expected.finalRound!.screen, stateAfter: expected.stateAfter,
            }}}});
        }
        expect(test.recorder.list()).toHaveLength(2);
        const worker = new PokieWasmWorkerProtocol();
        try {
            await worker.handle({id: "init", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, seed: "0"});
            for (const initialCredits of [null, "1000", -1, NaN, Infinity]) {
                const options = {seed: "0", round: 1, initialCredits};
                const diagnostic = "WASM replay initialCredits must be a finite non-negative number when supplied.";
                await expect(collectPokieWasmReplay(runtime, options as never)).rejects.toThrow(diagnostic);
                expect(await worker.handle({id: "invalid", type: "replay-target", options})).toMatchObject({ok: false, error: diagnostic});
            }
            expect(await worker.handle({id: "reuse", type: "replay-target", options: {seed: "0", round: 1}})).toMatchObject({ok: true, result: {stateAfter: {sequence: 1, credits: 992.5}}});
        } finally {
            await worker.handle({id: "dispose", type: "dispose"});
        }
        expect(test.controls.live).toBe(0);
    } finally {
        runtime.dispose();
        await test.close();
    }
});

import {instantiatePokieWasm, SeededPokieWasmHost} from "../../../src/wasm/PokieWasmRuntime.js";
import {BoundedPokieWasmTraceCollector, type PokieWasmSessionState} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import {PokieWasmWorkerProtocol} from "../../../src/wasm/worker.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

const seed = "compact-measurement";
const fixture = createCanonicalWasmFixture();
const bankroll = 1000000;
const checkpoints = new Set([0, 10000, 100000]);
const bytes = (state: unknown): number => Buffer.byteLength(JSON.stringify(state), "utf8");

function assertCompact(state: PokieWasmSessionState, rounds: number, ceiling = 192): void {
    expect(Object.keys(state).sort()).toEqual(["credits", "drawCount", "rngState", "schemaVersion", "seed", "sequence"]);
    expect(state).toMatchObject({schemaVersion: "pokie.state.v2", sequence: rounds, drawCount: 2 + 2 * rounds});
    expect(bytes(state)).toBeLessThanOrEqual(ceiling);
}

it("measures bounded direct and in-process Worker continuation at 10000/100000 paid rounds (two repetitions)", async () => {
    // Separate 100-round warmup; measured counts exclude initialization and warmup.
    const warm = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(seed));
    const warming = warm.createSession(seed, {credits: bankroll});
    for (let index = 0; index < 100; index++) await warming.play({bet: 1});
    warm.dispose();
    const warmWorker = new PokieWasmWorkerProtocol();
    await warmWorker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, seed, credits: bankroll});
    for (let index = 0; index < 100; index++) await warmWorker.handle({id: "play", type: "play", command: {bet: 1}});
    await warmWorker.handle({id: "dispose", type: "dispose"});

    for (let repetition = 1; repetition <= 2; repetition++) {
        const direct = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(seed));
        const session = direct.createSession(seed, {credits: bankroll});
        const worker = new PokieWasmWorkerProtocol();
        expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, seed, credits: bankroll})).toMatchObject({ok: true});
        const directSamples: PokieWasmSessionState[] = [];
        for (const surface of ["direct", "worker"] as const) {
            let totalPayout = 0;
            const started = performance.now();
            for (let rounds = 0; rounds <= 100000; rounds++) {
                if (checkpoints.has(rounds)) {
                    const response = surface === "direct" ? undefined : await worker.handle({id: "state", type: "serialize"});
                    if (response !== undefined && !response.ok) throw new Error(response.error);
                    let state: PokieWasmSessionState;
                    if (surface === "direct") state = session.serialize();
                    else {
                        if (response === undefined || !response.ok) throw new Error("Expected Worker state.");
                        state = response.result as PokieWasmSessionState;
                    }
                    const elapsedMs = performance.now() - started;
                    assertCompact(state, rounds);
                    if (surface === "direct") directSamples.push(state);
                    else expect(state).toEqual(directSamples[[0, 10000, 100000].indexOf(rounds)]);
                    console.log(JSON.stringify({surface, repetition, runtime: process.version, fixture: fixture.manifest.artifact?.sha256, seed, bet: 1, bankroll, warmupRounds: 100, completedRounds: rounds, bytes: bytes(state), elapsedMs, roundsPerSecond: rounds === 0 ? null : rounds * 1000 / elapsedMs, totalPayout}));
                }
                if (rounds === 100000) break;
                if (surface === "direct") totalPayout += (await session.play({bet: 1})).payout;
                else {
                    const round = await worker.handle({id: "play", type: "play", command: {bet: 1}});
                    if (!round.ok) throw new Error(round.error);
                    totalPayout += (round.result as {payout: number}).payout;
                }
            }
        }
        expect(direct.getDiagnostics()).toMatchObject({generatedDraws: 200002, hostRestorations: 100000});
        // Scalar payload counters expose per-round growing serialize/copy work without heap/GC assumptions.
        expect(direct.getDiagnostics().hostPayloadBytes).toBeLessThanOrEqual(11 * 100001);
        expect(direct.getDiagnostics().snapshotPayloadBytes).toBeLessThanOrEqual(3 * 192);
        expect(worker.getDiagnostics()).toMatchObject({generatedDraws: 200002, hostRestorations: 100000, inputTapeLength: 0, verificationDraws: 0, legacyPrefixDraws: 0});
        expect(await worker.handle({id: "trace", type: "trace"})).toMatchObject({ok: true, result: null});
        direct.dispose();
        await worker.handle({id: "cancel", type: "cancel"});
        expect(worker.getDiagnostics()).toEqual({inputTapeLength: 0, verificationDraws: 0, legacyPrefixDraws: 0});
    }
}, 30000);

it("measures bounded collector opt-in separately without changing continuation or RNG", async () => {
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(seed));
    const trace = new BoundedPokieWasmTraceCollector(8);
    const collected = runtime.createSession(seed, {credits: bankroll, trace});
    const ordinary = runtime.createSession(seed, {credits: bankroll});
    const started = performance.now();
    for (let index = 0; index < 100000; index++) {
        const observed = await collected.play({bet: 1});
        expect((await ordinary.play({bet: 1})).draw).toBe(observed.draw);
    }
    const elapsedMs = performance.now() - started;
    expect(collected.serialize()).toEqual(ordinary.serialize());
    assertCompact(collected.serialize(), 100000);
    expect(trace.entries).toHaveLength(8);
    expect(trace.entries.flatMap(entry => entry.draws)).toHaveLength(16);
    expect(trace.dropped).toBe(99993);
    console.log(JSON.stringify({surface: "collector-paired", completedRounds: 100000, capacity: trace.capacity, retainedEntries: trace.entries.length, dropped: trace.dropped, bytes: bytes(collected.serialize()), elapsedMs, roundsPerSecond: 200000 * 1000 / elapsedMs}));
    runtime.dispose();
    expect(trace.entries).toEqual([]);
}, 30000);

it("accounts for explicit tape input once and never rescans its prefix during ordinary continuation", async () => {
    const host = new SeededPokieWasmHost(seed);
    const draws = Array.from({length: 20002}, () => host.nextRandom());
    const worker = new PokieWasmWorkerProtocol();
    expect(await worker.handle({id: "start", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws, seed, credits: bankroll})).toMatchObject({ok: true});
    const started = performance.now();
    for (let index = 0; index < 10000; index++) {
        const response = await worker.handle({id: "play", type: "play"});
        if (!response.ok) throw new Error(response.error);
    }
    const response = await worker.handle({id: "state", type: "serialize"});
    if (!response.ok) throw new Error(response.error);
    assertCompact(response.result as PokieWasmSessionState, 10000, 384);
    expect(worker.getDiagnostics()).toMatchObject({inputTapeLength: 20002, verificationDraws: 20002, legacyPrefixDraws: 0});
    const metrics = worker.getDiagnostics() as {hostPayloadBytes: number};
    expect(metrics.hostPayloadBytes).toBeLessThanOrEqual(256 * 10001);
    console.log(JSON.stringify({surface: "explicit-tape", completedRounds: 10000, continuationBytes: bytes(response.result), inputTapeDraws: draws.length, inputTapeBytes: bytes(draws), elapsedMs: performance.now() - started, diagnostics: worker.getDiagnostics()}));
    await worker.handle({id: "cancel", type: "cancel"});
}, 30000);

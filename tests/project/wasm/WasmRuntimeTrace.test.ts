import {instantiatePokieWasm, SeededPokieWasmHost} from "../../../src/wasm/PokieWasmRuntime.js";
import {BoundedPokieWasmTraceCollector} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

describe("explicit bounded WASM trace", () => {
    it("orders initialization and settled rounds, drops newest evidence, and detaches inspection", async () => {
        const fixture = createCanonicalWasmFixture();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        const trace = new BoundedPokieWasmTraceCollector(2);
        const session = runtime.createSession("0", {trace});
        const initial = session.serialize();
        const first = await session.play();
        await session.play();
        expect(trace.entries.map(entry => [entry.kind, entry.sequence, entry.draws.length])).toEqual([["initialization", 0, 2], ["round", 1, 2]]);
        expect(trace.entries[1].draws[0]).toBe(first.draw);
        expect(trace.dropped).toBe(1);
        const detached = trace.entries;
        (detached[0].draws as number[]).push(0);
        expect(trace.entries[0].draws).toHaveLength(2);
        expect(initial).toMatchObject({schemaVersion: "pokie.state.v2", drawCount: 2});
        expect(session.serialize()).not.toHaveProperty("draws");
        await expect(session.play({bet: -1})).rejects.toThrow(/positive/);
        expect(trace.dropped).toBe(1);
        session.dispose();
        expect(trace.status).toBe("disposed");
        expect(trace.entries).toEqual([]);
        await expect(session.play()).rejects.toThrow(/disposed/);
        runtime.dispose();
    });

    it("attaches after prior rounds without backfill and releases replaced and runtime-owned buffers", async () => {
        const fixture = createCanonicalWasmFixture();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        const session = runtime.createSession("0");
        await session.play();
        const trace = new BoundedPokieWasmTraceCollector(2);
        session.setTraceCollector(trace);
        await session.play();
        expect(trace.entries.map(entry => [entry.kind, entry.sequence])).toEqual([["round", 2]]);
        const replacement = new BoundedPokieWasmTraceCollector(1);
        session.setTraceCollector(replacement);
        expect(trace).toMatchObject({status: "disposed", entries: []});
        const sibling = runtime.createSession("sibling");
        expect(() => sibling.setTraceCollector(replacement)).toThrow(/exclusively/);
        await session.play();
        expect(replacement.entries[0].sequence).toBe(3);
        runtime.dispose();
        expect(replacement.entries).toEqual([]);
    });

    it("emits replay evidence explicitly, completes a finite batch, and never claims omitted history", async () => {
        const fixture = createCanonicalWasmFixture({capabilities: ["runtime.replay"]});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        const trace = new BoundedPokieWasmTraceCollector(2);
        const replay = await runtime.replay({schemaVersion: "pokie.state.v2", seed: "0", drawCount: 0, sequence: 0, credits: 1000}, [{}, {}], {trace});
        expect(trace.status).toBe("completed");
        expect(trace.entries.map(entry => [entry.kind, entry.sequence])).toEqual([["initialization", 0], ["replay", 1]]);
        expect(trace.dropped).toBe(1);
        expect(replay.rounds).toHaveLength(2);
        const laterTrace = new BoundedPokieWasmTraceCollector(2);
        await runtime.replay(replay.stateAfter, [{}], {trace: laterTrace});
        expect(laterTrace.entries.map(entry => [entry.kind, entry.sequence])).toEqual([["replay", 3]]);
        const empty = new BoundedPokieWasmTraceCollector(2);
        await runtime.replay(replay.stateAfter, [], {trace: empty});
        expect(empty).toMatchObject({status: "completed", entries: [], dropped: 0});
        expect(() => runtime.createSession("0", {trace})).toThrow(/open/);
        runtime.dispose();
        // Completed replay evidence belongs to the caller, bounded and detached from runtime.
        expect(trace.entries).toHaveLength(2);
        trace.dispose();
        laterTrace.dispose();
        empty.dispose();
    });

    it("rejects sinks/callback replacements before initialization and clears failed initialization/replay/traps", async () => {
        const fixture = createCanonicalWasmFixture();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => 1, resetSeed: () => undefined});
        const trace = new BoundedPokieWasmTraceCollector(2);
        expect(() => runtime.createSession("0", {trace})).toThrow(/RNG/);
        expect(trace).toMatchObject({status: "disposed", entries: []});
        const fake = {record: () => {
            throw new Error("sink");
        }};
        expect(() => runtime.createSession("0", {trace: fake as never})).toThrow(/collector/);
        runtime.dispose();
        const trapped = createCanonicalWasmFixture({trapping: true});
        const trapping = await instantiatePokieWasm(trapped.bytes, trapped.manifest, new SeededPokieWasmHost("0"));
        const trappedTrace = new BoundedPokieWasmTraceCollector(2);
        const session = trapping.createSession("0", {trace: trappedTrace});
        await expect(session.play()).rejects.toThrow(/unreachable/);
        expect(trappedTrace).toMatchObject({status: "disposed", entries: []});
        expect(() => session.serialize()).toThrow(/disposed/);
        const replaying = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        const failed = new BoundedPokieWasmTraceCollector(2);
        const initial = replaying.createSession("0").serialize();
        await expect(replaying.replay(initial, [{}, {bet: -1}], {trace: failed})).rejects.toThrow(/positive/);
        expect(failed).toMatchObject({status: "disposed", entries: []});
        expect((await replaying.replay(initial, [{}])).rounds[0].sequence).toBe(1);
        replaying.dispose();
    });

    it("has no callback ambiguity after settlement and stops queued emission on disposal", async () => {
        const fixture = createCanonicalWasmFixture();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
        const trace = new BoundedPokieWasmTraceCollector(2);
        const session = runtime.createSession("0", {trace});
        const sink = jest.fn(() => {
            throw new Error("unsupported sink");
        });
        // Public tracing uses the concrete bounded implementation, never replaced callbacks.
        trace.record = sink;
        expect((await session.play()).sequence).toBe(1);
        expect(session.serialize().sequence).toBe(1);
        expect(trace.entries.map(entry => entry.sequence)).toEqual([0, 1]);
        expect(sink).not.toHaveBeenCalled();
        const queued = session.play();
        session.dispose();
        await expect(queued).rejects.toThrow(/disposed/);
        expect(trace.entries).toEqual([]);
        expect(sink).not.toHaveBeenCalled();
        runtime.dispose();
    });

    it("validates finite capacity and preserves authoritative P9-01 legacy initial/later snapshots", async () => {
        for (const capacity of [0, -1, 1.5, Infinity, NaN]) expect(() => new BoundedPokieWasmTraceCollector(capacity)).toThrow(/capacity/);
        const fixture = createCanonicalWasmFixture();
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("wasm-parity-golden"));
        const host = new SeededPokieWasmHost("wasm-parity-golden");
        const history: number[] = [];
        for (const sequence of [0, 1, 3]) {
            while (history.length < 2 + 2 * sequence) history.push(host.nextRandom());
            const legacy = {schemaVersion: "pokie.state.v1" as const, seed: "wasm-parity-golden", sequence, credits: 900, draws: [...history], rngState: host.serializeState()};
            const session = runtime.restoreSession(legacy);
            const compact = session.serialize();
            expect(compact).toEqual({schemaVersion: "pokie.state.v2", seed: legacy.seed, sequence, credits: 900, drawCount: history.length, rngState: legacy.rngState});
            expect(legacy.draws).toEqual(history);
            expect((await session.play()).draw).toBe((await runtime.replay(compact, [{}])).rounds[0].draw);
            expect(() => runtime.restoreSession({...legacy, draws: [NaN]})).toThrow(/malformed/);
            expect(() => runtime.restoreSession({...compact, schemaVersion: "pokie.state.v3" as never})).toThrow(/Unsupported/);
            expect(() => runtime.restoreSession({...compact, draws: history} as never)).toThrow(/malformed/);
        }
        runtime.dispose();
    });
});

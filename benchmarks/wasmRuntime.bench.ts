import {instantiatePokieWasm} from "../src/wasm/PokieWasmRuntime.js";
import {PokieWasmWorkerProtocol} from "../src/wasm/worker.js";
import {createCanonicalWasmFixture} from "../tests/fixtures/wasm/createCanonicalWasmFixture.js";
import {formatBenchmarkLine, measureBenchmarkAsync} from "./support/measureBenchmark.js";

const fixture = createCanonicalWasmFixture({id: "benchmark"});

describe("benchmark: portable WASM runtime", () => {
    test("records cold instantiate, warm spins, serialization, and replay baselines", async () => {
        let draw = 0;
        const nextRandom = () => (++draw % 100) / 100;
        const cold = await measureBenchmarkAsync(() => instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom}));
        const runtime = cold.result;
        const session = runtime.createSession("benchmark-seed");
        const warm = await measureBenchmarkAsync(async () => {
            for (let index = 0; index < 100; index++) await session.play({bet: 1});
            return session.serialize();
        });
        const replay = await measureBenchmarkAsync(() => runtime.replay(warm.result, [{bet: 1}]));
        const worker = await measureBenchmarkAsync(async () => {
            const protocol = new PokieWasmWorkerProtocol();
            const instantiated = await protocol.handle({id: "instantiate", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25]});
            const round = await protocol.handle({id: "play", type: "play"});
            await protocol.handle({id: "dispose", type: "dispose"});
            return {instantiated, round};
        });
        console.log(formatBenchmarkLine("wasmRuntime", {
            rawModuleBytes: fixture.bytes.byteLength,
            packagedManifestBytes: new TextEncoder().encode(JSON.stringify(fixture.manifest)).byteLength,
            coldInstantiateMs: cold.durationMs,
            warmSpinsMs: warm.durationMs,
            serializationBytes: JSON.stringify(warm.result).length,
            replayMs: replay.durationMs,
            workerRoundTripMs: worker.durationMs,
            rounds: 100,
        }));
        expect(warm.result.sequence).toBe(100);
        expect(replay.result).toHaveLength(1);
        expect(worker.result).toMatchObject({instantiated: {ok: true}, round: {ok: true}});
        runtime.dispose();
    });
});

import {instantiatePokieWasm} from "../src/wasm/PokieWasmRuntime.js";
import {PokieWasmWorkerProtocol} from "../src/wasm/worker.js";
import {createCanonicalWasmFixture} from "../tests/fixtures/wasm/createCanonicalWasmFixture.js";
import {formatBenchmarkLine, measureBenchmarkAsync} from "./support/measureBenchmark.js";

const fixture = createCanonicalWasmFixture({id: "benchmark"});
const FIXTURE_SEED = "wasm-benchmark-seed";
const WARMUP_ROUNDS = 10;
const MEASURED_ROUNDS = 100;

describe("benchmark: portable WASM runtime", () => {
    test("records cold instantiate, warm spins, serialization, and replay baselines", async () => {
        let draw = 0;
        const nextRandom = () => (++draw % 100) / 100;
        const cold = await measureBenchmarkAsync(() => instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom}));
        const runtime = cold.result;
        const session = runtime.createSession(FIXTURE_SEED);
        for (let index = 0; index < WARMUP_ROUNDS; index++) await session.play({bet: 1});
        const warm = await measureBenchmarkAsync(async () => {
            for (let index = 0; index < MEASURED_ROUNDS; index++) await session.play({bet: 1});
            return session.serialize();
        });
        const replay = await measureBenchmarkAsync(() => runtime.replay(warm.result, [{bet: 1}]));
        const worker = await measureBenchmarkAsync(async () => {
            const protocol = new PokieWasmWorkerProtocol();
            const instantiated = await protocol.handle({id: "instantiate", type: "instantiate", bytes: fixture.bytes, manifest: fixture.manifest, draws: [0.25, 0.75]});
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
            fixture: fixture.manifest.component.id,
            seed: FIXTURE_SEED,
            warmupRounds: WARMUP_ROUNDS,
            rounds: MEASURED_ROUNDS,
            node: process.version,
            browser: process.env.POKIE_WASM_BROWSER_VERSION ?? "run tests/scripts/wasmRuntimeBrowser.test.mjs for Chromium version",
        }));
        expect(warm.result.sequence).toBe(WARMUP_ROUNDS + MEASURED_ROUNDS);
        expect(replay.result).toHaveLength(1);
        expect(worker.result).toMatchObject({instantiated: {ok: true}, round: {ok: true}});
        runtime.dispose();
    });
});

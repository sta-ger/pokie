import {instantiatePokieWasm} from "../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmComponentManifest} from "../src/project/wasm/PokieWasmComponentManifest.js";
import {formatBenchmarkLine, measureBenchmarkAsync} from "./support/measureBenchmark.js";

const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const manifest: PokieWasmComponentManifest = {
    schemaVersion: "1.0.0", component: {id: "benchmark", version: "1.0.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"}, host: {rng: "pokie.rng.v1", services: []}, capabilities: ["runtime.play"],
    artifact: {format: "pokie.wasm.v1", sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000", bytes: 8, abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
};

describe("benchmark: portable WASM runtime", () => {
    test("records cold instantiate, warm spins, serialization, and replay baselines", async () => {
        let draw = 0;
        const cold = await measureBenchmarkAsync(() => instantiatePokieWasm(bytes, manifest, {nextRandom: () => (++draw % 100) / 100}));
        const runtime = cold.result;
        const session = runtime.createSession("benchmark-seed");
        const warm = await measureBenchmarkAsync(async () => {
            for (let index = 0; index < 100; index++) await session.play({bet: 1});
            return session.serialize();
        });
        const replay = await measureBenchmarkAsync(() => runtime.replay(warm.result, [{bet: 1}]));
        console.log(formatBenchmarkLine("wasmRuntime", {rawBytes: bytes.byteLength, coldInstantiateMs: cold.durationMs, warmSpinsMs: warm.durationMs, replayMs: replay.durationMs, rounds: 100}));
        expect(warm.result.sequence).toBe(100);
        expect(replay.result).toHaveLength(1);
        runtime.dispose();
    });
});

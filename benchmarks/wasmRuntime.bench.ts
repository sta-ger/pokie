import {spawn} from "child_process";
import {instantiatePokieWasm} from "../src/wasm/PokieWasmRuntime.js";
import {PORTABLE_RUNTIME_GOLDEN} from "../tests/fixtures/wasm/portableRuntimeGolden.js";
import {createCanonicalWasmFixture} from "../tests/fixtures/wasm/createCanonicalWasmFixture.js";
import {formatBenchmarkLine, measureBenchmarkAsync} from "./support/measureBenchmark.js";

const fixture = createCanonicalWasmFixture({id: PORTABLE_RUNTIME_GOLDEN.id});
const FIXTURE_SEED = "wasm-benchmark-seed";
const WARMUP_ROUNDS = 10;
const MEASURED_ROUNDS = 100;

type BrowserBenchmark = {
    readonly chromium: string;
    readonly rawModuleBytes: number;
    readonly manifestBytes: number;
    readonly portableRuntimeBytes: number;
    readonly completePackagedArtifactBytes: number;
    readonly status: "PASS";
    readonly coldInstantiateMs: number;
    readonly warmPlayMs: number;
    readonly workerRoundTripMs: number;
    readonly serializationBytes: number;
};

describe("benchmark: portable WASM runtime", () => {
    test("records Node and genuine Chromium/Worker baselines with correctness assertions", async () => {
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
        // This invokes the actual Chromium harness, whose main-thread runtime
        // imports pokie/wasm and whose module Worker imports worker.ts' protocol.
        // Do not substitute an in-process protocol.handle() timing here.
        const browser = await measureBenchmarkAsync(runRealBrowserWorkerBenchmark);

        expect(warm.result.sequence).toBe(WARMUP_ROUNDS + MEASURED_ROUNDS);
        expect(replay.result).toHaveLength(1);
        expect(browser.result.status).toBe("PASS");
        expect(browser.result.completePackagedArtifactBytes).toBeGreaterThan(fixture.bytes.byteLength);
        expectTimings([cold.durationMs, warm.durationMs, replay.durationMs, browser.durationMs, browser.result.coldInstantiateMs, browser.result.warmPlayMs, browser.result.workerRoundTripMs]);

        console.log(formatBenchmarkLine("wasmRuntime", {
            fixture: fixture.manifest.component.id,
            seed: FIXTURE_SEED,
            warmupRounds: WARMUP_ROUNDS,
            rounds: MEASURED_ROUNDS,
            node: process.version,
            chromium: browser.result.chromium,
            rawModuleBytes: fixture.bytes.byteLength,
            manifestBytes: new TextEncoder().encode(JSON.stringify(fixture.manifest)).byteLength,
            portableRuntimeBytes: browser.result.portableRuntimeBytes,
            completePackagedArtifactBytes: browser.result.completePackagedArtifactBytes,
            nodeColdInstantiateMs: cold.durationMs,
            nodeWarmPlayMs: warm.durationMs,
            nodeSerializationBytes: JSON.stringify(warm.result).length,
            nodeReplayMs: replay.durationMs,
            chromiumColdInstantiateMs: browser.result.coldInstantiateMs,
            chromiumWarmPlayMs: browser.result.warmPlayMs,
            chromiumWorkerRoundTripMs: browser.result.workerRoundTripMs,
            chromiumSerializationBytes: browser.result.serializationBytes,
            chromiumHarnessMs: browser.durationMs,
            correctness: browser.result.status,
        }));
        runtime.dispose();
    });
});

function expectTimings(values: readonly number[]): void {
    values.forEach((value) => expect(Number.isFinite(value) && value >= 0).toBe(true));
}

function runRealBrowserWorkerBenchmark(): Promise<BrowserBenchmark> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["tests/scripts/wasmRuntimeBrowser.test.mjs", "--benchmark"], {cwd: process.cwd()});
        let output = "";
        let errorOutput = "";
        child.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            errorOutput += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code !== 0) {
                reject(new Error(`Chromium WASM benchmark exited with ${code}: ${errorOutput || output}`));
                return;
            }
            const marker = output.match(/^POKIE_WASM_BROWSER_BENCHMARK=(.+)$/m)?.[1];
            if (marker === undefined) {
                reject(new Error(`Chromium WASM benchmark did not emit its result: ${output}`));
                return;
            }
            try {
                resolve(JSON.parse(marker) as BrowserBenchmark);
            } catch (error) {
                reject(error);
            }
        });
    });
}

import {spawn} from "child_process";
import {writeFile} from "fs/promises";
import path from "path";
import {instantiatePokieWasm} from "../src/wasm/PokieWasmRuntime.js";
import {PORTABLE_RUNTIME_GOLDEN} from "../tests/fixtures/wasm/portableRuntimeGolden.js";
import {createCanonicalWasmFixture} from "../tests/fixtures/wasm/createCanonicalWasmFixture.js";
import {formatBenchmarkLine, measureBenchmarkAsync} from "./support/measureBenchmark.js";

const fixture = createCanonicalWasmFixture({id: PORTABLE_RUNTIME_GOLDEN.id});
const benchmarkConfiguration = {
    fixtureId: fixture.manifest.component.id,
    fixtureSeed: "wasm-benchmark-seed",
    warmupRounds: 10,
    measuredRounds: 100,
} as const;
const BASELINE_COMMAND = "POKIE_UPDATE_WASM_RUNTIME_BASELINE=1 npm run bench -- wasmRuntime.bench.ts";
const BASELINE_PATH = path.join(process.cwd(), "benchmarks", "baselines", "wasmRuntime.json");

type BrowserBenchmark = {
    readonly chromium: string;
    readonly fixtureId: string;
    readonly fixtureSeed: string;
    readonly warmupRounds: number;
    readonly measuredRounds: number;
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

type WasmRuntimeBenchmarkResult = {
    readonly fixtureId: string;
    readonly fixtureSeed: string;
    readonly warmupRounds: number;
    readonly measuredRounds: number;
    readonly nodeVersion: string;
    readonly chromiumVersion: string;
    readonly rawModuleBytes: number;
    readonly manifestBytes: number;
    readonly portableRuntimeBytes: number;
    readonly completePackagedArtifactBytes: number;
    readonly nodeColdInstantiateMs: number;
    readonly nodeWarmPlayMs: number;
    readonly nodeSerializationBytes: number;
    readonly nodeReplayMs: number;
    readonly chromiumColdInstantiateMs: number;
    readonly chromiumWarmPlayMs: number;
    readonly chromiumSerializationBytes: number;
    readonly chromiumWorkerRoundTripMs: number;
    readonly totalHarnessDurationMs: number;
    readonly correctness: "PASS";
};

describe("benchmark: portable WASM runtime", () => {
    test("records Node and genuine Chromium/Worker baselines with correctness assertions", async () => {
        let draw = 0;
        const nextRandom = () => (++draw % 100) / 100;
        const cold = await measureBenchmarkAsync(() => instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom}));
        const runtime = cold.result;
        const session = runtime.createSession(benchmarkConfiguration.fixtureSeed);
        for (let index = 0; index < benchmarkConfiguration.warmupRounds; index++) await session.play({bet: 1});
        const warm = await measureBenchmarkAsync(async () => {
            for (let index = 0; index < benchmarkConfiguration.measuredRounds; index++) await session.play({bet: 1});
            return session.serialize();
        });
        const replay = await measureBenchmarkAsync(() => runtime.replay(warm.result, [{bet: 1}]));
        // This invokes the actual Chromium harness, whose main-thread runtime
        // imports pokie/wasm and whose module Worker imports worker.ts' protocol.
        // Do not substitute an in-process protocol.handle() timing here.
        const browser = await measureBenchmarkAsync(runRealBrowserWorkerBenchmark);

        expect(warm.result.sequence).toBe(benchmarkConfiguration.warmupRounds + benchmarkConfiguration.measuredRounds);
        expect(replay.result).toHaveLength(1);
        expect(browser.result.status).toBe("PASS");
        expect(browser.result.fixtureId).toBe(benchmarkConfiguration.fixtureId);
        expect(browser.result.fixtureSeed).toBe(benchmarkConfiguration.fixtureSeed);
        expect(browser.result.warmupRounds).toBe(benchmarkConfiguration.warmupRounds);
        expect(browser.result.measuredRounds).toBe(benchmarkConfiguration.measuredRounds);
        expect(browser.result.completePackagedArtifactBytes).toBeGreaterThan(fixture.bytes.byteLength);
        expectTimings([cold.durationMs, warm.durationMs, replay.durationMs, browser.durationMs, browser.result.coldInstantiateMs, browser.result.warmPlayMs, browser.result.workerRoundTripMs]);

        const result: WasmRuntimeBenchmarkResult = {
            ...benchmarkConfiguration,
            nodeVersion: process.version,
            chromiumVersion: browser.result.chromium,
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
            totalHarnessDurationMs: browser.durationMs,
            correctness: browser.result.status,
        };
        expectTimings(Object.entries(result)
            .filter(([key]) => key.endsWith("Ms"))
            .map(([, value]) => value as number));
        console.log(formatBenchmarkLine("wasmRuntime", result));
        if (process.env.POKIE_UPDATE_WASM_RUNTIME_BASELINE === "1") await writeInformationalBaseline(result);
        runtime.dispose();
    });
});

function expectTimings(values: readonly number[]): void {
    values.forEach((value) => expect(Number.isFinite(value) && value >= 0).toBe(true));
}

function runRealBrowserWorkerBenchmark(): Promise<BrowserBenchmark> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
            "tests/scripts/wasmRuntimeBrowser.test.mjs",
            "--benchmark",
            `--benchmark-configuration=${JSON.stringify(benchmarkConfiguration)}`,
        ], {cwd: process.cwd()});
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

async function writeInformationalBaseline(result: WasmRuntimeBenchmarkResult): Promise<void> {
    await writeFile(BASELINE_PATH, `${JSON.stringify({
        schemaVersion: "pokie.wasm-runtime-benchmark.v2",
        command: BASELINE_COMMAND,
        ...result,
        note: "Informational local baseline; compare field-for-field, never as a hard timing gate.",
    }, undefined, 2)}\n`);
}

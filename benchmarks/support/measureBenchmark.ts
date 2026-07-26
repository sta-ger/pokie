export type BenchmarkMeasurement<T> = {
    result: T;
    durationMs: number;
    // Best-effort only: without --expose-gc a garbage collection can land mid-measurement and make
    // this negative or otherwise noisy. Never assert a hard bound on this value -- log it as a rough
    // baseline data point, not a pass/fail gate (see benchmarks/README.md).
    heapUsedDeltaBytes: number;
};

function collectGarbageIfExposed(): void {
    // Only present when Node is launched with --expose-gc (see package.json's "bench" script).
    const expose = (globalThis as {gc?: () => void}).gc;
    if (expose) {
        expose();
    }
}

export function measureBenchmark<T>(run: () => T): BenchmarkMeasurement<T> {
    collectGarbageIfExposed();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = process.hrtime.bigint();

    const result = run();

    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    collectGarbageIfExposed();
    const heapUsedDeltaBytes = process.memoryUsage().heapUsed - heapBefore;

    return {result, durationMs, heapUsedDeltaBytes};
}

export async function measureBenchmarkAsync<T>(run: () => Promise<T>): Promise<BenchmarkMeasurement<T>> {
    collectGarbageIfExposed();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = process.hrtime.bigint();

    const result = await run();

    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    collectGarbageIfExposed();
    const heapUsedDeltaBytes = process.memoryUsage().heapUsed - heapBefore;

    return {result, durationMs, heapUsedDeltaBytes};
}

export function formatBenchmarkLine(label: string, fields: Record<string, string | number>): string {
    const rendered = Object.entries(fields)
        .map(([key, value]) => `${key}=${typeof value === "number" ? value.toFixed(2) : value}`)
        .join(" ");
    return `[bench] ${label}: ${rendered}`;
}

export function bytesToMebibytes(bytes: number): number {
    return bytes / (1024 * 1024);
}

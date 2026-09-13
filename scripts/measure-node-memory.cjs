// Minimal process-level sampler for bounded acceptance runs.  It deliberately
// records a sampled V8 heap maximum rather than presenting it as a GC-safe
// absolute peak; `/usr/bin/time -v` remains the RSS authority for the child.
const fs = require("node:fs");

const output = process.env.POKIE_MEASURE_OUTPUT;
if (!output) {
    throw new Error("POKIE_MEASURE_OUTPUT must name the measurement JSON file.");
}

const startedAt = process.hrtime.bigint();
let peakHeapUsedBytes = 0;
let peakHeapTotalBytes = 0;

function sample() {
    const {heapUsed, heapTotal} = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, heapUsed);
    peakHeapTotalBytes = Math.max(peakHeapTotalBytes, heapTotal);
}

sample();
setInterval(sample, 10).unref();
process.on("exit", (exitCode) => {
    sample();
    fs.writeFileSync(output, `${JSON.stringify({
        exitCode,
        elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        sampledEveryMs: 10,
        peakHeapUsedBytes,
        peakHeapTotalBytes,
    }, null, 2)}\n`);
});

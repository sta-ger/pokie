#!/usr/bin/env node
// Executes one bounded command while sampling its Linux child VmRSS.  The
// child's own `measure-node-memory.cjs` records V8 heap separately, avoiding
// the common but incorrect practice of treating a Node heap limit as a peak.
import {spawn} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [outputPath, separator, command, ...arguments_] = process.argv.slice(2);
if (!outputPath || separator !== "--" || !command) {
    throw new Error("Usage: measure-command.mjs <output.json> -- <command> [arguments...]");
}

const heapPath = `${outputPath}.heap.json`;
const startedAt = process.hrtime.bigint();
let peakRssBytes = 0;
let samples = 0;

async function sampleRss(pid) {
    try {
        const status = await readFile(`/proc/${pid}/status`, "utf8");
        const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
        if (match) peakRssBytes = Math.max(peakRssBytes, Number(match[1]) * 1024);
        samples += 1;
    } catch {
        // The process may have exited between the timer tick and /proc read.
    }
}

const child = spawn(command, arguments_, {
    cwd: root,
    env: {
        ...process.env,
        POKIE_MEASURE_OUTPUT: heapPath,
        NODE_OPTIONS: `--require=${resolve(root, "scripts", "measure-node-memory.cjs")}${process.env.NODE_OPTIONS ? ` ${process.env.NODE_OPTIONS}` : ""}`,
    },
    stdio: "inherit",
});
const timer = setInterval(() => void sampleRss(child.pid), 10);
await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => resolveExit({code, signal}));
}).then(async ({code, signal}) => {
    clearInterval(timer);
    await sampleRss(child.pid);
    const heap = JSON.parse(await readFile(heapPath, "utf8"));
    const result = {
        command: [command, ...arguments_],
        exitCode: code,
        signal,
        elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        rss: {source: "/proc/<pid>/status VmRSS, sampled every 10 ms", samples, peakRssBytes},
        heap,
    };
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    if (code !== 0) process.exitCode = code ?? 1;
});

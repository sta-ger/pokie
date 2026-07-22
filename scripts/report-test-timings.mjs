#!/usr/bin/env node
// Runs one of the check:* lanes through `jest --json` and prints the slowest suites, so
// regressions in test performance show up as a concrete report instead of "the suite feels
// slower". Usage: node scripts/report-test-timings.mjs [--lane fast|full|release] [--top N]
import {execFileSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const args = process.argv.slice(2);
function flag(name, fallback) {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
}

const lane = flag("lane", "fast");
const top = Number(flag("top", "10"));

const LANES = {
    fast: {projects: ["pokie", "studio-client-components"], coverage: false},
    full: {
        projects: ["pokie", "studio-client-components", "pokie-integration", "studio-client-workflows"],
        coverage: false,
    },
    release: {
        projects: [
            "pokie",
            "studio-client-components",
            "pokie-integration",
            "studio-client-workflows",
            "pokie-packaging",
        ],
        coverage: true,
    },
};

const laneConfig = LANES[lane];
if (!laneConfig) {
    console.error(`Unknown --lane "${lane}". Expected one of: ${Object.keys(LANES).join(", ")}`);
    process.exit(1);
}

const outputFile = path.join(os.tmpdir(), `pokie-test-report-${process.pid}.json`);
const jestArgs = ["jest", "--selectProjects", ...laneConfig.projects, "--json", `--outputFile=${outputFile}`];
if (laneConfig.coverage) {
    jestArgs.push("--coverage");
}
if (lane === "release") {
    // The packaging project is a single 5-minute real-build test; parallelizing it against nothing
    // else in its own project buys nothing.
    jestArgs.push("--runInBand");
}

const startedAt = Date.now();
let exitCode = 0;
try {
    execFileSync("npx", jestArgs, {stdio: "inherit", cwd: path.resolve(import.meta.dirname, "..")});
} catch (e) {
    exitCode = typeof e.status === "number" ? e.status : 1;
}
const wallClockMs = Date.now() - startedAt;

if (!fs.existsSync(outputFile)) {
    console.error("jest did not produce a --json report; nothing to summarize.");
    process.exit(exitCode || 1);
}

const report = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
fs.rmSync(outputFile, {force: true});

const repoRoot = path.resolve(import.meta.dirname, "..");
const suites = report.testResults
    .map((r) => ({
        file: path.relative(repoRoot, r.testFilePath),
        runtimeMs: r.perfStats?.runtime ?? r.endTime - r.startTime,
        status: r.status,
    }))
    .sort((a, b) => b.runtimeMs - a.runtimeMs);

console.log(`\n=== pokie test timing report: lane "${lane}" ===`);
console.log(`Projects: ${laneConfig.projects.join(", ")}${laneConfig.coverage ? " (coverage on)" : ""}`);
console.log(`Suites: ${report.numTotalTestSuites} total, ${report.numFailedTestSuites} failed`);
console.log(`Tests: ${report.numTotalTests} total, ${report.numFailedTests} failed`);
console.log(`Wall clock: ${(wallClockMs / 1000).toFixed(1)}s`);
console.log(`\nTop ${Math.min(top, suites.length)} slowest suites:`);
for (const s of suites.slice(0, top)) {
    console.log(`  ${(s.runtimeMs / 1000).toFixed(2).padStart(8)}s  ${s.status.padEnd(6)}  ${s.file}`);
}
console.log("");

process.exit(exitCode);

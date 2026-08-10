#!/usr/bin/env node
// Proves Stake adapter capability honesty against a real, running Studio server (no mocks): Play/
// Sampling/Simulation/Replay must each be refused via the real, structured capability diagnostic --
// never a fake success, never a silent no-op.
const base = process.argv[2] || "http://127.0.0.1:4302";

async function j(method, path, body) {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: body !== undefined ? {"Content-Type": "application/json"} : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = text;
    }
    return {status: response.status, body: parsed};
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
    console.log(`  OK: ${message}`);
}

async function main() {
    console.log("=== GET /api/project/context (a resolved stakeAdapter project) ===");
    const context = await j("GET", "/api/project/context");
    console.log(JSON.stringify(context.body, null, 2));
    assert(context.body.project.type === "stakeAdapter", "resolved project type is stakeAdapter");
    assert(!context.body.project.capabilities.includes("outcomeSource.sample"), "stakeAdapter never carries outcomeSource.sample");
    assert(context.body.project.capabilities.includes("outcomeSource.read"), "stakeAdapter still carries outcomeSource.read (Overview/Exact Analysis stays reachable)");

    console.log("\n=== POST /api/project/outcome-source/sample: no draw offered ===");
    const sample = await j("POST", "/api/project/outcome-source/sample", {modeName: "base"});
    console.log(JSON.stringify(sample.body, null, 2));
    assert(sample.body.supported === false, "sample honestly refuses a stakeAdapter draw");
    assert(sample.body.diagnostic.missingCapability === "outcomeSource.sample", "the diagnostic names the missing capability");

    console.log("\n=== POST /api/project/play/session: Play never offered for a stakeAdapter project ===");
    const play = await j("POST", "/api/project/play/session", {});
    console.log(JSON.stringify(play.body, null, 2));
    assert(play.body.status === "failed", "Play session creation fails honestly");
    assert(play.body.error.includes("outcomeSource.sample"), "the failure names the missing capability");

    console.log("\n=== POST /api/project/simulations: Simulation never offered for a stakeAdapter project ===");
    const sim = await j("POST", "/api/project/simulations", {rounds: 5});
    let simJob = sim.body;
    for (let i = 0; i < 200 && (simJob.status === "queued" || simJob.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, 50));
        simJob = (await j("GET", `/api/project/simulations/${sim.body.id}`)).body;
    }
    console.log(JSON.stringify(simJob, null, 2));
    assert(simJob.status === "failed", "simulation job fails honestly for a stakeAdapter project");
    assert(simJob.error.includes("outcomeSource.sample"), "the failure names the missing capability");

    console.log("\n=== POST /api/project/replays: Replay never offered for a stakeAdapter project ===");
    const replay = await j("POST", "/api/project/replays", {round: 1});
    let replayJob = replay.body;
    for (let i = 0; i < 200 && (replayJob.status === "queued" || replayJob.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, 50));
        replayJob = (await j("GET", `/api/project/replays/${replay.body.id}`)).body;
    }
    console.log(JSON.stringify(replayJob, null, 2));
    assert(replayJob.status === "failed", "replay job fails honestly for a stakeAdapter project");
    assert(replayJob.error.includes("outcomeSource.sample"), "the failure names the missing capability");

    console.log("\nALL ASSERTIONS PASSED");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

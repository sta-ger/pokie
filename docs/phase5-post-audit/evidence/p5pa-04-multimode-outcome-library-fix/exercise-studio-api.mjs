#!/usr/bin/env node
// Drives the real, running Studio HTTP server (started by `pokie studio`) through the exact same
// endpoints the Studio frontend's apiClient.ts calls -- no mocks, no unit-test doubles, a real
// process listening on a real port. Proves multi-mode Outcome Library selection end to end across
// Overview/Exact Analysis, Play, Simulation, and Replay.
const base = process.argv[2] || "http://127.0.0.1:4301";

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
    console.log("=== 1. Overview / Exact Analysis: GET /api/project/context (the exact fetch OutcomeSourceOverview.tsx reads) ===");
    const context = await j("GET", "/api/project/context");
    console.log(JSON.stringify(context.body, null, 2));
    assert(context.status === 200, "context returns 200");
    assert(context.body.status === "outcome-source", "dashboard resolves to the outcome-source header status");
    assert(context.body.project.type === "outcomeLibrary", "resolved project type is outcomeLibrary");
    const report = context.body.report;
    assert(Array.isArray(report.modes) && report.modes.length === 2, "report.modes lists exactly 2 real modes");
    const modeNames = report.modes.map((m) => m.modeName).sort();
    assert(JSON.stringify(modeNames) === JSON.stringify(["base", "buyFeature"]), `report.modes are exactly ["base","buyFeature"] (got ${JSON.stringify(modeNames)})`);
    assert(context.body.project.capabilities.includes("outcomeSource.sample"), "outcomeLibrary project carries outcomeSource.sample (Play/Sampling truly offered)");

    console.log("\n=== 2. Exact Analysis draw: POST /api/project/outcome-source/sample (explicit real mode) ===");
    const sampleBase = await j("POST", "/api/project/outcome-source/sample", {modeName: "base", seed: "p5pa04-sample-seed"});
    assert(sampleBase.status === 200 && sampleBase.body.supported === true, "sample against 'base' succeeds");
    assert(sampleBase.body.selection.outcome.artifact.roundId.startsWith("base-lib-"), `sample('base') drew from base-lib (roundId=${sampleBase.body.selection.outcome.artifact.roundId})`);

    const sampleBuy = await j("POST", "/api/project/outcome-source/sample", {modeName: "buyFeature", seed: "p5pa04-sample-seed"});
    assert(sampleBuy.status === 200 && sampleBuy.body.supported === true, "sample against 'buyFeature' succeeds");
    assert(sampleBuy.body.selection.outcome.artifact.roundId.startsWith("buy-lib-"), `sample('buyFeature') drew from buy-lib (roundId=${sampleBuy.body.selection.outcome.artifact.roundId})`);

    const sampleBogus = await j("POST", "/api/project/outcome-source/sample", {modeName: "bonus", seed: "p5pa04-sample-seed"});
    console.log(JSON.stringify(sampleBogus, null, 2));
    assert(sampleBogus.status !== 200 || sampleBogus.body.supported === false, "sample against an unknown mode never silently substitutes another mode's data");

    console.log("\n=== 3. Play: POST /api/project/play/session (default = first mode, no modeName sent) ===");
    const playDefault = await j("POST", "/api/project/play/session", {seed: "p5pa04-play-default-seed"});
    assert(playDefault.status === 201 && playDefault.body.status === "ok", "default Play session creates ok");
    const playDefaultSpin = await j("POST", `/api/project/play/sessions/${playDefault.body.session.sessionId}/spin`, {});
    assert(playDefaultSpin.body.session.debug.artifact.roundId.startsWith("base-lib-"), `default Play session (no modeName) plays 'base' -- the manifest's own first mode (roundId=${playDefaultSpin.body.session.debug.artifact.roundId})`);

    console.log("\n=== 4. Play: POST /api/project/play/session (explicit non-first mode) ===");
    const playBuy = await j("POST", "/api/project/play/session", {seed: "p5pa04-play-buy-seed", modeName: "buyFeature"});
    assert(playBuy.status === 201 && playBuy.body.status === "ok", "explicit-mode Play session creates ok");
    const playBuySpin = await j("POST", `/api/project/play/sessions/${playBuy.body.session.sessionId}/spin`, {});
    assert(playBuySpin.body.session.debug.artifact.roundId.startsWith("buy-lib-"), `explicit-mode Play session plays 'buyFeature', not the first mode (roundId=${playBuySpin.body.session.debug.artifact.roundId})`);
    assert(playBuySpin.body.session.studioModeName === "buyFeature", "the recorded round's own studioModeName is 'buyFeature' -- round provenance preserves the selected mode");

    console.log("\n=== 5. Play: an unknown mode name fails honestly, never silently falls back ===");
    const playBogus = await j("POST", "/api/project/play/session", {modeName: "bonus"});
    console.log(JSON.stringify(playBogus, null, 2));
    assert(playBogus.body.status === "failed", "Play session creation for an unknown mode fails");
    assert(playBogus.body.error.includes('"bonus" is not a mode of this outcome library'), "the failure names every real mode, never a raw ENOENT");
    assert(playBogus.body.error.includes("base") && playBogus.body.error.includes("buyFeature"), "the failure message lists both real modes");

    console.log("\n=== 6. Simulation/Sampling: POST /api/project/simulations (explicit non-first mode) ===");
    const simStart = await j("POST", "/api/project/simulations", {rounds: 20, seed: "p5pa04-sim-seed", modeName: "buyFeature"});
    assert(simStart.status === 202, "simulation job created");
    let simJob = simStart.body;
    for (let i = 0; i < 200 && (simJob.status === "queued" || simJob.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, 50));
        simJob = (await j("GET", `/api/project/simulations/${simStart.body.id}`)).body;
    }
    console.log(JSON.stringify(simJob, null, 2));
    assert(simJob.status === "completed", "simulation job completes");
    assert(simJob.modeName === "buyFeature", "the completed simulation job's own modeName is 'buyFeature', not silently the first mode");

    console.log("\n=== 7. Replay: POST /api/project/replays 'Recreate from seed' (explicit non-first mode) ===");
    const replayStart = await j("POST", "/api/project/replays", {round: 1, seed: "p5pa04-replay-seed", modeName: "buyFeature"});
    assert(replayStart.status === 202, "replay job created");
    let replayJob = replayStart.body;
    for (let i = 0; i < 200 && (replayJob.status === "queued" || replayJob.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, 50));
        replayJob = (await j("GET", `/api/project/replays/${replayStart.body.id}`)).body;
    }
    console.log(JSON.stringify(replayJob, null, 2));
    assert(replayJob.status === "completed", "replay job completes");
    assert(replayJob.modeName === "buyFeature", "the completed replay job's own modeName is 'buyFeature'");
    assert(replayJob.descriptor.artifact.roundId.startsWith("buy-lib-"), `the reproduced round's own artifact was drawn from buy-lib (roundId=${replayJob.descriptor.artifact.roundId})`);

    console.log("\n=== 8. Replay: an unknown mode name fails honestly ===");
    const replayBogus = await j("POST", "/api/project/replays", {round: 1, modeName: "bonus"});
    let replayBogusJob = replayBogus.body;
    for (let i = 0; i < 200 && (replayBogusJob.status === "queued" || replayBogusJob.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, 50));
        replayBogusJob = (await j("GET", `/api/project/replays/${replayBogus.body.id}`)).body;
    }
    console.log(JSON.stringify(replayBogusJob, null, 2));
    assert(replayBogusJob.status === "failed", "replay job for an unknown mode fails");
    assert(replayBogusJob.error.includes('"bonus" is not a mode of this outcome library'), "the failure names every real mode");

    console.log("\n=== 9. Round provenance: GET /api/project/rounds preserves modeName across every producer ===");
    const rounds = await j("GET", "/api/project/rounds");
    console.log(JSON.stringify(rounds.body, null, 2));
    const bySource = Object.fromEntries(rounds.body.map((r) => [`${r.studioSource}:${r.studioModeName ?? "(none)"}`, true]));
    assert(bySource["outcome-source-sample:base"], "recorded outcome-source-sample round carries studioModeName=base");
    assert(bySource["outcome-source-sample:buyFeature"], "recorded outcome-source-sample round carries studioModeName=buyFeature");
    assert(bySource["play-outcome-source:base"], "recorded default Play round carries studioModeName=base");
    assert(bySource["play-outcome-source:buyFeature"], "recorded explicit-mode Play round carries studioModeName=buyFeature");

    console.log("\n=== 10. Build/Export: GET /api/project/gameModel (outcomeLibrary honestly has no game model to export from) ===");
    const gameModel = await j("GET", "/api/project/gameModel");
    console.log(JSON.stringify(gameModel.body, null, 2));

    console.log("\nALL ASSERTIONS PASSED");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

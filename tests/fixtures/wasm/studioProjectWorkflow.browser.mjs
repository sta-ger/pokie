// Controller-owned fixture. Reuses the Chromium pipe transport used by wasmRuntimeBrowser.test.mjs.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile, writeFile, unlink} from "node:fs/promises";
import {createServer} from "node:net";
import path from "node:path";
const [candidate, artifact, expectedJson] = process.argv.slice(2);
const expected = JSON.parse(expectedJson);
const allocator = createServer();
await new Promise(resolve => allocator.listen(0, "127.0.0.1", resolve));
const port = allocator.address().port;
await new Promise(resolve => allocator.close(resolve));
const studio = spawn(process.execPath, [path.join(candidate, "dist/cli/pokie.js"), artifact, "--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd: candidate, stdio: ["ignore", "pipe", "pipe"]});
let studioOutput = "";
for (const stream of [studio.stdout, studio.stderr]) stream.on("data", value => { studioOutput = (studioOutput + value).slice(-16000); });
const base = `http://127.0.0.1:${port}`;
async function waitFor(read, predicate, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await read();
        if (predicate(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${label}. Studio: ${studioOutput}`);
}
const api = async url => (await fetch(`${base}${url}`)).json();
const browser = spawn(process.env.CHROMIUM_PATH ?? "/snap/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--remote-debugging-pipe"], {stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"]});
let id = 0;
let buffer = "";
const pending = new Map();
browser.stdio[4].on("data", chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
        const value = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        const entry = pending.get(value.id);
        if (entry) { pending.delete(value.id); clearTimeout(entry.timer); value.error ? entry.reject(new Error(value.error.message)) : entry.resolve(value.result); }
    }
});
function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, {resolve, reject, timer: setTimeout(() => {pending.delete(requestId); reject(new Error(`Chromium timeout: ${method}`));}, 20000)});
        browser.stdio[3].write(`${JSON.stringify({id: requestId, method, params, ...(sessionId ? {sessionId} : {})})}\0`);
    });
}
let sessionId;
async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true}, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
const text = () => evaluate("document.body.innerText");
const rendered = async value => waitFor(text, body => body.includes(value), `rendered ${value}`);
async function click(label, ready = "true") {
    await waitFor(() => evaluate(`(() => {const node=[...document.querySelectorAll('button')].find(value=>(value.textContent.trim()===${JSON.stringify(label)}||(${JSON.stringify(label)}==='Show advanced details'&&value.textContent.startsWith('Show advanced details'))));if(!node||node.matches(':disabled')||node.getAttribute('data-loading')||!(${ready}))return false;node.click();return true;})()`), Boolean, `enabled button ${label}`);
}
const spinReady = `(() => {const node=[...document.querySelectorAll('button')].find(value=>value.textContent.trim()==='Spin');return !!node&&!node.matches(':disabled')&&!node.hasAttribute('data-loading');})()`;
async function selectBet(bet) {
    // A server recording precedes browser publication and React's accepted-bet effect.
    // Finish that rendered transition before selecting the next round's stake.
    await waitFor(() => evaluate(spinReady), Boolean, "rendered idle Spin before bet selection");
    const label = `Select bet ${bet}`;
    const locator = `[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===${JSON.stringify(label)})`;
    assert.equal(await evaluate(`(() => {const node=${locator};if(!node)return false;if(node.getAttribute('aria-pressed')==='true')return true;if(node.matches(':disabled'))return false;node.click();return true;})()`), true, label);
    const committed = `(() => {const node=${locator};return !!node&&node.getAttribute('aria-pressed')==='true'&&document.querySelector('.player-bet-current')?.textContent===${JSON.stringify(`Bet: ${bet}`)};})()`;
    await waitFor(() => evaluate(committed), Boolean, `rendered committed bet ${bet}`);
    return committed;
}
async function input(label, value) {
    const locator = `(() => {const labels=[...document.querySelectorAll('label')];const node=labels.find(value=>value.textContent.startsWith(${JSON.stringify(label)}));return node&&document.getElementById(node.htmlFor);})()`;
    // Select the native input's existing contents before native insertion. A key/code-only
    // Ctrl+A dispatch does not establish that Chromium selected the previous checkpoint.
    assert.equal(await evaluate(`(() => {const node=${locator}; if(!node)return false;node.focus();node.select();return document.activeElement===node&&node.selectionStart===0&&node.selectionEnd===node.value.length;})()`), true, `selected input ${label}`);
    await call("Input.insertText", {text: String(value)}, sessionId);
    assert.equal(await evaluate(`(${locator}).value`), String(value), `native ${label} input readback`);
}
const jobs = async () => (await api("/api/project/jobs")).jobs;
async function submitJob(operation, label, ready = "true") {
    const previous = new Set((await jobs()).map(row => row.id));
    await click(label, ready);
    return waitFor(jobs, rows => rows.some(row => row.operation === operation && !previous.has(row.id)), `new ${operation} after ${label}`)
        .then(rows => rows.find(row => row.operation === operation && !previous.has(row.id)));
}
async function jobTerminal(job) { return waitFor(async () => (await jobs()).find(row => row.id === job.id), row => row && ["completed", "failed", "cancelled", "recovery-required"].includes(row.status), `job ${job.id}`); }
async function startSimulation(rounds) {
    await click("Simulation");
    // The existing form shows Configure after a terminal; opening this step is an explicit user action.
    await evaluate("document.getElementById('simulation-configure')?.click()");
    await evaluate("window.__wasm.progress=[]");
    await input("Rounds", rounds);
    const previous = new Set((await jobs()).map(row => row.id));
    await click("Run Simulation");
    return waitFor(jobs, rows => rows.some(row => row.operation === "simulation" && !previous.has(row.id)), "submitted simulation").then(rows => rows.find(row => row.operation === "simulation" && !previous.has(row.id)));
}
const originalSidecar = await readFile(`${artifact}.pokie-wasm.json`, "utf8");
try {
    await waitFor(() => api("/api/health").catch(() => undefined), value => value?.status === "ok", "positional Studio startup");
    assert.equal((await api("/api/context")).projectRoot, artifact);
    const target = await call("Target.createTarget", {url: "about:blank"});
    sessionId = (await call("Target.attachToTarget", {targetId: target.targetId, flatten: true})).sessionId;
    await call("Page.enable", {}, sessionId);
    await call("Page.addScriptToEvaluateOnNewDocument", {source: `window.__wasm={workers:[],requests:[],progress:[]};const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);window.__wasm.workers.push(this);this.addEventListener('message',event=>{if(event.data.type==='progress'){window.__wasm.progress.push(event.data.progress.completed);if(window.__wasm.progress.length>100)window.__wasm.progress.shift();}});}postMessage(value,...rest){window.__wasm.requests.push({type:value.request?.type,bet:value.request?.command?.bet});if(window.__wasm.requests.length>100)window.__wasm.requests.shift();return super.postMessage(value,...rest);}};`}, sessionId);
    await call("Page.navigate", {url: base}, sessionId);
    await rendered("wasm-project-workflow");
    await waitFor(() => evaluate(`!!document.querySelector('[aria-label="Declared WASM component manifest"]')`), Boolean, "rendered inspection table");
    const validation = await api("/api/project/validate"); // UI automatically requests this same validation on Overview.
    assert.equal(validation.valid, true);
    assert(validation.information.some(row => /SHA-256/.test(row.message)));
    await click("Play");
    await click("Show advanced details");
    await input("Seed (optional)", "0");
    await click("New Play session");
    await rendered("Reset Play session");
    for (const [index, round] of expected.entries()) {
        const committed = await selectBet(round.bet);
        const requestCount = await evaluate("window.__wasm.requests.length");
        // Recheck the rendered choice in the same DOM task that activates Spin.
        const spun = await jobTerminal(await submitJob("browser-play", "Spin", committed));
        assert.equal(spun.status, "completed");
        assert.equal(spun.request.command.bet, round.bet);
        const rows = await waitFor(() => api("/api/project/rounds"), rows => rows.some(row => row.studioRequestId === spun.request.command.requestId), "correlated recorded Worker round");
        assert.equal(rows.length, index + 1);
        const actual = rows.find(row => row.studioRequestId === spun.request.command.requestId);
        const dispatched = await evaluate(`window.__wasm.requests.slice(${requestCount}).filter(row=>row.type==='play')`);
        assert.deepEqual(dispatched, [{type: "play", bet: round.bet}], "one exact Worker command for this action");
        assert.deepEqual(actual.screen, round.screen);
        assert.equal(actual.bet, round.bet);
        assert.equal(actual.win, round.win);
        assert.equal(actual.credits, round.credits);
        assert.equal(actual.wasm.execution, "browser-worker");
        await waitFor(() => evaluate(spinReady), Boolean, "rendered Spin completion");
    }
    const requests = await evaluate("window.__wasm.requests");
    for (const round of expected) assert(requests.some(row => row.type === "play" && row.bet === round.bet));
    // Syntax rejection is local and must neither submit a job nor mutate the live Worker.
    const beforeMalformed = (await jobs()).map(row => row.id).sort();
    await input("JSON checkpoint", "{");
    await click("Restore checkpoint");
    await rendered("Supply valid checkpoint JSON");
    assert.deepEqual((await jobs()).map(row => row.id).sort(), beforeMalformed);
    await click("Copy current checkpoint to input");
    const checkpointValue = () => evaluate("[...document.querySelectorAll('input')].find(node=>node.labels?.[0]?.textContent==='JSON checkpoint').value");
    const checkpoint = JSON.parse(await waitFor(checkpointValue, value => {
        try { return typeof JSON.parse(value)?.artifactIdentity === "string"; }
        catch { return false; }
    }, "copied current checkpoint"));
    const recordedBefore = (await api("/api/project/rounds")).length;
    const restore = await submitJob("browser-play", "Restore checkpoint");
    assert.equal((await jobTerminal(restore)).status, "completed");
    assert.equal((await api("/api/project/rounds")).length, recordedBefore, "restoration is not a spin");
    const invalid = {...checkpoint};
    invalid.artifactIdentity = "foreign";
    await input("JSON checkpoint", JSON.stringify(invalid));
    const rejected = await jobTerminal(await submitJob("browser-play", "Restore checkpoint"));
    assert.equal(rejected.status, "failed");
    assert.deepEqual(rejected.request.state, invalid, "the exact foreign checkpoint reached admission");
    assert.match(rejected.error, /incompatible artifact identity/);
    await rendered("Checkpoint restore failed. Supply a valid checkpoint from this WASM artifact and matching version");
    assert.equal((await api("/api/project/rounds")).length, recordedBefore, "rejection is not a spin");
    await click("Copy current checkpoint to input");
    await waitFor(checkpointValue, value => value === JSON.stringify(checkpoint), "preserved checkpoint after rejected restore");
    assert.deepEqual(JSON.parse(await checkpointValue()), checkpoint, "rejection preserves the confirmed checkpoint");
    const reused = await jobTerminal(await submitJob("browser-play", "Spin"));
    assert.equal(reused.status, "completed");
    assert.equal(reused.result.detail.session.debug.stateAfter.sequence, checkpoint.sequence + 1);
    const simulation = await startSimulation(4096);
    assert.equal((await jobTerminal(simulation)).status, "completed");
    const report = await api(`/api/project/reports/${simulation.id}`);
    assert.equal(report.report.rounds, 4096);
    assert.equal((await fetch(`${base}/api/project/reports/${simulation.id}/download?format=json`)).status, 200);
    await click("Replay");
    await input("Seed", "0");
    await input("Target round number", 3);
    await click("Load");
    const replay = await submitJob("replay", "Run again");
    assert.equal((await jobTerminal(replay)).status, "completed");
    assert.equal((await fetch(`${base}/api/project/replays/${replay.id}/download`)).status, 200);
    const retried = await submitJob("replay", "Run again with the same parameters");
    assert.equal((await jobTerminal(retried)).status, "completed");
    const active = await startSimulation(2000000);
    await waitFor(() => evaluate("window.__wasm.progress"), rows => rows.length > 0, "actual Worker progress");
    await click("Cancel");
    await click("Confirm");
    assert.equal((await jobTerminal(active)).status, "cancelled");
    const interrupted = await startSimulation(2000000);
    await call("Page.reload", {}, sessionId);
    await rendered("wasm-project-workflow");
    const interruptedResult = await jobTerminal(interrupted);
    assert(["cancelled", "recovery-required"].includes(interruptedResult.status));
    assert.equal((await jobs()).filter(row => row.id === interrupted.id).length, 1);
    const failed = await startSimulation(2000000);
    await evaluate("window.__wasm.workers.at(-1).dispatchEvent(new Event('messageerror'))");
    assert.equal((await jobTerminal(failed)).status, "failed");
    assert.equal((await jobTerminal(await startSimulation(128))).status, "completed");
    for (const [replacement, diagnostic] of [
        [undefined, "sidecar"], ["{", "not valid JSON"],
        [JSON.stringify({...JSON.parse(originalSidecar), schemaVersion: "99.0.0"}), "incompatible"],
        [JSON.stringify({...JSON.parse(originalSidecar), artifact: {...JSON.parse(originalSidecar).artifact, sha256: "sha256:" + "0".repeat(64)}}), "SHA-256"],
    ]) {
        if (replacement === undefined) await unlink(`${artifact}.pokie-wasm.json`);
        else await writeFile(`${artifact}.pokie-wasm.json`, replacement);
        await call("Page.reload", {}, sessionId);
        await rendered(diagnostic);
        assert.equal(await evaluate("[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Spin')"), false);
        await writeFile(`${artifact}.pokie-wasm.json`, originalSidecar);
        await call("Page.reload", {}, sessionId);
        await rendered("wasm-project-workflow");
    }
    assert.equal((await jobs()).filter(row => ["queued", "running", "cancelling"].includes(row.status)).length, 0);
    console.log("PASS installed rendered WASM Project production Worker workflow");
} finally {
    await writeFile(`${artifact}.pokie-wasm.json`, originalSidecar);
    if (sessionId) await call("Page.navigate", {url: "about:blank"}, sessionId).catch(() => undefined);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Browser fixture cleanup")); }
    pending.clear();
    const browserClosed = new Promise(resolve => browser.once("close", resolve));
    browser.kill();
    await browserClosed;
    const studioClosed = new Promise(resolve => studio.once("close", resolve));
    studio.kill("SIGTERM");
    await studioClosed;
}

/**
 * Real Chromium contract for the durable Studio job boundary.  This fixture is
 * intentionally a standalone Node test: it drives the compiled Studio client
 * through CDP while using the real Studio HTTP API for long-running setup and
 * observation.  No jsdom state, mocked fetch, or in-memory server is involved.
 *
 * The controller runs this after producing the normal CLI/client build.  It is
 * kept out of the implementer turn because it launches Chromium and a Studio
 * process; see the campaign's controller-owned browser verification policy.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import {createServer} from "node:net";
import os from "node:os";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const browserBinary = process.env.CHROMIUM_PATH ?? "/snap/bin/chromium";
let studio;
let chromium;
let cdp;
let profile;

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
const hasBrowserArtifacts = existsSync(resolve(root, "dist/cli/pokie.js")) && existsSync(resolve(root, "dist/cli/studio-client/index.html"));

async function freePort() {
    const server = createServer();
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    await new Promise((resolveClose, rejectClose) => server.close((error) => error === undefined ? resolveClose() : rejectClose(error)));
    if (address === null || typeof address === "string") throw new Error("Could not reserve a loopback port.");
    return address.port;
}

async function waitFor(predicate, message, timeout = 90_000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        if (await predicate()) return;
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}.`);
        await pause(100);
    }
}

async function terminate(child) {
    if (child === undefined || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
}

async function connect(devtoolsPort) {
    const target = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"})).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let nextId = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        const request = pending.get(response.id);
        if (request === undefined) return;
        pending.delete(response.id);
        response.error === undefined ? request.resolve(response.result) : request.reject(new Error(JSON.stringify(response.error)));
    });
    const send = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
        const id = ++nextId;
        pending.set(id, {resolve: resolveRequest, reject: rejectRequest});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function post(baseUrl, pathname, body) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: await response.json()};
}

async function run() {
    const studioPort = await freePort();
    const devtoolsPort = await freePort();
    profile = await mkdtemp(resolve(root, "node_modules/.cache/pokie-tmp/studio-durable-browser-"));
    const baseUrl = `http://127.0.0.1:${studioPort}`;
    const environment = {...process.env, HOME: profile, XDG_DATA_HOME: resolve(profile, "data")};
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "studio", "--no-open", "--host", "127.0.0.1", "--port", String(studioPort)], {cwd: root, env: environment, stdio: "ignore"});
    await waitFor(async () => {
        try { return (await fetch(`${baseUrl}/api/context`)).ok; } catch { return false; }
    }, "Studio HTTP server");
    chromium = spawn(browserBinary, ["--headless=new", "--no-sandbox", "--disable-gpu", `--user-data-dir=${resolve(profile, "chromium")}`, `--remote-debugging-port=${devtoolsPort}`, "about:blank"], {stdio: "ignore"});
    await waitFor(async () => {
        try { return (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).ok; } catch { return false; }
    }, "Chromium CDP");
    cdp = await connect(devtoolsPort);
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true})).result.value;
    const text = () => evaluate("document.body.innerText");
    const click = async (label) => {
        const point = await evaluate(`(() => { const node = [...document.querySelectorAll('button,a,[role=button]')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)} && !item.disabled); if (!node) return undefined; const rect = node.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}; })()`);
        assert.notEqual(point, undefined, `missing rendered control ${label}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
    };

    // Create the representative game through the rendered client, then use
    // the HTTP surface only for deliberately long and conflict-prone work.
    await cdp.send("Page.navigate", {url: `${baseUrl}/#/`});
    await waitFor(async () => (await text()).includes("Design Your Game"), "Studio Home");
    await click("Create game");
    await waitFor(async () => (await text()).includes("Overview"), "created project dashboard", 180_000);
    const context = await (await fetch(`${baseUrl}/api/project/context`)).json();
    assert.equal(context.status, "loaded");
    const projectRoot = context.projectRoot;

    const completed = await post(baseUrl, "/api/project/simulations", {rounds: 20, seed: "durable-browser-terminal"});
    assert.equal(completed.status, 202);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${completed.body.id}`)).json();
        return job.status === "completed";
    }, "retained terminal simulation");
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => (await text()).includes("simulation: completed"), "terminal job reattachment after reload");

    const active = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_000, seed: "durable-browser-active"});
    assert.equal(active.status, 202);
    const conflict = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_001, seed: "durable-browser-conflict"});
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.activeJobId, active.body.id);
    const unconfirmedClose = await post(baseUrl, "/api/projects/close", {});
    assert.equal(unconfirmedClose.status, 409);
    assert.deepEqual(unconfirmedClose.body.operations, ["simulation"]);
    const cancelling = await post(baseUrl, `/api/project/jobs/${active.body.id}/cancel`, {});
    assert.equal(cancelling.status, 202);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${active.body.id}`)).json();
        return job.status === "cancelled";
    }, "cleanup-safe cancellation");

    const switchJob = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_000, seed: "durable-browser-switch"});
    assert.equal(switchJob.status, 202);
    const unconfirmedSwitch = await post(baseUrl, "/api/home/projects/open", {projectRoot});
    assert.equal(unconfirmedSwitch.status, 409);
    assert.deepEqual(unconfirmedSwitch.body.operations, ["simulation"]);
    const confirmedSwitch = await post(baseUrl, "/api/home/projects/open", {projectRoot, confirmActiveJobs: true});
    assert.equal(confirmedSwitch.status, 200);
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => (await text()).includes("simulation: cancelled"), "confirmed switch cancellation result");

    // A process death has no executor left to clean up. The next Studio owns
    // the persisted record, reconciles it to recovery-required, and renders
    // the retained terminal card only after the project is opened again.
    const interrupted = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_000, seed: "durable-browser-restart"});
    assert.equal(interrupted.status, 202);
    await terminate(studio);
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "studio", "--no-open", "--host", "127.0.0.1", "--port", String(studioPort)], {cwd: root, env: environment, stdio: "ignore"});
    await waitFor(async () => {
        try { return (await fetch(`${baseUrl}/api/context`)).ok; } catch { return false; }
    }, "restarted Studio HTTP server");
    const reopened = await post(baseUrl, "/api/home/projects/open", {projectRoot});
    assert.equal(reopened.status, 200);
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => (await text()).includes("simulation: recovery-required"), "restart recovery card");
}

if (hasBrowserArtifacts) {
    try {
        await run();
        console.log("PASS real Chromium Studio durable jobs workflow");
    } finally {
        cdp?.close();
        await terminate(chromium);
        await terminate(studio);
        if (profile !== undefined) await rm(profile, {recursive: true, force: true});
    }
} else {
    // The controller's independent browser pass supplies these compiled
    // artifacts. The bounded source-test correction run deliberately does
    // not build them, so it cannot replace that machine-owned verification.
    console.log("SKIP real Chromium Studio durable jobs workflow: compiled Studio artifacts are unavailable.");
}

if (typeof test === "function") test("runs the real Chromium Studio durable jobs workflow", () => undefined);

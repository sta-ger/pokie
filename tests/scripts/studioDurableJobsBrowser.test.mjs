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
const browserRequirementFailure = !hasBrowserArtifacts
    ? "studioDurableJobsBrowser requires dist/cli/pokie.js and dist/cli/studio-client/index.html; build Studio before running this contract."
    : !existsSync(browserBinary)
        ? `studioDurableJobsBrowser requires Chromium at ${browserBinary}; set CHROMIUM_PATH to a runnable Chromium binary.`
        : undefined;

// The controller runs this standalone contract after it has created the
// compiled Studio bundle.  A missing bundle or Chromium is never a successful
// coverage outcome: the Jest wrapper below fails with the same actionable
// prerequisite diagnostic as direct execution.  Consequently every passing
// result for this contract means the real browser workflow actually ran.

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
    const eventWaiters = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id === undefined) {
            const waiter = eventWaiters.get(response.method)?.shift();
            waiter?.(response);
            return;
        }
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
    const waitForEvent = (method) => new Promise((resolveEvent) => {
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolveEvent);
        eventWaiters.set(method, waiters);
    });
    return {send, waitForEvent, close: () => socket.close()};
}

async function post(baseUrl, pathname, body) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: await response.json()};
}

// A one-million-stop exact space is deliberately large enough that the
// generator reaches an observable cursor before cancellation, while remaining
// small enough for the resumed real-browser contract to finish in a bounded
// test lane.  Keeping the source in this harness also proves that recovery is
// bound to a real, distinct project -- not whichever starter project happens
// to be open when Studio restarts.
function resumableExactBlueprint() {
    const symbols = ["A", "K", "Q", "J"];
    const strip = Array.from({length: 16}, (_unused, index) => symbols[index % symbols.length]);
    return {
        manifest: {id: "durable-browser-exact", name: "Durable Browser Exact", version: "1.0.0"},
        reels: 5,
        rows: 3,
        symbols,
        availableBets: [1],
        paylines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2]],
        paytable: {A: {"3": 10, "4": 20, "5": 40}, K: {"3": 6, "4": 12, "5": 24}, Q: {"3": 4, "4": 8, "5": 16}, J: {"3": 2, "4": 4, "5": 8}},
        reelStrips: [strip, strip, strip, strip, strip],
    };
}

async function run() {
    const studioPort = await freePort();
    const devtoolsPort = await freePort();
    profile = await mkdtemp(resolve(root, "node_modules/.cache/pokie-tmp/studio-durable-browser-"));
    const baseUrl = `http://127.0.0.1:${studioPort}`;
    const environment = {...process.env, HOME: profile, XDG_DATA_HOME: resolve(profile, "data")};
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "--no-open", "--host", "127.0.0.1", "--port", String(studioPort)], {cwd: root, env: environment, stdio: "ignore"});
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
    // Active jobs render JobProgressCard, whose title is the operation (rather
    // than the terminal card's `${operation}: ${status}` title).  A rendered
    // Cancel control is the stable user-visible distinction between those two
    // cards and proves this is an attached, active card rather than an old
    // terminal result with a similarly named operation.
    const hasActiveJobCard = (operation) => evaluate(`(() => [...document.querySelectorAll('[role="alert"]')].some((card) => card.textContent?.includes(${JSON.stringify(operation)}) && [...card.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')))()`);
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
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${active.body.id}`)).json();
        return job.status === "running";
    }, "active durable simulation");
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => await hasActiveJobCard("simulation"), "active job reattachment after reload");
    const conflict = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_001, seed: "durable-browser-conflict"});
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.activeJobId, active.body.id);
    const unconfirmedClose = await post(baseUrl, "/api/projects/close", {});
    assert.equal(unconfirmedClose.status, 409);
    assert.deepEqual([...unconfirmedClose.body.operations], ["simulation"]);
    const cancelling = await post(baseUrl, `/api/project/jobs/${active.body.id}/cancel`, {});
    assert.equal(cancelling.status, 202);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${active.body.id}`)).json();
        return job.status === "cancelled";
    }, "cleanup-safe cancellation");

    const switchJob = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_000, seed: "durable-browser-switch"});
    assert.equal(switchJob.status, 202);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${switchJob.body.id}`)).json();
        return job.status === "running";
    }, "active job before a genuine project switch");

    // Create a separate source without changing the current project.  The
    // subsequent open must be a genuine A -> B transition, not an accidental
    // reopen of A (which would not exercise stale-response isolation).
    const savedSecondProject = await post(baseUrl, "/api/home/blueprints/save-managed", {
        blueprint: resumableExactBlueprint(),
        operationId: "durable-browser-second-project",
    });
    assert.equal(savedSecondProject.status, 201);
    assert.equal(savedSecondProject.body.status, "ok");
    const secondProjectRoot = savedSecondProject.body.path;
    assert.equal(typeof secondProjectRoot, "string");
    assert.notEqual(resolve(secondProjectRoot), resolve(projectRoot));

    // Hold the mounted useProjectJobs discovery response while the server
    // transitions A -> B.  Reloading first causes the hook itself (not a
    // standalone window.fetch) to issue its normal /api/project/jobs request.
    // There is deliberately no reload after releasing this response: React's
    // request-generation guard must reject it in the live switched client.
    await cdp.send("Fetch.enable", {patterns: [{urlPattern: "*://*/api/project/jobs", requestStage: "Response"}]});
    const staleResponsePaused = cdp.waitForEvent("Fetch.requestPaused");
    await cdp.send("Page.reload", {ignoreCache: true});
    const staleResponse = await staleResponsePaused;
    const unconfirmedSwitch = await post(baseUrl, "/api/home/projects/open", {projectRoot: secondProjectRoot});
    assert.equal(unconfirmedSwitch.status, 409);
    assert.deepEqual([...unconfirmedSwitch.body.operations], ["simulation"]);
    const confirmedSwitch = await post(baseUrl, "/api/home/projects/open", {projectRoot: secondProjectRoot, confirmActiveJobs: true});
    assert.equal(confirmedSwitch.status, 200);
    assert(staleResponse.params.request.url.endsWith("/api/project/jobs"), "expected the mounted useProjectJobs list response to be delayed");
    const switchedContext = await (await fetch(`${baseUrl}/api/project/context`)).json();
    assert.equal(switchedContext.projectRoot, secondProjectRoot);
    // Change only the hash so the mounted client keeps its request-generation
    // state. A document navigation here would discard the hook that issued A.
    await evaluate(`window.location.hash = ${JSON.stringify(`/project/${encodeURIComponent(secondProjectRoot)}/overview`)}`);
    await waitFor(async () => (await text()).includes("Overview"), "second project dashboard route");
    await cdp.send("Fetch.continueRequest", {requestId: staleResponse.params.requestId});
    await cdp.send("Fetch.disable");
    await pause(250);
    assert(!(await hasActiveJobCard("simulation")), "a stale project-A list response leaked into the project-B dashboard");

    // The exact token is server-authored and is carried into the start request.
    // Cancellation then leaves the validated checkpoint on disk; it is the
    // only interrupted operation this contract is allowed to resume.
    const exactRequest = {generation: "exact", maxOutcomeSpaceSize: "2000000", libraryId: "durable-browser-resume"};
    const exactEstimate = await post(baseUrl, "/api/project/outcome-libraries/generate/estimate", exactRequest);
    assert.equal(exactEstimate.status, 200);
    assert.equal(exactEstimate.body.status, "ok");
    assert.equal(exactEstimate.body.strategy, "exact");
    const exactStart = await post(baseUrl, "/api/project/outcome-libraries/generate/jobs", {
        ...exactRequest,
        preflightToken: exactEstimate.body.preflightToken,
    });
    assert.equal(exactStart.status, 202);
    const exactJobId = exactStart.body.job.id;
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/outcome-libraries/generate/jobs/${exactJobId}`)).json();
        return job.status === "running" && Number(job.progress?.processedRawIndex ?? 0) > 0;
    }, "observable exact-enumeration progress", 180_000);
    const exactCancelling = await post(baseUrl, `/api/project/outcome-libraries/generate/jobs/${exactJobId}/cancel`, {});
    assert.equal(exactCancelling.status, 200);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/outcome-libraries/generate/jobs/${exactJobId}`)).json();
        return job.status === "cancelled" && job.result?.checkpoint?.id === exactJobId;
    }, "validated exact-enumeration checkpoint", 180_000);

    // A process death has no executor left to clean up. The next Studio owns
    // the persisted records, reconciles the non-resumable simulation to
    // recovery-required, and keeps the independently validated exact
    // checkpoint available for its sole legal resume path.
    const interrupted = await post(baseUrl, "/api/project/simulations", {rounds: 1_000_000, seed: "durable-browser-restart"});
    assert.equal(interrupted.status, 202);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${interrupted.body.id}`)).json();
        return job.status === "running";
    }, "non-resumable job before restart");
    await terminate(studio);
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "--no-open", "--host", "127.0.0.1", "--port", String(studioPort)], {cwd: root, env: environment, stdio: "ignore"});
    await waitFor(async () => {
        try { return (await fetch(`${baseUrl}/api/context`)).ok; } catch { return false; }
    }, "restarted Studio HTTP server");
    const reopened = await post(baseUrl, "/api/home/projects/open", {projectRoot: secondProjectRoot});
    assert.equal(reopened.status, 200);
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => (await text()).includes("simulation: recovery-required"), "restart recovery card");
    await waitFor(async () => (await text()).includes("outcome-library-generation: cancelled") && (await text()).includes("Resume"), "retained exact-checkpoint resume action");
    const exactResume = await post(baseUrl, `/api/project/outcome-libraries/generate/jobs/${exactJobId}/resume`, {});
    assert.equal(exactResume.status, 202);
    assert.equal(exactResume.body.job.id, exactJobId);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/outcome-libraries/generate/jobs/${exactJobId}`)).json();
        return job.status === "completed" && job.result?.status === "ok";
    }, "validated exact-checkpoint resume completion", 180_000);
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => (await text()).includes("outcome-library-generation: completed"), "resumed terminal result reopening");
}

async function execute() {
    try {
        await run();
        console.log("PASS real Chromium Studio durable jobs workflow");
    } finally {
    cdp?.close();
    await terminate(chromium);
    await terminate(studio);
    if (profile !== undefined) await rm(profile, {recursive: true, force: true});
    }
}

if (typeof test === "function") {
    test("runs the real Chromium Studio durable jobs workflow", async () => {
        if (browserRequirementFailure !== undefined) throw new Error(browserRequirementFailure);
        await execute();
    }, 12 * 60_000);
} else {
    if (browserRequirementFailure !== undefined) throw new Error(browserRequirementFailure);
    await execute();
}

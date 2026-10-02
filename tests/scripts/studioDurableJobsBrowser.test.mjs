/**
 * Real Chromium contract for the durable Studio job boundary.  This fixture is
 * intentionally a standalone Node test: it drives the compiled Studio client
 * through CDP while using the real Studio HTTP API for long-running setup and
 * observation.  No jsdom state, mocked fetch, or in-memory server is involved.
 *
 * The controller supplies the normal CLI/client build. This bounded contract
 * consumes those artifacts without building or packaging a candidate; the
 * packed whole-file persona proof remains controller-owned.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import {createServer} from "node:net";
import {createServer as createHttpServer} from "node:http";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket, {WebSocketServer} from "ws";
import {connectP805Devtools, createP805RenderedGame, observeP805CreatorValidation, p805CreateControlExpression as createControlExpression,
    waitForP805CreateValidation, waitForP805CreatedDashboard as waitForCreatedDashboard} from "../../scripts/p8-05-valera-browser-audit.mjs";

const waitForCreateValidation = (evaluate, timeout) => waitForP805CreateValidation(evaluate, timeout);
const createRenderedGame = (evaluate, send, observations, timeout) => createP805RenderedGame({send}, evaluate, observations, timeout);

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
        const observation = await predicate();
        if (observation) return observation;
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}.`);
        await pause(100);
    }
}

async function terminate(child) {
    if (child === undefined || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
}

async function terminateAbruptly(child) {
    if (child === undefined || child.exitCode !== null || child.killed) return;
    child.kill("SIGKILL");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
    assert.equal(child.signalCode, "SIGKILL", "restart recovery requires an abrupt Studio loss");
}

async function closeChromium() {
    // Chromium owns profile writers below its browser process.  Asking the
    // browser to close through CDP lets it drain those writers before the
    // per-run profile is removed; SIGTERM alone can report the launcher dead
    // while a profile descendant is still finishing its final write.
    if (cdp !== undefined) {
        try {
            await cdp.send("Browser.close");
        } catch {
            // The browser may already have exited after a failed workflow.
        }
    }
    await terminate(chromium);
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
    const events = [];
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id === undefined) {
            events.push(response);
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
    await send("Network.enable");
    const waitForEvent = (method) => new Promise((resolveEvent) => {
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolveEvent);
        eventWaiters.set(method, waiters);
    });
    return {send, events, waitForEvent, close: () => socket.close()};
}

// The packed runner passes a live initialUrl to the production collector.
// Issue validation directly from the first document script, with no debounce
// or response delay: attaching Network after navigation must fail this proof.
async function assertImmediateStartupValidation(devtoolsPort) {
    const requests = [];
    let finishSave;
    const server = createHttpServer((request, response) => {
        requests.push(request.url);
        if (request.url === "/api/home/blueprints/validate") {
            response.writeHead(200, {"Content-Type": "application/json"});
            response.end('{"status":"ok","warnings":[]}');
        } else if (request.url === "/api/home/blueprints/save-managed") {
            finishSave = () => {
                response.writeHead(201, {"Content-Type": "application/json"});
                response.end('{"status":"ok"}');
            };
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><button id="blueprint-create-game" data-pokie-validation-state="loading" disabled aria-busy="true">Create game</button><div data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="loading"></div><script>
                const button = document.querySelector('button');
                window.clicks = [];
                button.onclick = async (event) => {
                    window.clicks.push(event.isTrusted);
                    button.disabled = true;
                    button.setAttribute('aria-busy', 'true');
                    await fetch('/api/home/blueprints/save-managed', {method: 'POST', body: '{}'});
                    location.hash = '/project/' + (location.pathname === '/switch' ? 'second' : 'first') + '/overview';
                    button.remove();
                    const result = document.querySelector('div');
                    result.textContent = 'Overview';
                    result.dataset.pokieLifecycleTerminal = 'rendered';
                };
                fetch('/api/home/blueprints/validate', {method: 'POST', body: '{}'}).then(response => response.json()).then(result => {
                    button.dataset.pokieValidationState = result.status;
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                });
            </script>`);
        }
    });
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    let connection;
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        // The sibling default-url caller must receive the same settled, instrumented blank
        // target before it owns navigation. No automatic validation may precede that handoff.
        connection = await connectP805Devtools(`http://127.0.0.1:${devtoolsPort}`);
        const blank = await connection.send("Runtime.evaluate", {expression: "({url: location.href, state: document.readyState})", returnByValue: true});
        assert.deepEqual(blank.result.value, {url: "about:blank", state: "complete"});
        assert.equal(requests.length, 0);
        await connection.send("Page.close");
        await connection.close();
        connection = await connectP805Devtools(`http://127.0.0.1:${devtoolsPort}`, `${origin}/#/home/design`);
        const evaluate = async (expression) => {
            const result = await connection.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        const validationIds = [];
        for (const phase of ["first", "second"]) {
            const cursor = phase === "first" ? 0 : connection.events.length;
            if (phase === "second") await connection.send("Page.navigate", {url: `${origin}/switch#/home/design`});
            const observations = [];
            finishSave = undefined;
            const creating = createP805RenderedGame(connection, evaluate, observations, 10_000,
                (requestId) => connection.send("Network.getResponseBody", {requestId}), 10_000);
            let created;
            try {
                await waitFor(() => finishSave !== undefined, "one immediate-validation authorized save", 10_000);
                const busy = await evaluate(createControlExpression);
                assert.equal(busy.validationState, "ok");
                assert.equal(busy.enabled, false);
                assert.equal(busy.ariaBusy, "true");
                const rejectedObservations = [];
                await assert.rejects(createP805RenderedGame(connection, evaluate, rejectedObservations, 0,
                    (requestId) => connection.send("Network.getResponseBody", {requestId})), /validation proof: .*dom-unready/);
                assert.deepEqual(rejectedObservations, [], "busy Create must not accept another readiness or pointer receipt");
            } finally {
                finishSave?.();
                created = await creating;
            }
            validationIds.push(created.validation.browserRequestId);
            const events = connection.events.slice(cursor);
            assert.deepEqual(events.filter((event) => event.params.requestId === created.validation.browserRequestId).map((event) => event.method),
                ["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"]);
            assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch", "dashboard-transition"]);
            assert.equal(created.validation.completed, true);
            assert.deepEqual(created.validation.payload, {status: "ok", warnings: []});
            assert.match(created.validation.bodySha256, /^[a-f0-9]{64}$/);
            assert.equal(observations[0].validation.browserRequestId, created.validation.browserRequestId);
            assert.equal(observations[0].validationState, "ok");
            assert.equal(observations[0].enabled, true);
            assert.equal(observations[0].ariaBusy, null);
            assert.equal(created.activation.count, 1);
            assert.equal(created.activation.dispatch.pressed && created.activation.dispatch.released, true);
            assert.equal(created.activation.dispatch.focus.trusted, true);
            assert.equal(created.activation.dispatch.focus.validationState, "ok");
            assert.equal(created.dashboard.route, `#/project/${phase}/overview`);
            assert.equal(created.dashboard.terminal, "rendered");
            assert.deepEqual(await evaluate("window.clicks"), [true]);
            assert.equal(events.filter((event) => event.method === "Network.requestWillBeSent"
                && new URL(event.params.request.url).pathname === "/api/home/blueprints/save-managed").length, 1);
        }
        assert.notEqual(validationIds[0], validationIds[1]);
        assert.equal(requests.filter((url) => url === "/api/home/blueprints/validate").length, 2);
        console.log("PASS production initialUrl immediate validation and project switching each authorize one native Create and Overview");
    } finally {
        // Closing the target prevents its fixture page from participating in
        // the subsequent durable Studio workflow; Chromium remains owned by
        // execute() and is drained by its existing finally block.
        if (connection) {
            try { await connection.send("Page.close"); } finally { await connection.close(); }
        }
        await new Promise((resolveClose) => server.close(resolveClose));
    }
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
    await assertImmediateStartupValidation(devtoolsPort);
    // Cover the same production initialUrl path against the real Studio
    // bundle too, before the intercepted loading/invalid workflow below.
    cdp = await connectP805Devtools(`http://127.0.0.1:${devtoolsPort}`, `${baseUrl}/#/home/design`);
    const startupEvaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const startup = await waitForP805CreateValidation(startupEvaluate, 90_000,
        (diagnostics) => observeP805CreatorValidation(cdp, startupEvaluate, (requestId) => cdp.send("Network.getResponseBody", {requestId}), diagnostics));
    assert.equal(startup.proof.validation.completed, true);
    assert.deepEqual(cdp.events.filter((event) => event.params.requestId === startup.proof.validation.browserRequestId).map((event) => event.method),
        ["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"]);
    await cdp.send("Page.close");
    await cdp.close();
    cdp = await connect(devtoolsPort);
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true})).result.value;
    // CDP can observe the just-created target before its initial about:blank
    // document has a body.  Treat that transient render state as an empty
    // screen and let the existing bounded public-page wait retry it.
    const text = async () => (await evaluate("document.body?.innerText")) ?? "";
    // Active jobs render JobProgressCard, whose title is the operation (rather
    // than the terminal card's `${operation}: ${status}` title).  A rendered
    // Cancel control is the stable user-visible distinction between those two
    // cards and proves this is an attached, active card rather than an old
    // terminal result with a similarly named operation.
    const hasActiveJobCard = (operation) => evaluate(`(() => [...document.querySelectorAll('[role="status"]')].some((card) => card.textContent?.includes(${JSON.stringify(operation)}) && [...card.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Cancel')))()`);
    // Terminal cards deliberately use the product's human-readable status
    // title ("simulation · Completed"), rather than a transport-oriented
    // `operation: status` string.  Match the rendered title so this browser
    // contract verifies the user-visible reattachment boundary instead of a
    // stale internal presentation convention.
    const hasTerminalJobCard = (operation, status) => evaluate(`(() => [...document.querySelectorAll('.studio-job-card')].some((card) => card.getAttribute('role') === 'status' && card.textContent?.includes(${JSON.stringify(`${operation} · ${status}`)})))()`);
    // Hold the real automatic validation response to exercise the loading
    // boundary deterministically. Neither this nor an invalid design may
    // dispatch a Create pointer, even though the label is already rendered.
    await cdp.send("Fetch.enable", {patterns: [{urlPattern: "*://*/api/home/blueprints/validate", requestStage: "Response"}]});
    const validationPaused = cdp.waitForEvent("Fetch.requestPaused");
    await cdp.send("Page.navigate", {url: `${baseUrl}/#/`});
    await waitFor(async () => (await text()).includes("Design Your Game"), "Studio Home");
    await evaluate(`(() => {
        window.__durableCreateClicks = [];
        document.addEventListener('click', (event) => {
            const control = document.getElementById('blueprint-create-game');
            if (control && (event.target === control || control.contains(event.target))) {
                window.__durableCreateClicks.push({controlId: control.id, trusted: event.isTrusted,
                    validationState: control.getAttribute('data-pokie-validation-state')});
            }
        }, true);
    })()`);
    const heldValidation = await validationPaused;
    await waitFor(async () => (await evaluate(createControlExpression))?.validationState === "loading", "rendered loading Create validation");
    const assertNoCreateActivation = async (state) => {
        const observations = [];
        await assert.rejects(createRenderedGame(evaluate, () => assert.fail(`${state} validation dispatched a pointer`), observations, 200),
            (error) => error.message.includes("Missing rendered Create game validation-ready boundary")
                && error.message.includes(`"validationState":"${state}"`) && error.message.includes(`"phase":"validation-${state}"`));
        assert.deepEqual(observations, [], `${state} validation must not record readiness or pointer dispatch`);
        const blockedControl = await evaluate(createControlExpression);
        assert.equal(blockedControl.enabled, false);
        assert.equal(blockedControl.validationGuidance.visible, true, `${state} must reference visible validation guidance`);
        assert.deepEqual(blockedControl.validationGuidance.ids, ["blueprint-create-game-validation"]);
        if (state === "invalid") {
            assert.match(blockedControl.validationGuidance.text, /Fix the highlighted design errors before creating your game/);
        } else {
            assert.match(blockedControl.validationGuidance.text, /checking this game design automatically/);
        }
        // Exercise the disabled product control as well as the runner's
        // refusal. A trusted browser gesture must not reach its click handler
        // or emit a managed-save request while validation is loading/invalid.
        const point = await evaluate(`(() => {
            const control = document.getElementById('blueprint-create-game');
            if (!(control instanceof HTMLButtonElement) || !control.disabled) return null;
            control.scrollIntoView({block: 'center'});
            const rect = control.getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            return {x, y, hit: hit === control || control.contains(hit)};
        })()`);
        assert.equal(point?.hit, true, `${state} native attempt must hit the real disabled Create control`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x, y: point.y, pointerType: "mouse"});
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, pointerType: "mouse", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, pointerType: "mouse", clickCount: 1});
        assert.deepEqual(await evaluate("window.__durableCreateClicks"), [], `${state} must suppress the native click handler`);
        assert.equal(cdp.events.filter((event) => event.method === "Network.requestWillBeSent"
            && event.params.request.method === "POST" && new URL(event.params.request.url).pathname === "/api/home/blueprints/save-managed").length, 0,
        `${state} native attempt must not save a managed game`);
        assert.equal(await evaluate("location.hash"), "#/home/design", `${state} validation must retain the editor`);
        assert.equal((await (await fetch(`${baseUrl}/api/project/context`)).json()).status, "empty", `${state} validation must not open a project`);
        console.log(`PASS rendered ${state} validation prevents Create game pointer activation`);
    };
    await assertNoCreateActivation("loading");
    await cdp.send("Fetch.continueRequest", {requestId: heldValidation.params.requestId});
    await cdp.send("Fetch.disable");
    await waitForCreateValidation(evaluate);

    const focusGameName = () => evaluate(`(() => {
        const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.trim() === 'Game name');
        const input = label && document.getElementById(label.htmlFor);
        if (!(input instanceof HTMLInputElement)) return null;
        input.focus(); input.select(); return {value: input.value, focused: document.activeElement === input};
    })()`);
    const gameName = await focusGameName();
    assert.equal(gameName?.focused, true, "Game name must be the real focused editor input");
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8});
    await waitFor(async () => (await evaluate(createControlExpression))?.validationState === "invalid", "rendered invalid Game name validation");
    await assertNoCreateActivation("invalid");
    assert.equal((await focusGameName())?.focused, true);
    await cdp.send("Input.insertText", {text: gameName.value});

    // Create through the rendered client exactly once, then use the HTTP
    // surface only for deliberately long and conflict-prone durable work.
    const creationObservations = [];
    try {
        await createP805RenderedGame(cdp, evaluate, creationObservations, 90_000,
            (requestId) => cdp.send("Network.getResponseBody", {requestId}));
    } finally {
        for (const observation of creationObservations) console.log(`Create game ${observation.kind}: ${JSON.stringify(observation)}`);
    }
    assert.deepEqual(creationObservations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch", "dashboard-transition"]);
    assert.equal(creationObservations[0].validation.completed, true);
    const managedSaves = cdp.events.filter((event) => event.method === "Network.requestWillBeSent"
        && event.params.request.method === "POST" && new URL(event.params.request.url).pathname === "/api/home/blueprints/save-managed");
    assert.equal(managedSaves.length, 1, "one rendered Create pointer must cause exactly one browser managed-save request");
    assert.equal(creationObservations[1].count, 1);
    assert.equal(creationObservations[1].pressed && creationObservations[1].released, true);
    assert.equal(creationObservations[1].capturedControlId, "blueprint-create-game");
    assert.equal(creationObservations[1].preDispatchFocus.native, true);
    assert.equal(creationObservations[1].hitTest.matchesCapturedControl, true);
    assert.equal(creationObservations[1].nativeDispatch.focus.targetMatchesCapturedControl, true);
    assert.equal(creationObservations[1].nativeDispatch.focus.trusted, true);
    assert.equal(creationObservations[1].nativeDispatch.focus.validationState, "ok");
    assert.equal(creationObservations[1].nativeDispatch.focus.enabled, true);
    assert([null, "false"].includes(creationObservations[1].nativeDispatch.focus.ariaBusy));
    assert.deepEqual(await evaluate("window.__durableCreateClicks"), [{controlId: "blueprint-create-game", trusted: true, validationState: "ok"}],
        "only the terminal validated control may receive the single native Create click");
    assert(creationObservations[0].observedAt <= creationObservations[1].dispatchedAt && creationObservations[1].dispatchedAt <= creationObservations[2].observedAt,
        "validation readiness, native pointer dispatch, and rendered dashboard must be observed in order");
    const context = await (await fetch(`${baseUrl}/api/project/context`)).json();
    assert.equal(context.status, "loaded");
    const projectRoot = context.projectRoot;
    assert.equal(decodeURIComponent(creationObservations[2].route.split("/")[2]), projectRoot,
        "the rendered Overview must belong to the created durable workspace");
    assert.equal(creationObservations[2].terminal, "rendered");
    assert.equal(creationObservations[2].visible, true);

    const completed = await post(baseUrl, "/api/project/simulations", {rounds: 20, seed: "durable-browser-terminal"});
    assert.equal(completed.status, 202);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/jobs/${completed.body.id}`)).json();
        return job.status === "completed";
    }, "retained terminal simulation");
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => await hasTerminalJobCard("simulation", "Completed"), "terminal job reattachment after reload");

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
    // "Overview" is already rendered for project A, so it cannot establish
    // that the route/hook has actually switched.  The second source has a
    // deliberately distinct manifest name; wait for that rendered identity
    // before allowing the held A list response through.
    await waitFor(async () => (await text()).includes("Durable Browser Exact"), "project-B dashboard identity");
    await cdp.send("Fetch.continueRequest", {requestId: staleResponse.params.requestId});
    await cdp.send("Fetch.disable");
    await pause(250);
    assert(!(await hasActiveJobCard("simulation")), "a stale project-A list response leaked into the project-B dashboard without a reload");

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
    await terminateAbruptly(studio);
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "--no-open", "--host", "127.0.0.1", "--port", String(studioPort)], {cwd: root, env: environment, stdio: "ignore"});
    await waitFor(async () => {
        try { return (await fetch(`${baseUrl}/api/context`)).ok; } catch { return false; }
    }, "restarted Studio HTTP server");
    const reopened = await post(baseUrl, "/api/home/projects/open", {projectRoot: secondProjectRoot});
    assert.equal(reopened.status, 200);
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => await hasTerminalJobCard("simulation", "Recovery required"), "restart recovery card");
    await waitFor(async () => await hasTerminalJobCard("outcome-library-generation", "Cancelled") && (await text()).includes("Resume"), "retained exact-checkpoint resume action");
    const exactResume = await post(baseUrl, `/api/project/outcome-libraries/generate/jobs/${exactJobId}/resume`, {});
    assert.equal(exactResume.status, 202);
    assert.equal(exactResume.body.job.id, exactJobId);
    await waitFor(async () => {
        const job = await (await fetch(`${baseUrl}/api/project/outcome-libraries/generate/jobs/${exactJobId}`)).json();
        return job.status === "completed" && job.result?.status === "ok";
    }, "validated exact-checkpoint resume completion", 180_000);
    await cdp.send("Page.reload", {ignoreCache: true});
    await waitFor(async () => await hasTerminalJobCard("outcome-library-generation", "Completed"), "resumed terminal result reopening");
}

async function execute() {
    try {
        await run();
        console.log("PASS real Chromium Studio durable jobs workflow");
    } finally {
        await closeChromium();
        cdp?.close();
        await terminate(studio);
        if (profile !== undefined) {
            await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
            assert.equal(existsSync(profile), false, "the complete owned Studio/Chromium profile tree must be removed");
        }
    }
}

if (typeof test === "function") {
    test("production initialUrl captures validation completed before the navigation acknowledgement", async () => {
        const commands = [], targets = [];
        const url = "http://localhost/#/home/design";
        const requestId = "immediate-startup-validation";
        const server = createHttpServer((request, response) => {
            targets.push(decodeURIComponent(request.url.split("?")[1]));
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}`}));
        });
        const sockets = new WebSocketServer({server});
        sockets.on("connection", (socket) => socket.on("message", (raw) => {
            const command = JSON.parse(raw.toString());
            commands.push(command.method);
            if (command.method === "Page.navigate") {
                assert.equal(command.params.url, url);
                assert.deepEqual(commands.slice(0, -1), ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable", "Runtime.evaluate"]);
                for (const event of [
                    {method: "Network.requestWillBeSent", params: {requestId, request: {method: "POST", url: "http://localhost/api/home/blueprints/validate"}}},
                    {method: "Network.responseReceived", params: {requestId, response: {status: 200, url: "http://localhost/api/home/blueprints/validate"}}},
                    {method: "Network.loadingFinished", params: {requestId}},
                ]) socket.send(JSON.stringify(event));
            }
            const result = command.method === "Runtime.evaluate" ? {result: {value: true}}
                : command.method === "Network.getResponseBody" ? {body: '{"status":"ok","warnings":[]}'} : {};
            socket.send(JSON.stringify({id: command.id, result}));
        }));
        await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
        let connection;
        try {
            connection = await connectP805Devtools(`http://127.0.0.1:${server.address().port}`, url);
            assert.deepEqual(targets, ["about:blank"]);
            assert.deepEqual(connection.events.map((event) => event.method),
                ["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"]);
            const proof = await observeP805CreatorValidation(connection, async () => ({stableControlId: "blueprint-create-game", validationState: "ok"}),
                (id) => connection.send("Network.getResponseBody", {requestId: id}));
            assert.equal(proof.validation.browserRequestId, requestId);
            assert.equal(proof.validation.completed, true);
            assert.deepEqual(proof.validation.payload, {status: "ok", warnings: []});
        } finally {
            await connection?.close();
            for (const client of sockets.clients) client.terminate();
            await new Promise((resolveClose) => sockets.close(resolveClose));
            await new Promise((resolveClose) => server.close(resolveClose));
        }
    });
    test("failed domain instrumentation cannot navigate Studio, and startup diagnostics retain navigation failure", async () => {
        for (const failedPhase of ["Network.enable", "Page.navigate"]) {
            const commands = [], targets = [];
            const server = createHttpServer((request, response) => {
                targets.push(decodeURIComponent(request.url.split("?")[1]));
                response.setHeader("Content-Type", "application/json");
                response.end(JSON.stringify({webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}`}));
            });
            const sockets = new WebSocketServer({server});
            let disconnected;
            const closed = new Promise((resolveClose) => { disconnected = resolveClose; });
            sockets.on("connection", (socket) => {
                socket.once("close", disconnected);
                socket.on("message", (raw) => {
                    const command = JSON.parse(raw.toString());
                    commands.push(command.method);
                    if (command.method === failedPhase && failedPhase === "Network.enable") {
                        socket.send(JSON.stringify({id: command.id, error: {message: "Network instrumentation unavailable"}}));
                    } else {
                        const result = command.method === "Runtime.evaluate" ? {result: {value: true}}
                            : command.method === "Page.navigate" ? {errorText: "net::ERR_CONNECTION_REFUSED"} : {};
                        socket.send(JSON.stringify({id: command.id, result}));
                    }
                });
            });
            await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
            try {
                await assert.rejects(connectP805Devtools(`http://127.0.0.1:${server.address().port}`, "http://localhost/#/home/design"), (error) => {
                    assert.match(error.message, failedPhase === "Network.enable"
                        ? /enabling-event-domains.*Network instrumentation unavailable/
                        : /navigating-instrumented-Studio-target.*net::ERR_CONNECTION_REFUSED/);
                    assert(error.cause instanceof Error);
                    return true;
                });
                await closed;
                assert.deepEqual(targets, ["about:blank"]);
                assert.deepEqual(commands, failedPhase === "Network.enable"
                    ? ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]
                    : ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable", "Runtime.evaluate", "Page.navigate"]);
            } finally {
                for (const client of sockets.clients) client.terminate();
                await new Promise((resolveClose) => sockets.close(resolveClose));
                await new Promise((resolveClose) => server.close(resolveClose));
            }
        }
    });
    test("distinguishes missing validation readiness from a failed post-click dashboard transition", async () => {
        await assert.rejects(waitForCreateValidation(async () => null, 0), /validation proof: .*dom-unready/);
        await assert.rejects(waitForCreatedDashboard(async () => ({route: "#/home/design", overview: false}), 0), /Failed post-click Create game Overview\/dashboard transition/);
        await assert.rejects(waitForCreatedDashboard(async () => { throw new Error("DevTools evaluation disconnected"); }, 0),
            /Failed post-click Create game Overview\/dashboard transition.*reason: DevTools evaluation disconnected/);
        for (const terminal of [null, "loading", "error"]) {
            await assert.rejects(waitForCreatedDashboard(async () => ({route: "#/project/starter/overview", overview: true, visible: true, terminal}), 0),
                /Failed post-click Create game Overview\/dashboard transition/);
        }
        const rendered = {route: "#/project/starter/overview", overview: true, visible: true, terminal: "rendered"};
        assert.deepEqual(await waitForCreatedDashboard(async () => rendered, 0), rendered);
    });
    test("Create diagnostics retain the missing network boundary and underlying validation-proof failure without pointer dispatch", async () => {
        const ready = {controlId: "blueprint-create-game", accessibleName: "Create game", validationState: "ok", enabled: true, visible: true, ariaBusy: null};
        const request = {method: "Network.requestWillBeSent", params: {requestId: "validation", request: {method: "POST", url: "http://localhost/api/home/blueprints/validate"}}};
        const response = {method: "Network.responseReceived", params: {requestId: "validation", response: {status: 200, url: request.params.request.url}}};
        const completion = {method: "Network.loadingFinished", params: {requestId: "validation"}};
        const failed = {method: "Network.loadingFailed", params: {requestId: "validation", errorText: "net::ERR_ABORTED"}};
        for (const [events, phase, reason, readBody] of [
            [[], "missing-request", "Timed out", () => assert.fail("no request body")],
            [[request], "missing-response", "Timed out", () => assert.fail("no response body")],
            [[request, response], "missing-completion", "Timed out", () => assert.fail("incomplete response body")],
            [[request, failed], "loading-failed", "net::ERR_ABORTED", () => assert.fail("failed response body")],
            [[request, response, completion], "unreadable-response-body", "DevTools body unavailable", () => { throw new Error("DevTools body unavailable"); }],
            [[request, response, completion], "unreadable-response-body", "Unexpected token", () => ({body: "invalid json"})],
            [[request, response, completion], "rejected-response", "status invalid", () => ({body: '{"status":"invalid"}'})],
        ]) {
            const observations = [];
            await assert.rejects(createP805RenderedGame({events, send: () => assert.fail("missing validation proof dispatched a pointer")},
                async () => ready, observations, 0, readBody), (error) => {
                assert.match(error.message, /Missing rendered Create game validation-ready boundary/);
                assert(error.message.includes(phase), `serialized diagnostic must identify ${phase}`);
                assert(error.message.includes(reason), `serialized diagnostic must retain ${reason}`);
                assert(error.cause instanceof Error);
                return true;
            });
            assert.deepEqual(observations, [], "missing network proof must not create an accepted readiness receipt");
        }
    });
    test("validation readiness is re-read after the network observation yields to a newer render", async () => {
        const ready = {controlId: "blueprint-create-game", accessibleName: "Create game", validationState: "ok", enabled: true, visible: true, ariaBusy: null};
        for (const validationState of ["loading", "invalid", "stale"]) {
            let current = ready;
            await assert.rejects(waitForP805CreateValidation(async () => current, 0, () => {
                current = {...ready, validationState, enabled: false};
                return {validation: {completed: true}};
            }), (error) => error.message.includes("invalidatedControl")
                && error.message.includes(`"validationState":"${validationState}"`));
        }
        let reads = 0;
        const result = await waitForP805CreateValidation(async () => ++reads === 1 ? {...ready, ariaBusy: "false"} : ready, 0);
        assert.equal(reads, 2);
        assert.equal(result.control.ariaBusy, null, "the receipt must contain the final DOM observation");
    });
    test("an obsolete body cannot fail or authorize the newer validation proof", async () => {
        const request = (requestId) => ({method: "Network.requestWillBeSent", params: {requestId, request: {method: "POST", url: "http://localhost/api/home/blueprints/validate"}}});
        const completed = (requestId) => [request(requestId),
            {method: "Network.responseReceived", params: {requestId, response: {status: 200, url: "http://localhost/api/home/blueprints/validate"}}},
            {method: "Network.loadingFinished", params: {requestId}}];
        for (const oldBody of [() => ({body: '{"status":"invalid"}'}), () => ({body: "invalid json"}), () => { throw new Error("obsolete body evicted"); }]) {
            const connection = {events: completed("old")};
            const diagnostics = {};
            assert.equal(await observeP805CreatorValidation(connection, () => assert.fail("superseded body must not focus Create"), () => {
                connection.events.push(request("current"));
                return oldBody();
            }, diagnostics), false);
            assert.equal(diagnostics.phase, "superseded-validation");
            assert.equal(await observeP805CreatorValidation(connection, () => assert.fail("incomplete validation must not focus Create"),
                () => assert.fail("incomplete body must not be read"), diagnostics), false);
            assert.equal(diagnostics.phase, "missing-response");
            connection.events.push(...completed("current").slice(1));
            const proof = await observeP805CreatorValidation(connection, async () => ({stableControlId: "blueprint-create-game", validationState: "ok"}),
                async () => ({body: '{"status":"ok"}'}), diagnostics);
            assert.equal(proof.validation.browserRequestId, "current");
            assert.equal(diagnostics.phase, "ready");
        }
    });
    test("a validation superseded during pointer preparation cannot authorize Create", async () => {
        const ready = {controlId: "blueprint-create-game", accessibleName: "Create game", validationState: "ok", enabled: true, visible: true, ariaBusy: null};
        const request = (requestId) => ({method: "Network.requestWillBeSent", params: {requestId, request: {method: "POST", url: "http://localhost/api/home/blueprints/validate"}}});
        const connection = {events: [request("first"),
            {method: "Network.responseReceived", params: {requestId: "first", response: {status: 200, url: "http://localhost/api/home/blueprints/validate"}}},
            {method: "Network.loadingFinished", params: {requestId: "first"}}],
        send: async (method, params) => {
            if (method === "Input.dispatchMouseEvent") {
                assert.equal(params.type, "mouseMoved", "a superseded proof must not dispatch a pointer press or release");
                connection.events.push(request("superseding"));
            }
        }};
        const evaluate = async (expression) => {
            if (expression === createControlExpression) return ready;
            if (expression.includes("document.readyState")) return {stableControlId: ready.controlId, validationState: "ok"};
            if (expression.includes("getBoundingClientRect")) return {x: 10, y: 10, capturedControlId: ready.controlId,
                captureKey: "captured", preDispatchFocus: {controlId: ready.controlId, native: true},
                hitTest: {capturedControlId: ready.controlId, matchesCapturedControl: true}};
        };
        const observations = [];
        await assert.rejects(createP805RenderedGame(connection, evaluate, observations, 0,
            async () => ({body: '{"status":"ok"}'})), /superseded-validation; validated request: first; latest request: superseding/);
        assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready"]);
    });
    test("ready validation cannot authorize a disabled or aria-busy Create control", async () => {
        const ready = {controlId: "blueprint-create-game", accessibleName: "Create game", validationState: "ok", enabled: true, visible: true, ariaBusy: null};
        for (const blocked of [{...ready, enabled: false}, {...ready, ariaBusy: "true"}, {...ready, visible: false},
            ...["idle", "loading", "invalid", "stale", "error"].map((validationState) => ({...ready, validationState}))]) {
            const observations = [];
            await assert.rejects(createRenderedGame(async () => blocked, () => assert.fail("blocked control dispatched a pointer"), observations, 0), (error) => {
                assert.match(error.message, /Missing rendered Create game validation-ready boundary/);
                const phase = ["idle", "loading", "invalid", "stale", "error"].includes(blocked.validationState)
                    ? `validation-${blocked.validationState}` : "dom-unready";
                assert(error.message.includes(`"phase":"${phase}"`), `diagnostic must distinguish ${phase}`);
                return true;
            });
            assert.deepEqual(observations, []);
        }
        const observations = [];
        let reads = 0;
        await assert.rejects(createRenderedGame(async () => ++reads <= 2 ? ready : {...ready, validationState: "loading"},
            () => assert.fail("a stale readiness observation dispatched a pointer"), observations, 0), /validation-ready boundary before pointer dispatch/);
        assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready"]);
    });
    test("runs the real Chromium Studio durable jobs workflow", async () => {
        if (browserRequirementFailure !== undefined) throw new Error(browserRequirementFailure);
        await execute();
    }, 12 * 60_000);
} else {
    if (browserRequirementFailure !== undefined) throw new Error(browserRequirementFailure);
    await execute();
}

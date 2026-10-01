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
        const observation = await predicate();
        if (observation) return observation;
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}.`);
        await pause(100);
    }
}

// The label is already rendered during the initial debounce. Only the real
// primary control's terminal validation state can authorize its activation.
const createControlExpression = `(() => {
    const control = document.getElementById('blueprint-create-game');
    if (!(control instanceof HTMLButtonElement)) return null;
    const rect = control.getBoundingClientRect();
    return {controlId: control.id, accessibleName: control.textContent?.trim(),
        validationState: control.getAttribute('data-pokie-validation-state'),
        enabled: !control.disabled, ariaBusy: control.getAttribute('aria-busy'),
        visible: control.getClientRects().length > 0 && rect.width > 0 && rect.height > 0,
        point: {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}};
})()`;

const isCreateValidationReady = (control) => control?.controlId === "blueprint-create-game"
    && control.accessibleName === "Create game" && control.validationState === "ok"
    && control.enabled && control.visible && (control.ariaBusy === null || control.ariaBusy === "false");

async function waitForCreateValidation(evaluate, timeout = 90_000) {
    let control;
    try {
        return await waitFor(async () => {
            control = await evaluate(createControlExpression);
            return isCreateValidationReady(control) ? control : false;
        }, "rendered Create game validation-ready boundary", timeout);
    } catch (error) {
        throw new Error(`Missing rendered Create game validation-ready boundary; control: ${JSON.stringify(control)}`, {cause: error});
    }
}

async function waitForCreatedDashboard(evaluate, timeout = 180_000) {
    let dashboard;
    try {
        return await waitFor(async () => {
            dashboard = await evaluate("({route: location.hash, overview: document.body?.innerText.includes('Overview') ?? false})");
            return /^#\/project\/[^/]+\/overview$/.test(dashboard?.route ?? "") && dashboard.overview ? dashboard : false;
        }, "created project Overview/dashboard transition", timeout);
    } catch (error) {
        throw new Error(`Failed post-click Create game Overview/dashboard transition; rendered: ${JSON.stringify(dashboard)}`, {cause: error});
    }
}

async function createRenderedGame(evaluate, send, observations, validationTimeout = 90_000) {
    const control = await waitForCreateValidation(evaluate, validationTimeout);
    observations.push({kind: "validation-ready", observedAt: Date.now(), ...control});
    // Recheck after scrolling, immediately before dispatch. A newer render
    // must not borrow an earlier ok observation to authorize a busy control.
    await evaluate("document.getElementById('blueprint-create-game').scrollIntoView({block: 'center'})");
    const dispatchControl = await evaluate(createControlExpression);
    assert.ok(isCreateValidationReady(dispatchControl), `Missing rendered Create game validation-ready boundary before pointer dispatch; control: ${JSON.stringify(dispatchControl)}`);
    const {x, y} = dispatchControl.point;
    const hitControlId = await evaluate(`(() => { const hit = document.elementFromPoint(${x}, ${y}); return hit?.closest('button')?.id; })()`);
    assert.equal(hitControlId, control.controlId, "rendered Create game pointer must hit its native DOM identity");
    const dispatch = {kind: "pointer-dispatch", controlId: control.controlId, dispatchedAt: Date.now(), count: 1, x, y, pressed: false, released: false};
    observations.push(dispatch);
    await send("Input.dispatchMouseEvent", {type: "mousePressed", x, y, button: "left", clickCount: 1});
    dispatch.pressed = true;
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x, y, button: "left", clickCount: 1});
    dispatch.released = true;
    const dashboard = await waitForCreatedDashboard(evaluate);
    observations.push({kind: "dashboard-transition", observedAt: Date.now(), ...dashboard});
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
    const heldValidation = await validationPaused;
    await waitFor(async () => (await evaluate(createControlExpression))?.validationState === "loading", "rendered loading Create validation");
    const assertNoCreateActivation = async (state) => {
        const observations = [];
        await assert.rejects(createRenderedGame(evaluate, () => assert.fail(`${state} validation dispatched a pointer`), observations, 200),
            (error) => error.message.includes("Missing rendered Create game validation-ready boundary") && error.message.includes(`"validationState":"${state}"`));
        assert.deepEqual(observations, [], `${state} validation must not record readiness or pointer dispatch`);
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
        await createRenderedGame(evaluate, cdp.send, creationObservations);
    } finally {
        for (const observation of creationObservations) console.log(`Create game ${observation.kind}: ${JSON.stringify(observation)}`);
    }
    assert.deepEqual(creationObservations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch", "dashboard-transition"]);
    assert.equal(creationObservations[1].count, 1);
    assert.equal(creationObservations[1].pressed && creationObservations[1].released, true);
    assert(creationObservations[0].observedAt <= creationObservations[1].dispatchedAt && creationObservations[1].dispatchedAt <= creationObservations[2].observedAt,
        "validation readiness, native pointer dispatch, and rendered dashboard must be observed in order");
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
    test("distinguishes missing validation readiness from a failed post-click dashboard transition", async () => {
        await assert.rejects(waitForCreateValidation(async () => null, 0), /Missing rendered Create game validation-ready boundary/);
        await assert.rejects(waitForCreatedDashboard(async () => ({route: "#/home/design", overview: false}), 0), /Failed post-click Create game Overview\/dashboard transition/);
    });
    test("ready validation cannot authorize a disabled or aria-busy Create control", async () => {
        const ready = {controlId: "blueprint-create-game", accessibleName: "Create game", validationState: "ok", enabled: true, visible: true, ariaBusy: null};
        for (const blocked of [{...ready, enabled: false}, {...ready, ariaBusy: "true"}]) {
            const observations = [];
            await assert.rejects(createRenderedGame(async () => blocked, () => assert.fail("blocked control dispatched a pointer"), observations, 0), /Missing rendered Create game validation-ready boundary/);
            assert.deepEqual(observations, []);
        }
        const observations = [];
        let reads = 0;
        await assert.rejects(createRenderedGame(async () => ++reads === 1 ? ready : {...ready, validationState: "loading"},
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

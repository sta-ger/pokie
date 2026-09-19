#!/usr/bin/env node
/**
 * Product-bound P8-04 audit. This deliberately drives the already-built
 * Studio through Chromium/CDP; it does not import React components or use a
 * fixture page. Run after `npm run build-cli` when collecting evidence.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// A controller may point a verification run at a temporary directory.  The
// checked-in invocation deliberately uses the evidence directory below.
const evidence = resolve(root, process.env.P8_04_EVIDENCE_DIR ?? "docs/evidence/p8-04-studio-polish");
const port = Number(process.env.P8_04_STUDIO_PORT ?? 32184);
const browserPort = Number(process.env.P8_04_CHROME_PORT ?? 9234);
const chromium = process.env.P8_04_CHROMIUM_BINARY ?? "chromium-browser";
const transcript = [];
let studio;
let chrome;
let cdp;
let profile;

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function waitFor(predicate, label, timeout = 120_000) {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
        await pause(150);
    }
}

async function terminate(child) {
    if (!child || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await Promise.race([new Promise((done) => child.once("exit", done)), pause(5_000)]);
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
}

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        const request = pending.get(response.id);
        if (!request) return;
        pending.delete(response.id);
        response.error ? request.reject(new Error(JSON.stringify(response.error))) : request.resolve(response.result);
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        pending.set(++id, {resolve: accept, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function evaluate(expression) {
    return (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
}

async function setViewport(name, width, height) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width <= 480,
        screenWidth: width,
        screenHeight: height,
    });
    const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    if (overflow) {
        const offenders = await evaluate(`(() => [...document.querySelectorAll("*")]
            .map((node) => {
                const box = node.getBoundingClientRect();
                return {tag: node.tagName.toLowerCase(), className: node.className, text: node.textContent?.trim().slice(0, 80), left: Math.round(box.left), right: Math.round(box.right), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth};
            })
            .filter((node) => node.right > window.innerWidth + 1 || node.left < -1 || node.scrollWidth > node.clientWidth + 1)
            .slice(0, 12))()`);
        throw new Error(`${name} viewport has document-level horizontal overflow: ${JSON.stringify(offenders)}`);
    }
    note(`VIEWPORT ${name}: ${width}x${height}; document overflow=false`);
}

async function capture(name, state) {
    const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, `${name} state has document-level horizontal overflow`);
    const image = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
    await writeFile(resolve(evidence, name), Buffer.from(image.data, "base64"));
    note(`CAPTURE ${name}: ${state}; document overflow=false`);
}

async function clickText(label) {
    const point = await evaluate(`(() => {
        const label = ${JSON.stringify(label)};
        const node = [...document.querySelectorAll("button,a,[role=button]")].find((item) => (item.textContent?.trim() === label || item.getAttribute("aria-label") === label) && !item.disabled && item.getClientRects().length > 0);
        if (!node) return undefined;
        node.scrollIntoView({block: "center", inline: "nearest"});
        const rect = node.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    assert.ok(point, `Rendered control unavailable: ${label}`);
    await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", ...point, button: "left", clickCount: 1});
    await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", ...point, button: "left", clickCount: 1});
    note(`CLICK ${label}`);
    await pause(300);
}

async function assertVisibleAction(label, lifecycle) {
    const control = await evaluate(`(() => {
        const label = ${JSON.stringify(label)};
        const node = [...document.querySelectorAll("button,a,[role=button]")].find((item) =>
            (item.textContent?.trim() === label || item.getAttribute("aria-label") === label) && item.getClientRects().length > 0,
        );
        return node === undefined ? undefined : {disabled: Boolean(node.disabled), tagName: node.tagName.toLowerCase()};
    })()`);
    assert.ok(control, `${lifecycle} must expose the rendered action: ${label}`);
    assert.equal(control.disabled, false, `${lifecycle} action is disabled: ${label}`);
    note(`LIFECYCLE ${lifecycle}: visible enabled ${control.tagName} action ${label}`);
}

async function assertHiddenAction(label, lifecycle) {
    const visible = await evaluate(`(() => {
        const label = ${JSON.stringify(label)};
        return [...document.querySelectorAll("button,a,[role=button]")].some((item) =>
            (item.textContent?.trim() === label || item.getAttribute("aria-label") === label) && item.getClientRects().length > 0,
        );
    })()`);
    assert.equal(visible, false, `${lifecycle} must not retain the rendered action: ${label}`);
    note(`LIFECYCLE ${lifecycle}: action ${label} is no longer visible`);
}

async function fillField(label, value) {
    const point = await evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const normalise = (text) => text?.trim().replace(/\\s+\\*$/, "");
        const node = [...document.querySelectorAll("input,textarea")].find((item) => item.getClientRects().length > 0 &&
            (item.getAttribute("aria-label") === wanted || [...(item.labels ?? [])].some((itemLabel) => normalise(itemLabel.textContent) === wanted)));
        if (!node) return undefined;
        node.scrollIntoView({block: "center", inline: "nearest"});
        const rect = node.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    assert.ok(point, `Rendered field unavailable: ${label}`);
    await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", ...point, button: "left", clickCount: 1});
    await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", ...point, button: "left", clickCount: 1});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
    await cdp.send("Input.insertText", {text: value});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
    note(`INPUT ${label}=${JSON.stringify(value)} through rendered browser field`);
    await pause(300);
}

async function bodyIncludes(text) {
    const body = await evaluate("document.body?.innerText");
    return typeof body === "string" && body.includes(text);
}

async function waitForText(text, label, timeout) {
    await waitFor(() => bodyIncludes(text), label, timeout);
}

async function createProject() {
    // The primary Design surface starts with an editable recommended model.
    // Reaching generation through its progressive-disclosure entry keeps this
    // audit on the public workflow rather than an obsolete hidden route.
    await clickText("Choose a different start");
    await waitForText("Start a new game", "real start-choice dialog");
    // This is the accessible name of the actual dialog control. Keep this
    // tied to the rendered product wording so the audit catches a broken
    // entry point instead of silently exercising a fixture-only route.
    await clickText("Generate random");
    await waitForText("Seed (optional)", "real random blueprint controls");
    // This deliberately exercises containment of a real, long project label
    // through creation, registration, reopening and the project dashboard.
    const name = "P8-04 Studio audit — a deliberately long project name for responsive containment";
    await fillField("Name (optional)", name);
    await clickText("Generate");
    await waitForText("Generated", "real random blueprint result", 120_000);
    await clickText("Use this game idea");
    await waitForText("Create game", "real guided blueprint editor");
    await clickText("Create game");
    await waitForText("Close project", "created real project dashboard", 120_000);
    await waitForText(name, "long project name on the real project dashboard");
    note("WORKFLOW created, registered, and opened a real long-named project through Studio's rendered Design flow.");
}

async function runAndCancelSimulation() {
    await clickText("Simulation");
    await waitForText("Run Simulation", "real Simulation workflow");
    // A large, real run gives the rendered polling UI time to reach its
    // cancellable lifecycle rather than relying on a fabricated job record.
    await fillField("Rounds", "100000");
    await clickText("Run Simulation");
    await waitFor(async () => (await bodyIncludes("queued —")) || (await bodyIncludes("running —")), "rendered queued or running simulation", 120_000);
    await assertVisibleAction("Cancel", "queued/running simulation");
    await capture("compact-simulation-running.png", "Compact 1024×768 real simulation job queued/running");
    await clickText("Cancel");
    await waitForText("Please confirm", "rendered cancellation confirmation");
    await assertVisibleAction("Confirm", "simulation cancellation confirmation");
    await clickText("Confirm");
    await waitFor(async () => (await bodyIncludes("cancelling —")) || (await bodyIncludes("cancelled —")), "rendered cancelling or cancelled simulation", 120_000);
    await assertHiddenAction("Cancel", "cancelling/cancelled simulation");
    if (await bodyIncludes("cancelling —")) {
        await capture("compact-simulation-cancelling.png", "Compact 1024×768 cancellation requested; cleanup remains active");
    }
    try {
        await waitForText("Cancelled after", "real cancellation terminal result", 120_000);
    } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\nRendered cancellation state: ${await evaluate("document.body.innerText")}`);
    }
    await capture("compact-simulation-cancelled.png", "Compact 1024×768 real cancelled simulation result");
    note("WORKFLOW cancelled the rendered simulation through its confirmation and waited for the server terminal state.");
}

async function runCompletedSimulation() {
    await clickText("Back to configuration");
    await waitForText("Run Simulation", "simulation configuration after cancellation");
    await fillField("Rounds", "25");
    await clickText("Run Simulation");
    await waitFor(async () => (await bodyIncludes("RTP")) && (await bodyIncludes("Recent runs")), "real completed simulation report", 120_000);
    await assertVisibleAction("Repeat simulation", "completed simulation report");
    await capture("wide-simulation-completed.png", "Wide 1440×900 real completed simulation report and output actions");
    note("WORKFLOW completed a second real simulation and rendered its durable report summary.");
}

async function main() {
    await mkdir(evidence, {recursive: true});
    await Promise.all([
        "wide-project-overview.png",
        "compact-simulation-running.png",
        "compact-simulation-cancelling.png",
        "compact-simulation-cancelled.png",
        "wide-simulation-completed.png",
        "small-navigation.png",
        "AUDIT-TRANSCRIPT.txt",
    ].map((name) => rm(resolve(evidence, name), {force: true})));
    profile = await mkdtemp(resolve(tmpdir(), "pokie-p8-04-browser-"));
    // Studio is POKIE's implicit root command, not a public `pokie studio`
    // subcommand. Invoking the built binary without a positional is therefore
    // the same public launch path a browser user receives.
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd: root, env: {...process.env, HOME: profile}, stdio: "ignore"});
    await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/context`)).ok; } catch { return false; } }, "built Studio API");
    chrome = spawn(chromium, ["--headless=new", "--no-sandbox", `--user-data-dir=${resolve(profile, "chromium")}`, `--remote-debugging-port=${browserPort}`, "about:blank"], {stdio: "ignore"});
    await waitFor(async () => { try { return Array.isArray(await json(`http://127.0.0.1:${browserPort}/json/list`)); } catch { return false; } }, "Chromium CDP");
    cdp = await connect();
    await cdp.send("Page.navigate", {url: `http://127.0.0.1:${port}/#/home/design`});
    await waitFor(() => bodyIncludes("Design Your Game"), "real Design route");
    await setViewport("wide desktop", 1440, 900);
    await createProject();
    await waitForText("Overview", "real project Overview");
    await capture("wide-project-overview.png", "Wide 1440×900 real project Overview with long project identity");
    await setViewport("compact desktop", 1024, 768);
    await runAndCancelSimulation();
    await setViewport("wide desktop", 1440, 900);
    await runCompletedSimulation();
    await setViewport("small viewport", 390, 844);
    await clickText("Toggle navigation");
    assert.equal(await evaluate("document.querySelector('[role=navigation], nav')?.getClientRects().length > 0"), true, "small viewport navigation did not open");
    await capture("small-navigation.png", "Small 390×844 viewport with rendered navigation open after real project/job workflows");
    note("PASS real built Studio project creation, responsive navigation, simulation cancellation/completion, and no document-level horizontal overflow at wide, compact, and small viewports.");
}

main().catch((error) => {
    note(`FAILED ${error.stack ?? error}`);
    process.exitCode = 1;
}).finally(async () => {
    await mkdir(evidence, {recursive: true});
    await writeFile(resolve(evidence, "AUDIT-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    cdp?.close();
    await terminate(chrome);
    await terminate(studio);
    if (profile) await rm(profile, {recursive: true, force: true});
});

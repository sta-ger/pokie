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
const evidence = resolve(root, "docs/evidence/p8-04-studio-polish");
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
    await cdp.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
    const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, `${name} viewport has document-level horizontal overflow`);
    note(`VIEWPORT ${name}: ${width}x${height}; document overflow=false`);
}

async function capture(name, state) {
    const image = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
    await writeFile(resolve(evidence, name), Buffer.from(image.data, "base64"));
    note(`CAPTURE ${name}: ${state}`);
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

async function bodyIncludes(text) {
    return (await evaluate("document.body.innerText")).includes(text);
}

async function main() {
    await mkdir(evidence, {recursive: true});
    await Promise.all(["wide-overview.png", "compact-project.png", "small-navigation.png", "AUDIT-TRANSCRIPT.txt"].map((name) => rm(resolve(evidence, name), {force: true})));
    profile = await mkdtemp(resolve(tmpdir(), "pokie-p8-04-browser-"));
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "studio", "--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd: root, env: {...process.env, HOME: profile}, stdio: "ignore"});
    await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/context`)).ok; } catch { return false; } }, "built Studio API");
    chrome = spawn(chromium, ["--headless=new", "--no-sandbox", `--user-data-dir=${resolve(profile, "chromium")}`, `--remote-debugging-port=${browserPort}`, "about:blank"], {stdio: "ignore"});
    await waitFor(async () => { try { return Array.isArray(await json(`http://127.0.0.1:${browserPort}/json/list`)); } catch { return false; } }, "Chromium CDP");
    cdp = await connect();
    await cdp.send("Page.navigate", {url: `http://127.0.0.1:${port}/#/home/design`});
    await waitFor(() => bodyIncludes("Design Your Game"), "real Design route");
    await setViewport("wide desktop", 1440, 900);
    await capture("wide-overview.png", "Design workflow ready for project creation");
    await clickText("Projects");
    await waitFor(() => bodyIncludes("Projects"), "real Projects navigation");
    await setViewport("compact desktop", 1024, 768);
    await capture("compact-project.png", "Projects workflow");
    await setViewport("small viewport", 390, 844);
    await clickText("Toggle navigation");
    assert.equal(await evaluate("document.querySelector('[role=navigation], nav')?.getClientRects().length > 0"), true, "small viewport navigation did not open");
    await capture("small-navigation.png", "Small viewport navigation open");
    note("PASS real built Studio navigation and no document-level horizontal overflow at wide, compact, and small viewports.");
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

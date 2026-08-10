#!/usr/bin/env node
/**
 * Records P5PA-03 through the rendered public Studio UI. CDP is limited to
 * browser navigation, screenshots, rendered-control discovery, and physical
 * mouse clicks; it does not call Studio APIs or alter DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studioUrl = process.env.P5PA03_STUDIO_URL ?? "http://127.0.0.1:4103";
const devtoolsUrl = process.env.P5PA03_DEVTOOLS_URL ?? "http://127.0.0.1:9223";
const output = resolve(process.env.P5PA03_OUTPUT ?? "docs/phase5-post-audit/evidence/p5pa-03-real-init-basics-fix/browser-ui-rerun");
const transcript = [];

function note(message) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    transcript.push(entry);
    process.stdout.write(`${entry}\n`);
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await requestJson(`${devtoolsUrl}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let nextId = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id !== undefined && pending.has(message.id)) {
            const {resolvePending, rejectPending} = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) rejectPending(new Error(JSON.stringify(message.error)));
            else resolvePending(message.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolvePending, rejectPending) => {
        const id = ++nextId;
        pending.set(id, {resolvePending, rejectPending});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
    })).result.value;
    const waitUntil = async (expression, description, timeoutMs = 30000) => {
        const deadline = Date.now() + timeoutMs;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(250);
        }
    };
    const renderedControl = async (label) => evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const controls = [...document.querySelectorAll('button,a,[role="button"]')];
        const element = controls.find((candidate) => candidate.textContent?.trim() === wanted && !candidate.disabled && candidate.getClientRects().length > 0);
        if (!element) return {ok: false, available: controls.filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
        const rect = element.getBoundingClientRect();
        return {ok: true, tag: element.tagName, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    const click = async (label) => {
        const control = await renderedControl(label);
        if (!control?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} not found: ${JSON.stringify(control?.available)}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: control.x, y: control.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: control.x, y: control.y, button: "left", clickCount: 1});
        note(`CLICK ${JSON.stringify(label)} at rendered ${control.tag} coordinates (${Math.round(control.x)}, ${Math.round(control.y)})`);
        await sleep(700);
    };
    const capture = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        const bodyText = await evaluate("document.body.innerText");
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${bodyText}\n`);
        note(`CAPTURE ${name}.png and ${name}-visible-text.txt`);
    };

    note(`START fresh Chrome session against public Studio URL ${studioUrl}`);
    await cdp.send("Page.navigate", {url: studioUrl});
    note("NAVIGATE public Studio root URL");
    await waitUntil("document.body.innerText.includes('Game Model')", "the rendered Studio project dashboard");
    await capture("03-project-dashboard");
    await click("Game Model");
    await waitUntil("document.body.innerText.includes('Id: (none)') && document.body.innerText.includes('Name: (none)')", "rendered Game Model basics with both identity fields unset");
    const visibleText = await evaluate("document.body.innerText");
    if (visibleText.includes('Id: storefront-widgets') || visibleText.includes('Name: storefront-widgets')) {
        throw new Error("Game Model falsely projected package.json.name storefront-widgets into Id or Name");
    }
    note("OBSERVE rendered Game Model basics show Id: (none) and Name: (none), not storefront-widgets");
    await capture("04-game-model-no-false-package-name-projection");
    note("COMPLETE P5PA-03 real init package → Studio → Game Model browser audit");
    await writeFile(resolve(output, "03-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "03-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

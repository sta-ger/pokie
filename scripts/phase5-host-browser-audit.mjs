#!/usr/bin/env node
/**
 * Records the P5-POLISH-20 F9 host-browser audit through Chrome DevTools
 * Protocol.  CDP is used as a physical browser input device only: controls
 * are first located in the rendered page, then clicked at their visible pixel
 * coordinates and text is entered through the browser keyboard/input channel.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studio = process.env.P5_STUDIO_URL ?? "http://127.0.0.1:4100";
const output = resolve(process.env.P5_AUDIT_OUTPUT ?? "docs/phase5-audit/evidence/host-browser/f9-rerun-current");
const devtools = process.env.P5_DEVTOOLS_URL ?? "http://127.0.0.1:9222";
const transcript = [];

function note(message) {
    const stamped = `[${new Date().toISOString()}] ${message}`;
    transcript.push(stamped);
    process.stdout.write(`${stamped}\n`);
}

async function sleep(ms) { await new Promise((wake) => setTimeout(wake, ms)); }

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id && pending.has(response.id)) {
            const {resolvePending, rejectPending} = pending.get(response.id);
            pending.delete(response.id);
            if (response.error) rejectPending(new Error(JSON.stringify(response.error)));
            else resolvePending(response.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolvePending, rejectPending) => {
        const id = ++sequence;
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
        expression, returnByValue: true, awaitPromise: true,
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
        if (!control?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} was not found: ${JSON.stringify(control?.available)}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: control.x, y: control.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: control.x, y: control.y, button: "left", clickCount: 1});
        note(`CLICK ${JSON.stringify(label)} at rendered ${control.tag} coordinates (${Math.round(control.x)}, ${Math.round(control.y)})`);
        await sleep(600);
    };
    const inputLocation = async (location) => {
        const input = await evaluate(`(() => {
            const element = [...document.querySelectorAll('input')].find((candidate) => (
                candidate.getAttribute('aria-label') === 'Location'
                || [...candidate.labels ?? []].some((label) => label.textContent?.includes('Location'))
            ) && candidate.getClientRects().length > 0);
            if (!element) return {ok: false};
            const rect = element.getBoundingClientRect();
            return {ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
        })()`);
        if (!input?.ok) throw new Error("Rendered Location input was not found");
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: input.x, y: input.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: input.x, y: input.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.insertText", {text: location});
        note(`INPUT Location=${JSON.stringify(location)} through browser mouse/keyboard input`);
        await sleep(300);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        const text = await evaluate("document.body.innerText");
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${text}\n`);
        note(`CAPTURE ${name}.png and ${name}.txt`);
    };

    note(`START fresh external Chrome audit against ${studio}`);
    await cdp.send("Page.navigate", {url: `${studio}/#/home/projects`});
    note("NAVIGATE public Studio Projects URL");
    await waitUntil("document.body.innerText.includes('Import Project')", "the rendered Projects page");
    const blueprint = resolve(repositoryRoot, "docs/phase5-evidence/p5-polish-19/parity/after-fix-fixture-blueprint.json");
    await inputLocation(blueprint);
    await click("Detect");
    await waitUntil("document.body.innerText.includes('Blueprint') && document.body.innerText.includes('Register')", "the rendered Blueprint detection result");
    await snapshot("01-blueprint-detected");
    await click("Register");
    await waitUntil("document.body.innerText.includes('Open')", "the rendered Blueprint registry Open action");
    note("OBSERVE Blueprint registry row exposes rendered Open action");
    await snapshot("02-blueprint-registered-open-available");
    await click("Open");
    await waitUntil("document.body.innerText.includes('Overview') && document.body.innerText.includes('Game Model')", "the opened Blueprint Studio workspace");
    note("ARRIVE at opened Blueprint Studio workspace with Overview and Game Model");
    await snapshot("03-blueprint-workspace-overview");
    await click("Game Model");
    await waitUntil("document.body.innerText.includes('Game Model')", "the opened Blueprint Game Model workspace");
    note("ARRIVE at opened Blueprint Game Model workspace");
    await snapshot("04-blueprint-workspace-game-model");
    note("COMPLETE F9 Blueprint Detect → Register → Open → Overview/Game Model browser audit");
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

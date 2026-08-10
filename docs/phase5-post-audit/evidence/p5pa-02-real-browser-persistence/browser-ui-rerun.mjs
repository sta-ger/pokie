#!/usr/bin/env node
/**
 * Real-browser evidence recorder for P5PA-02. CDP is used only to find
 * rendered controls and send mouse/keyboard input at their visible pixels.
 * No Studio endpoint is called by this script and no DOM/state is injected.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P5_STUDIO_URL ?? "http://127.0.0.1:4212";
const devtools = process.env.P5_DEVTOOLS_URL ?? "http://127.0.0.1:9223";
const output = resolve(process.env.P5_AUDIT_OUTPUT ?? "docs/phase5-post-audit/evidence/p5pa-02-real-browser-persistence");
const fixture = resolve(process.env.P5_FIXTURE ?? "docs/phase5-post-audit/evidence/p5pa-02-real-browser-persistence/blueprint-game-model-fixture.json");
const phase = process.env.P5_PHASE ?? "save";
const transcript = [];

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function getJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await getJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
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
            const pair = pending.get(response.id);
            pending.delete(response.id);
            response.error ? pair.reject(new Error(JSON.stringify(response.error))) : pair.resolve(response.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolvePending, rejectPending) => {
        const id = ++sequence;
        pending.set(id, {resolve: resolvePending, reject: rejectPending});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const waitUntil = async (expression, description, timeoutMs = 30000) => {
        const deadline = Date.now() + timeoutMs;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
    };
    const mouseClick = async (target, description) => {
        if (!target?.ok) throw new Error(`Rendered ${description} was not found: ${JSON.stringify(target)}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1});
        note(`CLICK ${description} at rendered coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
        await sleep(500);
    };
    const locateButton = async (label) => evaluate(`(() => {
        const label = ${JSON.stringify(label)};
        const candidates = [...document.querySelectorAll('button,a,[role="button"]')]
            .filter((e) => e.textContent?.trim() === label && !e.disabled && e.getClientRects().length > 0);
        const e = candidates[0];
        if (!e) return {ok: false, labels: [...document.querySelectorAll('button,a,[role="button"]')].filter((x) => x.getClientRects().length > 0).map((x) => x.textContent?.trim()).filter(Boolean)};
        const r = e.getBoundingClientRect();
        return {ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    const locateSectionButton = async (legend, label) => evaluate(`(() => {
        const legend = ${JSON.stringify(legend)};
        const label = ${JSON.stringify(label)};
        const fieldset = [...document.querySelectorAll('fieldset')].find((f) => f.querySelector(':scope > legend')?.textContent?.trim().startsWith(legend));
        const e = fieldset && [...fieldset.querySelectorAll('button')].find((b) => b.textContent?.trim() === label && !b.disabled && b.getClientRects().length > 0);
        if (!e) return {ok: false, fieldsets: [...document.querySelectorAll('fieldset')].map((f) => f.querySelector(':scope > legend')?.textContent?.trim())};
        const r = e.getBoundingClientRect();
        return {ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    const locateInput = async (ariaLabel) => evaluate(`(() => {
        const e = [...document.querySelectorAll('input')].find((x) => (x.getAttribute('aria-label') === ${JSON.stringify(ariaLabel)} || [...x.labels ?? []].some((label) => label.textContent?.trim() === ${JSON.stringify(ariaLabel)})) && x.getClientRects().length > 0);
        if (!e) return {ok: false, labels: [...document.querySelectorAll('input')].map((x) => x.getAttribute('aria-label'))};
        const r = e.getBoundingClientRect();
        return {ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    const replaceInput = async (ariaLabel, value) => {
        await mouseClick(await locateInput(ariaLabel), `input ${JSON.stringify(ariaLabel)}`);
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.insertText", {text: value});
        note(`INPUT ${JSON.stringify(ariaLabel)}=${JSON.stringify(value)} through browser keyboard`);
        await sleep(300);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        const bodyText = await evaluate("document.body.innerText");
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${bodyText}\n`);
        note(`CAPTURE ${name}.png and ${name}.txt`);
    };

    note(`START real Chrome session against fresh Studio ${studio}; phase=${phase}`);
    await cdp.send("Page.navigate", {url: `${studio}/#/home/projects`});
    note("NAVIGATE visible Studio Projects page");
    await waitUntil("(() => { const e = [...document.querySelectorAll('input')].find((x) => (x.getAttribute('aria-label') === 'Location' || [...x.labels ?? []].some((label) => label.textContent?.trim() === 'Location')) && x.getClientRects().length > 0); return e !== undefined; })()", "visible Projects Import Location input");
    if (phase === "reload") {
        await waitUntil("document.body.innerText.includes('blueprint-game-model-fixture') && document.body.innerText.includes('Open')", "persisted registered project row");
        await mouseClick(await locateButton("Open"), "persisted project Open");
        await waitUntil("document.body.innerText.includes('Game Model')", "reloaded Project workspace");
        await mouseClick(await locateButton("Game Model"), "Game Model after Studio restart");
        await waitUntil("document.body.innerText.includes('3x → 12 free games')", "persisted Mechanics projection after Studio restart");
        await snapshot("03-after-studio-restart-project-reload");
        note("COMPLETE project reload: saved free-games award remains 12 after a fresh Studio process and browser session.");
        await writeFile(resolve(output, "ACTION-TRANSCRIPT-reload.txt"), `${transcript.join("\n")}\n`);
        cdp.close();
        return;
    }
    await replaceInput("Location", fixture);
    await mouseClick(await locateButton("Detect"), "Detect");
    await waitUntil("document.body.innerText.includes('Blueprint') && document.body.innerText.includes('Register')", "Blueprint detection");
    await mouseClick(await locateButton("Register"), "Register");
    await waitUntil("document.body.innerText.includes('Open')", "registered Blueprint row");
    await mouseClick(await locateButton("Open"), "Open");
    await waitUntil("document.body.innerText.includes('Game Model')", "Project workspace");
    await mouseClick(await locateButton("Game Model"), "Game Model");
    await waitUntil("document.body.innerText.includes('Mechanics') && document.body.innerText.includes('3x → 10 free games')", "initial Mechanics projection");
    await snapshot("01-initial-game-model-limits");
    await mouseClick(await locateSectionButton("Mechanics", "Edit"), "Mechanics Edit");
    await waitUntil("document.body.innerText.includes('Free games awarded')", "Mechanics editor");
    await replaceInput("3x free games awarded", "12");
    await mouseClick(await locateSectionButton("Mechanics", "Save"), "Mechanics Save");
    await waitUntil("document.body.innerText.includes('3x → 12 free games')", "saved Mechanics projection");
    await snapshot("02-after-save-game-model");
    note("COMPLETE visible UI edit and Save; the host should now restart Studio before invoking this script's reload mode.");
    await writeFile(resolve(output, "ACTION-TRANSCRIPT-save.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "ACTION-TRANSCRIPT-save.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

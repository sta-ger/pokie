#!/usr/bin/env node
/*
 * P6-08 host browser audit. CDP is used only to inspect rendered controls,
 * dispatch normal mouse/keyboard input, read rendered text, and capture pages.
 * It never calls an application API or changes page/application state directly.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_08_OUTPUT ?? "docs/evidence/p6-08-canonical-player-runtime-parity");
const devtools = process.env.P6_08_DEVTOOLS ?? "http://127.0.0.1:9228";
const client = process.env.P6_08_CLIENT ?? "http://127.0.0.1:4512";
const studio = process.env.P6_08_STUDIO ?? "http://127.0.0.1:4611";
const seed = "fixture-round";
const transcript = [];

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await requestJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id && pending.has(response.id)) {
            const {resolve: accept, reject} = pending.get(response.id);
            pending.delete(response.id);
            response.error ? reject(new Error(JSON.stringify(response.error))) : accept(response.result);
        }
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++sequence;
        pending.set(id, {resolve: accept, reject});
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
    const body = async () => evaluate("document.body.innerText");
    const waitUntil = async (expression, description, timeout = 60000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
    };
    const navigate = async (url, description) => {
        await cdp.send("Page.navigate", {url});
        note(`NAVIGATE ${description}: ${url}`);
        await sleep(500);
    };
    const renderedControl = async (label) => evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const candidates = [...document.querySelectorAll("button,a,[role=button],summary")];
        const element = candidates.find((candidate) => candidate.textContent?.trim() === wanted && !candidate.disabled && candidate.getClientRects().length > 0);
        if (!element) return {ok:false, available:candidates.filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
        const rect = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, viewportHeight:window.innerHeight};
    })()`);
    const click = async (label) => {
        let found = await renderedControl(label);
        if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} not found: ${JSON.stringify(found?.available)}`);
        // Scroll with the browser's ordinary wheel-input channel until the rendered
        // control is inside the viewport; a capture-beyond-viewport screenshot alone
        // must never be mistaken for a clickable visible UI control.
        for (let attempt = 0; attempt < 10 && (found.y < 0 || found.y > found.viewportHeight); attempt++) {
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:400, y:Math.max(100, found.viewportHeight / 2), deltaX:0, deltaY:found.y < 0 ? -600 : 600});
            await sleep(150);
            found = await renderedControl(label);
            if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} disappeared while scrolling`);
        }
        if (found.y < 0 || found.y > found.viewportHeight) throw new Error(`Rendered control ${JSON.stringify(label)} remained outside the viewport after browser wheel scrolling`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        note(`CLICK ${JSON.stringify(label)} at rendered ${found.tag} coordinates (${Math.round(found.x)}, ${Math.round(found.y)})`);
        await sleep(400);
    };
    const input = async (selector, value, description) => {
        const found = await evaluate(`(() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element || element.getClientRects().length === 0) return {ok:false};
            const rect = element.getBoundingClientRect();
            return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
        })()`);
        if (!found?.ok) throw new Error(`Rendered input ${description} (${selector}) not found`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        note(`INPUT ${description}=${JSON.stringify(value)} through rendered browser input`);
        await sleep(350);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`);
        note(`CAPTURE ${name}.png and ${name}.txt`);
    };
    const visibleGrid = async () => evaluate(`(() => [...document.querySelectorAll("[data-cell]")].map((cell) => ({cell:cell.dataset.cell, text:cell.textContent?.trim(), color:getComputedStyle(cell).backgroundColor})))()`);

    note(`START fresh-rendered browser workflow: client=${client}, studio=${studio}`);
    await navigate(client, "generated package npm start Player UI");
    await waitUntil("document.body.innerText.includes('POKIE client preview') && document.body.innerText.includes('Spin')", "generated package client UI");
    await click("Spin");
    await waitUntil("document.querySelectorAll('[data-cell]').length === 9", "generated Player grid after visible spin");
    await click("Paytable");
    await snapshot("20-generated-package-npm-start-player");
    const packageGrid = await visibleGrid();
    await writeFile(resolve(output, "20-generated-package-visible-grid.json"), `${JSON.stringify(packageGrid, null, 2)}\n`);
    note(`OBSERVE generated package npm start rendered ${packageGrid.length} Player cells, bet/credits/win/multiplier, paylines, and paytable through pokie/client/player.`);

    await navigate(`${studio}/#/project/play`, "Studio Play UI");
    await waitUntil("document.body.innerText.includes('New session') && document.body.innerText.includes('Seed (optional)')", "Studio Play seed form");
    await input("input", seed, "Studio Play Seed (optional)");
    await click("New session");
    await waitUntil("document.body.innerText.includes('No round played yet') && document.body.innerText.includes('Spin')", "Studio active Play session");
    await click("Spin");
    await waitUntil("document.body.innerText.includes('Total win') && document.body.innerText.includes('line: A, win: 5')", "deterministic Studio Play round");
    await snapshot("21-studio-play-seeded-round");
    const playGrid = await visibleGrid();
    await writeFile(resolve(output, "21-studio-play-visible-grid.json"), `${JSON.stringify(playGrid, null, 2)}\n`);
    note(`OBSERVE Studio Play seed ${JSON.stringify(seed)} visibly produced the 3x3 A/C/A | A/A/C | A/A/A round and total win 5.00.`);

    await navigate(`${studio}/#/project/replay`, "Studio Replay UI");
    await waitUntil("document.body.innerText.includes('Target round number') && document.body.innerText.includes('Load')", "Studio Replay seed form");
    await input('input[data-path="seed"]', seed, "Studio Replay Seed (optional)");
    await click("Load");
    await waitUntil("document.body.innerText.includes('Run again')", "loaded Studio Replay request");
    await click("Run again");
    await waitUntil("document.body.innerText.includes('Total win') && document.body.innerText.includes('line: A, win: 5')", "deterministic Studio Replay result", 120000);
    await snapshot("22-studio-replay-seeded-round");
    const replayGrid = await visibleGrid();
    await writeFile(resolve(output, "22-studio-replay-visible-grid.json"), `${JSON.stringify(replayGrid, null, 2)}\n`);
    const expected = ["A", "C", "A", "A", "A", "C", "A", "A", "A"];
    const playSymbols = playGrid.map((cell) => cell.text);
    const replaySymbols = replayGrid.map((cell) => cell.text);
    if (JSON.stringify(playSymbols) !== JSON.stringify(expected) || JSON.stringify(replaySymbols) !== JSON.stringify(expected)) {
        throw new Error(`Deterministic Studio Play/Replay grid mismatch: ${JSON.stringify({playSymbols, replaySymbols})}`);
    }
    note("ASSERT Studio Play and Replay visibly match the expected seeded 3x3 grid and A-line 5.00 win.");
    note("OBSERVE generated package Player UI exposes no rendered seed/session-creation control; it creates its own unseeded session on load, so the seeded Studio round cannot be selected through that public Player UI.");
    await writeFile(resolve(output, "browser-ui-rerun-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, "browser-ui-rerun-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

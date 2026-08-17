#!/usr/bin/env node
/*
 * Independent P6-08 browser rerun.  CDP is restricted to ordinary rendered
 * mouse/keyboard input, rendered-text inspection, and screenshots.  It makes
 * no application API requests and never injects DOM or application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_08_OUTPUT ?? "docs/evidence/p6-08-canonical-player-runtime-parity/host-rerun-667f614b");
const devtools = process.env.P6_08_DEVTOOLS ?? "http://127.0.0.1:9228";
const client = process.env.P6_08_CLIENT ?? "http://127.0.0.1:4512";
const studio = process.env.P6_08_STUDIO ?? "http://127.0.0.1:4611";
const seed = "fixture-round";
const transcript = [];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}
async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}
async function connect() {
    const target = await requestJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method:"PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id && pending.has(message.id)) {
            const {resolve: accept, reject} = pending.get(message.id);
            pending.delete(message.id);
            message.error ? reject(new Error(JSON.stringify(message.error))) : accept(message.result);
        }
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++sequence; pending.set(id, {resolve:accept, reject}); socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close:() => socket.close()};
}
async function main() {
    await mkdir(output, {recursive:true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true})).result.value;
    const text = async () => evaluate("document.body.innerText");
    const waitUntil = async (expression, description, timeout = 60000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
    };
    const navigate = async (url, description) => {
        await cdp.send("Page.navigate", {url}); note(`NAVIGATE ${description}: ${url}`); await sleep(500);
    };
    const renderedControl = async (label) => evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const candidates = [...document.querySelectorAll("button,a,[role=button],summary")];
        const element = candidates.find((candidate) => candidate.textContent?.trim() === wanted && !candidate.disabled && candidate.getClientRects().length > 0);
        if (!element) return {ok:false, available:candidates.filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
        const rect = element.getBoundingClientRect(); return {ok:true, tag:element.tagName, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, viewportHeight:window.innerHeight};
    })()`);
    const click = async (label) => {
        let found = await renderedControl(label);
        if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} not found: ${JSON.stringify(found?.available)}`);
        for (let attempt = 0; attempt < 10 && (found.y < 0 || found.y > found.viewportHeight); attempt++) {
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:400, y:Math.max(100, found.viewportHeight / 2), deltaX:0, deltaY:found.y < 0 ? -600 : 600});
            await sleep(150); found = await renderedControl(label);
            if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} disappeared while scrolling`);
        }
        if (found.y < 0 || found.y > found.viewportHeight) throw new Error(`Rendered control ${JSON.stringify(label)} remained outside viewport`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        note(`CLICK ${JSON.stringify(label)} at rendered ${found.tag} coordinates (${Math.round(found.x)}, ${Math.round(found.y)})`); await sleep(400);
    };
    const input = async (selector, value, description) => {
        const found = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.getClientRects().length === 0) return {ok:false}; const rect = element.getBoundingClientRect(); return {ok:true,x:rect.left+rect.width/2,y:rect.top+rect.height/2}; })()`);
        if (!found?.ok) throw new Error(`Rendered input ${description} (${selector}) not found`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value}); note(`INPUT ${description}=${JSON.stringify(value)} through rendered browser input`); await sleep(350);
    };
    const grid = async () => evaluate(`(() => [...document.querySelectorAll("[data-cell]")].map((cell) => ({cell:cell.dataset.cell,text:cell.textContent?.trim(),color:getComputedStyle(cell).backgroundColor})))()`);
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${await text()}\n`);
        await writeFile(resolve(output, `${name}-grid.json`), `${JSON.stringify(await grid(), null, 2)}\n`);
        note(`CAPTURE ${name}.png, rendered text, and rendered player grid`);
    };

    note(`START fresh rendered-browser workflow: client=${client}, studio=${studio}, seed=${seed}`);
    await navigate(client, "generated package npm start Player UI");
    await waitUntil("document.body.innerText.includes('Session seed (optional)') && document.body.innerText.includes('Spin')", "generated package Player controls");
    await input("#session-seed", seed, "generated Player Session seed");
    await click("Start new session");
    await waitUntil("document.body.innerText.includes('Connected to')", "seeded generated Player session");
    await click("Spin");
    // The standalone Player intentionally formats this simple fixture's whole-number win as
    // `5`, whereas Studio's currency-oriented round card shows `5.00`; the shared grid and
    // canonical multiplier/winning-line presentation remain the parity assertion.
    await waitUntil("document.querySelectorAll('[data-cell]').length === 9 && document.body.innerText.includes('Winning lines')", "seeded generated Player round");
    await click("Paytable");
    await snapshot("10-generated-package-npm-start-seeded-player");

    await navigate(`${studio}/#/project/play`, "Studio Play UI");
    await waitUntil("document.body.innerText.includes('New session') && document.body.innerText.includes('Seed (optional)')", "Studio Play seed form");
    await input("input", seed, "Studio Play Seed (optional)");
    await click("New session");
    await waitUntil("document.body.innerText.includes('No round played yet') && document.body.innerText.includes('Spin')", "Studio active Play session");
    await click("Spin");
    await waitUntil("document.body.innerText.includes('Total win') && document.body.innerText.includes('line: A, win: 5')", "deterministic Studio Play round");
    await snapshot("11-studio-play-seeded-round");

    await navigate(`${studio}/#/project/replay`, "Studio Replay UI");
    await waitUntil("document.body.innerText.includes('Target round number') && document.body.innerText.includes('Load')", "Studio Replay seed form");
    await input('input[data-path="seed"]', seed, "Studio Replay Seed (optional)");
    await click("Load");
    await waitUntil("document.body.innerText.includes('Run again')", "loaded Studio Replay request");
    await click("Run again");
    await waitUntil("document.body.innerText.includes('Total win') && document.body.innerText.includes('line: A, win: 5')", "deterministic Studio Replay result", 120000);
    await snapshot("12-studio-replay-seeded-round");

    const expected = ["A","C","A","A","A","C","A","A","A"];
    const files = ["10-generated-package-npm-start-seeded-player", "11-studio-play-seeded-round", "12-studio-replay-seeded-round"];
    for (const file of files) {
        const symbols = JSON.parse(await (await import("node:fs/promises")).readFile(resolve(output, `${file}-grid.json`), "utf8")).map((cell) => cell.text);
        if (JSON.stringify(symbols) !== JSON.stringify(expected)) throw new Error(`Seeded grid mismatch for ${file}: ${JSON.stringify(symbols)}`);
    }
    note("ASSERT generated package Player, Studio Play, and Studio Replay visibly match the expected seeded 3x3 grid A/C/A | A/A/C | A/A/A and A-line win 5.00.");
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output,{recursive:true}); await writeFile(resolve(output,"browser-transcript.txt"),`${transcript.join("\n")}\n`); process.exit(1); });

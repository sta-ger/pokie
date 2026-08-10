#!/usr/bin/env node
/**
 * Independent host browser verifier for P5PA-05.
 *
 * CDP is used only to find rendered controls, send mouse/keyboard input at
 * their visible coordinates, read rendered text, and capture screenshots. It
 * never invokes a Studio endpoint, injects DOM, or changes application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P5_STUDIO_URL ?? "http://127.0.0.1:41205";
const devtools = process.env.P5_DEVTOOLS_URL ?? "http://127.0.0.1:9226";
const output = resolve(process.env.P5_AUDIT_OUTPUT ?? "docs/phase5-post-audit/evidence/p5pa-05-play-find-free-games-fix");
const transcript = [];
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

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
    const target = await requestJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let requestId = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id === undefined || !pending.has(message.id)) return;
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++requestId;
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
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const wait = async (expression, description, timeout = 60000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
        note(`OBSERVE ${description}`);
    };
    const pointFor = async (expression) =>
        evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent?.trim()}; })()`);
    const control = (label) =>
        pointFor(`[...document.querySelectorAll('button,a,[role="button"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const nav = (label) => pointFor(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)})`);
    const input = (label) =>
        pointFor(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const foundRound = () => pointFor(`[...document.querySelectorAll('button')].find((e) => /^Round \\d+ in session /.test(e.textContent?.trim() ?? '') && e.getClientRects().length > 0)`);
    const click = async (target, description) => {
        if (!target?.ok) throw new Error(`No visible ${description}: ${JSON.stringify(target)}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1});
        note(`CLICK ${description} at rendered coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
        await sleep(400);
    };
    const replaceInput = async (label, value) => {
        await click(await input(label), `input ${JSON.stringify(label)}`);
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.insertText", {text: value});
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through the browser keyboard`);
        await sleep(300);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
        note(`CAPTURE ${name}.png and ${name}-visible-text.txt`);
    };

    note(`START fresh Chrome browser session against local candidate Studio ${studio}`);
    await cdp.send("Page.navigate", {url: studio});
    note("NAVIGATE rendered Studio project workspace");
    await wait("document.body.innerText.includes('Playable Game With Free Games') && [...document.querySelectorAll('nav button')].some((e) => e.textContent?.trim() === 'Play')", "free-games-capable project dashboard");
    await click(await nav("Play"), "Play navigation");
    await wait("document.body.innerText.includes('New session') && document.body.innerText.includes('Seed (optional)')", "rendered Play session setup");
    await replaceInput("Seed (optional)", "p5pa05-visible-find-free-games");
    await click(await control("New session"), "Play New session");
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Find free games' && !e.disabled)", "rendered Find free games control");
    await click(await control("Find free games"), "Find free games");
    await wait("document.body.innerText.includes('freeGamesTriggered')", "returned Play artifact visibly contains freeGamesTriggered");
    await snapshot("08-play-find-free-games-artifact");

    await click(await nav("Replay"), "Replay navigation immediately after Find free games");
    await wait("document.body.innerText.includes('Session Spin')", "Replay source chooser");
    await click(await control("Session Spin"), "Replay Session Spin source");
    await wait("document.body.innerText.includes('All sessions') && [...document.querySelectorAll('button')].some((e) => /^Round \\d+ in session /.test(e.textContent?.trim() ?? ''))", "shared recorder Session Spin entry list");
    await click(await foundRound(), "newest shared recorder round");
    await wait("document.body.innerText.includes('Loaded replay') && document.body.innerText.includes('Operation') && document.body.innerText.includes('Find free games') && document.body.innerText.includes('freeGamesTriggered')", "same shared recorder entry visibly identified as Find free games with its free-games event");
    await snapshot("09-replay-session-spin-find-free-games");
    note("COMPLETE visible Studio Play → Find free games → Replay Session Spin verification.");
    await writeFile(resolve(output, "10-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "10-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

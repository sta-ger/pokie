#!/usr/bin/env node
/**
 * Host verification for 84dc6653: uses CDP solely to read rendered controls,
 * send mouse/keyboard events, and capture the rendered page.  It never calls
 * Studio APIs or changes DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P5_STUDIO_URL ?? "http://127.0.0.1:48105";
const devtools = process.env.P5_DEVTOOLS_URL ?? "http://127.0.0.1:9485";
const output = resolve(process.env.P5_AUDIT_OUTPUT ?? "docs/phase5-post-audit/evidence/p5pa-04-multimode-outcome-library-fix/browser-ui-rerun/host-verification-84dc6653");
const transcript = [];
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const note = (message) => { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); process.stdout.write(`${line}\n`); };

async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await requestJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
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
    const wait = async (expression, description, timeout = 30000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
        note(`OBSERVE ${description}`);
    };
    const pointFor = async (expression) => evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent?.trim()}; })()`);
    const control = (label) => pointFor(`[...document.querySelectorAll('button,a,[role="button"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)})`);
    const nav = (label) => pointFor(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)})`);
    const input = (label) => pointFor(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const option = (value) => pointFor(`[...document.querySelectorAll('[role="option"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(value)} && e.getClientRects().length > 0)`);
    const click = async (target, description) => {
        if (!target?.ok) throw new Error(`No visible ${description}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1});
        note(`CLICK ${description} at rendered coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
        await sleep(400);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
        note(`CAPTURE ${name}.png and ${name}-visible-text.txt`);
    };
    const chooseBuyFeature = async () => {
        await click(await input("Outcome library mode"), "Outcome library mode picker");
        await wait(`[...document.querySelectorAll('[role="option"]')].some((e) => e.textContent?.trim() === 'buyFeature' && e.getClientRects().length > 0)`, "visible buyFeature option");
        await click(await option("buyFeature"), "buyFeature option");
        await wait(`[...document.querySelectorAll('input')].some((e) => e.getAttribute('aria-label') === 'Outcome library mode' && e.value === 'buyFeature')`, "buyFeature selected in visible mode control");
    };

    note(`START fresh local candidate Studio browser session at ${studio}`);
    await cdp.send("Page.navigate", {url: studio});
    note("NAVIGATE rendered Studio root");
    await wait(`document.body.innerText.includes('Outcome Source') && document.body.innerText.includes('buyFeature')`, "two-mode rendered Outcome Source dashboard");
    await click(await nav("Play"), "Play navigation");
    await wait(`document.body.innerText.includes('New session') && document.body.innerText.includes('Outcome library mode')`, "Play mode picker");
    await chooseBuyFeature();
    await click(await control("New session"), "New session");
    await wait(`document.body.innerText.includes('Spin')`, "Play session controls");
    await click(await control("Spin"), "Spin");
    // The selected value is visibly verified in the rendered picker above.  Once
    // the round is complete, its provenance is intentionally asserted at the
    // requested Replay → Session Spin destination below.
    await wait(`document.body.innerText.includes('Round detail')`, "completed rendered Play round");
    await snapshot("06-play-buyfeature-recorded-round");
    await click(await nav("Replay"), "Replay navigation");
    await wait(`document.body.innerText.includes('Session Spin')`, "Replay source chooser");
    await click(await control("Session Spin"), "Session Spin source");
    await wait(`document.body.innerText.includes('All sessions') && document.body.innerText.includes('Round 1 in session')`, "visible recorded Play round list");
    const row = await pointFor(`[...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith('Round 1 in session'))`);
    await click(row, "recorded Play Round 1");
    await wait(`document.body.innerText.includes('Loaded replay') && document.body.innerText.includes('Round detail')`, "artifact-backed Session Spin inspector");
    const visible = await evaluate("document.body.innerText");
    if (!visible.includes('mode buyFeature')) throw new Error('Session Spin Loaded replay card did not visibly render "mode buyFeature" provenance.');
    note('OBSERVE Session Spin Loaded replay Identities visibly renders "mode buyFeature" provenance');
    await snapshot("07-replay-session-spin-mode-buyfeature-provenance");
    note("COMPLETE Play → Replay → Session Spin provenance verification");
    await writeFile(resolve(output, "06-session-spin-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "06-session-spin-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

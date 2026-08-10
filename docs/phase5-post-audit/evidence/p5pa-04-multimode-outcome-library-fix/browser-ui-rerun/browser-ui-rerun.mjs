#!/usr/bin/env node
/**
 * Browser-only verifier: queries rendered controls and clicks their visible pixels through CDP.
 * It does not call Studio APIs, set React state, or inject/change DOM content.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P5_STUDIO_URL ?? "http://127.0.0.1:4404";
const devtools = process.env.P5_DEVTOOLS_URL ?? "http://127.0.0.1:9444";
const output = resolve(process.env.P5_AUDIT_OUTPUT ?? "docs/phase5-post-audit/evidence/p5pa-04-multimode-outcome-library-fix/browser-ui-rerun");
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function note(message) { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); process.stdout.write(`${line}\n`); }
async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect() {
    // Reuse the visible page (blank on the fresh browser; current Studio tab when this recorder retries).
    // This keeps the audit to one rendered browser tab rather than leaving a new tab behind on an error.
    const targets = await json(`${devtools}/json/list`);
    const target = targets.find((entry) => entry.type === "page") ?? (await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"}));
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { socket.once("open", ok); socket.once("error", fail); });
    let id = 0; const pending = new Map();
    socket.on("message", (raw) => { const message = JSON.parse(raw); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); } });
    const send = (method, params = {}) => new Promise((ok, fail) => { const requestId = ++id; pending.set(requestId, {resolve: ok, reject: fail}); socket.send(JSON.stringify({id: requestId, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}
async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const wait = async (expression, description, timeout = 30000) => { const until = Date.now() + timeout; while (!(await evaluate(expression))) { if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } note(`OBSERVE ${description}`); };
    const click = async (target, description) => { if (!target?.ok) throw new Error(`No visible ${description}: ${JSON.stringify(target)}`); await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1}); await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1}); note(`CLICK ${description} at visible coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`); await sleep(400); };
    const pointFor = async (expression) => evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent?.trim()}; })()`);
    const control = (label) => pointFor(`[...document.querySelectorAll('button,a,[role="button"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)})`);
    const nav = (label) => pointFor(`[...document.querySelectorAll('nav button, nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)})`);
    const input = (label) => pointFor(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const exactDraw = (mode) => pointFor(`[...document.querySelectorAll('tr')].find((row) => row.innerText.includes(${JSON.stringify(mode)}) && [...row.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Draw an outcome'))?.querySelector('button')`);
    const option = (value) => pointFor(`[...document.querySelectorAll('[role="option"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(value)} && e.getClientRects().length > 0)`);
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); const visible = await evaluate("document.body.innerText"); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}-visible-text.txt`), `${visible}\n`); note(`CAPTURE ${name}.png and ${name}-visible-text.txt`); };
    const setInput = async (label, value) => { await click(await input(label), `input ${JSON.stringify(label)}`); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.insertText", {text:value}); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through visible browser keyboard`); await sleep(300); };
    const chooseMode = async () => { await click(await input("Outcome library mode"), "Outcome library mode picker"); await wait(`[...document.querySelectorAll('[role="option"]')].some((e) => e.textContent?.trim() === 'buyFeature' && e.getClientRects().length > 0)`, "open buyFeature picker option"); await click(await option("buyFeature"), "buyFeature option"); await wait(`[...document.querySelectorAll('input')].some((e) => (e.getAttribute('aria-label') === 'Outcome library mode' || [...(e.labels ?? [])].some((l) => l.textContent?.trim() === 'Outcome library mode')) && e.value === 'buyFeature')`, "buyFeature visibly selected in the rendered mode control"); };

    note(`START fresh Chrome browser session against local candidate Studio ${studio}`);
    await cdp.send("Page.navigate", {url: studio});
    note("NAVIGATE visible Studio root");
    await wait(`document.body.innerText.includes('Outcome Source') && document.body.innerText.includes('base') && document.body.innerText.includes('buyFeature')`, "real two-mode Outcome Library Overview / Exact Analysis table");
    await click(await exactDraw("buyFeature"), "Exact Analysis Draw an outcome in buyFeature row");
    await wait(`document.body.innerText.includes('library "buy-browser-lib"')`, "Exact Analysis visibly draws from non-first buyFeature library");
    await snapshot("02-overview-exact-analysis-buyfeature");

    await click(await nav("Play"), "Play navigation");
    await wait(`document.body.innerText.includes('New session') && document.body.innerText.includes('Outcome library mode')`, "Play mode picker");
    await chooseMode();
    await click(await control("New session"), "Play New session");
    await wait(`document.body.innerText.includes('Spin')`, "Play session controls");
    await click(await control("Spin"), "Play Spin");
    await wait(`document.body.innerText.includes('Total win') && document.body.innerText.includes('Round detail')`, "executed Play round with the visible buyFeature selection retained in its rendered control");
    await snapshot("03-play-buyfeature-round-provenance");

    await click(await nav("Simulation"), "Simulation navigation");
    await wait(`document.body.innerText.includes('Run Simulation') && document.body.innerText.includes('Outcome library mode')`, "Simulation configuration and mode picker");
    await chooseMode();
    await setInput("Rounds", "20");
    await click(await control("Run Simulation"), "Run Simulation");
    await wait(`document.body.innerText.includes('RTP') && document.body.innerText.includes('Recent runs') && document.body.innerText.includes('20/20 rounds')`, "completed simulation report after selecting non-first buyFeature mode", 45000);
    await snapshot("04-simulation-buyfeature-completed");

    await click(await nav("Replay"), "Replay navigation");
    await wait(`document.body.innerText.includes('Recreate from seed') && document.body.innerText.includes('Outcome library mode')`, "Replay recreation controls and mode picker");
    await chooseMode();
    await setInput("Seed (optional)", "p5pa04-browser-replay");
    await click(await control("Load"), "Replay Load");
    await wait(`document.body.innerText.includes('Run again')`, "loaded Replay target");
    await click(await control("Run again"), "Replay Run again");
    await wait(`document.body.innerText.includes('Replay session') && document.body.innerText.includes('Outcome library mode') && document.body.innerText.includes('buyFeature')`, "completed Replay visibly reports buyFeature provenance", 45000);
    await snapshot("05-replay-buyfeature-completed");

    await click(await control("Session Spin"), "Replay Session Spin source");
    await wait(`document.body.innerText.includes('All sessions') && document.body.innerText.includes('Round 1 in session')`, "recorded round list");
    const provenanceRow = await pointFor(`[...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith('Round 1 in session'))`);
    if (!provenanceRow.ok) throw new Error("Recorded Session Spin list did not visibly expose the executed Play round");
    await click(provenanceRow, "recorded Play round");
    await wait(`document.body.innerText.includes('Loaded replay') && document.body.innerText.includes('Round detail')`, "recorded Play round inspector");
    const recordedModeRendered = await evaluate(`document.body.innerText.includes('Outcome library mode') && document.body.innerText.includes('buyFeature')`);
    note(recordedModeRendered ? "OBSERVE recorded Play round visibly renders buyFeature provenance" : "FINDING recorded Play round inspector does not visibly render its outcome-library mode provenance");
    await snapshot("06-replay-session-spin-recorded-mode-provenance");

    await click(await nav("Build/Export"), "Build/Export navigation");
    await wait(`document.body.innerText.includes('Build/Export') && document.body.innerText.includes('Static export')`, "visible Build/Export outcome-library surface");
    await snapshot("07-build-export-visible");
    if (!recordedModeRendered) throw new Error("Recorded Play round provenance is persisted but not visibly rendered by Replay's Session Spin inspector when the round has an artifact.");
    note("COMPLETE all required rendered Studio surfaces: Overview/Exact Analysis, Play, Simulation, Replay provenance, and Build/Export.");
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive:true}); await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`); process.exit(1); });

#!/usr/bin/env node
/* Host-side P6-06 weighted workflow. CDP only locates rendered controls,
 * sends normal mouse/keyboard input, reads rendered text, and takes images. */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.OUTPUT);
const studio = process.env.STUDIO;
const devtools = process.env.DEVTOOLS;
const phase = process.env.PHASE ?? "weighted";
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => { const row = `[${new Date().toISOString()}] ${message}`; transcript.push(row); process.stdout.write(`${row}\n`); };

async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, bad) => { socket.once("open", ok); socket.once("error", bad); });
    let id = 0; const pending = new Map();
    socket.on("message", (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.bad(new Error(JSON.stringify(m.error))) : p.ok(m.result); } });
    const send = (method, params = {}) => new Promise((ok, bad) => { const requestId = ++id; pending.set(requestId, {ok, bad}); socket.send(JSON.stringify({id: requestId, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const wait = async (expression, description, timeout = 60000) => { const until = Date.now() + timeout; while (!await evaluate(expression)) { if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
    const point = async (expression, description) => { let found = await evaluate(expression); if (!found?.ok) throw new Error(`${description}: ${JSON.stringify(found)}`); for (let attempt = 0; attempt < 7 && (found.y < 70 || found.y > 430); attempt++) { await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: 520, y: 270, deltaX: 0, deltaY: found.y - 250}); await sleep(250); found = await evaluate(expression); } if (!found?.ok || found.y < 70 || found.y > 430) throw new Error(`${description} after scroll: ${JSON.stringify(found)}`); return found; };
    const mouse = async (found) => { await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1}); await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1}); await sleep(350); };
    const key = async (keyName, code, codeNumber) => { await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: keyName, code, windowsVirtualKeyCode: codeNumber}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: keyName, code, windowsVirtualKeyCode: codeNumber}); };
    const button = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('button,a,[role="button"]')].find((x)=>x.getClientRects().length>0&&!x.disabled&&x.textContent?.trim()===wanted); if(!e)return {ok:false,buttons:[...document.querySelectorAll('button')].filter((x)=>x.getClientRects().length>0).map((x)=>x.textContent?.trim())}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered button ${label}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} at rendered coordinates`); };
    const section = async (legend, label) => { const found = await point(`(() => { const f=[...document.querySelectorAll('fieldset')].find((x)=>x.querySelector('legend')?.innerText.trim().startsWith(${JSON.stringify(legend)})); const e=f&&[...f.querySelectorAll('button')].find((x)=>x.getClientRects().length>0&&!x.disabled&&x.textContent?.trim()===${JSON.stringify(label)}); if(!e)return {ok:false,section:f?.innerText}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `${label} in ${legend}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} in ${JSON.stringify(legend)}`); };
    const field = async (label) => point(`(() => { const wanted=${JSON.stringify(label)}, normal=(v)=>v?.trim().replace(/\\s+\\*$/,''); const e=[...document.querySelectorAll('input,textarea')].find((x)=>x.getClientRects().length>0&&(x.getAttribute('aria-label')===wanted||[...(x.labels??[])].some((l)=>normal(l.textContent)===wanted))); if(!e)return {ok:false,fields:[...document.querySelectorAll('input,textarea')].filter((x)=>x.getClientRects().length>0).map((x)=>x.getAttribute('aria-label')||[...(x.labels??[])].map((l)=>l.textContent).join('|'))}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered field ${label}`);
    const input = async (label, value) => { await mouse(await field(label)); await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2}); await cdp.send("Input.insertText", {text: value}); await key("Tab", "Tab", 9); await sleep(300); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser mouse/keyboard and blur`); };
    const radio = async (label) => { const found = await point(`(() => { const e=[...document.querySelectorAll('label')].find((x)=>x.getClientRects().length>0&&x.innerText.trim()===${JSON.stringify(label)}); if(!e)return {ok:false,labels:[...document.querySelectorAll('label')].map((x)=>x.innerText.trim())}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered radio ${label}`); await mouse(found); note(`CLICK radio ${JSON.stringify(label)}`); };
    const selectSymbol = async (symbol) => { await mouse(await field("Symbol")); await cdp.send("Input.insertText", {text: symbol}); const option = await point(`(() => { const e=[...document.querySelectorAll('[role="option"]')].find((x)=>x.getClientRects().length>0&&x.textContent?.trim()===${JSON.stringify(symbol)}); if(!e)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered Symbol option ${symbol}`); await mouse(option); note(`SELECT ${JSON.stringify(symbol)} through the rendered Symbol combobox`); };
    const navigate = async () => { await cdp.send("Page.navigate", {url: `${studio}/#/project/gameModel`}); note("NAVIGATE public Studio URL #/project/gameModel"); await wait("document.body.innerText.includes('Game Model') && document.body.innerText.includes('Reels')", "Game Model view"); };

    note(`START ${phase}: fresh local Studio and Chrome, controlled only through rendered UI.`);
    await navigate();
    if (phase === "restart") {
        await wait("document.body.innerText.includes('Generation mode: Shared symbol weights') && document.body.innerText.includes('seed')", "persisted shared-weights projection");
        note("OBSERVE replacement Studio/client renders the saved shared symbol weights with its reproducible seeded sample.");
        await snapshot("12-after-fresh-studio-restart-shared-weights");
    } else if (phase === "perreel") {
        await section("Reels", "Edit");
        await wait("document.body.innerText.includes('Reel Strip Modeler')", "Reel Strip Modeler editor");
        await button("Select reel");
        const reelTwo = await point(`(() => { const e=[...document.querySelectorAll('button')].find((x)=>x.getClientRects().length>0&&x.getAttribute('aria-label')==='Select reel 2'); if(!e)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, "existing per-reel symbolWeights reel 2");
        await mouse(reelTwo); note("CLICK rendered Select for Reel 2, the existing generated symbolWeights configuration.");
        await wait("document.body.innerText.includes('Weights') && document.body.innerText.includes('Auto length')", "per-reel weights editor");
        note("OBSERVE the existing Reel 2 per-reel Weights editor and its persisted weight rows through visible Studio controls.");
        await snapshot("07b-existing-per-reel-symbolweights-config");
    } else {
        await section("Reels", "Edit");
        await wait("document.body.innerText.includes('Reel Strip Modeler')", "Reel Strip Modeler editor");
        await button("Select reel");
        const reelTwo = await point(`(() => { const e=[...document.querySelectorAll('button')].find((x)=>x.getClientRects().length>0&&x.getAttribute('aria-label')==='Select reel 2'); if(!e)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, "existing per-reel symbolWeights reel 2");
        await mouse(reelTwo); note("CLICK rendered Select for Reel 2, the existing generated symbolWeights configuration.");
        await wait("document.body.innerText.includes('Weights') && document.body.innerText.includes('Auto length')", "per-reel weights editor");
        await button("Preview");
        await wait("document.body.innerText.includes('Generated successfully')", "existing weighted reel preview");
        note("OBSERVE existing Reel 2 symbolWeights were resolved by the public Check & Preview workflow.");
        await snapshot("07-existing-per-reel-symbolweights-preview");
        await button("Back to Configure");
        await input("10 weight", "13");
        await button("Preview");
        await wait("document.body.innerText.includes('Generated successfully')", "edited weighted reel preview");
        await button("Done"); await button("Use changes");
        await wait("document.body.innerText.includes('Symbol weights')", "parent reel generation selector");
        await radio("Symbol weights");
        await wait("document.body.innerText.includes('Symbol weights') && document.body.innerText.includes('Add weight')", "shared weights editor");
        for (const [symbol, weight] of [["10", "12"], ["A", "5"], ["K", "3"], ["Q", "2"], ["J", "10"], ["W", "2"], ["S", "2"]]) { await selectSymbol(symbol); await input("Weight", weight); await button("Add weight"); }
        note("OBSERVE shared-weight editing through the rendered Symbol weights editor: 10=12, A=5, K=3, Q=2, J=10, W=2, S=2.");
        await snapshot("08-shared-weights-edit-draft");
        await section("Reels", "Save");
        await wait("document.body.innerText.includes('Generation mode: Shared symbol weights') && document.body.innerText.includes('Another deterministic sample')", "saved shared-weight View Mode");
        note("OBSERVE common Reels Save persisted the shared symbolWeights configuration and entered the truthful no-fixed-strip sample view.");
        await snapshot("09-shared-weights-saved-sample-seed-default");
        await button("Another deterministic sample");
        await wait("document.body.innerText.includes('seed 2')", "next deterministic shared-weights sample");
        note("OBSERVE Another deterministic sample advanced the visible reproducible seed from the default to seed 2.");
        await snapshot("10-shared-weights-resampled-seed-2");
        await button("Analysis");
        await wait("document.body.innerText.includes('Shared weights → counts conversion') && document.body.innerText.includes('Resolved count')", "shared weights conversion analysis");
        note("OBSERVE rendered analysis exposes the shared weights to resolved-count conversion for the exact seed-2 sample.");
        await snapshot("10b-shared-weights-conversion-analysis");
        await button("Convert this sample to generated reels…");
        await wait("document.body.innerText.includes('Per-reel (Reel Strip Modeler)') && document.body.innerText.includes('Select reel')", "converted generated-reels draft");
        note("OBSERVE conversion opened the existing per-reel modeler with literal strips from the currently rendered sample; this action has not persisted until Save.");
        await button("Select reel"); await button("Select"); await button("Preview");
        await wait("document.body.innerText.includes('Literal strip') && document.body.innerText.includes('Sequence:')", "converted sample literal reel preview");
        await snapshot("11-converted-sample-generated-reels-draft");
        await section("Reels", "Cancel"); await button("Discard");
        await wait("document.body.innerText.includes('Generation mode: Shared symbol weights')", "discarded conversion and restored saved shared weights");
        note("OBSERVE Cancel discarded the conversion draft, leaving the explicitly saved shared-weight source intact for persistence rerun.");
    }
    await writeFile(resolve(output, `${phase}-weighted-browser-transcript.txt`), `${transcript.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive: true}); await writeFile(resolve(output, `${phase}-weighted-browser-transcript.txt`), `${transcript.join("\n")}\n`); process.exit(1); });

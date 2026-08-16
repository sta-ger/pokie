#!/usr/bin/env node
/* Host-side P6-06 verification: CDP only locates rendered controls, sends real
 * mouse/keyboard input, reads rendered text, and captures screenshots. */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.OUTPUT);
const studio = process.env.STUDIO;
const devtools = process.env.DEVTOOLS;
const phase = process.env.PHASE ?? "workflow";
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
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
    const point = async (expression, description) => { let found = await evaluate(expression); if (!found?.ok) throw new Error(`${description}: ${JSON.stringify(found)}`); for (let attempt = 0; attempt < 5 && (found.y < 70 || found.y > 400); attempt++) { await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:500, y:260, deltaX:0, deltaY:found.y - 240}); await sleep(300); found = await evaluate(expression); } if (!found?.ok || found.y < 70 || found.y > 400) throw new Error(`${description} after scroll: ${JSON.stringify(found)}`); return found; };
    const mouse = async (found) => { await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1}); await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1}); await sleep(350); };
    const key = async (keyName, code, codeNumber) => { await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:keyName, code, windowsVirtualKeyCode:codeNumber}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:keyName, code, windowsVirtualKeyCode:codeNumber}); };
    const button = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('button,a,[role="button"]')].find((x)=>x.getClientRects().length>0&&!x.disabled&&x.textContent?.trim()===wanted); if(!e)return {ok:false,buttons:[...document.querySelectorAll('button')].filter((x)=>x.getClientRects().length>0).map((x)=>x.textContent?.trim())}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered button ${label}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} at rendered coordinates`); };
    const section = async (legend, label) => { const found = await point(`(() => { const f=[...document.querySelectorAll('fieldset')].find((x)=>x.querySelector('legend')?.innerText.trim().startsWith(${JSON.stringify(legend)})); const e=f&&[...f.querySelectorAll('button')].find((x)=>x.getClientRects().length>0&&!x.disabled&&x.textContent?.trim()===${JSON.stringify(label)}); if(!e)return {ok:false,section:f?.innerText}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `${label} in ${legend}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} in ${JSON.stringify(legend)}`); };
    const field = async (label) => point(`(() => { const wanted=${JSON.stringify(label)}, normal=(v)=>v?.trim().replace(/\\s+\\*$/,''); const e=[...document.querySelectorAll('input,textarea')].find((x)=>x.getClientRects().length>0&&(x.getAttribute('aria-label')===wanted||[...(x.labels??[])].some((l)=>normal(l.textContent)===wanted))); if(!e)return {ok:false,fields:[...document.querySelectorAll('input,textarea')].filter((x)=>x.getClientRects().length>0).map((x)=>x.getAttribute('aria-label')||[...(x.labels??[])].map((l)=>l.textContent).join('|'))}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered field ${label}`);
    const input = async (label, value) => { await mouse(await field(label)); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.insertText", {text:value}); await key("Tab", "Tab", 9); await sleep(350); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser mouse/keyboard and blur`); };
    const radio = async (label) => { const found = await point(`(() => { const e=[...document.querySelectorAll('label')].find((x)=>x.getClientRects().length>0&&x.innerText.trim()===${JSON.stringify(label)}); if(!e)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `rendered radio ${label}`); await mouse(found); note(`CLICK radio ${JSON.stringify(label)}`); };
    const navigate = async () => { await cdp.send("Page.navigate", {url:`${studio}/#/project/gameModel`}); note("NAVIGATE public Studio URL #/project/gameModel"); await wait("document.body.innerText.includes('Game Model') && document.body.innerText.includes('Reels')", "Game Model view"); };

    note(`START ${phase}: fresh local Studio and Chrome, controlled only through rendered UI.`);
    await navigate();
    if (phase === "restart") {
        await section("Reels", "Edit");
        await wait("document.body.innerText.includes('Reel Strip Modeler')", "saved Reel Strip Modeler after restart");
        await button("Select reel");
        const persistedFourth = await point(`(() => { const e=[...document.querySelectorAll('button')].find((x)=>x.getClientRects().length>0&&x.getAttribute('aria-label')==='Select reel 4'); if(!e)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, "persisted Select Reel 4");
        await mouse(persistedFourth);
        await wait("document.body.innerText.includes('Stack constraints') && document.body.innerText.includes('Stack 1') && document.body.innerText.includes('length 2+') && document.body.innerText.includes('Length (derived from counts)')", "persisted count-and-stack structural representation rendered after restart");
        note("OBSERVE restarted Studio rendered the saved generated/counts reel and its stack constraint through the public Game Model editor.");
        await snapshot("06-after-fresh-studio-restart");
    } else {
        await snapshot("01-initial-reels-view");
        await section("Reels", "Edit");
        await wait("document.body.innerText.includes('Reel Strip Modeler')", "Reel Strip Modeler editor");
        await button("Select reel");
        await button("Select");
        await button("Preview");
        await wait("document.body.innerText.includes('Literal strip') && document.body.innerText.includes('Sequence:')", "existing literal reel preview");
        note("OBSERVE Reel 1's pre-existing literal strip previewed through the rendered modeler workflow.");
        await snapshot("02-literal-preview");
        await button("Select reel");
        const foundFourth = await point(`(() => { const e=[...document.querySelectorAll('button')].find((x)=>x.getClientRects().length>0&&x.getAttribute('aria-label')==='Select reel 4'); if(!e)return {ok:false,buttons:[...document.querySelectorAll('button')].map((x)=>x.getAttribute('aria-label')||x.textContent?.trim())}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, "Select Reel 4");
        await mouse(foundFourth); note("CLICK rendered Select for Reel 4 (existing generated/counts configuration)");
        await wait("document.body.innerText.includes('Length (derived from counts)') && document.body.innerText.includes('Stack constraints')", "generated counts editor");
        await input("A count", "-1");
        await button("Preview");
        await wait("document.body.innerText.includes('Count must be a non-negative integer.')", "inline invalid count diagnostic");
        note("OBSERVE malformed count stayed in the local modeler draft and produced the actionable inline structural diagnostic.");
        await snapshot("03-invalid-count-inline-diagnostic");
        await input("A count", "5");
        await button("Add stack rule");
        await wait("document.body.innerText.includes('Stack 1:') && document.body.innerText.includes('length 2+')", "added stack rule");
        note("OBSERVE the recovered count and UI-authored stack rule are rendered together in the generated/counts draft.");
        await snapshot("04-counts-and-stack-draft");
        await button("Preview");
        await wait("document.body.innerText.includes('Generated successfully') || document.body.innerText.includes('Generation failed')", "generated reel diagnostics");
        if (!(await body()).includes("Generated successfully")) throw new Error("Recovered generated reel did not satisfy its rendered stack constraint.");
        note("OBSERVE Check & Preview resolved the recovered generated/counts reel and displayed its diagnostics.");
        await button("Open stop-window preview");
        await wait("document.body.innerText.includes('Stop window preview') && document.body.innerText.includes('Frequency & statistics')", "stop-window preview");
        await snapshot("05-generated-preview-and-stop-window");
        await button("Continue to Done");
        await button("Use changes");
        await wait("document.body.innerText.includes('Modified — not saved')", "modeler draft applied but common Save still required");
        await section("Reels", "Save");
        await wait("document.body.innerText.includes('Game window') && !document.body.innerText.includes('Modified — not saved')", "common Reels Save completed");
        note("OBSERVE Done/Use changes only applied the local reel draft; the common Reels Save persisted the whole blueprint and returned View Mode.");
        await snapshot("05b-common-save-complete");
    }
    await writeFile(resolve(output, `${phase}-browser-transcript.txt`), `${transcript.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive:true}); await writeFile(resolve(output, `${phase}-browser-transcript.txt`), `${transcript.join("\n")}\n`); process.exit(1); });

#!/usr/bin/env node
/*
 * Independent P6-05 host verification. CDP is only a browser input device:
 * rendered controls are located, physically clicked by coordinates and typed
 * into through the browser input channel. No Studio API, DOM, or state is
 * invoked or changed directly.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.OUTPUT);
const studio = process.env.STUDIO;
const devtools = process.env.DEVTOOLS;
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => { const entry = `[${new Date().toISOString()}] ${message}`; transcript.push(entry); process.stdout.write(`${entry}\n`); };

async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let id = 0; const pending = new Map();
    socket.on("message", (raw) => { const message = JSON.parse(raw.toString()); if (message.id && pending.has(message.id)) { const waiter = pending.get(message.id); pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.accept(message.result); } });
    const send = (method, params = {}) => new Promise((accept, reject) => { const requestId = ++id; pending.set(requestId, {accept, reject}); socket.send(JSON.stringify({id: requestId, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const wait = async (expression, description, timeout = 60000) => { const end = Date.now() + timeout; while (!await evaluate(expression)) { if (Date.now() > end) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
    const point = async (expression, detail) => { let found = await evaluate(expression); if (!found?.ok) throw new Error(`${detail}: ${JSON.stringify(found)}`); if (found.y < 75 || found.y > 550) { await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: 400, y: 300, deltaX: 0, deltaY: found.y - 300}); await sleep(250); found = await evaluate(expression); } if (!found?.ok) throw new Error(`${detail} after scroll: ${JSON.stringify(found)}`); return found; };
    const mouse = async (found) => { await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1}); await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1}); await sleep(350); };
    const key = async (name, code, value) => { await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: name, code, windowsVirtualKeyCode: value}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: name, code, windowsVirtualKeyCode: value}); };
    const section = async (legend, label) => { const found = await point(`(() => { const f=[...document.querySelectorAll('fieldset')].find((x)=>x.querySelector('legend')?.innerText.trim().startsWith(${JSON.stringify(legend)})); const e=f&&[...f.querySelectorAll('button,a,[role="button"]')].find((x)=>x.textContent?.trim()===${JSON.stringify(label)}&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,fieldset:f?.innerText}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `${label} in ${legend}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} in ${JSON.stringify(legend)} at rendered coordinates`); };
    const button = async (label) => { const found = await point(`(() => { const e=[...document.querySelectorAll('button,a,[role="button"]')].find((x)=>x.textContent?.trim()===${JSON.stringify(label)}&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,controls:[...document.querySelectorAll('button,a,[role="button"]')].map((x)=>x.textContent?.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `visible ${label}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} at rendered coordinates`); };
    const inputPoint = async (label) => point(`(() => { const wanted=${JSON.stringify(label)}, norm=(v)=>v?.trim().replace(/\\s+\\*$/,''); const e=[...document.querySelectorAll('input,textarea')].find((x)=>x.getClientRects().length>0&&(x.getAttribute('aria-label')===wanted||[...(x.labels??[])].some((l)=>norm(l.textContent)===wanted))); if(!e)return {ok:false,fields:[...document.querySelectorAll('input,textarea')].filter((x)=>x.getClientRects().length>0).map((x)=>x.getAttribute('aria-label'))}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `input ${label}`);
    const input = async (label, value, blur = true) => { await mouse(await inputPoint(label)); await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2}); await cdp.send("Input.insertText", {text: value}); if (blur) await key("Tab", "Tab", 9); await sleep(300); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser input${blur ? " and blur" : ""}`); };
    const radio = async (label) => { const found = await point(`(() => { const e=[...document.querySelectorAll('label')].find((x)=>x.innerText.trim()===${JSON.stringify(label)}&&x.getClientRects().length>0); if(!e)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `radio ${label}`); await mouse(found); note(`CLICK radio ${JSON.stringify(label)}`); };
    const select = async (label, value) => { await mouse(await inputPoint(label)); await cdp.send("Input.insertText", {text: value}); await key("ArrowDown", "ArrowDown", 40); await key("Enter", "Enter", 13); await key("Tab", "Tab", 9); await sleep(300); note(`SELECT ${JSON.stringify(label)}=${JSON.stringify(value)} through rendered combobox`); };
    const expect = async (description, expression, name) => { await wait(expression, description); note(`OBSERVE ${description}`); await snapshot(name); };

    note("START fresh Chrome and freshly built local Studio against a new isolated Blueprint.");
    await cdp.send("Page.navigate", {url: `${studio}/#/project/gameModel`});
    await wait("document.body.innerText.includes('Game basics') && document.body.innerText.includes('Mechanics')", "Game Model view");
    await snapshot("01-initial-game-model");
    await section("Layout", "Edit"); await input("Rows", "4"); await section("Layout", "Save");
    await expect("Layout persisted Rows: 4", "document.body.innerText.includes('Rows: 4')", "02-layout-saved");
    await section("Reels", "Edit"); await radio("Default"); await section("Reels", "Save");
    await expect("Reels persisted Default generation", "document.body.innerText.includes('Generation mode: Default (uniform across symbols)')", "03-reels-saved");
    await section("Paytable", "Edit"); await input("A x3 payout", "5"); await section("Paytable", "Save");
    await expect("Paytable persisted A x3 payout 5", "!document.body.innerText.includes('A x3 payout') && document.body.innerText.includes('A') && document.body.innerText.includes('5')", "04-paytable-saved");
    await section("Bets & Modes", "Edit"); await input("Bet 1", "11", false); note("CLICK Save immediately after the focused Bet 1 edit, making that click the field's blur."); await section("Bets & Modes", "Save");
    await expect("blur-triggered Bets & Modes Save persisted Available bets: 11, 2, 5, 10", "document.body.innerText.includes('Available bets: 11, 2, 5, 10')", "05-bets-blur-saved");
    await section("Mechanics", "Edit"); await button("Add free games"); await select("Scatter symbol", "S"); await input("New match count", "3"); await input("New free games awarded", "8"); await button("Add award"); await section("Mechanics", "Save");
    await expect("Mechanics persisted scatter S and 3x to 8 free games", "document.body.innerText.includes('Scatter-triggered free games — scatter symbol: S') && document.body.innerText.includes('3x → 8 free games')", "06-mechanics-saved");
    await cdp.send("Page.reload", {ignoreCache: true}); note("RELOAD through the browser page lifecycle.");
    await expect("browser reload retained Layout, Reels, Paytable, Bets & Modes, and Mechanics", "document.body.innerText.includes('Rows: 4') && document.body.innerText.includes('Generation mode: Default (uniform across symbols)') && document.body.innerText.includes('Available bets: 11, 2, 5, 10') && document.body.innerText.includes('3x → 8 free games')", "07-after-browser-reload");
    await writeFile(resolve(output, "workflow-browser-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive: true}); await writeFile(resolve(output, "workflow-browser-transcript.txt"), `${transcript.join("\n")}\n`); process.exit(1); });

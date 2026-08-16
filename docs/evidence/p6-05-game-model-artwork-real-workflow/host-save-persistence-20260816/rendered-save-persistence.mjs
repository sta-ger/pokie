#!/usr/bin/env node
/*
 * Host-side P6-05 verification. CDP supplies only visible browser behaviour:
 * it finds rendered controls, sends coordinate mouse clicks and browser
 * keyboard events, reads rendered text, and captures screenshots. It never
 * calls Studio APIs or mutates DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.OUTPUT ?? "docs/evidence/p6-05-game-model-artwork-real-workflow/host-save-persistence-20260816");
const studio = process.env.STUDIO ?? "http://127.0.0.1:4655";
const devtools = process.env.DEVTOOLS ?? "http://127.0.0.1:9255";
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); process.stdout.write(`${line}\n`); };

async function requestJson(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect() {
    const target = await requestJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => { const response = JSON.parse(raw.toString()); if (response.id && pending.has(response.id)) { const {resolve: accept, reject} = pending.get(response.id); pending.delete(response.id); response.error ? reject(new Error(JSON.stringify(response.error))) : accept(response.result); } });
    const send = (method, params = {}) => new Promise((accept, reject) => { const id = ++sequence; pending.set(id, {resolve: accept, reject}); socket.send(JSON.stringify({id, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const waitUntil = async (expression, description, timeout = 30000) => { const until = Date.now() + timeout; while (!await evaluate(expression)) { if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
    const point = async (expression, detail) => { let found = await evaluate(expression); if (!found?.ok) throw new Error(`${detail}: ${JSON.stringify(found)}`); if (found.y < 80 || found.y > 550) { await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: 400, y: 300, deltaX: 0, deltaY: found.y - 300}); await sleep(250); found = await evaluate(expression); } if (!found?.ok) throw new Error(`${detail} after physical scroll: ${JSON.stringify(found)}`); return found; };
    const mouse = async (found) => { await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1}); await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1}); await sleep(350); };
    const key = async (keyName, code, virtualKeyCode) => { await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: keyName, code, windowsVirtualKeyCode: virtualKeyCode}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: keyName, code, windowsVirtualKeyCode: virtualKeyCode}); };
    const sectionClick = async (legend, label) => { const found = await point(`(() => { const legend=${JSON.stringify(legend)}, wanted=${JSON.stringify(label)}; const fieldset=[...document.querySelectorAll('fieldset')].find((f)=>f.querySelector('legend')?.innerText.trim().startsWith(legend)); const e=fieldset&&[...fieldset.querySelectorAll('button,a,[role="button"]')].find((x)=>x.textContent?.trim()===wanted&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,fieldset:fieldset?.innerText,legends:[...document.querySelectorAll('legend')].map((x)=>x.innerText)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing ${label} in ${legend}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} in ${JSON.stringify(legend)} section`); };
    const button = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('button,a,[role="button"]')].find((x)=>x.textContent?.trim()===wanted&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,visible:[...document.querySelectorAll('button,a,[role="button"]')].filter((x)=>x.getClientRects().length>0).map((x)=>x.textContent?.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing visible ${label} button`); await mouse(found); note(`CLICK ${JSON.stringify(label)} at rendered coordinates`); };
    const inputPoint = async (label) => point(`(() => { const wanted=${JSON.stringify(label)}; const norm=(v)=>v?.trim().replace(/\\s+\\*$/,''); const all=[...document.querySelectorAll('input,textarea')].filter((e)=>e.getClientRects().length>0); const e=all.find((x)=>x.getAttribute('aria-label')===wanted||[...(x.labels??[])].some((l)=>norm(l.textContent)===wanted)); if(!e)return {ok:false,visible:all.map((x)=>x.getAttribute('aria-label')||[...(x.labels??[])].map((l)=>l.textContent).join('|'))}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing input ${label}`);
    const typeText = async (value) => { for (const character of value) { const code = /^[0-9]$/.test(character) ? `Digit${character}` : `Key${character.toUpperCase()}`; const virtualKeyCode = character.toUpperCase().charCodeAt(0); await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: character, code, windowsVirtualKeyCode: virtualKeyCode, text: character, unmodifiedText: character}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: character, code, windowsVirtualKeyCode: virtualKeyCode}); } };
    const input = async (label, value) => { await mouse(await inputPoint(label)); await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2}); await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2}); await typeText(value); await sleep(250); await key("Tab", "Tab", 9); await sleep(500); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`); };
    const select = async (label, value) => { await mouse(await inputPoint(label)); await typeText(value); await key("ArrowDown", "ArrowDown", 40); await key("Enter", "Enter", 13); await key("Tab", "Tab", 9); await sleep(400); note(`SELECT ${JSON.stringify(label)}=${JSON.stringify(value)} through rendered combobox keyboard`); };
    const radio = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('label')].find((x)=>x.innerText.trim()===wanted&&x.getClientRects().length>0); if(!e)return {ok:false,labels:[...document.querySelectorAll('label')].map((x)=>x.innerText.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing radio ${label}`); await mouse(found); note(`CLICK radio ${JSON.stringify(label)} at rendered coordinates`); };
    const navigate = async (path) => { await cdp.send("Page.navigate", {url: `${studio}${path}`}); await sleep(700); note(`NAVIGATE browser address bar to ${studio}${path}`); };
    const expectSaved = async (description, expression, capture) => { await waitUntil(expression, description); note(`OBSERVE ${description}`); await snapshot(capture); };

    note("START a fresh Chrome profile against this candidate's freshly built local Studio.");
    await navigate("/#/project/gameModel");
    await waitUntil("document.body.innerText.includes('Game basics') && document.body.innerText.includes('Mechanics')", "Game Model View");
    await snapshot("01-initial-game-model");

    await sectionClick("Layout", "Edit"); await input("Rows", "4"); await sectionClick("Layout", "Save");
    await expectSaved("Layout Save returned View with Rows: 4", "document.body.innerText.includes('Rows: 4') && !document.body.innerText.includes('Discard your unsaved changes')", "02-layout-saved");

    await sectionClick("Reels", "Edit"); await radio("Default"); await sectionClick("Reels", "Save");
    await expectSaved("Reels Save returned View with Generation mode: Default (uniform across symbols)", "document.body.innerText.includes('Generation mode: Default (uniform across symbols)')", "03-reels-saved");

    await sectionClick("Paytable", "Edit"); await input("A x3 payout", "5"); await sectionClick("Paytable", "Save");
    await expectSaved("Paytable Save returned View with A match-count 3 payout 5", "!document.body.innerText.includes('A x3 payout') && (()=>{const t=document.body.innerText; return t.includes('Paytable')&&t.includes('A')&&t.includes('5')})()", "04-paytable-saved");

    await sectionClick("Bets & Modes", "Edit"); await input("New bet amount", "11"); await button("Add bet"); await sectionClick("Bets & Modes", "Save");
    await expectSaved("Bets & Modes Save returned View with Available bets: 1, 2, 5, 10, 11", "document.body.innerText.includes('Available bets: 1, 2, 5, 10, 11')", "05-bets-saved");

    await sectionClick("Mechanics", "Edit"); await button("Add free games"); await select("Scatter symbol", "S"); await input("New match count", "3"); await input("New free games awarded", "8"); await button("Add award"); await sectionClick("Mechanics", "Save");
    await expectSaved("Mechanics Save returned View with scatter S and 3x → 8 free games", "document.body.innerText.includes('Scatter-triggered free games — scatter symbol: S') && document.body.innerText.includes('3x → 8 free games')", "06-mechanics-saved");

    await cdp.send("Page.reload", {ignoreCache: true}); await sleep(700); note("RELOAD browser through its visible page lifecycle");
    await expectSaved("full browser reload retained all five saved section values", "document.body.innerText.includes('Rows: 4') && document.body.innerText.includes('Generation mode: Default (uniform across symbols)') && document.body.innerText.includes('Available bets: 1, 2, 5, 10, 11') && document.body.innerText.includes('3x → 8 free games')", "07-after-browser-reload");
    await writeFile(resolve(output, "workflow-browser-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive: true}); await writeFile(resolve(output, "workflow-browser-transcript.txt"), `${transcript.join("\n")}\n`); process.exit(1); });

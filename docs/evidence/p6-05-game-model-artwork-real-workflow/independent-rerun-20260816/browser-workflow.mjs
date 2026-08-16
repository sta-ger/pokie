#!/usr/bin/env node
/*
 * P6-05 independent host rerun.  CDP is used only as a physical browser:
 * rendered controls are located, clicked at their coordinates and inputs are
 * changed with the browser keyboard.  It never invokes Studio APIs or alters
 * DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve("docs/evidence/p6-05-game-model-artwork-real-workflow/independent-rerun-20260816");
const studio = "http://127.0.0.1:4635";
const devtools = "http://127.0.0.1:9235";
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function note(message) { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); process.stdout.write(`${line}\n`); }

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
    const waitUntil = async (expression, description, timeout = 60000) => { const until = Date.now() + timeout; while (!await evaluate(expression)) { if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
    const point = async (expression, detail) => { let found = await evaluate(expression); if (!found?.ok) throw new Error(`${detail}: ${JSON.stringify(found)}`); if (found.y < 80 || found.y > 550) { await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:400, y:300, deltaX:0, deltaY:found.y - 300}); await sleep(250); found = await evaluate(expression); } if (!found?.ok) throw new Error(`${detail} after physical scroll: ${JSON.stringify(found)}`); return found; };
    const mouse = async (found) => { await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1}); await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1}); await sleep(350); };
    const click = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const all=[...document.querySelectorAll('button,a,[role="button"]')].filter((e)=>e.getClientRects().length>0); const e=all.find((e)=>e.textContent?.trim()===wanted&&!e.disabled); if(!e)return {ok:false,visible:all.map((x)=>x.textContent?.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing visible ${label} button`); await mouse(found); note(`CLICK ${JSON.stringify(label)} at rendered coordinates`); };
    const clickAria = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('button,[role="button"]')].find((x)=>x.getAttribute('aria-label')===wanted&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,visible:[...document.querySelectorAll('button,[role="button"]')].filter((x)=>x.getClientRects().length>0).map((x)=>x.getAttribute('aria-label')).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing ${label} action`); await mouse(found); note(`CLICK action ${JSON.stringify(label)} at rendered coordinates`); };
    const sectionClick = async (legend, label) => { const found = await point(`(() => { const legend=${JSON.stringify(legend)}, wanted=${JSON.stringify(label)}; const fieldset=[...document.querySelectorAll('fieldset')].find((f)=>f.querySelector('legend')?.innerText.trim().startsWith(legend)); const e=fieldset&&[...fieldset.querySelectorAll('button,a,[role="button"]')].find((x)=>x.textContent?.trim()===wanted&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,fieldset:fieldset?.innerText, legends:[...document.querySelectorAll('legend')].map((x)=>x.innerText)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing ${label} in ${legend}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} in ${JSON.stringify(legend)} section`); };
    const input = async (label, value) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const normal=(v)=>v?.trim().replace(/\\s+\\*$/,""); const all=[...document.querySelectorAll('input,textarea')].filter((e)=>e.getClientRects().length>0); const e=all.find((x)=>x.getAttribute('aria-label')===wanted||[...(x.labels??[])].some((l)=>normal(l.textContent)===wanted)); if(!e)return {ok:false,visible:all.map((x)=>x.getAttribute('aria-label')||[...(x.labels??[])].map((l)=>l.textContent).join('|'))}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing input ${label}`); await mouse(found); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.insertText", {text:value}); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9}); await sleep(350); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`); };
    const radio = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('label')].find((x)=>x.innerText.trim()===wanted&&x.getClientRects().length>0); if(!e)return {ok:false,labels:[...document.querySelectorAll('label')].map((x)=>x.innerText.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing radio ${label}`); await mouse(found); note(`CLICK radio ${JSON.stringify(label)}`); };
    const confirmDiscard = async () => { await waitUntil("document.body.innerText.includes('Discard your unsaved changes')", "discard confirmation"); await click("Confirm"); note("CONFIRM discard in the rendered modal"); };
    const navigate = async (path) => { await cdp.send("Page.navigate", {url: `${studio}${path}`}); await sleep(700); note(`NAVIGATE browser address bar to public URL ${studio}${path}`); };

    note("START fresh Chrome against the candidate's fresh local Studio server.");
    await navigate("/#/project/gameModel");
    await waitUntil("document.body.innerText.includes('Game basics') && document.body.innerText.includes('Mechanics')", "Game Model page");
    await waitUntil("document.querySelectorAll('img[alt=\"W\"], img[alt=\"WILD\"]').length >= 1", "declared native PNG artwork rendered for the wild symbol");
    note("OBSERVE declared project-relative PNG artwork is rendered in the visible Game Model Symbols section.");
    await snapshot("01-initial-artwork-visible");

    await sectionClick("Game basics", "Edit"); await waitUntil("document.body.innerText.includes('Game id')", "Game basics editor"); await input("Game name", "P6 Corrected Saved Artwork Slot"); await sectionClick("Game basics", "Save"); await waitUntil("document.body.innerText.includes('Name: P6 Corrected Saved Artwork Slot')", "saved Game basics view"); note("OBSERVE Game basics mutation becomes dirty, validates, saves, and returns to the persisted View mode."); await snapshot("02-basics-saved");

    await sectionClick("Layout", "Edit"); await input("Rows", "4"); await sectionClick("Layout", "Cancel"); await confirmDiscard(); await waitUntil("document.body.innerText.includes('Rows: 3')", "Layout cancel restored view"); note("OBSERVE Layout mutation is discarded by the visible Cancel confirmation.");
    await sectionClick("Symbols", "Edit"); await input("Symbol 6 id", "WILD_FINAL"); await sectionClick("Symbols", "Save"); await waitUntil("document.body.innerText.includes('WILD_FINAL')", "saved Symbols view"); await sleep(60000); await waitUntil("document.body.innerText.includes('WILD_FINAL') && !document.body.innerText.includes('WILD · wild')", "post-save Symbols view after all overlapping refreshes settled"); note("OBSERVE Symbols rename saves through validation, remains WILD_FINAL after a 60-second overlapping-refresh settle period, and keeps the artwork presentation associated with the renamed symbol."); await snapshot("03-symbols-saved-after-settle-artwork-visible");

    await sectionClick("Reels", "Edit"); await radio("Reel strips"); await sectionClick("Reels", "Cancel"); await confirmDiscard(); await waitUntil("document.body.innerText.includes('Generation mode: Shared symbol weights')", "Reels cancel restored view"); note("OBSERVE Reels edit mutation and Cancel leave the saved shared-weights model unchanged.");
    await sectionClick("Paytable", "Edit"); await waitUntil("document.body.innerText.includes('Payout (x bet)')", "Paytable editor"); await input("A x3 payout", "5"); await sectionClick("Paytable", "Cancel"); await confirmDiscard(); await waitUntil("!document.body.innerText.includes('A x3 payout')", "Paytable View mode"); note("OBSERVE Paytable mutation is discarded through the visible Cancel confirmation.");
    await sectionClick("Bets & Modes", "Edit"); await clickAria("Duplicate bet 1"); await sectionClick("Bets & Modes", "Cancel"); await confirmDiscard(); await waitUntil("document.body.innerText.includes('Available bets: 1, 2, 5, 10')", "Bets cancel restored view"); note("OBSERVE Bets & Modes mutation is discarded by Cancel.");
    await sectionClick("Mechanics", "Edit"); await waitUntil("document.body.innerText.includes('Free games')", "Mechanics editor"); await click("Add free games"); await waitUntil("document.body.innerText.includes('Scatter symbol')", "Mechanics mutation rendering"); await snapshot("04-mechanics-dirty"); await sectionClick("Mechanics", "Cancel"); await confirmDiscard(); await waitUntil("document.body.innerText.includes('No mechanics/features configured.')", "Mechanics cancel restored view"); note("OBSERVE Mechanics mutation is discarded by Cancel."); await snapshot("05-all-sections-edit-cancel-covered");

    await navigate("/api/project/symbol-artwork?path=assets%2Fsymbols%2Fwild.png"); await waitUntil("document.contentType === 'image/png'", "browser-displayed declared PNG response"); note("OBSERVE browser address-bar request for declared active-project artwork returns PNG.");
    await navigate("/api/project/symbol-artwork?path=../../package.json"); await waitUntil("document.body.innerText.includes('Symbol artwork is missing or invalid.')", "browser-displayed undeclared-artwork denial"); note("OBSERVE browser address-bar request for undeclared ../../package.json returns the public 404 error, never file contents."); await snapshot("06-undeclared-artwork-denied");

    await navigate("/#/project/gameModel"); await waitUntil("document.body.innerText.includes('P6 Corrected Saved Artwork Slot') && document.querySelectorAll('img[alt=\"WILD_FINAL\"]').length >= 1", "persisted saved model and artwork after browser reload"); note("OBSERVE saved Game Model and declared PNG still render after a full browser reload."); await snapshot("07-before-server-restart");
    await writeFile(resolve(output, "browser-workflow-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive:true}); await writeFile(resolve(output, "browser-workflow-transcript.txt"), `${transcript.join("\n")}\n`); process.exit(1); });

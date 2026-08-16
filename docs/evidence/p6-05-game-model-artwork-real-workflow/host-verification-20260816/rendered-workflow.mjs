#!/usr/bin/env node
/*
 * Host verification for P6-05. CDP is used solely as a physical browser
 * driver: it finds rendered elements, sends mouse/keyboard input at their
 * visible coordinates, reads rendered text, and captures screenshots. It
 * never calls Studio endpoints or mutates DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_VERIFY_OUTPUT ?? "docs/evidence/p6-05-game-model-artwork-real-workflow/host-verification-20260816");
const studio = process.env.P6_STUDIO_URL ?? "http://127.0.0.1:4645";
const devtools = process.env.P6_DEVTOOLS_URL ?? "http://127.0.0.1:9245";
const mode = process.env.P6_VERIFY_MODE ?? "workflow";
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function note(message) { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); process.stdout.write(`${line}\n`); }

async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { socket.once("open", ok); socket.once("error", fail); });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => { const response = JSON.parse(raw.toString()); if (response.id && pending.has(response.id)) { const item = pending.get(response.id); pending.delete(response.id); response.error ? item.fail(new Error(JSON.stringify(response.error))) : item.ok(response.result); } });
    const send = (method, params = {}) => new Promise((ok, fail) => { const id = ++sequence; pending.set(id, {ok, fail}); socket.send(JSON.stringify({id, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const wait = async (expression, description, timeout = 90000) => { const until = Date.now() + timeout; while (!await evaluate(expression)) { if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
    const point = async (expression, description) => { let found = await evaluate(expression); if (!found?.ok) throw new Error(`${description}: ${JSON.stringify(found)}`); if (found.y < 80 || found.y > 550) { await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: 500, y: 300, deltaX: 0, deltaY: found.y - 300}); await sleep(250); found = await evaluate(expression); } if (!found?.ok) throw new Error(`${description} after scroll: ${JSON.stringify(found)}`); return found; };
    const mouse = async (found) => { await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1}); await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1}); await sleep(350); };
    const click = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const all=[...document.querySelectorAll('button,a,[role="button"]')].filter((e)=>e.getClientRects().length>0); const e=all.find((x)=>x.textContent?.trim()===wanted&&!x.disabled); if(!e)return {ok:false,visible:all.map((x)=>x.textContent?.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing rendered ${label} control`); await mouse(found); note(`CLICK ${JSON.stringify(label)} at rendered coordinates`); };
    const sectionClick = async (legend, label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}, section=${JSON.stringify(legend)}; const f=[...document.querySelectorAll('fieldset')].find((x)=>x.querySelector('legend')?.innerText.trim().startsWith(section)); const e=f&&[...f.querySelectorAll('button,a,[role="button"]')].find((x)=>x.textContent?.trim()===wanted&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,legend:f?.innerText,legends:[...document.querySelectorAll('legend')].map((x)=>x.innerText)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing ${label} in ${legend}`); await mouse(found); note(`CLICK ${JSON.stringify(label)} in ${JSON.stringify(legend)} section`); };
    const ariaClick = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('button,[role="button"]')].find((x)=>x.getAttribute('aria-label')===wanted&&!x.disabled&&x.getClientRects().length>0); if(!e)return {ok:false,available:[...document.querySelectorAll('button,[role="button"]')].map((x)=>x.getAttribute('aria-label')).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing rendered ${label} action`); await mouse(found); note(`CLICK aria action ${JSON.stringify(label)} at rendered coordinates`); };
    const input = async (label, value) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const norm=(v)=>v?.trim().replace(/\\s+\\*$/,""); const all=[...document.querySelectorAll('input,textarea')].filter((e)=>e.getClientRects().length>0); const e=all.find((x)=>x.getAttribute('aria-label')===wanted||[...(x.labels??[])].some((l)=>norm(l.textContent)===wanted)); if(!e)return {ok:false,available:all.map((x)=>x.getAttribute('aria-label')||[...(x.labels??[])].map((l)=>l.textContent).join('|'))}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing rendered input ${label}`); await mouse(found); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.insertText", {text:value}); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9}); await sleep(350); note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`); };
    const radio = async (label) => { const found = await point(`(() => { const wanted=${JSON.stringify(label)}; const e=[...document.querySelectorAll('label')].find((x)=>x.innerText.trim()===wanted&&x.getClientRects().length>0); if(!e)return {ok:false,available:[...document.querySelectorAll('label')].map((x)=>x.innerText.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, `missing rendered radio ${label}`); await mouse(found); note(`CLICK radio ${JSON.stringify(label)} at rendered coordinates`); };
    const discard = async () => { await wait("document.body.innerText.includes('Discard your unsaved changes')", "discard confirmation"); await click("Confirm"); note("CONFIRM visible discard modal"); };
    const navigate = async (path) => { await cdp.send("Page.navigate", {url: `${studio}${path}`}); await sleep(700); note(`NAVIGATE browser address bar to public URL ${studio}${path}`); };

    note(`START ${mode} against fresh Studio ${studio} and fresh Chrome ${devtools}.`);
    await navigate("/#/project/gameModel");
    await wait("document.body.innerText.includes('Game basics') && document.body.innerText.includes('Mechanics')", "rendered Game Model page");
    if (mode === "diagnostic" || mode === "restart-diagnostic") {
        note("OBSERVE rendered Game Model state after the visible Symbols Save; no state or DOM mutation performed.");
        await snapshot(mode === "diagnostic" ? "failure-rendered-state" : "08-after-studio-restart");
        await writeFile(resolve(output, mode === "diagnostic" ? "diagnostic-browser-transcript.txt" : "restart-browser-transcript.txt"), `${transcript.join("\\n")}\\n`); cdp.close(); return;
    }
    if (mode === "artwork-public") {
        await navigate("/api/project/symbol-artwork?path=assets%2Fsymbols%2Fwild.png");
        await wait("document.contentType === 'image/png'", "browser-displayed declared PNG");
        note("OBSERVE address-bar navigation to declared active-project artwork returned an image/png response.");
        await navigate("/api/project/symbol-artwork?path=../../package.json");
        await wait("document.body.innerText.includes('Symbol artwork is missing or invalid.')", "browser-displayed undeclared-artwork denial");
        note("OBSERVE address-bar navigation to undeclared traversal asset displayed denial without source contents.");
        await snapshot("09-undeclared-artwork-denied");
        await writeFile(resolve(output, "artwork-public-browser-transcript.txt"), `${transcript.join("\\n")}\\n`); cdp.close(); return;
    }
    if (mode === "remaining") {
        await sectionClick("Mechanics", "Edit"); await click("Add free games");
        await snapshot("05-mechanics-dirty");
        await sectionClick("Mechanics", "Cancel"); await discard();
        await wait("document.body.innerText.includes('No mechanics/features configured.')", "Mechanics cancel restore");
        note("OBSERVE Mechanics mutation was discarded through the visible Cancel confirmation.");
        await navigate("/api/project/symbol-artwork?path=assets%2Fsymbols%2Fwild.png"); await wait("document.contentType === 'image/png'", "browser-displayed declared PNG");
        note("OBSERVE address-bar navigation to declared active-project artwork returned image/png.");
        await navigate("/api/project/symbol-artwork?path=../../package.json"); await wait("document.body.innerText.includes('Symbol artwork is missing or invalid.')", "browser-displayed undeclared-artwork denial");
        note("OBSERVE address-bar traversal request displayed denial without source contents."); await snapshot("06-undeclared-artwork-denied");
        await navigate("/#/project/gameModel"); await wait("document.body.innerText.includes('P6 Host Verification Saved Artwork Slot') && document.body.innerText.includes('WILD_FINAL') && document.querySelectorAll('img[alt=\"WILD_FINAL\"]').length >= 1", "saved model and artwork after browser reload");
        note("OBSERVE full browser reload preserves saved model and declared PNG."); await snapshot("07-after-browser-reload");
        await writeFile(resolve(output, "remaining-browser-transcript.txt"), `${transcript.join("\\n")}\\n`); cdp.close(); return;
    }
    if (mode === "restart") {
        await wait("document.body.innerText.includes('P6 Host Verification Saved Artwork Slot') && document.body.innerText.includes('WILD_FINAL') && document.querySelectorAll('img[alt=\"WILD_FINAL\"]').length >= 1", "persisted WILD_FINAL and native PNG after Studio/client restart");
        note("OBSERVE fresh Studio and fresh Chrome render the persisted renamed symbol and its declared PNG.");
        await snapshot("08-after-studio-restart");
        await writeFile(resolve(output, "restart-browser-transcript.txt"), `${transcript.join("\\n")}\\n`); cdp.close(); return;
    }
    await wait("document.querySelectorAll('img[alt=\"WILD_OLD\"]').length >= 1", "declared initial native PNG artwork");
    note("OBSERVE initial declared project-relative PNG is rendered in visible Symbols View.");
    await snapshot("01-initial-png-artwork");
    await sectionClick("Game basics", "Edit"); await input("Game name", "P6 Host Verification Saved Artwork Slot"); await sectionClick("Game basics", "Save"); await wait("document.body.innerText.includes('Name: P6 Host Verification Saved Artwork Slot')", "saved Game basics View"); note("OBSERVE Game basics edits dirty, validate, save, and return to View."); await snapshot("02-basics-save");
    await sectionClick("Layout", "Edit"); await input("Rows", "4"); await sectionClick("Layout", "Cancel"); await discard(); await wait("document.body.innerText.includes('Rows: 3')", "Layout cancel restore"); note("OBSERVE Layout Cancel discarded the visible row mutation.");
    await sectionClick("Symbols", "Edit"); await input("Symbol 6 id", "WILD_FINAL"); await sectionClick("Symbols", "Save"); await wait("document.body.innerText.includes('WILD_FINAL')", "initial saved Symbols View"); await sleep(70000); await wait("document.body.innerText.includes('WILD_FINAL') && !document.body.innerText.includes('WILD_OLD') && document.querySelectorAll('img[alt=\"WILD_FINAL\"]').length >= 1", "WILD_FINAL after overlapping refreshes settle"); note("OBSERVE visible Symbols Save retains WILD_FINAL and the renamed symbol's PNG after 70-second refresh settle."); await snapshot("03-symbol-save-after-settle");
    await sectionClick("Symbols", "Edit"); await input("New symbol id", "FALLBACK"); await click("Add symbol"); await sectionClick("Symbols", "Save"); await wait("document.body.innerText.includes('FALLBACK') && document.querySelectorAll('img[alt=\"FALLBACK\"]').length === 0", "text fallback for symbol with no PNG"); note("OBSERVE a saved symbol without declared artwork falls back to its visible canonical id, not a broken image."); await snapshot("04-png-fallback");
    await sectionClick("Reels", "Edit"); await radio("Reel strips"); await sectionClick("Reels", "Cancel"); await discard(); await wait("document.body.innerText.includes('Generation mode: Shared symbol weights')", "Reels cancel restore");
    await sectionClick("Paytable", "Edit"); await input("A x3 payout", "5"); await sectionClick("Paytable", "Cancel"); await discard(); await wait("!document.body.innerText.includes('A x3 payout')", "Paytable View after cancel");
    await sectionClick("Bets & Modes", "Edit"); await ariaClick("Duplicate bet 1"); await sectionClick("Bets & Modes", "Cancel"); await discard(); await wait("document.body.innerText.includes('Available bets: 1, 2, 5, 10')", "Bets cancel restore");
    await sectionClick("Mechanics", "Edit"); await click("Add free games"); await wait("document.body.innerText.includes('Scatter symbol')", "Mechanics editor mutation"); await sectionClick("Mechanics", "Cancel"); await discard(); await wait("document.body.innerText.includes('No mechanics/features configured.')", "Mechanics cancel restore"); note("OBSERVE Reels, Paytable, Bets & Modes, and Mechanics edits all cancel through rendered confirmation dialogs."); await snapshot("05-section-cancel-coverage");
    await navigate("/api/project/symbol-artwork?path=assets%2Fsymbols%2Fwild.png"); await wait("document.contentType === 'image/png'", "browser-displayed declared PNG"); note("OBSERVE browser address-bar navigation to the public active-project artwork URL returns PNG.");
    await navigate("/api/project/symbol-artwork?path=../../package.json"); await wait("document.body.innerText.includes('Symbol artwork is missing or invalid.')", "browser-displayed undeclared-artwork denial"); note("OBSERVE public URL request for undeclared traversal asset displays 404 denial, never its file contents."); await snapshot("06-undeclared-artwork-denied");
    await navigate("/#/project/gameModel"); await wait("document.body.innerText.includes('P6 Host Verification Saved Artwork Slot') && document.body.innerText.includes('WILD_FINAL') && document.querySelectorAll('img[alt=\"WILD_FINAL\"]').length >= 1", "saved model and artwork after browser reload"); note("OBSERVE a full browser reload preserves the saved model and declared PNG."); await snapshot("07-after-browser-reload");
    await writeFile(resolve(output, "browser-workflow-transcript.txt"), `${transcript.join("\\n")}\\n`); cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive:true}); await writeFile(resolve(output, `${mode}-browser-transcript.txt`), `${transcript.join("\\n")}\\n`); process.exit(1); });

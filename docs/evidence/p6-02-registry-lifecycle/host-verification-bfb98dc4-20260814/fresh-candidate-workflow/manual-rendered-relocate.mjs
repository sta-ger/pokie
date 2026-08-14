#!/usr/bin/env node
// Focused recovery for a browser viewport geometry issue in the prior audit
// driver. This is still exclusively rendered-control discovery plus ordinary
// Chrome keyboard/mouse input; it does not use any Studio API or mutate DOM.
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_AUDIT_OUTPUT ?? ".");
const devtools = process.env.P6_DEVTOOLS_URL;
const relocated = process.env.P6_RELOCATED_MANAGED;
const notes = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => { const line = `[${new Date().toISOString()}] ${message}`; notes.push(line); process.stdout.write(`${line}\n`); };

async function connect() {
    const targets = await (await fetch(`${devtools}/json/list`)).json();
    const target = targets.find((entry) => entry.type === "page");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => { socket.once("open", resolveOpen); socket.once("error", rejectOpen); });
    let id = 0; const pending = new Map();
    socket.on("message", (raw) => { const message = JSON.parse(raw.toString()); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); });
    const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => { const requestId = ++id; pending.set(requestId, {resolve: resolveSend, reject: rejectSend}); socket.send(JSON.stringify({id: requestId, method, params})); });
    await send("Page.enable"); await send("Runtime.enable"); return {send, close: () => socket.close()};
}

async function main() {
    if (!devtools || !relocated) throw new Error("P6_DEVTOOLS_URL and P6_RELOCATED_MANAGED are required.");
    const cdp = await connect();
    await cdp.send("Emulation.setDeviceMetricsOverride", {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
    note("RESIZE the browser viewport to expose the rendered table action horizontally");
    await sleep(300);
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const locate = async (expression) => evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,tag:e.tagName,text:e.textContent?.trim()}; })()`);
    const wait = async (expression, label) => { const deadline=Date.now()+30000; while (!(await evaluate(expression))) { if (Date.now()>deadline) throw new Error(`Timed out waiting for ${label}`); await sleep(200); } note(`OBSERVE ${label}`); };
    const click = async (describe, find) => { for (let i=0; i<15; i+=1) { const point=await find(); if (!point.ok) throw new Error(`No rendered ${describe}`); const viewport=await evaluate("({width:innerWidth,height:innerHeight})"); if (point.y < 8 || point.y > viewport.height - 8) { await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"PageDown", code:"PageDown", windowsVirtualKeyCode:34}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"PageDown", code:"PageDown", windowsVirtualKeyCode:34}); note(`PAGE DOWN through browser keyboard to reach ${describe}`); await sleep(350); continue; } await cdp.send("Page.bringToFront"); await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved",x:point.x,y:point.y,pointerType:"mouse"}); await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed",x:point.x,y:point.y,button:"left",buttons:1,clickCount:1,pointerType:"mouse"}); await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased",x:point.x,y:point.y,button:"left",buttons:0,clickCount:1,pointerType:"mouse"}); note(`CLICK ${describe} at rendered ${point.tag} coordinates (${Math.round(point.x)}, ${Math.round(point.y)})`); await sleep(500); return; } throw new Error(`Could not reach ${describe}`); };
    const rowRelocate = () => locate("[...document.querySelectorAll('tbody tr')].find((row) => row.innerText.includes('Managed'))?.querySelectorAll('button,a,[role=button]') && [...[...document.querySelectorAll('tbody tr')].find((row) => row.innerText.includes('Managed')).querySelectorAll('button,a,[role=button]')].find((entry) => entry.textContent?.trim() === 'Relocate' && !entry.disabled)");
    const input = () => locate("[...document.querySelectorAll('input')].find((entry) => (entry.getAttribute('aria-label') === 'New location' || [...(entry.labels ?? [])].some((label) => label.textContent?.trim().startsWith('New location'))) && entry.getClientRects().length > 0)");
    const confirm = () => locate("[...document.querySelectorAll('button,a,[role=button]')].filter((entry) => entry.textContent?.trim() === 'Relocate' && !entry.disabled).at(-1)");
    await wait("document.body.innerText.includes('(missing)') && document.body.innerText.includes('Relocate')", "missing managed row and rendered Relocate action");
    await click("missing managed row Relocate", rowRelocate);
    await wait("document.body.innerText.includes('New location')", "rendered Relocate dialog");
    await click("New location input", input);
    await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
    await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
    await cdp.send("Input.insertText", {text:relocated}); note(`INPUT New location=${JSON.stringify(relocated)} through browser keyboard`);
    await click("Relocate dialog confirmation", confirm);
    await wait("document.querySelectorAll('tbody tr').length === 1 && document.body.innerText.includes('Managed') && !document.body.innerText.includes('(missing)')", "one truthful relocated managed row without a duplicate");
    const image = await cdp.send("Page.captureScreenshot", {format:"png",captureBeyondViewport:true});
    await writeFile(resolve(output,"17-manual-relocation-no-duplicate.png"),Buffer.from(image.data,"base64"));
    await writeFile(resolve(output,"17-manual-relocation-no-duplicate-visible-text.txt"),`${await evaluate("document.body.innerText")}\n`);
    note("CAPTURE 17-manual-relocation-no-duplicate.png and rendered visible text");
    await writeFile(resolve(output,"browser-action-transcript-manual-relocate.txt"),`${notes.join("\n")}\n`);
    cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await writeFile(resolve(output,"browser-action-transcript-manual-relocate.txt"),`${notes.join("\n")}\n`); process.exit(1); });

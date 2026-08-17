#!/usr/bin/env node
/* Rendered-only public pokie-examples check; no application API or DOM/state injection. */
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve("docs/evidence/p6-08-canonical-player-runtime-parity/host-rerun-667f614b");
const transcript = [];
const note = (message) => { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); console.log(line); };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const target = await (await fetch("http://127.0.0.1:9228/json/new?about:blank", {method:"PUT"})).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((accept, reject) => { ws.once("open", accept); ws.once("error", reject); });
let id = 0; const pending = new Map();
ws.on("message", (raw) => { const response = JSON.parse(raw); if (response.id && pending.has(response.id)) { const {accept, reject} = pending.get(response.id); pending.delete(response.id); response.error ? reject(new Error(JSON.stringify(response.error))) : accept(response.result); } });
const send = (method, params = {}) => new Promise((accept, reject) => { const requestId = ++id; pending.set(requestId, {accept, reject}); ws.send(JSON.stringify({id:requestId, method, params})); });
const evalPage = async (expression) => (await send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true})).result.value;
const waitFor = async (expression, label) => { for (let end = Date.now() + 60000; !(await evalPage(expression)); await wait(200)) if (Date.now() > end) throw new Error(`timed out: ${label}`); };
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", {url:"http://127.0.0.1:5173/simple-slot.html"}); note("NAVIGATE pokie-examples Simple video slot public page");
await waitFor("document.body.innerText.includes('Play') && document.querySelectorAll('[data-cell]').length > 0", "rendered public Player");
const button = await evalPage(`(() => { const e = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Play' && !x.disabled); const r=e?.getBoundingClientRect(); return r && {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
if (!button) throw new Error("rendered Play button not found");
await send("Input.dispatchMouseEvent", {type:"mousePressed", x:button.x, y:button.y, button:"left", clickCount:1}); await send("Input.dispatchMouseEvent", {type:"mouseReleased", x:button.x, y:button.y, button:"left", clickCount:1}); note("CLICK public pokie-examples Play button");
await wait(800);
const body = await evalPage("document.body.innerText");
const controls = await evalPage("[...document.querySelectorAll('button,a,input,select')].filter(e=>e.getClientRects().length).map(e=>e.textContent?.trim() || e.getAttribute('placeholder') || e.id)");
const cells = await evalPage("[...document.querySelectorAll('[data-cell]')].map(e=>e.textContent.trim())");
const png = await send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
await writeFile(resolve(output, "13-pokie-examples-public-player.png"), Buffer.from(png.data, "base64"));
await writeFile(resolve(output, "13-pokie-examples-public-player.txt"), `${body}\n`);
note(`OBSERVE candidate package Player renderer produced ${cells.length} visible cells. Rendered controls: ${JSON.stringify(controls)}.`);
note(`OBSERVE public pokie-examples has no rendered fixture-slot selector, Session seed input, or fixture-round control; its public Simple video slot UI can only play its own example round.`);
await writeFile(resolve(output, "pokie-examples-browser-transcript.txt"), `${transcript.join("\n")}\n`);
ws.close();

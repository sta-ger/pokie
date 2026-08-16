#!/usr/bin/env node
// Capture only what a freshly navigated browser visibly renders; no application API or state mutation.
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.OUTPUT);
const studio = process.env.STUDIO;
const devtools = process.env.DEVTOOLS;
const name = process.env.NAME;
const target = await (await fetch(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"})).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => { const response = JSON.parse(raw.toString()); if (response.id && pending.has(response.id)) { const done = pending.get(response.id); pending.delete(response.id); response.error ? done.reject(new Error(JSON.stringify(response.error))) : done.accept(response.result); } });
const send = (method, params = {}) => new Promise((accept, reject) => { const id = ++sequence; pending.set(id, {accept, reject}); socket.send(JSON.stringify({id, method, params})); });
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", {url: `${studio}/#/project/gameModel`});
await new Promise((done) => setTimeout(done, 900));
await send("Page.reload", {ignoreCache: true});
await new Promise((done) => setTimeout(done, 900));
const text = (await send("Runtime.evaluate", {expression: "document.body.innerText", returnByValue: true})).result.value;
const png = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
await writeFile(resolve(output, `${name}.txt`), `${text}\n`);
process.stdout.write(`CAPTURE ${name}; rendered availability: ${text.match(/Available bets: .*/)?.[0] ?? "missing"}\n`);
socket.close();

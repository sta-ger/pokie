#!/usr/bin/env node
// Observation-only capture of the already-rendered local Studio page.
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const devtools = process.env.P6_DEVTOOLS_URL;
const stem = process.env.P6_CAPTURE_STEM;
const outputDirectory = process.env.P6_CAPTURE_OUTPUT ?? "docs/evidence/p6-02-registry-lifecycle";
if (!devtools || !stem) throw new Error("P6_DEVTOOLS_URL and P6_CAPTURE_STEM are required.");
const page = (await (await fetch(`${devtools}/json/list`)).json()).find((target) => target.type === "page");
if (!page?.webSocketDebuggerUrl) throw new Error("No page target.");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
let id = 0;
const requests = new Map();
socket.on("message", (raw) => {
    const result = JSON.parse(raw.toString());
    if (result.id === undefined || !requests.has(result.id)) return;
    const request = requests.get(result.id);
    requests.delete(result.id);
    result.error ? request.reject(new Error(JSON.stringify(result.error))) : request.resolve(result.result);
});
const send = (method, params = {}) => new Promise((accept, reject) => {
    const requestId = ++id;
    requests.set(requestId, {resolve: accept, reject});
    socket.send(JSON.stringify({id: requestId, method, params}));
});
await send("Page.enable");
await send("Runtime.enable");
const evaluate = async (expression) => (await send("Runtime.evaluate", {expression, returnByValue: true})).result.value;
const screen = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
const output = resolve(outputDirectory);
await writeFile(resolve(output, `${stem}.png`), Buffer.from(screen.data, "base64"));
await writeFile(resolve(output, `${stem}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
await writeFile(resolve(output, `${stem}-url.txt`), `${await evaluate("location.href")}\n`);
socket.close();

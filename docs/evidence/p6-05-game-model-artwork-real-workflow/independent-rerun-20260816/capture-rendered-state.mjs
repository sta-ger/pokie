#!/usr/bin/env node
// Captures only the visible state from the already-open fresh Chrome instance.
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve("docs/evidence/p6-05-game-model-artwork-real-workflow/independent-rerun-20260816");
const prefix = process.argv[2] ?? "08-stale-symbols-view-after-corrected-save";
const targets = await (await fetch("http://127.0.0.1:9235/json")).json();
const target = targets.find((entry) => entry.type === "page" && entry.url.includes("127.0.0.1:4635"));
if (!target) throw new Error("No rendered Studio page found.");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => { socket.once("open", resolveOpen); socket.once("error", reject); });
let id = 0;
const pending = new Map();
socket.on("message", (raw) => { const response = JSON.parse(raw.toString()); const waiter = pending.get(response.id); if (waiter) { pending.delete(response.id); response.error ? waiter.reject(new Error(JSON.stringify(response.error))) : waiter.resolve(response.result); } });
const send = (method, params = {}) => new Promise((resolveResult, reject) => { const next = ++id; pending.set(next, {resolve: resolveResult, reject}); socket.send(JSON.stringify({id: next, method, params})); });
await send("Page.enable");
const png = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
const text = await send("Runtime.evaluate", {expression: "document.body.innerText", returnByValue: true});
await writeFile(resolve(output, `${prefix}.png`), Buffer.from(png.data, "base64"));
await writeFile(resolve(output, `${prefix}.txt`), `${text.result.value}\n`);
await writeFile(resolve(output, "browser-diagnostic-transcript.txt"), "Captured the rendered Studio page left after the visible Symbols Save workflow timed out. No DOM or application state was changed.\n");
socket.close();

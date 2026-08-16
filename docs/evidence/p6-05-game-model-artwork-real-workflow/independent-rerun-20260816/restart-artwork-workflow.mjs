#!/usr/bin/env node
// A physical-browser restart check. CDP only navigates, reads rendered text, and captures screenshots.
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve("docs/evidence/p6-05-game-model-artwork-real-workflow/independent-rerun-20260816");
const events = [];
const note = (message) => { const line = `[${new Date().toISOString()}] ${message}`; events.push(line); console.log(line); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const target = await (await fetch("http://127.0.0.1:9235/json/new?about:blank", {method: "PUT"})).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => { socket.once("open", resolveOpen); socket.once("error", reject); });
let id = 0;
const pending = new Map();
socket.on("message", (raw) => { const response = JSON.parse(raw.toString()); const waiter = pending.get(response.id); if (waiter) { pending.delete(response.id); response.error ? waiter.reject(new Error(JSON.stringify(response.error))) : waiter.resolve(response.result); } });
const send = (method, params = {}) => new Promise((resolveResult, reject) => { const next = ++id; pending.set(next, {resolve: resolveResult, reject}); socket.send(JSON.stringify({id: next, method, params})); });
const evaluate = async (expression) => (await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
const waitUntil = async (expression, description) => { const deadline = Date.now() + 30000; while (!await evaluate(expression)) { if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
const capture = async (name) => { const png = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await evaluate("document.body.innerText")}\n`); note(`CAPTURE ${name}.png and ${name}.txt`); };
const navigate = async (path) => { await send("Page.navigate", {url: `http://127.0.0.1:4635${path}`}); await sleep(700); note(`NAVIGATE browser address bar to http://127.0.0.1:4635${path}`); };
try {
  await send("Page.enable"); await send("Runtime.enable");
  note("START fresh Chrome against the restarted Studio server.");
  await navigate("/#/project/gameModel");
  await waitUntil("document.body.innerText.includes('P6 Corrected Saved Artwork Slot') && document.body.innerText.includes('WILD_FINAL') && document.querySelectorAll('img[alt=\"WILD_FINAL\"]').length >= 1", "persisted saved model and PNG after Studio restart");
  note("OBSERVE persisted WILD_FINAL model and declared native PNG in rendered Game Model after Studio/client restart.");
  await capture("10-after-studio-restart-persisted-artwork");
  await navigate("/api/project/symbol-artwork?path=assets%2Fsymbols%2Fwild.png");
  await waitUntil("document.contentType === 'image/png'", "browser-displayed declared PNG");
  note("OBSERVE browser address-bar request for the declared active-project artwork returned PNG.");
  await navigate("/api/project/symbol-artwork?path=../../package.json");
  await waitUntil("document.body.innerText.includes('Symbol artwork is missing or invalid.')", "browser-displayed undeclared-artwork denial");
  note("OBSERVE browser address-bar request for undeclared ../../package.json returned the public 404 error, never file contents.");
  await capture("11-undeclared-artwork-denied");
  await writeFile(resolve(output, "restart-browser-workflow-transcript.txt"), `${events.join("\n")}\n`);
} catch (error) {
  note(`FAILED ${error.stack ?? error}`);
  await writeFile(resolve(output, "restart-browser-workflow-transcript.txt"), `${events.join("\n")}\n`);
  process.exitCode = 1;
} finally { socket.close(); }

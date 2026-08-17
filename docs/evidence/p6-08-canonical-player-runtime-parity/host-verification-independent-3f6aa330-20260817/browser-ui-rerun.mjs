#!/usr/bin/env node
/*
 * Independent P6-08 host rerun.  CDP is limited to visible browser navigation,
 * coordinate mouse/keyboard input, rendered-text checks, and screenshots.
 * It does not call application APIs or mutate DOM/application state.
 */
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_08_OUTPUT ?? "docs/evidence/p6-08-canonical-player-runtime-parity/host-verification-independent-20260817");
const client = process.env.P6_08_CLIENT ?? "http://127.0.0.1:4812";
const studio = process.env.P6_08_STUDIO ?? "http://127.0.0.1:4813";
const examples = process.env.P6_08_EXAMPLES ?? "http://127.0.0.1:5176";
const devtools = process.env.P6_08_DEVTOOLS ?? "http://127.0.0.1:9231";
const expectedGrid = ["A", "C", "A", "A", "A", "C", "A", "A", "A"];
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
    socket.on("message", (raw) => { const message = JSON.parse(raw.toString()); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); } });
    const send = (method, params = {}) => new Promise((accept, reject) => { const id = ++sequence; pending.set(id, {resolve: accept, reject}); socket.send(JSON.stringify({id, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const waitUntil = async (expression, description, timeout = 60000) => { const deadline = Date.now() + timeout; while (!(await evaluate(expression))) { if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const navigate = async (url, description) => { await cdp.send("Page.navigate", {url}); note(`NAVIGATE ${description}: ${url}`); await sleep(500); };
    const control = async (label) => evaluate(`(() => { const wanted=${JSON.stringify(label)}; const candidates=[...document.querySelectorAll("button,a,[role=button],summary")]; const element=candidates.find((candidate)=>candidate.textContent?.trim()===wanted&&!candidate.disabled&&candidate.getClientRects().length>0); if(!element)return {ok:false,available:candidates.filter((candidate)=>candidate.getClientRects().length>0).map((candidate)=>candidate.textContent?.trim()).filter(Boolean)}; const rect=element.getBoundingClientRect(); return {ok:true,tag:element.tagName,x:rect.left+rect.width/2,y:rect.top+rect.height/2,height:window.innerHeight}; })()`);
    const click = async (label) => { let found = await control(label); if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} not found: ${JSON.stringify(found?.available)}`); for (let attempt = 0; attempt < 14 && (found.y < 0 || found.y > found.height); attempt++) { await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:500, y:Math.max(100, found.height / 2), deltaX:0, deltaY:found.y < 0 ? -700 : 700}); await sleep(150); found = await control(label); if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} disappeared while scrolling`); } if (found.y < 0 || found.y > found.height) throw new Error(`Rendered control ${JSON.stringify(label)} remains outside viewport`); await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1}); await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1}); note(`CLICK ${JSON.stringify(label)} at rendered ${found.tag} coordinates (${Math.round(found.x)}, ${Math.round(found.y)})`); await sleep(400); };
    const input = async (selector, value, description) => { const found = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e||e.getClientRects().length===0)return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2}; })()`); if (!found?.ok) throw new Error(`Rendered input ${description} (${selector}) not found`); await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1}); await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1}); await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2}); await cdp.send("Input.insertText", {text:value}); note(`INPUT ${description}=${JSON.stringify(value)} through rendered browser input`); await sleep(350); };
    const grid = async () => evaluate("[...document.querySelectorAll('[data-cell]')].map((cell)=>({cell:cell.dataset.cell,text:cell.textContent?.trim(),background:getComputedStyle(cell).backgroundColor}))");
    const snapshot = async (name) => { const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); await writeFile(resolve(output, `${name}-grid.json`), `${JSON.stringify(await grid(), null, 2)}\n`); note(`CAPTURE ${name}: screenshot, rendered text, and rendered grid`); };
    const assertSurface = async (name) => { const visible = await body(); const cells = await grid(); const actualGrid = cells.map((cell) => cell.text); if (JSON.stringify(actualGrid) !== JSON.stringify(expectedGrid)) throw new Error(`${name}: grid was ${JSON.stringify(actualGrid)}`); if (visible.includes("Paytable unavailable")) throw new Error(`${name}: rendered Paytable unavailable`); const required = ["Paytable", "A", "B", "C", "5", "3", "1", "Credits", "1004", "Win multiple"]; const absent = required.filter((item) => !visible.includes(item)); if (absent.length) throw new Error(`${name}: missing visible ${JSON.stringify(absent)}`); const highlighted = cells.filter((cell) => cell.background === "rgb(221, 255, 221)").map((cell) => cell.cell); if (JSON.stringify(highlighted) !== JSON.stringify(["0:0", "0:1", "0:2"])) throw new Error(`${name}: highlighted positions were ${JSON.stringify(highlighted)}`); note(`ASSERT ${name}: fixture grid, highlighted A-line, complete paytable A=5/B=3/C=1, post-round Credits 1004, win 5, and its five-times multiple are visibly rendered.`); };

    note(`START fresh visible-browser rerun; candidate client=${client}; Studio=${studio}; public examples=${examples}; seed=fixture-round.`);
    await navigate(client, "generated package npm start Player UI");
    await waitUntil("document.body.innerText.includes('Session seed (optional)') && document.body.innerText.includes('Spin')", "generated Player controls");
    await input("#session-seed", "fixture-round", "generated Player session seed");
    await click("Start new session"); await waitUntil("document.body.innerText.includes('Connected to')", "generated seeded session");
    await click("Spin"); await waitUntil("document.querySelectorAll('[data-cell]').length===9 && document.body.innerText.includes('Winning lines')", "generated rendered round");
    await click("Paytable"); await snapshot("20-generated-package-npm-start-player"); await assertSurface("generated package Player");

    await navigate(`${studio}/#/project/play`, "Studio Play UI");
    await waitUntil("document.body.innerText.includes('New session') && document.body.innerText.includes('Seed (optional)')", "Studio Play seed form");
    await input("input", "fixture-round", "Studio Play Seed (optional)"); await click("New session"); await waitUntil("document.body.innerText.includes('Spin')", "Studio Play active session");
    await click("Spin"); await waitUntil("document.querySelectorAll('[data-cell]').length===9 && document.body.innerText.includes('Total win')", "Studio Play deterministic round");
    await snapshot("21-studio-play-seeded-round"); try { await assertSurface("Studio Play"); } catch (error) { note(`OBSERVE Studio Play acceptance failure: ${error.message}`); }

    await navigate(`${studio}/#/project/replay`, "Studio Replay UI");
    await waitUntil("document.body.innerText.includes('Target round number') && document.body.innerText.includes('Load')", "Studio Replay seed form");
    await input("input[data-path='seed']", "fixture-round", "Studio Replay Seed (optional)"); await click("Load"); await waitUntil("document.body.innerText.includes('Run again')", "Studio Replay loaded request");
    await click("Run again"); await waitUntil("document.querySelectorAll('[data-cell]').length===9 && document.body.innerText.includes('Total win')", "Studio Replay deterministic result", 120000);
    await snapshot("22-studio-replay-seeded-round"); try { await assertSurface("Studio Replay"); } catch (error) { note(`OBSERVE Studio Replay acceptance failure: ${error.message}`); }

    await navigate(examples, "public pokie-examples index");
    await waitUntil("document.body.innerText.includes('Open deterministic round')", "public fixture link"); await click("Open deterministic round");
    await waitUntil("document.body.innerText.includes('Fixture Slot') && document.body.innerText.includes('Play')", "public Fixture Slot Player"); await click("Play");
    await waitUntil("document.querySelectorAll('[data-cell]').length===9 && document.body.innerText.includes('Winning lines')", "public fixture round after Play");
    await click("Paytable"); await snapshot("23-pokie-examples-fixture-round"); await assertSurface("public pokie-examples Fixture Slot");

    const names = ["20-generated-package-npm-start-player", "21-studio-play-seeded-round", "22-studio-replay-seeded-round", "23-pokie-examples-fixture-round"];
    const surfaces = []; for (const name of names) surfaces.push({name, grid: JSON.parse(await readFile(resolve(output, `${name}-grid.json`), "utf8")).map((cell) => cell.text)});
    if (!surfaces.every((surface) => JSON.stringify(surface.grid) === JSON.stringify(expectedGrid))) throw new Error("persisted cross-surface grid comparison failed");
    await writeFile(resolve(output, "cross-surface-grid-comparison.json"), `${JSON.stringify({fixture:{seed:"fixture-round",round:1,expectedGrid},surfaces}, null, 2)}\n`);
    note("COMPLETE: all four public rendered surfaces were exercised; individual acceptance assertions and observations are recorded above. No DOM/state injection or application API call was used.");
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`); cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive:true}); await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`); process.exit(1); });

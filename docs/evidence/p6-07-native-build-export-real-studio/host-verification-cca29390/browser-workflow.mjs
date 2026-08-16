// Records the visible public Studio workflow only. CDP discovers rendered controls and dispatches
// ordinary mouse/keyboard input; it does not call Studio APIs or alter DOM/application state.
import {execFileSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const [mode, studioUrl, debugPort, destination, display = ""] = process.argv.slice(2);
if (!mode || !studioUrl || !debugPort || !destination) throw new Error("Usage: browser-workflow.mjs <local|headless> <url> <debug-port> <destination> [display]");
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const transcriptPath = path.join(evidenceDir, `${mode}-browser-transcript.txt`);
const notes = [];
const note = (text) => {
    const line = `[${new Date().toISOString()}] ${text}`;
    notes.push(line);
    appendFileSync(transcriptPath, `${line}\n`);
    process.stdout.write(`${line}\n`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hostCommand = (program, args) => execFileSync(program, args, {encoding: "utf8", env: {...process.env, DISPLAY: display}}).trim();

const chromeTarget = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {method: "PUT"})).json();
const socket = new WebSocket(chromeTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let nextId = 0;
const pending = new Map();
socket.on("message", (raw) => {
    const message = JSON.parse(raw);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); });
const evaluate = async (expression) => (await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
const bodyText = () => evaluate("document.body.innerText");
async function waitFor(text, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (!(await bodyText()).includes(text)) { if (Date.now() > deadline) throw new Error(`Timed out waiting for rendered text: ${text}`); await sleep(150); }
}
async function pointFor(label) {
    return evaluate(`(() => {
        const visible = (node) => node.getClientRects().length > 0;
        const buttons = [...document.querySelectorAll('button,a,[role=button]')];
        const node = buttons.find((item) => visible(item) && !item.disabled && item.textContent?.trim() === ${JSON.stringify(label)});
        if (!node) return {available: buttons.filter(visible).map((item) => item.textContent?.trim())};
        node.scrollIntoView({block: 'center'}); const rect = node.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
}
async function clickAt(point, label) {
    if (!point?.x) throw new Error(`No visible target for ${label}: ${JSON.stringify(point?.available)}`);
    await send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
    note(`CLICK ${label} at visible coordinates (${Math.round(point.x)}, ${Math.round(point.y)}).`);
    await sleep(250);
}
const click = async (label) => clickAt(await pointFor(label), label);
async function snapshot(name) {
    const image = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
    await writeFile(path.join(evidenceDir, `${name}.png`), Buffer.from(image.data, "base64"));
    await writeFile(path.join(evidenceDir, `${name}.txt`), `${await bodyText()}\n`);
    note(`CAPTURE ${name}.png and ${name}.txt.`);
}
async function selectVisibleNativeSavePath() {
    let windowId;
    const deadline = Date.now() + 15000;
    while (!windowId && Date.now() < deadline) {
        try { windowId = hostCommand("xdotool", ["search", "--onlyvisible", "--name", "zenity"]).split("\n")[0]; } catch { await sleep(125); }
    }
    if (!windowId) throw new Error("The visible Zenity native Save dialog did not appear.");
    note(`OBSERVE native Save dialog window ${windowId}: ${hostCommand("xdotool", ["getwindowname", windowId])}.`);
    hostCommand("xdotool", ["key", "--window", windowId, "ctrl+l"]);
    hostCommand("xdotool", ["type", "--window", windowId, "--delay", "1", destination]);
    hostCommand("xdotool", ["key", "--window", windowId, "Return"]);
    note(`NATIVE SAVE selected ${destination} through the visible dialog location field.`);
}

try {
    await send("Page.enable"); await send("Runtime.enable");
    await send("Page.navigate", {url: studioUrl});
    await waitFor("Build/Export"); note(`OBSERVE ${mode} Studio dashboard exposes Build/Export for starter.par.xlsx.`);
    await click("Build/Export"); await waitFor("Build artifact"); await waitFor("Build preflight");
    await waitFor("PAR sheet (.xlsx)"); note("OBSERVE rendered PAR-sheet artifact card and Build preflight.");
    if (mode === "local") {
        await click("Browse…"); await selectVisibleNativeSavePath(); await waitFor(destination); await waitFor("Output type: file");
        await snapshot("local-after-native-save-selection");
    } else {
        const input = await evaluate(`(() => { const node = [...document.querySelectorAll('input')].find((item) => item.getClientRects().length && item.type === 'text'); if (!node) return {}; node.scrollIntoView({block: 'center'}); const rect = node.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}; })()`);
        await clickAt(input, "Output file destination input");
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17}); await send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65}); await send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65}); await send("Input.dispatchKeyEvent", {type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17}); await send("Input.insertText", {text: destination});
        note(`TYPE ${destination} into the visible Output file destination input.`); await waitFor(destination); await snapshot("headless-preflight");
    }
    await click("Build"); await waitFor("Built to", 60000); await waitFor(destination); note(`OBSERVE completed PAR workbook build at ${destination}.`);
    if (mode === "local") { await waitFor("Reveal file"); await click("Reveal file"); note("CLICK Reveal file in the completed local build actions."); await snapshot("local-built-and-revealed"); }
    else { await waitFor("Copy path"); await waitFor("Opening local output is unsupported from a headless or remote Studio session."); note("OBSERVE Copy path and the explicit unsupported-local-output message."); await click("Copy path"); note("CLICK Copy path in the completed headless build actions."); await snapshot("headless-built-copy-path"); }
} catch (error) {
    note(`FAILED ${error.stack ?? error}`); await snapshot(`${mode}-failure-rendered`); process.exitCode = 1;
} finally {
    await writeFile(transcriptPath, `${notes.join("\n")}\n`); socket.close();
}

import {execFileSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const [mode, studioUrl, debugPort, destination, display] = process.argv.slice(2);
if (!mode || !studioUrl || !debugPort || !destination || !display) {
    throw new Error("Usage: studio-workflow.mjs <par-native|directory-native|par-headless> <studioUrl> <debugPort> <destination> <display>");
}

const outDir = path.dirname(new URL(import.meta.url).pathname);
const transcript = [];
const transcriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), `${mode}-browser-transcript.txt`);
const note = (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    appendFileSync(transcriptPath, `${line}\n`);
    console.log(line);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const command = (program, args) => execFileSync(program, args, {encoding: "utf8", env: {...process.env, DISPLAY: display}}).trim();

const target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {method: "PUT"})).json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
});
let requestId = 0;
const pending = new Map();
socket.on("message", (raw) => {
    const message = JSON.parse(raw);
    if (pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
const body = () => evaluate("document.body.innerText");
const waitFor = async (needle, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (!(await body()).includes(needle)) {
        if (Date.now() > end) {
            throw new Error(`Timed out waiting for rendered text: ${needle}`);
        }
        await sleep(150);
    }
};
const pointFor = (label) =>
    evaluate(`(() => {
        const available = [...document.querySelectorAll('button,a,[role=button]')].filter((node) => node.getClientRects().length).map((node) => node.textContent?.trim());
        const node = [...document.querySelectorAll('button,a,[role=button]')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)} && !item.disabled && item.getClientRects().length);
        if (!node) return {available};
        node.scrollIntoView({block: 'center', inline: 'center'});
        const rect = node.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
const inputPoint = () =>
    evaluate(`(() => {
        const node = [...document.querySelectorAll('input')].find((item) => item.getClientRects().length && item.type === 'text');
        if (!node) return {};
        node.scrollIntoView({block: 'center', inline: 'center'});
        const rect = node.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
const clickAt = async (point, description) => {
    if (!point?.x) throw new Error(`No rendered target for ${description}: ${JSON.stringify(point?.available)}`);
    await send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
    note(`CLICK ${description} at visible coordinates (${Math.round(point.x)}, ${Math.round(point.y)})`);
    await sleep(250);
};
const click = async (label) => clickAt(await pointFor(label), label);
const snapshot = async (name) => {
    const png = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
    await writeFile(path.join(outDir, `${name}.png`), Buffer.from(png.data, "base64"));
    await writeFile(path.join(outDir, `${name}.txt`), `${await body()}\n`);
    note(`CAPTURE ${name}.png and ${name}.txt`);
};
const selectNativePath = async () => {
    let windowId;
    const until = Date.now() + 15000;
    while (!windowId && Date.now() < until) {
        try {
            windowId = command("xdotool", ["search", "--onlyvisible", "--name", "zenity"]).split("\n")[0];
        } catch {
            await sleep(120);
        }
    }
    if (!windowId) throw new Error("The visible Zenity native picker did not appear.");
    note(`OBSERVE native picker window ${windowId}: ${command("xdotool", ["getwindowname", windowId])}`);
    command("xdotool", ["key", "--window", windowId, "ctrl+l"]);
    command("xdotool", ["type", "--window", windowId, "--delay", "1", destination]);
    command("xdotool", ["key", "--window", windowId, "Return"]);
    note(`NATIVE PICKER selected ${destination} through its visible location field.`);
};

try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", {url: studioUrl});
    await waitFor("Build/Export");
    note(`OBSERVE ${mode} Studio dashboard exposes Build/Export.`);
    await click("Build/Export");
    await waitFor("Build artifact");
    await waitFor("Build preflight");
    note("OBSERVE rendered target, selected destination, resolved path, output type, conflict state, and planned outputs.");

    if (mode === "par-native" || mode === "directory-native") {
        await click("Browse…");
        await selectNativePath();
        await waitFor(destination, 30000);
        await waitFor("Build preflight");
        await snapshot(`${mode}-preflight-after-native-picker`);
    } else {
        const targetPoint = await inputPoint();
        await clickAt(targetPoint, "Output file destination input");
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17});
        await send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17});
        await send("Input.insertText", {text: destination});
        note(`TYPE ${destination} into the visible Output file destination input.`);
        await waitFor(destination, 30000);
        await snapshot("par-headless-preflight-typed-destination");
    }

    await click("Build");
    await waitFor("Built to", 60000);
    await waitFor(destination, 30000);
    note(`OBSERVE completed Studio build output at ${destination}.`);
    await snapshot(`${mode}-build-complete`);

    if (mode === "par-headless") {
        await waitFor("Copy path");
        await waitFor("Opening local output is unsupported from a headless or remote Studio session.");
        note("OBSERVE headless Studio presents Copy path and explicitly states local output opening is unsupported.");
        await click("Copy path");
        note("CLICK Copy path in the rendered headless output actions.");
        await snapshot("par-headless-copy-path-observed");
    } else {
        const action = mode === "par-native" ? "Reveal file" : "Open output folder";
        await click(action);
        note(`CLICK ${action} after the completed local build.`);
        await snapshot(`${mode}-local-output-action-clicked`);
    }
} catch (error) {
    note(`FAILED ${error.stack ?? error}`);
    await writeFile(path.join(outDir, `${mode}-failure-rendered.txt`), `${await body()}\n`);
    const png = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
    await writeFile(path.join(outDir, `${mode}-failure-rendered.png`), Buffer.from(png.data, "base64"));
    process.exitCode = 1;
} finally {
    await writeFile(path.join(outDir, `${mode}-browser-transcript.txt`), `${transcript.join("\n")}\n`);
    socket.close();
}

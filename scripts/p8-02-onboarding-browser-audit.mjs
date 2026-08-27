#!/usr/bin/env node
/**
 * P8-02's bounded clean-profile browser journey.  It operates only through
 * rendered controls and browser input; CDP is used to locate those controls,
 * observe visible text, and capture screenshots.
 */
import {mkdir, rm, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "docs/evidence/p8-02-onboarding/current-run");
const profile = resolve(root, ".p8-02-onboarding-profile");
const studioProfile = resolve(profile, "studio");
const chromeProfile = resolve(profile, "chromium");
const port = 32182;
const devtoolsPort = 9228;
const url = `http://127.0.0.1:${port}`;
const devtoolsUrl = `http://127.0.0.1:${devtoolsPort}`;
const transcript = [];
let studio;
let chrome;

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

function pause(milliseconds) {
    return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function waitFor(predicate, description, timeout = 120000) {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
        await pause(150);
    }
}

async function json(urlToRead, options) {
    const response = await fetch(urlToRead, options);
    if (!response.ok) throw new Error(`${urlToRead}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`${devtoolsUrl}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        const request = pending.get(response.id);
        if (!request) return;
        pending.delete(response.id);
        response.error ? request.reject(new Error(JSON.stringify(response.error))) : request.resolve(response.result);
    });
    const send = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
        const requestId = ++id;
        pending.set(requestId, {resolve: resolveRequest, reject: rejectRequest});
        socket.send(JSON.stringify({id: requestId, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function terminate(child) {
    if (!child || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
}

async function main() {
    await mkdir(evidence, {recursive: true});
    await rm(resolve(evidence, "ACTION-TRANSCRIPT.txt"), {force: true});
    await rm(resolve(evidence, "00-clean-launch.png"), {force: true});
    await rm(resolve(evidence, "01-invalid-import-recovery.png"), {force: true});
    await rm(resolve(evidence, "02-start-choices.png"), {force: true});
    await rm(resolve(evidence, "03-created-workspace.png"), {force: true});
    await rm(profile, {recursive: true, force: true});
    await mkdir(studioProfile, {recursive: true});

    studio = spawn(process.execPath, ["dist/cli/pokie.js", "studio", "--no-open", "--host", "127.0.0.1", "--port", String(port)], {
        cwd: root,
        env: {...process.env, HOME: studioProfile},
        stdio: "pipe",
    });
    studio.stdout.on("data", (chunk) => process.stdout.write(chunk));
    studio.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await waitFor(async () => {
        try { return (await fetch(`${url}/api/context`)).ok; } catch { return false; }
    }, "Studio API");

    chrome = spawn("chromium", [
        "--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${chromeProfile}`,
        `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${devtoolsPort}`, "about:blank",
    ], {stdio: "pipe"});
    await waitFor(async () => {
        try { return Array.isArray(await json(`${devtoolsUrl}/json/list`)); } catch { return false; }
    }, "fresh Chromium profile");

    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const has = async (phrase) => (await body()).includes(phrase);
    const capture = async (name) => {
        const image = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        await writeFile(resolve(evidence, `${name}.png`), Buffer.from(image.data, "base64"));
        note(`CAPTURE ${name}: rendered screenshot`);
    };
    const click = async (label) => {
        const found = await evaluate(`(() => {
            const label = ${JSON.stringify(label)};
            const node = [...document.querySelectorAll('button,a,[role=button]')].find((candidate) => candidate.textContent?.trim() === label && !candidate.disabled && candidate.getClientRects().length > 0);
            if (!node) return {ok: false};
            const rect = node.getBoundingClientRect();
            return {ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
        })()`);
        if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} was unavailable`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1});
        note(`CLICK ${JSON.stringify(label)} through rendered coordinates`);
        await pause(350);
    };
    const input = async (label, value) => {
        const found = await evaluate(`(() => {
            const label = ${JSON.stringify(label)};
            const node = [...document.querySelectorAll('input,textarea')].find((candidate) => candidate.getClientRects().length > 0 && (candidate.getAttribute('aria-label') === label || [...(candidate.labels ?? [])].some((item) => item.textContent?.trim().replace(/\\s+\\*$/, '') === label)));
            if (!node) return {ok: false};
            const rect = node.getBoundingClientRect();
            return {ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
        })()`);
        if (!found?.ok) throw new Error(`Rendered input ${JSON.stringify(label)} was unavailable`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: found.x, y: found.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: found.x, y: found.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.insertText", {text: value});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        note(`INPUT ${JSON.stringify(label)} through rendered keyboard input`);
        await pause(350);
    };

    note("START fresh Studio and Chromium profiles for P8-02 first-launch journey");
    await cdp.send("Page.navigate", {url: `${url}/#/`});
    await waitFor(() => has("Design Your Game"), "first-launch explanation");
    if (!(await has("Start with the ready-to-edit starter game"))) throw new Error("The first-launch purpose copy was not visible");
    await capture("00-clean-launch");

    await click("Projects");
    await waitFor(() => has("Add a game you already have"), "Projects entry");
    await input("Game location", "/not-a-game");
    await click("Check game");
    await waitFor(() => has("Choose another game folder or game-design file, then try again."), "invalid-import recovery");
    await capture("01-invalid-import-recovery");

    await click("Create your first game");
    await waitFor(() => has("Design Your Game"), "return to start flow");
    await click("Choose a different start");
    for (const choice of ["Use the starter game", "Start with a blank game", "Generate a game idea", "Open a saved game design"]) {
        if (!(await has(choice))) throw new Error(`Start choice ${JSON.stringify(choice)} was not visible`);
    }
    await capture("02-start-choices");
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27});
    await pause(250);
    await click("Create game");
    await waitFor(() => has("Overview") && has("Start by playing a round"), "created project workspace", 180000);
    await capture("03-created-workspace");
    note("PASS: clean launch explained Studio, invalid import remained recoverable, all start choices were visible, and Create game reached the project workspace.");
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(evidence, {recursive: true});
    process.exitCode = 1;
}).finally(async () => {
    await writeFile(resolve(evidence, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    await terminate(chrome);
    await terminate(studio);
    await rm(profile, {recursive: true, force: true});
});

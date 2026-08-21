#!/usr/bin/env node
/**
 * P6V-02's bounded rendered audit.  It launches the candidate Studio and a
 * fresh Chrome profile in one foreground process; CDP is used only to locate
 * visible controls, send browser input, read rendered text and take captures.
 */
import {mkdir, rm, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "docs/phase6-hard-verification/P6V-02-design-ux/current-candidate");
const profile = resolve(root, ".p6v02-browser-profile");
const sourceClient = process.env.P6V02_SOURCE_CLIENT === "1";
const studioPort = sourceClient ? "3200" : "32102";
const studioUrl = `http://127.0.0.1:${sourceClient ? "32102" : studioPort}`;
const devtoolsUrl = "http://127.0.0.1:9227";
const captureNames = [
    "00-initial-render",
    "01-cold-start-design-desktop",
    "02-workspace-overview-desktop",
    "03-game-model-desktop",
    "04-play-success-desktop",
    "05-simulation-success-desktop",
    "06-replay-session-spin-desktop",
    "07-build-export-success-desktop",
    "08-build-export-mobile-405",
    "09-reel-strip-modeler-mobile-405",
];
const transcript = [];
let studio;
let client;
let chrome;

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

function pause(milliseconds) {
    return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function waitFor(predicate, description, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
        await pause(150);
    }
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
    // The audit replaces only its generated captures and transcript. The
    // checked-in README is the human-owned index for this immutable step and
    // must survive a fresh exact-candidate rerun.
    await mkdir(output, {recursive: true});
    await Promise.all([
        "ACTION-TRANSCRIPT.txt",
        ...captureNames.flatMap((name) => [`${name}.png`, `${name}.txt`]),
    ].map((file) => rm(resolve(output, file), {force: true})));
    await rm(profile, {recursive: true, force: true});
    studio = spawn(process.execPath, ["dist/cli/pokie.js", "--no-open", "--host", "127.0.0.1", "--port", studioPort], {cwd: root, stdio: "pipe"});
    studio.stdout.on("data", (chunk) => process.stdout.write(chunk));
    studio.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await waitFor(async () => {
        try { return (await fetch(`http://127.0.0.1:${studioPort}/api/context`)).ok; } catch { return false; }
    }, "candidate Studio API");
    if (sourceClient) {
        client = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "cli/studio-client/vite.config.ts", "--host", "127.0.0.1", "--port", "32102"], {cwd: root, stdio: "pipe"});
        client.stderr.on("data", (chunk) => process.stderr.write(chunk));
        await waitFor(async () => {
            try { return (await fetch(studioUrl)).ok; } catch { return false; }
        }, "candidate Studio source client");
    }
    chrome = spawn("google-chrome", [
        "--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`,
        "--remote-allow-origins=http://127.0.0.1:9227", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9227", "about:blank",
    ], {stdio: "pipe"});
    chrome.stderr.on("data", () => undefined);
    await waitFor(async () => {
        try { return Array.isArray(await json(`${devtoolsUrl}/json/list`)); } catch { return false; }
    }, "fresh Chrome CDP");
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const text = async () => evaluate("document.body.innerText");
    const has = async (phrase) => (await text()).includes(phrase);
    const setViewport = async (width, mobile = false) => cdp.send("Emulation.setDeviceMetricsOverride", {width, height: 900, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: 900});
    const click = async (label) => {
        const match = await evaluate(`(() => {
            const label = ${JSON.stringify(label)};
            const element = [...document.querySelectorAll('button,a,[role="button"],label')].find((candidate) => candidate.textContent?.trim() === label && !candidate.disabled && candidate.getClientRects().length > 0);
            if (!element) return {ok:false, controls:[...document.querySelectorAll('button,a,[role="button"],label')].filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
            const rect = element.getBoundingClientRect();
            return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
        })()`);
        if (!match?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} unavailable: ${JSON.stringify(match?.controls)}`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: match.x, y: match.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: match.x, y: match.y, button: "left", clickCount: 1});
        note(`CLICK ${JSON.stringify(label)} through rendered coordinates`);
        await pause(350);
    };
    const input = async (label, value) => {
        const match = await evaluate(`(() => {
            const label = ${JSON.stringify(label)};
            const normalize = (value) => value?.trim().replace(/\\s+\\*$/, "");
            const element = [...document.querySelectorAll('input,textarea')].find((candidate) => candidate.getClientRects().length > 0 && (candidate.getAttribute('aria-label') === label || [...(candidate.labels ?? [])].some((item) => normalize(item.textContent) === label)));
            if (!element) return {ok:false};
            const rect = element.getBoundingClientRect();
            return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
        })()`);
        if (!match?.ok) throw new Error(`Rendered input ${JSON.stringify(label)} unavailable`);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: match.x, y: match.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: match.x, y: match.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.insertText", {text: value});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        note(`INPUT ${JSON.stringify(label)} through rendered keyboard input`);
        await pause(350);
    };
    const capture = async (name, captureBeyondViewport = true) => {
        const image = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(image.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${await text()}\n`);
        note(`CAPTURE ${name}: rendered screenshot and text inventory`);
    };
    const navigate = async (hash) => {
        await cdp.send("Page.navigate", {url: `${studioUrl}/#${hash}`});
        note(`NAVIGATE ${hash} through public Studio URL`);
        await pause(450);
    };

    note("START independent rendered visual inventory and cold-start audit on a fresh browser profile");
    await setViewport(1440);
    await navigate("/");
    await waitFor(async () => (await text()).trim().length > 0, "initial rendered document");
    note(`INITIAL RENDERED TEXT ${JSON.stringify((await text()).slice(0, 800))}`);
    await capture("00-initial-render");
    await waitFor(async () => has("Design Your Game") && Boolean(await evaluate("[...document.querySelectorAll('input')].some((input) => input.value === 'Starter Slot')")), "cold-start Design Game");
    await capture("01-cold-start-design-desktop");
    await input("Game id", "");
    await waitFor(() => has("Invalid — 1 error(s).") && has("must be a non-empty string"), "visible invalid-draft recovery feedback");
    note("RECOVERY: an empty Game id rendered precise invalid-draft feedback without leaving the Design Game surface");
    await input("Game id", "starter-slot");
    await waitFor(() => has("Valid — no issues found."), "recovered valid draft");
    note("RECOVERY: correcting Game id through the rendered field restored valid feedback and left Create Project available");
    await click("Create Project");
    await waitFor(() => has("Overview") && has("Game Model") && has("Build/Export"), "created project workspace");
    note("COLD-START: Design Game → Create Project reached the runnable Workspace without a dead end");
    await capture("02-workspace-overview-desktop");
    await click("Game Model");
    await waitFor(() => has("Game Model") && has("Full strips"), "Game Model inventory");
    await capture("03-game-model-desktop");
    await click("Play");
    await waitFor(() => has("New Play session"), "Play empty state");
    await click("New Play session");
    await waitFor(() => has("Spin"), "Play active session");
    await click("Spin");
    await waitFor(async () => !(await has("No round played yet")), "completed Play spin");
    await capture("04-play-success-desktop");
    await click("Simulation");
    await waitFor(() => has("Run Simulation"), "Simulation controls");
    await input("Rounds", "1");
    await click("Run Simulation");
    await waitFor(() => has("RTP") && has("Recent runs"), "Simulation completion", 120000);
    await capture("05-simulation-success-desktop");
    await click("Replay");
    await waitFor(() => has("Session Spin"), "Replay session spin discovery");
    await capture("06-replay-session-spin-desktop");
    await click("Build/Export");
    await waitFor(() => has("Outcome libraries") && has("Stake Engine Export"), "Build Export matrix");
    await click("Generate exact outcome library (base)");
    await waitFor(async () => Boolean(await evaluate("/Generated [\\d,]+ outcomes/.test(document.body.innerText)")), "Outcome Library generation", 120000);
    await click("Run Stake Engine Export (base)");
    await waitFor(() => has("Exported") && has("file(s)"), "Stake Engine Export completion", 120000);
    await capture("07-build-export-success-desktop");
    await setViewport(405, true);
    await pause(300);
    note(`MOBILE METRICS ${JSON.stringify(await evaluate("(() => { const main = document.querySelector('.studio-app-main'); const style = getComputedStyle(main); return {innerWidth:window.innerWidth, innerHeight:window.innerHeight, devicePixelRatio:window.devicePixelRatio, small:matchMedia('(max-width: 48em)').matches, range:matchMedia('(width <= 48em)').matches, smallPixels:matchMedia('(max-width: 768px)').matches, scrollWidth:document.documentElement.scrollWidth, main:style.paddingInlineStart, appPadding:style.getPropertyValue('--app-shell-padding'), mantinePadding:style.getPropertyValue('--mantine-spacing-md'), inline:main.getAttribute('style'), classes:main.className}; })()"))}`);
    await capture("08-build-export-mobile-405", false);
    await navigate("/home/design");
    await waitFor(() => has("Design Your Game"), "Design Game modeler review");
    await click("Reels");
    await click("Per-reel (Reel Strip Modeler)");
    await waitFor(() => has("Reel Strip Modeler") && has("Select reel"), "Reel Strip Modeler");
    await click("Select reel");
    await click("Select");
    await click("Configure");
    await waitFor(() => has("Literal") && has("Generated"), "editable Modeler configuration");
    await capture("09-reel-strip-modeler-mobile-405", false);
    note("COMPLETE: desktop and 405px rendered controls covered Design, Workspace, Game Model, Play, Simulation, Replay, Build/Export and Reel Strip Modeler; no rendered error/dead-end was encountered.");
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    process.exitCode = 1;
}).finally(async () => {
    await terminate(chrome);
    await terminate(client);
    await terminate(studio);
    await rm(profile, {recursive: true, force: true});
});

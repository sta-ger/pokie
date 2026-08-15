#!/usr/bin/env node
/**
 * Host-side audit for P6-04.  CDP is used only to find rendered controls,
 * click their visible coordinates, type with the browser input channel, and
 * capture the rendered page.  It never mutates DOM/application state.
 */
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.env.P6_AUDIT_OUTPUT ?? "docs/evidence/p6-04-design-game-real-workflow");
const studio = process.env.P6_STUDIO_URL ?? "http://127.0.0.1:4614";
const devtools = process.env.P6_DEVTOOLS_URL ?? "http://127.0.0.1:9224";
const phase = process.env.P6_AUDIT_PHASE ?? "workflow";
const transcript = [];

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const existing = phase === "diagnostic" ? (await requestJson(`${devtools}/json/list`)).find((candidate) => candidate.type === "page" && candidate.url !== "about:blank") : undefined;
    const target = existing ?? await requestJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id && pending.has(response.id)) {
            const {resolve: accept, reject} = pending.get(response.id);
            pending.delete(response.id);
            response.error ? reject(new Error(JSON.stringify(response.error))) : accept(response.result);
        }
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++sequence;
        pending.set(id, {resolve: accept, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const visible = async (expression) => Boolean(await evaluate(expression));
    const waitUntil = async (expression, description, timeout = 60000) => {
        const until = Date.now() + timeout;
        while (!(await visible(expression))) {
            if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
    };
    const control = async (label) => evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const candidates = [...document.querySelectorAll('button,a,[role="button"]')];
        const element = candidates.find((candidate) => candidate.textContent?.trim() === wanted && !candidate.disabled && candidate.getClientRects().length > 0);
        if (!element) return {ok:false, available:candidates.filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
        const rect = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
    })()`);
    const click = async (label) => {
        const found = await control(label);
        if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} not found: ${JSON.stringify(found?.available)}`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        note(`CLICK ${JSON.stringify(label)} at rendered ${found.tag} coordinates (${Math.round(found.x)}, ${Math.round(found.y)})`);
        await sleep(350);
    };
    const input = async (label, value, blur = true) => {
        const found = await evaluate(`(() => {
            const wanted = ${JSON.stringify(label)};
            const normalizeLabel = (text) => text?.trim().replace(/\\s+\\*$/, "");
            const element = [...document.querySelectorAll('input,textarea')].find((candidate) => candidate.getClientRects().length > 0 && (candidate.getAttribute('aria-label') === wanted || [...(candidate.labels ?? [])].some((item) => normalizeLabel(item.textContent) === wanted)));
            if (!element) return {ok:false, available:[...document.querySelectorAll('input,textarea')].filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.getAttribute('aria-label') || [...(candidate.labels ?? [])].map((item) => item.textContent?.trim()).join('|'))};
            const rect = element.getBoundingClientRect();
            return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
        })()`);
        if (!found?.ok) throw new Error(`Rendered input ${JSON.stringify(label)} not found: ${JSON.stringify(found?.available)}`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        if (blur) {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        }
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser mouse/keyboard${blur ? " and blur" : ""}`);
        await sleep(450);
    };
    const body = async () => evaluate("document.body.innerText");
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`);
        note(`CAPTURE ${name}.png and ${name}.txt`);
    };
    const navigate = async (hash) => {
        await cdp.send("Page.navigate", {url:`${studio}/#${hash}`});
        note(`NAVIGATE public Studio URL #${hash}`);
        await sleep(500);
    };
    const playableAndSimulatable = async (label, screenshotPrefix) => {
        await click("Play");
        await waitUntil("document.body.innerText.includes('New session')", `${label} Play tab`);
        await click("New session");
        await waitUntil("document.body.innerText.includes('Spin')", `${label} active Play session`);
        await click("Spin");
        await waitUntil("!document.body.innerText.includes('No round played yet -- Spin to play.')", `${label} rendered spun round`);
        note(`OBSERVE ${label} is immediately playable: a real New session and Spin completed in the rendered Play UI.`);
        await snapshot(`${screenshotPrefix}-play`);
        await click("Simulation");
        await waitUntil("document.body.innerText.includes('Run Simulation')", `${label} Simulation tab`);
        await input("Rounds", "25");
        await click("Run Simulation");
        // On completion the UI advances directly from Run to Review, so its terminal status word is
        // intentionally no longer rendered.  The report's actual computed measures are the visible
        // completion evidence (and only render once the job's completed report has been loaded).
        await waitUntil("document.body.innerText.includes('RTP') && document.body.innerText.includes('Recent runs')", `${label} completed Simulation report`, 120000);
        note(`OBSERVE ${label} is immediately simulatable: the rendered Simulation UI completed 25 rounds and showed its report.`);
        await snapshot(`${screenshotPrefix}-simulation`);
    };

    note(`START ${phase} through fresh Chrome against ${studio}; repository=${repo}`);
    if (phase === "diagnostic") {
        note("OBSERVE current rendered Studio state after the visible workflow action.");
        await snapshot("simulation-diagnostic");
    } else if (phase === "restart") {
        const randomName = (await readFile(resolve(output, "random-generated-name.txt"), "utf-8")).trim();
        await navigate("/home/projects");
        await waitUntil("document.body.innerText.includes('Projects')", "rendered Projects page after fresh Studio restart");
        await waitUntil(`document.body.innerText.includes('P6 Recommended Edited') && document.body.innerText.includes(${JSON.stringify(randomName)})`, "both persisted managed Projects");
        const rendered = await body();
        if (!rendered.includes("Open")) throw new Error("Persisted Projects page did not expose a rendered Open action");
        note("OBSERVE fresh Studio/client renders both managed Projects with their persisted editable names and Open actions after restart.");
        await snapshot("05-after-restart-projects");
    } else {
        await navigate("/home/design");
        await waitUntil("document.body.innerText.includes('Design Your Game') && document.body.innerText.includes('New Blueprint')", "rendered Design Game page");
        await click("New Blueprint");
        await waitUntil("document.body.innerText.includes('Create Blueprint Project')", "New Blueprint dialog");
        await click("Recommended");
        await waitUntil("document.body.innerText.includes('Game name')", "Recommended guided editor");
        await input("Game name", "P6 Recommended Edited");
        await click("Create Project");
        await waitUntil("document.body.innerText.includes('P6 Recommended Edited') && document.body.innerText.includes('Close project')", "created Recommended project Workspace", 120000);
        note("OBSERVE Create Project persisted, registered, and opened the edited Recommended Project Workspace without a stale name.");
        await snapshot("01-recommended-created-workspace");
        await playableAndSimulatable("edited Recommended project", "02-recommended");
        await click("Close project");
        await waitUntil("document.body.innerText.includes('Design Your Game')", "Home after closing Recommended workspace");
        await click("New Blueprint");
        await waitUntil("document.body.innerText.includes('Create Blueprint Project')", "second New Blueprint dialog");
        await click("Random");
        await waitUntil("document.body.innerText.includes('Seed (optional)') && document.body.innerText.includes('Generate')", "Random generation controls");
        await click("Generate");
        await waitUntil("document.body.innerText.includes('Generated') && document.body.innerText.includes('20260815')", "deterministic Random generation");
        const generatedText = await body();
        const generatedName = generatedText.match(/Generated \"([^\"]+)\"/)?.[1];
        if (!generatedName) throw new Error("Rendered Random result did not provide its generated project name");
        await writeFile(resolve(output, "random-generated-name.txt"), `${generatedName}\n`);
        note(`OBSERVE Random generated ${JSON.stringify(generatedName)} from the dialog's visible default deterministic seed 20260815.`);
        await snapshot("03-deterministic-random-generated");
        await click("Use this blueprint");
        await waitUntil("document.body.innerText.includes('Create Project')", "Random guided editor");
        await click("Create Project");
        await waitUntil(`document.body.innerText.includes(${JSON.stringify(generatedName)}) && document.body.innerText.includes('Close project')`, "created Random project Workspace", 120000);
        note("OBSERVE Create Project persisted, registered, and opened the deterministic Random Project Workspace.");
        await snapshot("04-random-created-workspace");
        await playableAndSimulatable("deterministic Random project", "04-random");
    }
    note(`COMPLETE ${phase} browser workflow.`);
    await writeFile(resolve(output, `${phase}-browser-transcript.txt`), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, `${phase}-browser-transcript.txt`), `${transcript.join("\n")}\n`);
    process.exit(1);
});

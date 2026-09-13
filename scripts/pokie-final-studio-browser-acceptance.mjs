#!/usr/bin/env node
/**
 * Final-acceptance browser gate.  This is deliberately a real Chromium run:
 * it starts the checked-in built Studio, opens an actual PAR XLSX and a
 * disk-backed Blueprint with PNG artwork, and drives the rendered controls.
 * It is not a JSDOM substitute for the Studio product boundary.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {copyFile, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(process.env.POKIE_FINAL_STUDIO_EVIDENCE ?? "docs/evidence/pokie-final-acceptance/studio-browser");
const chromiumBinary = process.env.POKIE_FINAL_CHROMIUM_BINARY ?? "/snap/bin/chromium";
const browserPort = Number(process.env.POKIE_FINAL_CHROME_PORT ?? 9236);
const studioPorts = [33121, 33122];
const transcript = [];
let chrome;
let studio;
let cdp;
let profile;
let work;

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

function pause(milliseconds) {
    return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function waitFor(predicate, name, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${name}`);
        await pause(120);
    }
}

async function terminate(child) {
    if (!child || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await Promise.race([
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        pause(5_000),
    ]);
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
}

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
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

async function evaluate(expression) {
    return (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
}

async function renderedText() {
    return evaluate("document.body.innerText");
}

async function clickExpression(expression, name) {
    const point = await evaluate(`(() => {
        const element = (${expression});
        if (!element || element.disabled || element.getClientRects().length === 0) return undefined;
        element.scrollIntoView({block: "center", inline: "nearest"});
        const rect = element.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    assert.ok(point, `Rendered control unavailable: ${name}`);
    await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
    await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
    note(`CLICK ${name}`);
    await pause(180);
}

async function clickText(label, occurrence = 0) {
    await clickExpression(`[...document.querySelectorAll("button,a,[role=button]")].filter((item) => item.textContent?.trim() === ${JSON.stringify(label)} && item.getClientRects().length > 0)[${occurrence}]`, label);
}

async function press(key, code, keyCode) {
    // Chromium's raw keyboard form is important for Mantine's combobox: it
    // must receive a physical navigation key, not merely a synthetic text
    // insertion, to exercise keyboard option selection.
    await cdp.send("Input.dispatchKeyEvent", {type: "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode});
    await pause(80);
}

async function typeIntoAria(label, value) {
    await clickExpression(`document.querySelector(${JSON.stringify(`[aria-label=${JSON.stringify(label)}]`)})`, label);
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
    await cdp.send("Input.insertText", {text: value});
    note(`TYPE ${label}=${JSON.stringify(value)}`);
}

function inputForLabelExpression(label) {
    return `(() => {
        const element = [...document.querySelectorAll("label")].find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
        return element?.htmlFor ? document.getElementById(element.htmlFor) : undefined;
    })()`;
}

async function typeIntoLabel(label, value) {
    await clickExpression(inputForLabelExpression(label), label);
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
    await cdp.send("Input.insertText", {text: value});
    await press("Tab", "Tab", 9);
    note(`TYPE ${label}=${JSON.stringify(value)}`);
}

async function capture(name) {
    const image = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
    await writeFile(resolve(evidence, `${name}.png`), Buffer.from(image.data, "base64"));
    note(`CAPTURE ${name}.png`);
}

async function startStudio(project, port) {
    await terminate(studio);
    studio = spawn(process.execPath, ["dist/cli/pokie.js", project, "--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd: root, stdio: ["ignore", "pipe", "pipe"]});
    studio.stdout.on("data", (chunk) => process.stdout.write(chunk));
    studio.stderr.on("data", (chunk) => process.stderr.write(chunk));
    const url = `http://127.0.0.1:${port}`;
    await waitFor(async () => {
        try { return (await fetch(`${url}/api/context`)).ok; } catch { return false; }
    }, `Studio ${port}`);
    return url;
}

async function navigate(url) {
    await cdp.send("Page.navigate", {url});
    await pause(300);
}

async function main() {
    await mkdir(evidence, {recursive: true});
    await Promise.all(["par-overview.png", "par-game-model.png", "blueprint-play.png", "reel-artwork-picker.png", "reel-strip-modeler-preview.png", "TRANSCRIPT.txt", "results.json"].map((name) => rm(resolve(evidence, name), {force: true})));
    work = await mkdtemp(resolve(tmpdir(), "pokie-final-studio-browser-"));
    profile = await mkdtemp(resolve(tmpdir(), "pokie-final-studio-chrome-"));
    const parPath = resolve(work, "starter.par.xlsx");
    const projectDir = resolve(work, "artwork-blueprint");
    const artworkDir = resolve(projectDir, "assets", "symbols");
    const blueprintPath = resolve(projectDir, "blueprint.json");
    await mkdir(artworkDir, {recursive: true});
    await copyFile(resolve(root, "examples", "parsheets", "starter.par.xlsx"), parPath);
    // The source is an existing checked-in PNG generated by Studio evidence;
    // Studio receives it as a normal project-local image, not as a mocked URL.
    await copyFile(resolve(root, "tests", "cli", "studio", "simulation", "evidence", "P6-10", "02-outcome-library-complete.png"), resolve(artworkDir, "A.png"));
    await writeFile(blueprintPath, JSON.stringify({
        manifest: {id: "browser-artwork-slot", name: "Browser Artwork Slot", version: "1.0.0"},
        reels: 3, rows: 1, symbols: ["A", "B", "C"], paytable: {A: {3: 5}},
        reelStrips: [["A", "B", "C"], ["A", "B", "C"], ["A", "B", "C"]], availableBets: [1, 2],
        symbolArtwork: {A: "assets/symbols/A.png"},
    }, null, 2));

    chrome = spawn(chromiumBinary, ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, "--noerrdialogs", "--no-first-run", "about:blank"], {stdio: "ignore"});
    await waitFor(async () => {
        try { return Array.isArray(await json(`http://127.0.0.1:${browserPort}/json/list`)); } catch { return false; }
    }, "Chromium CDP");
    cdp = await connect();
    await cdp.send("Emulation.setDeviceMetricsOverride", {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false});

    const parStudio = await startStudio(parPath, studioPorts[0]);
    await navigate(`${parStudio}/#/project/overview`);
    await waitFor(async () => (await renderedText()).includes("Validation") && (await renderedText()).includes("Valid"), "PAR Overview validation");
    const parOverview = await evaluate(`(() => ({text: document.body.innerText, editable: document.body.innerText.includes("Read-only — this game can't be changed directly in Studio.")}))()`);
    assert.match(parOverview.text, /PAR spreadsheet/);
    assert.equal(parOverview.editable, true, "PAR Overview must make its read-only status visible");
    await capture("par-overview");
    await clickText("Game Model");
    await waitFor(async () => (await renderedText()).includes("Game basics") && (await renderedText()).includes("Layout"), "PAR read-only Game Model");
    const parModel = await evaluate(`(() => ({text: document.body.innerText, editButtons: [...document.querySelectorAll("button")].filter((item) => item.textContent?.trim() === "Edit" && item.getClientRects().length > 0).length}))()`);
    assert.match(parModel.text, /Reels:\s*\d+/);
    assert.equal(parModel.editButtons, 0, "PAR Game Model must be read-only");
    await capture("par-game-model");
    note("PASS PAR XLSX was opened through built Studio; Overview validation and its read-only Game Model were rendered.");

    const blueprintStudio = await startStudio(blueprintPath, studioPorts[1]);
    await navigate(`${blueprintStudio}/#/project/gameModel`);
    await waitFor(async () => (await renderedText()).includes("Game basics") && (await renderedText()).includes("Reels"), "Blueprint Game Model");
    await waitFor(async () => await evaluate(`Boolean([...document.images].find((image) => image.alt === "A" && image.naturalWidth > 0 && image.naturalHeight > 0))`), "visible assigned symbol artwork");
    // View model has one Edit action per canonical section; reels is the fourth
    // section. This exercises the same reusable ReelStripsEditor used by the
    // design screen rather than a test-only picker.
    await clickText("Edit", 3);
    await waitFor(async () => await evaluate(`Boolean(document.querySelector('[aria-label="Symbol picker for reel 1"]'))`), "literal reel symbol picker");
    const countBefore = await evaluate(`document.querySelectorAll('[aria-label^="Reel 1 symbol "]').length`);
    await typeIntoAria("Symbol picker for reel 1", "A");
    note(`PICKER after search ${JSON.stringify(await evaluate(`(() => {
        const input = document.querySelector('[aria-label="Symbol picker for reel 1"]');
        return {value: input?.value, expanded: input?.getAttribute("aria-expanded"), outer: input?.outerHTML, options: [...document.querySelectorAll('[role="option"]')].filter((item) => item.getClientRects().length > 0).map((item) => item.textContent?.trim()), active: document.activeElement?.getAttribute("aria-label")};
    })()`))}`);
    await waitFor(async () => await evaluate(`Boolean([...document.querySelectorAll('[role="option"]')].find((item) => item.textContent?.trim() === "A" && item.getClientRects().length > 0))`), "picker search result");
    await press("ArrowDown", "ArrowDown", 40);
    await press("Enter", "Enter", 13);
    await waitFor(async () => await evaluate(`document.querySelector('[aria-label="Symbol picker for reel 1"]')?.value === "A"`), "keyboard-selected picker value");
    await clickText("Add symbol");
    await waitFor(async () => (await evaluate(`document.querySelectorAll('[aria-label^="Reel 1 symbol "]').length`)) === countBefore + 1, "keyboard-selected symbol insertion");
    await capture("reel-artwork-picker");
    note("PASS assigned PNG artwork was visibly loaded in Game Model; searchable canonical Symbol picker accepted ArrowDown+Enter and inserted the selected literal reel symbol.");

    // Exercise the actual per-reel modeler independently of its older literal
    // sibling.  This is its full Select -> Configure -> Preview -> stop-window
    // path, including the same keyboard picker and the rendered window, not a
    // document.images shortcut or a second renderer.
    await clickExpression(`[...document.querySelectorAll("label")].find((item) => item.textContent?.trim() === "Per-reel (Reel Strip Modeler)" && item.getClientRects().length > 0)`, "Per-reel (Reel Strip Modeler)");
    await waitFor(async () => (await renderedText()).includes("Reel Strip Modeler") && await evaluate(`Boolean(document.querySelector('[aria-label="Select reel 1"]'))`), "Reel Strip Modeler");
    await clickExpression(`document.querySelector('[aria-label="Select reel 1"]')`, "Select reel 1");
    await waitFor(async () => await evaluate(`Boolean(document.querySelector('[aria-label="Symbol picker for reel 1"]'))`), "per-reel Configure");
    const perReelCountBefore = await evaluate(`document.querySelectorAll('[aria-label^="Reel 1 symbol "]').length`);
    await typeIntoAria("Symbol picker for reel 1", "A");
    await waitFor(async () => await evaluate(`Boolean([...document.querySelectorAll('[role="option"]')].find((item) => item.textContent?.trim() === "A" && item.getClientRects().length > 0))`), "per-reel picker search result");
    await press("ArrowDown", "ArrowDown", 40);
    await press("Enter", "Enter", 13);
    await clickExpression(`document.querySelector('[aria-label="Add symbol to reel 1"]')`, "Add symbol to reel 1");
    await waitFor(async () => (await evaluate(`document.querySelectorAll('[aria-label^="Reel 1 symbol "]').length`)) === perReelCountBefore + 1, "per-reel keyboard symbol insertion");
    await clickExpression(`document.querySelector('[aria-label="Check & preview"]')`, "per-reel Preview");
    await waitFor(async () => (await renderedText()).includes("Literal strip"), "per-reel preview result");
    await clickExpression(`document.querySelector('[aria-label="Continue to Preview stop windows"]')`, "Open stop-window preview");
    await waitFor(async () => (await renderedText()).includes("Stop window preview"), "stop-window preview");
    await typeIntoLabel("Visible rows", "3");
    const stopZero = await evaluate(`(() => {
        const section = [...document.querySelectorAll("fieldset")].find((item) => item.querySelector("legend")?.textContent?.trim() === "Stop window preview");
        return section ? [...section.querySelectorAll("td")].map((item) => item.textContent?.trim()) : undefined;
    })()`);
    await typeIntoLabel("Stop position", "1");
    await waitFor(async () => await evaluate(`(() => {
        const section = [...document.querySelectorAll("fieldset")].find((item) => item.querySelector("legend")?.textContent?.trim() === "Stop window preview");
        return section ? [...section.querySelectorAll("td")].map((item) => item.textContent?.trim()).join(",") !== ${JSON.stringify(stopZero?.join(","))} : false;
    })()`), "changed stop position");
    const stopWindow = await evaluate(`(() => {
        const section = [...document.querySelectorAll("fieldset")].find((item) => item.querySelector("legend")?.textContent?.trim() === "Stop window preview");
        if (!section) return undefined;
        const cells = [...section.querySelectorAll("td")];
        return {
            cells: cells.map((item) => item.textContent?.trim()),
            assignedArtwork: Boolean([...section.querySelectorAll("img")].find((image) => image.alt === "A" && image.naturalWidth > 0 && image.naturalHeight > 0)),
            textFallback: cells.some((item) => item.textContent?.trim() === "B" && !item.querySelector("img")),
        };
    })()`);
    assert.equal(stopWindow?.cells.length, 3, `Expected three visible stop-window rows: ${JSON.stringify(stopWindow)}`);
    assert.equal(stopWindow?.assignedArtwork, true, `Assigned A artwork was not rendered in the stop window: ${JSON.stringify(stopWindow)}`);
    assert.equal(stopWindow?.textFallback, true, `Unassigned B did not retain text fallback in the stop window: ${JSON.stringify(stopWindow)}`);
    await capture("reel-strip-modeler-preview");
    note(`PASS per-reel modeler selected/configured Reel 1, inserted A with keyboard picker, previewed a changed stop window and rendered artwork plus fallback: before=${JSON.stringify(stopZero)}, after=${JSON.stringify(stopWindow)}.`);

    await navigate(`${blueprintStudio}/#/project/play`);
    await waitFor(async () => (await renderedText()).includes("New Play session"), "Play start state");
    await clickText("New Play session");
    await waitFor(async () => (await renderedText()).includes("Spin"), "Play session");
    await clickText("Spin");
    await waitFor(async () => (await renderedText()).includes("Round complete") && await evaluate(`Boolean(document.querySelector('[data-pokie-player="canonical-v1"]'))`), "completed real Play spin");
    const playLayout = await evaluate(`(() => {
        const spin = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Spin" && item.getClientRects().length > 0)?.getBoundingClientRect();
        const player = document.querySelector('[data-pokie-player="canonical-v1"]')?.getBoundingClientRect();
        const result = [...document.querySelectorAll("*")].find((item) => item.textContent?.trim().startsWith("Round complete"))?.getBoundingClientRect();
        return {height: window.innerHeight, spin: spin && {top: spin.top, bottom: spin.bottom}, player: player && {top: player.top, bottom: player.bottom}, result: result && {top: result.top, bottom: result.bottom}};
    })()`);
    assert.ok(playLayout.spin && playLayout.player && playLayout.result, "Play must render Spin, result and canonical screen");
    assert.ok(playLayout.spin.bottom <= playLayout.height && playLayout.player.bottom <= playLayout.height && playLayout.result.bottom <= playLayout.height, `Play primary loop did not fit its viewport: ${JSON.stringify(playLayout)}`);
    await capture("blueprint-play");
    note(`PASS Play primary loop fits one 1280x800 viewport: ${JSON.stringify(playLayout)}.`);
    await writeFile(resolve(evidence, "results.json"), `${JSON.stringify({status: "passed", browser: {viewport: {width: 1280, height: 800}, chromium: chromiumBinary}, scenarios: ["PAR Overview validation", "PAR read-only Game Model", "assigned symbol artwork", "searchable keyboard symbol picker", "Per-reel modeler stop-window artwork and fallback", "Play primary loop"]}, null, 2)}\n`);
}

main().catch((error) => {
    note(`FAILED ${error.stack ?? error}`);
    process.exitCode = 1;
}).finally(async () => {
    await writeFile(resolve(evidence, "TRANSCRIPT.txt"), `${transcript.join("\n")}\n`).catch(() => undefined);
    cdp?.close();
    await terminate(studio);
    await terminate(chrome);
    if (profile) await rm(profile, {recursive: true, force: true});
    if (work) await rm(work, {recursive: true, force: true});
});

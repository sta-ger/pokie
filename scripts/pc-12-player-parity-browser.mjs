#!/usr/bin/env node
/**
 * PC-12's independent browser verifier.  It deliberately talks only to the public Studio page and
 * fixture-slot page, then crops the shared [data-pokie-player] region before comparing it.  The host
 * shells are allowed to differ; the mounted player contract is not.
 *
 * Run after building POKIE, with PC_12_STUDIO_PROJECT set to the deterministic fixture package root:
 *   PC_12_STUDIO_PROJECT=/path/to/fixture-package node scripts/pc-12-player-parity-browser.mjs
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const canonicalPlayerSelector = '[data-pokie-player="canonical-v1"]';

export function comparePlayerRegions(studio, examples) {
    const differing = [];
    for (const key of ["cells", "wins", "features", "totals", "paytable", "controls", "hover", "overflow"]) {
        if (JSON.stringify(studio[key]) !== JSON.stringify(examples[key])) differing.push(key);
    }
    if (differing.length > 0) {
        throw new Error(`Canonical player parity diverged: ${differing.join(", ")}`);
    }
}

function checksum(value) {
    return createHash("sha256").update(value).digest("hex");
}

function wait(milliseconds) {
    return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitFor(predicate, name, timeout = 120000) {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${name}`);
        await wait(150);
    }
}

async function terminate(child) {
    if (child === undefined || child.exitCode !== null || child.killed) return;
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => child.once("exit", resolveExit)), wait(5000)]);
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
}

async function devtoolsJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect(devtoolsUrl) {
    const target = await devtoolsJson(`${devtoolsUrl}/json/new?${encodeURIComponent("about:blank")}`);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        const request = pending.get(response.id);
        if (request === undefined) return;
        pending.delete(response.id);
        response.error === undefined ? request.resolve(response.result) : request.reject(new Error(JSON.stringify(response.error)));
    });
    const send = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
        const id = ++sequence;
        pending.set(id, {resolve: resolveRequest, reject: rejectRequest});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

function playerSnapshotExpression() {
    return `(() => {
        const player = document.querySelector(${JSON.stringify(canonicalPlayerSelector)});
        if (!player) return undefined;
        const text = (selector) => [...player.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? "");
        const cells = [...player.querySelectorAll("[data-cell]")].map((cell) => ({
            id: cell.dataset.cell,
            symbol: cell.textContent?.trim() ?? "",
            color: getComputedStyle(cell).backgroundColor,
        }));
        const controls = [...player.querySelectorAll("button")].map((button) => ({
            label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
            disabled: button.disabled,
            pressed: button.getAttribute("aria-pressed"),
        }));
        return {
            cells, wins: text(".player-wins-list button"), features: text(".player-features"),
            totals: text(".player-round-totals dd"), paytable: text(".player-paytable tr"), controls,
            hover: text(".player-highlight-button"),
            overflow: player.scrollWidth > player.clientWidth,
        };
    })()`;
}

async function main() {
    const project = process.env.PC_12_STUDIO_PROJECT;
    if (project === undefined || project.trim() === "") {
        throw new Error("PC_12_STUDIO_PROJECT must name the deterministic same-game fixture package.");
    }
    const examplesRoot = resolve(process.env.POKIE_EXAMPLES_PATH ?? "../pokie-examples");
    const evidence = resolve(process.env.PC_12_EVIDENCE_DIR ?? "docs/evidence/phase7-product-coherence/pc-12-player-parity/current-run");
    const profile = await mkdtemp(resolve(tmpdir(), "pokie-pc12-"));
    const studioPort = 32192;
    const examplesPort = 51792;
    const devtoolsPort = 9229;
    const studioUrl = `http://127.0.0.1:${studioPort}`;
    const examplesUrl = `http://127.0.0.1:${examplesPort}/fixture-slot.html`;
    const devtoolsUrl = `http://127.0.0.1:${devtoolsPort}`;
    let studio;
    let examples;
    let chromium;
    let cdp;
    const transcript = [];
    const note = (message) => transcript.push(`[${new Date().toISOString()}] ${message}`);

    try {
        await mkdir(evidence, {recursive: true});
        studio = spawn(process.execPath, ["dist/cli/pokie.js", "studio", project, "--no-open", "--host", "127.0.0.1", "--port", String(studioPort)], {cwd: root, stdio: "pipe"});
        examples = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(examplesPort)], {cwd: examplesRoot, stdio: "pipe"});
        await waitFor(async () => {
            try { return (await fetch(`${studioUrl}/api/context`)).ok; } catch { return false; }
        }, "Studio public API");
        await waitFor(async () => {
            try { return (await fetch(examplesUrl)).ok; } catch { return false; }
        }, "fixture-slot public page");

        chromium = spawn("chromium", [
            "--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${resolve(profile, "chromium")}`,
            "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${devtoolsPort}`, "about:blank",
        ], {stdio: "pipe"});
        await waitFor(async () => {
            try { return Array.isArray(await devtoolsJson(`${devtoolsUrl}/json/list`)); } catch { return false; }
        }, "Chromium");
        cdp = await connect(devtoolsUrl);
        const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
        const navigate = async (url) => {
            await cdp.send("Page.navigate", {url});
            await waitFor(async () => (await evaluate("document.readyState")) === "complete", `page ${url}`);
        };
        const click = async (label) => {
            const point = await evaluate(`(() => { const node = [...document.querySelectorAll("button,a,[role=button]")].find((item) => item.textContent?.trim() === ${JSON.stringify(label)} && !item.disabled && item.getClientRects().length > 0); if (!node) return; const rect = node.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}; })()`);
            if (point === undefined) throw new Error(`Visible control ${JSON.stringify(label)} was unavailable.`);
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            note(`CLICK ${label}`);
        };
        const capture = async (name) => {
            const player = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(canonicalPlayerSelector)}); if (!node) return; const rect = node.getBoundingClientRect(); return {x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: window.devicePixelRatio}; })()`);
            assert.ok(player, "canonical player region must be visible before capture");
            const image = await cdp.send("Page.captureScreenshot", {format: "png", clip: player});
            const bytes = Buffer.from(image.data, "base64");
            await writeFile(resolve(evidence, `${name}.png`), bytes);
            return checksum(bytes);
        };
        const settleAndCapture = async (name) => {
            await waitFor(async () => (await evaluate(playerSnapshotExpression())) !== undefined, `${name} player`);
            const snapshot = await evaluate(playerSnapshotExpression());
            return {snapshot, checksum: await capture(name)};
        };

        note(`fixture project=${project}; examples fixture=${examplesUrl}; seed=fixture-round`);
        await navigate(examplesUrl);
        await click("Win");
        const exampleDesktop = await settleAndCapture("examples-desktop");
        await navigate(`${studioUrl}/#/project/play`);
        await click("New Play session");
        await click("Spin");
        const studioDesktop = await settleAndCapture("studio-desktop");
        comparePlayerRegions(studioDesktop.snapshot, exampleDesktop.snapshot);

        for (const [name, url] of [["examples-mobile", examplesUrl], ["studio-mobile", `${studioUrl}/#/project/play`]]) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
            await navigate(url);
            const captureResult = await settleAndCapture(name);
            if (captureResult.snapshot.overflow) throw new Error(`${name} player overflows its viewport.`);
            note(`CAPTURE ${name} sha256=${captureResult.checksum}`);
        }
        await cdp.send("Emulation.clearDeviceMetricsOverride");
        await writeFile(resolve(evidence, "parity.json"), `${JSON.stringify({
            fixture: {project, seed: "fixture-round"}, browser: {desktop: [1280, 800], narrow: [390, 844]},
            comparison: "passed", screenshots: {studioDesktop: studioDesktop.checksum, examplesDesktop: exampleDesktop.checksum},
        }, null, 2)}\n`);
        note("PASS canonical player DOM, semantics, computed highlight styles and viewport overflow matched.");
    } catch (error) {
        note(`FAILED ${error.stack ?? error}`);
        throw error;
    } finally {
        await writeFile(resolve(evidence, "TRANSCRIPT.txt"), `${transcript.join("\n")}\n`).catch(() => undefined);
        cdp?.close();
        await terminate(chromium);
        await terminate(examples);
        await terminate(studio);
        await rm(profile, {recursive: true, force: true});
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error.stack ?? error}\n`);
        process.exitCode = 1;
    });
}

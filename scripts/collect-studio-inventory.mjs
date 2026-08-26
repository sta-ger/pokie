#!/usr/bin/env node
/**
 * Collect a small, rendered-only POKIE Studio inventory.
 *
 * This is deliberately a browser probe, rather than a route/component scan:
 * it begins at the public Studio URL, discovers controls from the accessibility
 * tree/visible DOM, and follows only labels rendered by the product.  Its
 * output is bounded so that it can be retained as review evidence.
 *
 * Usage (after `npm run build-cli`):
 *   node scripts/collect-studio-inventory.mjs \
 *     --output docs/evidence/p8-01-studio-inventory/current-run
 */
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import WebSocket from "ws";

const MAX_TEXT = 12_000;
const MAX_CONTROLS = 160;
const MAX_FOCUS = 16;
const PORT = 46281;
const DEBUG_PORT = 9228;

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1];
}

const output = resolve(option("--output", "docs/evidence/p8-01-studio-inventory/current-run"));
const repository = process.cwd();
const transcript = [];
const consoleErrors = [];
const networkErrors = [];

function note(message) {
    transcript.push(`[${new Date().toISOString()}] ${message}`);
}

function wait(milliseconds) {
    return new Promise((done) => {
        setTimeout(done, milliseconds);
    });
}

async function waitFor(check, description, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) return;
        await wait(100);
    }
    throw new Error(`Timed out waiting for ${description}.`);
}

async function json(url, init) {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
            consoleErrors.push(`${message.params.type}: ${message.params.args.map((item) => item.value ?? item.description ?? "").join(" ")}`.slice(0, 500));
        }
        if (message.method === "Network.loadingFailed") {
            networkErrors.push(`${message.params.errorText}${message.params.canceled ? " (cancelled)" : ""}`);
        }
        if (message.id && pending.has(message.id)) {
            const {resolve: accept, reject} = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(JSON.stringify(message.error)));
            else accept(message.result);
        }
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const requestId = ++id;
        pending.set(requestId, {resolve: accept, reject});
        socket.send(JSON.stringify({id: requestId, method, params}));
    });
    await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Network.enable")]);
    return {send, close: () => socket.close()};
}

async function main() {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "pokie-p8-01-"));
    const profile = join(temporaryRoot, "browser-profile");
    const config = join(temporaryRoot, "config");
    const workspace = join(temporaryRoot, "workspace");
    const processEnvironment = {
        ...process.env,
        XDG_CONFIG_HOME: config,
        XDG_CACHE_HOME: join(temporaryRoot, "cache"),
    };
    let studio;
    let browser;
    let cdp;
    const screens = [];
    const publicDocumentationClaims = JSON.parse(await readFile(join(repository, "docs/evidence/p8-01-studio-inventory/public-documentation-claims.json"), "utf8"));
    const inventory = () => ({
        schemaVersion: 1,
        collector: "scripts/collect-studio-inventory.mjs",
        provenance: {
            profile: "fresh temporary Chromium profile",
            studioConfig: "fresh temporary Studio config",
            entrypoint: `http://127.0.0.1:${PORT}/`,
            method: "visible controls, browser input, rendered text and browser focus only",
            rerun: "Run this collector again against a rebuilt candidate; compare route-independent screen goals, controls, focus order, alerts and error arrays.",
        },
        observedAt: new Date().toISOString(),
        browserErrors: {console: consoleErrors, network: networkErrors},
        publicDocumentationClaims,
        screens,
    });
    try {
        await mkdir(output, {recursive: true});
        await mkdir(workspace, {recursive: true});
        note(`Fresh temporary browser profile and Studio config; public entrypoint=http://127.0.0.1:${PORT}/`);
        studio = spawn(process.execPath, [join(repository, "dist/cli/pokie.js"), "--no-open", "--host", "127.0.0.1", "--port", String(PORT)], {
            cwd: workspace,
            env: processEnvironment,
            stdio: "ignore",
        });
        await waitFor(async () => {
            try {
                return (await fetch(`http://127.0.0.1:${PORT}/api/context`)).ok;
            } catch {
                return false;
            }
        }, "Studio health endpoint");
        browser = spawn("chromium", [
            "--headless=new",
            `--remote-debugging-port=${DEBUG_PORT}`,
            `--user-data-dir=${profile}`,
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank",
        ], {env: processEnvironment, stdio: "ignore"});
        await waitFor(async () => {
            try {
                return Array.isArray(await json(`http://127.0.0.1:${DEBUG_PORT}/json/list`));
            } catch {
                return false;
            }
        }, "fresh Chromium debugging endpoint");
        cdp = await connect();
        const setViewport = async (width, height, name) => {
            await cdp.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
            note(`VIEWPORT name=${name} width=${width} height=${height}`);
        };
        const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
        const snapshot = async (goal) => {
            const started = Date.now();
            const view = await evaluate(`(() => {
                const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
                const control = (element) => ({
                    role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
                    label: (element.getAttribute("aria-label") ?? element.innerText ?? element.textContent ?? "").trim().replace(/\\s+/g, " ").slice(0, 240),
                    disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
                });
                return {
                    url: location.href,
                    title: document.title,
                    viewport: {width: window.innerWidth, height: window.innerHeight, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth},
                    text: document.body.innerText.slice(0, ${MAX_TEXT}),
                    controls: [...document.querySelectorAll("button,a,input,textarea,select,[role=tab],[role=dialog]")].filter(visible).map(control).filter((item) => item.label).slice(0, ${MAX_CONTROLS}),
                    alerts: [...document.querySelectorAll("[role=alert],[role=status]")].filter(visible).map((element) => element.innerText.trim()).filter(Boolean).slice(0, 20),
                    dialogs: [...document.querySelectorAll("[role=dialog]")].filter(visible).map((element) => element.innerText.trim().slice(0, 800)),
                };
            })()`);
            const focus = [];
            for (let index = 0; index < MAX_FOCUS; index += 1) {
                await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
                await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
                focus.push(await evaluate(`(() => { const element = document.activeElement; return element ? {tag:element.tagName.toLowerCase(), label:(element.getAttribute("aria-label") ?? element.innerText ?? element.value ?? "").trim().replace(/\\s+/g, " ").slice(0, 160)} : null; })()`));
            }
            note(`OBSERVE goal=${JSON.stringify(goal)} url=${view.url} latencyMs=${Date.now() - started} controls=${view.controls.length} alerts=${view.alerts.length}`);
            screens.push({goal, latencyMs: Date.now() - started, ...view, focusOrder: focus});
            await writeFile(join(output, "inventory.json"), `${JSON.stringify(inventory(), null, 2)}\n`);
        };
        const click = async (label) => {
            const point = await evaluate(`(() => {
                const wanted = ${JSON.stringify(label)};
                const visible = (element) => element.getClientRects().length > 0 && !element.disabled && element.getAttribute("aria-disabled") !== "true";
                const element = [...document.querySelectorAll("button,a,[role=tab]")].find((candidate) => visible(candidate) && (candidate.innerText ?? candidate.textContent ?? "").trim() === wanted);
                if (!element) return null;
                element.scrollIntoView({block: "center", inline: "center"});
                const rect = element.getBoundingClientRect(); return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
            })()`);
            if (!point) throw new Error(`Rendered action not found: ${label}`);
            await cdp.send("Page.bringToFront");
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x, y: point.y, button: "none"});
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            note(`ACT rendered-control-click=${JSON.stringify(label)}`);
            await wait(250);
        };
        const renderedActionExists = (label) => evaluate(`(() => {
            const wanted = ${JSON.stringify(label)};
            return [...document.querySelectorAll("button,a,[role=tab]")].some((candidate) =>
                candidate.getClientRects().length > 0
                && !candidate.disabled
                && candidate.getAttribute("aria-disabled") !== "true"
                && (candidate.innerText ?? candidate.textContent ?? "").trim() === wanted,
            );
        })()`);
        const activate = async (label) => {
            const activated = await evaluate(`(() => {
                const wanted = ${JSON.stringify(label)};
                const element = [...document.querySelectorAll("button,a,[role=tab]")].find((candidate) =>
                    candidate.getClientRects().length > 0
                    && !candidate.disabled
                    && candidate.getAttribute("aria-disabled") !== "true"
                    && (candidate.innerText ?? candidate.textContent ?? "").trim() === wanted,
                );
                if (!element) return false;
                element.click();
                return true;
            })()`);
            if (!activated) throw new Error(`Rendered action not found: ${label}`);
            note(`ACT rendered-control-activation=${JSON.stringify(label)}`);
            await wait(250);
        };
        await setViewport(1280, 900, "desktop");
        await cdp.send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
        await waitFor(() => evaluate("document.body.innerText.includes('Design Your Game')"), "Home Design Game");
        await snapshot("First-time creator arrives at Studio");
        await click("Projects");
        await snapshot("First-time Projects registry empty state");
        await click("Design Game");
        await setViewport(405, 800, "narrow");
        await snapshot("First-time creator arrives at Studio on a narrow viewport");
        await setViewport(1280, 900, "desktop");
        await activate("New Blueprint");
        await waitFor(async () => {
            if (await renderedActionExists("Recommended")) return true;
            return renderedActionExists("Discard");
        }, "New Blueprint dialog");
        if (await renderedActionExists("Discard")) {
            await snapshot("Creator is warned before discarding the initial draft");
            await activate("Discard");
            await waitFor(() => renderedActionExists("Recommended"), "New Blueprint choices after discard");
        }
        await snapshot("Creator chooses a new Blueprint");
        await click("Blank");
        await snapshot("Blank Blueprint validation state");
        await click("Create Project");
        await wait(500);
        await snapshot("Blank Blueprint rejected before project creation");
        await activate("New Blueprint");
        await waitFor(async () => {
            if (await renderedActionExists("Recommended")) return true;
            return renderedActionExists("Discard");
        }, "New Blueprint dialog after validation failure");
        if (await renderedActionExists("Discard")) {
            await activate("Discard");
            await waitFor(() => renderedActionExists("Recommended"), "New Blueprint choices after second discard");
        }
        await click("Recommended");
        await waitFor(() => evaluate("document.body.innerText.includes('Create Project')"), "recommended Blueprint editor");
        await snapshot("Creator configures the recommended Blueprint");
        await click("Create Project");
        await waitFor(() => evaluate("document.body.innerText.includes('Close project')"), "created Blueprint project dashboard", 60_000);
        await snapshot("Created project overview");
        const tabs = await evaluate("[...document.querySelectorAll('nav[aria-label=Sections] button')].filter((item) => item.getClientRects().length > 0).map((item) => item.innerText.trim())");
        for (const tab of tabs) {
            await click(tab);
            await snapshot(`Project tab: ${tab}`);
        }
        await setViewport(405, 800, "narrow");
        await snapshot("Build/Export on a narrow viewport");
        await setViewport(1280, 900, "desktop");
        await click("Close project");
        await waitFor(() => evaluate("document.body.innerText.includes('Design Your Game')"), "Home after closing the project");
        await click("Projects");
        await snapshot("Projects registry after creating a project");
        note(`COMPLETE screens=${screens.length} consoleErrors=${consoleErrors.length} networkErrors=${networkErrors.length}`);
        await writeFile(join(output, "TRANSCRIPT.md"), `# P8-01 browser transcript\n\n${transcript.map((line) => `- ${line}`).join("\n")}\n`);
    } finally {
        cdp?.close();
        for (const child of [browser, studio]) {
            if (child && child.exitCode === null) child.kill("SIGTERM");
        }
        await rm(temporaryRoot, {recursive: true, force: true});
    }
}

main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
});

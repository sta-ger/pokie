#!/usr/bin/env node
/**
 * PC-12's independent browser verifier.  It deliberately talks only to the public Studio page and
 * fixture-slot page, then crops the shared [data-pokie-player] region before comparing it.  The host
 * shells are allowed to differ; the mounted player contract is not.
 *
 * Run with two deterministic fixture package roots. The runner packs the candidate's checked-in
 * distributable files, so its isolated consumer always loads this source candidate's public
 * browser/player exports without taking ownership of the repository's build gate. The second project is opened while a Play preparation is pending, so this
 * verifies Studio's real project-switch boundary:
 *   PC_12_STUDIO_PROJECT=/path/to/fixture-a PC_12_SUPERSEDING_PROJECT=/path/to/fixture-b \
 *     node scripts/pc-12-player-parity-browser.mjs
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {inflateSync} from "node:zlib";
import {basename, dirname, resolve, sep} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const canonicalPlayerSelector = '[data-pokie-player="canonical-v1"]';
export const pc12FixtureSeed = "fixture-round";
export const pc12FixtureId = "pc-12-free-games-fixture";
export const desktopViewport = {width: 1280, height: 800};
export const narrowViewport = {width: 390, height: 844};

// Studio is launched through POKIE's public implicit-project form.  `studio` is an internal
// dispatcher name, not a user-facing subcommand, so including it here makes an exact packed
// candidate exit before its server can start.
export function studioLaunchArguments(project, port) {
    return ["dist/cli/pokie.js", project, "--no-open", "--host", "127.0.0.1", "--port", String(port)];
}

export async function validatePc12FixtureContract(project, supersedingProject, examplesRoot) {
    const [manifest, studioEntry, examplesEntry] = await Promise.all([
        readFile(resolve(project, "package.json"), "utf8").then(JSON.parse),
        readFile(resolve(project, "index.js"), "utf8"),
        readFile(resolve(examplesRoot, "src/games/fixture-slot/index.ts"), "utf8"),
    ]);
    assert.equal(manifest.name, "playable-game-with-free-games", "Studio must use PC-12's deterministic free-games fixture package");
    assert.notEqual(resolve(project), resolve(supersedingProject), "The project-switch fixture root must be distinct");
    assert.match(studioEntry, /createPc12FreeGamesFixtureSession/, "Studio fixture must use the shared PC-12 free-games factory");
    assert.match(studioEntry, /PC_12_FEATURED_ROUND_SEED/, "Studio fixture must default to the shared featured-round seed");
    assert.match(examplesEntry, /createPc12FreeGamesFixtureSession/, "Examples must use the shared PC-12 free-games factory");
    assert.match(examplesEntry, /PC_12_FEATURED_ROUND_SEED/, "Examples must use the shared featured-round seed");
    assert.match(examplesEntry, /FIXTURE_SEED = PC_12_FEATURED_ROUND_SEED/, "Examples must expose the same seeded fixture identity");
    return {fixtureId: pc12FixtureId, seed: pc12FixtureSeed, project: resolve(project), supersedingProject: resolve(supersedingProject)};
}

// Keep this list deliberately limited to the shared player.  Studio's page chrome and the examples'
// Bootstrap shell are allowed to differ, but a change to any of these values is a visible player
// regression (and not merely a different serialisation of the same round).
export const canonicalPlayerComparisonKeys = [
    "cells", "wins", "features", "totals", "paytable", "controls", "hover", "styles", "layout", "overflow",
];

function comparablePlayerRegion(region) {
    // The player is deliberately hosted inside different applications. Its outer mount can therefore
    // legitimately receive a different available width/height from Studio's AppShell and the examples
    // page. Compare every player-owned child layout, but not that host-provided mount geometry.
    const layout = {...region.layout};
    delete layout.player;
    return {...region, layout};
}

export function comparePlayerRegions(studio, examples) {
    const differing = [];
    const comparableStudio = comparablePlayerRegion(studio);
    const comparableExamples = comparablePlayerRegion(examples);
    for (const key of canonicalPlayerComparisonKeys) {
        if (JSON.stringify(comparableStudio[key]) !== JSON.stringify(comparableExamples[key])) differing.push(key);
    }
    if (differing.length > 0) {
        throw new Error(`Canonical player parity diverged: ${differing.join(", ")}`);
    }
}

export function exactCandidateConsumerManifest(manifest, candidateArchive) {
    return {
        ...manifest,
        dependencies: {...manifest.dependencies, pokie: `file:${candidateArchive}`},
    };
}

export function assertExactCandidatePlayerExport(resolvedExport, consumerRoot) {
    const installedPackage = `${resolve(consumerRoot, "node_modules", "pokie")}${sep}`;
    // import.meta.resolve returns a file URL, whereas path.resolve expects a filesystem path.
    // Keep accepting a path here for the focused contract test and for Node versions that return one.
    const resolvedPath = resolvedExport.startsWith("file:") ? fileURLToPath(resolvedExport) : resolve(resolvedExport);
    assert.ok(
        resolvedPath.startsWith(installedPackage),
        `pokie/client/player must resolve from the isolated candidate install, received ${resolvedExport}`,
    );
    assert.match(resolvedPath, /[\\/]dist[\\/]cli[\\/]client[\\/]player[\\/]index\.js$/, "pokie/client/player must resolve the public player export");
}

function readPngRgba(bytes) {
    const signature = "89504e470d0a1a0a";
    assert.equal(bytes.subarray(0, 8).toString("hex"), signature, "capture must be a PNG");
    let offset = 8;
    let width;
    let height;
    let bitDepth;
    let colorType;
    const data = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
        const chunk = bytes.subarray(offset + 8, offset + 8 + length);
        offset += length + 12;
        if (type === "IHDR") {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            bitDepth = chunk[8];
            colorType = chunk[9];
        } else if (type === "IDAT") {
            data.push(chunk);
        } else if (type === "IEND") {
            break;
        }
    }
    assert.equal(bitDepth, 8, "only 8-bit Chromium screenshots are supported");
    assert.ok(colorType === 2 || colorType === 6, "only RGB/RGBA Chromium screenshots are supported");
    assert.ok(width !== undefined && height !== undefined, "PNG header is required");
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const stride = width * bytesPerPixel;
    const encoded = inflateSync(Buffer.concat(data));
    const rgba = Buffer.alloc(stride * height);
    let source = 0;
    for (let row = 0; row < height; row++) {
        const filter = encoded[source++];
        const destination = row * stride;
        for (let column = 0; column < stride; column++) {
            const value = encoded[source++];
            const left = column >= bytesPerPixel ? rgba[destination + column - bytesPerPixel] : 0;
            const above = row > 0 ? rgba[destination + column - stride] : 0;
            const upperLeft = row > 0 && column >= bytesPerPixel ? rgba[destination + column - stride - bytesPerPixel] : 0;
            if (filter === 0) rgba[destination + column] = value;
            if (filter === 1) rgba[destination + column] = (value + left) & 255;
            if (filter === 2) rgba[destination + column] = (value + above) & 255;
            if (filter === 3) rgba[destination + column] = (value + Math.floor((left + above) / 2)) & 255;
            if (filter === 4) {
                const predictor = left + above - upperLeft;
                const leftDistance = Math.abs(predictor - left);
                const aboveDistance = Math.abs(predictor - above);
                const upperLeftDistance = Math.abs(predictor - upperLeft);
                rgba[destination + column] = (value + (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft)) & 255;
            }
        }
    }
    return {width, height, rgba, bytesPerPixel};
}

/**
 * Rejects a material rendered-pixel change.  A small tolerance keeps harmless Chromium anti-aliasing
 * noise out of the signal, while dimensions, broad colour changes and rearranged player sections fail.
 */
export function comparePlayerScreenshots(studioBytes, examplesBytes) {
    const studio = readPngRgba(studioBytes);
    const examples = readPngRgba(examplesBytes);
    assert.equal(studio.width, examples.width, "Canonical player screenshot widths diverged");
    assert.equal(studio.height, examples.height, "Canonical player screenshot heights diverged");
    assert.equal(studio.bytesPerPixel, examples.bytesPerPixel, "Canonical player screenshot colour formats diverged");
    let changedPixels = 0;
    let totalDifference = 0;
    for (let offset = 0; offset < studio.rgba.length; offset += studio.bytesPerPixel) {
        const difference = Math.abs(studio.rgba[offset] - examples.rgba[offset]) + Math.abs(studio.rgba[offset + 1] - examples.rgba[offset + 1]) + Math.abs(studio.rgba[offset + 2] - examples.rgba[offset + 2]);
        totalDifference += difference;
        if (difference > 18) changedPixels++;
    }
    const changedRatio = changedPixels / (studio.width * studio.height);
    const meanDifference = totalDifference / (studio.width * studio.height * 3);
    assert.ok(changedRatio <= 0.02 && meanDifference <= 3, `Canonical player screenshot diverged (changed=${changedRatio.toFixed(4)}, mean=${meanDifference.toFixed(2)})`);
    return {width: studio.width, height: studio.height, changedRatio, meanDifference};
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

async function runCommand(command, args, options) {
    const child = spawn(command, args, {cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolveExit, rejectExit) => {
        child.once("error", rejectExit);
        child.once("exit", resolveExit);
    });
    if (exitCode !== 0) {
        throw new Error(`${command} ${args.join(" ")} failed with ${exitCode}: ${stderr || stdout}`);
    }
    return stdout;
}

async function prepareExactCandidateConsumer(examplesRoot, staging) {
    // The test runner validates an installable candidate, but it must not invoke the repository-wide
    // build/prepack gate.  `dist/` is the checked-in package payload supplied to consumers; packing
    // it with lifecycle scripts disabled verifies resolution from that exact archive.
    const packed = JSON.parse(await runCommand("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", staging], {cwd: root}));
    const candidateArchive = resolve(staging, packed[0].filename);
    const consumerRoot = resolve(staging, "pokie-examples");
    await cp(examplesRoot, consumerRoot, {
        recursive: true,
        filter: (source) => ![".git", "dist", "node_modules"].includes(basename(source)),
    });
    const manifest = JSON.parse(await readFile(resolve(consumerRoot, "package.json"), "utf8"));
    await writeFile(resolve(consumerRoot, "package.json"), `${JSON.stringify(exactCandidateConsumerManifest(manifest, candidateArchive), null, 2)}\n`);
    await rm(resolve(consumerRoot, "package-lock.json"), {force: true});
    await runCommand("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {cwd: consumerRoot});
    const resolvedExport = (await runCommand(process.execPath, ["--input-type=module", "--eval", "process.stdout.write(import.meta.resolve('pokie/client/player'))"], {cwd: consumerRoot})).trim();
    assertExactCandidatePlayerExport(resolvedExport, consumerRoot);
    return {consumerRoot, candidateArchive, resolvedExport};
}

async function devtoolsJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect(devtoolsUrl) {
    // Recent Chromium versions reject GET /json/new. Chromium already has the about:blank tab
    // supplied at launch, so attach to that ordinary page target instead of relying on the
    // deprecated target-creation endpoint.
    const targets = await devtoolsJson(`${devtoolsUrl}/json/list`);
    const target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl !== undefined);
    assert.ok(target, "Chromium must expose a debuggable page target");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let sequence = 0;
    const pending = new Map();
    const events = [];
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        const request = pending.get(response.id);
        if (request === undefined) {
            if (response.method === "Runtime.exceptionThrown" || response.method === "Runtime.consoleAPICalled") {
                events.push(response.params);
            }
            return;
        }
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
    return {send, events, close: () => socket.close()};
}

function playerSnapshotExpression() {
    return `(() => {
        const player = document.querySelector(${JSON.stringify(canonicalPlayerSelector)});
        if (!player) return undefined;
        const text = (selector) => [...player.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? "");
        const box = (node) => { if (!node) return undefined; const rect = node.getBoundingClientRect(); return {width: Math.round(rect.width), height: Math.round(rect.height)}; };
        const style = (node) => { if (!node) return undefined; const computed = getComputedStyle(node); return {display: computed.display, color: computed.color, backgroundColor: computed.backgroundColor, fontSize: computed.fontSize, fontWeight: computed.fontWeight, overflowX: computed.overflowX}; };
        const cells = [...player.querySelectorAll("[data-cell]")].map((cell) => ({
            id: cell.dataset.cell,
            symbol: cell.textContent?.trim() ?? "",
            color: getComputedStyle(cell).backgroundColor,
            box: box(cell),
        }));
        const controls = [...player.querySelectorAll("button")].map((button) => ({
            label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
            disabled: button.disabled,
            pressed: button.getAttribute("aria-pressed"),
            role: button.getAttribute("role") ?? "button",
        }));
        return {
            cells, wins: text(".player-wins-list button"), features: text(".player-features"),
            totals: text(".player-round-totals dd"), paytable: text(".player-paytable tr"), controls,
            hover: text(".player-highlight-button"),
            styles: {
                player: style(player), grid: style(player.querySelector(".player-grid")),
                controls: style(player.querySelector(".player-bet-options, .player-mode-options") ?? player),
            },
            layout: {
                player: box(player), grid: box(player.querySelector(".player-grid")),
                gridScroll: box(player.querySelector(".pokie-player-grid-scroll")),
                paytable: box(player.querySelector(".player-paytable")),
            },
            overflow: player.scrollWidth > player.clientWidth,
        };
    })()`;
}

function normalizedPlayerRegionExpression(width) {
    return `(() => {
        const player = document.querySelector(${JSON.stringify(canonicalPlayerSelector)});
        if (!player) return false;
        // Screenshot crops are intentionally normalized to a shared player viewport. This strips
        // unrelated AppShell/container width while preserving every rendered player child, responsive
        // breakpoint, semantic control and pixel within that viewport.
        player.style.boxSizing = "border-box";
        player.style.width = ${JSON.stringify(`${width}px`)};
        player.style.maxWidth = "none";
        return true;
    })()`;
}

function actualOverflowExpression() {
    return `(() => {
        const player = document.querySelector(${JSON.stringify(canonicalPlayerSelector)});
        if (!player) return undefined;
        return {
            player: player.scrollWidth > player.clientWidth,
            viewport: document.documentElement.scrollWidth > window.innerWidth,
        };
    })()`;
}

export async function runPlayerParityBrowser() {
    const project = process.env.PC_12_STUDIO_PROJECT;
    if (project === undefined || project.trim() === "") {
        throw new Error("PC_12_STUDIO_PROJECT must name the deterministic same-game fixture package.");
    }
    const supersedingProject = process.env.PC_12_SUPERSEDING_PROJECT;
    if (supersedingProject === undefined || supersedingProject.trim() === "") {
        throw new Error("PC_12_SUPERSEDING_PROJECT must name a different fixture package for the project-switch exercise.");
    }
    if (resolve(project) === resolve(supersedingProject)) {
        throw new Error("PC_12_SUPERSEDING_PROJECT must differ from PC_12_STUDIO_PROJECT.");
    }
    const examplesSourceRoot = resolve(process.env.POKIE_EXAMPLES_PATH ?? "../pokie-examples");
    const fixture = await validatePc12FixtureContract(project, supersedingProject, examplesSourceRoot);
    const evidence = resolve(process.env.PC_12_EVIDENCE_DIR ?? "docs/evidence/phase7-product-coherence/pc-12-player-parity/current-run");
    // The optional parent is useful to the focused executable regression: it can prove this
    // runner removes its own browser/consumer staging without retaining the test's evidence root.
    const profile = await mkdtemp(resolve(process.env.PC_12_TEMP_DIR ?? tmpdir(), "pokie-pc12-"));
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
    let exactConsumer;
    const transcript = [];
    const note = (message) => transcript.push(`[${new Date().toISOString()}] ${message}`);
    const captureChildOutput = (name, child) => {
        child.stdout?.on("data", (chunk) => note(`${name} stdout: ${String(chunk).trim()}`));
        child.stderr?.on("data", (chunk) => note(`${name} stderr: ${String(chunk).trim()}`));
        child.on("exit", (code, signal) => note(`${name} exited code=${code} signal=${signal}`));
    };
    let normalizedPlayerWidth = 600;

    try {
        await mkdir(evidence, {recursive: true});
        exactConsumer = await prepareExactCandidateConsumer(examplesSourceRoot, profile);
        note(`EXACT CANDIDATE export=${exactConsumer.resolvedExport}; archive=${exactConsumer.candidateArchive}`);
        studio = spawn(process.execPath, studioLaunchArguments(project, studioPort), {cwd: root, stdio: "pipe"});
        // Run the installed consumer's Vite entrypoint directly. This is the same public
        // development server used by its npm script, without inheriting a package-manager shell.
        examples = spawn(process.execPath, [resolve(exactConsumer.consumerRoot, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(examplesPort)], {cwd: exactConsumer.consumerRoot, stdio: "pipe"});
        captureChildOutput("Studio", studio);
        captureChildOutput("examples", examples);
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
            // A freshly attached about:blank target is already "complete". Wait for the new
            // document's URL first, otherwise the first examples interaction races the navigation.
            await waitFor(async () => (await evaluate("window.location.href")) === url, `navigation ${url}`);
            await waitFor(async () => (await evaluate("document.readyState")) === "complete", `page ${url}`);
        };
        const setViewport = async (viewport) => {
            await cdp.send("Emulation.setDeviceMetricsOverride", {...viewport, deviceScaleFactor: 1, mobile: viewport.width <= 480});
            const actual = await evaluate("({width: window.innerWidth, height: window.innerHeight})");
            assert.deepEqual(actual, viewport, `Browser must exercise the requested ${viewport.width}x${viewport.height} viewport`);
            note(`VIEWPORT requested=${viewport.width}x${viewport.height} actual=${actual.width}x${actual.height}`);
            return actual;
        };
        const pointFor = async (label, selector = "button,a,[role=button]") => evaluate(`(() => {
            const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) =>
                (item.textContent?.trim() === ${JSON.stringify(label)} || item.getAttribute("aria-label") === ${JSON.stringify(label)}) &&
                !item.disabled && item.getClientRects().length > 0,
            );
            if (!node) return;
            const rect = node.getBoundingClientRect();
            return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
        })()`);
        const click = async (label, selector) => {
            try {
                await waitFor(async () => (await pointFor(label, selector)) !== undefined, `visible control ${label}`, 15000);
            } catch (error) {
                const pageText = await evaluate("document.body.textContent?.trim() ?? ''");
                const pageHtml = await evaluate("document.documentElement.outerHTML.slice(0, 2000)");
                throw new Error(`${error.message}; page text: ${pageText}; page HTML: ${pageHtml}; browser events: ${JSON.stringify(cdp.events)}`);
            }
            const point = await pointFor(label, selector);
            if (point === undefined) throw new Error(`Visible control ${JSON.stringify(label)} was unavailable.`);
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            note(`CLICK ${label}`);
        };
        const fill = async (selector, value) => {
            await waitFor(
                async () => await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); return Boolean(input && input.getClientRects().length > 0); })()`),
                `visible field ${selector}`,
                15000,
            );
            const found = await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input || input.getClientRects().length === 0) return false; input.focus(); return true; })()`);
            if (!found) throw new Error(`Visible field ${JSON.stringify(selector)} was unavailable.`);
            await cdp.send("Input.insertText", {text: value});
            assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.value`), value, `Field ${selector} must receive its explicit fixture value`);
            note(`FILL ${selector}=${value}`);
        };
        const hover = async (label, selector) => {
            await waitFor(async () => (await pointFor(label, selector)) !== undefined, `visible hover control ${label}`);
            const point = await pointFor(label, selector);
            if (point === undefined) throw new Error(`Visible control ${JSON.stringify(label)} was unavailable for hover.`);
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x, y: point.y, button: "none", buttons: 0, pointerType: "mouse"});
            // Chromium's headless target can retain a prior page as its pointer target after a CDP
            // navigation. Preserve the real coordinate hover above, then replay the same browser DOM
            // hover event on the visible control so this regression always exercises the player
            // highlight rather than timing out on a DevTools focus quirk.
            await evaluate(`(() => {
                const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) =>
                    (item.textContent?.trim() === ${JSON.stringify(label)} || item.getAttribute("aria-label") === ${JSON.stringify(label)}) &&
                    !item.disabled && item.getClientRects().length > 0,
                );
                node?.dispatchEvent(new MouseEvent("mouseover", {bubbles: true, view: window}));
            })()`);
            note(`HOVER ${label}`);
        };
        const leave = async (label, selector) => {
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: 0, y: 0, button: "none", buttons: 0, pointerType: "mouse"});
            await evaluate(`(() => {
                const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) =>
                    (item.textContent?.trim() === ${JSON.stringify(label)} || item.getAttribute("aria-label") === ${JSON.stringify(label)}),
                );
                node?.dispatchEvent(new MouseEvent("mouseout", {bubbles: true, view: window}));
            })()`);
        };
        const capture = async (name) => {
            const player = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(canonicalPlayerSelector)}); if (!node) return; const rect = node.getBoundingClientRect(); return {x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: window.devicePixelRatio}; })()`);
            assert.ok(player, "canonical player region must be visible before capture");
            const image = await cdp.send("Page.captureScreenshot", {format: "png", clip: player});
            const bytes = Buffer.from(image.data, "base64");
            await writeFile(resolve(evidence, `${name}.png`), bytes);
            const viewport = await evaluate("({width: window.innerWidth, height: window.innerHeight})");
            return {bytes, checksum: checksum(bytes), viewport};
        };
        const settleAndCapture = async (name) => {
            await waitFor(async () => (await evaluate(playerSnapshotExpression())) !== undefined, `${name} player`);
            const actualOverflow = await evaluate(actualOverflowExpression());
            assert.deepEqual(actualOverflow, {player: false, viewport: false}, `${name} must fit its actual host viewport before normalization`);
            assert.equal(await evaluate(normalizedPlayerRegionExpression(normalizedPlayerWidth)), true, `${name} player must normalize for host-neutral capture`);
            const snapshot = await evaluate(playerSnapshotExpression());
            const screenshot = await capture(name);
            return {snapshot, ...screenshot};
        };
        const assertPlayerInteraction = async (name, {featureLabel, featureMenuLabel} = {}) => {
            const beforeHover = await evaluate(playerSnapshotExpression());
            assert.ok(beforeHover.cells.length > 0, `${name} must render real reel cells`);
            assert.ok(beforeHover.wins.length > 0, `${name} must render a deterministic winning round`);
            assert.ok(beforeHover.controls.some((control) => control.label.startsWith("Select bet ")), `${name} must expose selectable bets`);
            const highlight = beforeHover.hover[0];
            assert.ok(highlight, `${name} must expose a win/line hover control`);
            await hover(highlight, `${canonicalPlayerSelector} .player-highlight-button`);
            await waitFor(async () => JSON.stringify((await evaluate(playerSnapshotExpression())).cells) !== JSON.stringify(beforeHover.cells), `${name} hover highlight`);
            await leave(highlight, `${canonicalPlayerSelector} .player-highlight-button`);
            await waitFor(async () => JSON.stringify((await evaluate(playerSnapshotExpression())).cells) === JSON.stringify(beforeHover.cells), `${name} hover restoration`);
            const selectableBet = beforeHover.controls.find((control) => control.label.startsWith("Select bet ") && !control.disabled);
            assert.ok(selectableBet, `${name} must have an enabled alternate bet`);
            await click(selectableBet.label, `${canonicalPlayerSelector} button`);
            await waitFor(async () => (await evaluate(playerSnapshotExpression())).controls.some((control) => control.label === selectableBet.label && control.disabled), `${name} bet selection`);
            const afterBet = await evaluate(playerSnapshotExpression());
            const selectableMode = afterBet.controls.find((control) => control.label.startsWith("Select mode ") && !control.disabled);
            if (selectableMode !== undefined) {
                await click(selectableMode.label, `${canonicalPlayerSelector} button`);
                await waitFor(async () => (await evaluate(playerSnapshotExpression())).controls.some((control) => control.label === selectableMode.label && control.disabled), `${name} mode selection`);
            }
            if (featureLabel !== undefined) {
                if (featureMenuLabel !== undefined) {
                    await click(featureMenuLabel);
                }
                await click(featureLabel);
                await waitFor(async () => await evaluate(`Boolean(document.querySelector(${JSON.stringify(canonicalPlayerSelector)} + " .player-features:not([hidden]) dd"))`), `${name} feature state`);
            }
        };
        const assertStudioInspectorAndRecovery = async () => {
            const closed = await evaluate(`(() => { const details = [...document.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent?.trim() === "Inspect round artifact"); return details ? {open: details.open, inspector: Boolean(details.querySelector("[data-round-artifact-inspector]"))} : undefined; })()`);
            assert.deepEqual(closed, {open: false, inspector: false}, "Studio must keep the artifact inspector closed until requested");
            await click("Inspect round artifact", "summary");
            await waitFor(async () => await evaluate(`Boolean([...document.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent?.trim() === "Inspect round artifact" && item.open))`), "Studio inspector disclosure");
            assert.equal(await evaluate(`document.body.textContent?.includes("Round detail")`), true, "Studio must mount inspector content only after disclosure");
            const settled = await evaluate(playerSnapshotExpression());
            // A transport failure is induced at the public Studio API boundary.  The user still uses
            // the real Spin control; this isolates recovery/preservation from game randomness.
            await evaluate(`(() => { const original = window.fetch; window.__pc12RestoreFetch = () => { window.fetch = original; }; window.fetch = (input, init) => String(input).includes("/spin") ? Promise.reject(new Error("Failed to fetch (PC-12 retryable transport failure)")) : original(input, init); })()`);
            await click("Spin");
            await waitFor(async () => Boolean(await evaluate(`document.body.textContent?.includes("This spin couldn't reach the Studio server.")`)), "Studio visible failure");
            assert.deepEqual(await evaluate(playerSnapshotExpression()), settled, "Studio failure must preserve the settled player result");
            await evaluate("window.__pc12RestoreFetch?.()");
            await click("Spin");
            await waitFor(async () => (await evaluate(playerSnapshotExpression())) !== undefined, "Studio retry result");
            // Make the replacement assertion against a known featured result. Reset deliberately
            // leaves the canonical player mounted for the freshly prepared *pre-spin* session.
            await playStudioToFeature("Studio featured round before reset");
            await waitFor(async () => {
                const snapshot = await evaluate(playerSnapshotExpression());
                return snapshot?.features.length > 0 && snapshot.wins.length > 0;
            }, "Studio featured round before reset");
            const featured = await evaluate(playerSnapshotExpression());
            await click("Reset Play session");
            await waitFor(async () => {
                const snapshot = await evaluate(playerSnapshotExpression());
                return snapshot !== undefined && snapshot.wins.length === 0 && snapshot.features.length === 0;
            }, "Studio replacement pre-spin player");
            const replacement = await evaluate(playerSnapshotExpression());
            assert.notDeepEqual(replacement, featured, "Reset must replace the old winning/featured player rather than retaining it");
            assert.equal(replacement.wins.length, 0, "Reset pre-spin player must not retain winning details");
            assert.equal(replacement.features.length, 0, "Reset pre-spin player must not retain feature details");
        };
        const assertStudioPreparationProjectSwitch = async () => {
            // The real Studio browser route calls the public Home open-project surface. Start a real
            // reset preparation, keep its response pending at the client boundary, then switch to a
            // distinct project. This is deliberately not a synthetic request-id mutation.
            await evaluate(`(() => {
                const original = window.fetch;
                window.__pc12PreparationStarted = false;
                window.__pc12DelayedPreparationRequestCount = 0;
                window.__pc12RestorePreparationFetch = () => { window.fetch = original; };
                window.fetch = (input, init) => {
                    const requestUrl = input instanceof Request ? input.url : String(input);
                    const requestMethod = init?.method ?? (input instanceof Request ? input.method : "GET");
                    const isPreparation = new URL(requestUrl, window.location.href).pathname === "/api/project/play/session" && requestMethod.toUpperCase() === "POST";
                    // Delay exactly the original reset preparation.  The replacement project's
                    // public New Play session uses this same endpoint and must be allowed through.
                    if (isPreparation && window.__pc12DelayedPreparationRequestCount === 0) {
                        window.__pc12PreparationStarted = true;
                        window.__pc12DelayedPreparationRequestCount += 1;
                        return original(input, init).then(async (response) => {
                            const payload = await response.clone().json();
                            window.__pc12PreparedSessionId = payload.session?.sessionId;
                            return new Promise(() => undefined);
                        });
                    }
                    return original(input, init);
                };
            })()`);
            await click("Reset Play session");
            await waitFor(async () => await evaluate("window.__pc12PreparationStarted === true"), "Studio pending reset preparation request");
            await waitFor(async () => await evaluate("typeof window.__pc12PreparedSessionId === 'string'"), "prepared Studio session identity");
            const preparedSessionId = await evaluate("window.__pc12PreparedSessionId");
            await navigate(`${studioUrl}/#/project/${encodeURIComponent(resolve(supersedingProject))}/play`);
            await waitFor(async () => {
                const context = await fetch(`${studioUrl}/api/context`).then((response) => response.json());
                return context.mode === "project" && context.projectRoot === resolve(supersedingProject);
            }, "Studio project switch");
            await click("New Play session");
            await waitFor(async () => await evaluate(`Boolean(document.querySelector(${JSON.stringify(canonicalPlayerSelector)}))`), "superseding project's pre-spin player");
            const switched = await evaluate(playerSnapshotExpression());
            assert.equal(switched.wins.length, 0, "A superseding project must not publish the old session round");
            assert.equal(switched.features.length, 0, "A superseding project must not publish the old feature result");
            assert.equal(await evaluate("window.__pc12DelayedPreparationRequestCount"), 1, "Only the original pending preparation request may be delayed");
            const staleSession = await fetch(`${studioUrl}/api/project/play/sessions/${encodeURIComponent(preparedSessionId)}/spin`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: "{}",
            });
            assert.equal(staleSession.status, 404, "A superseding project must not retain the old prepared session");
            const rounds = await fetch(`${studioUrl}/api/project/rounds`).then(async (response) => ({status: response.status, body: await response.json()}));
            assert.equal(rounds.status, 200, "The switched project must expose its recorder through the public Studio API");
            assert.deepEqual(rounds.body, [], "A superseding project must expose no stale recorder-visible round");
            await evaluate("window.__pc12RestorePreparationFetch?.()");
            // Return through the same browser entry point so the rest of the parity workflow still uses
            // the original deterministic fixture project.
            await navigate(`${studioUrl}/#/project/${encodeURIComponent(resolve(project))}/play`);
            await waitFor(async () => {
                const context = await fetch(`${studioUrl}/api/context`).then((response) => response.json());
                return context.mode === "project" && context.projectRoot === resolve(project);
            }, "return to deterministic fixture project");
        };

        const startSeededStudioSession = async (label = "New Play session") => {
            // The checked fixture package defaults absent Studio seed input to the shared featured
            // seed. This tests the public session action while avoiding a host-control-specific path
            // that is irrelevant to player parity; validatePc12FixtureContract already asserts that
            // exact default on the package entrypoint.
            await click(label);
        };
        const playExamplesToFeature = async (name) => {
            // This fixture's seed reaches its first free-games trigger on the eighth real spin.
            // Drive the public Play control instead of relying on a scenario implementation that
            // would otherwise be a second route to the result being compared.
            for (let spin = 0; spin < 8; spin++) {
                await click("Play");
            }
            await waitFor(async () => {
                const snapshot = await evaluate(playerSnapshotExpression());
                return snapshot?.features.length > 0 && snapshot.wins.length > 0;
            }, name);
        };
        const playStudioToFeature = async (name) => {
            for (let spin = 0; spin < 8; spin++) {
                await click("Spin");
            }
            await waitFor(async () => await evaluate(`Boolean(document.querySelector(${JSON.stringify(canonicalPlayerSelector)} + " .player-features:not([hidden]) dd"))`), name);
        };

        await setViewport(desktopViewport);
        note(`fixture id=${fixture.fixtureId}; project=${fixture.project}; examples fixture=${examplesUrl}; seed=${fixture.seed}; round=find-free-games`);
        await navigate(examplesUrl);
        await click("Win");
        await waitFor(async () => (await evaluate(playerSnapshotExpression()))?.wins.length > 0, "examples winning round");
        // A free-games round includes the real scatter cells that triggered the feature, so it
        // exercises both the normal win and the observable hover/highlight path.
        await navigate(examplesUrl);
        await click("Scenarios");
        assert.equal(await evaluate('document.querySelector("#scenariosButton")?.getAttribute("aria-expanded")'), "true", "examples scenario control must disclose its choices");
        await click("Scenarios");
        await playExamplesToFeature("examples deterministic featured round");
        await assertPlayerInteraction("examples");
        // Selection callbacks return the session's current pre-spin view. Reload so the comparable
        // screenshot returns to the same seeded featured result after exercising those controls.
        await navigate(examplesUrl);
        await playExamplesToFeature("examples featured round after controls");
        const exampleDesktop = await settleAndCapture("examples-desktop");

        await navigate(`${studioUrl}/#/project/play`);
        await startSeededStudioSession();
        await click("Find any win");
        await waitFor(async () => (await evaluate(playerSnapshotExpression()))?.wins.length > 0, "Studio winning round");
        await click("Reset Play session");
        await waitFor(async () => (await evaluate(playerSnapshotExpression()))?.wins.length === 0, "Studio deterministic replacement session");
        await playStudioToFeature("Studio feature state");
        await assertPlayerInteraction("Studio");
        await assertStudioInspectorAndRecovery();
        await assertStudioPreparationProjectSwitch();
        await startSeededStudioSession();
        // Project switching gives us a pre-spin player, so obtain the deterministic featured result again
        // before capturing the comparable canonical region.
        await playStudioToFeature("Studio desktop featured round");
        const studioDesktop = await settleAndCapture("studio-desktop");
        comparePlayerRegions(studioDesktop.snapshot, exampleDesktop.snapshot);
        const desktopVisual = comparePlayerScreenshots(studioDesktop.bytes, exampleDesktop.bytes);
        note(`COMPARE desktop screenshot changed=${desktopVisual.changedRatio.toFixed(4)} mean=${desktopVisual.meanDifference.toFixed(2)}`);

        await setViewport(narrowViewport);
        normalizedPlayerWidth = 320;
        await navigate(examplesUrl);
        await playExamplesToFeature("examples narrow deterministic featured round");
        const exampleMobile = await settleAndCapture("examples-mobile");
        await navigate(`${studioUrl}/#/project/play`);
        await startSeededStudioSession();
        await playStudioToFeature("Studio narrow featured round");
        const studioMobile = await settleAndCapture("studio-mobile");
        for (const [name, result] of [["examples-mobile", exampleMobile], ["studio-mobile", studioMobile]]) {
            if (result.snapshot.overflow) throw new Error(`${name} player overflows its viewport.`);
        }
        comparePlayerRegions(studioMobile.snapshot, exampleMobile.snapshot);
        const mobileVisual = comparePlayerScreenshots(studioMobile.bytes, exampleMobile.bytes);
        note(`COMPARE narrow screenshot changed=${mobileVisual.changedRatio.toFixed(4)} mean=${mobileVisual.meanDifference.toFixed(2)}`);
        await cdp.send("Emulation.clearDeviceMetricsOverride");
        await writeFile(resolve(evidence, "parity.json"), `${JSON.stringify({
            fixture: {id: fixture.fixtureId, project: fixture.project, seed: fixture.seed, round: "winning featured round", exactConsumer: exactConsumer.resolvedExport}, browser: {desktop: studioDesktop.viewport, narrow: studioMobile.viewport},
            comparison: {dom: "passed", computedStyle: "passed", layout: "passed", overflow: "passed", screenshot: {desktop: desktopVisual, narrow: mobileVisual}},
            screenshots: {
                studioDesktop: studioDesktop.checksum, examplesDesktop: exampleDesktop.checksum,
                studioMobile: studioMobile.checksum, examplesMobile: exampleMobile.checksum,
            },
        }, null, 2)}\n`);
        note("PASS canonical player DOM, semantics, computed styles, layout, screenshots and viewport overflow matched at both viewports.");
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
    const execute = process.argv.includes("--fixture-preflight")
        ? async () => {
            const project = process.env.PC_12_STUDIO_PROJECT;
            const supersedingProject = process.env.PC_12_SUPERSEDING_PROJECT;
            if (!project || !supersedingProject) throw new Error("PC_12_STUDIO_PROJECT and PC_12_SUPERSEDING_PROJECT must name the deterministic fixture roots.");
            const fixture = await validatePc12FixtureContract(project, supersedingProject, resolve(process.env.POKIE_EXAMPLES_PATH ?? "../pokie-examples"));
            process.stdout.write(`${JSON.stringify({status: "ok", fixture})}\n`);
        }
        : runPlayerParityBrowser;
    execute().catch((error) => {
        process.stderr.write(`${error.stack ?? error}\n`);
        process.exitCode = 1;
    });
}

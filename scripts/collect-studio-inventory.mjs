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
import {execFile, spawn} from "node:child_process";
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
const runId = option("--run-id", "clean-profile");
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

function commandOutput(command, arguments_) {
    return new Promise((accept) => {
        execFile(command, arguments_, {cwd: repository}, (error, stdout) => accept(error ? undefined : stdout.trim()));
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

function ownerForGoal(goal) {
    if (/^Creator|^Blank Blueprint/.test(goal)) return "P8-04";
    if (/narrow viewport/.test(goal)) return "P8-03";
    if (/^Project tab:|^Created project overview|Build\/Export/.test(goal)) return "P8-05";
    return "P8-02";
}

function validateInventory(record, complete = false) {
    const owners = new Set(["P8-02", "P8-03", "P8-04", "P8-05", "P8-06", "P8-07"]);
    if (record.schemaVersion !== 2 || !/^[0-9a-f]{40}$/.test(record.provenance.candidateSha ?? "")) {
        throw new Error("Inventory provenance does not satisfy schema version 2.");
    }
    if (record.screens.some((screen) => !owners.has(screen.owner) || screen.statesObserved === undefined || screen.focusOrder === undefined)) {
        throw new Error("Every recorded surface needs an owner, state coverage, and keyboard-focus record.");
    }
    if (!complete) return;
    if (record.actions.some((action) => !owners.has(action.owner) || typeof action.latencyMs !== "number" || action.visibleResultAt === undefined)) {
        throw new Error("Every recorded action needs an owner, action-to-result latency, and visible-result timestamp.");
    }
    if (record.findings.some((finding) => !owners.has(finding.owner) || finding.status !== "unreached" || finding.observedBy === undefined)) {
        throw new Error("Every unobserved public capability needs an owned finding.");
    }
    if (record.claimCoverage.some((claim) => !owners.has(claim.owner) || (claim.status === "finding" && !record.findings.some((finding) => finding.id === claim.findingId)))) {
        throw new Error("Every public documentation claim needs either an observation or an owned finding.");
    }
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
    const actions = [];
    const findings = [];
    const candidateSha = await commandOutput("git", ["rev-parse", "HEAD"]);
    const browserVersion = await commandOutput("chromium", ["--version"]);
    const startedAt = new Date().toISOString();
    const publicDocumentationClaims = JSON.parse(await readFile(join(repository, "docs/evidence/p8-01-studio-inventory/public-documentation-claims.json"), "utf8"));
    const inventory = () => ({
        schemaVersion: 2,
        collector: "scripts/collect-studio-inventory.mjs",
        provenance: {
            runId,
            candidateSha,
            command: `node scripts/collect-studio-inventory.mjs --output ${output} --run-id ${runId}`,
            startedAt,
            profile: "fresh temporary Chromium profile",
            studioConfig: "fresh temporary Studio config",
            entrypoint: `http://127.0.0.1:${PORT}/`,
            method: "visible controls, browser input, rendered text and browser focus only",
            browser: browserVersion ?? "Chromium version unavailable",
            environment: {platform: process.platform, architecture: process.arch, node: process.version, headless: true},
            viewports: [{name: "desktop", width: 1280, height: 900}, {name: "narrow", width: 405, height: 800}],
            rerun: "This run used a separately-created temporary browser profile and Studio config. Compare independent runs by rendered goal and visible outcome, not implementation route.",
        },
        observedAt: new Date().toISOString(),
        browserErrors: {console: consoleErrors, network: networkErrors},
        publicDocumentationClaims,
        claimCoverage: publicDocumentationClaims.claims.map((claim) => {
            const findingByClaim = {"DOC-03": "P8-01-F-IMPORT-OPEN-ALTERNATIVE", "DOC-05": "P8-01-F-CONDITIONAL-CAPABILITIES", "DOC-07": "P8-01-F-SIMULATION-TERMINALS"};
            const observedGoals = claim.renderedGoals.filter((goal) => screens.some((screen) => screen.goal === goal));
            const findingId = findingByClaim[claim.id];
            return {id: claim.id, owner: claim.owner, observedGoals, status: findingId === undefined ? "observed" : "finding", findingId};
        }),
        actions,
        findings,
        screens,
    });
    const writeInventory = async (complete = false) => {
        const record = inventory();
        validateInventory(record, complete);
        await writeFile(join(output, "inventory.json"), `${JSON.stringify(record, null, 2)}\n`);
    };
    try {
        await mkdir(output, {recursive: true});
        await mkdir(workspace, {recursive: true});
        note(`RUN id=${runId} candidateSha=${candidateSha ?? "unavailable"} browser=${browserVersion ?? "unavailable"} environment=${process.platform}/${process.arch} node=${process.version}`);
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
        const snapshot = async (goal, operation) => {
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
                    statesObserved: {
                        loading: /loading|resolving|detecting|opening|building|running/i.test(document.body.innerText),
                        empty: /no .*yet|no .*available|empty/i.test(document.body.innerText),
                        warning: /warning|before|prerequisite|unavailable/i.test(document.body.innerText),
                        error: /error|failed|invalid|could not|isn't available/i.test(document.body.innerText),
                        disabled: [...document.querySelectorAll("button,input,select,textarea")].some((element) => element.disabled || element.getAttribute("aria-disabled") === "true"),
                        dialog: [...document.querySelectorAll("[role=dialog]")].some(visible),
                    },
                };
            })()`);
            const focus = [];
            for (let index = 0; index < MAX_FOCUS; index += 1) {
                await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
                await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
                focus.push(await evaluate(`(() => { const element = document.activeElement; return element ? {tag:element.tagName.toLowerCase(), label:(element.getAttribute("aria-label") ?? element.innerText ?? element.value ?? "").trim().replace(/\\s+/g, " ").slice(0, 160)} : null; })()`));
            }
            note(`OBSERVE goal=${JSON.stringify(goal)} action=${JSON.stringify(operation?.action ?? "initial render")} visibleResult=${JSON.stringify((view.alerts[0] ?? view.text.slice(0, 160)).replace(/\s+/g, " "))} operationLatencyMs=${operation?.latencyMs ?? 0} controls=${view.controls.length} alerts=${view.alerts.length}`);
            screens.push({goal, owner: ownerForGoal(goal), operation: operation ?? {action: "initial render", latencyMs: 0}, ...view, focusOrder: focus});
            await writeInventory();
        };
        const click = async (label) => {
            const started = Date.now();
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
            return {action: `click ${label}`, started, latencyMs: Date.now() - started};
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
            const started = Date.now();
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
            return {action: `keyboard activation ${label}`, started, latencyMs: Date.now() - started};
        };
        const observeAction = async (goal, operation, result) => {
            await waitFor(result, `${operation.action} visible result`);
            operation.latencyMs = Date.now() - operation.started;
            actions.push({...operation, owner: ownerForGoal(goal), visibleResultAt: new Date().toISOString(), consoleErrors: [...consoleErrors], networkErrors: [...networkErrors]});
            await snapshot(goal, operation);
        };
        const fill = async (label, value) => {
            const started = Date.now();
            const point = await evaluate(`(() => {
                const wanted = ${JSON.stringify(label)};
                const input = [...document.querySelectorAll("input,textarea")].find((candidate) => candidate.getClientRects().length > 0 && (candidate.labels?.[0]?.innerText ?? candidate.getAttribute("aria-label") ?? "").includes(wanted));
                if (!input) return null;
                const rect = input.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
            })()`);
            if (!point) throw new Error(`Rendered input not found: ${label}`);
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            await cdp.send("Input.insertText", {text: value});
            note(`ACT rendered-input=${JSON.stringify(label)}`);
            return {action: `enter ${label}`, started, latencyMs: Date.now() - started};
        };
        const recordFinding = (id, surface, owner, reason) => {
            findings.push({id, surface, owner, status: "unreached", observedBy: runId, reason, consoleErrors: [...consoleErrors], networkErrors: [...networkErrors]});
            note(`FINDING id=${id} owner=${owner} reason=${JSON.stringify(reason)}`);
        };
        await setViewport(1280, 900, "desktop");
        await cdp.send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
        await waitFor(() => evaluate("document.body.innerText.includes('Design Your Game')"), "Home Design Game");
        await snapshot("First-time creator arrives at Studio");
        await observeAction("First-time Projects registry empty state", await click("Projects"), () => evaluate("document.body.innerText.includes('Import Project')"));
        await observeAction("First-time creator returns to Design Game", await click("Design Game"), () => evaluate("document.body.innerText.includes('Design Your Game')"));
        await setViewport(405, 800, "narrow");
        await snapshot("First-time creator arrives at Studio on a narrow viewport");
        await setViewport(1280, 900, "desktop");
        let operation = await activate("New Blueprint");
        await waitFor(async () => {
            if (await renderedActionExists("Recommended")) return true;
            return renderedActionExists("Discard");
        }, "New Blueprint dialog");
        if (await renderedActionExists("Discard")) {
            await observeAction("Creator is warned before discarding the initial draft", operation, () => renderedActionExists("Discard"));
            operation = await activate("Discard");
            await waitFor(() => renderedActionExists("Recommended"), "New Blueprint choices after discard");
        }
        await observeAction("Creator chooses a new Blueprint", operation, () => renderedActionExists("Recommended"));
        operation = await click("Blank");
        await observeAction("Blank Blueprint validation state", operation, () => evaluate("document.body.innerText.includes('Create Project')"));
        operation = await click("Create Project");
        await observeAction("Blank Blueprint rejected before project creation", operation, () => evaluate("document.body.innerText.includes('Create Project')"));
        operation = await activate("New Blueprint");
        await waitFor(async () => {
            if (await renderedActionExists("Recommended")) return true;
            return renderedActionExists("Discard");
        }, "New Blueprint dialog after validation failure");
        if (await renderedActionExists("Discard")) {
            operation = await activate("Discard");
            await waitFor(() => renderedActionExists("Recommended"), "New Blueprint choices after second discard");
        }
        operation = await click("Recommended");
        await observeAction("Creator configures the recommended Blueprint", operation, () => evaluate("document.body.innerText.includes('Create Project')"));
        operation = await click("Create Project");
        await observeAction("Created project overview", operation, () => evaluate("document.body.innerText.includes('Close project')"));
        const tabs = await evaluate("[...document.querySelectorAll('nav[aria-label=Sections] button')].filter((item) => item.getClientRects().length > 0).map((item) => item.innerText.trim())");
        for (const tab of tabs) {
            operation = await click(tab);
            await observeAction(`Project tab: ${tab}`, operation, () => evaluate(`document.body.innerText.includes(${JSON.stringify(tab)})`));
        }
        await setViewport(405, 800, "narrow");
        await snapshot("Build/Export on a narrow viewport");
        await setViewport(1280, 900, "desktop");
        operation = await click("Close project");
        await wait(500);
        if (await renderedActionExists("Confirm")) {
            await observeAction("Creator is warned before closing an active project", operation, () => renderedActionExists("Confirm"));
            operation = await click("Confirm");
        }
        await observeAction("Home after closing a project", operation, () => evaluate("document.body.innerText.includes('Design Your Game')"));
        operation = await click("Projects");
        await observeAction("Projects registry after creating a project", operation, () => evaluate("document.body.innerText.includes('Starter Slot')"));
        recordFinding("P8-01-F-IMPORT-NATIVE-PICKER", "Import Project host native picker", "P8-02", "The browser collector can observe Browse controls but a headless clean-profile run cannot select a host-native file-picker result.");
        recordFinding("P8-01-F-IMPORT-OPEN-ALTERNATIVE", "Import Project Detect/Register/Open alternatives", "P8-02", "The clean run created a managed project; importing a separate public artifact requires a user-provided filesystem location and is not fabricated by this collector.");
        recordFinding("P8-01-F-REOPEN-PERSISTENCE", "Reopen Studio and persisted project/artifact state", "P8-02", "This bounded run proves the in-session registry after creation, but does not restart Studio because that would turn the independent clean-profile run into a seeded profile.");
        recordFinding("P8-01-F-TRANSIENT-LOADING", "Transient loading state capture", "P8-06", "Fast local responses did not leave a rendered loading state long enough for a browser observation; no loading state is claimed as covered.");
        recordFinding("P8-01-F-CONDITIONAL-CAPABILITIES", "Certification and Provably Fair capability-gated tabs", "P8-05", "The created Blueprint did not expose runtime/outcome-library capabilities, so the public conditional tabs were not observed.");
        recordFinding("P8-01-F-SIMULATION-TERMINALS", "Cancelled and failed simulation outcomes", "P8-05", "No public failure or cancellation trigger was available from the clean Blueprint run; no terminal state is claimed as covered.");
        recordFinding("P8-01-F-REPLAY-ARTIFACT-TERMINALS", "Replay and artifact success/error/recovery outcomes", "P8-05", "The clean Blueprint run exposed empty action surfaces only; no result or failure is claimed as covered.");
        note(`COMPLETE screens=${screens.length} consoleErrors=${consoleErrors.length} networkErrors=${networkErrors.length}`);
        await writeInventory(true);
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

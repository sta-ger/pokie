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
import {fileURLToPath} from "node:url";
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

export function ownerForGoal(goal) {
    if (/^Creator|^Blank Blueprint|^Game Model|^Load existing Blueprint/.test(goal)) return "P8-04";
    if (/narrow viewport|returns to Design Game/.test(goal)) return "P8-03";
    if (/^Project tab:|^Created project overview|^Build\/Export|^Play session|^Simulation |^Replay |^Project overview/.test(goal)) return "P8-05";
    return "P8-02";
}

export const REQUIRED_ACTION_COVERAGE = [
    {id: "managed-project-open-conflict", owner: "P8-02"},
    {id: "managed-project-open-stay", owner: "P8-02"},
    {id: "managed-project-open", owner: "P8-02"},
    {id: "managed-project-remove-confirm", owner: "P8-02"},
    {id: "managed-project-remove-cancel", owner: "P8-02"},
    {id: "simulation-run", owner: "P8-05"},
    {id: "replay-load", owner: "P8-05"},
    {id: "build-generate-outcome-library", owner: "P8-05"},
    {id: "stake-engine-export", owner: "P8-05"},
    {id: "build-typescript-game-package", owner: "P8-05"},
    {id: "build-outcome-library", owner: "P8-05"},
    {id: "build-stake-engine-export", owner: "P8-05"},
    {id: "build-par-sheet", owner: "P8-05"},
];

export function claimCoverageFor(claims, screens, findings) {
    return claims.map((claim) => {
        const observedGoals = claim.renderedGoals.filter((goal) => screens.some((screen) => screen.goal === goal));
        const finding = findings.find((entry) => entry.documentationClaimId === claim.id);
        const fullyObserved = observedGoals.length === claim.renderedGoals.length;
        return {
            id: claim.id,
            owner: claim.owner,
            observedGoals,
            status: fullyObserved && !finding ? "observed" : "finding",
            ...(fullyObserved && !finding ? {} : {findingId: finding?.id}),
        };
    });
}

export function validateFindingAssignments(findings, ownershipLedger) {
    const assignments = ownershipLedger?.findingAssignments;
    if (!Array.isArray(assignments) || findings.some((finding) => {
        const matchingAssignments = assignments.filter((assignment) => assignment.id === finding.id);
        return matchingAssignments.length !== 1 || matchingAssignments[0].owner !== finding.owner;
    })) {
        throw new Error("Every inventory finding needs one exact ownership-ledger assignment.");
    }
}

export function validateInventory(record, complete = false, ownershipLedger) {
    const owners = new Set(["P8-02", "P8-03", "P8-04", "P8-05", "P8-06", "P8-07"]);
    if (record.schemaVersion !== 3 || !/^[0-9a-f]{40}$/.test(record.provenance.candidateSha ?? "")) {
        throw new Error("Inventory provenance does not satisfy schema version 3.");
    }
    if (record.screens.some((screen) => !owners.has(screen.owner) || screen.statesObserved === undefined || screen.focusOrder === undefined)) {
        throw new Error("Every recorded surface needs an owner, state coverage, and keyboard-focus record.");
    }
    if (!complete) return;
    if (record.actions.some((action) => !owners.has(action.owner) || action.owner !== ownerForGoal(action.goal) || typeof action.latencyMs !== "number" || action.visibleResultAt === undefined || action.resultWasFalseBeforeInput !== true || action.visibleResult === undefined)) {
        throw new Error("Every recorded action needs an owner, a false-to-true visible result transition, and result timestamp.");
    }
    if (record.findings.some((finding) => !owners.has(finding.owner) || finding.status !== "unreached" || finding.observedBy === undefined)) {
        throw new Error("Every unobserved public capability needs an owned finding.");
    }
    if (ownershipLedger !== undefined) validateFindingAssignments(record.findings, ownershipLedger);
    if (REQUIRED_ACTION_COVERAGE.some((required) => {
        const actionCount = record.actions.filter((action) => action.coverageId === required.id && action.owner === required.owner).length;
        const findingCount = record.findings.filter((finding) => finding.coverageId === required.id && finding.owner === required.owner).length;
        return actionCount + findingCount !== 1;
    })) {
        throw new Error("Each required action needs exactly one browser-input result or scoped boundary finding.");
    }
    if (record.claimCoverage.some((claim) => {
        const declared = record.publicDocumentationClaims.claims.find((entry) => entry.id === claim.id);
        return !declared
            || !owners.has(claim.owner)
            || claim.owner !== declared.owner
            || (claim.status === "observed" && claim.observedGoals.length !== declared.renderedGoals.length)
            || (claim.status === "observed" && record.findings.some((finding) => finding.documentationClaimId === claim.id))
            || (claim.status === "finding" && !record.findings.some((finding) => finding.id === claim.findingId && finding.owner === claim.owner && finding.documentationClaimId === claim.id));
    })) {
        throw new Error("Every public documentation claim needs either an observation or an owned finding.");
    }
    if (REQUIRED_ACTION_COVERAGE.some((required) => !record.actions.some((action) => action.coverageId === required.id && action.owner === required.owner) && !record.findings.some((finding) => finding.coverageId === required.id && finding.owner === required.owner))) {
        throw new Error("Every safely reachable primary action needs its own browser-input record.");
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
    const ownershipLedger = JSON.parse(await readFile(join(repository, "docs/evidence/p8-01-studio-inventory/surface-owners.json"), "utf8"));
    const inventory = () => ({
        schemaVersion: 3,
        collector: "scripts/collect-studio-inventory.mjs",
        provenance: {
            runId,
            candidateSha,
            command: `node scripts/collect-studio-inventory.mjs --output ${output} --run-id ${runId}`,
            startedAt,
            profile: "fresh temporary Chromium profile",
            studioConfig: "fresh temporary Studio config",
            entrypoint: `http://127.0.0.1:${PORT}/`,
            method: "visible controls, CDP browser mouse/keyboard input, rendered state transitions and browser focus only",
            browser: browserVersion ?? "Chromium version unavailable",
            environment: {platform: process.platform, architecture: process.arch, node: process.version, headless: true},
            viewports: [{name: "desktop", width: 1280, height: 900}, {name: "narrow", width: 405, height: 800}],
            rerun: "This run used a separately-created temporary browser profile and Studio config. Compare independent runs by rendered goal and visible outcome, not implementation route.",
        },
        observedAt: new Date().toISOString(),
        browserErrors: {console: consoleErrors, network: networkErrors},
        publicDocumentationClaims,
        claimCoverage: claimCoverageFor(publicDocumentationClaims.claims, screens, findings),
        actions,
        findings,
        screens,
    });
    const writeInventory = async (complete = false) => {
        const record = inventory();
        validateInventory(record, complete, ownershipLedger);
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
        const activeControl = () => evaluate(`(() => {
            const element = document.activeElement;
            return element ? {tag: element.tagName.toLowerCase(), label: (element.getAttribute("aria-label") ?? element.innerText ?? element.value ?? "").trim().replace(/\\s+/g, " ").slice(0, 160)} : null;
        })()`);
        const dispatchKey = async (key, code, windowsVirtualKeyCode) => {
            await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode});
            await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode});
        };
        const requireFalse = async (result, action) => {
            if (await result()) throw new Error(`${action} result was already visible before browser input.`);
        };
        const click = async (label, result, cardLabel) => {
            await requireFalse(result, `click ${label}`);
            const point = await evaluate(`(() => {
                const wanted = ${JSON.stringify(label)};
                const cardLabel = ${JSON.stringify(cardLabel)};
                const visible = (element) => element.getClientRects().length > 0 && !element.disabled && element.getAttribute("aria-disabled") !== "true";
                const controls = [...document.querySelectorAll("button,a,[role=tab]")].filter((candidate) => visible(candidate) && (candidate.innerText ?? candidate.textContent ?? "").trim() === wanted);
                const element = cardLabel === undefined ? controls[0] : controls.find((candidate) => {
                    for (let container = candidate.parentElement; container && container !== document.body; container = container.parentElement) {
                        const matchingControls = [...container.querySelectorAll("button,a,[role=tab]")].filter((item) => visible(item) && (item.innerText ?? item.textContent ?? "").trim() === wanted);
                        if (matchingControls.length === 1 && container.innerText.includes(cardLabel)) return true;
                    }
                    return false;
                });
                if (!element) return null;
                element.scrollIntoView({block: "center", inline: "center"});
                const rect = element.getBoundingClientRect(); return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
            })()`);
            if (!point) throw new Error(`Rendered action not found: ${label}`);
            await cdp.send("Page.bringToFront");
            const started = Date.now();
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x, y: point.y, button: "none"});
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            note(`ACT rendered-control-click=${JSON.stringify(cardLabel === undefined ? label : `${label} in ${cardLabel}`)}`);
            return {action: `click ${cardLabel === undefined ? label : `${label} in ${cardLabel}`}`, inputMethod: "CDP mouse", started, resultWasFalseBeforeInput: true};
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
        const activate = async (label, result) => {
            await requireFalse(result, `keyboard activation ${label}`);
            await evaluate("document.activeElement?.blur(); document.body.focus()");
            let focusBefore;
            for (let index = 0; index < MAX_CONTROLS; index += 1) {
                await dispatchKey("Tab", "Tab", 9);
                focusBefore = await activeControl();
                if (focusBefore?.label === label) break;
            }
            if (focusBefore?.label !== label) throw new Error(`Could not reach rendered action with browser keyboard focus: ${label}`);
            const started = Date.now();
            await dispatchKey(" ", "Space", 32);
            await wait(30);
            if (!await result()) await dispatchKey("Enter", "Enter", 13);
            const focusAfter = await activeControl();
            note(`ACT keyboard-focus-and-activation=${JSON.stringify(label)} focusBefore=${JSON.stringify(focusBefore)} focusAfter=${JSON.stringify(focusAfter)}`);
            return {action: `keyboard activation ${label}`, inputMethod: "CDP keyboard Tab + Space (Enter fallback)", focusBefore, focusAfter, started, resultWasFalseBeforeInput: true};
        };
        const pressKey = async (label, key, code, windowsVirtualKeyCode, result) => {
            await requireFalse(result, `keyboard ${label}`);
            const focusBefore = await activeControl();
            const started = Date.now();
            await dispatchKey(key, code, windowsVirtualKeyCode);
            const focusAfter = await activeControl();
            note(`ACT keyboard=${JSON.stringify(label)} focusBefore=${JSON.stringify(focusBefore)} focusAfter=${JSON.stringify(focusAfter)}`);
            return {action: `keyboard ${label}`, inputMethod: `CDP keyboard ${key}`, focusBefore, focusAfter, started, resultWasFalseBeforeInput: true};
        };
        const observeAction = async (goal, operation, result, timeout, visibleResultFor) => {
            await waitFor(result, `${operation.action} visible result`, timeout);
            operation.latencyMs = Date.now() - operation.started;
            const visibleResult = visibleResultFor === undefined
                ? await evaluate("document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400)")
                : await visibleResultFor();
            actions.push({...operation, goal, owner: ownerForGoal(goal), visibleResult, visibleResultAt: new Date().toISOString(), consoleErrors: [...consoleErrors], networkErrors: [...networkErrors]});
            await snapshot(goal, operation);
        };
        const fill = async (label, value, result) => {
            await requireFalse(result, `enter ${label}`);
            const point = await evaluate(`(() => {
                const wanted = ${JSON.stringify(label)};
                const input = [...document.querySelectorAll("input,textarea")].find((candidate) => candidate.getClientRects().length > 0 && (candidate.labels?.[0]?.innerText ?? candidate.getAttribute("aria-label") ?? "").includes(wanted));
                if (!input) return null;
                const rect = input.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
            })()`);
            if (!point) throw new Error(`Rendered input not found: ${label}`);
            const started = Date.now();
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
            await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
            await dispatchKey("Backspace", "Backspace", 8);
            await cdp.send("Input.insertText", {text: value});
            note(`ACT rendered-input=${JSON.stringify(label)}`);
            return {action: `enter ${label}`, inputMethod: "CDP mouse + keyboard text", started, resultWasFalseBeforeInput: true};
        };
        const toggleCheckbox = async (label, result) => {
            await requireFalse(result, `toggle ${label}`);
            const point = await evaluate(`(() => {
                const wanted = ${JSON.stringify(label)};
                const input = [...document.querySelectorAll('input[type=checkbox]')].find((candidate) => candidate.getClientRects().length > 0 && (candidate.labels?.[0]?.innerText ?? '').includes(wanted));
                if (!input || input.disabled) return null;
                input.scrollIntoView({block: 'center', inline: 'center'});
                const rect = input.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
            })()`);
            if (!point) throw new Error(`Rendered checkbox not found: ${label}`);
            const started = Date.now();
            await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1});
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            note(`ACT rendered-checkbox=${JSON.stringify(label)}`);
            return {action: `toggle ${label}`, inputMethod: "CDP mouse", started, resultWasFalseBeforeInput: true};
        };
        const recordFinding = (id, surface, owner, reason, documentationClaimId, coverageId) => {
            findings.push({id, surface, owner, status: "unreached", observedBy: runId, reason, ...(documentationClaimId === undefined ? {} : {documentationClaimId}), ...(coverageId === undefined ? {} : {coverageId}), consoleErrors: [...consoleErrors], networkErrors: [...networkErrors]});
            note(`FINDING id=${id} owner=${owner} reason=${JSON.stringify(reason)}`);
        };
        const recordMissingCoverageFinding = (coverageId, id, surface, owner, reason) => {
            if (!actions.some((action) => action.coverageId === coverageId) && !findings.some((finding) => finding.coverageId === coverageId)) {
                recordFinding(id, surface, owner, reason, undefined, coverageId);
            }
        };
        const renderedText = (value) => evaluate(`(() => {
            const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
            return [...document.querySelectorAll("body *")].some((element) => visible(element) && element.children.length === 0 && (element.textContent ?? "").includes(${JSON.stringify(value)}));
        })()`);
        const cardText = (label) => evaluate(`(() => {
            const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
            const heading = [...document.querySelectorAll("body *")].find((element) => visible(element) && element.children.length === 0 && (element.textContent ?? "").trim() === ${JSON.stringify(label)});
            for (let card = heading?.parentElement; card && card !== document.body; card = card.parentElement) {
                const builds = [...card.querySelectorAll("button")].filter((button) => visible(button) && button.innerText.trim() === "Build");
                if (builds.length === 1 && card.innerText.includes(${JSON.stringify(label)})) return card.innerText;
            }
            return "";
        })()`);
        const cardTextForControl = (label) => evaluate(`(() => {
            const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
            const control = [...document.querySelectorAll("button,a,[role=tab]")].find((element) => visible(element) && (element.innerText ?? element.textContent ?? "").trim() === ${JSON.stringify(label)});
            for (let card = control?.parentElement; card && card !== document.body; card = card.parentElement) {
                const controls = [...card.querySelectorAll("button")].filter((button) => visible(button) && button.innerText.trim() === ${JSON.stringify(label)});
                if (controls.length === 1) return card.innerText;
            }
            return "";
        })()`);
        const activeSection = (label) => evaluate(`(() => [...document.querySelectorAll('nav[aria-label=Sections] button')].some((button) => button.getClientRects().length > 0 && button.getAttribute('aria-current') === 'page' && (button.innerText ?? '').trim() === ${JSON.stringify(label)}))()`);
        await setViewport(1280, 900, "desktop");
        await cdp.send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
        await waitFor(() => evaluate("document.body.innerText.includes('Design Your Game')"), "Home Design Game");
        await snapshot("First-time creator arrives at Studio");
        await observeAction("First-time Projects registry empty state", await click("Projects", () => activeSection("Projects")), () => activeSection("Projects"));
        await observeAction("First-time creator returns to Design Game", await click("Design Game", () => activeSection("Design Game")), () => activeSection("Design Game"));
        await setViewport(405, 800, "narrow");
        await snapshot("First-time creator arrives at Studio on a narrow viewport");
        await setViewport(1280, 900, "desktop");
        let operation = await activate("New Blueprint", async () => (await renderedActionExists("Recommended")) || (await renderedActionExists("Discard")));
        await waitFor(async () => (await renderedActionExists("Recommended")) || (await renderedActionExists("Discard")), "New Blueprint dialog");
        if (await renderedActionExists("Discard")) {
            await observeAction("Creator is warned before discarding the initial draft", operation, () => renderedActionExists("Discard"));
            operation = await activate("Discard", () => renderedActionExists("Recommended"));
            await observeAction("Creator chooses a new Blueprint", operation, () => renderedActionExists("Recommended"));
        } else {
            await observeAction("Creator chooses a new Blueprint", operation, () => renderedActionExists("Recommended"));
        }
        operation = await click("Load existing", () => renderedText("Existing blueprint path"));
        await observeAction("Load existing Blueprint requires an external artifact", operation, () => renderedText("Existing blueprint path"));
        recordFinding("P8-01-F-NEW-BLUEPRINT-LOAD-EXISTING", "New Blueprint Load existing blueprint", "P8-04", "The rendered Load existing flow requires a user-supplied blueprint file path; a clean browser run does not invent an external artifact or select a native picker result.");
        operation = await activate("Back", () => renderedActionExists("Blank"));
        await observeAction("Creator returns from Load existing Blueprint", operation, () => renderedActionExists("Blank"));
        operation = await activate("Blank", () => evaluate("[...document.querySelectorAll('input')].some((input) => (input.labels?.[0]?.innerText ?? '').includes('Game id') && input.value === '')"));
        await observeAction("Blank Blueprint validation state", operation, () => evaluate("[...document.querySelectorAll('input')].some((input) => (input.labels?.[0]?.innerText ?? '').includes('Game id') && input.value === '')"));
        operation = await click("Create Project", () => renderedText("Invalid"));
        await observeAction("Blank Blueprint rejected before project creation", operation, () => renderedText("Invalid"));
        operation = await activate("New Blueprint", async () => (await renderedActionExists("Recommended")) || (await renderedActionExists("Discard")));
        await waitFor(async () => (await renderedActionExists("Recommended")) || (await renderedActionExists("Discard")), "New Blueprint dialog after validation failure");
        if (await renderedActionExists("Discard")) {
            await observeAction("Creator is warned before replacing an invalid draft", operation, () => renderedActionExists("Discard"));
            operation = await activate("Discard", () => renderedActionExists("Recommended"));
        }
        await observeAction("Creator opens new Blueprint choices after validation", operation, () => renderedActionExists("Recommended"));
        operation = await click("Random", () => renderedText("Seed (optional)"));
        await observeAction("Creator opens Random Blueprint controls", operation, () => renderedText("Seed (optional)"));
        operation = await fill("Name (optional)", "P8 inventory random", () => evaluate("[...document.querySelectorAll('input')].some((input) => input.value === 'P8 inventory random')"));
        await observeAction("Creator enters Random Blueprint name", operation, () => evaluate("[...document.querySelectorAll('input')].some((input) => input.value === 'P8 inventory random')"));
        operation = await click("Generate", () => renderedText('Generated "P8 inventory random"'));
        await observeAction("Creator generates Random Blueprint", operation, () => renderedText('Generated "P8 inventory random"'));
        const randomBlueprintApplied = () => evaluate("[...document.querySelectorAll('input')].some((input) => (input.labels?.[0]?.innerText ?? '').includes('Game id') && input.value !== '')");
        operation = await activate("Use this blueprint", randomBlueprintApplied);
        await observeAction("Creator uses the generated Random Blueprint", operation, randomBlueprintApplied);
        const newBlueprintDialogClosed = () => evaluate("![...document.querySelectorAll('[role=dialog]')].some((element) => element.getClientRects().length > 0)");
        if (!await newBlueprintDialogClosed()) {
            try {
                operation = await pressKey("Escape closes Random Blueprint dialog", "Escape", "Escape", 27, newBlueprintDialogClosed);
                await observeAction("Creator closes Random Blueprint dialog after use", operation, newBlueprintDialogClosed);
            } catch (error) {
                if (!String(error.message).includes("result was already visible")) throw error;
            }
        }
        operation = await activate("New Blueprint", () => renderedActionExists("Discard"));
        await observeAction("Creator is warned before replacing the Random Blueprint", operation, () => renderedActionExists("Discard"));
        operation = await activate("Discard", () => renderedActionExists("Recommended"));
        await observeAction("Creator chooses a replacement Blueprint", operation, () => renderedActionExists("Recommended"));
        operation = await activate("Recommended", () => evaluate("[...document.querySelectorAll('input')].some((input) => (input.labels?.[0]?.innerText ?? '').includes('Game id') && input.value === 'starter-slot')"));
        await observeAction("Creator selects recommended Blueprint after Random use", operation, () => evaluate("[...document.querySelectorAll('input')].some((input) => (input.labels?.[0]?.innerText ?? '').includes('Game id') && input.value === 'starter-slot')"));
        if (!await newBlueprintDialogClosed()) {
            try {
                operation = await pressKey("Escape closes Recommended Blueprint dialog", "Escape", "Escape", 27, newBlueprintDialogClosed);
                await observeAction("Creator closes Recommended Blueprint dialog", operation, newBlueprintDialogClosed);
            } catch (error) {
                if (!String(error.message).includes("result was already visible")) throw error;
            }
        }
        operation = await click("Create Project", () => renderedActionExists("Close project"));
        await observeAction("Created project overview", operation, () => renderedActionExists("Close project"), 120_000);
        await snapshot("Project tab: Overview", operation);
        const tabs = await evaluate("[...document.querySelectorAll('nav[aria-label=Sections] button')].filter((item) => item.getClientRects().length > 0).map((item) => item.innerText.trim())");
        for (const tab of tabs) {
            if (await activeSection(tab)) continue;
            operation = await click(tab, () => activeSection(tab));
            await observeAction(`Project tab: ${tab}`, operation, () => activeSection(tab));
            if (tab === "Play") {
                operation = await click("New Play session", () => renderedActionExists("Spin"));
                await observeAction("Play session starts", operation, () => renderedActionExists("Spin"));
                const playSpinTerminal = () => evaluate("!document.body.innerText.includes('No round played yet -- Spin to play.') || [...document.querySelectorAll('[role=alert]')].some((element) => element.getClientRects().length > 0)");
                operation = await click("Spin", playSpinTerminal);
                await observeAction("Play session settles a visible round or error", operation, playSpinTerminal, 120_000);
            }
            if (tab === "Simulation") {
                operation = await fill("Rounds", "2", () => evaluate("[...document.querySelectorAll('input')].some((input) => input.value === '2')"));
                await observeAction("Simulation round count is entered", operation, () => evaluate("[...document.querySelectorAll('input')].some((input) => input.value === '2')"));
                try {
                    const simulationVisibleResult = async () =>
                        (await renderedText("queued —"))
                        || (await renderedText("running —"))
                        || (await renderedText("completed —"))
                        || (await renderedText("failed —"))
                        || (await renderedText("cancelled —"))
                        || (await renderedActionExists("Cancel"))
                        || (await renderedActionExists("Repeat simulation"))
                        || (await renderedText("This simulation request"));
                    operation = {...await activate("Run Simulation", simulationVisibleResult), coverageId: "simulation-run"};
                    await observeAction("Simulation run begins or settles a visible result", operation, simulationVisibleResult, 120_000);
                    if (await renderedActionExists("Cancel")) {
                        operation = await click("Cancel", () => renderedActionExists("Confirm"));
                        await observeAction("Simulation cancellation requests confirmation", operation, () => renderedActionExists("Confirm"));
                        operation = await click("Confirm", () => !renderedActionExists("Cancel"));
                        await observeAction("Simulation cancellation leaves no successful partial report", operation, () => !renderedActionExists("Cancel"));
                    }
                } catch (error) {
                    recordFinding("P8-01-F-SIMULATION-RUN-NO-VISIBLE-RESULT", "Simulation Run Simulation", "P8-05", `The enabled Run Simulation control did not produce its false-to-true queued-round result after browser input: ${error.message}`, undefined, "simulation-run");
                }
            }
            if (tab === "Replay") {
                operation = {...await click("Load", () => renderedText("Round 1, seed")), coverageId: "replay-load"};
                await observeAction("Replay Load configures a new replay session", operation, () => renderedText("Round 1, seed"));
            }
            if (tab === "Build/Export") {
                operation = await toggleCheckbox("Bounded coverage", () => evaluate("[...document.querySelectorAll('input[type=checkbox]')].some((input) => input.checked && (input.labels?.[0]?.innerText ?? '').includes('Bounded coverage'))"));
                await observeAction("Build/Export enables bounded outcome-library coverage", operation, () => evaluate("[...document.querySelectorAll('input[type=checkbox]')].some((input) => input.checked && (input.labels?.[0]?.innerText ?? '').includes('Bounded coverage'))"));
                const generateLabel = await evaluate("[...document.querySelectorAll('button')].find((button) => button.getClientRects().length > 0 && button.innerText.includes('Generate ') && button.innerText.includes('outcome library'))?.innerText.trim()");
                if (!generateLabel) throw new Error("Rendered Build/Export outcome-library generation action not found.");
                const exportLabel = await evaluate("[...document.querySelectorAll('button')].find((button) => button.getClientRects().length > 0 && button.innerText.includes('Run Stake Engine Export'))?.innerText.trim()");
                if (!exportLabel) throw new Error("Rendered Build/Export Stake Engine export action not found.");
                const outcomeLibraryCompletedOrErrored = async () => {
                    const text = await cardTextForControl(generateLabel);
                    return /Generated .* outcomes|error|failed|could not/i.test(text);
                };
                operation = {...await activate(generateLabel, outcomeLibraryCompletedOrErrored), coverageId: "build-generate-outcome-library"};
                await observeAction("Build/Export completes outcome-library generation or reports an error", operation, outcomeLibraryCompletedOrErrored, 120_000, () => cardTextForControl(generateLabel));
                await waitFor(() => renderedActionExists(exportLabel), "enabled Stake Engine export after completed outcome-library generation", 120_000);
                const stakeExportCompletedOrErrored = async () => {
                    const text = await cardTextForControl(exportLabel);
                    return /Exported \d+ file\(s\)|error|failed|could not|replace the existing directory/i.test(text);
                };
                operation = {...await activate(exportLabel, stakeExportCompletedOrErrored), coverageId: "stake-engine-export"};
                await observeAction("Build/Export completes Stake Engine export or reports an error", operation, stakeExportCompletedOrErrored, 120_000, () => cardTextForControl(exportLabel));

                const artifactBuilds = [
                    {label: "TypeScript Game Package", coverageId: "build-typescript-game-package", findingId: "P8-01-F-BUILD-TYPESCRIPT-GAME-PACKAGE-NO-VISIBLE-RESULT"},
                    {label: "Outcome library", coverageId: "build-outcome-library", findingId: "P8-01-F-BUILD-OUTCOME-LIBRARY-NO-VISIBLE-RESULT"},
                    {label: "Stake Engine export", coverageId: "build-stake-engine-export", findingId: "P8-01-F-BUILD-STAKE-ENGINE-EXPORT-NO-VISIBLE-RESULT"},
                    {label: "PAR sheet (.xlsx)", coverageId: "build-par-sheet", findingId: "P8-01-F-BUILD-PAR-SHEET-NO-VISIBLE-RESULT"},
                ];
                for (const artifact of artifactBuilds) {
                    const artifactLoadingSuccessOrError = async () => {
                        const text = await cardText(artifact.label);
                        return /Building artifact|Built to |Build cancelled\.|artifact build|error|failed|could not|couldn't|unable to/i.test(text);
                    };
                    try {
                        operation = {...await click("Build", artifactLoadingSuccessOrError, artifact.label), coverageId: artifact.coverageId};
                        await observeAction(`Build/Export ${artifact.label} Build reaches a visible loading, success, or error result`, operation, artifactLoadingSuccessOrError, 120_000, () => cardText(artifact.label));
                    } catch (error) {
                        recordFinding(
                            artifact.findingId,
                            `Build/Export ${artifact.label} Build`,
                            "P8-05",
                            `Browser input reached the enabled Build control, but its card showed no false-to-true loading, success, or error result within the bounded observation window: ${error.message}`,
                            undefined,
                            artifact.coverageId,
                        );
                    }
                }
            }
        }
        await setViewport(405, 800, "narrow");
        await snapshot("Build/Export on a narrow viewport");
        await setViewport(1280, 900, "desktop");
        try {
        const closeProjectToHome = async (goal) => {
            const closeResult = async () => (await renderedActionExists("Confirm")) || (await renderedText("Design Your Game"));
            operation = await click("Close project", closeResult);
            await observeAction(`${goal} starts its visible close transition`, operation, closeResult);
            if (await renderedActionExists("Confirm")) {
                operation = await click("Confirm", () => renderedText("Design Your Game"));
                await observeAction(`${goal} confirms closing the project`, operation, () => renderedText("Design Your Game"));
            }
            await waitFor(() => renderedText("Design Your Game"), `${goal} Home result`);
        };
        await closeProjectToHome("Creator");
        operation = await click("Projects", () => activeSection("Projects"));
        await observeAction("Projects registry after creating a project", operation, () => activeSection("Projects"));
        const unsavedChangesDialogVisible = () => renderedText("You have unsaved changes in Design Game. Leave and lose them?") && renderedActionExists("Stay") && renderedActionExists("Leave");
        operation = {...await click("Open", unsavedChangesDialogVisible, "Starter Slot"), coverageId: "managed-project-open-conflict"};
        await observeAction("Managed project Open reveals the unsaved-changes dialog", operation, unsavedChangesDialogVisible, 5_000);
        const unsavedChangesDialogClosed = async () => !(await unsavedChangesDialogVisible());
        operation = {...await click("Stay", unsavedChangesDialogClosed), coverageId: "managed-project-open-stay"};
        await observeAction("Managed project Open stays in the draft after its conflict dialog", operation, unsavedChangesDialogClosed);
        operation = await click("Open", unsavedChangesDialogVisible, "Starter Slot");
        await observeAction("Managed project Open reopens its unsaved-changes dialog", operation, unsavedChangesDialogVisible, 5_000);
        operation = {...await click("Leave", () => renderedActionExists("Close project")), coverageId: "managed-project-open"};
        await observeAction("Managed project Open leaves the draft and opens the project workspace", operation, () => renderedActionExists("Close project"), 120_000);
        if (await unsavedChangesDialogVisible()) {
            try {
                operation = await click("Stay", unsavedChangesDialogClosed);
                await observeAction("Managed project Open clears its completed conflict dialog", operation, unsavedChangesDialogClosed);
            } catch (error) {
                if (!await unsavedChangesDialogClosed()) throw error;
                note("Managed project Open post-Leave dialog closed before its conditional Stay action.");
            }
        }
        await closeProjectToHome("Managed project workspace");
        operation = await click("Projects", () => activeSection("Projects"));
        await observeAction("Projects registry after opening managed project", operation, () => activeSection("Projects"));
        const removeConfirmationVisible = () => renderedText("This only forgets it here") && renderedActionExists("Cancel");
        operation = {...await click("Remove", removeConfirmationVisible), coverageId: "managed-project-remove-confirm"};
        await observeAction("Managed project Remove opens its non-destructive confirmation", operation, removeConfirmationVisible, 5_000);
        const removeConfirmationClosed = async () => !(await removeConfirmationVisible());
        operation = {...await click("Cancel", removeConfirmationClosed), coverageId: "managed-project-remove-cancel"};
        await observeAction("Managed project Remove is cancelled", operation, removeConfirmationClosed);
        } catch (error) {
            const closeBoundary = `Studio could not return from the active project to the managed-project registry: ${error.message}`;
            recordMissingCoverageFinding("managed-project-open-conflict", "P8-01-F-MANAGED-PROJECT-OPEN-CONFLICT", "Managed project Open unsaved-changes dialog", "P8-02", closeBoundary);
            recordMissingCoverageFinding("managed-project-open-stay", "P8-01-F-MANAGED-PROJECT-OPEN-STAY", "Managed project Open Stay recovery", "P8-02", closeBoundary);
            recordMissingCoverageFinding("managed-project-open", "P8-01-F-MANAGED-PROJECT-OPEN-NO-VISIBLE-RESULT", "Managed project Open", "P8-02", closeBoundary);
            recordMissingCoverageFinding("managed-project-remove-confirm", "P8-01-F-MANAGED-PROJECT-REMOVE-CONFIRMATION", "Managed project Remove confirmation", "P8-02", closeBoundary);
            recordMissingCoverageFinding("managed-project-remove-cancel", "P8-01-F-MANAGED-PROJECT-REMOVE-CANCEL", "Managed project Remove cancellation", "P8-02", closeBoundary);
        }
        recordFinding("P8-01-F-IMPORT-NATIVE-PICKER", "Import Project host native picker", "P8-02", "The browser collector can observe Browse controls but a headless clean-profile run cannot select a host-native file-picker result.");
        recordFinding("P8-01-F-IMPORT-DETECT", "Import Project Detect", "P8-02", "Detect requires a user-provided package, outcome library, export, blueprint, or PAR-sheet path; the clean run does not fabricate an external artifact.", "DOC-03");
        recordFinding("P8-01-F-IMPORT-REGISTER", "Import Project Register", "P8-02", "Register is offered only after a successful detection of a user-provided external artifact, which is unavailable in this clean run.");
        recordFinding("P8-01-F-IMPORT-OPEN", "Import Project Open imported project", "P8-02", "Open is offered only after registration of a detected external artifact, which is unavailable in this clean run.");
        recordFinding("P8-01-F-REOPEN-PERSISTENCE", "Reopen Studio and persisted project/artifact state", "P8-02", "This bounded run proves the in-session registry after creation, but does not restart Studio because that would turn the independent clean-profile run into a seeded profile.");
        recordFinding("P8-01-F-TRANSIENT-LOADING", "Transient loading state capture", "P8-06", "Fast local responses did not leave a rendered loading state long enough for a browser observation; no loading state is claimed as covered.");
        recordFinding("P8-01-F-CONDITIONAL-CAPABILITIES", "Certification and Provably Fair capability-gated tabs", "P8-05", "The created Blueprint did not expose runtime/outcome-library capabilities, so the public conditional tabs were not observed.", "DOC-05");
        recordFinding("P8-01-F-SIMULATION-TERMINALS", "Cancelled and failed simulation outcomes", "P8-05", "No public failure or cancellation trigger was available from the clean Blueprint run; no terminal state is claimed as covered.", "DOC-07");
        recordFinding("P8-01-F-REPLAY-ARTIFACT-INPUT", "Replay Artifact validation/load", "P8-05", "Replay Artifact requires a user-provided exported replay JSON; the clean run exercises seed replay instead of inventing an artifact.");
        recordFinding("P8-01-F-REPLAY-ARTIFACT-TERMINALS", "Replay artifact failure and recovery outcomes", "P8-05", "No public malformed or incompatible artifact was supplied to induce a failure; no artifact terminal state is claimed as covered.");
        recordFinding("P8-01-F-BUILD-OPEN-OUTPUT-FOLDER", "Build/Export Open output folder", "P8-05", "The post-build control delegates to the host-native file manager, which is unavailable in headless Chromium.");
        recordFinding("P8-01-F-PROJECT-SHOW-LOCATION", "Project Show project location", "P8-02", "The visible project-location control delegates to the host-native file manager, which is unavailable in headless Chromium.");
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error.stack ?? error}\n`);
        process.exitCode = 1;
    });
}

#!/usr/bin/env node
/**
 * Independent P5PA-08 host-browser verification.
 *
 * This starts a newly-built Studio from this candidate worktree and a fresh
 * Chrome profile. CDP is used solely to locate rendered controls, send real
 * mouse/keyboard input, read rendered page/control text, and take screenshots.
 * It does not call Studio APIs, inject DOM/state, or fabricate UI evidence.
 */
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {tmpdir} from "node:os";
import {dirname, resolve} from "node:path";
import WebSocket from "ws";

const root = resolve(import.meta.dirname, "../../../..");
const output = resolve(import.meta.dirname, "host-browser");
const node = process.env.P5_NODE ?? process.execPath;
const npm = process.env.P5_NPM ?? "npm";
const studioPort = Number(process.env.P5_STUDIO_PORT ?? "32108");
const chromePort = Number(process.env.P5_CHROME_PORT ?? "9238");
const studio = `http://127.0.0.1:${studioPort}`;
const devtools = `http://127.0.0.1:${chromePort}`;
const marker = "/* P5PA-08 UNAPPLIED JSON DRAFT */";
const transcript = [];
const children = [];

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

function sleep(milliseconds) {
    return new Promise((done) => setTimeout(done, milliseconds));
}

async function run(command, args, logName, options = {}) {
    const child = spawn(command, args, {cwd: root, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"]});
    let outputText = `$ ${[command, ...args].join(" ")}\n`;
    child.stdout.on("data", (chunk) => { outputText += chunk; });
    child.stderr.on("data", (chunk) => { outputText += chunk; });
    const code = await new Promise((done) => child.once("close", done));
    outputText += `\n[exit ${code}]\n`;
    await writeFile(resolve(output, logName), outputText);
    if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${code}; see ${logName}`);
}

function start(command, args, logName, env = process.env) {
    const child = spawn(command, args, {cwd: root, env, stdio: ["ignore", "pipe", "pipe"]});
    children.push(child);
    let outputText = `$ ${[command, ...args].join(" ")}\n`;
    child.stdout.on("data", (chunk) => { outputText += chunk; });
    child.stderr.on("data", (chunk) => { outputText += chunk; });
    return {
        child,
        async capture() {
            outputText += `\n[exit ${child.exitCode ?? "still-running-at-capture"}]\n`;
            await writeFile(resolve(output, logName), outputText);
        },
    };
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function waitForFetch(url, description, timeout = 60000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                note(`OBSERVE ${description}`);
                return;
            }
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${description}: ${lastError}`);
}

async function connect() {
    const target = await fetchJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id === undefined || !pending.has(message.id)) return;
        const current = pending.get(message.id);
        pending.delete(message.id);
        message.error ? current.reject(new Error(JSON.stringify(message.error))) : current.resolve(message.result);
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
    const nodeBin = dirname(node);
    const buildEnv = {...process.env, PATH: `${nodeBin}:${process.env.PATH}`};
    await writeFile(resolve(output, "00-candidate-and-runtime.txt"), [
        `candidate_sha=${(await (await import("node:child_process")).execFileSync("git", ["rev-parse", "HEAD"], {cwd: root})).toString().trim()}`,
        `node=${node}`,
        `node_version=${(await (await import("node:child_process")).execFileSync(node, ["--version"])).toString().trim()}`,
        `npm=${npm}`,
        `studio=${studio}`,
        `devtools=${devtools}`,
        "workflow=real public Studio UI; coordinate input via Chrome DevTools Protocol",
        "",
    ].join("\n"));
    if (process.env.P5_SKIP_BUILD === "1") {
        note("REUSE the immediately preceding full candidate build; start a fresh Studio and Chrome session");
        await writeFile(resolve(output, "01-build-reuse.txt"), "This fresh browser session reuses dist produced by the immediately preceding successful full candidate build in host-browser-attempt-2/01-full-candidate-build.log. Candidate SHA is recorded above and unchanged.\n");
    } else {
        note("BUILD the complete candidate package before launching its Studio workflow");
        await run(npm, ["run", "build"], "01-full-candidate-build.log", {env: buildEnv});
    }

    const studioProcess = start(node, ["dist/cli/pokie.js", "studio", "--port", String(studioPort), "--no-open"], "02-fresh-candidate-studio.log", buildEnv);
    await waitForFetch(studio, "fresh candidate Studio HTTP server");
    const profile = await mkdtemp(resolve(tmpdir(), "p5pa-08-chrome-"));
    const chromeProcess = start("/bin/google-chrome", [
        "--headless=new",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${profile}`,
        "about:blank",
    ], "03-fresh-chrome.log", buildEnv);
    await waitForFetch(`${devtools}/json/version`, "fresh Chrome DevTools endpoint");
    await writeFile(resolve(output, "04-cdp-version.json"), `${JSON.stringify(await fetchJson(`${devtools}/json/version`), null, 2)}\n`);

    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const wait = async (expression, description, timeout = 30000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
        note(`OBSERVE ${description}`);
    };
    const point = async (expression, description) => {
        const result = await evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false, visible:[...document.querySelectorAll('button,[role="button"],[role="radio"],label')].filter(x=>x.getClientRects().length>0).map(x=>x.textContent?.trim()).filter(Boolean)}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,tag:e.tagName,text:e.textContent?.trim(),aria:e.getAttribute('aria-label')}; })()`);
        if (!result?.ok) throw new Error(`No visible ${description}: ${JSON.stringify(result)}`);
        return result;
    };
    const visibleTextControl = (label) => point(`[...document.querySelectorAll('button,[role="button"],[role="radio"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`, `control ${JSON.stringify(label)}`);
    const click = async (target, description) => {
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1});
        note(`CLICK ${description} at rendered ${target.tag} coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
        await sleep(450);
    };
    const clickLabel = async (label) => click(await visibleTextControl(label), JSON.stringify(label));
    const wheel = async (deltaY, description) => {
        // Chrome's synthesized scroll gesture is the CDP equivalent of a real
        // mouse-wheel/touchpad scroll; unlike Runtime scrolling it does not
        // alter application DOM/state directly.
        await cdp.send("Input.synthesizeScrollGesture", {x: 400, y: 400, xDistance: 0, yDistance: deltaY, speed: 800, gestureSourceType: "mouse"});
        note(`SCROLL ${description} through browser mouse-wheel gesture (${deltaY})`);
        await sleep(350);
    };
    const focusByTab = async (matchesActiveElement, description, reverse = false) => {
        for (let step = 0; step < 20; step += 1) {
            if (await evaluate(matchesActiveElement)) {
                note(`FOCUS ${description} through rendered keyboard Tab navigation after ${step} step(s)`);
                return;
            }
            if (reverse) await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16, modifiers: 8});
            await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: reverse ? 8 : 0});
            await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: reverse ? 8 : 0});
            if (reverse) await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16});
            await sleep(30);
        }
        throw new Error(`Could not focus ${description} through browser Tab navigation`);
    };
    const activateFocusedControl = async (description) => {
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32});
        note(`ACTIVATE ${description} through browser keyboard Space`);
        await sleep(450);
    };
    const selectAdjacentMode = async (selectedValue, key, description, reverse = true) => {
        await focusByTab(
            `(() => { const e = document.activeElement; return (e?.matches('input[type=radio]') && e.value === ${JSON.stringify(selectedValue)}) || (e?.getAttribute('role') === 'radio' && e.textContent?.trim() === ${JSON.stringify(selectedValue === 'json' ? 'JSON' : 'Form')}); })()`,
            `${selectedValue} mode radio`,
            reverse,
        );
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key, code: key === "ArrowLeft" ? "ArrowLeft" : "ArrowRight", windowsVirtualKeyCode: key === "ArrowLeft" ? 37 : 39});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key, code: key === "ArrowLeft" ? "ArrowLeft" : "ArrowRight", windowsVirtualKeyCode: key === "ArrowLeft" ? 37 : 39});
        note(`SELECT ${description} through the focused rendered segmented-control radio and browser ${key}`);
        await sleep(450);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        const visible = await evaluate("document.body.innerText");
        const textareaValue = await evaluate("document.querySelector('textarea')?.value ?? ''");
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${visible}\n`);
        await writeFile(resolve(output, `${name}-textarea-value.txt`), `${textareaValue}\n`);
        note(`CAPTURE ${name}.png, ${name}-visible-text.txt, and rendered textarea value`);
    };

    note(`START fresh visible browser workflow against ${studio}`);
    await cdp.send("Page.navigate", {url: studio});
    note("NAVIGATE Studio public root URL");
    await wait("document.body.innerText.includes('Design Game') && [...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'New Blueprint')", "rendered Design Game Blueprint workflow");
    await snapshot("05-design-game-initial");
    await clickLabel("New Blueprint");
    await wait("document.body.innerText.includes('Start from a blank blueprint')", "rendered New Blueprint chooser");
    await snapshot("05a-new-blueprint-chooser");
    await clickLabel("Blank");
    // Mantine's closing transition can leave the modal's text in the document
    // briefly even though its overlay no longer intercepts input. Continue via
    // the next rendered control rather than treating that transition detail as
    // business-state evidence.
    await sleep(700);
    note("SELECT Blank through the rendered New Blueprint dialog");
    await clickLabel("Show advanced options (JSON mode, load/save by path)");
    await wait("[...document.querySelectorAll('label,[role=radio]')].some((e) => e.textContent?.trim() === 'JSON' && e.getClientRects().length > 0)", "visible advanced JSON/Form mode control");
    await clickLabel("JSON");
    await wait("document.querySelector('textarea') && [...document.querySelectorAll('label')].some((e) => e.textContent?.includes('Blueprint JSON'))", "rendered Blueprint JSON textarea");
    await focusByTab("document.activeElement?.tagName === 'TEXTAREA'", "Blueprint JSON textarea");
    await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36, modifiers: 2});
    await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36, modifiers: 2});
    await cdp.send("Input.insertText", {text: `${marker}\n`});
    note(`INPUT unapplied JSON draft marker through rendered textarea keyboard input: ${marker}`);
    await wait(`document.querySelector('textarea')?.value.includes(${JSON.stringify(marker)})`, "typed, unapplied JSON draft in rendered textarea");
    await snapshot("06-unapplied-json-draft");

    await selectAdjacentMode("json", "ArrowLeft", "Form mode");
    await wait("document.body.innerText.includes('Switch away from JSON mode? The unapplied JSON edit will be discarded.')", "visible mode-switch warning modal");
    await snapshot("07-mode-switch-warning");
    await clickLabel("Cancel");
    await wait(`document.querySelector('textarea')?.value.includes(${JSON.stringify(marker)})`, "Cancel preserves the unapplied JSON draft and JSON mode");
    await snapshot("08-cancel-preserves-draft");

    await focusByTab("document.activeElement?.textContent?.trim() === 'New Blueprint'", "New Blueprint action", true);
    await activateFocusedControl("New Blueprint action");
    await wait("document.body.innerText.includes('You have unsaved changes to the current blueprint. Save them, discard them, or cancel.')", "shared New Blueprint unsaved-work protection for the JSON-only draft");
    await snapshot("09-shared-unsaved-work-protection");
    await clickLabel("Cancel");
    await wait(`document.querySelector('textarea')?.value.includes(${JSON.stringify(marker)})`, "shared gate Cancel preserves the same JSON draft");
    await snapshot("10-shared-cancel-preserves-draft");

    await selectAdjacentMode("json", "ArrowLeft", "Form mode before discard", false);
    await wait("document.body.innerText.includes('Switch away from JSON mode? The unapplied JSON edit will be discarded.')", "mode-switch warning before deliberate discard");
    await clickLabel("Confirm");
    await wait("!document.querySelector('textarea')", "Confirm discards the JSON draft and switches to Form mode");
    await snapshot("11-confirm-discards-and-switches-form");
    note("PASS real Studio JSON-draft workflow: warning, Cancel preserve, Confirm discard, and shared New Blueprint protection.");
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
    await chromeProcess.capture();
    studioProcess.child.kill("SIGTERM");
    await sleep(300);
    await studioProcess.capture();
    await rm(profile, {recursive: true, force: true});
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    for (const child of children) child.kill("SIGTERM");
    await sleep(300);
    process.exitCode = 1;
});

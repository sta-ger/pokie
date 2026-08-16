// Independent host-side P6-04 browser recorder. CDP is limited to inspecting
// rendered controls, real pointer/keyboard input, navigation, and screenshots.
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve("docs/evidence/p6-04-independent-rerun");
const studio = "http://127.0.0.1:46149";
const devtools = "http://127.0.0.1:9228";
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
};

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    // Drive Chrome's original visible tab. In this host's headless Chrome, a
    // DevTools-created background tab receives pointer clicks but not keyboard
    // focus; this is a browser setup constraint, so use the real initial tab.
    const targets = await json(`${devtools}/json/list`);
    const target = targets.find((candidate) => candidate.type === "page" && candidate.url === "about:blank")
        ?? targets.find((candidate) => candidate.type === "page");
    if (!target) throw new Error("Chrome exposed no page target");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
        socket.once("open", resolveOpen);
        socket.once("error", reject);
    });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const result = JSON.parse(raw.toString());
        if (result.id && pending.has(result.id)) {
            const request = pending.get(result.id);
            pending.delete(result.id);
            result.error ? request.reject(new Error(JSON.stringify(result.error))) : request.resolve(result.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolveSend, reject) => {
        const requestId = ++id;
        pending.set(requestId, {resolve: resolveSend, reject});
        socket.send(JSON.stringify({id: requestId, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.bringToFront");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = () => evaluate("document.body.innerText");
    const wait = async (expression, description, timeout = 120000) => {
        const until = Date.now() + timeout;
        while (!await evaluate(expression)) {
            if (Date.now() > until) throw new Error(`Timed out waiting for ${description}`);
            await sleep(250);
        }
    };
    const control = async (name) => evaluate(`(() => {
        const wanted = ${JSON.stringify(name)};
        const candidates = [...document.querySelectorAll('button,a,[role="button"]')];
        const element = candidates.find((candidate) => candidate.textContent?.trim() === wanted && !candidate.disabled && candidate.getClientRects().length > 0);
        if (!element) return {ok:false, available:candidates.filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
        const rect = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
    })()`);
    const click = async (name) => {
        const found = await control(name);
        if (!found?.ok) throw new Error(`Rendered control ${JSON.stringify(name)} not found: ${JSON.stringify(found?.available)}`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", buttons:1, clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", buttons:0, clickCount:1});
        note(`CLICK ${JSON.stringify(name)} at rendered ${found.tag} coordinates (${Math.round(found.x)}, ${Math.round(found.y)})`);
        await sleep(500);
    };
    const input = async (label, value) => {
        const found = await evaluate(`(() => {
            const wanted = ${JSON.stringify(label)};
            const normalize = (text) => text?.trim().replace(/\\s+\\*$/, "");
            const candidates = [...document.querySelectorAll('input,textarea')].filter((candidate) => candidate.getClientRects().length > 0);
            const element = candidates.find((candidate) => candidate.getAttribute('aria-label') === wanted || [...(candidate.labels ?? [])].some((item) => normalize(item.textContent) === wanted));
            if (!element) return {ok:false, available:candidates.map((candidate) => candidate.getAttribute('aria-label') || [...(candidate.labels ?? [])].map((item) => item.textContent?.trim()).join('|'))};
            const rect = element.getBoundingClientRect();
            return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
        })()`);
        if (!found?.ok) throw new Error(`Rendered input ${JSON.stringify(label)} not found: ${JSON.stringify(found?.available)}`);
        const focusInput = async () => {
            await cdp.send("Page.bringToFront");
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:found.x, y:found.y});
            await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", buttons:1, clickCount:1});
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", buttons:0, clickCount:1});
            await sleep(300);
            return evaluate(`(() => { const element = document.activeElement; return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? (element.getAttribute('aria-label') || [...(element.labels ?? [])].map((item) => item.textContent?.trim()).join('|')) : undefined; })()`);
        };
        let focusedLabel = await focusInput();
        if (focusedLabel !== label) {
            focusedLabel = await focusInput();
        }
        if (focusedLabel !== label) throw new Error(`Visible input ${JSON.stringify(label)} did not receive browser focus; active=${JSON.stringify(focusedLabel)}`);
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        // Dispatch actual character input after focusing the rendered field. This
        // intentionally uses the browser's keyboard channel instead of assigning
        // `.value`, so React receives the same input/change sequence as a user.
        for (const character of value) {
            await cdp.send("Input.dispatchKeyEvent", {type:"char", text:character, unmodifiedText:character, key:character});
        }
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} using rendered browser input`);
        await sleep(700);
        await wait(`(() => [...document.querySelectorAll('input,textarea')].some((element) => element.getClientRects().length > 0 && (element.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(element.labels ?? [])].some((item) => item.textContent?.trim() === ${JSON.stringify(label)})) && element.value === ${JSON.stringify(value)}))()`, `${label} value retained by rendered input`);
    };
    const snapshot = async (name) => {
        const image = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        const inputValues = await evaluate(`(() => [...document.querySelectorAll('input,textarea')].filter((element) => element.getClientRects().length > 0).map((element) => ({label:element.getAttribute('aria-label') || [...(element.labels ?? [])].map((item) => item.textContent?.trim()).join('|'), value:element.value})) )()`);
        await writeFile(resolve(output, `${name}.png`), Buffer.from(image.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`);
        await writeFile(resolve(output, `${name}-visible-input-values.json`), `${JSON.stringify(inputValues, null, 2)}\n`);
        note(`CAPTURE ${name}.png, ${name}.txt, and rendered input values`);
    };
    const navigate = async (hash) => {
        await cdp.send("Page.navigate", {url:`${studio}/#${hash}`});
        note(`NAVIGATE public Studio URL #${hash}`);
        await sleep(800);
    };
    const exercise = async (kind, prefix) => {
        await click("Play");
        await wait("document.body.innerText.includes('New session')", `${kind} Play tab`);
        await click("New session");
        await wait("document.body.innerText.includes('Spin')", `${kind} Play session`);
        await click("Spin");
        await wait("!document.body.innerText.includes('No round played yet -- Spin to play.')", `${kind} spun round`);
        note(`OBSERVE ${kind} immediately playable through New session and Spin.`);
        await snapshot(`${prefix}-play`);
        await click("Simulation");
        await wait("document.body.innerText.includes('Run Simulation')", `${kind} Simulation tab`);
        await input("Rounds", "25");
        await click("Run Simulation");
        await wait("document.body.innerText.includes('RTP') && document.body.innerText.includes('Recent runs')", `${kind} completed Simulation report`);
        note(`OBSERVE ${kind} immediately simulatable: 25-round rendered report completed.`);
        await snapshot(`${prefix}-simulation`);
    };

    note("START fresh Chrome/profile against fresh local Studio; only rendered UI is driven.");
    await navigate("/home/design");
    await wait("document.body.innerText.includes('Design Your Game') && document.body.innerText.includes('Create Project')", "initial Recommended Design Game");
    await click("New Blueprint");
    await wait("document.body.innerText.includes('Create Blueprint Project')", "New Blueprint dialog");
    await click("Recommended");
    await wait("document.body.innerText.includes('Game basics')", "Recommended editor");
    await input("Game name", "P6 Recommended Owner");
    await wait("document.body.innerText.includes('Valid — no issues found.')", "Recommended automatic validation");
    await snapshot("04-recommended-owned-before-create");
    await click("Create Project");
    await wait("document.body.innerText.includes('P6 Recommended Owner') && document.body.innerText.includes('Close project')", "created Recommended Workspace");
    note("OBSERVE Recommended manual Name ownership persisted into the opened Workspace.");
    await snapshot("05-recommended-workspace");
    await exercise("Recommended", "06-recommended");
    await click("Close project");
    await wait("document.body.innerText.includes('Design Your Game')", "return to Design Game");
    await click("New Blueprint");
    await wait("document.body.innerText.includes('Create Blueprint Project')", "New Blueprint dialog for Random");
    await click("Random");
    await wait("document.body.innerText.includes('Seed (optional)') && document.body.innerText.includes('Generate')", "Random controls");
    await input("Seed (optional)", "20260816");
    await input("Name (optional)", "P6 Random Owner");
    await snapshot("07-random-seed-and-name");
    await click("Generate");
    await wait("document.body.innerText.includes('Generated') && document.body.innerText.includes('P6 Random Owner')", "named seeded Random generation");
    note("OBSERVE deterministic Random generation used the visible seed 20260816 and supplied Name.");
    await snapshot("08-random-generated");
    await click("Use this blueprint");
    await wait("document.body.innerText.includes('Game basics')", "Random editor");
    await wait("document.body.innerText.includes('Valid — no issues found.')", "Random automatic validation");
    await snapshot("09-random-before-create");
    await click("Create Project");
    await wait("document.body.innerText.includes('P6 Random Owner') && document.body.innerText.includes('Close project')", "created Random Workspace");
    note("OBSERVE seeded Random persisted, registered, and opened in its Workspace.");
    await snapshot("10-random-workspace");
    await exercise("Random", "11-random");
    await click("Close project");
    await wait("document.body.innerText.includes('Design Your Game')", "return after Random");
    await click("Projects");
    await wait("document.body.innerText.includes('P6 Recommended Owner') && document.body.innerText.includes('P6 Random Owner')", "registered projects list");
    await snapshot("12-projects-before-restart");
    note("COMPLETE browser workflow before server restart.");
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

// P6-04 independent host-side recorder. CDP is only used to inspect rendered
// controls, drive native browser mouse/keyboard events, navigate, and capture.
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_EVIDENCE_OUTPUT ?? "docs/evidence/p6-04-independent-host-verification");
const studio = process.env.P6_STUDIO_URL ?? "http://127.0.0.1:46156";
const devtools = process.env.P6_DEVTOOLS_URL ?? "http://127.0.0.1:9256";
const phase = process.env.P6_PHASE ?? "workflow";
const log = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    log.push(line);
    process.stdout.write(`${line}\n`);
};
const json = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
};

async function connect() {
    const targets = await json(`${devtools}/json/list`);
    const target = targets.find((item) => item.type === "page" && item.url === "about:blank") ?? targets.find((item) => item.type === "page");
    if (!target) throw new Error("Chrome has no page target");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id && pending.has(message.id)) {
            const item = pending.get(message.id);
            pending.delete(message.id);
            message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.accept(message.result);
        }
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++sequence;
        pending.set(id, {accept, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.bringToFront");
    return {send, close: () => socket.close()};
}

async function run() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const wait = async (expression, description, timeout = 120000) => {
        const end = Date.now() + timeout;
        while (!await evaluate(expression)) {
            if (Date.now() > end) throw new Error(`Timed out waiting for ${description}`);
            await sleep(250);
        }
    };
    const inputInfo = async (label) => evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const text = (node) => node?.textContent?.trim().replace(/\\s+\\*$/, "");
        const field = [...document.querySelectorAll("input,textarea")].find((node) => node.getClientRects().length > 0 && (node.getAttribute("aria-label") === wanted || [...(node.labels ?? [])].some((item) => text(item) === wanted)));
        if (!field) return {ok:false, fields:[...document.querySelectorAll("input,textarea")].filter((node) => node.getClientRects().length > 0).map((node) => node.getAttribute("aria-label") || [...(node.labels ?? [])].map(text).join("|"))};
        const rect = field.getBoundingClientRect();
        return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
    })()`);
    const buttonInfo = async (label, nearby) => evaluate(`(() => {
        const wanted = ${JSON.stringify(label)};
        const nearby = ${JSON.stringify(nearby)};
        const choices = [...document.querySelectorAll("button,a,[role=button]")].filter((node) => node.getClientRects().length > 0 && !node.disabled && node.textContent?.trim() === wanted);
        const node = nearby ? choices.find((candidate) => candidate.closest("tr")?.innerText?.includes(nearby)) : choices[0];
        if (!node) return {ok:false, available:choices.map((candidate) => candidate.textContent?.trim())};
        const rect = node.getBoundingClientRect();
        return {ok:true, x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, tag:node.tagName};
    })()`);
    const click = async (label, nearby) => {
        const found = await buttonInfo(label, nearby);
        if (!found?.ok) throw new Error(`Rendered ${label} control unavailable: ${JSON.stringify(found)}`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:found.x, y:found.y});
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", buttons:1, clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", buttons:0, clickCount:1});
        note(`CLICK ${JSON.stringify(label)} at rendered ${found.tag} coordinates (${Math.round(found.x)},${Math.round(found.y)})`);
        await sleep(550);
    };
    const type = async (label, value) => {
        const found = await inputInfo(label);
        if (!found?.ok) throw new Error(`Rendered ${label} input unavailable: ${JSON.stringify(found)}`);
        const activeLabel = () => evaluate(`(() => { const node = document.activeElement; return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? (node.getAttribute("aria-label") || [...(node.labels ?? [])].map((item) => item.textContent?.trim().replace(/\\s+\\*$/, "")).join("|")) : undefined; })()`);
        let focused;
        for (let attempt = 1; attempt <= 3; attempt++) {
            await cdp.send("Page.bringToFront");
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:found.x, y:found.y});
            await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", buttons:1, clickCount:1});
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", buttons:0, clickCount:1});
            await sleep(150);
            focused = await activeLabel();
            if (focused === label) break;
        }
        // Headless Chrome on this host may deliver a rendered pointer click to
        // an unfocused page. Fall back to actual Tab key traversal, checking
        // only which rendered control received browser focus; no DOM focus is
        // assigned by the recorder.
        if (focused !== label) {
            for (let tab = 1; tab <= 24; tab++) {
                await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
                await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
                await sleep(40);
                focused = await activeLabel();
                if (focused === label) {
                    note(`FOCUS ${JSON.stringify(label)} reached with rendered browser Tab traversal after pointer focus was unavailable`);
                    break;
                }
            }
        }
        if (focused !== label) throw new Error(`Visible ${label} did not receive browser focus; active=${JSON.stringify(focused)}`);
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        await wait(`(() => [...document.querySelectorAll("input,textarea")].some((node) => node.getClientRects().length > 0 && (node.getAttribute("aria-label") === ${JSON.stringify(label)} || [...(node.labels ?? [])].some((item) => item.textContent?.trim().replace(/\\s+\\*$/, "") === ${JSON.stringify(label)})) && node.value === ${JSON.stringify(value)}))()`, `${label} rendered value`);
        note(`TYPE ${JSON.stringify(label)}=${JSON.stringify(value)} with browser key events; rendered field retained it`);
    };
    const snapshot = async (name) => {
        const image = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        const text = await evaluate("document.body.innerText");
        const fields = await evaluate(`(() => [...document.querySelectorAll("input,textarea")].filter((node) => node.getClientRects().length > 0).map((node) => ({label:node.getAttribute("aria-label") || [...(node.labels ?? [])].map((item) => item.textContent?.trim()).join("|"), value:node.value})))()`);
        await writeFile(resolve(output, `${name}.png`), Buffer.from(image.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${text}\n`);
        await writeFile(resolve(output, `${name}-visible-input-values.json`), `${JSON.stringify(fields, null, 2)}\n`);
        note(`CAPTURE ${name}.png/.txt and rendered input values`);
    };
    const nav = async (hash) => {
        await cdp.send("Page.navigate", {url:`${studio}/#${hash}`});
        note(`NAVIGATE visible Studio URL #${hash}`);
        await sleep(800);
    };
    const pressOpenFor = async (name) => {
        const activeOpenFor = () => evaluate(`(() => {
            let node = document.activeElement;
            if (!(node instanceof HTMLButtonElement) || node.textContent?.trim() !== "Open") return false;
            return node.closest("tr")?.innerText?.includes(${JSON.stringify(name)}) ?? false;
        })()`);
        for (let tab = 1; tab <= 40; tab++) {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
            if (await activeOpenFor()) {
                const rect = await evaluate(`(() => {
                    const node = document.activeElement;
                    const bounds = node.getBoundingClientRect();
                    return {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2};
                })()`);
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:rect.x, y:rect.y});
                await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:rect.x, y:rect.y, button:"left", buttons:1, clickCount:1});
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:rect.x, y:rect.y, button:"left", buttons:0, clickCount:1});
                note(`CLICK visible Open control for ${JSON.stringify(name)} after browser Tab traversal`);
                await sleep(550);
                return;
            }
        }
        throw new Error(`Could not reach visible Open control for ${JSON.stringify(name)} with browser Tab traversal`);
    };
    const exercise = async (kind, prefix) => {
        await click("Play");
        await wait("document.body.innerText.includes('New session')", `${kind} Play`);
        await click("New session");
        await wait("document.body.innerText.includes('Spin')", `${kind} active session`);
        await click("Spin");
        await wait("!document.body.innerText.includes('No round played yet -- Spin to play.')", `${kind} spun round`);
        note(`OBSERVE ${kind} is immediately playable through New session then Spin.`);
        await snapshot(`${prefix}-play`);
        await click("Simulation");
        await wait("document.body.innerText.includes('Run Simulation')", `${kind} Simulation`);
        await type("Rounds", "25");
        await click("Run Simulation");
        await wait("document.body.innerText.includes('RTP') && document.body.innerText.includes('Recent runs')", `${kind} completed simulation`);
        note(`OBSERVE ${kind} simulation completed 25 rounds in rendered UI.`);
        await snapshot(`${prefix}-simulation`);
    };

    note(`START ${phase} against ${studio}; inspecting rendered DOM only and using browser input events.`);
    if (phase === "reopen") {
        await nav("/home/projects");
        await wait("document.body.innerText.includes('P6 Recommended Owner') && document.body.innerText.includes('P6 Random Owner')", "persisted registered projects after restart");
        await snapshot("11-projects-after-restart");
        // The Projects table deliberately scrolls its actions horizontally on a narrow viewport.
        // A coordinate click can therefore target an off-screen action (and produce no browser
        // event at all). Tab to the rendered action instead: the browser scrolls it into view, then
        // native mouse input activates the exact Random row through the same visible UI path.
        await pressOpenFor("P6 Random Owner");
        await wait("document.body.innerText.includes('Close project')", "reopened Random workspace after restart");
        await wait("document.body.innerText.includes('P6 Random Owner')", "reopened Random Workspace identity");
        note("OBSERVE registered Random project reopened through the visible Projects UI after fresh Studio/client restart.");
        await snapshot("12-random-reopened");
    } else {
        await nav("/home/design");
        await wait("document.body.innerText.includes('Design Your Game') && document.body.innerText.includes('New Blueprint')", "Design Game");
        await click("New Blueprint");
        await wait("document.body.innerText.includes('Create Blueprint Project')", "New Blueprint dialog");
        await click("Recommended");
        await wait("document.body.innerText.includes('Game basics')", "Recommended editor");
        await type("Game name", "P6 Recommended Owner");
        await wait("document.body.innerText.includes('Valid — no issues found.')", "Recommended validation");
        await snapshot("02-recommended-owned-before-create");
        await click("Create Project");
        await wait("document.body.innerText.includes('P6 Recommended Owner') && document.body.innerText.includes('Close project')", "Recommended Workspace");
        note("OBSERVE manual Recommended Name ownership persisted to the opened Workspace.");
        await snapshot("03-recommended-workspace");
        await exercise("Recommended", "04-recommended");
        await click("Close project");
        await wait("document.body.innerText.includes('Design Your Game')", "Design Game after Recommended");
        await click("New Blueprint");
        await wait("document.body.innerText.includes('Create Blueprint Project')", "Random dialog");
        await click("Random");
        await wait("document.body.innerText.includes('Seed (optional)') && document.body.innerText.includes('Generate')", "Random controls");
        await type("Seed (optional)", "20260816");
        await type("Name (optional)", "P6 Random Owner");
        await snapshot("06-random-seed-name");
        await click("Generate");
        await wait("document.body.innerText.includes('Generated') && document.body.innerText.includes('P6 Random Owner')", "seeded Random generation");
        note("OBSERVE deterministic Random used visible seed 20260816 and manual Name.");
        await snapshot("07-random-generated");
        await click("Use this blueprint");
        await wait("document.body.innerText.includes('Game basics')", "Random editor");
        await wait("[...document.querySelectorAll('input')].some((node) => [...(node.labels ?? [])].some((label) => label.textContent?.trim().replace(/\\s+\\*$/, '') === 'Game name') && node.value === 'P6 Random Owner')", "Random manual Name retained in editor");
        await wait("document.body.innerText.includes('Valid — no issues found.')", "Random validation");
        await snapshot("08-random-before-create");
        await click("Create Project");
        await wait("document.body.innerText.includes('Close project')", "Random Workspace");
        await wait("document.body.innerText.includes('P6 Random Owner')", "Random Workspace identity");
        note("OBSERVE seeded Random persisted, registered, and opened in Workspace.");
        await snapshot("09-random-workspace");
        await exercise("Random", "10-random");
        await click("Close project");
        await wait("document.body.innerText.includes('Design Your Game')", "Design Game after Random");
        await click("Projects");
        await wait("document.body.innerText.includes('P6 Recommended Owner') && document.body.innerText.includes('P6 Random Owner')", "registered projects before restart");
        await snapshot("11-projects-before-restart");
    }
    note(`COMPLETE ${phase}.`);
    await writeFile(resolve(output, `${phase}-browser-transcript.txt`), `${log.join("\n")}\n`);
    cdp.close();
}

run().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, `${phase}-browser-transcript.txt`), `${log.join("\n")}\n`);
    process.exit(1);
});

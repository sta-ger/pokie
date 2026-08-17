import fs from "node:fs/promises";

const evidenceDir = new URL(".", import.meta.url);
const projectKind = process.argv[2] ?? "ts-package";
const pages = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = pages.find((candidate) => candidate.type === "page" && candidate.url.includes("127.0.0.1:4590"));
if (!page) throw new Error("No Studio page was available in Chrome.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, {once: true});
    socket.addEventListener("error", reject, {once: true});
});
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
        pending.delete(message.id);
        resolve(message);
    }
});
function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, (message) => message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result));
        socket.send(JSON.stringify({id, method, params}));
    });
}
async function expression(source) {
    const result = await cdp("Runtime.evaluate", {expression: source, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
}
async function waitFor(check, description, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}.`);
}
async function elementBox(query) {
    const box = await expression(`(() => { const el = ${query}; if (!el) return null; const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, text: el.innerText || el.value || el.getAttribute('aria-label')}; })()`);
    if (!box || box.width <= 0 || box.height <= 0) throw new Error(`No visible element for ${query}`);
    return box;
}
async function click(query) {
    let box = await elementBox(query);
    for (let attempt = 0; attempt < 6 && (box.y < 80 || box.y > 1120); attempt++) {
        await cdp("Input.dispatchMouseEvent", {type: "mouseWheel", x: 720, y: 600, deltaX: 0, deltaY: box.y < 80 ? -700 : 700});
        await new Promise((resolve) => setTimeout(resolve, 100));
        box = await elementBox(query);
    }
    if (box.y < 0 || box.y > 1200) throw new Error(`Could not scroll ${query} into the visible browser viewport.`);
    await cdp("Input.dispatchMouseEvent", {type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1});
    await cdp("Input.dispatchMouseEvent", {type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1});
}
async function replaceText(query, value) {
    const box = await elementBox(query);
    await cdp("Input.dispatchMouseEvent", {type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1});
    await cdp("Input.dispatchMouseEvent", {type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1});
    await cdp("Input.dispatchKeyEvent", {type: "rawKeyDown", windowsVirtualKeyCode: 65, code: "KeyA", key: "a", modifiers: 2});
    await cdp("Input.dispatchKeyEvent", {type: "keyUp", windowsVirtualKeyCode: 65, code: "KeyA", key: "a", modifiers: 2});
    await cdp("Input.insertText", {text: value});
}
async function screenshot(name) {
    const image = await cdp("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
    await fs.writeFile(new URL(name, evidenceDir), Buffer.from(image.data, "base64"));
}

await cdp("Page.enable");
await cdp("Runtime.enable");
const tab = projectKind === "stake-export" ? "exportDeploy" : "simulation";
await cdp("Page.navigate", {url: `http://127.0.0.1:4590/#/project/${tab}`});
await new Promise((resolve) => setTimeout(resolve, 1000));
await fs.writeFile(new URL(`browser-debug-${projectKind}.txt`, evidenceDir), await expression("document.body.innerText"));
if (projectKind === "stake-export") {
    await waitFor(() => expression("document.body.innerText.includes('Generate outcome library')"), "the outcome-library generation action");
    const libraryAlreadyGenerated = await expression("document.body.innerText.includes('Generated') && document.body.innerText.includes('outcomes for mode')");
    if (!libraryAlreadyGenerated) {
        await click("Array.from(document.querySelectorAll('button')).find((el) => el.innerText.trim().startsWith('Generate outcome library'))");
        await waitFor(() => expression("document.body.innerText.includes('Generated') && document.body.innerText.includes('outcomes for mode')"), "the generated canonical outcome library");
    }
    await waitFor(() => expression("document.body.innerText.includes('Run Stake Engine Export')"), "the Stake Engine export action");
    await waitFor(() => expression("(() => { const b = Array.from(document.querySelectorAll('button')).find((el) => el.innerText.trim().startsWith('Run Stake Engine Export')); return b !== undefined && !b.disabled; })()"), "the enabled Stake Engine export action");
    await screenshot("03-stake-export-configure.png");
    await click("Array.from(document.querySelectorAll('button')).find((el) => el.innerText.trim().startsWith('Run Stake Engine Export'))");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await fs.writeFile(new URL("browser-debug-stake-export-after-action.txt", evidenceDir), await expression("document.body.innerText"));
    await waitFor(() => expression("document.body.innerText.includes('Exported') && document.body.innerText.includes('file(s)')"), "the completed Stake Engine export");
    await screenshot("04-stake-export-complete.png");
    const text = await expression("document.body.innerText");
    await fs.writeFile(new URL("browser-transcript-stake-export.txt", evidenceDir), `URL: ${await expression("location.href")}\n\n${text}\n`);
    socket.close();
    process.exit(0);
}
if (projectKind === "stake-guidance") {
    await waitFor(
        () => expression("document.body.innerText.includes('Stake Engine export') && document.body.innerText.includes(\"isn't available\")"),
        "the Stake Engine Simulation capability guidance",
    );
    await screenshot("05-stake-simulation-guidance.png");
    const text = await expression("document.body.innerText");
    await fs.writeFile(new URL("browser-transcript-stake-guidance.txt", evidenceDir), `URL: ${await expression("location.href")}\n\n${text}\n`);
    socket.close();
    process.exit(0);
}
await waitFor(
    () => expression(projectKind === "outcome-library" ? "document.body.innerText.includes('Outcome library')" : "document.body.innerText.includes('P6-10 Finite Slot')"),
    `the ${projectKind} dashboard`,
);
await click("Array.from(document.querySelectorAll('button')).find((el) => el.innerText.trim() === 'Simulation')");
await waitFor(() => expression("document.body.innerText.includes('Run Simulation')"), "the Simulation form");
await screenshot(`01-${projectKind}-configure.png`);
await replaceText("Array.from(document.querySelectorAll('label')).find((el) => el.innerText.trim() === 'Rounds')?.control || document.querySelector('input')", "24");
await click("Array.from(document.querySelectorAll('button')).find((el) => el.innerText.trim() === 'Run Simulation')");
await waitFor(() => expression("document.body.innerText.includes('RTP') && document.body.innerText.includes('Recent runs')"), `the ${projectKind} simulation report`);
await screenshot(`02-${projectKind}-complete.png`);
const text = await expression("document.body.innerText");
await fs.writeFile(new URL(`browser-transcript-${projectKind}.txt`, evidenceDir), `URL: ${await expression("location.href")}\n\n${text}\n`);
socket.close();

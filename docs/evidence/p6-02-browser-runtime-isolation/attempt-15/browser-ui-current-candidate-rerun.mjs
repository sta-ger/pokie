#!/usr/bin/env node
/**
 * Host-side P6-02 browser audit. CDP is restricted to observing rendered
 * controls/text, screenshot capture, and physical mouse/keyboard input.
 * It does not call Studio APIs, mutate the DOM, or inject application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P6_STUDIO_URL ?? "http://127.0.0.1:41206";
const devtools = process.env.P6_DEVTOOLS_URL ?? "http://127.0.0.1:9229";
const output = resolve(process.env.P6_AUDIT_OUTPUT ?? "docs/evidence/p6-02-browser-runtime-isolation");
const evidenceRoot = resolve("docs/evidence/p6-02-browser-runtime-isolation");
const projectA = resolve(process.env.P6_PROJECT_A ?? resolve(evidenceRoot, "fixtures/project-a"));
const projectB = resolve(process.env.P6_PROJECT_B ?? resolve(evidenceRoot, "fixtures/project-b"));
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    // Attach to the fresh Chrome process' visible initial tab. This is the
    // browser we launched specifically for this audit; keeping that one tab
    // avoids creating a second unobserved tab through DevTools.
    const pages = await requestJson(`${devtools}/json/list`);
    const target = pages.find((page) => page.type === "page");
    if (!target?.webSocketDebuggerUrl) throw new Error("Fresh Chrome exposed no debuggable page target.");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let requestId = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id === undefined || !pending.has(message.id)) return;
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++requestId;
        pending.set(id, {resolve: accept, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
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
    const pointFor = async (expression) =>
        evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent?.trim()}; })()`);
    const control = (label) =>
        pointFor(`[...document.querySelectorAll('button,a,[role="button"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const nav = (label) => pointFor(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)})`);
    const input = (label) =>
        pointFor(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const option = (label) =>
        pointFor(`[...document.querySelectorAll('[role="option"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const click = async (target, description, reselect) => {
        if (!target?.ok) throw new Error(`No visible ${description}: ${JSON.stringify(target)}`);
        const viewportHeight = await evaluate("window.innerHeight");
        if (target.y < 0 || target.y > viewportHeight) {
            const deltaY = target.y - viewportHeight / 2;
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: Math.max(1, target.x), y: Math.max(1, viewportHeight / 2), deltaX: 0, deltaY});
            note(`SCROLL browser viewport by ${Math.round(deltaY)}px to reach ${description}`);
            await sleep(350);
            target = reselect ? await reselect() : {...target, y: target.y - deltaY};
            if (!target?.ok) throw new Error(`No visible ${description} after scrolling.`);
        }
        const observedAtPoint = await evaluate(`(() => { const e = document.elementFromPoint(${target.x}, ${target.y}); return e ? {tag:e.tagName,text:e.textContent?.trim()} : null; })()`);
        note(`OBSERVE pointer target for ${description}: ${JSON.stringify(observedAtPoint)}`);
        await cdp.send("Page.bringToFront");
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: target.x, y: target.y});
        await sleep(50);
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: target.x, y: target.y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse"});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: target.x, y: target.y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse"});
        note(`CLICK ${description} at rendered coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
        await sleep(450);
    };
    const replaceInput = async (label, value) => {
        await click(await input(label), `input ${JSON.stringify(label)}`);
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2});
        await cdp.send("Input.insertText", {text: value});
        // Chrome's platform text insertion occasionally lands after a Mantine
        // focus transition in headless mode. A key "char" event is still
        // ordinary keyboard input (not a DOM assignment); use it only when
        // the rendered field did not receive the first keyboard insertion.
        await sleep(100);
        const received = await evaluate(`(() => { const e = [...document.querySelectorAll('input')].find((candidate) => (candidate.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(candidate.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && candidate.getClientRects().length > 0); return e?.value === ${JSON.stringify(value)}; })()`);
        if (!received) {
            for (const character of value) {
                await cdp.send("Input.dispatchKeyEvent", {type: "char", text: character, unmodifiedText: character});
            }
        }
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`);
        await sleep(300);
    };
    const chooseMode = async (modeName) => {
        await click(await input("Outcome library mode"), "Outcome library mode picker");
        await wait(`[...document.querySelectorAll('[role="option"]')].some((e) => e.textContent?.trim() === ${JSON.stringify(modeName)} && e.getClientRects().length > 0)`, `visible ${modeName} mode option`);
        await click(await option(modeName), `${modeName} mode option`);
        await wait(`[...document.querySelectorAll('input')].some((e) => (e.getAttribute('aria-label') === 'Outcome library mode' || [...(e.labels ?? [])].some((l) => l.textContent?.trim() === 'Outcome library mode')) && e.value === ${JSON.stringify(modeName)})`, `${modeName} visibly selected`);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
        await writeFile(resolve(output, `${name}-url.txt`), `${await evaluate("location.href")}\n`);
        note(`CAPTURE ${name}.png, ${name}-visible-text.txt, and ${name}-url.txt`);
    };
    const browserBack = async (description) => {
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, modifiers: 1});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, modifiers: 1});
        note(`KEYBOARD Alt+Left browser Back: ${description}`);
        await sleep(550);
        note(`OBSERVE location after Back: ${await evaluate("location.href")}`);
    };
    const browserForward = async (description) => {
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 1});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 1});
        note(`KEYBOARD Alt+Right browser Forward: ${description}`);
        await sleep(550);
        note(`OBSERVE location after Forward: ${await evaluate("location.href")}`);
    };
    const activateWithKeyboard = async (description, tabPresses) => {
        for (let index = 0; index < tabPresses; index++) {
            await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
            await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
        }
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13});
        note(`KEYBOARD Tab×${tabPresses}, Enter activates ${description}`);
        await sleep(500);
    };
    const scrollToPageEnd = async (description) => {
        await cdp.send("Input.dispatchKeyEvent", {type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35});
        await cdp.send("Input.dispatchKeyEvent", {type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35});
        note(`KEYBOARD End scrolls to ${description}`);
        await sleep(350);
    };

    note(`START fresh Chrome session against candidate Studio ${studio}`);
    // A is a real two-mode outcome-library bundle supplied as the Studio command's
    // public startup target. Outcome libraries intentionally have no Home "Open"
    // button, so navigate to the initial visible project route rather than using a
    // private server call.
    await cdp.send("Page.navigate", {url: `${studio}/#/project/play`});
    note("NAVIGATE public initial Project A Play URL");
    await wait("document.body.innerText.includes('Overview') && document.body.innerText.includes('Play')", "Project A dashboard");
    await wait("document.body.innerText.includes('New session')", "Project A Play setup");
    await wait("document.body.innerText.includes('Outcome library mode')", "Project A visible outcome-library mode picker");
    await chooseMode("buyFeature");
    await replaceInput("Seed (optional)", "p6-a-visible-session");
    await click(await control("New session"), "Project A New session");
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Spin' && !e.disabled)", "Project A visible Spin action");
    await click(await control("Spin"), "Project A Spin");
    await wait("document.body.innerText.includes('Credits') && document.body.innerText.includes('Round detail')", "Project A visible session and played-round state");
    await snapshot("05-project-a-play-state");

    await click(await control("POKIE Studio"), "Studio Home breadcrumb from Project A");
    await wait("document.body.innerText.includes('Design Game')", "Home after closing Project A");
    await click(await nav("Projects"), "Home Projects navigation");
    await wait("document.body.innerText.includes('Import Project')", "Projects UI for Project B");
    await scrollToPageEnd("the visible Project B Import controls");
    await replaceInput("Location", projectB);
    await click(await control("Detect"), "Project B Detect");
    await wait("document.body.innerText.includes('Detected a Package')", "Project B package detection");
    await click(await control("Register"), "Project B Register");
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Open')", "Project B visible Open action");
    await click(await control("Open"), "Project B Open", () => control("Open"));
    await wait("document.body.innerText.includes('Playable Game With Bonus Round')", "Project B dashboard");
    await click(await nav("Play"), "Project B Play navigation");
    await wait("document.body.innerText.includes('New session')", "Project B fresh Play setup with no visible A round");
    await snapshot("06-project-b-fresh-play-state");
    await replaceInput("Seed (optional)", "p6-b-visible-session");
    await click(await control("New session"), "Project B New session");
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Spin' && !e.disabled)", "Project B visible Spin action");
    await snapshot("07-project-b-session-state");

    // Traverse physical browser history until the visible Project A identity returns. The precise
    // count is observed rather than assumed because opening or closing a project may add a route.
    let restoredA = false;
    for (let step = 1; step <= 8; step++) {
        await browserBack(`history step ${step} from Project B`);
        if (await evaluate("document.body.innerText.includes('Browser Multi-mode Library')")) {
            restoredA = true;
            note(`OBSERVE Project A visible after Back at history step ${step}`);
            break;
        }
    }
    await snapshot("08-browser-back-result");
    if (!restoredA) throw new Error("Browser Back never restored Project A's visible runtime context.");

    let restoredB = false;
    for (let step = 1; step <= 8; step++) {
        await browserForward(`history step ${step} toward Project B`);
        if (await evaluate("document.body.innerText.includes('Playable Game With Bonus Round')")) {
            restoredB = true;
            note(`OBSERVE Project B visible after Forward at history step ${step}`);
            break;
        }
    }
    await snapshot("09-browser-forward-result");
    if (!restoredB) throw new Error("Browser Forward never restored Project B's visible runtime context.");
    note("COMPLETE browser A → B → Back audit.");
    await writeFile(resolve(output, "09-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "09-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

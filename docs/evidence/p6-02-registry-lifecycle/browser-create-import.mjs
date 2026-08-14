#!/usr/bin/env node
/**
 * Host-side P6-02 registry lifecycle verification, phase 1.
 *
 * CDP is used only to observe rendered text/pixels and to send ordinary mouse
 * and keyboard input to a fresh local Chrome. It neither calls Studio APIs nor
 * assigns DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P6_STUDIO_URL;
const devtools = process.env.P6_DEVTOOLS_URL;
const output = resolve("docs/evidence/p6-02-registry-lifecycle");
const relativeExternal = "docs/evidence/p6-02-registry-lifecycle/fixtures/external-project";
const absoluteExternal = resolve(relativeExternal);
const symlinkExternal = resolve("docs/evidence/p6-02-registry-lifecycle/fixtures/external-project-alias");
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const page = (await getJson(`${devtools}/json/list`)).find((target) => target.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("Fresh Chrome exposed no page target.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id === undefined || !pending.has(response.id)) return;
        const request = pending.get(response.id);
        pending.delete(response.id);
        response.error ? request.reject(new Error(JSON.stringify(response.error))) : request.resolve(response.result);
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const requestId = ++id;
        pending.set(requestId, {resolve: accept, reject});
        socket.send(JSON.stringify({id: requestId, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    if (!studio || !devtools) throw new Error("P6_STUDIO_URL and P6_DEVTOOLS_URL are required.");
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const wait = async (expression, description, timeout = 12000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
        note(`OBSERVE ${description}`);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
        await writeFile(resolve(output, `${name}-url.txt`), `${await evaluate("location.href")}\n`);
        note(`CAPTURE ${name}.png, ${name}-visible-text.txt, and ${name}-url.txt`);
    };
    const target = async (expression) => evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent?.trim()}; })()`);
    const button = (label) => target(`[...document.querySelectorAll('button,a,[role="button"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const nav = (label) => target(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const field = (label) => target(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const click = async (value, description, locateAgain) => {
        for (let attempt = 1; attempt <= 12; attempt += 1) {
            if (!value?.ok) throw new Error(`No rendered ${description}`);
            const viewport = await evaluate("({width:window.innerWidth,height:window.innerHeight})");
            if (value.x < 8 || value.x > viewport.width - 8 || value.y < 8 || value.y > viewport.height - 8) {
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:Math.max(1, Math.min(viewport.width - 1, value.x)), y:Math.max(1, Math.min(viewport.height - 1, value.y)), deltaX:0, deltaY:value.y - viewport.height / 2});
                note(`SCROLL to rendered ${description}`);
                await sleep(350);
                value = locateAgain ? await locateAgain() : value;
                continue;
            }
            await cdp.send("Page.bringToFront");
            const hit = await evaluate(`(() => { const e=document.elementFromPoint(${value.x},${value.y}); return e ? {tag:e.tagName,text:e.textContent?.trim()} : null; })()`);
            note(`OBSERVE pointer target for ${description}: ${JSON.stringify(hit)}`);
            if (hit) {
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:value.x, y:value.y});
                await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:value.x, y:value.y, button:"left", buttons:1, clickCount:1, pointerType:"mouse"});
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:value.x, y:value.y, button:"left", buttons:0, clickCount:1, pointerType:"mouse"});
                note(`CLICK ${description} at rendered coordinates (${Math.round(value.x)}, ${Math.round(value.y)})`);
                await sleep(500);
                return;
            }
            await sleep(250);
            value = locateAgain ? await locateAgain() : value;
        }
        throw new Error(`No browser pointer target for rendered ${description}`);
    };
    const type = async (label, value) => {
        await click(await field(label), `input ${JSON.stringify(label)}`, () => field(label));
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        await sleep(150);
        const received = await evaluate(`(() => { const e=[...document.querySelectorAll('input')].find((x) => (x.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(x.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && x.getClientRects().length > 0); return e?.value === ${JSON.stringify(value)}; })()`);
        if (!received) for (const character of value) await cdp.send("Input.dispatchKeyEvent", {type:"char", text:character, unmodifiedText:character});
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`);
        await sleep(300);
    };
    const rowCount = () => evaluate("document.querySelectorAll('tbody tr').length");
    const importAlias = async (alias, expectedRows) => {
        await type("Location", alias);
        await click(await button("Detect"), `Detect ${alias}`, () => button("Detect"));
        await wait("document.body.innerText.includes('Detected a Package')", `visible Package detection for ${alias}`);
        await click(await button("Register"), `Register ${alias}`, () => button("Register"));
        await wait(`document.querySelectorAll('tbody tr').length === ${expectedRows}`, `exactly ${expectedRows} rendered registry rows after ${alias}`);
        note(`OBSERVE rows after alias ${alias}: ${await rowCount()}`);
    };

    note(`START fresh Chrome session against fresh candidate Studio ${studio}`);
    await cdp.send("Page.navigate", {url: `${studio}/#/home/design`});
    note("NAVIGATE public Studio Design Game route");
    await wait("document.body.innerText.includes('New Blueprint')", "rendered guided Design Game");
    await click(await button("New Blueprint"), "New Blueprint", () => button("New Blueprint"));
    await wait("document.body.innerText.includes('Generate random')", "rendered New blueprint dialog");
    await click(await button("Generate random"), "Generate random", () => button("Generate random"));
    await click(await button("Generate"), "Generate random blueprint", () => button("Generate"));
    await wait("document.body.innerText.includes('Generated')", "rendered valid generated blueprint");
    await click(await button("Use this blueprint"), "Use this blueprint", () => button("Use this blueprint"));
    await wait("document.body.innerText.includes('Ready to build') && document.body.innerText.includes('Valid — no issues found.')", "guided validation settles after random generation");
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Save' && !e.disabled)", "enabled managed Save action");
    await click(await button("Save"), "managed Save", () => button("Save"));
    await wait("document.body.innerText.includes('Saved to')", "rendered managed save success");
    const managedPath = await evaluate("(() => { const match=document.body.innerText.match(/Saved to \\\"([^\\\"]+)\\\"/); return match?.[1]; })()");
    if (!managedPath) throw new Error("Could not observe the rendered managed project path.");
    await writeFile(resolve(output, "04-managed-project-path.txt"), `${managedPath}\n`);
    note(`OBSERVE managed project path from rendered success: ${managedPath}`);
    await snapshot("04-managed-save-success");

    await click(await nav("Projects"), "Projects navigation", () => nav("Projects"));
    await wait("document.body.innerText.includes('Your projects')", "rendered Projects registry");
    await wait("document.body.innerText.includes('Managed') && document.querySelectorAll('tbody tr').length === 1", "one managed auto-registered project row");
    await snapshot("05-managed-auto-registered");

    await importAlias(relativeExternal, 2);
    await importAlias(absoluteExternal, 2);
    await importAlias(symlinkExternal, 2);
    await wait("document.body.innerText.includes('Managed') && document.body.innerText.includes('Registered') && document.querySelectorAll('tbody tr').length === 2", "managed and canonical external rows after relative/absolute/symlink imports");
    await snapshot("06-import-aliases-deduplicated");

    await click(await button("Open"), "external project's Open as Project action", () => button("Open"));
    await wait("document.body.innerText.includes('Registry Lifecycle Fixture') && document.body.innerText.includes('registry-lifecycle-fixture')", "external project dashboard shows distinct game name and id");
    await snapshot("07-open-as-project-name-id");
    await click(await button("POKIE Studio"), "Studio Home breadcrumb", () => button("POKIE Studio"));
    await wait("document.body.innerText.includes('Design Game')", "Home after Open as Project");
    await click(await nav("Projects"), "Projects navigation after open", () => nav("Projects"));
    await wait("document.querySelectorAll('tbody tr').length === 2", "two registry rows retained after Open as Project");
    await snapshot("08-open-refreshes-recent-order");

    await writeFile(resolve(output, "09-browser-action-transcript-phase1.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, "09-browser-action-transcript-phase1.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

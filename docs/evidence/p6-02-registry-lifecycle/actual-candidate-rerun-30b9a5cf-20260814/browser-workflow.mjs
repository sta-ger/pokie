#!/usr/bin/env node
/**
 * Independent P6-02 UI verifier. CDP is solely a visible-browser transport:
 * it reads rendered text/geometry and sends mouse/keyboard events. It makes
 * no Studio product API calls and neither injects DOM nor application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const phase = process.env.P6_PHASE;
const studio = process.env.P6_STUDIO_URL;
const devtools = process.env.P6_DEVTOOLS_URL;
const output = resolve(process.env.P6_AUDIT_OUTPUT ?? ".");
const relocated = resolve(process.env.P6_RELOCATED_MANAGED ?? "relocated/blueprint.json");
const notes = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const note = (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    notes.push(line);
    process.stdout.write(`${line}\n`);
};

async function connect() {
    const targets = await (await fetch(`${devtools}/json/list`)).json();
    const target = targets.find((item) => item.type === "page");
    if (!target?.webSocketDebuggerUrl) throw new Error("Chrome did not expose a page target.");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
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
    if (!phase || !studio || !devtools) throw new Error("P6_PHASE, P6_STUDIO_URL, and P6_DEVTOOLS_URL are required.");
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
    const snapshot = async (name) => {
        const image = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(image.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
        await writeFile(resolve(output, `${name}-url.txt`), `${await evaluate("location.href")}\n`);
        note(`CAPTURE ${name}.png, ${name}-visible-text.txt, and ${name}-url.txt`);
    };
    const locate = async (expression) => evaluate(`(() => { const e=(${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,tag:e.tagName,text:e.textContent?.trim()}; })()`);
    const button = (label) => locate(`[...document.querySelectorAll('button,a,[role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const lastButton = (label) => locate(`[...document.querySelectorAll('button,a,[role="button"]')].filter((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0).at(-1)`);
    const nav = (label) => locate(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const field = (label) => locate(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const managedAction = (label) => locate(`(() => { const row=[...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Managed')); return row && [...row.querySelectorAll('button,a,[role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled); })()`);
    const click = async (target, description, relocalize) => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            if (!target?.ok) throw new Error(`No rendered ${description}`);
            const viewport = await evaluate("({width:window.innerWidth,height:window.innerHeight})");
            if (target.y < 8 || target.y > viewport.height - 8 || target.x < 8 || target.x > viewport.width - 8) {
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:Math.max(1, Math.min(viewport.width - 1, target.x)), y:Math.max(1, Math.min(viewport.height - 1, target.y)), deltaX:0, deltaY:target.y - viewport.height / 2});
                note(`SCROLL to rendered ${description}`);
                await sleep(300);
                target = await relocalize();
                continue;
            }
            await cdp.send("Page.bringToFront");
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:target.x, y:target.y});
            await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:target.x, y:target.y, button:"left", buttons:1, clickCount:1, pointerType:"mouse"});
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:target.x, y:target.y, button:"left", buttons:0, clickCount:1, pointerType:"mouse"});
            note(`CLICK ${description} at rendered ${target.tag} coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
            await sleep(500);
            return;
        }
        throw new Error(`Could not click ${description}`);
    };
    const type = async (label, value) => {
        await click(await field(label), `input ${JSON.stringify(label)}`, () => field(label));
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`);
        await sleep(250);
    };
    if (phase === "create") {
        note(`START freshly launched Studio/client managed-save workflow against ${studio}`);
        await cdp.send("Page.navigate", {url:`${studio}/#/home/design`});
        note("NAVIGATE public Studio Design Game route");
        await wait("document.body.innerText.includes('New Blueprint')", "rendered Design Game");
        await click(await button("New Blueprint"), "New Blueprint", () => button("New Blueprint"));
        await wait("document.body.innerText.includes('Generate random')", "rendered New Blueprint dialog");
        await click(await button("Generate random"), "Generate random", () => button("Generate random"));
        await click(await button("Generate"), "Generate random blueprint", () => button("Generate"));
        await wait("document.body.innerText.includes('Generated')", "rendered generated Blueprint");
        await click(await button("Use this blueprint"), "Use this blueprint", () => button("Use this blueprint"));
        await wait("document.body.innerText.includes('Valid — no issues found.')", "valid Blueprint");
        await click(await button("Save"), "managed Save", () => button("Save"));
        await wait("document.body.innerText.includes('Saved to')", "rendered managed save success");
        const managedPath = await evaluate("(() => document.body.innerText.match(/Saved to \\\"([^\\\"]+)\\\"/)?.[1])()");
        if (!managedPath) throw new Error("Could not read managed blueprint path from visible Save result.");
        await writeFile(resolve(output, "04-managed-project-path.txt"), `${managedPath}\n`);
        note(`OBSERVE managed project path from visible Save result: ${managedPath}`);
        await snapshot("04-managed-save-success");
        await click(await nav("Projects"), "Projects navigation", () => nav("Projects"));
        await wait("document.body.innerText.includes('Your projects') && document.body.innerText.includes('Managed')", "freshly saved managed registry row rendered without browser reload");
        await snapshot("05-managed-project-visible");
    } else if (phase === "relocate") {
        note("RELOAD visible Projects page through browser Ctrl+R after host-side external move");
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"r", code:"KeyR", windowsVirtualKeyCode:82, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"r", code:"KeyR", windowsVirtualKeyCode:82, modifiers:2});
        await wait("document.body.innerText.includes('Your projects') && document.body.innerText.includes('(missing)') && document.body.innerText.includes('Relocate')", "moved managed row visibly marked missing with Relocate");
        await snapshot("07-moved-managed-missing-relocate");
        await click(await managedAction("Relocate"), "Relocate missing managed project", () => managedAction("Relocate"));
        await wait("document.body.innerText.includes('New location')", "rendered Relocate form");
        await type("New location", relocated);
        await click(await lastButton("Relocate"), "Relocate confirmation", () => lastButton("Relocate"));
        await wait(`document.body.innerText.includes('Managed') && document.body.innerText.includes(${JSON.stringify(relocated)}) && !document.body.innerText.includes('(missing)') && document.querySelectorAll('tbody tr').length === 1`, "relocated canonical managed record restored without duplicate");
        await snapshot("08-relocated-managed-no-duplicate");
    } else if (phase === "restart") {
        note(`START fresh Studio/client after restart against ${studio}`);
        await cdp.send("Page.navigate", {url:`${studio}/#/home/projects`});
        note("NAVIGATE public Projects route in restarted Studio");
        await wait(`document.body.innerText.includes('Your projects') && document.body.innerText.includes('Managed') && document.body.innerText.includes(${JSON.stringify(relocated)}) && !document.body.innerText.includes('(missing)') && document.body.innerText.includes('Open') && document.querySelectorAll('tbody tr').length === 1`, "truthful relocated managed status persisted after Studio restart");
        await snapshot("10-after-studio-restart-truthful-status");
    } else if (phase === "observe") {
        note("OBSERVE current rendered Studio state after the bounded missing-status wait");
        await snapshot("07-post-reload-missing-status-timeout");
    } else if (phase === "restart-observe") {
        note(`OBSERVE fresh Studio/client after restart against ${studio}`);
        await cdp.send("Page.navigate", {url:`${studio}/#/home/projects`});
        note("NAVIGATE public Projects route in restarted Studio");
        await wait("document.body.innerText.includes('Your projects')", "rendered Projects route after Studio restart");
        await sleep(1000);
        await snapshot("10-after-studio-restart-status");
    } else if (phase === "complete-relocate") {
        note("COMPLETE rendered Relocate form after verifying its visible state");
        await wait("document.body.innerText.includes('New location')", "rendered Relocate form");
        await type("New location", relocated);
        await click(await lastButton("Relocate"), "Relocate confirmation", () => lastButton("Relocate"));
        await wait(`document.body.innerText.includes('Managed') && document.body.innerText.includes(${JSON.stringify(relocated)}) && !document.body.innerText.includes('(missing)') && document.querySelectorAll('tbody tr').length === 1`, "relocated canonical managed record restored without duplicate");
        await snapshot("08-relocated-managed-no-duplicate");
    } else if (phase === "remount-after-move") {
        note("NAVIGATE through visible Studio navigation after a second host-side external move");
        await click(await nav("Design Game"), "Design Game navigation", () => nav("Design Game"));
        await wait("document.body.innerText.includes('Design Game')", "rendered Design Game after external move");
        await click(await nav("Projects"), "Projects navigation", () => nav("Projects"));
        await wait("document.body.innerText.includes('Your projects') && document.body.innerText.includes('(missing)') && document.body.innerText.includes('Relocate')", "remounted Projects visibly refreshes moved managed row to missing with Relocate");
        await snapshot("15-remounted-projects-missing-relocate");
    } else if (phase === "relocate-second") {
        note("RELOCATE the second visibly missing managed row through rendered Studio controls");
        await click(await managedAction("Relocate"), "Relocate second missing managed project", () => managedAction("Relocate"));
        await wait("document.body.innerText.includes('New location')", "rendered second Relocate form");
        await type("New location", relocated);
        await click(await lastButton("Relocate"), "second Relocate confirmation", () => lastButton("Relocate"));
        await wait(`document.body.innerText.includes('Managed') && document.body.innerText.includes(${JSON.stringify(relocated)}) && !document.body.innerText.includes('(missing)') && document.querySelectorAll('tbody tr').length === 1`, "second relocation restores canonical managed record without duplicate");
        await snapshot("16-second-relocated-managed-no-duplicate");
    } else {
        throw new Error(`Unknown P6_PHASE ${phase}`);
    }
    await writeFile(resolve(output, `browser-action-transcript-${phase}.txt`), `${notes.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive: true});
    await writeFile(resolve(output, `browser-action-transcript-${phase ?? "unknown"}.txt`), `${notes.join("\n")}\n`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Independent P6-02 host-browser rerun.  CDP is limited to observing pixels
 * and rendered text plus dispatching ordinary mouse/keyboard input.  It never
 * calls a Studio product endpoint or assigns application DOM/state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P6_STUDIO_URL;
const devtools = process.env.P6_DEVTOOLS_URL;
const output = resolve("docs/evidence/p6-02-browser-runtime-isolation");
const projectA = resolve(output, "fixtures/project-a");
const projectB = resolve(output, "fixtures/project-b");
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
        const promise = pending.get(response.id);
        pending.delete(response.id);
        response.error ? promise.reject(new Error(JSON.stringify(response.error))) : promise.resolve(response.result);
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
    // Five seconds is ample for this local build and keeps a failed acceptance
    // assertion bounded, so the terminal transcript is written before the
    // external host command's observation window ends.
    const wait = async (expression, description, timeout = 5000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(200);
        }
        note(`OBSERVE ${description}`);
    };
    const target = async (expression) => evaluate(`(() => { const e = (${expression}); if (!e || e.disabled || e.getClientRects().length === 0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,tag:e.tagName,text:e.textContent?.trim()}; })()`);
    const button = (label) => target(`[...document.querySelectorAll('button,a,[role="button"],label')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const nav = (label) => target(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const field = (label) => target(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const click = async (value, description, locateAgain) => {
        for (let attempt = 1; attempt <= 8; attempt += 1) {
            if (!value?.ok) throw new Error(`No rendered ${description}`);
            const viewport = await evaluate("({width:window.innerWidth,height:window.innerHeight})");
            if (value.x < 8 || value.x > viewport.width - 8 || value.y < 8 || value.y > viewport.height - 8) {
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:Math.max(1, Math.min(viewport.width - 1, value.x)), y:Math.max(1, Math.min(viewport.height - 1, value.y)), deltaX:value.x - viewport.width / 2, deltaY:value.y - viewport.height / 2});
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
            note(`RETRY rendered ${description}: no browser hit target`);
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
        await sleep(120);
        const received = await evaluate(`(() => { const e=[...document.querySelectorAll('input')].find((x) => (x.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(x.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && x.getClientRects().length > 0); return e?.value === ${JSON.stringify(value)}; })()`);
        if (!received) for (const character of value) await cdp.send("Input.dispatchKeyEvent", {type:"char", text:character, unmodifiedText:character});
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`);
        await sleep(300);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}-visible-text.txt`), `${await evaluate("document.body.innerText")}\n`);
        await writeFile(resolve(output, `${name}-url.txt`), `${await evaluate("location.href")}\n`);
        note(`CAPTURE ${name}.png, ${name}-visible-text.txt, and ${name}-url.txt`);
    };
    const historyButton = async (direction, description) => {
        const button = direction === "back" ? "back" : "forward";
        const buttons = direction === "back" ? 8 : 16;
        await cdp.send("Page.bringToFront");
        // Use the browser's Back/Forward mouse buttons, not a synthetic Alt+Arrow chord. CDP key
        // events can make Chrome execute only the first Forward traversal after a route restoration;
        // these ordinary browser mouse buttons invoke the same native history command each time
        // without a DevTools history API or any application-side state change.
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:1, y:1, button, buttons, clickCount:1, pointerType:"mouse"});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:1, y:1, button, buttons:0, clickCount:1, pointerType:"mouse"});
        note(`MOUSE browser ${direction === "back" ? "Back" : "Forward"} button: ${description}`);
        await sleep(650);
    };
    const pageIdentity = async () => evaluate("({url:location.href,text:document.body.innerText})");
    const aPath = `/project/${encodeURIComponent(projectA)}/play`;
    const bPath = `/project/${encodeURIComponent(projectB)}/play`;

    note(`START fresh Chrome session against fresh candidate Studio ${studio}`);
    await cdp.send("Page.navigate", {url:`${studio}/#/project/play`});
    note("NAVIGATE public legacy unscoped Project A Play URL");
    // Capture the initial rendered route before its assertion.  This leaves a
    // browser-visible diagnostic if a fresh runtime regresses before the
    // normal Project A screenshot point, and is overwritten by the successful
    // capture below when the route becomes ready.
    await sleep(1200);
    await snapshot("00-legacy-project-a-play-before-route-scope-check");
    await wait("document.body.innerText.includes('Playable Game') && document.body.innerText.includes('New session')", "Project A rendered through the legacy Play route");
    await snapshot("00-legacy-project-a-play-before-route-scope-check");
    await wait(`location.hash === '#${aPath}'`, "legacy A history entry replaced by a project-scoped A Play route");
    await type("Seed (optional)", "p6-a-visible-session");
    await click(await button("New session"), "Project A New session", () => button("New session"));
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Spin' && !e.disabled)", "Project A session-only Spin action");
    await click(await button("Spin"), "Project A Spin", () => button("Spin"));
    await wait("document.body.innerText.includes('Round detail')", "Project A played-round state");
    await snapshot("01-project-a-legacy-entry-upgraded-and-played");

    await click(await button("POKIE Studio"), "Studio Home breadcrumb from Project A", () => button("POKIE Studio"));
    await wait("document.body.innerText.includes('Design Game')", "Home after closing Project A");
    await click(await nav("Projects"), "Home Projects navigation", () => nav("Projects"));
    await wait("document.body.innerText.includes('Import Project')", "rendered Project B import form");
    await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"End", code:"End", windowsVirtualKeyCode:35});
    await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"End", code:"End", windowsVirtualKeyCode:35});
    note("KEYBOARD End scrolls to visible Project B import controls");
    await sleep(300);
    await type("Location", projectB);
    await click(await button("Detect"), "Project B Detect", () => button("Detect"));
    await wait("document.body.innerText.includes('Detected a Package')", "Project B detected through rendered UI");
    await click(await button("Register"), "Project B Register", () => button("Register"));
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Open')", "Project B visible Open action");
    await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"End", code:"End", windowsVirtualKeyCode:35});
    await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"End", code:"End", windowsVirtualKeyCode:35});
    note("KEYBOARD End scrolls to rendered Project B Open action");
    await sleep(300);
    await click(await button("Open"), "Project B Open", () => button("Open"));
    await wait("document.body.innerText.includes('Playable Game With Bonus Round')", "Project B dashboard");
    await click(await nav("Play"), "Project B Play navigation", () => nav("Play"));
    await wait("document.body.innerText.includes('New session') && !document.body.innerText.includes('Round detail')", "fresh Project B Play state without Project A round");
    await snapshot("02-project-b-fresh-play");
    await type("Seed (optional)", "p6-b-visible-session");
    await click(await button("New session"), "Project B New session", () => button("New session"));
    await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Spin' && !e.disabled)", "Project B session-only Spin action");
    await snapshot("03-project-b-session");

    for (let step = 1; step <= 8; step += 1) {
        await historyButton("back", `step ${step} toward Project A`);
        const identity = await pageIdentity();
        note(`OBSERVE Back step ${step}: ${JSON.stringify({url:identity.url, hasA:identity.text.includes("Playable Game"), hasB:identity.text.includes("Playable Game With Bonus Round"), hasRound:identity.text.includes("Round detail")})}`);
        if (identity.url.includes(`#${aPath}`)) break;
    }
    // This captures the actual browser destination whether the assertion passes or fails, so a
    // negative verification result never inherits a screenshot from a previous rerun.
    await snapshot("04-browser-back-restores-project-a-scoped");
    await wait(`location.hash === '#${aPath}'`, "browser Back restores the project-scoped A Play route");
    await wait("document.body.innerText.includes('Playable Game') && !document.body.innerText.includes('Playable Game With Bonus Round')", "Project A identity with no Project B state rendered or actionable");

    for (let step = 1; step <= 8; step += 1) {
        await historyButton("forward", `step ${step} toward Project B`);
        const identity = await pageIdentity();
        note(`OBSERVE Forward step ${step}: ${JSON.stringify({url:identity.url, hasA:identity.text.includes("Playable Game"), hasB:identity.text.includes("Playable Game With Bonus Round"), hasRound:identity.text.includes("Round detail")})}`);
        if (identity.url.includes(`#${bPath}`)) break;
    }
    // Preserve the rendered Forward destination even when the following assertion fails.
    await snapshot("05-browser-forward-restores-project-b-scoped");
    await wait(`location.hash === '#${bPath}'`, "browser Forward restores the project-scoped B Play route");
    await wait("document.body.innerText.includes('Playable Game With Bonus Round') && !document.body.innerText.includes('Round detail')", "Project B fresh/session state without Project A round rendered or actionable");
    note("PASS: visible A → B → Back/Forward workflow stayed project-scoped with no cross-project rendered state.");
    await writeFile(resolve(output, "06-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, "06-browser-action-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exit(1);
});

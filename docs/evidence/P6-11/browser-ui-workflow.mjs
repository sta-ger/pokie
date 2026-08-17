#!/usr/bin/env node
/*
 * Independent host-browser evidence for P6-11. CDP is used strictly as a
 * browser input channel: locate visible controls, click their screen
 * coordinates, type via keyboard events, and capture the rendered result.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P6_11_STUDIO_URL ?? "http://127.0.0.1:4711";
const devtools = process.env.P6_11_DEVTOOLS_URL ?? "http://127.0.0.1:9331";
const output = resolve(process.env.P6_11_EVIDENCE_DIR ?? "docs/evidence/P6-11");
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    transcript.push(line);
    process.stdout.write(`${line}\n`);
}

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => {
        socket.once("open", accept);
        socket.once("error", reject);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id && pending.has(response.id)) {
            const {accept, reject} = pending.get(response.id);
            pending.delete(response.id);
            response.error ? reject(new Error(JSON.stringify(response.error))) : accept(response.result);
        }
    });
    const send = (method, params = {}) => new Promise((accept, reject) => {
        const id = ++sequence;
        pending.set(id, {accept, reject});
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
    const body = async () => evaluate("document.body.innerText");
    const waitUntil = async (expression, description, timeout = 120000) => {
        const deadline = Date.now() + timeout;
        while (!(await evaluate(expression))) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(250);
        }
    };
    const pointFor = async (expression, description) => {
        const point = await evaluate(expression);
        if (!point?.ok) throw new Error(`${description} not found in visible Studio UI: ${JSON.stringify(point?.available)}`);
        return point;
    };
    const clickPoint = async (point, description) => {
        // Bring an off-screen rendered control into the viewport with the same
        // browser wheel input a human uses. The locator is never clicked by
        // script; only its newly visible screen coordinates are dispatched.
        const viewportHeight = await evaluate("window.innerHeight");
        if (point.y < 0 || point.y > viewportHeight) {
            const deltaY = point.y - viewportHeight / 2;
            await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: Math.max(8, point.x), y: viewportHeight / 2, deltaX: 0, deltaY});
            await sleep(350);
            point = {...point, y: point.y - deltaY};
            note(`SCROLL browser wheel to rendered ${description}`);
        }
        await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
        await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
        note(`CLICK ${description} at rendered ${point.tag} coordinates (${Math.round(point.x)}, ${Math.round(point.y)})`);
        await sleep(450);
    };
    const click = async (label) => clickPoint(await pointFor(`(() => {
        const wanted = ${JSON.stringify(label)};
        const elements = [...document.querySelectorAll('button,a,[role="button"]')].filter((item) => item.getClientRects().length > 0 && !item.disabled);
        const element = elements.find((item) => item.textContent?.trim() === wanted);
        if (!element) return {ok:false, available:elements.map((item) => item.textContent?.trim()).filter(Boolean)};
        const r = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, x:r.left+r.width/2, y:r.top+r.height/2};
    })()`, `control ${JSON.stringify(label)}`), JSON.stringify(label));
    const clickCardButton = async (cardLabel, buttonLabel) => clickPoint(await pointFor(`(() => {
        const cardLabel = ${JSON.stringify(cardLabel)};
        const buttonLabel = ${JSON.stringify(buttonLabel)};
        const cards = [...document.querySelectorAll('div')]
            .filter((item) => item.getClientRects().length > 0 && item.innerText?.includes(cardLabel) && [...item.querySelectorAll('button')].some((button) => button.textContent?.trim() === buttonLabel && !button.disabled))
            .sort((left, right) => (left.innerText?.length ?? Infinity) - (right.innerText?.length ?? Infinity));
        const element = cards[0] ? [...cards[0].querySelectorAll('button')].find((button) => button.textContent?.trim() === buttonLabel && !button.disabled) : undefined;
        if (!element) return {ok:false, available:cards.slice(0,3).map((item) => item.innerText?.slice(0,300))};
        const r = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, x:r.left+r.width/2, y:r.top+r.height/2};
    })()`, `button ${JSON.stringify(buttonLabel)} in ${JSON.stringify(cardLabel)}`), `${JSON.stringify(buttonLabel)} in ${JSON.stringify(cardLabel)}`);
    const clickMatchingButton = async (pattern) => clickPoint(await pointFor(`(() => {
        const pattern = new RegExp(${JSON.stringify(pattern)});
        const elements = [...document.querySelectorAll('button')].filter((item) => item.getClientRects().length > 0 && !item.disabled);
        const element = elements.find((item) => pattern.test(item.textContent?.trim() ?? ""));
        if (!element) return {ok:false, available:elements.map((item) => item.textContent?.trim()).filter(Boolean)};
        const r = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, x:r.left+r.width/2, y:r.top+r.height/2};
    })()`, `button matching /${pattern}/`), `button matching /${pattern}/`);
    const input = async (label, value) => {
        const point = await pointFor(`(() => {
            const wanted = ${JSON.stringify(label)};
            const normalize = (text) => text?.trim().replace(/\\s+\\*$/, "");
            const element = [...document.querySelectorAll('input,textarea')].find((item) => item.getClientRects().length > 0 && (item.getAttribute('aria-label') === wanted || [...(item.labels ?? [])].some((itemLabel) => normalize(itemLabel.textContent) === wanted)));
            if (!element) return {ok:false, available:[...document.querySelectorAll('input,textarea')].filter((item) => item.getClientRects().length > 0).map((item) => item.getAttribute('aria-label') || [...(item.labels ?? [])].map((itemLabel) => itemLabel.textContent?.trim()).join('|'))};
            const r = element.getBoundingClientRect();
            return {ok:true, tag:element.tagName, x:r.left+r.width/2, y:r.top+r.height/2};
        })()`, `input ${JSON.stringify(label)}`);
        await clickPoint(point, `input ${JSON.stringify(label)}`);
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser mouse/keyboard`);
        await sleep(500);
    };
    const inputCard = async (cardLabel, value) => {
        const point = await pointFor(`(() => {
            const cardLabel = ${JSON.stringify(cardLabel)};
            const cards = [...document.querySelectorAll('div')]
                .filter((item) => item.getClientRects().length > 0 && item.innerText?.includes(cardLabel) && item.querySelector('input'))
                .sort((left, right) => (left.innerText?.length ?? Infinity) - (right.innerText?.length ?? Infinity));
            const element = cards[0]?.querySelector('input');
            if (!element) return {ok:false, available:cards.slice(0,3).map((item) => item.innerText?.slice(0,300))};
            const r = element.getBoundingClientRect(); return {ok:true,tag:element.tagName,x:r.left+r.width/2,y:r.top+r.height/2};
        })()`, `output input in ${JSON.stringify(cardLabel)}`);
        await clickPoint(point, `output input in ${JSON.stringify(cardLabel)}`);
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9});
        note(`INPUT output for ${JSON.stringify(cardLabel)}=${JSON.stringify(value)} through browser mouse/keyboard`);
        await sleep(700);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`);
        note(`CAPTURE ${name}.png and ${name}.txt`);
    };
    const nav = async (path) => {
        await cdp.send("Page.navigate", {url:`${studio}/#${path}`});
        note(`NAVIGATE public Studio URL #${path}`);
        await sleep(600);
    };

    note(`START fresh Chrome and public Studio UI at ${studio}`);
    await nav("/project/exportDeploy");
    await waitUntil("document.body.innerText.includes('Build/Export') && document.body.innerText.includes('Outcome library (republish)')", "Blueprint Build/Export cards");
    await snapshot("01-blueprint-preflight");
    await inputCard("Outcome library (republish)", resolve("docs/evidence/P6-11/artifacts/outcome-ui-final"));
    await clickCardButton("Outcome library (republish)", "Build");
    await waitUntil("document.body.innerText.includes('Built to') && document.body.innerText.includes('Open as Project')", "Outcome build result", 180000);
    note("OBSERVE the rendered registry-backed Outcome build completed and exposed its project follow-ups.");
    await snapshot("02-outcome-built");
    await click("Add to Projects");
    await waitUntil("document.body.innerText.includes('Added to Projects')", "Outcome project registration");
    note("OBSERVE the generated Outcome was registered through the visible Add to Projects action.");
    await click("Open as Project");
    await waitUntil("document.body.innerText.includes('Outcome Source') && document.body.innerText.includes('NATIVE OUTCOME LIBRARY')", "opened Outcome Source project");
    await snapshot("03-outcome-open-analysis");
    await click("Draw an outcome");
    await waitUntil("document.body.innerText.includes('Drew outcome')", "Outcome sample");
    note("OBSERVE the opened generated Outcome displayed exact analysis and a rendered sampled outcome.");
    await snapshot("04-outcome-sampled");

    await click("Play");
    await waitUntil("document.body.innerText.includes('New Play session')", "Outcome Play tab");
    await click("New Play session");
    await waitUntil("document.body.innerText.includes('Spin')", "Outcome Play session");
    await click("Spin");
    await waitUntil("!document.body.innerText.includes('No round played yet -- Spin to play.')", "Outcome Play spin");
    note("OBSERVE the opened Outcome completed a real Play session and Spin.");
    await snapshot("05-outcome-play");

    await click("Simulation");
    await waitUntil("document.body.innerText.includes('Run Simulation')", "Outcome Simulation tab");
    await input("Rounds", "25");
    await click("Run Simulation");
    await waitUntil("document.body.innerText.includes('RTP') && document.body.innerText.includes('Recent runs')", "Outcome Simulation result", 180000);
    note("OBSERVE the opened Outcome completed a rendered 25-round Simulation report.");
    await snapshot("06-outcome-simulation");

    await click("Replay");
    await waitUntil("document.body.innerText.includes('Session Spin')", "Outcome Replay tab");
    await clickPoint(await pointFor(`(() => {
        const element = [...document.querySelectorAll('input')].find((item) => item.type === 'radio' && item.value === 'spin' && item.getClientRects().length > 0);
        if (!element) return {ok:false, available:[...document.querySelectorAll('input')].map((item) => ({type:item.type,value:item.value}))};
        const r = element.getBoundingClientRect(); return {ok:true,tag:element.tagName,x:r.left+r.width/2,y:r.top+r.height/2};
    })()`, "Session Spin replay selector"), "Session Spin replay selector");
    await click("Refresh");
    await waitUntil("/Session 1.*Round/.test(document.body.innerText)", "recorded Outcome session spin");
    await clickMatchingButton("Session 1.*Round");
    await waitUntil("document.body.innerText.includes('Round Artifact') || document.body.innerText.includes('Round 1 of')", "inspected Outcome replay");
    note("OBSERVE Replay exposed and inspected the Play-produced Outcome round.");
    await snapshot("07-outcome-replay");

    // Return through Studio's project-scoped public history route to the source
    // Blueprint. Its Static export card is the UI that turns the registered
    // canonical Outcome into the Stake bundle.
    const blueprintRoot = process.env.P6_11_BLUEPRINT_ROOT ?? resolve("docs/evidence/P6-11/artifacts/blueprint-ui/p6-11-outcome.blueprint.json");
    await nav(`/project/${encodeURIComponent(blueprintRoot)}/exportDeploy`);
    await waitUntil("document.body.innerText.includes('P6-11 Outcome Slot') && document.body.innerText.includes('Run Stake Engine Export')", "Blueprint Stake export control");
    await click("Generate outcome library (base)");
    await waitUntil("document.body.innerText.includes('Generated ')", "registered Outcome library generation");
    note("OBSERVE Blueprint Build/Export generated its registry-discoverable canonical Outcome before Stake export.");
    await clickMatchingButton("Run Stake Engine Export");
    await waitUntil("document.body.innerText.includes('Exported ') || document.body.innerText.includes('Exporting will replace')", "Stake export result", 180000);
    if ((await body()).includes("Exporting will replace")) {
        await click("Overwrite");
        await waitUntil("document.body.innerText.includes('Exported ')", "overwritten Stake export", 180000);
    }
    note("OBSERVE the opened generated Outcome completed its visible Stake Engine export.");
    await snapshot("08-outcome-stake-export");
    note("COMPLETE browser UI workflow.");
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`);
    process.exitCode = 1;
});

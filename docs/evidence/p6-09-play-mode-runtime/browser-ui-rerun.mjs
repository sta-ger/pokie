#!/usr/bin/env node
/*
 * Independent P6-09 browser rerun.  CDP is limited to navigation, querying
 * rendered controls/text, coordinate mouse input, and screenshots.  It never
 * calls Studio APIs directly or mutates DOM/application state.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const output = resolve(process.env.P6_09_OUTPUT ?? "docs/evidence/p6-09-play-mode-runtime");
const studio = process.env.P6_09_STUDIO ?? "http://127.0.0.1:4919";
const devtools = process.env.P6_09_DEVTOOLS ?? "http://127.0.0.1:9239";
const transcript = [];
const findings = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function note(message) { const line = `[${new Date().toISOString()}] ${message}`; transcript.push(line); process.stdout.write(`${line}\n`); }
async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }

async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => { const message = JSON.parse(raw.toString()); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); } });
    const send = (method, params = {}) => new Promise((accept, reject) => { const id = ++sequence; pending.set(id, {resolve: accept, reject}); socket.send(JSON.stringify({id, method, params})); });
    await send("Page.enable"); await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true})).result.value;
    const body = async () => evaluate("document.body.innerText");
    const waitUntil = async (expression, description, timeout = 60000) => { const deadline = Date.now() + timeout; while (!(await evaluate(expression))) { if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`); await sleep(200); } };
    const locate = async (matcher) => evaluate(`(() => {
        const match = ${matcher};
        const candidates = [...document.querySelectorAll('button,a,label,summary,[role=button],[role=option],[role=tab],[role=radio],input[role=combobox]')];
        const element = candidates.find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled && match(candidate.textContent?.trim() ?? '', candidate.getAttribute('aria-label') ?? '', candidate));
        if (!element) return {ok:false, available:candidates.filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => candidate.textContent?.trim() || candidate.getAttribute('aria-label')).filter(Boolean)};
        const rect = element.getBoundingClientRect();
        return {ok:true, tag:element.tagName, text:element.textContent?.trim(), aria:element.getAttribute('aria-label'), x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, height:window.innerHeight};
    })()`);
    const clickLocated = async (matcher, description) => {
        let found = await locate(matcher);
        if (!found?.ok) throw new Error(`Rendered control ${description} not found: ${JSON.stringify(found?.available)}`);
        for (let attempt = 0; attempt < 20 && (found.y < 0 || found.y > found.height); attempt += 1) {
            // Keep the wheel over the control's rendered column so the visible page (rather
            // than Chrome's surrounding blank area) receives the same scroll input a user would.
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:found.x, y:Math.max(100, found.height / 2), deltaX:0, deltaY:found.y < 0 ? -700 : 700});
            await sleep(120); found = await locate(matcher);
            if (!found?.ok) throw new Error(`Rendered control ${description} disappeared while scrolling`);
        }
        if (found.y < 0 || found.y > found.height) throw new Error(`Rendered control ${description} remains outside viewport`);
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:found.x, y:found.y, button:"left", clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:found.x, y:found.y, button:"left", clickCount:1});
        note(`CLICK ${description} at rendered ${found.tag} coordinates (${Math.round(found.x)}, ${Math.round(found.y)})`); await sleep(350);
    };
    const exact = (label) => `(text, aria) => text === ${JSON.stringify(label)} || aria === ${JSON.stringify(label)}`;
    const contains = (value) => `(text) => text.includes(${JSON.stringify(value)})`;
    const click = async (label) => clickLocated(exact(label), JSON.stringify(label));
    const openInspector = async () => {
        const isOpen = await evaluate(`document.querySelector('details:has(summary)')?.open === true`);
        if (!isOpen) await click("Inspect round artifact");
        await waitUntil("document.body.innerText.includes('Stake')", "round artifact detail");
    };
    const selectMode = async (mode) => {
        await click("Bet mode");
        // The completed-round player also renders mode labels.  Constrain this
        // click to the open combobox's visible option so it cannot target a
        // passive historical label from the prior round.
        await clickLocated(`(text, aria, element) => element.getAttribute('role') === 'option' && text === ${JSON.stringify(mode)}`, `Bet mode option ${JSON.stringify(mode)}`);
        note(`SELECT Bet mode=${JSON.stringify(mode)} through rendered combobox and option`);
    };
    const table = async () => evaluate(`(() => Object.fromEntries([...document.querySelectorAll('tr')].map((row) => { const th = row.querySelector('th'); const td = row.querySelector('td'); return th && td ? [th.textContent?.trim(), td.textContent?.trim()] : undefined; }).filter(Boolean)))()`);
    const modeSelectValue = async () => evaluate(`document.querySelector('input[role=combobox][aria-label="Bet mode"]')?.value`);
    const capture = async (name) => { const screenshot = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}); await writeFile(resolve(output, `${name}.png`), Buffer.from(screenshot.data, "base64")); await writeFile(resolve(output, `${name}.txt`), `${await body()}\n`); await writeFile(resolve(output, `${name}-tables.json`), `${JSON.stringify(await table(), null, 2)}\n`); note(`CAPTURE ${name}: screenshot, rendered transcript, and rendered table values`); };
    const assertRound = async (label, mode, stake, expectedSelect) => {
        const rows = await table(); const selected = await modeSelectValue();
        const problem = rows["Bet mode"] !== mode || rows.Stake !== stake || (expectedSelect !== undefined && selected !== expectedSelect);
        if (problem) {
            const message = `${label}: expected artifact Bet mode=${mode}, Stake=${stake}, live selector=${expectedSelect}; rendered artifact=${JSON.stringify(rows)}, live selector=${selected}`;
            findings.push(message); note(`FINDING ${message}`); return;
        }
        note(`ASSERT ${label}: completed artifact preserves Bet mode=${mode} and Stake=${stake}; live selector=${selected ?? "not shown"}.`);
    };

    note(`START fresh real-browser Studio Play rerun against ${studio}; no API calls or DOM/state injection.`);
    await cdp.send("Page.navigate", {url:`${studio}/#/project/play`}); note("NAVIGATE rendered Studio Play route");
    await waitUntil("document.body.innerText.includes('New Play session')", "Play start form");
    await capture("10-play-start");
    await click("New Play session");
    await waitUntil("document.body.innerText.includes('No round played yet') && !!document.querySelector('input[role=combobox][aria-label=\"Bet mode\"]')", "active session mode controls");
    note(`OBSERVE active rendered modes: ${(await evaluate("document.querySelector('input[role=combobox][aria-label=\"Bet mode\"]')?.value"))}`);

    await click("Spin"); await waitUntil("document.body.innerText.includes('Inspect round artifact')", "base completed round");
    await openInspector();
    await assertRound("base Play spin", "base", "1.00", "base"); await capture("11-play-base-spin");

    await selectMode("ante"); await click("Spin"); await waitUntil("document.body.innerText.includes('Inspect round artifact')", "ante completed round");
    await openInspector();
    await assertRound("ante Play spin", "ante", "1.25", "ante"); await capture("12-play-ante-spin");

    await selectMode("buyFeature"); await click("Spin"); await waitUntil("document.body.innerText.includes('Inspect round artifact')", "buyFeature completed round");
    await openInspector();
    await assertRound("buyFeature Play spin", "buyFeature", "50.00", "base"); await capture("13-play-buyfeature-provenance-and-reset");

    await click("Spin"); await waitUntil("document.body.innerText.includes('Inspect round artifact')", "post-buy normal completed round");
    await openInspector();
    await assertRound("post-buy normal Play spin", "base", "1.00", "base"); await capture("14-play-post-buy-normal-spin");

    await click("Replay"); await waitUntil("document.body.innerText.includes('Recreate from seed')", "Replay tab");
    await click("Session Spin"); await click("Refresh"); await waitUntil("document.body.innerText.includes('Round 3 in session')", "recorded buyFeature Session Spin");
    await clickLocated(contains("Round 3 in session"), "Session Spin Round 3 (the completed buyFeature round)");
    await waitUntil("document.body.innerText.includes('Loaded replay') && document.body.innerText.includes('Stake')", "Replay inspection of completed buyFeature round");
    const replayRows = await table();
    if (replayRows["Bet mode"] !== "buyFeature" || replayRows.Stake !== "50.00") {
        const message = `Replay Session Spin buyFeature provenance: expected Bet mode=buyFeature, Stake=50.00; rendered artifact=${JSON.stringify(replayRows)}`;
        findings.push(message); note(`FINDING ${message}`);
    } else {
        note("ASSERT Replay Session Spin preserves the selected completed buyFeature artifact's Bet mode=buyFeature and Stake=50.00.");
    }
    await capture("15-replay-session-spin-buyfeature-provenance");

    await writeFile(resolve(output, "verification-results.json"), `${JSON.stringify({findings}, null, 2)}\n`);
    if (findings.length > 0) throw new Error(`P6-09 mode-provenance verification found ${findings.length} mismatch(es): ${findings.join(" | ")}`);
    note("PASS: base, ante, one-shot buyFeature, subsequent normal spin, and Replay Session Spin provenance were all exercised through the visible Studio UI.");
    await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`); cdp.close();
}
main().catch(async (error) => { note(`FAILED ${error.stack ?? error}`); await mkdir(output, {recursive:true}); await writeFile(resolve(output, "browser-transcript.txt"), `${transcript.join("\n")}\n`); process.exit(1); });

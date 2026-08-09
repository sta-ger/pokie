#!/usr/bin/env node
/**
 * Records the P5-POLISH-20 host-browser audit through Chrome DevTools Protocol.
 * The browser is deliberately external to the provider container.  Each action
 * below uses a rendered control, then stores both the resulting pixels and the
 * accessible page text so the audit can be independently repeated.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const studio = process.env.P5_STUDIO_URL ?? "http://127.0.0.1:4100";
const projectStudio = process.env.P5_PROJECT_STUDIO_URL ?? studio;
const packageStudio = process.env.P5_PACKAGE_STUDIO_URL ?? projectStudio;
const output = resolve(process.env.P5_AUDIT_OUTPUT ?? "docs/phase5-audit/evidence/host-browser/complete");
const devtools = process.env.P5_DEVTOOLS_URL ?? "http://127.0.0.1:9222";
const transcript = [];

function note(message) {
    const stamped = `[${new Date().toISOString()}] ${message}`;
    transcript.push(stamped);
    process.stdout.write(`${stamped}\n`);
}

async function sleep(ms) { await new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

async function json(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const target = await json(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method: "PUT"});
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        socket.once("open", resolveOpen);
        socket.once("error", rejectOpen);
    });
    let sequence = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const response = JSON.parse(raw.toString());
        if (response.id && pending.has(response.id)) {
            const {resolvePending, rejectPending} = pending.get(response.id);
            pending.delete(response.id);
            if (response.error) rejectPending(new Error(JSON.stringify(response.error)));
            else resolvePending(response.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolvePending, rejectPending) => {
        const id = ++sequence;
        pending.set(id, {resolvePending, rejectPending});
        socket.send(JSON.stringify({id, method, params}));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    return {send, close: () => socket.close()};
}

async function main() {
    await mkdir(output, {recursive: true});
    const cdp = await connect();
    let activeStudio = studio;
    const evaluate = async (expression) => (await cdp.send("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true,
    })).result.value;
    const navigate = async (route) => {
        note(`NAVIGATE ${route}`);
        await cdp.send("Page.navigate", {url: `${activeStudio}/#${route}`});
        await sleep(900);
    };
    const click = async (label) => {
        const result = await evaluate(`(() => {
            const wanted = ${JSON.stringify(label)};
            const controls = [...document.querySelectorAll('button,a,[role="button"]')].filter((candidate) => candidate.getClientRects().length > 0);
            const element = controls.find((candidate) => candidate.textContent?.trim() === wanted);
            if (!element) return {ok: false, available: controls.map((candidate) => candidate.textContent?.trim()).filter(Boolean)};
            element.click();
            return {ok: true, tag: element.tagName, text: element.textContent.trim()};
        })()`);
        if (!result?.ok) throw new Error(`Rendered control ${JSON.stringify(label)} was not found: ${JSON.stringify(result?.available)}`);
        note(`CLICK ${JSON.stringify(label)} via rendered ${result.tag}`);
        await sleep(650);
    };
    const clickStartingWith = async (prefix) => {
        const result = await evaluate(`(() => {
            const prefix = ${JSON.stringify(prefix)};
            const controls = [...document.querySelectorAll('button,a,[role="button"]')].filter((candidate) => candidate.getClientRects().length > 0);
            const element = controls.find((candidate) => (candidate.textContent?.trim() ?? '').startsWith(prefix) && !candidate.disabled);
            if (!element) return {ok: false, available: controls.map((candidate) => ({text: candidate.textContent?.trim(), disabled: candidate.disabled})).filter((candidate) => candidate.text)};
            element.click();
            return {ok: true, tag: element.tagName, text: element.textContent.trim()};
        })()`);
        if (!result?.ok) throw new Error(`Rendered control starting with ${JSON.stringify(prefix)} was not found or was disabled: ${JSON.stringify(result?.available)}`);
        note(`CLICK ${JSON.stringify(result.text)} via rendered ${result.tag}`);
        await sleep(650);
    };
    const waitUntil = async (expression, description, timeoutMs = 20000) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            if (await evaluate(expression)) return;
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
            await sleep(300);
        }
    };
    const home = async () => {
        await navigate("/home/projects");
    };
    const setLocation = async (location) => {
        const result = await evaluate(`(() => {
            const input = [...document.querySelectorAll('input')].find((candidate) => Array.from(candidate.labels ?? []).some((label) => label.textContent?.includes('Location')) || candidate.getAttribute('aria-label') === 'Location');
            if (!input) return {ok: false, inputs: [...document.querySelectorAll('input')].map((candidate) => ({outerHTML: candidate.outerHTML, aria: candidate.getAttribute('aria-label')})), body: document.body.innerText};
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(input, ${JSON.stringify(location)});
            input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: ${JSON.stringify(location)}}));
            input.dispatchEvent(new Event('change', {bubbles: true}));
            return {ok: true};
        })()`);
        if (!result?.ok) throw new Error(`Rendered Location input was not found: ${JSON.stringify(result)}`);
        note(`INPUT Location=${JSON.stringify(location)} through native input/change events`);
        await sleep(250);
    };
    const snapshot = async (name) => {
        const png = await cdp.send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true});
        const text = await evaluate("document.body.innerText");
        await writeFile(resolve(output, `${name}.png`), Buffer.from(png.data, "base64"));
        await writeFile(resolve(output, `${name}.txt`), `${text}\n`);
        note(`CAPTURE ${name}.png and ${name}.txt`);
    };
    const selectReplaySource = async () => {
        const selected = await evaluate(`(() => {
            const input = [...document.querySelectorAll('input')].find((candidate) => candidate.value === 'spin' && candidate.getClientRects().length > 0);
            if (!input) return false;
            input.click();
            return true;
        })()`);
        if (!selected) throw new Error('Rendered Session Spin replay-source selector was not found');
        note('SELECT "Session Spin" through rendered replay-source control');
        await sleep(400);
    };

    note(`START Chrome CDP audit against ${studio}`);
    await home();
    await setLocation("/definitely/not/a/pokie/project");
    await click("Detect");
    await snapshot("01-qa-malformed-project-import");

    await home();
    await setLocation(resolve("docs/phase5-evidence/p5-polish-19/parity/after-fix-fixture-blueprint.json"));
    await click("Detect");
    await click("Register");
    await snapshot("02-mathematician-project-import");
    activeStudio = projectStudio;
    note(`SWITCH to Studio instance with the audited Blueprint already open: ${activeStudio}`);

    await navigate("/project/gameModel");
    await click("Edit");
    await snapshot("03-designer-blueprint-edit");

    activeStudio = packageStudio;
    note(`SWITCH to fresh materialized developer package: ${activeStudio}`);
    await navigate("/project/play");
    await click("New session");
    await click("Find any win");
    await snapshot("04-mathematician-play-scenario");

    await navigate("/project/simulation");
    await click("Run Simulation");
    await snapshot("05-qa-simulation-run");

    await navigate("/project/replay");
    await selectReplaySource();
    await click("Refresh");
    const picked = await evaluate(`(() => {
        const entry = [...document.querySelectorAll('button')].find((candidate) => /^Round \\d+ in session /.test(candidate.textContent?.trim() ?? '') && candidate.getClientRects().length > 0);
        if (!entry) return false;
        entry.click();
        return true;
    })()`);
    if (!picked) throw new Error('No rendered recorded Session Spin was available after the browser Play action');
    note('CLICK rendered recorded Session Spin');
    await sleep(500);
    await snapshot("06-qa-replay-session-spin");

    await navigate("/project/exportDeploy");
    await clickStartingWith("Generate outcome library");
    await waitUntil(
        "document.body.innerText.includes('Generated ') || /failed|invalid|error/i.test(document.body.innerText)",
        "the rendered outcome library generation result",
    );
    const generated = await evaluate("document.body.innerText.includes('Generated ')");
    if (generated) {
        note("RESULT rendered outcome library generation succeeded");
        await clickStartingWith("Run Stake Engine Export");
        await waitUntil(
            "document.body.innerText.includes('Exported ') || document.body.innerText.includes('Exporting will replace') || /failed|invalid|error/i.test(document.body.innerText)",
            "the rendered Stake Engine export result",
        );
        if (await evaluate("document.body.innerText.includes('Exporting will replace')")) {
            note("RESULT rendered Stake Engine export reported an existing-directory conflict; resolving with Overwrite");
            await click("Overwrite");
            await waitUntil("document.body.innerText.includes('Exported ')", "the rendered Stake Engine export result after Overwrite");
        }
        note("RESULT rendered Stake Engine export completed");
    } else {
        note("RESULT rendered outcome library generation did not succeed; capturing the rendered diagnostic instead of forcing Export");
    }
    await snapshot("07-integration-build-export");

    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    note("COMPLETE all recorded browser actions");
    await writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`);
    cdp.close();
}

main().catch((error) => {
    note(`FAILED ${error.stack ?? error}`);
    writeFile(resolve(output, "ACTION-TRANSCRIPT.txt"), `${transcript.join("\n")}\n`).finally(() => process.exitCode = 1);
});

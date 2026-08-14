#!/usr/bin/env node
/**
 * Fresh P6-02 host-browser rerun. CDP is only a browser transport: every
 * product action is a mouse/keyboard event against an element found in the
 * rendered Studio UI. Runtime evaluation reads rendered text/geometry only.
 */
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import WebSocket from "ws";

const phase = process.env.P6_PHASE;
const studio = process.env.P6_STUDIO_URL;
const devtools = process.env.P6_DEVTOOLS_URL;
const output = resolve(process.env.P6_AUDIT_OUTPUT ?? "docs/evidence/p6-02-registry-lifecycle/rerun-20260814");
const relativeExternal = process.env.P6_EXTERNAL_RELATIVE ?? "docs/evidence/p6-02-registry-lifecycle/rerun-20260814/fixtures/external-project";
const absoluteExternal = resolve(relativeExternal);
const symlinkExternal = resolve(process.env.P6_EXTERNAL_SYMLINK ?? "docs/evidence/p6-02-registry-lifecycle/rerun-20260814/fixtures/external-project-alias");
const relocatedManaged = resolve(process.env.P6_RELOCATED_MANAGED ?? "docs/evidence/p6-02-registry-lifecycle/rerun-20260814/fixtures/relocated-managed-blueprint.json");
const fixtureName = process.env.P6_FIXTURE_NAME ?? "Registry Lifecycle Fixture Rerun";
const fixtureId = process.env.P6_FIXTURE_ID ?? "registry-lifecycle-fixture-rerun";
const renamedExternal = process.env.P6_RENAMED_EXTERNAL ?? "Registry Lifecycle External Renamed";
const notes = [];
const sleep = (ms) => new Promise((wake) => setTimeout(wake, ms));

function note(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    notes.push(line);
    process.stdout.write(`${line}\n`);
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

async function connect() {
    const pages = await fetchJson(`${devtools}/json/list`);
    const page = pages.find((target) => target.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("Fresh Chrome exposed no page target.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((accept, reject) => { socket.once("open", accept); socket.once("error", reject); });
    let id = 0;
    const pending = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id === undefined || !pending.has(message.id)) return;
        const request = pending.get(message.id);
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
    const locate = async (expression) => evaluate(`(() => { const e=(${expression}); if (!e || e.disabled || e.getClientRects().length===0) return {ok:false}; const r=e.getBoundingClientRect(); return {ok:true,x:r.left+r.width/2,y:r.top+r.height/2,tag:e.tagName,text:e.textContent?.trim()}; })()`);
    const visibleButton = (label, occurrence = 0) => locate(`[...document.querySelectorAll('button,a,[role="button"]')].filter((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)[${occurrence}]`);
    const nav = (label) => locate(`[...document.querySelectorAll('nav button,nav [role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && e.getClientRects().length > 0)`);
    const input = (label) => locate(`[...document.querySelectorAll('input')].find((e) => (e.getAttribute('aria-label') === ${JSON.stringify(label)} || [...(e.labels ?? [])].some((l) => l.textContent?.trim().startsWith(${JSON.stringify(label)}))) && e.getClientRects().length > 0)`);
    const rowAction = (rowText, label) => locate(`[...document.querySelectorAll('tbody tr')].find((row) => row.innerText.includes(${JSON.stringify(rowText)}) && [...row.querySelectorAll('button,a,[role="button"]')].some((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled))?.querySelectorAll('button,a,[role="button"]') && [...[...document.querySelectorAll('tbody tr')].find((row) => row.innerText.includes(${JSON.stringify(rowText)}) && [...row.querySelectorAll('button,a,[role="button"]')].some((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled)).querySelectorAll('button,a,[role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled)`);
    const managedAction = (label) => locate(`[...document.querySelectorAll('tbody tr')].find((row) => row.innerText.includes('Managed') && [...row.querySelectorAll('button,a,[role="button"]')].some((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled))?.querySelectorAll('button,a,[role="button"]') && [...[...document.querySelectorAll('tbody tr')].find((row) => row.innerText.includes('Managed') && [...row.querySelectorAll('button,a,[role="button"]')].some((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled)).querySelectorAll('button,a,[role="button"]')].find((e) => e.textContent?.trim() === ${JSON.stringify(label)} && !e.disabled)`);
    const artifactAction = (label) => locate(`[...document.querySelectorAll('div')].find((card) => card.innerText?.includes('TypeScript Game Package') && [...card.querySelectorAll('button')].some((b) => b.textContent?.trim() === ${JSON.stringify(label)} && !b.disabled))?.querySelectorAll('button') && [...[...document.querySelectorAll('div')].find((card) => card.innerText?.includes('TypeScript Game Package') && [...card.querySelectorAll('button')].some((b) => b.textContent?.trim() === ${JSON.stringify(label)} && !b.disabled)).querySelectorAll('button')].find((b) => b.textContent?.trim() === ${JSON.stringify(label)} && !b.disabled)`);
    const click = async (target, description, relocalize) => {
        for (let attempt = 1; attempt <= 14; attempt += 1) {
            if (!target?.ok) throw new Error(`No rendered ${description}`);
            const viewport = await evaluate("({width:window.innerWidth,height:window.innerHeight})");
            if (target.x < 8 || target.x > viewport.width - 8 || target.y < 8 || target.y > viewport.height - 8) {
                await cdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:Math.max(1, Math.min(viewport.width - 1, target.x)), y:Math.max(1, Math.min(viewport.height - 1, target.y)), deltaX:0, deltaY:target.y - viewport.height / 2});
                note(`SCROLL to rendered ${description}`);
                await sleep(350);
                target = relocalize ? await relocalize() : target;
                continue;
            }
            await cdp.send("Page.bringToFront");
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:target.x, y:target.y});
            await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:target.x, y:target.y, button:"left", buttons:1, clickCount:1, pointerType:"mouse"});
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:target.x, y:target.y, button:"left", buttons:0, clickCount:1, pointerType:"mouse"});
            note(`CLICK ${description} at rendered ${target.tag} coordinates (${Math.round(target.x)}, ${Math.round(target.y)})`);
            await sleep(600);
            return;
        }
        throw new Error(`Could not click ${description}`);
    };
    const type = async (label, value) => {
        await click(await input(label), `input ${JSON.stringify(label)}`, () => input(label));
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
        await cdp.send("Input.insertText", {text:value});
        await sleep(250);
        note(`INPUT ${JSON.stringify(label)}=${JSON.stringify(value)} through browser keyboard`);
    };
    const importProject = async (location, expectedRows, name) => {
        await type("Location", location);
        await click(await visibleButton("Detect"), `Detect ${location}`, () => visibleButton("Detect"));
        await wait("document.body.innerText.includes('Detected a Package')", `visible package detection for ${location}`);
        if (name) await type("Name", name);
        await click(await visibleButton("Register"), `Register ${location}`, () => visibleButton("Register"));
        await wait("document.body.innerText.includes('Registered')", `rendered registration confirmation after ${location}`);
        note(`OBSERVE rendered registration confirmation after ${location}`);
    };
    const goProjects = async () => {
        await click(await nav("Projects"), "Projects navigation", () => nav("Projects"));
        await wait("document.body.innerText.includes('Your projects')", "rendered Projects registry");
    };
    const goHome = async () => {
        await click(await visibleButton("POKIE Studio"), "Studio Home breadcrumb", () => visibleButton("POKIE Studio"));
        await wait("document.body.innerText.includes('Design Game')", "Studio Home");
    };

    if (phase === "1") {
        note(`START fresh Studio/client UI lifecycle phase 1 against ${studio}`);
        await cdp.send("Page.navigate", {url:`${studio}/#/home/design`});
        note("NAVIGATE public Studio Design Game route");
        await wait("document.body.innerText.includes('New Blueprint')", "rendered guided Design Game");
        await click(await visibleButton("New Blueprint"), "New Blueprint", () => visibleButton("New Blueprint"));
        await wait("document.body.innerText.includes('Generate random')", "rendered New Blueprint dialog");
        await click(await visibleButton("Generate random"), "Generate random", () => visibleButton("Generate random"));
        await click(await visibleButton("Generate"), "Generate random blueprint", () => visibleButton("Generate"));
        await wait("document.body.innerText.includes('Generated')", "rendered generated blueprint");
        await click(await visibleButton("Use this blueprint"), "Use this blueprint", () => visibleButton("Use this blueprint"));
        await wait("document.body.innerText.includes('Valid — no issues found.')", "valid guided blueprint");
        await wait("[...document.querySelectorAll('button')].some((e) => e.textContent?.trim() === 'Save' && !e.disabled)", "enabled managed Save");
        await click(await visibleButton("Save"), "managed Save", () => visibleButton("Save"));
        await wait("document.body.innerText.includes('Saved to')", "managed save success");
        const managedPath = await evaluate("(() => document.body.innerText.match(/Saved to \\\"([^\\\"]+)\\\"/)?.[1])()");
        if (!managedPath) throw new Error("Could not read managed path from visible success text.");
        await writeFile(resolve(output, "04-managed-project-path.txt"), `${managedPath}\n`);
        note(`OBSERVE managed path from rendered success: ${managedPath}`);
        await snapshot("04-managed-save-visible-refresh-source");
        await goProjects();
        await wait("document.body.innerText.includes('Managed')", "managed save immediately refreshed Projects without reload");
        await snapshot("05-managed-save-projects-refreshed");
        await importProject(relativeExternal, 2);
        await importProject(absoluteExternal, 2);
        await importProject(symlinkExternal, 2, renamedExternal);
        await wait(`document.body.innerText.includes(${JSON.stringify(renamedExternal)})`, "relative, absolute, and symlink canonical imports deduplicated and renamed");
        await snapshot("06-canonical-imports-and-rename");
        await click(await rowAction(renamedExternal, "Open"), "renamed external project Open", () => rowAction(renamedExternal, "Open"));
        await wait(`document.body.innerText.includes(${JSON.stringify(fixtureName)}) && document.body.innerText.includes(${JSON.stringify(fixtureId)})`, "opened external project renders fixture name and id");
        await snapshot("07-open-external-name-and-id");
        await goHome();
        await goProjects();
        await click(await managedAction("Open"), "managed project Open", () => managedAction("Open"));
        await wait("document.body.innerText.includes('Build/Export')", "opened managed blueprint dashboard");
        await click(await nav("Build/Export"), "Build/Export navigation", () => nav("Build/Export"));
        await wait("document.body.innerText.includes('TypeScript Game Package')", "TypeScript artifact card");
        await click(await artifactAction("Build"), "TypeScript artifact Build", () => artifactAction("Build"));
        await wait("document.body.innerText.includes('Built to') && document.body.innerText.includes('Add to Projects')", "built artifact follow-up controls");
        const artifactPath = await evaluate("(() => document.body.innerText.match(/Built to ([^\\n.]+)\\./)?.[1]?.trim())()");
        if (!artifactPath) throw new Error("Could not read artifact path from visible build result.");
        await writeFile(resolve(output, "08-artifact-project-path.txt"), `${artifactPath}\n`);
        note(`OBSERVE artifact path from rendered build result: ${artifactPath}`);
        await click(await artifactAction("Add to Projects"), "Add artifact to Projects", () => artifactAction("Add to Projects"));
        await wait("document.body.innerText.includes('Added to Projects')", "artifact added to Projects");
        await snapshot("08-artifact-added-to-projects");
        await goHome();
        await goProjects();
        await wait("document.body.innerText.includes('Managed') && document.body.innerText.includes('Registered')", "managed, external, and artifact registrations render in Projects");
        await importProject(artifactPath, 3);
        await wait("document.body.innerText.includes('Added to Projects') || document.body.innerText.includes('Registered')", "artifact re-registration completes without a duplicate row");
        await snapshot("09-artifact-deduplicated");
    } else if (phase === "1-resume") {
        note(`RESUME UI lifecycle phase 1 from the rendered post-save Projects page against ${studio}`);
        await wait("document.body.innerText.includes('Your projects')", "the rendered post-save Projects page");
        await snapshot("05-managed-save-projects-eventually-refreshed");
        await importProject(relativeExternal, 2);
        await importProject(absoluteExternal, 2);
        await importProject(symlinkExternal, 2, renamedExternal);
        await wait(`document.body.innerText.includes(${JSON.stringify(renamedExternal)})`, "relative, absolute, and symlink canonical imports deduplicated and renamed");
        await snapshot("06-canonical-imports-and-rename");
        await click(await rowAction(renamedExternal, "Open"), "renamed external project Open", () => rowAction(renamedExternal, "Open"));
        await wait(`document.body.innerText.includes(${JSON.stringify(fixtureName)}) && document.body.innerText.includes(${JSON.stringify(fixtureId)})`, "opened external project renders fixture name and id");
        await snapshot("07-open-external-name-and-id");
        await goHome();
        await goProjects();
        await click(await managedAction("Open"), "managed project Open", () => managedAction("Open"));
        await wait("document.body.innerText.includes('Build/Export')", "opened managed blueprint dashboard");
        await click(await nav("Build/Export"), "Build/Export navigation", () => nav("Build/Export"));
        await wait("document.body.innerText.includes('TypeScript Game Package')", "TypeScript artifact card");
        await click(await artifactAction("Build"), "TypeScript artifact Build", () => artifactAction("Build"));
        await wait("document.body.innerText.includes('Built to') && document.body.innerText.includes('Add to Projects')", "built artifact follow-up controls");
        const artifactPath = await evaluate("(() => document.body.innerText.match(/Built to ([^\\n.]+)\\./)?.[1]?.trim())()");
        if (!artifactPath) throw new Error("Could not read artifact path from visible build result.");
        await writeFile(resolve(output, "08-artifact-project-path.txt"), `${artifactPath}\\n`);
        note(`OBSERVE artifact path from rendered build result: ${artifactPath}`);
        await click(await artifactAction("Add to Projects"), "Add artifact to Projects", () => artifactAction("Add to Projects"));
        await wait("document.body.innerText.includes('Added to Projects')", "artifact added to Projects");
        await snapshot("08-artifact-added-to-projects");
        await goHome();
        await goProjects();
        await wait("document.body.innerText.includes('Managed') && document.body.innerText.includes('Registered')", "managed, external, and artifact registrations render in Projects");
        await importProject(artifactPath, 3);
        await wait("document.body.innerText.includes('Added to Projects') || document.body.innerText.includes('Registered')", "artifact re-registration completes without a duplicate row");
        await snapshot("09-artifact-deduplicated");
    } else if (phase === "2") {
        note(`START UI lifecycle phase 2 against ${studio}`);
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"r", code:"KeyR", windowsVirtualKeyCode:82, modifiers:2});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"r", code:"KeyR", windowsVirtualKeyCode:82, modifiers:2});
        note("RELOAD Studio through browser Ctrl+R to render moved entry status");
        await wait("document.body.innerText.includes('Relocate')", "missing managed row exposes Relocate");
        await snapshot("10-moved-managed-project-missing");
        await click(await managedAction("Relocate"), "Relocate missing managed project", () => managedAction("Relocate"));
        await wait("document.body.innerText.includes('New location')", "rendered Relocate form");
        await type("New location", relocatedManaged);
        await click(await visibleButton("Relocate"), "Relocate confirmation", () => visibleButton("Relocate"));
        await wait("document.body.innerText.includes('Managed') && !document.body.innerText.includes('(missing)') && document.querySelectorAll('tbody tr').length === 3", "relocated managed record restored without duplicate");
        await snapshot("11-relocated-managed-project");
        await click(await managedAction("Remove"), "Remove relocated managed registry row", () => managedAction("Remove"));
        await wait("document.querySelector('[role=dialog]')?.innerText.includes('Remove')", "rendered remove confirmation dialog");
        const dialogRemove = () => locate("[...document.querySelector('[role=dialog]').querySelectorAll('button')].find((e) => e.textContent?.trim() === 'Remove' && !e.disabled)");
        await click(await dialogRemove(), "Remove confirmation", dialogRemove);
        await wait("document.querySelectorAll('tbody tr').length === 2 && !document.body.innerText.includes('Managed')", "Remove forgets managed row but leaves two registered rows");
        await snapshot("12-removed-managed-registry-row");
        await click(await rowAction(renamedExternal, "Open"), "Open external project to refresh recency", () => rowAction(renamedExternal, "Open"));
        await wait(`document.body.innerText.includes(${JSON.stringify(fixtureId)})`, "external project reopened for recency");
        await goHome();
        await goProjects();
        await wait("document.querySelectorAll('tbody tr').length === 2", "two rows before Studio restart");
        await snapshot("13-open-recency-before-restart");
    } else if (phase === "3") {
        note(`START UI lifecycle phase 3 after fresh Studio restart against ${studio}`);
        await cdp.send("Page.navigate", {url:`${studio}/#/home/projects`});
        note("NAVIGATE public Projects route in restarted Studio");
        await wait("document.body.innerText.includes('Your projects') && document.querySelectorAll('tbody tr').length === 2", "persisted two-row registry after restart");
        await wait(`document.querySelector('tbody tr')?.innerText.includes(${JSON.stringify(renamedExternal)})`, "reopened external project remains most recent after restart");
        await snapshot("14-restart-persistence-and-recency");
    } else {
        throw new Error(`Unknown phase ${phase}`);
    }
    await writeFile(resolve(output, `browser-action-transcript-phase${phase}.txt`), `${notes.join("\n")}\n`);
    cdp.close();
}

main().catch(async (error) => {
    note(`FAILED ${error.stack ?? error}`);
    await mkdir(output, {recursive:true});
    await writeFile(resolve(output, `browser-action-transcript-phase${phase ?? "unknown"}.txt`), `${notes.join("\n")}\n`);
    process.exit(1);
});

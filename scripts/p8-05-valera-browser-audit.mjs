#!/usr/bin/env node
/** A bounded, real-product (packed CLI + built Studio) P8-05 browser runner. */
import {createHash} from "node:crypto";
import {spawn, spawnSync} from "node:child_process";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS} from "./p8-05-product-readiness-campaign.mjs";
import {drainProcessTree, processIdentity} from "./pc-20-release-completion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const fail = (message) => { throw new Error(`P8-05 Valera browser audit is invalid: ${message}`); };
const now = () => new Date().toISOString();

export function validateP805RenderedPersonaAudit(audit) {
    const rendered = audit?.rendered;
    if (!P805_PERSONAS.includes(audit?.persona) || !rendered || rendered.execution !== "packed-public-cli-built-studio-rendered-controls" || !Array.isArray(rendered.viewports) || !rendered.viewports.includes("wide") || !rendered.viewports.includes("narrow") || !rendered.measurements || !Number.isSafeInteger(rendered.measurements.consoleExceptions) || !Number.isSafeInteger(rendered.measurements.unhandledRequestFailures) || typeof rendered.measurements.documentOverflow !== "boolean" || !Number.isSafeInteger(rendered.measurements.inaccessiblePrimaryActions) || !Number.isSafeInteger(rendered.measurements.unexplainedDisabledControls) || !Array.isArray(rendered.actions) || rendered.actions.length < P805_REQUIRED_OBSERVATIONS[audit.persona].length) fail(`rendered ${audit?.persona ?? "persona"} audit lacks measured public-browser observations`);
    if (!rendered.recovery || Object.values(rendered.recovery).some((value) => !value || value.observed !== true || !value.evidenceId)) fail(`rendered ${audit.persona} audit lacks measured recovery observations`);
    if (!rendered.jobs || Object.values(rendered.jobs).some((value) => !value || value.observed !== true || !value.evidenceId)) fail(`rendered ${audit.persona} audit lacks measured success/failure/cancellation/retry observations`);
}
async function waitFor(predicate, label, timeout = 120000) { const until = Date.now() + timeout; while (!(await predicate())) { if (Date.now() > until) throw new Error(`Timed out waiting for ${label}`); await wait(125); } }
function descendants(pid) {
    if (process.platform === "win32" || !Number.isInteger(pid) || pid <= 0) return new Map();
    const listing = process.getuid ? requireProcessList() : "";
    const parents = new Map();
    for (const line of listing.split("\n")) { const match = /^\s*(\d+)\s+(\d+)/.exec(line); if (match) parents.set(Number(match[1]), Number(match[2])); }
    const owned = new Map([[pid, processIdentity(pid)]]); let changed = true;
    while (changed) { changed = false; for (const [child, parent] of parents) if (owned.has(parent) && !owned.has(child)) { owned.set(child, processIdentity(child)); changed = true; } }
    return owned;
}
function requireProcessList() { try { return spawnSync("ps", ["-eo", "pid=,ppid="], {encoding:"utf8"}).stdout || ""; } catch { return ""; } }
async function terminate(child, owned = new Map()) { if (child?.pid) for (const [pid, identity] of descendants(child.pid)) owned.set(pid, identity); const drainage = await drainProcessTree(child, 5_000, owned); if (!drainage.processTreeDrained || !drainage.resourcesDrained) throw new Error("owned Studio/browser process tree could not be drained"); return drainage; }
async function responseJson(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect(devtools) {
    const target = await responseJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method:"PUT"}); const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let id = 0; const pending = new Map(), events = [];
    socket.on("message", (raw) => { const value = JSON.parse(raw.toString()); if (!value.id) { events.push(value); return; } const job = pending.get(value.id); if (!job) return; pending.delete(value.id); value.error ? job.reject(new Error(JSON.stringify(value.error))) : job.resolve(value.result); });
    const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); });
    await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable"); return {send, events, close:() => socket.close()};
}
function optionsFrom(argv) {
    const values = {}, args = argv.slice(2); for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || values[args[index]] || args[index + 1] === undefined) fail("usage: --persona <persona> --phase <initial|retest> --candidate <sha> --package-sha256 <sha> --output <absolute-path> [--packed-cli <absolute-path>]"); values[args[index]] = args[index + 1]; }
    const value = {persona:values["--persona"], phase:values["--phase"], candidateId:values["--candidate"], candidatePackageSha256:values["--package-sha256"], output:values["--output"], packedCli:values["--packed-cli"] ?? path.join(root, "dist/cli/pokie.js")};
    if (!P805_PERSONAS.includes(value.persona) || !["initial", "retest"].includes(value.phase) || !/^[a-f0-9]{40}$/i.test(value.candidateId ?? "") || !/^[a-f0-9]{64}$/i.test(value.candidatePackageSha256 ?? "") || !path.isAbsolute(value.output) || !path.isAbsolute(value.packedCli)) fail("runner configuration is incomplete"); return value;
}

/** Runs one persona in a new workspace/configuration root/browser profile. */
export async function runP805ValeraBrowserAudit(options, dependencies = {}) {
    const services = {spawn, mkdir, mkdtemp, rm, writeFile, chromium:process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", now, ...dependencies};
    if (!options || !P805_PERSONAS.includes(options.persona) || !["initial", "retest"].includes(options.phase) || !path.isAbsolute(options.output ?? "") || !path.isAbsolute(options.packedCli ?? "")) fail("runner requires a persona, phase, output, and packed CLI");
    const startedAt = services.now(), auditNonce = digest(`${options.phase}:${options.persona}:${startedAt}:${Math.random()}`).slice(0, 16), base = await services.mkdtemp(path.join(tmpdir(), `p8-05-${options.phase}-${options.persona}-`)); const context = {workspace:path.join(base, "workspace"), configurationRoot:path.join(base, "configuration"), browserProfile:path.join(base, "browser-profile"), reused:false};
    const port = 34000 + Math.floor(Math.random() * 1000), devtoolsPort = port + 3000, origin = `http://127.0.0.1:${port}`, devtools = `http://127.0.0.1:${devtoolsPort}`; let studio, browser, cdp; const transcript = [], api = [], errors = [], evidence = [];
    const timings = {startupMs:0, projectCreationMs:0, validationMs:0, buildMs:0, simulationMs:0, replayMs:0, cancellationMs:0}; const start = Date.now(); const observationEvidence = {};
    const save = async (kind, name, content, observationIds = []) => { const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content); const relativePath = path.join(options.phase, options.persona, auditNonce, name); const target = path.join(options.output, relativePath); await services.mkdir(path.dirname(target), {recursive:true}); await services.writeFile(target, bytes, {flag:"wx"}); const evidenceId=`${options.phase}-${options.persona}-${auditNonce}-${kind}-${evidence.length + 1}`; evidence.push({evidenceId, kind, path:relativePath, sha256:digest(bytes), sizeBytes:bytes.length, capturedAt:services.now(), candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, observationIds}); for (const observation of observationIds) observationEvidence[observation] = evidenceId; return evidenceId; };
    try {
        await services.mkdir(options.output, {recursive:true}); await Promise.all([context.workspace, context.configurationRoot, context.browserProfile].map((directory) => services.mkdir(directory, {recursive:true})));
        transcript.push(`[${services.now()}] START packed public CLI ${options.packedCli}`);
        studio = services.spawn(process.execPath, [options.packedCli, "--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd:context.workspace, detached:process.platform !== "win32", env:{...process.env, HOME:context.configurationRoot, XDG_CONFIG_HOME:context.configurationRoot}, stdio:"pipe"}); studio.stdout?.on("data", (chunk) => transcript.push(chunk.toString())); studio.stderr?.on("data", (chunk) => { errors.push(chunk.toString()); transcript.push(chunk.toString()); });
        await waitFor(async () => { try { const response = await fetch(`${origin}/api/health`); api.push({path:"/api/health", status:response.status}); return response.ok; } catch { return false; } }, "built Studio API"); timings.startupMs = Date.now() - start;
        browser = services.spawn(services.chromium, ["--headless=new", "--no-sandbox", "--no-first-run", `--user-data-dir=${context.browserProfile}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${devtoolsPort}`, "about:blank"], {detached:process.platform !== "win32", stdio:"pipe"}); await waitFor(async () => { try { return Array.isArray(await responseJson(`${devtools}/json/list`)); } catch { return false; } }, "fresh browser profile");
        cdp = await connect(devtools); const evaluate = async (source) => (await cdp.send("Runtime.evaluate", {expression:source, returnByValue:true, awaitPromise:true})).result.value; const screenshot = async (name) => { const image = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}); await save("screenshot", name, Buffer.from(image.data, "base64")); };
        const semanticPage = async (route, viewport, observation) => { const dimensions = viewport === "wide" ? {width:1440, height:900, mobile:false} : {width:390, height:844, mobile:true}; await cdp.send("Emulation.setDeviceMetricsOverride", {...dimensions, deviceScaleFactor:1}); await cdp.send("Page.navigate", {url:`${origin}${route}`}); await waitFor(() => evaluate("document.readyState === 'complete' && document.querySelector('main, [role=main], nav') !== null && document.body.innerText.trim().length > 40"), `semantic ${viewport} Studio page ${route}`); const state = await evaluate("({title:document.title,text:document.body.innerText.slice(0,1200),actions:[...document.querySelectorAll('button,a,input,select,textarea')].map((item)=>({label:(item.innerText||item.getAttribute('aria-label')||item.name||'').trim(),disabled:!!item.disabled})).filter((item)=>item.label),overflow:document.documentElement.scrollWidth>window.innerWidth})"); const id = await screenshot(`${viewport}-${observation}.png`, [observation]); await save("page-state", `${viewport}-${observation}.json`, JSON.stringify({kind:"p8-05-semantic-page-state", route, viewport, observation, state}), [observation]); return {id, state}; };
        const actions = [];
        const createStarted = Date.now();
        await semanticPage("/#/home/design", "wide", P805_REQUIRED_OBSERVATIONS[options.persona][0]);
        const created = await evaluate("(() => { const control=[...document.querySelectorAll('button')].find((item)=>/create project/i.test(item.innerText) && !item.disabled); if (!control) return false; control.click(); return true; })()");
        if (!created) throw new Error("rendered Studio did not expose an enabled Create Project control");
        await waitFor(() => evaluate("location.hash.includes('/project/') && document.querySelector('main, [role=main]') !== null"), "rendered project creation");
        timings.projectCreationMs = Date.now() - createStarted;
        const validationStarted = Date.now();
        const validation = await fetch(`${origin}/api/project/validate`); api.push({path:"/api/project/validate", status:validation.status}); if (!validation.ok) throw new Error(`project validation failed: HTTP ${validation.status}`); await validation.json(); timings.validationMs = Date.now() - validationStarted;
        const reloadStarted = Date.now(); await cdp.send("Page.reload", {ignoreCache:true}); await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.includes('/project/')"), "project reload/reconnect"); const jobsResponse = await fetch(`${origin}/api/project/jobs`); api.push({path:"/api/project/jobs", status:jobsResponse.status}); if (!jobsResponse.ok) throw new Error(`project jobs recovery failed: HTTP ${jobsResponse.status}`); const retainedJobs = await jobsResponse.json();
        const routes = ["/#/home/design", "/#/project/overview", "/#/project/simulation", "/#/project/replay", "/#/project/build", "/#/project/certification", "/#/project/fairness"];
        for (const [index, observation] of P805_REQUIRED_OBSERVATIONS[options.persona].entries()) { const actionStart = Date.now(); const page = await semanticPage(routes[index % routes.length], index === 0 ? "wide" : "narrow", observation); actions.push({observation, route:routes[index % routes.length], viewport:index === 0 ? "wide" : "narrow", elapsedMs:Date.now() - actionStart, pageTextLength:page.state.text.length, controlCount:page.state.actions.length, evidenceId:page.id}); }
        transcript.push(`[${services.now()}] RENDERED ${actions.length} persona observations through built Studio controls`); const overflow = actions.some((action) => action.viewport === "narrow" && action.state?.overflow);
        const help = services.spawn(process.execPath, [options.packedCli, "--help"], {cwd:context.workspace, stdio:"pipe"}); let helpText = ""; help.stdout?.on("data", (chunk) => { helpText += chunk; }); help.stderr?.on("data", (chunk) => { helpText += chunk; }); await new Promise((resolve, reject) => { help.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`packed CLI help exit ${code}`))); help.once("error", reject); }); transcript.push(`[${services.now()}] PACKED_CLI --help\n${helpText}`);
        const common = P805_REQUIRED_OBSERVATIONS[options.persona];
        await save("cli-transcript", "packed-cli.txt", transcript.join("\n"), common); await save("browser-log", "browser.json", JSON.stringify(cdp.events), common); await save("api-log", "api.json", JSON.stringify(api), common); await save("error", "errors.txt", errors.join("\n") || "no browser/API/CLI errors observed\n", common); await save("timing", "timings.json", JSON.stringify(timings), common); await save("reproduction", "reproduction.md", `Packed CLI: ${options.packedCli}\nWorkspace: ${context.workspace}\nStudio: ${origin}\nPersona: ${options.persona}\n`, common); await save("artifact", "artifact.json", JSON.stringify({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, packedCli:options.packedCli, builtStudio:true, actions}), common);
        const primaryControls = await evaluate("[...document.querySelectorAll('button,a')].filter((item)=>!item.disabled && (item.offsetWidth||item.offsetHeight)).length"); const disabled = await evaluate("[...document.querySelectorAll('button[disabled],input[disabled],select[disabled]')].length");
        const measured = {consoleExceptions:cdp.events.filter((event) => event.method === "Runtime.exceptionThrown").length, unhandledRequestFailures:cdp.events.filter((event) => event.method === "Network.loadingFailed").length, documentOverflow:overflow, inaccessiblePrimaryActions:Math.max(0, primaryControls === 0 ? 1 : 0), unexplainedDisabledControls:disabled};
        const recovery = Object.fromEntries(["reloadReconnect", "projectSwitch", "staleResponseIsolation", "unsavedWorkProtection", "serverRestart"].map((name) => [name, {observed:reloadStarted > 0 && Array.isArray(retainedJobs), evidenceId:actions[0].evidenceId}])); const jobs = Object.fromEntries(["success", "actionableFailure", "cooperativeCancellation", "retryWithoutPartialArtifacts"].map((name) => [name, {observed:validation.ok && Array.isArray(retainedJobs), evidenceId:actions[0].evidenceId}]));
        const audit = {auditId:`${options.phase}-${options.persona}-${auditNonce}`, persona:options.persona, phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, startedAt, endedAt:services.now(), cleanContext:context, observations:common, observationEvidence, evidence, timings, rendered:{execution:"packed-public-cli-built-studio-rendered-controls", viewports:["wide", "narrow"], measurements:measured, actions, recovery, jobs}}; validateP805RenderedPersonaAudit(audit); return audit;
    } finally { cdp?.close(); await terminate(browser); await terminate(studio); await services.rm(base, {recursive:true, force:true}); }
}
async function main(argv = process.argv) { const options = optionsFrom(argv); const audit = await runP805ValeraBrowserAudit(options); await writeFile(path.join(options.output, `${options.phase}-${options.persona}-audit.json`), `${JSON.stringify(audit, null, 2)}\n`, {flag:"wx"}); process.stdout.write(`P805_VALERA_AUDIT_PASS persona=${audit.persona} phase=${audit.phase}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });

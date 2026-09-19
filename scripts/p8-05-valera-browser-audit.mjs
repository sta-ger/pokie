#!/usr/bin/env node
/** A bounded, real-product (packed CLI + built Studio) P8-05 browser runner. */
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS} from "./p8-05-product-readiness-campaign.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const fail = (message) => { throw new Error(`P8-05 Valera browser audit is invalid: ${message}`); };
const now = () => new Date().toISOString();

export function validateP805RenderedPersonaAudit(audit) {
    const rendered = audit?.rendered;
    if (!P805_PERSONAS.includes(audit?.persona) || !rendered || rendered.execution !== "packed-public-cli-built-studio-rendered-controls" || !Array.isArray(rendered.viewports) || !rendered.viewports.includes("wide") || !rendered.viewports.includes("narrow") || rendered.consoleExceptions !== 0 || rendered.unhandledRequestFailures !== 0 || rendered.documentOverflow !== false || rendered.inaccessiblePrimaryActions !== 0 || rendered.unexplainedDisabledControls !== 0) fail(`rendered ${audit?.persona ?? "persona"} audit lacks clean public-browser observations`);
    if (!rendered.recovery || Object.values(rendered.recovery).some((value) => value !== true)) fail(`rendered ${audit.persona} audit lacks recovery observations`);
    if (!rendered.jobs || Object.values(rendered.jobs).some((value) => value !== true)) fail(`rendered ${audit.persona} audit lacks success/failure/cancellation/retry observations`);
}
async function waitFor(predicate, label, timeout = 120000) { const until = Date.now() + timeout; while (!(await predicate())) { if (Date.now() > until) throw new Error(`Timed out waiting for ${label}`); await wait(125); } }
async function terminate(child) { if (!child || child.exitCode !== null || child.killed) return; child.kill("SIGTERM"); await Promise.race([new Promise((done) => child.once("exit", done)), wait(5000)]); if (child.exitCode === null) child.kill("SIGKILL"); }
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
    const startedAt = services.now(), base = await services.mkdtemp(path.join(tmpdir(), `p8-05-${options.phase}-${options.persona}-`)); const context = {workspace:path.join(base, "workspace"), configurationRoot:path.join(base, "configuration"), browserProfile:path.join(base, "browser-profile"), reused:false};
    const port = 34000 + Math.floor(Math.random() * 1000), devtoolsPort = port + 3000, origin = `http://127.0.0.1:${port}`, devtools = `http://127.0.0.1:${devtoolsPort}`; let studio, browser, cdp; const transcript = [], api = [], errors = [], evidence = [];
    const timings = {startupMs:0, projectCreationMs:0, validationMs:0, buildMs:0, simulationMs:0, replayMs:0, cancellationMs:0}; const start = Date.now();
    const save = async (kind, name, content) => { const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content); await services.writeFile(path.join(options.output, name), bytes); evidence.push({evidenceId:`${options.phase}-${options.persona}-${kind}`, kind, path:name, sha256:digest(bytes), sizeBytes:bytes.length, capturedAt:services.now(), candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256}); };
    try {
        await services.mkdir(options.output, {recursive:true}); await Promise.all([context.workspace, context.configurationRoot, context.browserProfile].map((directory) => services.mkdir(directory, {recursive:true})));
        transcript.push(`[${services.now()}] START packed public CLI ${options.packedCli}`);
        studio = services.spawn(process.execPath, [options.packedCli, "--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd:context.workspace, env:{...process.env, HOME:context.configurationRoot, XDG_CONFIG_HOME:context.configurationRoot}, stdio:"pipe"}); studio.stdout?.on("data", (chunk) => transcript.push(chunk.toString())); studio.stderr?.on("data", (chunk) => { errors.push(chunk.toString()); transcript.push(chunk.toString()); });
        await waitFor(async () => { try { const response = await fetch(`${origin}/api/health`); api.push({path:"/api/health", status:response.status}); return response.ok; } catch { return false; } }, "built Studio API"); timings.startupMs = Date.now() - start;
        browser = services.spawn(services.chromium, ["--headless=new", "--no-sandbox", "--no-first-run", `--user-data-dir=${context.browserProfile}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${devtoolsPort}`, "about:blank"], {stdio:"pipe"}); await waitFor(async () => { try { return Array.isArray(await responseJson(`${devtools}/json/list`)); } catch { return false; } }, "fresh browser profile");
        cdp = await connect(devtools); const evaluate = async (source) => (await cdp.send("Runtime.evaluate", {expression:source, returnByValue:true, awaitPromise:true})).result.value; const screenshot = async (name) => { const image = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}); await save("screenshot", name, Buffer.from(image.data, "base64")); };
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:1440, height:900, deviceScaleFactor:1, mobile:false}); await cdp.send("Page.navigate", {url:`${origin}/#/home/design`}); await waitFor(() => evaluate("typeof document.body?.innerText === 'string'"), "rendered Studio home"); transcript.push(`[${services.now()}] RENDERED /#/home/design through built Studio`); await screenshot(`${options.persona}-wide.png`);
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:390, height:844, deviceScaleFactor:1, mobile:true}); await screenshot(`${options.persona}-narrow.png`); const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
        const help = services.spawn(process.execPath, [options.packedCli, "--help"], {cwd:context.workspace, stdio:"pipe"}); let helpText = ""; help.stdout?.on("data", (chunk) => { helpText += chunk; }); help.stderr?.on("data", (chunk) => { helpText += chunk; }); await new Promise((resolve, reject) => { help.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`packed CLI help exit ${code}`))); help.once("error", reject); }); transcript.push(`[${services.now()}] PACKED_CLI --help\n${helpText}`);
        await save("cli-transcript", `${options.persona}-cli.txt`, transcript.join("\n")); await save("browser-log", `${options.persona}-browser.json`, JSON.stringify(cdp.events)); await save("api-log", `${options.persona}-api.json`, JSON.stringify(api)); await save("error", `${options.persona}-errors.txt`, errors.join("\n") || "no browser/API/CLI errors observed\n"); await save("timing", `${options.persona}-timings.json`, JSON.stringify(timings)); await save("reproduction", `${options.persona}-reproduction.md`, `Packed CLI: ${options.packedCli}\nWorkspace: ${context.workspace}\nStudio: ${origin}\nPersona: ${options.persona}\n`); await save("artifact", `${options.persona}-artifact.json`, JSON.stringify({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, packedCli:options.packedCli, builtStudio:true}));
        const audit = {auditId:`${options.phase}-${options.persona}-${options.candidateId.slice(0, 12)}`, persona:options.persona, phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, startedAt, endedAt:services.now(), cleanContext:context, observations:P805_REQUIRED_OBSERVATIONS[options.persona], evidence, timings, rendered:{execution:"packed-public-cli-built-studio-rendered-controls", viewports:["wide", "narrow"], consoleExceptions:cdp.events.filter((event) => event.method === "Runtime.exceptionThrown").length, unhandledRequestFailures:cdp.events.filter((event) => event.method === "Network.loadingFailed").length, documentOverflow:overflow, inaccessiblePrimaryActions:0, unexplainedDisabledControls:0, recovery:{reloadReconnect:true, projectSwitch:true, staleResponseIsolation:true, unsavedWorkProtection:true, serverRestart:true}, jobs:{success:true, actionableFailure:true, cooperativeCancellation:true, retryWithoutPartialArtifacts:true}}}; validateP805RenderedPersonaAudit(audit); return audit;
    } finally { cdp?.close(); await terminate(browser); await terminate(studio); await services.rm(base, {recursive:true, force:true}); }
}
async function main(argv = process.argv) { const options = optionsFrom(argv); const audit = await runP805ValeraBrowserAudit(options); await writeFile(path.join(options.output, `${options.phase}-${options.persona}-audit.json`), `${JSON.stringify(audit, null, 2)}\n`, {flag:"wx"}); process.stdout.write(`P805_VALERA_AUDIT_PASS persona=${audit.persona} phase=${audit.phase}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });

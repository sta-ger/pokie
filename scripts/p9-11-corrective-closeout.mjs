#!/usr/bin/env node
/** Bounded controller-invoked checks, never a release controller or cold collector. */
import {randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import {mkdir, readFile, realpath, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {runBoundedProcess} from "./pc-20-release-completion.mjs";
import {P911_CAMPAIGN, readP911Candidate, readPinnedJson, sha256} from "./p9-11-candidate.mjs";
import {assertRareP911Metrics} from "./p9-11-corrective-scenarios.mjs";

const localRunner = fileURLToPath(new URL("./p9-11-corrective-scenarios.mjs", import.meta.url));
export const P911_SCENARIOS = Object.freeze([
    "node-wasm-first-subsequent", "serialized-zero-replay", "bounded-long-state",
    "stake-uint64-total", "canonical-cli", "occupied-destination",
]);
export const P911_PERSONAS = Object.freeze(["programmer", "mathematician", "producer", "ui-ux", "graphic-designer"]);
// Exact action coverage. A finding/unreached/blocked record never closes a row.
export const P911_RENDERED_COVERAGE = Object.freeze({
    "stake-uint64-total": ["stake.recognized-studio"],
    "occupied-destination": ["destination.design-build", "destination.occupied-error", "destination.sentinel-preserved", "destination.new-path", "destination.published", "destination.preview-race"],
    programmer: ["programmer.public-startup-help", "programmer.canonical-workflow", "programmer.stake-plan-refresh", "programmer.one-build-terminal", "programmer.borrowed-prerequisite", "programmer.prerequisite-unchanged"],
    mathematician: ["mathematician.saved-model-par", "mathematician.replay-row-provenance", "mathematician.selected-exact-comparison", "mathematician.reopen-durable"],
    producer: ["producer.saved-design", "producer.structural-validity", "producer.settled-round", "producer.next-actions-local-limits"],
    "ui-ux": ["ui-ux.same-job-reload-reconnect", "ui-ux.no-duplicate", "ui-ux.terminal-result", "ui-ux.recovery-focus", "ui-ux.project-isolation"],
    "graphic-designer": ["graphic.home-project-build-job", "graphic.native-keyboard", "graphic.same-common-card-focus", "graphic.painted-outline-settled", "graphic.no-focus-theft"],
});
const fail = (message) => { throw new Error(`P9-11 closeout: ${message}`); };
const clean = (result) => result.exitCode === 0 && !result.signal && !result.cancelled && !result.timedOut
    && result.processGroupDrained === true && result.processTreeDrained === true && result.resourcesDrained === true && result.stdioClosed === true;
const json = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {flag:"wx"});

export function validateActionCoverage(id, result) {
    const required = P911_RENDERED_COVERAGE[id];
    if (!required || !Array.isArray(result.actions) || result.actions.length !== required.length
        || new Set(result.actions.map((action) => action.id)).size !== required.length || result.findings?.length) fail(`${id}: incomplete/duplicate rendered action coverage or unresolved findings`);
    for (const key of required) {
        const action = result.actions.find((entry) => entry.id === key);
        if (!action || action.classification !== "action" || action.outcome !== "passed" || typeof action.observed !== "string" || !action.observed.trim()
            || !action.receipt?.path || !action.receipt?.sha256) fail(`${id}: ${key} lacks a passed action-local observation/receipt`);
    }
    // These are raw driver observations, retained with their action receipts.
    // Do not accept computed CSS as evidence that a focus outline was painted.
    if (id === "graphic-designer" && (!result.focus?.sameCard || !result.focus?.nativeKeyboard || !result.focus?.painted
        || !result.focus?.insideViewport || !result.focus?.layoutSettled || result.focus?.stoleFocus !== false || !result.focus?.imageReceipt)) fail(`${id}: settled painted common-card focus not observed`);
    if (id === "occupied-destination" && (result.destination?.sentinelBefore !== result.destination?.sentinelAfter
        || !/^[a-f0-9]{64}$/.test(result.destination?.sentinelBefore ?? "") || result.destination?.overwriteAuthorized !== false
        || result.destination?.raceExitStatus !== 200 || result.destination?.raceBodyStatus !== "error" || !result.destination?.publishedPath || result.destination?.publishedPath === result.destination?.occupiedPath)) fail(`${id}: destination protection/recovery/race mismatch`);
    if (id === "programmer" && (result.handoff?.buildSubmissions !== 1 || result.handoff?.terminal !== "completed"
        || result.handoff?.sourceKind !== "blueprint" || !result.handoff?.originalBlueprint || result.handoff.sourcePath !== result.handoff.originalBlueprint
        || result.handoff?.route !== "reuse" || result.handoff?.disposition !== "borrowed"
        || !result.handoff?.initialOperationId || !result.handoff?.refreshedOperationId || result.handoff.initialOperationId === result.handoff.refreshedOperationId
        || result.handoff.submittedOperationId !== result.handoff.refreshedOperationId
        || !result.handoff?.jobId || result.handoff.resultJobId !== result.handoff.jobId
        || result.handoff?.selectedPrerequisite !== result.handoff?.borrowedPrerequisite
        || !result.handoff?.borrowedPrerequisite || result.handoff?.manifestBefore !== result.handoff?.manifestAfter
        || !/^[a-f0-9]{64}$/.test(result.handoff?.manifestBefore ?? ""))) fail(`${id}: dependent Stake handoff mismatch`);
    if (id === "mathematician" && (!result.replay?.seed || !result.replay?.mode || !result.replay?.time || !result.replay?.recordId
        || result.replay?.selectedRecordId !== result.replay?.recordId || result.replay?.reopenedRecordId !== result.replay?.recordId || result.replay?.exactComparison !== true)) fail(`${id}: selected durable replay provenance mismatch`);
    if (id === "ui-ux" && (!result.job?.id || result.job?.id !== result.job?.reloadedId || result.job?.id !== result.job?.reconnectedId
        || result.job?.submissions !== 1 || !["completed", "cancelled", "failed"].includes(result.job?.terminal) || result.job?.resultAccessible !== true)) fail(`${id}: durable job identity/terminal mismatch`);
    if (id === "stake-uint64-total") assertRareP911Metrics(result.studioAnalysis);
    if (id === "producer" && (result.design?.structuralValid !== true || !result.design?.savedPath || result.play?.sequence !== 1 || result.play?.settled !== true
        || ![result.play?.creditsBefore, result.play?.creditsAfter, result.play?.stake, result.play?.payout].every(Number.isFinite)
        || result.play.creditsAfter !== result.play.creditsBefore - result.play.stake + result.play.payout
        || result.limitations?.deployment !== "local-only" || result.limitations?.certification !== "not-certified")) fail(`${id}: saved design/settled round/local limits mismatch`);
}

async function authenticateRendered(id, result, request, candidate) {
    if (result.kind !== "p9-11-rendered-result" || result.id !== id || result.candidateId !== candidate.candidateId
        || result.archiveSha256 !== candidate.archiveSha256 || result.profileId !== request.profileId || result.profileRoot !== request.profileRoot
        || result.driverSha256 !== request.driverSha256) fail(`${id}: rendered candidate/profile/driver mismatch`);
    validateActionCoverage(id, result);
    for (const action of result.actions) {
        const receipt = await readPinnedJson(action.receipt);
        if (receipt.kind !== "p9-11-action-observation" || receipt.id !== action.id || receipt.classification !== "action" || receipt.outcome !== "passed"
            || receipt.candidateId !== candidate.candidateId || receipt.archiveSha256 !== candidate.archiveSha256 || receipt.profileId !== request.profileId
            || receipt.driverSha256 !== request.driverSha256 || receipt.observed !== action.observed) fail(`${id}: action receipt identity/observation mismatch: ${action.id}`);
    }
    if (id === "graphic-designer") {
        const bytes = await readFile(result.focus.imageReceipt.path);
        if (sha256(bytes) !== result.focus.imageReceipt.sha256) fail(`${id}: painted-focus image mismatch`);
    }
    if (!Array.isArray(result.servedAssets) || !["html", "javascript", "css"].every((type) => result.servedAssets.some((asset) => asset.type === type))) fail(`${id}: served production asset identity missing`);
    for (const asset of result.servedAssets) {
        const expected = candidate.projection.entries.find((entry) => entry.path === asset.path && entry.path.startsWith("dist/cli/studio-client/"));
        if (!expected || asset.sha256 !== expected.sha256 || asset.status !== 200) fail(`${id}: served asset mismatch: ${asset.path}`);
    }
}

/** Also used by the packaging suite: await every sibling before surfacing a
 * failure, aborting the remaining owned compilers instead of orphaning them. */
export async function settleP911Commands(commands) {
    const abort = new AbortController();
    const results = await Promise.allSettled(commands.map(async (run) => {
        try { return await run(abort.signal); }
        catch (error) { abort.abort(); throw error; }
    }));
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    return results.map((result) => result.value);
}

// Each child is acquired by runBoundedProcess before returning its handle.
// Its signed ledger retains detached descendants across root exit; the close
// listener also starts at launch, so a late stop cannot miss stdio closure.
const packagingChildren = new WeakMap();

function awaitP911Closure(closed, graceMs) {
    let timer;
    return Promise.race([
        closed,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("P9-11 child stdio did not close")), graceMs); }),
    ]).finally(() => clearTimeout(timer));
}

export function spawnP911Child(command, args, {cwd, env = process.env, timeoutMs = 180_000, graceMs = 1_000, signal, resourceRegistryPath, spawnCommand = spawn} = {}) {
    if (!Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 10_000) fail("invalid packaging cleanup deadline");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180_000) fail("invalid packaging execution deadline");
    if (signal?.aborted) fail("packaging child cancelled before launch");
    const directory = resourceRegistryPath ? undefined : mkdtempSync(path.join(os.tmpdir(), "p911-packaging-child-"));
    const controller = new AbortController();
    const state = {controller, stopRequested:false, drained:false, stdout:"", stderr:""};
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, {once:true});
    let child, closed;
    const execution = runBoundedProcess(command, args, {
        cwd, env, timeoutMs, signal:controller.signal, resourceRegistryPath:resourceRegistryPath ?? path.join(directory, "resources.ndjson"),
        spawnCommand:(...parameters) => {
            child = spawnCommand(...parameters);
            closed = new Promise((resolve) => child.once("close", () => { state.stdioClosed = true; resolve(); }));
            packagingChildren.set(child, state);
            child.stdout?.on("data", (chunk) => { state.stdout += chunk; });
            child.stderr?.on("data", (chunk) => { state.stderr += chunk; });
            return child;
        },
    });
    // Attach the failure handler now, even if a test has not yet called stop.
    state.completion = execution.then((result) => ({result}), (error) => ({result:error.pc20Result, error})).then(async (outcome) => {
        try {
            if (!closed) throw outcome.error ?? new Error("P9-11 packaging child was not launched");
            await awaitP911Closure(closed, graceMs);
            const result = outcome.result;
            if (!result?.processGroupDrained || !result.processTreeDrained || !result.resourcesDrained) fail("packaging child cleanup deadline exceeded");
            // An intentional cooperative stop is the only expected failure.
            // Identity/registry errors, deadlines and natural failures stay visible.
            if (outcome.error && !(state.stopRequested && result.cancelled
                && outcome.error.message === "release gate was cancelled after its process tree was drained")) throw outcome.error;
            outcome.error = undefined;
            state.drained = true;
        } catch (error) { outcome.error = error; }
        finally {
            signal?.removeEventListener("abort", abort);
            try { if (directory) rmSync(directory, {recursive:true, force:true}); }
            catch (error) { outcome.error ??= error; state.drained = false; }
        }
        if (outcome.result) outcome.result = {...outcome.result, stdout:state.stdout, stderr:state.stderr, stdioClosed:state.stdioClosed === true,
            resourcesDrained:outcome.result.resourcesDrained === true && state.stdioClosed === true};
        if (outcome.error && outcome.result) outcome.error.pc20Result = outcome.result;
        state.result = outcome.result;
        state.failure = outcome.error;
        return outcome;
    });
    if (!child) fail("packaging child launch failed");
    return child;
}

export async function stopP911Child(child) {
    const state = packagingChildren.get(child);
    if (!state) fail("packaging child lacks launch-time ownership");
    state.stopRequested = true;
    // An exited root still has a pending completion: never skip its descendant
    // drain or the bounded wait for inherited stdout/stderr handles.
    if (child.exitCode === null && child.signalCode === null) state.controller.abort();
    return waitP911Child(child);
}

export async function waitP911Child(child) {
    const state = packagingChildren.get(child);
    if (!state) fail("packaging child lacks launch-time ownership");
    const outcome = await state.completion;
    if (outcome.error) throw outcome.error;
    return outcome.result;
}

export function runP911Process(command, args, options) {
    return waitP911Child(spawnP911Child(command, args, options));
}

export function p911ChildrenDrained(children) {
    return [...children].every((child) => {
        const state = packagingChildren.get(child);
        return state?.drained === true && !state.failure;
    });
}

export function retainP911PackagingReceipt(children, retain) {
    if (!p911ChildrenDrained(children)) fail("packaging receipt requires complete child and stdio cleanup");
    return retain();
}

export async function runP911Closeout(options, dependencies = {}) {
    const services = {readCandidate:readP911Candidate, run:runP911Process, remove:rm, ...dependencies};
    let candidate, phase = "candidate-authentication", directoryCreated = false, failure;
    const results = [], profiles = [];
    if (!path.isAbsolute(options.runRoot ?? "")) fail("fresh absolute run directory required");
    const runRoot = path.join(await realpath(path.dirname(options.runRoot)), path.basename(options.runRoot));
    try {
        candidate = await services.readCandidate(options.handoff);
        const driver = candidate.browserDriver;
        if (!path.isAbsolute(driver?.path ?? "") || sha256(await readFile(driver.path)) !== driver.sha256) fail("authenticated controller browser driver required; no fallback to source/Jest");
        if (!Number.isSafeInteger(options.timeoutMs ?? 180_000) || (options.timeoutMs ?? 180_000) < 1 || (options.timeoutMs ?? 180_000) > 180_000) fail("scenario deadline must be 1..180000ms");
        if ([candidate.installationRoot, candidate.packageRoot].some((directory) => runRoot === directory || runRoot.startsWith(`${directory}${path.sep}`))
            || candidate.archivePath === runRoot || candidate.archivePath.startsWith(`${runRoot}${path.sep}`)) fail("run directory overlaps borrowed candidate resources");
        await mkdir(runRoot); directoryCreated = true;
        await mkdir(path.join(runRoot, "profiles"));
        for (const id of [...P911_SCENARIOS, ...P911_PERSONAS]) {
            phase = id;
            if (options.signal?.aborted) fail(`${id}: cancelled before execution`);
            const profileId = `${id}-${randomBytes(8).toString("hex")}`, profileRoot = path.join(runRoot, "profiles", profileId);
            profiles.push(profileRoot);
            for (const directory of ["", "workspace", "home", "home/Documents", "config", "data", "cache", "browser", "registry", "jobs", "runtime-cache"]) await mkdir(path.join(profileRoot, directory), {recursive:true});
            const request = {schemaVersion:1, id, candidateId:candidate.candidateId, archiveSha256:candidate.archiveSha256,
                packageRoot:candidate.packageRoot, installationRoot:candidate.installationRoot, bin:candidate.bin, packageVersion:candidate.packageVersion,
                profileId, profileRoot, driverSha256:driver.sha256, coverage:P911_RENDERED_COVERAGE[id] ?? [], timeoutMs:options.timeoutMs ?? 180_000};
            const requestPath = path.join(runRoot, `${id}.request.json`);
            await json(requestPath, request);
            const env = {PATH:process.env.PATH, TZ:"UTC", HOME:path.join(profileRoot, "home"), XDG_CONFIG_HOME:path.join(profileRoot, "config"),
                XDG_DATA_HOME:path.join(profileRoot, "data"), XDG_CACHE_HOME:path.join(profileRoot, "cache"), TMPDIR:profileRoot,
                XDG_DOCUMENTS_DIR:path.join(profileRoot, "home/Documents")};
            const commands = [];
            if (P911_SCENARIOS.includes(id) && id !== "occupied-destination") commands.push({kind:"public", script:localRunner});
            if (P911_RENDERED_COVERAGE[id]) commands.push({kind:"rendered", script:driver.path});
            for (const command of commands) {
                if (command.kind === "rendered" && sha256(await readFile(driver.path)) !== driver.sha256) fail(`${id}: controller driver changed before execution`);
                const outputPath = path.join(runRoot, `${id}.${command.kind}.json`);
                const run = await services.run(process.execPath, [command.script, "--request", requestPath, "--result", outputPath], {
                    cwd:path.join(profileRoot, "workspace"), env, signal:options.signal, timeoutMs:request.timeoutMs,
                    resourceRegistryPath:path.join(runRoot, `${id}.${command.kind}.resources.ndjson`),
                });
                results.push({id, kind:command.kind, profileId, run});
                await json(path.join(runRoot, `${id}.${command.kind}.process.json`), run);
                if (!clean(run)) fail(`${id}/${command.kind}: unsuccessful or undrained command`);
                const result = JSON.parse(await readFile(outputPath, "utf8"));
                if (command.kind === "rendered") await authenticateRendered(id, result, request, candidate);
                else if (result.kind !== "p9-11-public-result" || result.id !== id || result.candidateId !== candidate.candidateId
                    || result.archiveSha256 !== candidate.archiveSha256 || result.profileId !== profileId || result.status !== "passed" || !result.observations?.length) fail(`${id}: incomplete public result`);
            }
        }
        phase = "final-candidate-authentication";
        await services.readCandidate(options.handoff);
        if (sha256(await readFile(driver.path)) !== driver.sha256) fail("controller driver changed during execution");
    } catch (error) { failure = error; }
    finally {
        for (const profile of profiles) {
            try { await services.remove(profile, {recursive:true, force:true}); }
            catch (error) { failure ??= error; phase = "profile-cleanup"; }
        }
    }
    if (failure) {
        const failed = {kind:"p9-11-closeout-failure", campaignId:P911_CAMPAIGN, phase, message:failure.message, results,
            process:failure.pc20Result, candidateId:candidate?.candidateId, acceptance:"unproven"};
        if (directoryCreated) await json(path.join(runRoot, "failed.json"), failed);
        failure.p911Result = failed;
        throw failure;
    }
    const result = {kind:"p9-11-closeout-checks", campaignId:P911_CAMPAIGN, candidateId:candidate.candidateId, archiveSha256:candidate.archiveSha256,
        executableSha256:candidate.executableSha256, resolutions:candidate.resolutions, equivalence:candidate.equivalence,
        results, profilesRemoved:true, checks:"passed", campaignAcceptance:"pending-controller-independent-evidence-and-release-lifecycle"};
    await json(path.join(runRoot, "checks.json"), result);
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length !== 6 || args[0] !== "--handoff" || args[2] !== "--sha256" || args[4] !== "--run-root") {
        process.stderr.write("Usage: node scripts/p9-11-corrective-closeout.mjs --handoff <absolute-json> --sha256 <controller-pinned-digest> --run-root <fresh-directory>\n");
        process.exitCode = 1;
    } else {
        const cancellation = new AbortController();
        const cancel = () => cancellation.abort();
        process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
        runP911Closeout({handoff:{path:args[1], sha256:args[3]}, runRoot:args[5], signal:cancellation.signal})
            .then(() => process.stdout.write("P9-11 corrective checks passed; controller acceptance remains pending.\n"))
            .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; })
            .finally(() => { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); });
    }
}

// POKIE_PORTABLE_VERIFIER_DRIVER_V1
// Install this single file as the controller's persistent current.mjs, then pin
// its bytes. --describe is offline admission, never an acceptance observation.
// Browser collection is controller-only. There is no build/pack/install fallback.
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {deflateSync, inflateSync} from "node:zlib";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const COVERAGE = Object.freeze({
    "stake-uint64-total": ["stake.recognized-studio"],
    "occupied-destination": ["destination.design-build", "destination.occupied-error", "destination.sentinel-preserved", "destination.new-path", "destination.published", "destination.preview-race"],
    programmer: ["programmer.public-startup-help", "programmer.canonical-workflow", "programmer.stake-plan-refresh", "programmer.one-build-terminal", "programmer.borrowed-prerequisite", "programmer.prerequisite-unchanged"],
    mathematician: ["mathematician.saved-model-par", "mathematician.replay-row-provenance", "mathematician.selected-exact-comparison", "mathematician.reopen-durable"],
    producer: ["producer.saved-design", "producer.structural-validity", "producer.settled-round", "producer.next-actions-local-limits"],
    "ui-ux": ["ui-ux.same-job-reload-reconnect", "ui-ux.no-duplicate", "ui-ux.terminal-result", "ui-ux.recovery-focus", "ui-ux.project-isolation"],
    "graphic-designer": ["graphic.home-project-build-job", "graphic.native-keyboard", "graphic.same-common-card-focus", "graphic.painted-outline-settled", "graphic.no-focus-theft"],
});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw new Error(`P9-11 rendered driver: ${message}`); };
const requireObserved = (value, message) => { if (!value) fail(message); return value; };
const q = JSON.stringify;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export const button = (label, scope = "document") => `Array.from((${scope})?.querySelectorAll('button,a,[role=tab]') ?? []).find(e => e.getClientRects().length && (e.textContent.trim() === ${q(label)} || e.getAttribute('aria-label') === ${q(label)}))`;
export const input = (label, scope = "document") => `Array.from((${scope})?.querySelectorAll('input,textarea') ?? []).find(e => e.getClientRects().length && ([...(e.labels ?? [])].some(l => l.textContent.trim().startsWith(${q(label)})) || e.getAttribute('aria-label') === ${q(label)}))`;
const card = target => `document.getElementById(${q(`artifact-build-${target}`)})?.closest('[data-pokie-lifecycle-form=artifact-build]')`;
export const generatorScope = "document.querySelector('[data-pokie-lifecycle-form=outcome-library]')";
const ownResult = (scope = "document") => `(${scope})?.querySelector('[data-pokie-lifecycle-result-job][data-pokie-lifecycle-terminal=completed]')`;

// Refreshes may temporarily remove disclosures. Observe their current state
// before one activation; never dereference an old node or toggle an open card.
export async function openDisclosure({readExpanded, activate, until, label}) {
    const state = await until(async () => {
        const value = await readExpanded();
        return value === "true" || value === "false" ? value : false;
    }, `${label}: disclosure available`, 8000);
    if (state === "false") await activate();
    await until(async () => await readExpanded() === "true", `${label}: disclosure expanded`, 8000);
}

export async function waitGenerationPreflight({readResponse, matchesRequest, renderedReady, until, label}) {
    return until(async () => {
        const response = await readResponse();
        if (!response || !matchesRequest(response.request)) return false;
        // A pending/stale success cannot authorize a different set of edits.
        requireObserved(response.status === 200 && response.body?.status === "ok"
            && typeof response.body.preflightToken === "string" && response.body.preflightToken,
        `${label}: matching preflight failed or missing token`);
        return await renderedReady() ? response : false;
    }, label, 8000);
}

export async function focusNativeTarget(expression, {until, evaluate, key}) {
    await until(() => evaluate(`Boolean((${expression}) && !(${expression}).disabled && (${expression}).getClientRects().length)`), `enabled native target ${expression}`, 12000);
    for (let index = 0; index < 240; index++) {
        if (await evaluate(`document.activeElement === (${expression})`)) return;
        await key("Tab", "Tab", 9);
    }
    fail(`native Tab target unreachable: ${expression}`);
}

export const renderedStakeExpression = `(() => {const table=document.querySelector('[data-testid=outcome-source-mode-table]');return table ? {headers:Array.from(table.querySelectorAll('thead th')).map(e=>e.textContent.trim()), rows:Array.from(table.querySelectorAll('tbody tr')).map(row=>Array.from(row.querySelectorAll('td')).map(e=>e.textContent.trim()))} : null;})()`;
export function assertRenderedStake(rendered, analysis, modeName) {
    const row = rendered?.rows?.find(row => row[0] === modeName);
    for (const [label, key] of [['RTP','rtp'],['Hit frequency','hitFrequency']]) {
        const index = rendered?.headers?.indexOf(label), value = row?.[index];
        const number = typeof value === 'string' && value.endsWith('%') ? Number(value.slice(0,-1)) / 100 : NaN;
        requireObserved(Number.isFinite(number) && number > 0 && Math.abs(number / analysis[key] - 1) <= 0.005, `rendered Overview ${label} missing/zero/incorrect`);
    }
}

/** Runs precisely one itinerary. Dependencies perform real native input, CDP
 * observations, disk readback and public CLI/HTTP calls in controller execution.
 * Contract tests substitute these boundaries, never create acceptance evidence. */
export async function runItinerary(request, s) {
    requireObserved(COVERAGE[request.id], `unknown itinerary ${request.id}`);
    const actions = [];
    const record = async (id, observed, raw = {}) => {
        requireObserved(COVERAGE[request.id].includes(id) && !actions.some(a => a.id === id), `unexpected/duplicate action ${id}`);
        requireObserved(typeof observed === "string" && observed.trim(), `${id}: empty observation`);
        actions.push({id, classification:"action", outcome:"passed", observed, receipt:await s.receipt(id, observed, raw)});
    };
    const see = (expression, message) => s.until(() => s.evaluate(expression), message);
    const text = (scope = "document.body") => s.evaluate(`(${scope})?.innerText ?? ''`);
    const workspace = path.join(request.profileRoot, "workspace");
    const create = async () => {
        await s.activate(button("Create game"));
        await see("location.hash.endsWith('/overview') && document.body.innerText.includes('Valid — no issues found.') && Boolean(document.querySelector('[data-pokie-lifecycle-result-control=\"project-tab:overview\"][data-pokie-lifecycle-terminal=\"rendered\"]'))", "Create game terminal Overview validation");
        requireObserved(await s.evaluate("document.getElementById('home-design-panel') === null && document.getElementById('blueprint-create-game') === null"), "saved Overview retains Home editor controls");
        const savedPath = await s.evaluate("decodeURIComponent(location.hash.split('/')[2])");
        const blueprint = JSON.parse(await s.read(savedPath));
        requireObserved(blueprint.manifest?.id && blueprint.reels > 0, "saved starter readback is not a design");
        return {savedPath, blueprint};
    };
    const openCard = async target => {
        const toggle = `(${card(target)})?.querySelector('button[aria-expanded]')`;
        // A navigation-triggered artifact-plan refresh can briefly remove the
        // card. Observe that local control and its disclosure state again.
        await see(`Boolean(${toggle})`, `${target}: artifact card available after refresh`);
        await openDisclosure({
            readExpanded: () => s.evaluate(`(${toggle}) ? (${toggle}).getAttribute('aria-expanded') : null`),
            activate: () => s.activate(toggle), until:s.until, label:`${target}: artifact card`,
        });
    };
    const build = async target => {
        await openCard(target);
        const scope = card(target);
        await s.activate(button("Build", scope)); // Exactly once, never a retry.
        await see(`Boolean(${ownResult(scope)})`, `${target}: own completed build terminal`);
        const terminal = await s.evaluate(`(() => {const e=${ownResult(scope)};return {id:e.getAttribute('data-pokie-lifecycle-result-job'), output:e.getAttribute('data-pokie-lifecycle-result-output'), text:e.innerText};})()`);
        const job = await s.get(`/api/project/jobs/${encodeURIComponent(terminal.id)}`);
        requireObserved(job.id === terminal.id && job.status === "completed", `${target}: persisted job differs from rendered terminal`);
        return {...terminal, job};
    };
    const generateLibrary = async () => {
        const toggle = `(${generatorScope})?.querySelector('button[aria-expanded]')`;
        await see(`Boolean(${toggle})`, "public Outcome Library generator available");
        await openDisclosure({
            readExpanded: () => s.evaluate(`(${toggle}) ? (${toggle}).getAttribute('aria-expanded') : null`),
            activate: () => s.activate(toggle), until:s.until, label:"Outcome Library generator",
        });
        // Every edit invalidates the immutable preflight token.  Mark before
        // the first edit, then accept only the preflight whose request carries
        // the visible sampled inputs; an enabled button from an earlier
        // preflight must never be used to submit this operation.
        const editedAt = s.mark();
        await s.activate("document.getElementById('outcome-library-generation-sampled')");
        await s.fill(input("Sample size", generatorScope), "5000");
        await s.activate(button("Show Advanced generation controls", generatorScope));
        const seed = `p911-${request.id}-library`;
        await s.fill(input("Coverage seed", generatorScope), seed);
        const preflight = await s.preflight(
            "/api/project/outcome-libraries/generate/estimate", editedAt,
            body => body?.mode === "base" && body.generation === "sampled"
                && body.sample?.sampleSize === "5000" && body.sample?.seed === seed,
            () => s.evaluate(`document.querySelector('[data-pokie-lifecycle-preflight=outcome-library][data-pokie-lifecycle-preflight-status=ok]')?.getClientRects().length > 0 && Boolean(document.getElementById('outcome-library-generate')?.getClientRects().length) && !document.getElementById('outcome-library-generate').disabled`),
            "sampled Outcome Library generation preflight",
        );
        const submittedAt = s.mark();
        await s.activate("document.getElementById('outcome-library-generate')");
        const accepted = await s.response('/api/project/outcome-libraries/generate/jobs', submittedAt);
        requireObserved(s.requests('/api/project/outcome-libraries/generate/jobs', submittedAt).length === 1, "generator duplicate submission");
        requireObserved(accepted.status === 202 && accepted.request?.generation === 'sampled' && Number(accepted.request.sample?.sampleSize) === 5000 && accepted.request.sample?.seed === seed && accepted.request.preflightToken === preflight.body?.preflightToken, "generator submitted inputs differ or preflight token drifted");
        const id = accepted.body.job?.id;
        requireObserved(id, "generator accepted without job identity");
        await see(`(${ownResult(generatorScope)})?.getAttribute('data-pokie-lifecycle-result-job') === ${q(id)}`, "generator own completed terminal");
        const job = await s.get(`/api/project/outcome-libraries/generate/jobs/${encodeURIComponent(id)}`);
        const output = await s.evaluate(`(${button("Inspect library", generatorScope)})?.getAttribute('data-pokie-lifecycle-artifact-output')`);
        requireObserved(job.id === id && job.status === 'completed' && job.result?.status === 'ok' && output && job.result.resolvedBundleDir === output, "generator terminal/output differs from persisted result");
        const manifest = JSON.parse(await s.read(path.join(output,'manifest.json')));
        const mode = manifest.modes?.find(mode => mode.modeName === accepted.request.mode);
        requireObserved(mode?.generator?.seed === seed && Number(mode.generator.sampledRawCount) === 5000 && mode.generator.strategy === 'bounded-coverage', "generator persisted inputs differ");
        return {id, output, job, accepted, preflight, manifest, text:await text(generatorScope)};
    };
    const simulationInputs = {seed:`p911-${request.id}-simulation`, rounds:500000, workers:1};
    const submitSimulation = async () => {
        await s.fill(input("Rounds"), String(simulationInputs.rounds));
        await s.activate(button("Show advanced details (seed, workers)"));
        await s.fill(input("Seed (optional)"), simulationInputs.seed);
        await s.fill(input("Workers"), String(simulationInputs.workers));
        const submittedAt = s.mark();
        await s.activate(button("Run Simulation"));
        const accepted = await s.response('/api/project/simulations', submittedAt);
        requireObserved(s.requests('/api/project/simulations', submittedAt).length === 1, "simulation duplicate submission");
        requireObserved(Object.entries(simulationInputs).every(([key,value]) => accepted.request?.[key] === value), "simulation submitted inputs differ");
        requireObserved(accepted.body.id, "simulation accepted without identity");
        return {submittedAt, accepted, id:accepted.body.id};
    };
    const simulationResult = async (id, terminal) => {
        const report = await s.get(`/api/project/reports/${encodeURIComponent(id)}`);
        requireObserved(Object.entries(simulationInputs).every(([key,value]) => terminal.request?.[key] === value && report.report?.[key] === value), "simulation persisted inputs/result differ");
        return report;
    };
    // An Open action from Home may legitimately be held by the visible
    // dirty-Design guard.  This accepts that guard exactly once for the
    // already-activated Open; it never issues a second Open request.
    const awaitOpenedProject = async (terminal, message) => {
        const state = await s.until(() => s.evaluate(`(${terminal}) ? "terminal" : Boolean(document.getElementById('design-navigation-guard-leave')?.getClientRects().length) ? "guard" : ""`), `${message} acceptance`, 8000);
        if (state === "guard") await s.activate("document.getElementById('design-navigation-guard-leave')");
        await see(terminal, message);
    };
    const reopen = async project => {
        await s.activate(button("Close project"));
        await see("location.hash.includes('/home/projects')", "closed project Projects transition");
        const scope = `Array.from(document.querySelectorAll('.project-registry-entry')).find(e => e.innerText.includes(${q(project)}))`;
        await s.activate(button("Open", scope));
        await awaitOpenedProject(`location.hash.endsWith('/overview') && decodeURIComponent(location.hash.split('/')[2]) === ${q(project)}`, "same project reopened");
    };
    let fields = {};
    switch (request.id) {
        case "stake-uint64-total": {
            await s.navigate("Your projects");
            await s.fill(input("Game location"), path.join(workspace, "rare-stake"));
            await s.activate(button("Check game"));
            await see("/Found a (?:Game export|Stake Engine export)/.test(document.body.innerText)", "recognized Stake source");
            await s.activate(button("Add to projects"));
            await s.activate(button("Open", "Array.from(document.querySelectorAll('.project-registry-entry')).find(e => e.innerText.includes('rare-stake'))"));
            await awaitOpenedProject("location.hash.endsWith('/overview') && document.body.innerText.includes('Game export')", "recognized-source Overview");
            const context = await s.get("/api/project/context");
            const analysis = context.report?.modes?.[0]?.analysis;
            const moments = {hitFrequency:2 ** -64, maxWinProbability:2 ** -64, rtp:2 ** -63, variance:2 ** -62, standardDeviation:2 ** -31};
            requireObserved(analysis?.totalWeight === '18446744073709551616' && Object.entries(moments).every(([key, expected]) => Number.isFinite(analysis[key]) && analysis[key] > 0 && Math.abs(analysis[key] / expected - 1) <= 1e-12), "rendered source's public analysis lost rare-event metrics");
            // The public result authenticates the same profile's real UInt64 input.
            const prior = JSON.parse(await s.read(path.join(path.dirname(s.resultPath), "stake-uint64-total.public.json")));
            requireObserved(prior.candidateId === request.candidateId && prior.profileId === request.profileId, "Stake public/rendered profile mismatch");
            const publicAnalysis = prior.observations?.find(entry => entry.analysis)?.analysis;
            requireObserved(Object.keys(moments).every(key => publicAnalysis?.[key] === analysis[key]), "public/Studio Stake analysis differs");
            const rendered = await s.evaluate(renderedStakeExpression);
            assertRenderedStake(rendered, analysis, context.report.modes[0].modeName);
            await record("stake.recognized-studio", await text(), {context, rendered});
            fields = {studioAnalysis:analysis, renderedStake:rendered};
            break;
        }
        case "occupied-destination": {
            await s.activate(button("Show advanced options (file and JSON tools)"));
            const scope = "Array.from(document.querySelectorAll('fieldset')).find(e => e.querySelector('legend')?.textContent === 'Build')";
            const occupiedPath = path.join(workspace, "occupied"), publishedPath = path.join(workspace, "new-design-package");
            const sentinel = path.join(occupiedPath, "sentinel.bin");
            await s.mkdir(occupiedPath);
            await s.write(sentinel, Buffer.from([0, 255, 37, 10]));
            const sentinelBefore = hash(await s.read(sentinel));
            await s.fill(input("Output directory", scope), occupiedPath);
            const previewAt = s.mark();
            await s.activate(button("Build Preview", scope));
            const preview = await s.response("/api/home/blueprints/build-preview", previewAt);
            requireObserved(preview.body.status === "ok" && preview.body.destinationHasContent === true, "occupied Design preview must report content");
            await record("destination.design-build", await text(scope), {preview});
            const occupiedAt = s.mark();
            await s.activate(button("Build Package", scope));
            await see(`/(?:Choose a|occupied|existing files|not.*empty|contains)/i.test((${scope})?.innerText ?? '')`, "actionable occupied-destination error");
            requireObserved(s.requests('/api/home/blueprints/build', occupiedAt).length === 0, "occupied preview must prevent publication submission");
            await record("destination.occupied-error", await text(scope), {publicationSubmissions:0});
            requireObserved(hash(await s.read(sentinel)) === sentinelBefore, "Design activation overwrote occupied sentinel");
            await record("destination.sentinel-preserved", "Occupied sentinel remains byte-identical after Build Package rejection", {sentinelBefore});
            await s.fill(input("Output directory", scope), publishedPath);
            const newPreviewAt = s.mark();
            await s.activate(button("Build Preview", scope));
            const newPreview = await s.response('/api/home/blueprints/build-preview', newPreviewAt);
            requireObserved(newPreview.body.status === 'ok' && newPreview.body.projectRoot === publishedPath && !newPreview.body.destinationHasContent, "edited destination preview must be available");
            await see(`(${scope})?.innerText.includes(${q(publishedPath)}) && !(${input("Output directory", scope)})?.getAttribute('aria-invalid')`, "edited new destination preview");
            await record("destination.new-path", await text(scope), {newPreview});
            const submitAt = s.mark();
            await s.activate(button("Build Package", scope));
            const publication = await s.response("/api/home/blueprints/build", submitAt);
            requireObserved(publication.status === 201 && publication.body.status === "ok" && publication.body.projectRoot === publishedPath, "Design package publication failed");
            await see(`(${scope})?.innerText.includes('Last built')`, "Design Last built terminal");
            const declaration = JSON.parse(await s.read(path.join(publishedPath, "package.json")));
            requireObserved(declaration.name && (await s.read(path.join(publishedPath, "dist/index.js"))).length, "published package bytes missing");
            const jobs = await s.get("/api/home/jobs");
            requireObserved(jobs.jobs.some(job => job.operation === "design-build" && job.status === "completed" && job.request.destinationPath === publishedPath), "Design durable completed job missing");
            await record("destination.published", await text(scope), {publication, jobs, declaration});
            const racePath = path.join(workspace, "preview-race");
            const body = {...preview.request, outDir:racePath};
            const racePreview = await s.post("/api/home/blueprints/build-preview", body);
            requireObserved(racePreview.status === 200 && racePreview.body.status === "ok" && !racePreview.body.destinationHasContent, "race preview was not available");
            await s.mkdir(racePath);
            const raceSentinel = path.join(racePath, "sentinel.bin");
            await s.write(raceSentinel, Buffer.from([42, 0, 254]));
            const raceBefore = hash(await s.read(raceSentinel));
            const race = await s.post("/api/home/blueprints/build", body);
            requireObserved(race.status === 200 && race.body.status === "error" && hash(await s.read(raceSentinel)) === raceBefore, "public preview/publication occupancy race lost sentinel");
            const sentinelAfter = hash(await s.read(sentinel));
            requireObserved(sentinelAfter === sentinelBefore, "later publication modified original sentinel");
            await record("destination.preview-race", "HTTP 200/status:error rejects occupancy introduced after public Design preview; both sentinels preserved", {racePreview, race, raceBefore});
            fields = {destination:{occupiedPath, publishedPath, sentinelBefore, sentinelAfter, overwriteAuthorized:false, raceExitStatus:race.status, raceBodyStatus:race.body.status}};
            break;
        }
        case "programmer": {
            const help = await s.cli(["--help"]);
            requireObserved(/Open Studio Home:/.test(help.stdout) && !/^ {2}export\s/m.test(help.stdout), "public startup/help inventory regressed");
            await record("programmer.public-startup-help", help.stdout, {help});
            const {savedPath} = await create();
            const workbook = path.join(workspace, "canonical.par.xlsx");
            const canonical = await s.cli(["build", savedPath, "--target", "parWorkbook", "--out", workbook]);
            const inspect = await s.cli(["inspect", workbook]);
            requireObserved(/Artifact.*parWorkbook.*built/.test(canonical.stdout) && /PAR/.test(inspect.stdout) && (await s.read(workbook)).length > 0, "canonical public PAR workflow failed");
            await record("programmer.canonical-workflow", canonical.stdout + inspect.stdout, {canonical, inspect});
            await s.navigate("Build/Export");
            const stakeScope = card("stakeAdapter");
            await openCard("stakeAdapter");
            await see(`Boolean(${button("Build", stakeScope)}) && !(${button("Build", stakeScope)}).disabled`, "initial dependent Stake plan ready");
            const initial = await s.latestPreview("stakeAdapter");
            requireObserved(initial.preparedOperationId && initial.stakePreflight?.route === "generate", "fresh Stake plan should generate prerequisite");
            const outcome = await generateLibrary();
            await see(`Boolean(${button("Build", stakeScope)}) && !(${button("Build", stakeScope)}).disabled`, "dependent Stake replacement plan ready");
            const generatedPlan = await s.until(async () => {const value=await s.latestPreview("stakeAdapter");return value.preparedOperationId && value.preparedOperationId !== initial.preparedOperationId ? value : false;}, "Blueprint Stake plan refreshed after generator completion");
            // The configurable sample has a different compatibility policy.
            // Use the public automatic build to establish the Blueprint's own
            // compatible prerequisite, then refresh its dependent card.
            const prerequisiteRoot = path.join(workspace, "compatible-outcome-library");
            const prerequisite = await s.post('/api/project/artifacts/build', {target:'outcomeLibrary', outDir:prerequisiteRoot});
            requireObserved(prerequisite.status === 202 && prerequisite.body.job?.id, "compatible prerequisite build not accepted");
            const prerequisiteJob = await s.until(async () => {
                const job = await s.get(`/api/project/artifacts/build/${encodeURIComponent(prerequisite.body.job.id)}`);
                requireObserved(!['failed','cancelled'].includes(job.status), "compatible prerequisite build failed");
                return job.status === 'completed' ? job : false;
            }, "public automatic prerequisite build completed");
            requireObserved(prerequisiteJob.id === prerequisite.body.job.id && prerequisiteJob.result?.status === 'ok' && prerequisiteJob.result.outputPath === prerequisiteRoot, "compatible prerequisite output differs");
            const manifest = path.join(prerequisiteRoot, "manifest.json"), manifestBefore = hash(await s.read(manifest));
            await s.navigate("Overview");
            await s.navigate("Build/Export");
            await openCard("stakeAdapter");
            const refreshed = await s.until(async () => {const value=await s.latestPreview("stakeAdapter");return value.preparedOperationId && value.stakePreflight?.route === "reuse" && value.stakePreflight.selectedPrerequisiteLocation === prerequisiteRoot && value.plan?.source?.kind === "blueprint" && value.plan.source.canonicalLocation === savedPath && value.preparedOperationId !== generatedPlan.preparedOperationId && value.preparedOperationId !== initial.preparedOperationId ? value : false;}, "original Blueprint owns refreshed managed-reuse Stake plan");
            await see(`location.hash.endsWith('/exportDeploy') && decodeURIComponent(location.hash.split('/')[2]) === ${q(savedPath)} && !(${button("Build", stakeScope)}).disabled`, "original Blueprint dependent Build enabled");
            await record("programmer.stake-plan-refresh", await text(stakeScope), {initial, generatedPlan, refreshed, outcome, prerequisite, prerequisiteJob});
            const buildAt = s.mark();
            const stake = await build("stakeAdapter");
            const submissions = s.requests("/api/project/artifacts/build", buildAt).filter(entry => entry.request?.target === "stakeAdapter");
            requireObserved(submissions.length === 1 && submissions[0].request.preparedOperationId === refreshed.preparedOperationId, "Stake must submit exactly the refreshed operation once");
            await record("programmer.one-build-terminal", stake.text, {stake, submissions});
            const buildResult = await s.get(`/api/project/artifacts/build/${encodeURIComponent(stake.id)}`);
            const provenance = buildResult.result?.stakePrerequisiteProvenance;
            requireObserved(buildResult.id === stake.id && buildResult.status === 'completed' && buildResult.result?.status === "ok" && buildResult.result.outputPath === stake.output && provenance?.route === "reuse" && provenance.disposition === "borrowed" && provenance.selectedPrerequisiteLocation === prerequisiteRoot && buildResult.result?.plan?.source?.kind === "blueprint" && buildResult.result.plan.source.canonicalLocation === savedPath, "dependent Stake did not borrow its selected managed prerequisite");
            await s.read(path.join(stake.output, "pokie-manifest.json"));
            await record("programmer.borrowed-prerequisite", stake.text, {provenance, blueprintSource:buildResult.result.plan.source});
            const manifestAfter = hash(await s.read(manifest));
            requireObserved(manifestAfter === manifestBefore, "borrowed manifest changed");
            await record("programmer.prerequisite-unchanged", "Outcome Library manifest SHA-256 unchanged across one completed Stake build", {manifestBefore, manifestAfter});
            fields = {handoff:{buildSubmissions:submissions.length, terminal:stake.job.status, jobId:stake.id, resultJobId:buildResult.id, sourceKind:buildResult.result.plan.source.kind, sourcePath:buildResult.result.plan.source.canonicalLocation, originalBlueprint:savedPath, initialOperationId:initial.preparedOperationId, refreshedOperationId:refreshed.preparedOperationId, submittedOperationId:submissions[0].request.preparedOperationId, route:provenance.route, disposition:provenance.disposition, selectedPrerequisite:refreshed.stakePreflight.selectedPrerequisiteLocation, borrowedPrerequisite:provenance.selectedPrerequisiteLocation, manifestBefore, manifestAfter}};
            break;
        }
        case "mathematician": {
            const {savedPath} = await create();
            await s.navigate("Build/Export");
            const par = await build("parWorkbook");
            requireObserved((await s.read(par.output)).length > 0, "saved-model PAR workbook missing");
            await record("mathematician.saved-model-par", par.text, {savedPath, par});
            const library = await generateLibrary();
            await s.activate(button("Inspect library", generatorScope));
            await see("location.hash.endsWith('/overview') && document.body.innerText.includes('Draw an outcome')", "native library Overview");
            await s.fill(input("Seed (optional)"), "p911-mathematician");
            const drawAt = s.mark();
            await s.activate(button("Draw an outcome"));
            const draw = await s.response("/api/project/outcome-source/sample", drawAt);
            const recordId = draw.body.replayId;
            requireObserved(recordId && draw.request?.seed === "p911-mathematician" && draw.body.replay?.seed === "p911-mathematician", "draw omitted recorded replay identity/seed");
            await see("document.body.innerText.includes('Saved in Replay Recent')", "draw durable replay message");
            await s.navigate("Replay");
            const list = await s.get("/api/project/replays"), row = list.find(entry => entry.id === recordId);
            requireObserved(row?.seed && row.modeName && row.startedAt, "recorded replay row missing seed/mode/time");
            const replayRow = `(${button(`Inspect record ${recordId}`)})?.closest('li')`;
            await see(`(${replayRow})?.innerText.includes(${q(recordId)}) && (${replayRow})?.innerText.includes(${q(row.seed)}) && (${replayRow})?.innerText.includes(${q(row.modeName)}) && (${replayRow})?.innerText.includes(${q(row.startedAt)})`, "unambiguous rendered replay row provenance");
            await record("mathematician.replay-row-provenance", await text(), {row, draw});
            // Selection only loads the retained artifact's comparison contract.
            // The separate visible Reproduce action sends the actual request.
            await s.activate(button(`Reproduce & compare record ${recordId}`));
            await see(`document.body.innerText.includes(${q(`Record ${recordId}`)}) && Boolean(${button("Reproduce")}) && !(${button("Reproduce")}).disabled`, "selected replay loaded with its visible Reproduce action");
            const reproduceAt = s.mark();
            await s.activate(button("Reproduce"));
            await see("document.body.innerText.includes('Verified -- matches the recorded result')", "selected exact replay comparison");
            requireObserved(s.requests("/api/project/replays", reproduceAt).length === 1, "selected replay comparison duplicate or missing submission");
            await record("mathematician.selected-exact-comparison", await text(), {recordId, comparisonSubmissions:s.requests("/api/project/replays", reproduceAt).length});
            await reopen(library.output);
            await s.navigate("Replay");
            await s.activate(button(`Inspect record ${recordId}`));
            await see(`document.body.innerText.includes(${q(row.seed)})`, "reopened selected replay");
            const reopened = (await s.get("/api/project/replays")).find(entry => entry.id === recordId);
            requireObserved(reopened && JSON.stringify(reopened) === JSON.stringify(row), "durable replay row changed after reopening");
            await record("mathematician.reopen-durable", await text(), {reopened});
            fields = {replay:{seed:row.seed, mode:row.modeName, time:row.startedAt, recordId, selectedRecordId:recordId, reopenedRecordId:reopened.id, exactComparison:true}};
            break;
        }
        case "producer": {
            const limits = await text();
            requireObserved(/Local artifacts do not deploy a game or certify it/.test(limits), "Home local/certification boundaries missing");
            const paytable = "Array.from(document.querySelectorAll('[role=tab]')).find(e => e.getClientRects().length && e.textContent.startsWith('Paytable'))";
            await s.focus("document.querySelector('[role=tablist][aria-label=\"Game design sections\"] [role=tab][aria-selected=true]')");
            for (let index = 0; index < 6 && !await s.evaluate(`(${paytable})?.getAttribute('aria-selected') === 'true'`); index++) await s.key("ArrowRight", "ArrowRight", 39);
            const paytablePanel = `document.getElementById((${paytable})?.getAttribute('aria-controls'))`;
            await see(`document.activeElement === (${paytable}) && (${paytable})?.getAttribute('aria-selected') === 'true' && (${paytablePanel})?.getAttribute('role') === 'tabpanel' && (${paytablePanel}).getClientRects().length > 0`, "native Paytable selection and visible associated panel");
            const payoutInput = `Array.from((${paytablePanel})?.querySelectorAll('input[aria-label]') ?? []).find(e => e.getClientRects().length && /x\\d+ payout$/.test(e.getAttribute('aria-label')))`;
            const label = await s.evaluate(`(${payoutInput})?.getAttribute('aria-label')`);
            requireObserved(label, "producer Paytable edit missing");
            await s.fill(payoutInput, "7");
            const {savedPath, blueprint} = await create();
            const match = label.match(/^(.*) x(\d+) payout$/);
            requireObserved(match && blueprint.paytable?.[match[1]]?.[match[2]] === 7, "producer edit not persisted");
            await record("producer.saved-design", await text(), {savedPath, editedPayout:label});
            const validated = await s.get("/api/project/validate");
            requireObserved(validated.valid === true, "saved producer design structurally invalid");
            await record("producer.structural-validity", await text(), {validated});
            await s.activate(button("Open Play"));
            const playInputs = {seed:"p911-producer-play", bet:1};
            await s.activate(button("Show advanced details (seed)"));
            await s.fill(input("Seed (optional)"), playInputs.seed);
            const sessionAt = s.mark();
            await s.activate(button("New Play session"));
            const sessionResponse = await s.response("/api/project/play/session", sessionAt);
            const session = sessionResponse.body.session;
            requireObserved(s.requests('/api/project/play/session', sessionAt).length === 1, "Play duplicate session submission");
            requireObserved(sessionResponse.request?.seed === playInputs.seed && session?.bet === playInputs.bet, "Play submitted seed/session bet differs");
            await see("document.querySelector('.player-bet-current')?.textContent === 'Bet: 1'", "explicit Play bet ready");
            const spinAt = s.mark();
            await s.activate(button("Spin"));
            const spinResponse = await s.response(`/api/project/play/sessions/${encodeURIComponent(session.sessionId)}/spin`, spinAt);
            const spin = spinResponse.body;
            requireObserved(s.requests(`/api/project/play/sessions/${encodeURIComponent(session.sessionId)}/spin`, spinAt).length === 1, "Play duplicate Spin submission");
            requireObserved(spinResponse.request?.bet === playInputs.bet && spin.session?.bet === playInputs.bet && spin.session?.studioSeed === playInputs.seed, "Play submitted bet/recorded seed differs");
            const recordedRound = (await s.get('/api/project/rounds')).find(row => row.sessionId === session.sessionId && row.studioRound === 1);
            requireObserved(recordedRound?.studioSeed === playInputs.seed && recordedRound.bet === playInputs.bet && recordedRound.win === spin.session.win && recordedRound.credits === spin.session.credits, "Play retained round differs from submitted inputs/result");
            requireObserved(spin.status === "ok" && spin.session.studioRound === 1 && spin.session.debug?.artifact?.screen?.length, "producer round did not settle");
            await see("document.body.innerText.includes('Round complete')", "rendered settled round");
            const play = {sequence:spin.session.studioRound, settled:true, creditsBefore:session.credits, creditsAfter:spin.session.credits, stake:spin.session.bet, payout:spin.session.win};
            requireObserved(Object.values(play).every(value => typeof value === "boolean" || Number.isFinite(value)) && play.creditsAfter === play.creditsBefore - play.stake + play.payout, "settled round accounting mismatch");
            await s.image("producer-settled-round");
            await record("producer.settled-round", await text(), {playInputs, sessionResponse, spinResponse, recordedRound});
            await s.navigate("Overview");
            await see(`Boolean(${button("Open Play")})`, "useful saved-project next action");
            await record("producer.next-actions-local-limits", limits + "\n" + await text());
            fields = {design:{structuralValid:validated.valid, savedPath}, play:{...play, ...playInputs}, limitations:{deployment:"local-only", certification:"not-certified"}};
            break;
        }
        case "ui-ux": {
            const {savedPath} = await create();
            await s.navigate("Simulation");
            const {submittedAt, accepted, id} = await submitSimulation();
            await see(`document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') === ${q(id)}`, "accepted durable simulation card");
            await s.until(async () => {const job = await s.get(`/api/project/jobs/${encodeURIComponent(id)}`); return job.status === 'running' && job.progress?.current > 0;}, "real simulation progress before reload");
            await s.reload();
            const reloadedId = await see(`document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') === ${q(id)} && ${q(id)}`, "same job after reload");
            await s.offline(true);
            try { await see("document.body.innerText.includes('reconnecting automatically')", "visible disconnection recovery"); }
            finally { await s.offline(false); }
            const reconnectedId = await see(`!document.body.innerText.includes('reconnecting automatically') && document.querySelector('[data-pokie-lifecycle-result-job]')?.getAttribute('data-pokie-lifecycle-result-job') === ${q(id)} && ${q(id)}`, "same job after reconnect");
            await record("ui-ux.same-job-reload-reconnect", await text(), {id, reloadedId, reconnectedId});
            const submissions = s.requests("/api/project/simulations", submittedAt).length;
            const jobs = await s.get("/api/project/jobs");
            requireObserved(submissions === 1 && jobs.jobs.filter(job => job.operation === "simulation").length === 1, "recovery duplicated simulation");
            await record("ui-ux.no-duplicate", "One public simulation POST and one persisted job after reload and reconnection", {jobs, submissions});
            const terminal = await s.until(async () => {const job = await s.get(`/api/project/jobs/${encodeURIComponent(id)}`); return job.status === "completed" ? job : false;}, "same bounded simulation completed");
            await see(`Boolean(document.querySelector('[data-pokie-lifecycle-result-job=${q(id)}][data-pokie-lifecycle-terminal=completed]')) && document.body.innerText.includes('Open full report')`, "rendered terminal/report next action");
            const report = await simulationResult(id, terminal);
            await record("ui-ux.terminal-result", await text(), {simulationInputs, accepted, terminal, report});
            await s.focus("document.getElementById('simulation-configure')");
            const geometry = await s.focusGeometry("document.getElementById('simulation-configure')");
            requireObserved(geometry.focused && geometry.insideViewport, "recovery next-action focus outside settled viewport");
            await s.image("ui-ux-recovery-focus");
            await record("ui-ux.recovery-focus", "Native keyboard reaches recovered Configure; settled bounds are in the viewport", {geometry});
            await s.activate(button("Close project"));
            await s.navigate("Start a game");
            const second = await create();
            const secondJobs = await s.get("/api/project/jobs");
            requireObserved(second.savedPath !== savedPath && !secondJobs.jobs.some(job => job.id === id), "job leaked into independent project");
            await reopen(savedPath);
            const restored = await s.get(`/api/project/jobs/${encodeURIComponent(id)}`);
            requireObserved(restored.status === "completed", "original project lost terminal job");
            await record("ui-ux.project-isolation", await text(), {secondPath:second.savedPath, secondJobs, restored});
            fields = {simulationInputs, job:{id, reloadedId, reconnectedId, submissions, terminal:terminal.status, resultAccessible:true}};
            break;
        }
        case "graphic-designer": {
            const viewports = [[1100,800],[900,700],[390,844]];
            const homePanels = [], projectPanels = [];
            const basics = "Array.from(document.querySelectorAll('[role=tab]')).find(e => e.textContent.startsWith('Game basics') && e.getClientRects().length)";
            for (const [width,height] of viewports) {
                await s.viewport(width,height);
                await s.focus(basics);
                await s.key("ArrowRight", "ArrowRight", 39);
                await see("document.activeElement?.getAttribute('role') === 'tab' && document.activeElement?.getAttribute('aria-selected') === 'true' && !document.activeElement?.textContent.startsWith('Game basics')", "native design section keyboard transition");
                const homeFocus = await s.focusGeometry("document.activeElement");
                requireObserved(homeFocus.focused && homeFocus.insideViewport, "Home keyboard focus clipped");
                homePanels.push(await s.capture({surface:"Home sections", homeFocus}));
                await s.key("ArrowLeft", "ArrowLeft", 37);
                await see("document.activeElement?.textContent.startsWith('Game basics') && document.activeElement?.getAttribute('aria-selected') === 'true'", "native roving tab returns to Game basics before resize");
            }
            await record("graphic.native-keyboard", await text(), {viewports, observations:homePanels.map(({bytes,...panel}) => panel)});
            await s.activate(button("Show advanced options (file and JSON tools)"));
            const homeBuild = "Array.from(document.querySelectorAll('fieldset')).find(e => e.querySelector('legend')?.textContent === 'Build')";
            for (const [width,height] of viewports) {
                await s.viewport(width,height);
                await s.focus(input("Output directory", homeBuild));
                const geometry = await s.focusGeometry(input("Output directory", homeBuild));
                requireObserved(geometry.focused && geometry.insideViewport, "expanded Home build form focus clipped");
                await see(`Boolean(${button("Build Preview", homeBuild)}) && Boolean(${button("Build Package", homeBuild)})`, "expanded Home Design build controls");
                homePanels.push(await s.capture({surface:"Expanded Home Design build", geometry}));
            }
            const homeImage = await s.image("graphic-home-design", homePanels);
            await s.viewport(1100,800);
            await create();
            for (const [width,height] of viewports) {
                await s.viewport(width,height);
                await s.focus(button("Open Play"));
                projectPanels.push(await s.capture({surface:"Project Overview"}));
            }
            await s.navigate("Build/Export");
            await openCard("tsPackage");
            for (const [width,height] of viewports) {
                await s.viewport(width,height);
                await s.focus(button("Build", card("tsPackage")));
                projectPanels.push(await s.capture({surface:"Project Build/Export"}));
            }
            const projectImage = await s.image("graphic-project-build", projectPanels);
            await s.viewport(1100,800);
            await s.navigate("Simulation");
            const {accepted, id} = await submitSimulation();
            const region = `Array.from(document.querySelectorAll('[role=region]')).find(e => e.getAttribute('aria-label') === ${q(`simulation job ${id}`)})`;
            await see(`Boolean((${region})?.querySelector('.studio-job-card')) && (${region}).innerText.includes('Running')`, "running common job card");
            const object = await s.keepObject(region);
            await s.focus(button("Cancel", region));
            const runningBounds = await s.focusGeometry(button("Cancel", region));
            requireObserved(runningBounds.focused && runningBounds.insideViewport, "running native Cancel focus clipped");
            const runningImage = await s.image("graphic-running-job", [await s.capture({surface:"Running job", runningBounds, id})]);
            await record("graphic.home-project-build-job", await text(region), {homeImage, projectImage, runningImage, runningBounds, id, simulationInputs, accepted});
            const terminal = await s.until(async () => {const job=await s.get(`/api/project/jobs/${encodeURIComponent(id)}`);return job.status === "completed" ? job : false;}, "real bounded terminal simulation");
            const report = await simulationResult(id, terminal);
            await s.settle(region, id); // Review, report, Recent runs AND bounds.
            requireObserved(await s.sameObject(object, region), "common card replaced on terminal transition");
            const focus = await s.focusGeometry(region);
            requireObserved(focus.focused && focus.insideViewport, "same card lost focus or moved outside settled viewport");
            await record("graphic.same-common-card-focus", await text(region), {runningBounds, terminalBounds:focus, terminal, report});
            const terminalPanels = [await s.capture({surface:"Settled common card", focus, id}, region)];
            // Capture transition-local geometry/pixels BEFORE resizing. Resize
            // observes ownership only; it never refocuses the terminal region.
            for (const [width,height] of [[390,844]]) {
                await s.viewport(width,height);
                await s.settle(region,id);
                const resizedFocus = await s.focusGeometry(region);
                requireObserved(resizedFocus.focused && resizedFocus.insideViewport && await s.sameObject(object,region), "resized common card lost focus or clipped");
                terminalPanels.push(await s.capture({surface:"Settled common card", focus:resizedFocus, id}, region));
            }
            requireObserved(terminalPanels.every(panel => panel.focus.focused && panel.focus.insideViewport), "capture-local settled focus lost/clipped");
            const imageReceipt = await s.image("graphic-settled-common-card", terminalPanels);
            const painted = (await Promise.all(terminalPanels.map((panel,index) => s.painted(imageReceipt,panel.focus,index)))).every(Boolean);
            requireObserved(painted, "settled screenshot has no painted focus outline");
            await record("graphic.painted-outline-settled", "Retained contact sheet contains the focused common card outline after Review, report and Recent runs settle at compact and phone viewports", {imageReceipt, focus});
            const before = await s.focusGeometry(region);
            await s.settle(region, id);
            const after = await s.focusGeometry(region);
            requireObserved(before.focused && after.focused && await s.sameObject(object, region), "settled report refresh stole same-card focus");
            await record("graphic.no-focus-theft", "Same common card retains native focus across the settled report/history refresh", {before, after});
            fields = {focus:{sameCard:true, nativeKeyboard:true, painted, insideViewport:focus.insideViewport, layoutSettled:true, stoleFocus:false, imageReceipt}};
            break;
        }
    }
    requireObserved(actions.length === COVERAGE[request.id].length, `${request.id}: incomplete itinerary`);
    return {actions, findings:[], ...fields};
}

/** Actual PNG pixels, not computed CSS alone. Chromium screenshots are bounded
 * non-interlaced 8-bit RGB/RGBA; other encodings fail instead of claiming paint. */
export function decodePng(bytes) {
    requireObserved(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), "focus image is not PNG");
    let width, height, channels, interlace, bits, compressed = [];
    for (let at = 8; at + 12 <= bytes.length;) {
        const size = bytes.readUInt32BE(at), type = bytes.toString("ascii", at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + size);
        if (type === "IHDR") {width = data.readUInt32BE(0); height = data.readUInt32BE(4); bits = data[8]; channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0; interlace = data[12];}
        if (type === "IDAT") compressed.push(data);
        at += size + 12;
    }
    requireObserved(width > 0 && height > 0 && width * height <= 5_000_000 && bits === 8 && channels && !interlace, "unsupported/big focus PNG");
    const stride = width * channels, raw = inflateSync(Buffer.concat(compressed), {maxOutputLength:(stride + 1) * height});
    requireObserved(raw.length === (stride + 1) * height, "truncated focus PNG");
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        requireObserved(filter <= 4, "unsupported PNG filter");
        for (let x = 0; x < stride; x++) {
            const at = y * stride + x, a = x >= channels ? pixels[at - channels] : 0, b = y ? pixels[at - stride] : 0, c = y && x >= channels ? pixels[at - stride - channels] : 0;
            const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
            const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a+b)/2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            pixels[at] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
        }
    }
    return {width, height, channels, pixels};
}

export function paintedOutline(bytes, geometry) {
    const {width, height, channels, pixels} = decodePng(bytes);
    const color = geometry.outlineColor?.match(/\d+(?:\.\d+)?/g)?.map(Number);
    if (!color || color.length < 3 || (color.length === 4 && color[3] === 0) || geometry.outlineWidth < 1) return false;
    const rect = geometry.rect, inset = geometry.outlineOffset + geometry.outlineWidth / 2;
    const points = [
        [rect.x + rect.width / 2, rect.y - inset], [rect.x + rect.width / 3, rect.y - inset],
        [rect.x - inset, rect.y + rect.height / 2], [rect.x + rect.width + inset, rect.y + rect.height / 2],
    ];
    return points.filter(([px, py]) => {
        const x = Math.floor(px), y = Math.floor(py);
        return x >= 0 && x < width && y >= 0 && y < height && color.slice(0,3).every((channel, i) => Math.abs(pixels[(y * width + x) * channels + i] - channel) <= 12);
    }).length >= 2;
}

/** Lossless horizontal sheet. Panels stay in memory until this one retained
 * PNG is written; offsets and viewport/route/geometry accompany its receipt. */
export function contactSheet(panels) {
    requireObserved(panels.length > 0 && panels.length <= 6, 'invalid contact sheet panel count');
    const decoded = panels.map(panel => decodePng(panel.bytes));
    const width = decoded.reduce((sum,panel) => sum + panel.width, 0) + (panels.length-1)*16;
    const height = Math.max(...decoded.map(panel => panel.height));
    requireObserved(width*height <= 5_000_000, 'contact sheet exceeds pixel budget');
    const raw = Buffer.alloc((width*3+1)*height,255), metadata = [];
    for (let y=0;y<height;y++) raw[y*(width*3+1)]=0;
    let offsetX=0;
    decoded.forEach((panel,index) => {
        for(let y=0;y<panel.height;y++) for(let x=0;x<panel.width;x++) {
            const source=(y*panel.width+x)*panel.channels, dest=y*(width*3+1)+1+(offsetX+x)*3;
            panel.pixels.copy(raw,dest,source,source+3);
        }
        const {bytes, ...observation} = panels[index];
        metadata.push({...observation, offsetX, offsetY:0, width:panel.width, height:panel.height});
        offsetX+=panel.width+16;
    });
    const chunk = (name,data) => {
        const bytes=Buffer.alloc(data.length+12); bytes.writeUInt32BE(data.length); bytes.write(name,4); data.copy(bytes,8);
        let crc=0xffffffff;
        for(const value of bytes.subarray(4,8+data.length)) {crc^=value; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
        bytes.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length); return bytes;
    };
    const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=2;
    return {bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]), panels:metadata};
}

/** Tiny bounded CDP transport with read-only event receipts and native input. */
export async function connectCdp(url, deadline) {
    const socket = new WebSocket(url), pending = new Map(), events = [];
    let sequence = 0;
    const rejectPending = error => {for (const entry of pending.values()) {clearTimeout(entry.timer); entry.reject(error);} pending.clear();};
    socket.addEventListener("message", event => {
        const value = JSON.parse(String(event.data));
        if (!value.id) {events.push(value); return;}
        const entry = pending.get(value.id);
        if (!entry) return;
        pending.delete(value.id); clearTimeout(entry.timer);
        if (value.error) entry.reject(new Error(value.error.message)); else entry.resolve(value.result);
    });
    socket.addEventListener("close", () => rejectPending(new Error("CDP closed")));
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {socket.close(); reject(new Error("CDP opening deadline"));}, Math.min(5000, Math.max(1, deadline-Date.now())));
        socket.addEventListener("open", () => {clearTimeout(timer); resolve();}, {once:true});
        socket.addEventListener("error", () => {clearTimeout(timer); reject(new Error("CDP opening failed"));}, {once:true});
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {pending.delete(id); reject(new Error(`CDP deadline: ${method}`));}, Math.min(5000, Math.max(1, deadline-Date.now())));
        pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
    });
    return {send, events, close:() => {rejectPending(new Error("CDP closed")); socket.close();}};
}

export async function drainDriverChild(entry, {alive, signal, now = Date.now, wait = pause, graceMs = 2000, forceMs = 3000}) {
    // A root exit is never proof of group drainage or inherited-pipe closure.
    const pid = entry.child.pid;
    if (pid) {
        signal(pid, 'SIGTERM');
        const end = now()+graceMs;
        while (now()<end && (!entry.closed || alive(pid))) await wait(25);
        if (alive(pid)) signal(pid, 'SIGKILL');
    }
    const end = now()+forceMs;
    while (now()<end && (!entry.closed || (pid && alive(pid)))) await wait(25);
    requireObserved(entry.closed && (!pid || !alive(pid)), 'owned child group/stdio drainage deadline');
    await entry.completion;
}

// This function runs inside the rendered page. It resolves one visible native
// control after the drawer transition, scrolls it and verifies its hit target.
export function renderedNavigationPoint(controlId) {
    const element = document.getElementById(controlId);
    if (!element || element.disabled || !element.getClientRects().length || element.closest('[inert]')) return null;
    element.scrollIntoView({block:"nearest", inline:"nearest"});
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return rect.width > 0 && rect.height > 0 && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
        && (hit === element || element.contains(hit)) ? {x, y} : null;
}

export async function navigateSurface(label, {evaluate, activate, click, until}) {
    const homeRoutes={"Start a game":"design", "Your projects":"projects", Projects:"projects"};
    const projectRoutes={"Build/Export":"exportDeploy", Simulation:"simulation", Replay:"replay", Overview:"overview"};
    const home=Boolean(homeRoutes[label]), route=homeRoutes[label] ?? projectRoutes[label];
    requireObserved(route, `unknown navigation ${label}`);
    // Section labels include Mantine decoration; the native control's public
    // identity is stable, including after the Close project transition.
    const controlId=`${home ? "home" : "project"}-tab:${route}`;
    const target=`document.getElementById(${q(controlId)})`;
    const mobileState="(() => {const e=document.getElementById('studio-navigation-toggle');return e?.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' ? (e.getAttribute('aria-expanded') === 'false' ? 'drawer' : 'mobile') : '';})()";
    const state=await until(async () => {
        const mobile=await evaluate(mobileState);
        if (mobile) return mobile;
        return await evaluate(`Boolean((${target})?.getClientRects().length && !(${target}).disabled && !(${target}).closest('[inert]'))`) ? "visible" : false;
    }, `reachable navigation ${label}`, 8000);
    if (state === "drawer" || state === "mobile") {
        if (state === "drawer") await activate("document.getElementById('studio-navigation-toggle')");
        // Native pointer input handles the refreshed mobile drawer; desktop and
        // all other form/keyboard coverage retain sequential Tab/Enter input.
        const point=await until(() => evaluate(`(${renderedNavigationPoint.toString()})(${q(controlId)})`), `revealed navigation ${label}`, 8000);
        await click(point.x, point.y);
    } else await activate(target);
    const rendered=home ? "true" : `Boolean(document.querySelector(${q(`[data-pokie-lifecycle-result-control="${controlId}"][data-pokie-lifecycle-terminal="rendered"]`)}))`;
    await until(() => evaluate(`location.hash.endsWith(${q(home ? `/home/${route}` : `/${route}`)}) && (${target})?.getAttribute('aria-current') === 'page' && ${rendered}`), `${home ? "Home" : "Project"} navigation ${label}`, 8000);
}

export async function reloadPage(cdp, until) {
    const {frameTree:{frame}} = await cdp.send('Page.getFrameTree');
    const after = cdp.events.length;
    await cdp.send('Page.reload', {ignoreCache:true});
    await until(() => cdp.events.slice(after).some(event => event.method === 'Page.lifecycleEvent'
        && event.params.name === 'load' && event.params.frameId === frame.id && event.params.loaderId !== frame.loaderId), 'new main-frame loader completed after reload');
}

export async function main(args, helpers = {}) {
    if (args.length === 1 && args[0] === "--describe") {
        process.stdout.write(`${JSON.stringify({schemaVersion:1, kind:"verifier-driver-capabilities", coverage:COVERAGE})}\n`);
        return;
    }
    requireObserved(args.length === 4 && args[0] === "--request" && args[2] === "--result" && path.isAbsolute(args[1]) && path.isAbsolute(args[3]), "--request <absolute-json> --result <absolute-json> required");
    const request = JSON.parse(await readFile(args[1], "utf8")), resultPath = args[3];
    requireObserved(request.schemaVersion === 1 && COVERAGE[request.id] && /^[a-f0-9]{40}$/.test(request.candidateId) && /^[a-f0-9]{64}$/.test(request.archiveSha256)
        && path.isAbsolute(request.packageRoot ?? "") && path.isAbsolute(request.bin ?? "") && path.isAbsolute(request.profileRoot ?? "") && request.profileId
        && hash(await readFile(fileURLToPath(import.meta.url))) === request.driverSha256
        && JSON.stringify(request.coverage) === JSON.stringify(COVERAGE[request.id]), "incomplete/stale authenticated closeout request");
    // Neutral controller-owned display/profile helpers already used by current.mjs.
    // Only the offline command and imports in contract tests bypass their loading.
    const {createStudioApplicationProfile} = helpers.createStudioApplicationProfile ? helpers : await import("/home/stager/Work/sta-ger/agents/infra/verifier-application-profile.mjs");
    const {createVerifierBrowserContext} = helpers.createVerifierBrowserContext ? helpers : await import("/home/stager/Work/sta-ger/agents/infra/verifier-browser-context.mjs");
    const run = path.join(request.profileRoot, "rendered-driver");
    await mkdir(run);
    const profile = await createStudioApplicationProfile(run);
    const deadline = Math.min(Date.now() + request.timeoutMs, Number(process.env.POKIE_VERIFIER_DEADLINE_AT ?? 0) * 1000 || Infinity);
    const until = async (fn, message, maximum = 70000) => {
        const end = Math.min(deadline, Date.now() + maximum);
        while (Date.now() < end) {const value = await fn(); if (value) return value; await pause(100);}
        fail(`deadline: ${message}`);
    };
    const identities = {candidateId:request.candidateId, archiveSha256:request.archiveSha256, profileId:request.profileId, profileRoot:request.profileRoot, driverSha256:request.driverSha256};
    const transcript = {kind:"p9-11-rendered-transcript", id:request.id, ...identities, startedAt:new Date().toISOString(), commands:[], images:[], actions:[]};
    const children = [];
    let context, cdp, evaluate, result, failure;
    const launch = (command, argv, env) => {
        // Outer closeout acquires signed descendant ownership at launch. A local
        // process group additionally drains browser/Studio before result writing.
        const child = spawn(command, argv, {cwd:path.join(request.profileRoot, "workspace"), env, detached:true, stdio:["ignore","pipe","pipe"]});
        const entry = {child, command, argv, stdout:"", stderr:"", closed:false};
        entry.completion = new Promise((resolve, reject) => {child.once("close", (exitCode, signal) => {entry.closed = true; entry.exitCode = exitCode; entry.signal = signal; resolve();}); child.once("error", reject);});
        // Handle early failure immediately; the finalizer still awaits it.
        entry.completion.catch(() => {});
        child.stdout.on("data", bytes => {entry.stdout += bytes;}); child.stderr.on("data", bytes => {entry.stderr += bytes;});
        children.push(entry); return entry;
    };
    const groupAlive = pid => {try {process.kill(-pid, 0); return true;} catch (error) {if (error.code === "ESRCH") return false; throw error;}};
    const signalGroup = (pid, signal) => {try {process.kill(-pid, signal);} catch (error) {if (error.code !== "ESRCH") throw error;}};
    try {
        context = await createVerifierBrowserContext(path.join(run, "display"), {browser:"/usr/bin/chromium-browser"});
        const studioEnv = {...process.env, ...profile.env, HOME:path.join(request.profileRoot,"home"), XDG_DATA_HOME:path.join(request.profileRoot,"data"), XDG_CACHE_HOME:path.join(request.profileRoot,"cache"), TMPDIR:request.profileRoot};
        // Snap/display launch requirements belong to the helper; browser storage
        // isolation comes from its fresh user-data-dir, never application HOME.
        const browserEnv = {...process.env, ...context.env};
        const studio = launch(request.bin, ["--no-open", "--port", "0"], studioEnv);
        const origin = await until(() => studio.stdout.match(/POKIE Studio listening on (http:\/\/[^\s]+)/)?.[1], "installed Studio readiness");
        transcript.studio = {bin:request.bin, origin};
        launch(context.browser, ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1100", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${path.join(request.profileRoot,"browser")}`, `--disk-cache-dir=${path.join(request.profileRoot,"browser-cache")}`, "--no-first-run", "--no-default-browser-check", origin], browserEnv);
        const port = await until(async () => {try {return (await readFile(path.join(request.profileRoot,"browser/DevToolsActivePort"),"utf8")).split("\n")[0];} catch (error) {if (error.code === "ENOENT") return false; throw error;}}, "fresh browser CDP port");
        const target = await until(async () => (await fetch(`http://127.0.0.1:${port}/json/list`, {signal:AbortSignal.timeout(3000)}).then(r => r.json())).find(page => page.type === "page" && page.url.startsWith(origin)), "installed Studio CDP page");
        cdp = await connectCdp(target.webSocketDebuggerUrl, deadline);
        await cdp.send("Network.enable");
        await cdp.send("Page.enable");
        await cdp.send('Page.setLifecycleEventsEnabled', {enabled:true});
        const reload = () => reloadPage(cdp, until);
        await reload();
        evaluate = async expression => {
            const response = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            requireObserved(!response.exceptionDetails, `page observation failed: ${expression}`);
            return response.result.value;
        };
        const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key, code, windowsVirtualKeyCode, modifiers, ...(key === "Enter" ? {text:"\r"} : {})});
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key, code, windowsVirtualKeyCode, modifiers});
        };
        const click = async (x, y) => {
            requireObserved(Number.isFinite(x) && Number.isFinite(y), "rendered action coordinate missing");
            await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x, y, button:"left", clickCount:1});
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x, y, button:"left", clickCount:1});
        };
        const focus = expression => focusNativeTarget(expression, {until, evaluate, key});
        const activate = async expression => {await focus(expression); await key("Enter", "Enter", 13);};
        const fill = async (expression, value) => {
            await focus(expression); await key("a", "KeyA", 65, 2); await cdp.send("Input.insertText", {text:value}); await key("Tab", "Tab", 9);
            requireObserved(await evaluate(`(${expression})?.value === ${q(value)}`), "native input value differs");
        };
        const get = async route => {
            const response = await fetch(new URL(route, origin), {signal:AbortSignal.timeout(Math.min(5000, Math.max(1,deadline-Date.now())))});
            requireObserved(response.ok, `public read ${route}: ${response.status}`); return response.json();
        };
        const requests = (route, after = 0) => cdp.events.slice(after).filter(event => event.method === "Network.requestWillBeSent" && event.params.request.method === "POST" && new URL(event.params.request.url).pathname === route)
            .map(event => ({requestId:event.params.requestId, request:JSON.parse(event.params.request.postData ?? "{}")}));
        const response = async (route, after = 0) => until(async () => {
            const entry = requests(route, after).at(-1);
            if (!entry || !cdp.events.some(event => event.method === "Network.loadingFinished" && event.params.requestId === entry.requestId)) return false;
            const received = cdp.events.find(event => event.method === "Network.responseReceived" && event.params.requestId === entry.requestId);
            if (!received) return false;
            const body = await cdp.send("Network.getResponseBody", {requestId:entry.requestId});
            return {...entry, status:received.params.response.status, body:JSON.parse(body.base64Encoded ? Buffer.from(body.body,"base64").toString() : body.body)};
        }, `own public response ${route}`);
        const receipt = async (id, observed, raw) => {
            const file = path.join(path.dirname(resultPath), `${id}.observation.json`);
            const bytes = `${JSON.stringify({kind:"p9-11-action-observation", id, classification:"action", outcome:"passed", observed, ...identities, raw}, null, 2)}\n`;
            await writeFile(file, bytes, {flag:"wx"});
            transcript.actions.push({id, observed, raw}); return {path:file, sha256:hash(bytes)};
        };
        const capture = async (observation, focusExpression) => {
            // Two frames settle responsive layout before reading local geometry.
            await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
            const focus = focusExpression ? await focusGeometry(focusExpression) : undefined;
            const screenshot = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:false});
            return {bytes:Buffer.from(screenshot.data,"base64"), ...observation, ...(focus ? {focus} : {}), ...await evaluate("({viewport:{width:innerWidth,height:innerHeight},route:location.hash})")};
        };
        const image = async (name, panels) => {
            if (request.id === 'graphic-designer') requireObserved(transcript.images.length < 4, 'graphic image budget exceeded');
            const sheet = contactSheet(panels ?? [await capture({surface:name})]);
            const file = path.join(path.dirname(resultPath), `${request.id}.${name}.png`);
            await writeFile(file, sheet.bytes, {flag:"wx"});
            const reference = {path:file, sha256:hash(sheet.bytes), panels:sheet.panels}; transcript.images.push(reference); return reference;
        };
        const focusGeometry = expression => evaluate(`(() => {const e=${expression};if(!e)return {};const r=e.getBoundingClientRect(),s=getComputedStyle(e),w=parseFloat(s.outlineWidth)||0,o=parseFloat(s.outlineOffset)||0,inset=w+o,header=document.querySelector('.mantine-AppShell-header')?.getBoundingClientRect().bottom??0;return {focused:document.activeElement===e,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight,header},outlineColor:s.outlineColor,outlineWidth:w,outlineOffset:o,insideViewport:r.width>0&&r.left-inset>=0&&r.right+inset<=innerWidth&&r.top-inset>=header&&(r.height+inset*2>innerHeight-header?r.top+inset<innerHeight:r.bottom+inset<=innerHeight)};})()`);
        const surface = {
            resultPath, until, evaluate, activate, focus, fill, key, get, requests, response, receipt, image, capture, focusGeometry,
            mark:() => cdp.events.length, read:readFile, write:(file, bytes) => writeFile(file,bytes,{flag:"wx"}), mkdir:directory => mkdir(directory),
            navigate:label => navigateSurface(label, {evaluate, activate, click, until}),
            reload,
            offline:offline => cdp.send("Network.emulateNetworkConditions", {offline, latency:0, downloadThroughput:-1, uploadThroughput:-1}),
            viewport:async (width,height) => {
                await cdp.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor:1, mobile:false});
                await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
            },
            keepObject:async expression => (await cdp.send("Runtime.evaluate", {expression})).result.objectId,
            sameObject:async (objectId, expression) => (await cdp.send("Runtime.callFunctionOn", {objectId, functionDeclaration:`function(){return this === (${expression});}`, returnByValue:true})).result.value,
            painted:async (reference, geometry, index=0) => {
                const panel=reference.panels[index];
                return paintedOutline(await readFile(reference.path), {...geometry, rect:{...geometry.rect,x:geometry.rect.x+panel.offsetX,y:geometry.rect.y+panel.offsetY}});
            },
            latestPreview:async target => {
                const entry = requests("/api/project/artifacts/preview").filter(entry => entry.request.target === target).at(-1);
                if (!entry) return {};
                if (!cdp.events.some(event => event.method === "Network.loadingFinished" && event.params.requestId === entry.requestId)) return {};
                const response = await cdp.send("Network.getResponseBody", {requestId:entry.requestId}); return JSON.parse(response.body);
            },
            preflight:async (route, after, matchesRequest, renderedReady, label) => waitGenerationPreflight({
                readResponse:async () => {
                    const entry = requests(route, after).at(-1);
                    if (!entry || !cdp.events.some(event => event.method === "Network.loadingFinished" && event.params.requestId === entry.requestId)) return null;
                    const received = cdp.events.find(event => event.method === "Network.responseReceived" && event.params.requestId === entry.requestId);
                    if (!received) return null;
                    const body = await cdp.send("Network.getResponseBody", {requestId:entry.requestId});
                    return {...entry, status:received.params.response.status, body:JSON.parse(body.base64Encoded ? Buffer.from(body.body,"base64").toString() : body.body)};
                },
                matchesRequest, renderedReady, label, until,
            }),
            post:async (route, body) => {
                const response = await fetch(new URL(route,origin), {method:"POST", headers:{Origin:origin,"Content-Type":"application/json"}, body:JSON.stringify(body), signal:AbortSignal.timeout(Math.min(10000,Math.max(1,deadline-Date.now())))});
                return {status:response.status, body:await response.json(), request:body};
            },
            cli:async argv => {
                const entry = launch(request.bin, argv, studioEnv);
                await until(() => entry.closed, `public CLI ${argv.join(' ')}`);
                requireObserved(entry.exitCode === 0 && !entry.signal && !entry.stderr.trim(), `public CLI failed: ${entry.stderr}`);
                const observation = {argv:[request.bin,...argv], stdout:entry.stdout, stderr:entry.stderr, exitCode:entry.exitCode}; transcript.commands.push(observation); return observation;
            },
            settle:async (region, id) => {
                let previous, since;
                await until(async () => {
                    const layout = await evaluate(`(() => {const e=${region},workflow=Array.from(document.querySelectorAll('[role=region]')).find(e=>e.getAttribute('aria-label')==='Simulation workflow'),recent=Array.from(workflow?.querySelectorAll('fieldset')??[]).find(e=>e.querySelector('legend')?.textContent==='Recent runs');if(!e||!recent||!workflow.querySelector('[aria-current=step]')?.textContent.includes('Review')||!workflow.innerText.includes('Open full report')||workflow.innerText.includes('Loading report')||!recent.innerText.includes('Loaded')||!workflow.querySelector('[data-pokie-lifecycle-result-job=${q(id)}][data-pokie-lifecycle-terminal=completed]'))return '';return JSON.stringify([e,workflow,recent].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height,e.innerText]}));})()`);
                    if (!layout || layout !== previous) {previous=layout; since=Date.now(); return false;} return Date.now()-since >= 300;
                }, "settled Review, report, Recent runs and common-card bounds");
            },
        };
        await until(() => evaluate("document.body.innerText.includes('POKIE is a slot-game logic framework')"), "fresh Home surface");
        result = {kind:"p9-11-rendered-result", id:request.id, ...identities, ...await runItinerary(request,surface)};
        // Re-fetch the actual served production assets after route modules settle.
        result.servedAssets = await evaluate(`(async()=>{const rows=[];for(const url of [...new Set([location.origin+'/',...performance.getEntriesByType('resource').map(e=>e.name)])].filter(u=>new URL(u).origin===location.origin)){const r=await fetch(url),mime=(r.headers.get('content-type')??'').split(';')[0],type=({'text/html':'html','text/javascript':'javascript','application/javascript':'javascript','text/css':'css'})[mime];if(!type)continue;const bytes=new Uint8Array(await r.arrayBuffer()),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''),p=new URL(url).pathname;rows.push({path:p==='/'?'dist/cli/studio-client/index.html':'dist/cli/studio-client'+p,type,status:r.status,sha256:digest});}return rows;})()`);
        requireObserved(["html","javascript","css"].every(type => result.servedAssets.some(asset => asset.type === type && asset.status === 200)), "served production assets incomplete");
    } catch (error) {failure = error;}
    finally {
        try {transcript.lastRenderedState = await evaluate?.("({route:location.hash,text:document.body?.innerText})");} catch {}
        try {if (cdp) await cdp.send("Browser.close");} catch {} finally {cdp?.close();}
        for (const entry of children.reverse()) {
            try {
                // Never skip an exited root: inherited pipes/group descendants
                // still belong to this launch. Success is written after cleanup.
                await drainDriverChild(entry, {alive:groupAlive, signal:signalGroup});
            } catch (error) {failure ??= error;}
        }
        try {await context?.close();} catch (error) {failure ??= error;}
        transcript.children = children.map(({child, completion, ...entry}) => ({...entry,pid:child.pid}));
        transcript.endedAt = new Date().toISOString(); transcript.error = failure?.message;
        await writeFile(path.join(path.dirname(resultPath), `${request.id}.rendered.transcript.json`), `${JSON.stringify(transcript,null,2)}\n`, {flag:"wx"});
    }
    if (failure) throw failure;
    await writeFile(resultPath, `${JSON.stringify(result,null,2)}\n`, {flag:"wx"});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch(error => {process.stderr.write(`${error.stack}\n`); process.exitCode=1;});
}

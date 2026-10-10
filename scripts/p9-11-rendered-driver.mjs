// POKIE_PORTABLE_VERIFIER_DRIVER_V1
// Install this single file as the controller's persistent current.mjs, then pin
// its bytes. --describe is offline admission, never an acceptance observation.
// Browser collection is controller-only. There is no build/pack/install fallback.
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {inflateSync} from "node:zlib";
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
const ownResult = (scope = "document") => `(${scope})?.querySelector('[data-pokie-lifecycle-result-job][data-pokie-lifecycle-terminal=completed]')`;

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
        await see("location.hash.endsWith('/overview') && document.body.innerText.includes('Valid — no issues found.')", "Create game terminal Overview validation");
        const savedPath = await s.evaluate("decodeURIComponent(location.hash.split('/')[2])");
        const blueprint = JSON.parse(await s.read(savedPath));
        requireObserved(blueprint.manifest?.id && blueprint.reels > 0, "saved starter readback is not a design");
        return {savedPath, blueprint};
    };
    const openCard = async target => {
        const toggle = `(${card(target)})?.querySelector('button[aria-expanded]')`;
        await see(`Boolean(${toggle})`, `${target}: artifact card available`);
        if (await s.evaluate(`(${toggle}).getAttribute('aria-expanded') === 'false'`)) await s.activate(toggle);
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
    const reopen = async project => {
        await s.activate(button("Close project"));
        await see("location.hash.includes('/home/projects')", "closed project Projects transition");
        const scope = `Array.from(document.querySelectorAll('.project-registry-entry')).find(e => e.innerText.includes(${q(project)}))`;
        await s.activate(button("Open", scope));
        await see(`location.hash.endsWith('/overview') && decodeURIComponent(location.hash.split('/')[2]) === ${q(project)}`, "same project reopened");
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
            await see("location.hash.endsWith('/overview') && document.body.innerText.includes('Game export')", "recognized-source Overview");
            const context = await s.get("/api/project/context");
            const analysis = context.report?.modes?.[0]?.analysis;
            const moments = {hitFrequency:2 ** -64, maxWinProbability:2 ** -64, rtp:2 ** -63, variance:2 ** -62, standardDeviation:2 ** -31};
            requireObserved(analysis?.totalWeight === '18446744073709551616' && Object.entries(moments).every(([key, expected]) => Number.isFinite(analysis[key]) && analysis[key] > 0 && Math.abs(analysis[key] / expected - 1) <= 1e-12), "rendered source's public analysis lost rare-event metrics");
            // The public result authenticates the same profile's real UInt64 input.
            const prior = JSON.parse(await s.read(path.join(path.dirname(s.resultPath), "stake-uint64-total.public.json")));
            requireObserved(prior.candidateId === request.candidateId && prior.profileId === request.profileId, "Stake public/rendered profile mismatch");
            const publicAnalysis = prior.observations?.find(entry => entry.analysis)?.analysis;
            requireObserved(Object.keys(moments).every(key => publicAnalysis?.[key] === analysis[key]), "public/Studio Stake analysis differs");
            await s.navigate("Build/Export");
            const observed = await text();
            await record("stake.recognized-studio", observed, {context});
            fields = {studioAnalysis:analysis};
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
            requireObserved(initial.stakePreflight?.route === "generate", "fresh Stake plan should generate prerequisite");
            const outcome = await build("outcomeLibrary");
            const manifest = path.join(outcome.output, "manifest.json"), manifestBefore = hash(await s.read(manifest));
            await see(`Boolean(${button("Build", stakeScope)}) && !(${button("Build", stakeScope)}).disabled`, "dependent Stake replacement plan ready");
            const refreshed = await s.until(async () => {const value = await s.latestPreview("stakeAdapter"); return value.stakePreflight?.route === "reuse" && value.preparedOperationId !== initial.preparedOperationId ? value : false;}, "Stake generate plan refreshed to reuse");
            await record("programmer.stake-plan-refresh", await text(stakeScope), {initial, refreshed});
            const buildAt = s.mark();
            const stake = await build("stakeAdapter");
            const submissions = s.requests("/api/project/artifacts/build", buildAt).filter(entry => entry.request?.target === "stakeAdapter");
            requireObserved(submissions.length === 1 && submissions[0].request.preparedOperationId === refreshed.preparedOperationId, "Stake must submit exactly the refreshed operation once");
            await record("programmer.one-build-terminal", stake.text, {stake, submissions});
            const buildResult = await s.get(`/api/project/artifacts/build/${encodeURIComponent(stake.id)}`);
            const provenance = buildResult.result?.stakePrerequisiteProvenance;
            requireObserved(provenance?.route === "reuse" && provenance.disposition === "borrowed" && provenance.selectedPrerequisiteLocation === outcome.output, "Stake did not borrow the completed prerequisite");
            await s.read(path.join(stake.output, "pokie-manifest.json"));
            await record("programmer.borrowed-prerequisite", stake.text, {provenance});
            const manifestAfter = hash(await s.read(manifest));
            requireObserved(manifestAfter === manifestBefore, "borrowed manifest changed");
            await record("programmer.prerequisite-unchanged", "Outcome Library manifest SHA-256 unchanged across one completed Stake build", {manifestBefore, manifestAfter});
            fields = {handoff:{buildSubmissions:submissions.length, terminal:stake.job.status, borrowedPrerequisite:provenance.selectedPrerequisiteLocation, manifestBefore, manifestAfter}};
            break;
        }
        case "mathematician": {
            const {savedPath} = await create();
            await s.navigate("Build/Export");
            const par = await build("parWorkbook");
            requireObserved((await s.read(par.output)).length > 0, "saved-model PAR workbook missing");
            await record("mathematician.saved-model-par", par.text, {savedPath, par});
            const library = await build("outcomeLibrary");
            await s.activate(button("Open as Project", card("outcomeLibrary")));
            await see("location.hash.endsWith('/overview') && document.body.innerText.includes('Draw an outcome')", "native library Overview");
            await s.fill(input("Seed (optional)"), "p911-mathematician");
            const drawAt = s.mark();
            await s.activate(button("Draw an outcome"));
            const draw = await s.response("/api/project/outcome-source/sample", drawAt);
            const recordId = draw.body.replayId;
            requireObserved(recordId && draw.body.replay?.seed, "draw omitted recorded replay identity/seed");
            await see("document.body.innerText.includes('Saved in Replay Recent')", "draw durable replay message");
            await s.navigate("Replay");
            const list = await s.get("/api/project/replays"), row = list.find(entry => entry.id === recordId);
            requireObserved(row?.seed && row.modeName && row.startedAt, "recorded replay row missing seed/mode/time");
            const replayRow = `(${button(`Inspect record ${recordId}`)})?.closest('li')`;
            await see(`(${replayRow})?.innerText.includes(${q(recordId)}) && (${replayRow})?.innerText.includes(${q(row.seed)}) && (${replayRow})?.innerText.includes(${q(row.modeName)}) && (${replayRow})?.innerText.includes(${q(row.startedAt)})`, "unambiguous rendered replay row provenance");
            await record("mathematician.replay-row-provenance", await text(), {row, draw});
            await s.activate(button(`Reproduce & compare record ${recordId}`));
            await see("document.body.innerText.includes('Verified -- matches the recorded result')", "selected exact replay comparison");
            await record("mathematician.selected-exact-comparison", await text(), {recordId});
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
            await s.activate(paytable);
            const payoutInput = "Array.from(document.querySelectorAll('input[aria-label]')).find(e => e.getClientRects().length && /x\\d+ payout$/.test(e.getAttribute('aria-label')))";
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
            const sessionAt = s.mark();
            await s.activate(button("New Play session"));
            const session = (await s.response("/api/project/play/session", sessionAt)).body.session;
            const spinAt = s.mark();
            await s.activate(button("Spin"));
            const spin = (await s.response(`/api/project/play/sessions/${encodeURIComponent(session.sessionId)}/spin`, spinAt)).body;
            requireObserved(spin.status === "ok" && spin.session.studioRound === 1 && spin.session.debug?.artifact?.screen?.length, "producer round did not settle");
            await see("document.body.innerText.includes('Round complete')", "rendered settled round");
            const play = {sequence:spin.session.studioRound, settled:true, creditsBefore:session.credits, creditsAfter:spin.session.credits, stake:spin.session.bet, payout:spin.session.win};
            requireObserved(Object.values(play).every(value => typeof value === "boolean" || Number.isFinite(value)) && play.creditsAfter === play.creditsBefore - play.stake + play.payout, "settled round accounting mismatch");
            await s.image("producer-settled-round");
            await record("producer.settled-round", await text(), {session, spin});
            await s.navigate("Overview");
            await see(`Boolean(${button("Open Play")})`, "useful saved-project next action");
            await record("producer.next-actions-local-limits", limits + "\n" + await text());
            fields = {design:{structuralValid:validated.valid, savedPath}, play, limitations:{deployment:"local-only", certification:"not-certified"}};
            break;
        }
        case "ui-ux": {
            const {savedPath} = await create();
            await s.navigate("Simulation");
            await s.fill(input("Rounds"), "500000");
            const submittedAt = s.mark();
            await s.activate(button("Run Simulation"));
            const accepted = await s.response("/api/project/simulations", submittedAt), id = accepted.body.id;
            requireObserved(id, "simulation accepted without identity");
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
            const report = await s.get(`/api/project/reports/${encodeURIComponent(id)}`);
            requireObserved(report.report?.rounds === 500000, "completed report inaccessible or wrong workload");
            await record("ui-ux.terminal-result", await text(), {terminal, report});
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
            fields = {job:{id, reloadedId, reconnectedId, submissions, terminal:terminal.status, resultAccessible:true}};
            break;
        }
        case "graphic-designer": {
            await s.viewport(1100, 800);
            await s.image("graphic-home");
            const basics = "Array.from(document.querySelectorAll('[role=tab]')).find(e => e.textContent.startsWith('Game basics') && e.getClientRects().length)";
            await s.focus(basics);
            await s.key("ArrowRight", "ArrowRight", 39);
            await see("document.activeElement?.getAttribute('role') === 'tab' && document.activeElement?.getAttribute('aria-selected') === 'true' && !document.activeElement?.textContent.startsWith('Game basics')", "native design section keyboard transition");
            await record("graphic.native-keyboard", await text(), {homeFocus:await s.focusGeometry("document.activeElement")});
            await create();
            await s.image("graphic-project");
            await s.navigate("Build/Export");
            await openCard("tsPackage");
            await see(`Boolean(${button("Build", card("tsPackage"))})`, "public build presentation");
            await s.image("graphic-build");
            await s.navigate("Simulation");
            await s.fill(input("Rounds"), "500000");
            const submittedAt = s.mark();
            await s.activate(button("Run Simulation"));
            const id = (await s.response("/api/project/simulations", submittedAt)).body.id;
            requireObserved(id, "graphic simulation identity missing");
            const region = `Array.from(document.querySelectorAll('[role=region]')).find(e => e.getAttribute('aria-label') === ${q(`simulation job ${id}`)})`;
            await see(`Boolean((${region})?.querySelector('.studio-job-card')) && (${region}).innerText.includes('Running')`, "running common job card");
            const object = await s.keepObject(region);
            await s.focus(button("Cancel", region));
            const runningBounds = await s.focusGeometry(button("Cancel", region));
            requireObserved(runningBounds.focused && runningBounds.insideViewport, "running native Cancel focus clipped");
            await s.image("graphic-running-job");
            await record("graphic.home-project-build-job", await text(region), {runningBounds, id});
            await s.until(async () => (await s.get(`/api/project/jobs/${encodeURIComponent(id)}`)).status === "completed", "real bounded terminal simulation");
            await s.settle(region, id); // Review, report, Recent runs AND bounds.
            requireObserved(await s.sameObject(object, region), "common card replaced on terminal transition");
            const focus = await s.focusGeometry(region);
            requireObserved(focus.focused && focus.insideViewport, "same card lost focus or moved outside settled viewport");
            await record("graphic.same-common-card-focus", await text(region), {runningBounds, terminalBounds:focus});
            const imageReceipt = await s.image("graphic-settled-common-card");
            const painted = await s.painted(imageReceipt, focus);
            requireObserved(painted, "settled screenshot has no painted focus outline");
            await record("graphic.painted-outline-settled", "Retained PNG contains the focused common card outline after Review, report and Recent runs settle", {imageReceipt, focus});
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
export function paintedOutline(bytes, geometry) {
    requireObserved(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), "focus image is not PNG");
    let width, height, channels, interlace, bits, compressed = [];
    for (let at = 8; at + 12 <= bytes.length;) {
        const size = bytes.readUInt32BE(at), type = bytes.toString("ascii", at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + size);
        if (type === "IHDR") {width = data.readUInt32BE(0); height = data.readUInt32BE(4); bits = data[8]; channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0; interlace = data[12];}
        if (type === "IDAT") compressed.push(data);
        at += size + 12;
    }
    requireObserved(width > 0 && height > 0 && width * height <= 4_000_000 && bits === 8 && channels && !interlace, "unsupported/big focus PNG");
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

export async function reloadPage(cdp, until) {
    const {frameTree:{frame}} = await cdp.send('Page.getFrameTree');
    const after = cdp.events.length;
    await cdp.send('Page.reload', {ignoreCache:true});
    await until(() => cdp.events.slice(after).some(event => event.method === 'Page.lifecycleEvent'
        && event.params.name === 'load' && event.params.frameId === frame.id && event.params.loaderId !== frame.loaderId), 'new main-frame loader completed after reload');
}

export async function main(args) {
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
    const {createStudioApplicationProfile} = await import("/home/stager/Work/sta-ger/agents/infra/verifier-application-profile.mjs");
    const {createVerifierBrowserContext} = await import("/home/stager/Work/sta-ger/agents/infra/verifier-browser-context.mjs");
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
        const env = {...process.env, ...context.env, ...profile.env, HOME:path.join(request.profileRoot,"home"), XDG_DATA_HOME:path.join(request.profileRoot,"data"), XDG_CACHE_HOME:path.join(request.profileRoot,"cache"), TMPDIR:request.profileRoot};
        const studio = launch(request.bin, ["--no-open", "--port", "0"], env);
        const origin = await until(() => studio.stdout.match(/POKIE Studio listening on (http:\/\/[^\s]+)/)?.[1], "installed Studio readiness");
        transcript.studio = {bin:request.bin, origin};
        launch(context.browser, ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1100", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${path.join(request.profileRoot,"browser")}`, "--no-first-run", "--no-default-browser-check", origin], env);
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
        const focus = async expression => {
            await until(() => evaluate(`Boolean((${expression}) && !(${expression}).disabled && (${expression}).getClientRects().length)`), `enabled native target ${expression}`, 12000);
            for (let index = 0; index < 240; index++) {
                if (await evaluate(`document.activeElement === (${expression})`)) return;
                await key("Tab", "Tab", 9);
            }
            fail(`native Tab target unreachable: ${expression}`);
        };
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
        const image = async name => {
            const screenshot = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:false});
            const bytes = Buffer.from(screenshot.data,"base64"), file = path.join(path.dirname(resultPath), `${request.id}.${name}.png`);
            await writeFile(file, bytes, {flag:"wx"});
            const reference = {path:file, sha256:hash(bytes)}; transcript.images.push(reference); return reference;
        };
        const focusGeometry = expression => evaluate(`(() => {const e=${expression};if(!e)return {};const r=e.getBoundingClientRect(),s=getComputedStyle(e),w=parseFloat(s.outlineWidth)||0,o=parseFloat(s.outlineOffset)||0,inset=w+o,header=document.querySelector('.mantine-AppShell-header')?.getBoundingClientRect().bottom??0;return {focused:document.activeElement===e,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight,header},outlineColor:s.outlineColor,outlineWidth:w,outlineOffset:o,insideViewport:r.width>0&&r.left-inset>=0&&r.right+inset<=innerWidth&&r.top-inset>=header&&(r.height+inset*2>innerHeight-header?r.top+inset<innerHeight:r.bottom+inset<=innerHeight)};})()`);
        const surface = {
            resultPath, until, evaluate, activate, focus, fill, key, get, requests, response, receipt, image, focusGeometry,
            mark:() => cdp.events.length, read:readFile, write:(file, bytes) => writeFile(file,bytes,{flag:"wx"}), mkdir:directory => mkdir(directory),
            navigate:async label => {
                const names = {"Your projects":"Projects"};
                await activate(button(names[label] ?? label, "document.getElementById('studio-navigation-panel')"));
                const routes = {"Start a game":"/home/design", "Your projects":"/home/projects", "Build/Export":"/exportDeploy", Simulation:"/simulation", Replay:"/replay", Overview:"/overview"};
                if (routes[label]) await until(() => evaluate(`location.hash.endsWith(${q(routes[label])})`), `navigation ${label}`);
            },
            reload,
            offline:offline => cdp.send("Network.emulateNetworkConditions", {offline, latency:0, downloadThroughput:-1, uploadThroughput:-1}),
            viewport:(width,height) => cdp.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor:1, mobile:false}),
            keepObject:async expression => (await cdp.send("Runtime.evaluate", {expression})).result.objectId,
            sameObject:async (objectId, expression) => (await cdp.send("Runtime.callFunctionOn", {objectId, functionDeclaration:`function(){return this === (${expression});}`, returnByValue:true})).result.value,
            painted:async (reference, geometry) => paintedOutline(await readFile(reference.path), geometry),
            latestPreview:async target => {
                const entry = requests("/api/project/artifacts/preview").filter(entry => entry.request.target === target).at(-1);
                if (!entry) return {};
                if (!cdp.events.some(event => event.method === "Network.loadingFinished" && event.params.requestId === entry.requestId)) return {};
                const response = await cdp.send("Network.getResponseBody", {requestId:entry.requestId}); return JSON.parse(response.body);
            },
            post:async (route, body) => {
                const response = await fetch(new URL(route,origin), {method:"POST", headers:{Origin:origin,"Content-Type":"application/json"}, body:JSON.stringify(body), signal:AbortSignal.timeout(Math.min(10000,Math.max(1,deadline-Date.now())))});
                return {status:response.status, body:await response.json(), request:body};
            },
            cli:async argv => {
                const entry = launch(request.bin, argv, env);
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

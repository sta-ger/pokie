import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir, mkdtemp, readFile, rm, writeFile, access} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {test, jest} from "@jest/globals";
import {P911_SCENARIOS, P911_PERSONAS, P911_RENDERED_COVERAGE, runP911Closeout, validateActionCoverage, settleP911Commands, stopP911Child, spawnP911Child, p911ChildrenDrained, retainP911PackagingReceipt, waitP911Child, runP911Process} from "../../scripts/p9-11-corrective-closeout.mjs";
import {readPinnedJson, sha256, P911_CAMPAIGN} from "../../scripts/p9-11-candidate.mjs";
import {assertRareP911Metrics} from "../../scripts/p9-11-corrective-scenarios.mjs";
import {candidateFixture} from "../testUtils/createP911CandidateFixture.mjs";
import {spawn} from "node:child_process";

const digest = "a".repeat(64);
const success = {exitCode:0, signal:null, timedOut:false, cancelled:false, processGroupDrained:true, processTreeDrained:true, resourcesDrained:true, stdioClosed:true, stdout:"", stderr:""};
const json = (file, value) => writeFile(file, `${JSON.stringify(value)}\n`);
const exists = async (file) => access(file).then(() => true, () => false);

function rendered(id) {
    return {
        actions:P911_RENDERED_COVERAGE[id].map((key) => ({id:key, classification:"action", outcome:"passed", observed:`observed ${key}`, receipt:{path:"/controller/action.json", sha256:digest}})),
        focus:{sameCard:true, nativeKeyboard:true, painted:true, insideViewport:true, layoutSettled:true, stoleFocus:false, imageReceipt:{path:"/controller/focus.png", sha256:digest}},
        destination:{sentinelBefore:digest, sentinelAfter:digest, overwriteAuthorized:false, occupiedPath:"/occupied", publishedPath:"/new", raceExitStatus:200, raceBodyStatus:"error"},
        handoff:{buildSubmissions:1, terminal:"completed", jobId:"stake-own", resultJobId:"stake-own", sourceKind:"blueprint", sourcePath:"/design", originalBlueprint:"/design", initialOperationId:"initial", refreshedOperationId:"refreshed", submittedOperationId:"refreshed", route:"reuse", disposition:"borrowed", selectedPrerequisite:"library", borrowedPrerequisite:"library", manifestBefore:digest, manifestAfter:digest},
        replay:{seed:"0", mode:"base", time:"2026-10-10T00:00:00Z", recordId:"selected", selectedRecordId:"selected", reopenedRecordId:"selected", exactComparison:true},
        job:{id:"own-job", reloadedId:"own-job", reconnectedId:"own-job", submissions:1, terminal:"completed", resultAccessible:true},
        studioAnalysis:{totalWeight:"18446744073709551616", hitFrequency:2 ** -64, maxWinProbability:2 ** -64, rtp:2 ** -63, variance:2 ** -62, standardDeviation:2 ** -31},
        design:{structuralValid:true, savedPath:"/design"}, play:{sequence:1, settled:true, creditsBefore:1000, creditsAfter:1001, stake:1, payout:2},
        limitations:{deployment:"local-only", certification:"not-certified"},
    };
}

test("exact six repro and five supplementary smoke IDs remain the contract", () => {
    assert.deepEqual(P911_SCENARIOS, ["node-wasm-first-subsequent", "serialized-zero-replay", "bounded-long-state", "stake-uint64-total", "canonical-cli", "occupied-destination"]);
    assert.deepEqual(P911_PERSONAS, ["programmer", "mathematician", "producer", "ui-ux", "graphic-designer"]);
    assert.deepEqual(P911_RENDERED_COVERAGE, {
        "stake-uint64-total":["stake.recognized-studio"],
        "occupied-destination":["destination.design-build", "destination.occupied-error", "destination.sentinel-preserved", "destination.new-path", "destination.published", "destination.preview-race"],
        programmer:["programmer.public-startup-help", "programmer.canonical-workflow", "programmer.stake-plan-refresh", "programmer.one-build-terminal", "programmer.borrowed-prerequisite", "programmer.prerequisite-unchanged"],
        mathematician:["mathematician.saved-model-par", "mathematician.replay-row-provenance", "mathematician.selected-exact-comparison", "mathematician.reopen-durable"],
        producer:["producer.saved-design", "producer.structural-validity", "producer.settled-round", "producer.next-actions-local-limits"],
        "ui-ux":["ui-ux.same-job-reload-reconnect", "ui-ux.no-duplicate", "ui-ux.terminal-result", "ui-ux.recovery-focus", "ui-ux.project-isolation"],
        "graphic-designer":["graphic.home-project-build-job", "graphic.native-keyboard", "graphic.same-common-card-focus", "graphic.painted-outline-settled", "graphic.no-focus-theft"],
    });
    for (const id of Object.keys(P911_RENDERED_COVERAGE)) {
        validateActionCoverage(id, rendered(id));
        for (const key of P911_RENDERED_COVERAGE[id]) {
            for (const classification of ["finding", "unreached", "blocked"]) {
                const result = rendered(id); result.actions.find((entry) => entry.id === key).classification = classification;
                assert.throws(() => validateActionCoverage(id, result), new RegExp(key));
            }
            const missing = rendered(id); missing.actions = missing.actions.filter((entry) => entry.id !== key);
            assert.throws(() => validateActionCoverage(id, missing), /incomplete/);
        }
    }
});

test("later regression cannot be hidden by a passed earlier action", () => {
    const graphic = rendered("graphic-designer"); graphic.focus.painted = false;
    assert.throws(() => validateActionCoverage("graphic-designer", graphic), /painted/);
    graphic.focus.painted = true; graphic.focus.layoutSettled = false;
    assert.throws(() => validateActionCoverage("graphic-designer", graphic), /painted/);
    const programmer = rendered("programmer"); programmer.handoff.manifestAfter = "b".repeat(64);
    assert.throws(() => validateActionCoverage("programmer", programmer), /handoff mismatch/);
    const math = rendered("mathematician"); math.replay.reopenedRecordId = "other";
    assert.throws(() => validateActionCoverage("mathematician", math), /provenance/);
    const recovery = rendered("ui-ux"); recovery.job.submissions = 2;
    assert.throws(() => validateActionCoverage("ui-ux", recovery), /identity/);
    const destination = rendered("occupied-destination"); destination.destination.raceBodyStatus = "ok";
    assert.throws(() => validateActionCoverage("occupied-destination", destination), /race/);
});

test("selected and reopened replay provenance cannot substitute for an actual exact comparison", () => {
    for (const exactComparison of [undefined, false, "loaded"]) {
        const result = rendered("mathematician");
        result.replay.exactComparison = exactComparison;
        assert.throws(() => validateActionCoverage("mathematician", result), /selected durable replay provenance mismatch/);
    }
    for (const classification of ["finding", "unreached", "blocked"]) {
        const result = rendered("mathematician");
        result.actions.find(action => action.id === "mathematician.selected-exact-comparison").classification = classification;
        assert.throws(() => validateActionCoverage("mathematician", result), /mathematician.selected-exact-comparison/);
    }
});

test("numeric proof rejects lost rare probabilities, totals and inconsistent deviation", () => {
    const p = 2 ** -64, mode = {totalWeight:"18446744073709551616", hitFrequency:p, maxWinProbability:p, rtp:2 * p, variance:4 * p * (1 - p), standardDeviation:2 ** -31};
    assertRareP911Metrics(mode);
    for (const key of ["hitFrequency", "maxWinProbability", "rtp", "variance", "standardDeviation"]) assert.throws(() => assertRareP911Metrics({...mode, [key]:0}), new RegExp(key));
    assert.throws(() => assertRareP911Metrics({...mode, totalWeight:2 ** 64}));
});

test("dependent handoff rejects direct publication, project switches, stale submissions and sibling terminals", () => {
    for (const bypass of [
        {sourceKind:"outcomeLibrary", sourcePath:"library", route:"publish", disposition:"none"},
        {sourcePath:"/other-blueprint"}, {route:"publish"}, {disposition:"none"},
        {selectedPrerequisite:"other-library"}, {resultJobId:"prerequisite-own"},
        {submittedOperationId:"initial"}, {refreshedOperationId:"initial"}, {buildSubmissions:2},
    ]) {
        const result = rendered("programmer");
        Object.assign(result.handoff, bypass);
        assert.throws(() => validateActionCoverage("programmer", result), /dependent Stake handoff mismatch/);
    }
});


test("pinned real file/archive reader rejects candidate, stale assets, extra assets and product descendants", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-candidate-contract-"));
    try {
        const fixture = await candidateFixture(directory);
        // Run Node's installed resolution itself. Jest replaces createRequire
        // with its own resolver even in this .mjs project.
        const verify = async () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import {readP911Candidate} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            const result = await readP911Candidate(${JSON.stringify(fixture.reference)}, {repository:${JSON.stringify(fixture.repository)}});
            const {archive, ...record} = result; process.stdout.write(JSON.stringify(record));
        `], {encoding:"utf8", timeout:5000, stdio:["ignore", "pipe", "pipe"]}));
        const candidate = await verify();
        assert.equal(candidate.candidateId, fixture.handoff.candidateId);
        assert.equal(candidate.resolutions.pokie, path.join(candidate.packageRoot, "dist/cjs/index.cjs"));
        assert.equal(candidate.esmResolutions.pokie, path.join(candidate.packageRoot, "dist/esm/index.js"));
        for (const name of ["pokie/browser", "pokie/wasm", "pokie/client/player"]) {
            assert.equal(candidate.esmResolutions[name], candidate.resolutions[name]);
        }
        await assert.rejects(readPinnedJson({...fixture.reference, sha256:"b".repeat(64)}), /digest mismatch/);
        const archive = await readFile(fixture.handoff.archivePath);
        await writeFile(fixture.handoff.archivePath, "different packed bytes");
        await assert.rejects(verify(), /archive digest mismatch/);
        await writeFile(fixture.handoff.archivePath, archive);
        const build = await readFile(fixture.handoff.buildReceipt.path);
        await writeFile(fixture.handoff.buildReceipt.path, "{}");
        await assert.rejects(verify(), /receipt digest mismatch/);
        await writeFile(fixture.handoff.buildReceipt.path, build);
        const extra = path.join(candidate.packageRoot, "dist/obsolete.js"); await writeFile(extra, "obsolete");
        await assert.rejects(verify(), /unexpected installed/); await rm(extra);
        await writeFile(candidate.resolutions["pokie"], "stale");
        await assert.rejects(verify(), /stale installed/);
        await writeFile(path.join(fixture.repository, "product.js"), "changed");
        execFileSync("git", ["add", "product.js"], {cwd:fixture.repository});
        execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "changed fixture"], {cwd:fixture.repository});
        await assert.rejects(verify(), /product\/build inputs changed/);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

async function runnerFixture(directory, options = {}) {
    const driver = path.join(directory, "fixture-driver.mjs"); await writeFile(driver, "// fixture driver, never executed\n");
    const image = path.join(directory, "focus.png");
    await writeFile(image, "fixture image; no visual acceptance");
    const candidate = {candidateId:"a".repeat(40), candidateTreeId:"b".repeat(40), packageName:"pokie", archiveSha256:digest, archivePath:path.join(directory, "archives/candidate.tgz"), executableSha256:digest, installationRoot:path.join(directory, "borrowed-install"),
        packageRoot:path.join(directory, "borrowed-install/node_modules/pokie"), bin:"/fixture/pokie", packageVersion:"1.3.0", resolutions:{pokie:"/fixture/cjs/index.js"}, esmResolutions:{pokie:"/fixture/esm/index.js"},
        buildReceipt:{path:"/fixture/build.json", sha256:digest}, installReceipt:{path:"/fixture/install.json", sha256:digest},
        browserDriver:{path:driver, sha256:sha256(await readFile(driver))}, projection:{entries:[{path:"dist/cli/studio-client/index.html", sha256:digest}, {path:"dist/cli/studio-client/assets/app.js", sha256:digest}, {path:"dist/cli/studio-client/assets/app.css", sha256:digest}]}};
    const requests = [], calls = [];
    const run = jest.fn(async (command, args, commandOptions) => {
        calls.push({command, args, options:commandOptions});
        const request = JSON.parse(await readFile(args[2], "utf8")); requests.push(request);
        if (options.failId === request.id || options.timeoutId === request.id) {
            const error = new Error(`${request.id}: precise failure`);
            error.pc20Result = {...success, exitCode:options.timeoutId ? null : 1, timedOut:Boolean(options.timeoutId), signal:options.timeoutId ? "SIGKILL" : null, stderr:"specific stderr"};
            throw error;
        }
        const isRendered = args[0] === driver;
        const result = isRendered ? {...rendered(request.id), kind:"p9-11-rendered-result", id:request.id, candidateId:candidate.candidateId, archiveSha256:digest,
            profileId:request.profileId, profileRoot:request.profileRoot, driverSha256:request.driverSha256,
            servedAssets:candidate.projection.entries.map((entry, index) => ({...entry, status:200, type:["html", "javascript", "css"][index]}))}
            : {kind:"p9-11-public-result", id:request.id, candidateId:candidate.candidateId, archiveSha256:digest, profileId:request.profileId, status:"passed", observations:["fixture public result"]};
        if (isRendered) {
            for (const action of result.actions) {
                const receipt = path.join(directory, `${action.id}.json`);
                await json(receipt, {kind:"p9-11-action-observation", id:action.id, classification:action.classification, outcome:action.outcome, observed:action.observed,
                    candidateId:candidate.candidateId, archiveSha256:digest, profileId:request.profileId, driverSha256:request.driverSha256});
                action.receipt = {path:receipt, sha256:sha256(await readFile(receipt))};
            }
            result.focus.imageReceipt = {path:image, sha256:sha256(await readFile(image))};
        }
        if (options.incompleteId === request.id) result.actions = [];
        if (options.mismatchId === request.id) result.archiveSha256 = "b".repeat(64);
        await json(args[4], result);
        return options.undrainedId === request.id ? {...success, resourcesDrained:false} : options.stdioOpenId === request.id ? {...success, stdioClosed:false} : {...success};
    });
    const readCandidate = jest.fn(async () => candidate);
    const remove = options.cleanupFailure ? async () => { throw new Error("cleanup failed"); } : rm;
    return {runRoot:path.join(directory, "run"), services:{readCandidate, run, remove}, requests, calls, candidate};
}

test("one candidate across exactly six repros/five isolated profiles; no build/gate/publication command", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-runner-contract-"));
    try {
        const fixture = await runnerFixture(directory);
        const result = await runP911Closeout({runRoot:fixture.runRoot}, fixture.services);
        assert.equal(result.checks, "passed"); assert.match(result.campaignAcceptance, /pending-controller/);
        assert.equal(fixture.services.readCandidate.mock.calls.length, 2);
        assert.equal(fixture.calls.length, 12); // five public + seven rendered
        assert.deepEqual([...new Set(fixture.requests.map((request) => request.id))], [...P911_SCENARIOS, ...P911_PERSONAS]);
        assert.equal(new Set(fixture.requests.map((request) => request.profileId)).size, 11);
        for (const {command, args, options} of fixture.calls) {
            assert.equal(command, process.execPath); assert.equal(args[1], "--request"); assert.equal(args[3], "--result");
            assert.doesNotMatch(args.join(" "), /npm|check:release|release-completion|build-cli|publish/);
            assert.equal(options.timeoutMs, 180000); assert.ok(options.resourceRegistryPath.startsWith(fixture.runRoot));
            assert.equal(options.env.NODE_PATH, undefined); assert.equal(options.env.XDG_DOCUMENTS_DIR, path.join(options.env.HOME, "Documents"));
        }
        for (const request of fixture.requests) { assert.equal(request.archiveSha256, digest); assert.equal(await exists(request.profileRoot), false); }
        assert.equal(await exists(path.join(fixture.runRoot, "checks.json")), true);
        const saved = JSON.parse(await readFile(path.join(fixture.runRoot, "checks.json"), "utf8"));
        assert.deepEqual(saved.candidateIdentity, Object.fromEntries([
            "candidateId", "candidateTreeId", "packageName", "packageVersion", "archivePath", "archiveSha256", "executableSha256",
            "installationRoot", "packageRoot", "bin", "resolutions", "esmResolutions", "buildReceipt", "installReceipt", "browserDriver",
        ].map((key) => [key, fixture.candidate[key]])));
        for (const record of saved.results) {
            const proof = await readPinnedJson(record.resultReceipt), process = await readPinnedJson(record.processReceipt);
            assert.equal(proof.id, record.id); assert.equal(proof.profileId, record.profileId);
            assert.deepEqual(process, record.run);
            if (record.kind === "rendered") assert.deepEqual(record.servedAssets, proof.servedAssets);
        }
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test.each(["candidateId", "candidateTreeId", "packageVersion", "installationRoot", "esmResolutions", "buildReceipt"])("final authentication rejects changed %s without acceptance", async (key) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-final-identity-"));
    try {
        const fixture = await runnerFixture(directory);
        fixture.services.readCandidate.mockResolvedValueOnce(fixture.candidate)
            .mockResolvedValueOnce({...fixture.candidate, [key]:"changed"});
        await assert.rejects(runP911Closeout({runRoot:fixture.runRoot}, fixture.services), /candidate identity changed/);
        const failed = JSON.parse(await readFile(path.join(fixture.runRoot, "failed.json"), "utf8"));
        assert.equal(failed.phase, "final-candidate-authentication");
        assert.equal(await exists(path.join(fixture.runRoot, "checks.json")), false);
        for (const request of fixture.requests) assert.equal(await exists(request.profileRoot), false);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test.each(["public.json", "public.process.json"])("cleanup cannot alter a retained %s and still publish acceptance", async (suffix) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-retained-proof-"));
    try {
        const fixture = await runnerFixture(directory);
        let changed = false;
        fixture.services.remove = async (profile, options) => {
            await rm(profile, options);
            if (!changed) {
                changed = true;
                await json(path.join(fixture.runRoot, `node-wasm-first-subsequent.${suffix}`), {status:"substituted"});
            }
        };
        await assert.rejects(runP911Closeout({runRoot:fixture.runRoot}, fixture.services), /receipt digest mismatch/);
        const failed = JSON.parse(await readFile(path.join(fixture.runRoot, "failed.json"), "utf8"));
        assert.equal(failed.phase, "retained-proof-authentication");
        assert.equal(await exists(path.join(fixture.runRoot, "checks.json")), false);
        for (const request of fixture.requests) assert.equal(await exists(request.profileRoot), false);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test.each([
    {failId:"serialized-zero-replay", phase:"serialized-zero-replay"}, {incompleteId:"programmer", phase:"programmer"},
    {mismatchId:"producer", phase:"producer"}, {stdioOpenId:"canonical-cli", phase:"canonical-cli"}, {undrainedId:"canonical-cli", phase:"canonical-cli"}, {cleanupFailure:true, phase:"profile-cleanup"},
    {timeoutId:"bounded-long-state", phase:"bounded-long-state"},
])("failure retains its precise phase and never writes successful checks: %j", async (options) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-failure-contract-"));
    try {
        const fixture = await runnerFixture(directory, options);
        await assert.rejects(runP911Closeout({runRoot:fixture.runRoot}, fixture.services));
        const failed = JSON.parse(await readFile(path.join(fixture.runRoot, "failed.json"), "utf8"));
        assert.equal(failed.phase, options.phase); assert.equal(failed.acceptance, "unproven");
        if (options.failId) { assert.equal(failed.process.exitCode, 1); assert.equal(failed.process.stderr, "specific stderr"); }
        if (options.timeoutId) { assert.equal(failed.process.timedOut, true); assert.equal(failed.process.signal, "SIGKILL"); assert.equal(failed.process.stderr, "specific stderr"); }
        assert.equal(await exists(path.join(fixture.runRoot, "checks.json")), false);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("pre-cancellation submits no scenario and produces no successful receipt", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-cancel-contract-"));
    try {
        const fixture = await runnerFixture(directory), controller = new AbortController(); controller.abort();
        await assert.rejects(runP911Closeout({runRoot:fixture.runRoot, signal:controller.signal}, fixture.services), /cancelled/);
        assert.equal(fixture.calls.length, 0);
        assert.equal(await exists(path.join(fixture.runRoot, "checks.json")), false);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("sibling compiler failure aborts and awaits every other compiler", async () => {
    let drained = false;
    await assert.rejects(settleP911Commands([
        async () => { throw new Error("compiler failed"); },
        (signal) => new Promise((resolve) => { signal.addEventListener("abort", () => { drained = true; resolve(); }); }),
    ]), /compiler failed/);
    assert.equal(drained, true);
});

test.each(["deadline", "cancel", "success-with-descendant"])("real owned execution drains descendants on %s without touching unrelated resources", async (mode) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-ownership-contract-"));
    const controller = new AbortController();
    let timer;
    try {
        const script = path.join(directory, "child.mjs");
        await writeFile(script, `import {spawn} from 'node:child_process';
            const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {detached:true, stdio:'ignore'}); child.unref();
            process.stdout.write('owned:' + child.pid + '\\n');
            ${mode === "success-with-descendant" ? "" : "setInterval(() => {}, 1000);"}`);
        const options = {cwd:directory, timeoutMs:mode === "deadline" ? 400 : 5000, signal:controller.signal, resourceRegistryPath:path.join(directory, "resources.ndjson")};
        if (mode === "cancel") timer = setTimeout(() => controller.abort(), 400);
        let result;
        try { result = await runP911Process(process.execPath, [script], options); }
        catch (error) { result = error.pc20Result; }
        assert.ok(result); assert.equal(result.timedOut, mode === "deadline"); assert.equal(result.cancelled, mode === "cancel");
        assert.equal(result.processTreeDrained, true); assert.equal(result.resourcesDrained, true);
        const ownedPid = Number(/owned:(\d+)/.exec(result.stdout)?.[1]); assert.ok(ownedPid > 0);
        assert.ok(result.ownedProcessIds.includes(ownedPid));
        // Release authority is the acquired Linux identity, not PID absence:
        // orphaned zombies may remain briefly until the host reaps them.
        assert.equal(result.ownedProcessIdentities.find((entry) => entry.pid === ownedPid)?.processIdentity?.startsWith("linux-start-ticks:"), true);
    } finally { clearTimeout(timer); await rm(directory, {recursive:true, force:true}); }
}, 10000);

test("packaging stop escalates a SIGTERM-resistant owned child and waits for stdio", async () => {
    const child = spawnP911Child(process.execPath, ["-e", "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)"], {cwd:process.cwd(), graceMs:150});
    await new Promise((resolve) => child.stdout.once("data", resolve));
    await stopP911Child(child);
    assert.equal(child.signalCode, "SIGKILL"); assert.equal(child.stdout.destroyed, true);
    await stopP911Child(child);
});


test.each([
    {detached:false, inherited:true}, {detached:true, inherited:false}, {detached:true, inherited:true},
])("packaging root exit retains descendants and awaits inherited stdio: %j", async ({detached, inherited}) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-packaging-drain-"));
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {stdio:"ignore"});
    const unrelatedClosed = new Promise((resolve) => unrelated.once("close", resolve));
    let child;
    try {
        child = spawnP911Child(process.execPath, ["--input-type=module", "-e", `
            import {spawn} from 'node:child_process';
            const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],
                {detached:${detached}, stdio:${inherited ? "['ignore', 'inherit', 'inherit']" : "'ignore'"}});
            descendant.unref();
            process.stdout.write('owned:' + descendant.pid + '\\n');
        `], {cwd:directory});
        let output = ""; child.stdout.on("data", (chunk) => { output += chunk; });
        await new Promise((resolve) => child.once("exit", resolve));
        assert.equal(child.exitCode, 0);
        assert.equal(p911ChildrenDrained([child]), false);
        if (inherited) assert.equal(child.stdout.destroyed, false);
        const result = await stopP911Child(child);
        const descendant = Number(/owned:(\d+)/.exec(output)?.[1]); assert.ok(descendant > 0);
        assert.ok(result.ownedProcessIds.includes(descendant));
        assert.equal(result.processTreeDrained, true); assert.equal(result.resourcesDrained, true); assert.equal(result.stdioClosed, true);
        assert.equal(child.stdout.destroyed, true); assert.equal(child.stderr.destroyed, true);
        assert.equal(p911ChildrenDrained([child]), true);
        process.kill(unrelated.pid, 0); // Same unrelated process is still alive.
        const receipt = path.join(directory, "cleanup.json");
        await retainP911PackagingReceipt([child], () => json(receipt, {cleanup:true}));
        assert.equal(await exists(receipt), true);
        await stopP911Child(child); // Already-closed handles use retained closure.
    } finally {
        try { if (child) await stopP911Child(child); }
        finally {
            unrelated.kill("SIGKILL"); await unrelatedClosed;
            await rm(directory, {recursive:true, force:true});
        }
    }
}, 10000);

test("packaging incomplete resource cleanup blocks a success receipt after root exit", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p911-packaging-failed-cleanup-"));
    try {
        const child = spawnP911Child(process.execPath, ["--input-type=module", "-e", `
            import {registerPc20OwnedResource} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/pc-20-release-completion.mjs")).href)};
            registerPc20OwnedResource({kind:'provider', resourceId:'unreleased-provider'});
        `], {cwd:directory});
        await new Promise((resolve) => child.once("exit", resolve));
        assert.equal(child.exitCode, 0);
        await assert.rejects(stopP911Child(child), /cleanup deadline exceeded/);
        assert.equal(child.stdout.destroyed, true);
        assert.equal(p911ChildrenDrained([child]), false);
        const receipt = path.join(directory, "cleanup.json");
        assert.throws(() => retainP911PackagingReceipt([child], () => json(receipt, {cleanup:true})), /requires complete/);
        assert.equal(await exists(receipt), false);
        await assert.rejects(stopP911Child(child), /cleanup deadline exceeded/);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("packaging requires launch ownership and bounds a missing stdio close event", async () => {
    await assert.rejects(stopP911Child({exitCode:0, signalCode:null}), /launch-time ownership/);
    const child = spawnP911Child(process.execPath, ["-e", "process.stdout.write('done')"], {
        cwd:process.cwd(), graceMs:75,
        spawnCommand:(...parameters) => {
            const owned = spawn(...parameters), emit = owned.emit;
            // Emulate a transport whose close notification never arrives, after
            // real process exit/drain. Exit alone cannot authorize the receipt.
            owned.emit = function (event, ...args) { return event === "close" ? false : emit.call(this, event, ...args); };
            return owned;
        },
    });
    await new Promise((resolve) => child.once("exit", resolve));
    await assert.rejects(stopP911Child(child), (error) => {
        assert.match(error.message, /stdio did not close/);
        assert.equal(error.pc20Result.stdioClosed, false); assert.equal(error.pc20Result.resourcesDrained, false);
        assert.equal(error.pc20Result.exitCode, 0); assert.equal(error.pc20Result.stdout, "done");
        return true;
    });
    const retain = jest.fn();
    assert.throws(() => retainP911PackagingReceipt([child], retain), /requires complete/);
    assert.equal(retain.mock.calls.length, 0);
});


test("packaging compiler failure aborts and awaits owned sibling process and stdio drainage", async () => {
    const children = [], results = [];
    await assert.rejects(settleP911Commands([
        async (signal) => {
            const child = spawnP911Child(process.execPath, ["-e", "setTimeout(() => process.exit(1), 300)"], {cwd:process.cwd(), signal});
            children.push(child);
            return waitP911Child(child);
        },
        async (signal) => {
            const child = spawnP911Child(process.execPath, ["--input-type=module", "-e", `
                import {spawn} from 'node:child_process';
                const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {detached:true, stdio:['ignore', 'inherit', 'inherit']});
                descendant.unref(); process.stdout.write('owned:' + descendant.pid);
                setInterval(() => {}, 1000);
            `], {cwd:process.cwd(), signal});
            children.push(child);
            try { return await waitP911Child(child); }
            catch (error) { results.push(error.pc20Result); throw error; }
        },
    ]), /exit code 1/);
    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.cancelled, true); assert.equal(result.resourcesDrained, true); assert.equal(result.stdioClosed, true);
    const descendant = Number(/owned:(\d+)/.exec(result.stdout)?.[1]); assert.ok(descendant > 0);
    assert.ok(result.ownedProcessIds.includes(descendant));
    for (const child of children) { assert.equal(child.stdout.destroyed, true); assert.equal(child.stderr.destroyed, true); }
    const retain = jest.fn();
    assert.throws(() => retainP911PackagingReceipt(children, retain), /requires complete/);
    assert.equal(retain.mock.calls.length, 0);
}, 10000);

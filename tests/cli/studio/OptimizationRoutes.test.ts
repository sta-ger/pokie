import {loadPokieGame} from "../../../src/gamepackage/loadPokieGame.js";
import {ArtifactPublicationOwnership} from "../../../src/project/ArtifactPublicationOwnership.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {passthroughRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {createTunableBlueprintGame} from "../../../src/optimization/createTunableBlueprintGame.js";
import * as recipes from "../../../src/optimization/internal/createOptimizationSimulationGame.js";
import {declarePackageTuning} from "../../../src/optimization/DeclaredTuningContract.js";
import fs from "fs";
import path from "path";
import {StudioOptimizationService} from "../../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import {optimizationBlueprint, optimizationRequest, stochasticOptimizationRequest} from "../../v2/fixtures/OptimizationFixture.js";
import type {StudioJobView} from "../../../cli/studio/jobs/StudioJobView.js";
let directory: string;
let source: string;
let jobs: StudioJobService;
let routes: StudioOptimizationService;
let current: boolean;
const context = () => ({projectRoot: source, projectId: source, isCurrent: () => current});
beforeEach(() => {
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimization-routes-"));
    source = path.join(directory, "source.blueprint.json");
    fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
    jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    routes = new StudioOptimizationService(jobs, new ProjectOptimizationService(path.join(directory, "scratch")));
    current = true;
});
afterEach(async () => {
    await routes.drain();
    jest.restoreAllMocks();
    fs.rmSync(directory, {recursive: true, force: true});
});
async function preview(request = optimizationRequest()) {
    const response = await routes.handle("POST", "support", {request, expectedProjectRoot: source}, context());
    expect(response.status).toBe(200);
    return response.body as {sourceRevision: string; supported: boolean};
}

it("persists and reloads the full sampled verdict without granting lost process-local save receipts", async () => {
    const request = stochasticOptimizationRequest();
    request.targets[0].tolerance = {kind: "absolute", value: 0};
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    const {job} = started.body as {job: StudioJobView};
    await routes.drain();
    const completed = jobs.get(source, job.id)!;
    expect(completed).toMatchObject({status: "completed", result: {detail: {status: "inconclusive", evidence: {stochastic: {assessmentSamples: 6000}}}}});
    const reloaded = new FileStudioJobRepository(path.join(directory, "jobs"));
    expect(reloaded.get(job.id)!.result).toEqual(completed.result);
    const fresh = new StudioOptimizationService(new StudioJobService(reloaded), new ProjectOptimizationService(path.join(directory, "fresh")));
    const save = {request, expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "lost.json")};
    expect((await fresh.handle("POST", "save", save, context())).status).toBe(409);
    const output = path.join(directory, "candidate.json");
    expect((await routes.handle("POST", "save", {...save, destination: output}, context())).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(`${output}.optimization.json`, "utf8")).status).toBe("inconclusive");
    await fresh.shutdown();
});
it("runs through durable jobs, preserves terminal evidence on reload and saves only explicit reviewed output", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    expect(support.supported).toBe(true);
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    expect(start.status).toBe(202);
    const {job} = start.body as {job: StudioJobView};
    await routes.drain();
    expect(jobs.get(source, job.id)).toMatchObject({
        status: "completed",
        result: {detail: {status: "success", evidence: {measured: [0.75]}}},
    });
    const reloaded = new FileStudioJobRepository(path.join(directory, "jobs"));
    expect(reloaded.get(job.id)?.result).toEqual(jobs.get(source, job.id)?.result);
    const output = path.join(directory, "saved.blueprint.json");
    expect((await routes.handle("POST", "save", {request, expectedProjectRoot: source, jobId: job.id, destination: output}, context())).status).toBe(200);
    expect((await routes.handle("POST", "save", {request, expectedProjectRoot: source, jobId: job.id, destination: output}, context())).status).toBe(409);
});
it("rejects stale source and conflicting requests while cancellation drains a real executor", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const first = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    const {job} = first.body as {job: StudioJobView};
    const repeat = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    expect((repeat.body as {job: StudioJobView}).job.id).toBe(job.id);
    const changed = optimizationRequest();
    changed.targets[0].value = 0.9;
    expect(
        (await routes.handle("POST", "start", {request: changed, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context()))
            .status,
    ).toBe(409);
    jobs.cancel(source, job.id);
    await routes.drain();
    expect(jobs.get(source, job.id)?.status).toBe("cancelled");
    fs.appendFileSync(source, " ");
    expect(
        (await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context())).status,
    ).toBe(409);
});
it.each([0, -1, 0.5, "2", null, undefined, 1e20, "NaN", "Infinity", true])(
    "validates budget %p before starting jobs, retains submitted input, then accepts correction",
    async (budget) => {
        const request = optimizationRequest();
        (request.policy as unknown as {budget: unknown}).budget = budget;
        const before = fs.readFileSync(source);
        const result = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: "invalid"}, context());
        expect(result.status).toBe(400);
        expect(result.body).toHaveProperty("submitted.request", request);
        expect(jobs.list()).toEqual([]);
        expect(fs.readFileSync(source)).toEqual(before);
        expect((await preview()).supported).toBe(true);
    },
);
it("discards stale Project results and retains the operational verdict", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    current = false;
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    expect(jobs.get(source, job.id)?.result?.detail?.status).toBe("failure");
    expect(
        (
            await routes.handle(
                "POST",
                "save",
                {request, expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "stale.json")},
                context(),
            )
        ).status,
    ).toBe(409);
});

it("drains support/execution ownership on shutdown and rejects further work", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    expect(started.status).toBe(202);
    await routes.shutdown();
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect((await routes.handle("POST", "support", {request, expectedProjectRoot: source}, context())).status).toBe(409);
});

it("rejects old-tab support, start and save requests for two Projects with identical source revisions", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    const secondDirectory = path.join(directory, "second");
    fs.mkdirSync(secondDirectory);
    const second = path.join(secondDirectory, path.basename(source));
    fs.copyFileSync(source, second);
    const secondContext = {projectRoot: second, projectId: second, isCurrent: () => true};
    for (const action of ["support", "start", "save"] as const) {
        const response = await routes.handle("POST", action, {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision, jobId: job.id, destination: path.join(directory, "stale-output.json")}, secondContext);
        expect(response).toMatchObject({status: 409, body: {error: expect.stringContaining("intended Project")}});
    }
    expect(jobs.list()).toHaveLength(1);
    expect(fs.existsSync(path.join(directory, "stale-output.json"))).toBe(false);
    const secondSupport = await routes.handle("POST", "support", {request, expectedProjectRoot: second}, secondContext);
    expect(secondSupport).toMatchObject({status: 200, body: {sourceRevision: support.sourceRevision}});
});

it.each(["opaque", "tampered"])("rejects %s package authority without executing modules through support or start", async (kind) => {
    const root = path.join(directory, kind);
    const marker = path.join(directory, "executed");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: kind, pokie: {entry: "index.cjs"}}));
    fs.writeFileSync(path.join(root, "parameters.json"), JSON.stringify(optimizationBlueprint()));
    const code = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); module.exports = {};`;
    fs.writeFileSync(path.join(root, "index.cjs"), code);
    if (kind === "tampered") {
        declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
        fs.appendFileSync(path.join(root, "index.cjs"), "\n// changed after declaration");
    }
    const packageContext = {projectRoot: root, projectId: root, isCurrent: () => true};
    const request = optimizationRequest();
    const preview = await routes.handle("POST", "support", {request, expectedProjectRoot: root}, packageContext);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({supported: false});
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: root, sourceRevision: (preview.body as {sourceRevision: string}).sourceRevision}, packageContext);
    expect(start.status).toBe(202);
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    expect(jobs.get(root, job.id)?.result?.detail?.status).toBe("unsupported");
    expect(fs.existsSync(marker)).toBe(false);
});


it("keeps cancelling until game release settles, then persists cleanup recovery and accepted partial counts", async () => {
    let entered!: () => void;
    let rejectRelease!: (error: Error) => void;
    const releasing = new Promise<void>(resolve => {
        entered = resolve;
    });
    const gate = new Promise<void>((_resolve, reject) => {
        rejectRelease = reject;
    });
    const create = recipes.createOptimizationSimulationGame;
    const hook = jest.fn(async () => {
        entered();
        await gate;
    });
    const factory = jest.spyOn(recipes, "createOptimizationSimulationGame").mockImplementation(recipe => {
        const game = create(recipe);
        const release = game.release!;
        game.release = async () => {
            await release();
            await hook();
        };
        return game;
    });
    const before = fs.readFileSync(source);
    try {
        const request = stochasticOptimizationRequest();
        const support = await preview(request);
        const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
        const {job} = started.body as {job: StudioJobView};
        await releasing;
        jobs.cancel(source, job.id);
        expect(jobs.get(source, job.id)?.status).toBe("cancelling");
        rejectRelease(new Error("release refused during cancellation"));
        await routes.drain();
        const terminal = jobs.get(source, job.id)!;
        expect(terminal).toMatchObject({status: "recovery-required", result: {detail: {status: "failure", diagnostics: [{path: "cleanup"}], evidence: {stochastic: {searchSamples: 400}}}}});
        expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(job.id)!.result).toEqual(terminal.result);
        expect(hook).toHaveBeenCalledTimes(1);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    } finally {
        rejectRelease(new Error("test teardown"));
        await routes.drain();
        factory.mockRestore();
    }
});

it("binds direct HTTP-style save and authored apply to the current reviewed policy, then consumes apply", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    await routes.drain();
    const {job} = started.body as {job: StudioJobView};
    const changed = structuredClone(request);
    changed.policy.locks.push("/manifest");
    const before = fs.readFileSync(source);
    for (const action of ["save", "apply"] as const) {
        const response = await routes.handle("POST", action, {request: changed, expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "rejected.json")}, context());
        expect(response.status).toBe(409);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.existsSync(path.join(directory, "rejected.json"))).toBe(false);
    }
    const body = {request, expectedProjectRoot: source, jobId: job.id};
    expect((await routes.handle("POST", "apply", body, context())).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
    expect(jobs.get(source, job.id)?.result?.provenance).toMatchObject({authoredApply: {path: source}});
    expect((await routes.handle("POST", "apply", body, context())).status).toBe(409);
    await routes.shutdown();
});

function latch() {
    let release!: () => void;
    const promise = new Promise<void>(resolve => {
        release = resolve;
    });
    return {promise, release};
}

async function httpStudio(loadGame = (file: string) => Promise.resolve(createTunableBlueprintGame(JSON.parse(fs.readFileSync(file, "utf8"))))) {
    const studioRoot = path.join(directory, "studio");
    fs.mkdirSync(studioRoot);
    const repository = new FileStudioJobRepository(path.join(directory, "http-jobs"));
    const httpJobs = new StudioJobService(repository);
    const completed = latch();
    const save = repository.save.bind(repository);
    jest.spyOn(repository, "save").mockImplementation(job => {
        save(job);
        if (job.operation === "optimization" && job.status === "completed") completed.release();
    });
    const home = new StudioHomeService("1.3.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
    const server = new StudioServer({pokieVersion: "1.3.0", port: 0, studioRoot, initialContext: {mode: "project", projectRoot: source},
        jobService: httpJobs, homeService: home, blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
        projectRegistrationService: new StudioProjectRegistrationService(), loadGame, resolveRuntimePackageRoot: passthroughRuntimePackageResolver});
    const address = await server.start();
    const base = `http://${address.host}:${address.port}`;
    const post = (route: string, body: unknown) => fetch(`${base}/api/${route}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    const request = optimizationRequest();
    const supportResponse = await post("project/optimization/support", {expectedProjectRoot: source, request});
    expect(supportResponse.status).toBe(200);
    const support = await supportResponse.json() as {sourceRevision: string};
    const started = await post("project/optimization/start", {expectedProjectRoot: source, request, sourceRevision: support.sourceRevision});
    expect(started.status).toBe(202);
    const {job} = await started.json() as {job: StudioJobView};
    await completed.promise;
    return {server, base, post, request, job, body: {expectedProjectRoot: source, request, jobId: job.id}};
}

it.each(["ready", "preparing"])("actual HTTP apply preserves rejected sessions and invalidates an overlapping %s Play session", async phase => {
    const loadedValues: number[] = [];
    const loaderEntered = latch();
    const loaderGate = latch();
    let holdNextLoad = false;
    let heldSnapshot: string | undefined;
    const loadGame = async (file: string) => {
        const model = JSON.parse(fs.readFileSync(file, "utf8"));
        loadedValues.push(model.paytable.A[2]);
        const game = createTunableBlueprintGame(model);
        if (holdNextLoad) {
            holdNextLoad = false;
            // Give this load a real compatibility-loader lease. A handwritten game's
            // release hook is not the snapshot lease released by Studio Play.
            const packageRoot = path.join(directory, "held-play-package");
            fs.mkdirSync(packageRoot);
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "held-play", version: "1.0.0", pokie: {entry: "index.cjs"}}));
            fs.writeFileSync(path.join(packageRoot, "index.cjs"), "// injected entry module");
            const leased = await loadPokieGame(packageRoot, entry => {
                heldSnapshot = path.dirname(entry);
                return Promise.resolve({default: game});
            });
            loaderEntered.release();
            await loaderGate.promise;
            return leased;
        }
        return game;
    };
    const {server, base, post, request, body} = await httpStudio(loadGame);
    const validated = latch();
    const commitGate = latch();
    const committed = latch();
    try {
        const created = await post("project/play/session", {seed: "old-session"});
        expect(created.status).toBe(201);
        const old = await created.json() as {session: {sessionId: string}};
        const changed = structuredClone(request);
        changed.policy.locks.push("/manifest");
        const before = fs.readFileSync(source);
        for (const rejected of [null, {...body, expectedProjectRoot: directory}, {...body, request: changed}, {...body, jobId: "unavailable"}]) {
            expect((await post("project/optimization/apply", rejected)).status).toBeGreaterThanOrEqual(400);
            expect(fs.readFileSync(source)).toEqual(before);
            const spin = await post(`project/play/sessions/${old.session.sessionId}/spin`, {bet: 1});
            expect(spin.status).toBe(200);
            expect(await spin.json()).toMatchObject({status: "ok", session: {sessionId: old.session.sessionId}});
        }
        const failure = jest.spyOn(ProjectOptimizationService.prototype, "publish").mockRejectedValueOnce(new Error("native validation refused"));
        expect((await post("project/optimization/apply", body)).status).toBe(409);
        failure.mockRestore();
        expect(fs.readFileSync(source)).toEqual(before);
        expect((await post(`project/play/sessions/${old.session.sessionId}/spin`, {bet: 1})).status).toBe(200);
        const publish = ProjectOptimizationService.prototype.publish;
        jest.spyOn(ProjectOptimizationService.prototype, "publish").mockImplementation(async function (this: ProjectOptimizationService, ...args) {
            const output = await Reflect.apply(publish, this, args);
            validated.release();
            await commitGate.promise;
            return output;
        });
        const rename = fs.renameSync;
        jest.spyOn(fs, "renameSync").mockImplementation((from, to) => {
            const result = rename(from, to);
            if (String(from).includes(".pokie-apply-") && String(to) === source) committed.release();
            return result;
        });
        const applying = post("project/optimization/apply", body);
        await validated.promise;
        expect(fs.readFileSync(source)).toEqual(before);
        holdNextLoad = phase === "preparing";
        const overlapping = post("project/play/session", {seed: "overlapping-session"});
        let overlappingId: string | undefined;
        if (phase === "ready") {
            const response = await overlapping;
            expect(response.status).toBe(201);
            overlappingId = (await response.json() as {session: {sessionId: string}}).session.sessionId;
        } else {
            await loaderEntered.promise;
            expect(heldSnapshot).toBeDefined();
            expect(fs.existsSync(heldSnapshot!)).toBe(true);
        }
        const loadsBeforeCommit = [...loadedValues];
        expect(loadsBeforeCommit).toEqual(expect.arrayContaining([2]));
        expect(loadsBeforeCommit.every(value => value === 2)).toBe(true);
        commitGate.release();
        await committed.promise;
        if (phase === "preparing") {
            expect((await post("project/play/session", {})).status).toBe(409);
            expect((await post(`project/play/sessions/${old.session.sessionId}/spin`, {})).status).toBe(409);
            loaderGate.release();
            expect((await overlapping).status).toBe(409);
            expect(fs.existsSync(heldSnapshot!)).toBe(false);
        }
        expect((await applying).status).toBe(200);
        const contextResponse = await fetch(`${base}/api/project/context`);
        expect(await contextResponse.json()).toMatchObject({status: "loaded", projectRoot: source, type: "blueprint"});
        expect(loadedValues).toEqual(loadsBeforeCommit);
        expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
        for (const id of [old.session.sessionId, overlappingId].filter(Boolean)) expect((await post(`project/play/sessions/${id}/spin`, {})).status).toBe(404);
        const fresh = await post("project/play/session", {seed: "committed-session"});
        expect(fresh.status).toBe(201);
        expect(loadedValues).toEqual([...loadsBeforeCommit, 3]);
        const freshId = (await fresh.json() as {session: {sessionId: string}}).session.sessionId;
        const winning = await post(`project/play/sessions/${freshId}/find-any-win`, {});
        expect(winning.status).toBe(200);
        const played = await winning.json() as {status: string; session: {bet: number; win: number}};
        expect(played.status).toBe("ok");
        expect(played.session.win).toBeGreaterThan(0);
        expect(played.session.win / played.session.bet).toBeCloseTo(3);
        expect((await post("project/optimization/apply", body)).status).toBe(409);
        expect((await post(`project/play/sessions/${freshId}/spin`, {})).status).toBe(200);
    } finally {
        commitGate.release();
        loaderGate.release();
        await server.stop();
    }
});

it.each(["shutdown", "close", "switch"])("actual HTTP %s invalidates and drains an admitted apply before mutation", async lifecycle => {
    const {server, post, body} = await httpStudio();
    const entered = latch();
    const gate = latch();
    const draining = latch();
    const before = fs.readFileSync(source);
    const unowned = path.join(directory, "unowned-output.json");
    fs.writeFileSync(unowned, "external output");
    const publish = ProjectOptimizationService.prototype.publish;
    jest.spyOn(ProjectOptimizationService.prototype, "publish").mockImplementation(async function (this: ProjectOptimizationService, ...args) {
        const output = await Reflect.apply(publish, this, args);
        entered.release();
        await gate.promise;
        return output;
    });
    const release = StudioOptimizationService.prototype.releaseCandidates;
    jest.spyOn(StudioOptimizationService.prototype, "releaseCandidates").mockImplementation(function (this: StudioOptimizationService) {
        const result = Reflect.apply(release, this, []);
        draining.release();
        return result;
    });
    let stopped = false;
    try {
        const applying = post("project/optimization/apply", body);
        await entered.promise;
        let finished = false;
        const transition = lifecycle === "shutdown" ? server.stop().then(() => {
            stopped = true;
        })
            : post(lifecycle === "close" ? "projects/close" : "home/projects/open", lifecycle === "close" ? {confirmActiveJobs: true} : {projectRoot: source, confirmActiveJobs: true});
        transition.then(() => {
            finished = true;
        }).catch(() => undefined);
        await draining.promise;
        expect(finished).toBe(false);
        expect(fs.readFileSync(source)).toEqual(before);
        gate.release();
        const rejected = await applying;
        expect(rejected.status).toBe(409);
        expect(await rejected.json()).toMatchObject({error: expect.stringMatching(/cancelled|changed/)});
        const result = await transition;
        if (result) expect(result.status).toBe(200);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.readFileSync(unowned, "utf8")).toBe("external output");
        expect(fs.readdirSync(directory).some(name => name.startsWith(".pokie-"))).toBe(false);
    } finally {
        gate.release();
        if (!stopped) await server.stop();
    }
});

it.each(["save", "apply"] as const)("shutdown aborts an admitted %s and rolls back only owned outputs", async action => {
    const optimizer = new ProjectOptimizationService(path.join(directory, "scratch"));
    routes = new StudioOptimizationService(jobs, optimizer);
    const request = optimizationRequest();
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    await routes.drain();
    const {job} = started.body as {job: StudioJobView};
    const entered = latch();
    const gate = latch();
    const destination = path.join(directory, "owned-output.json");
    const unowned = path.join(directory, "unowned-output.json");
    fs.writeFileSync(unowned, "external output");
    const before = fs.readFileSync(source);
    if (action === "save") {
        const publish = ArtifactPublicationOwnership.prototype.publish;
        jest.spyOn(ArtifactPublicationOwnership.prototype, "publish").mockImplementation(async function (this: ArtifactPublicationOwnership, ...args) {
            await Reflect.apply(publish, this, args);
            entered.release();
            await gate.promise;
        });
    } else {
        const publish = optimizer.publish;
        jest.spyOn(optimizer, "publish").mockImplementation(async function (this: ProjectOptimizationService, ...args) {
            entered.release();
            await gate.promise;
            return Reflect.apply(publish, this, args);
        });
    }
    const pending = routes.handle("POST", action, {request, expectedProjectRoot: source, jobId: job.id, destination}, context());
    await entered.promise;
    if (action === "save") expect(fs.existsSync(destination)).toBe(true);
    let finished = false;
    const shutdown = routes.shutdown().then(() => {
        finished = true;
    });
    expect(finished).toBe(false);
    gate.release();
    expect((await pending).status).toBe(409);
    await shutdown;
    expect(fs.readFileSync(source)).toEqual(before);
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readFileSync(unowned, "utf8")).toBe("external output");
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect(fs.readdirSync(directory).some(name => name.startsWith(".pokie-"))).toBe(false);
});

it("shutdown drains committed apply refresh and retains a truthful successful disposition", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    await routes.drain();
    const {job} = started.body as {job: StudioJobView};
    const committed = latch();
    const cleanup = latch();
    const pending = routes.handle("POST", "apply", {request, expectedProjectRoot: source, jobId: job.id}, {
        ...context(), onAuthoredCommit: () => {
            committed.release();
            return cleanup.promise;
        },
    });
    await committed.promise;
    expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
    let finished = false;
    const shutdown = routes.shutdown().then(() => {
        finished = true;
    });
    expect(finished).toBe(false);
    cleanup.release();
    expect((await pending).status).toBe(200);
    await shutdown;
    expect(jobs.get(source, job.id)?.result?.provenance).toMatchObject({authoredApply: {path: source}});
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
});

it("reports a committed apply with recovery information and fails lifecycle completion if runtime cleanup fails", async () => {
    const owned = new StudioOptimizationService(jobs, new ProjectOptimizationService(path.join(directory, "scratch")));
    const request = optimizationRequest();
    const support = await owned.handle("POST", "support", {request, expectedProjectRoot: source}, context());
    const started = await owned.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: (support.body as {sourceRevision: string}).sourceRevision}, context());
    await owned.drain();
    const {job} = started.body as {job: StudioJobView};
    const response = await owned.handle("POST", "apply", {request, expectedProjectRoot: source, jobId: job.id}, {
        ...context(), onAuthoredCommit: () => Promise.reject(new Error("runtime release refused")),
    });
    expect(response).toMatchObject({status: 200, body: {outputPath: source, warning: expect.stringMatching(/Source was applied.*runtime refresh failed/)}});
    expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
    expect(jobs.get(source, job.id)?.result?.provenance).toMatchObject({authoredApply: {path: source}});
    await expect(owned.shutdown()).rejects.toThrow(/runtime release refused/);
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
});

it("V35 optimizer progress identifies each real candidate across resets and durable reload", async () => {
    const observations: NonNullable<StudioJobView["progress"]>[] = [];
    const progress = jobs.progress.bind(jobs);
    const observer = jest.spyOn(jobs, "progress").mockImplementation((id, value) => {
        const updated = progress(id, value);
        observations.push(value);
        expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(id)?.progress).toEqual(value);
        return updated;
    });
    const before = fs.readFileSync(source);
    try {
        for (const budget of [100, 1, 100]) {
            observations.length = 0;
            const request = optimizationRequest();
            request.targets[0].value = 999;
            request.policy.budget = budget;
            const support = await preview(request);
            const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
            const {job} = started.body as {job: StudioJobView};
            await routes.drain();
            const total = Math.min(budget, 3);
            expect(jobs.get(source, job.id)).toMatchObject({status: "completed", result: {detail: {status: "infeasible", evidence: {evaluated: total, consumedWork: total}}}});
            const materializing = observations.filter(value => value.stage.startsWith("Materializing outcomes"));
            expect([...new Set(materializing.map(value => value.stage))]).toEqual(
                Array.from({length: total}, (_, index) => `Materializing outcomes (candidate ${index + 1} of ${total})`),
            );
            for (let candidate = 1; candidate <= total; candidate++) {
                const stage = `Materializing outcomes (candidate ${candidate} of ${total})`;
                const samples = materializing.filter(value => value.stage === stage);
                expect(samples[0]).toMatchObject({current: "0", total: "indeterminate", unit: "outcomes"});
                expect(samples[samples.length - 1]).toMatchObject({current: "2", total: "2", unit: "outcomes"});
                expect(samples.every((value, index) => index === 0 || BigInt(value.current) >= BigInt(samples[index - 1].current))).toBe(true);
                expect(observations).toContainEqual(expect.objectContaining({stage: `Enumerating reel stops (candidate ${candidate} of ${total})`, current: "4", total: "4", unit: "raw draws"}));
            }
            expect(fs.readFileSync(source)).toEqual(before);
            expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        }
    } finally {
        observer.mockRestore();
        await routes.shutdown();
    }
});

it("V35 optimizer progress persists the retained 46656-draw workload before cancellation and permits reviewed retry/apply", async () => {
    const fixture = fs.readFileSync(path.resolve("tests/v2/fixtures/Valera35FeralBlazingSafari.blueprint.json"));
    fs.writeFileSync(source, fixture);
    const request = {
        targets: [{metric: "rtp", unit: "ratio", value: 0.95, tolerance: {kind: "absolute", value: 0.001}}],
        policy: {strategy: "exact-finite-v1", seed: "optimization-1", budget: 100, maxOutcomes: 100000,
            mode: "base", stake: 1, scope: "paid-entry", tunables: [{path: "/paytable/A/3", values: [1, 2, 3]}], locks: []},
    } as ReturnType<typeof optimizationRequest>;
    const support = await preview(request);
    expect(support.supported).toBe(true);
    const observations: NonNullable<StudioJobView["progress"]>[] = [];
    const progress = jobs.progress.bind(jobs);
    const observer = jest.spyOn(jobs, "progress").mockImplementation((id, value) => {
        const updated = progress(id, value);
        observations.push(value);
        if (value.stage === "Materializing outcomes (candidate 1 of 3)" && value.current === "1") {
            // Read the actual retained running record as a reload/reattach does.
            expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(id)).toMatchObject({status: "running", progress: value});
            expect(value.total).toBe("indeterminate");
            jobs.cancel(source, id);
        }
        return updated;
    });
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    const {job} = started.body as {job: StudioJobView};
    await routes.drain();
    observer.mockRestore();
    expect(observations).toContainEqual(expect.objectContaining({stage: "Enumerating reel stops (candidate 1 of 3)", current: "46656", total: "46656", unit: "raw draws"}));
    expect(observations).toContainEqual(expect.objectContaining({stage: "Materializing outcomes (candidate 1 of 3)", current: "1", total: "indeterminate", unit: "outcomes"}));
    expect(jobs.get(source, job.id)).toMatchObject({status: "cancelled", result: {detail: {status: "cancelled", evidence: {evaluated: 0, consumedWork: 1}}}});
    expect(jobs.get(source, job.id)?.result?.detail?.candidate).toBeUndefined();
    expect(fs.readFileSync(source)).toEqual(fixture);
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect((await routes.handle("POST", "apply", {request, expectedProjectRoot: source, jobId: job.id}, context())).status).toBe(409);
    // Independent Apply acceptance remains pending. This bounded recovery uses
    // the small known-answer fixture through the same real service and authority.
    fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
    for (let attempt = 0; attempt < 2; attempt++) {
        const retry = optimizationRequest();
        const supported = await preview(retry);
        const next = await routes.handle("POST", "start", {request: retry, expectedProjectRoot: source, sourceRevision: supported.sourceRevision}, context());
        await routes.drain();
        const id = (next.body as {job: StudioJobView}).job.id;
        expect(id).not.toBe(job.id);
        expect(jobs.get(source, id)).toMatchObject({status: "completed", result: {detail: {status: "success", evidence: {measured: [0.75]}}}});
        if (attempt === 1) {
            const body = {request: retry, expectedProjectRoot: source, jobId: id};
            expect((await routes.handle("POST", "apply", body, context())).status).toBe(200);
            expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
            expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(id)?.result?.provenance?.authoredApply).toEqual({path: source});
            expect((await routes.handle("POST", "apply", body, context())).status).toBe(409);
        }
    }
    await routes.shutdown();
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
}, 60000);

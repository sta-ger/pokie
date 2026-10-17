import {Worker} from "worker_threads";
import {pathToFileURL} from "url";
import {SimulationWorkerCoordinator} from "../../src/simulation/parallel/SimulationWorkerCoordinator.js";
import {writeOptimizationWorkerEntry} from "./fixtures/OptimizationWorkerFixture.js";
import fs from "fs";
import path from "path";
import {ArtifactPublicationOwnership, ProjectOptimizationService, ProjectTargetResolver, ParSheetExporter, ParSheetImporter, WasmArtifactBuilder, declarePackageTuning, bindCanonicalWasmTuningSource, createTunableBlueprintGame, generateExactWeightedOutcomeLibrary, OutcomeLibraryBundleWriter, OutcomeLibraryBundleReader, StakeEngineExporter, StakeEngineOutcomeSourceReader, buildWeightedOutcomeLibrary} from "../../src/index.js";
import {loadPokieGameRuntime} from "../../src/gamepackage/loadPokieGame.js";
import {sourceInventory} from "../../src/optimization/internal/optimizationData.js";
import {acquireOptimizationAdapter} from "../../src/optimization/internal/ProjectOptimizationAdapter.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {StudioOptimizationService} from "../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import type {StudioJobView} from "../../cli/studio/jobs/StudioJobView.js";
import type {ProjectType} from "../../src/project/ProjectType.js";
import {optimizationBlueprint, optimizationRequest, stochasticOptimizationRequest, declaredOptimizationGameCode} from "./fixtures/OptimizationFixture.js";

let directory: string;
let service: ProjectOptimizationService;
const resolve = async (file: string) => (await new ProjectTargetResolver().resolve(file, {readConfigurationProvenance: false}))!;
beforeEach(() => {
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimization-public-"));
    service = new ProjectOptimizationService(path.join(directory, "scratch"));
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    fs.rmSync(directory, {recursive: true, force: true});
});
async function fixture(type: ProjectType) {
    const blueprint = optimizationBlueprint();
    const source = path.join(directory, "source.blueprint.json");
    fs.writeFileSync(source, JSON.stringify(blueprint));
    let file = source;
    const request = optimizationRequest();
    if (type === "parWorkbook") {
        file = path.join(directory, "source.xlsx");
        await new ParSheetExporter("1.3.0").exportToFile(blueprint, file);
    } else if (type === "tsPackage") {
        file = path.join(directory, "custom");
        fs.mkdirSync(file);
        fs.writeFileSync(path.join(file, "package.json"), JSON.stringify({name: "custom-logic", version: "1", pokie: {entry: "index.cjs"}}));
        fs.writeFileSync(path.join(file, "parameters.json"), JSON.stringify(blueprint));
        // Executable custom behavior is outside the descriptor and survives apply/publication.
        fs.writeFileSync(path.join(file, "index.cjs"), declaredOptimizationGameCode.replace("module.exports = {", "module.exports = {getCustomIdentity: () => 'custom-executable-v25',"));
        declarePackageTuning(file, "parameters.json", ["/paytable/A/2"]);
        request.policy.protectedFiles = ["index.cjs", "package.json"];
    } else if (type === "wasm") {
        file = path.join(directory, "source.wasm");
        await new WasmArtifactBuilder("1.3.0").build(await resolve(source), file);
        await bindCanonicalWasmTuningSource(file, blueprint, ["/paytable/A/2"]);
    } else if (type === "outcomeLibrary" || type === "stakeAdapter") {
        file = path.join(directory, type);
        const generated = (await generateExactWeightedOutcomeLibrary({game: createTunableBlueprintGame(blueprint), libraryId: "native", pokieVersion: "1.3.0", stake: 1, exact: true, now: () => new Date(0)})).library;
        const library = buildWeightedOutcomeLibrary({libraryId: "native", outcomes: generated.outcomes.map((outcome, i) => ({...outcome, id: String(i + 1)}))});
        if (type === "outcomeLibrary") await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "native", outcomes: library.outcomes}, {modeName: "untouched", libraryId: "other", outcomes: library.outcomes}], file);
        else await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], file);
        request.policy.scope = "native-outcomes";
        request.policy.locks = [];
        const win = library.outcomes.find(outcome => outcome.artifact.totalWin > 0)!;
        // Original weights represent one winning stop and three losing stops; equal weights give RTP 1.
        request.policy.tunables = [{path: `/modes/base/outcomes/${win.id}/weight`, values: type === "stakeAdapter" ? ["3"] : [3]}];
        request.targets[0].value = 1;
    }
    return {file, request};
}

// The TS case repeats isolated executable acquisition for engine/CLI publication,
// independent readback and reviewed apply. Allow the complete serial workflow to
// finish under the controller's bounded concurrent workers before fixture cleanup.
it.each(["blueprint", "parWorkbook", "tsPackage", "outcomeLibrary", "stakeAdapter", "wasm"] as const)("public engine and registered CLI retain native %s outputs", async type => {
    const {file, request} = await fixture(type);
    const project = await resolve(file);
    const before = sourceInventory(project);
    expect(await service.support(project, request)).toMatchObject({supported: true, writable: expect.arrayContaining([request.policy.tunables[0].path])});
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("success");
    const output = path.join(directory, `engine${path.extname(file)}`);
    await service.publish(result.candidate!, request, output);
    const native = await resolve(output);
    expect(native.type).toBe(type);
    const adapter = await acquireOptimizationAdapter(native, request.policy);
    expect(await adapter.measure(output, await adapter.read(output), request.targets, request.policy)).toEqual([request.targets[0].value]);
    const policy = path.join(directory, "policy.json");
    fs.writeFileSync(policy, JSON.stringify(request));
    const stdout = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const command = registerCliCommands({version: "1.3.0", pokiePackageRoot: process.cwd(), clientRoot: directory, studioRoot: directory}).find(command => command.getName() === "optimize")!;
    const cliOutput = path.join(directory, `cli${path.extname(file)}`);
    expect(await command.run([file, "--policy", policy, "--out", cliOutput])).toBe(0);
    expect(JSON.parse(stdout.mock.calls[stdout.mock.calls.length - 1][0])).toMatchObject({status: "success", output: {type}});
    const cliProject = await resolve(cliOutput);
    expect(cliProject.type).toBe(type);
    const cliAdapter = await acquireOptimizationAdapter(cliProject, request.policy);
    expect(await cliAdapter.measure(cliOutput, await cliAdapter.read(cliOutput), request.targets, request.policy)).toEqual([request.targets[0].value]);
    expect(sourceInventory(project)).toEqual(before);
    if (["blueprint", "parWorkbook", "tsPackage"].includes(type)) {
        const reviewFile = path.join(directory, "review.json");
        fs.writeFileSync(reviewFile, stdout.mock.calls[stdout.mock.calls.length - 1][0] as string);
        expect(await command.run([file, "--policy", policy, "--apply", reviewFile])).toBe(0);
        const authored = await acquireOptimizationAdapter(await resolve(file), request.policy);
        expect(await authored.measure(file, await authored.read(file), request.targets, request.policy)).toEqual([0.75]);
    }
    if (type === "outcomeLibrary") {
        const reader = new OutcomeLibraryBundleReader();
        expect((await reader.readLibrary(output, "untouched")).outcomes).toEqual((await reader.readLibrary(file, "untouched")).outcomes);
        expect((await reader.readLibrary(output, "base")).outcomes.map(o => [o.id, o.artifact])).toEqual((await reader.readLibrary(file, "base")).outcomes.map(o => [o.id, o.artifact]));
    }
    if (type === "stakeAdapter") expect((await new StakeEngineOutcomeSourceReader().readFromDirectory(output)).modes[0].outcomes.every(outcome => typeof outcome.weight === "bigint")).toBe(true);
    await service.discard(result.candidate!);
    expect((await resolve(output)).type).toBe(type);
}, 180000);

it.each(["blueprint", "parWorkbook", "tsPackage"] as const)("explicit authored %s apply reopens measured source and consumes the preview", async type => {
    const {file, request} = await fixture(type);
    const before = type === "tsPackage" ? fs.readFileSync(path.join(file, "index.cjs")) : undefined;
    const parBefore = type === "parWorkbook" ? (await new ParSheetImporter().importFromFile(file)).blueprint : undefined;
    const result = await service.optimize(await resolve(file), request);
    expect(result.status).toBe("success");
    await service["apply"](result.candidate!, request);
    expect((await resolve(file)).type).toBe(type);
    const adapter = await acquireOptimizationAdapter(await resolve(file), request.policy);
    expect(await adapter.measure(file, await adapter.read(file), request.targets, request.policy)).toEqual([0.75]);
    await expect(service["apply"](result.candidate!, request)).rejects.toThrow(/receipt|applied|changed/);
    if (type === "tsPackage") {
        expect(fs.readFileSync(path.join(file, "index.cjs"))).toEqual(before);
        const runtime = await loadPokieGameRuntime(file);
        try {
            expect((runtime.game as unknown as {getCustomIdentity(): string}).getCustomIdentity()).toBe("custom-executable-v25");
        } finally {
            await runtime.game.release?.();
            await runtime.release();
        }
    }
    if (parBefore) {
        const after = (await new ParSheetImporter().importFromFile(file)).blueprint;
        after.paytable.A[2] = parBefore.paytable.A[2];
        expect(after).toEqual(parBefore);
    }
    await service.discard(result.candidate!);
});

it.each(["locks", "candidate", "source", "deleted", "authority"])("refuses %s drift before authored writes", async drift => {
    const {file, request} = await fixture("blueprint");
    const result = await service.optimize(await resolve(file), request);
    if (drift === "locks") request.policy.locks.push("/manifest");
    if (drift === "source") fs.appendFileSync(file, " ");
    if (drift === "deleted") fs.unlinkSync(file);
    if (drift === "candidate") fs.appendFileSync(result.candidate!.path, " ");
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
    const authority = drift === "authority" ? new ProjectOptimizationService(path.join(directory, "other")) : service;
    await expect(authority["apply"](result.candidate!, request)).rejects.toThrow();
    expect(fs.existsSync(file) ? fs.readFileSync(file) : undefined).toEqual(bytes);
    await service.discard(result.candidate!);
});

it.each(["write", "cleanup"])("rolls back both TS authored files on %s failure and permits a fresh retry", async failure => {
    const {file, request} = await fixture("tsPackage");
    const project = await resolve(file);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    if (failure === "write") {
        const rename = fs.renameSync;
        jest.spyOn(fs, "renameSync").mockImplementation((from, to) => {
            if (String(from).includes(".pokie-apply-") && String(to).endsWith("pokie-tuning.json")) throw Error("injected metadata write failure");
            return rename(from, to);
        });
    } else {
        const remove = fs.rmSync;
        let failed = false;
        jest.spyOn(fs, "rmSync").mockImplementation((target, options) => {
            if (String(target).includes(".pokie-apply-") && !failed) {
                failed = true;
                throw Error("injected cleanup failure");
            }
            return remove(target, options);
        });
    }
    await expect(service["apply"](result.candidate!, request)).rejects.toThrow(/apply failed/);
    jest.restoreAllMocks();
    expect(sourceInventory(project)).toEqual(before);
    await service["apply"](result.candidate!, request);
    await service.discard(result.candidate!);
});

it.each(["search", "assessment"])("active sampled %s reload reattaches, drains cancellation and retries without changing source/locks", async phase => {
    const {file} = await fixture("blueprint");
    const request = stochasticOptimizationRequest();
    request.policy.sampling!.workers = 2;
    request.policy.sampling!.assessmentSamples = 1000;
    request.policy.tunables[0].values = [3];
    request.targets[0].tolerance = {kind: "absolute", value: 0.3};
    const entry = writeOptimizationWorkerEntry(directory);
    const workers: Worker[] = [];
    jest.spyOn(SimulationWorkerCoordinator.prototype as unknown as {buildDefaultCreateWorker(): Promise<(request: unknown) => Worker>}, "buildDefaultCreateWorker").mockImplementation(() => Promise.resolve(request => {
        const worker = new Worker(pathToFileURL(entry), {workerData: request});
        workers.push(worker);
        return worker;
    }));
    const before = sourceInventory(await resolve(file));
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const studio = new StudioOptimizationService(jobs, service);
    const context = {projectRoot: file, projectId: file, isCurrent: () => true};
    const support = await studio.handle("POST", "support", {expectedProjectRoot: file, request}, context);
    const body = {expectedProjectRoot: file, request, sourceRevision: (support.body as {sourceRevision: string}).sourceRevision};
    let observed!: () => void;
    const observations = new Promise<void>(resolve => {
        observed = resolve;
    });
    const progress = jobs.progress.bind(jobs);
    jest.spyOn(jobs, "progress").mockImplementation((id, value) => {
        const updated = progress(id, value);
        if (value.stage === phase && (phase === "search" ? (/[1-9][0-9]* search observations/).test(value.message ?? "") : Number(value.current) > 0)) {
            observed();
            jobs.cancel(file, id);
        }
        return updated;
    });
    const launched = await studio.handle("POST", "start", body, context);
    const id = (launched.body as {job: StudioJobView}).job.id;
    // A browser remount lists the same running server job and starts no duplicate executor.
    expect(jobs.list(file)[0].id).toBe(id);
    expect((await studio.handle("POST", "start", body, context)).body).toMatchObject({job: {id}});
    await observations;
    await studio.drain();
    expect(jobs.get(file, id)).toMatchObject({status: "cancelled", result: {detail: {status: "cancelled", evidence: {stochastic: {searchSamples: expect.any(Number)}}}}});
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect((jobs.get(file, id)?.result?.detail?.evidence as {stochastic: {searchSamples: number}}).stochastic.searchSamples).toBeGreaterThan(0);
    expect(sourceInventory(await resolve(file))).toEqual(before);
    expect(workers.length).toBeGreaterThan(0);
    expect(workers.every(worker => worker.threadId === -1)).toBe(true);
    jest.mocked(jobs.progress).mockRestore();
    const retry = await studio.handle("POST", "start", body, context);
    await studio.drain();
    expect(jobs.get(file, (retry.body as {job: StudioJobView}).job.id)?.result?.detail?.status).toBe("attained");
    expect(sourceInventory(await resolve(file))).toEqual(before);
    await studio.shutdown();
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect(workers.every(worker => worker.threadId === -1)).toBe(true);
    if (phase === "search") {
        const failed = await service.optimize(await resolve(file), request, {onProgress: evidence => {
            if ((evidence.stochastic?.searchSamples ?? 0) > 0) throw new Error("observer failed after real worker observations");
        }});
        expect(failed).toMatchObject({status: "failure", evidence: {stochastic: {searchSamples: expect.any(Number)}}});
        expect(workers.every(worker => worker.threadId === -1)).toBe(true);
        expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        const fresh = await service.optimize(await resolve(file), request);
        expect(fresh.status).toBe("attained");
        await service.discard(fresh.candidate!);
        expect(sourceInventory(await resolve(file))).toEqual(before);
        expect(workers.every(worker => worker.threadId === -1)).toBe(true);
    }
}, 60000);

it("preserves concurrent parameter edits during failed multi-file rollback and reports recovery", async () => {
    const {file, request} = await fixture("tsPackage");
    const result = await service.optimize(await resolve(file), request);
    const parameters = path.join(file, "parameters.json");
    const originalContract = fs.readFileSync(path.join(file, "pokie-tuning.json"));
    const rename = fs.renameSync;
    jest.spyOn(fs, "renameSync").mockImplementation((from, to) => {
        if (String(from).includes(".pokie-apply-") && String(to).endsWith("pokie-tuning.json")) {
            fs.writeFileSync(parameters, "concurrent author bytes");
            throw Error("metadata commit refused");
        }
        return rename(from, to);
    });
    await expect(service["apply"](result.candidate!, request)).rejects.toThrow(/Recovery required: Concurrent edit retained/);
    expect(fs.readFileSync(parameters, "utf8")).toBe("concurrent author bytes");
    expect(fs.readFileSync(path.join(file, "pokie-tuning.json"))).toEqual(originalContract);
    await service.discard(result.candidate!);
});

it("retains staging cleanup ownership without mutating source and cleans it on discard", async () => {
    const {file, request} = await fixture("blueprint");
    const before = fs.readFileSync(file);
    const result = await service.optimize(await resolve(file), request);
    const remove = fs.rmSync;
    const cleanup = jest.spyOn(fs, "rmSync").mockImplementation((target, options) => {
        if (String(target).includes(".pokie-review-")) throw Error("staging remove refused");
        return remove(target, options);
    });
    await expect(service["apply"](result.candidate!, request)).rejects.toThrow(/Apply staging cleanup failed at/);
    expect(fs.readFileSync(file)).toEqual(before);
    cleanup.mockRestore();
    expect(fs.readdirSync(directory).some(name => name.startsWith(".pokie-review-"))).toBe(true);
    await service.discard(result.candidate!);
    expect(fs.readdirSync(directory).some(name => name.startsWith(".pokie-review-"))).toBe(false);
});


it("reproduces reviewed PAR candidate bytes across clock changes before CLI apply", async () => {
    const {file, request} = await fixture("parWorkbook");
    const policy = path.join(directory, "policy.json");
    const review = path.join(directory, "review.json");
    fs.writeFileSync(policy, JSON.stringify(request));
    const stdout = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const command = registerCliCommands({version: "1.3.0", pokiePackageRoot: process.cwd(), clientRoot: directory, studioRoot: directory}).find(command => command.getName() === "optimize")!;
    jest.useFakeTimers({doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "hrtime", "queueMicrotask"]});
    jest.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    expect(await command.run([file, "--policy", policy])).toBe(0);
    fs.writeFileSync(review, stdout.mock.calls[stdout.mock.calls.length - 1][0] as string);
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(await command.run([file, "--policy", policy, "--apply", review])).toBe(0);
    jest.useRealTimers();
    expect((await new ParSheetImporter().importFromFile(file)).blueprint.paytable.A[2]).toBe(3);
});


it("rejects exact publication dependency replacement while preserving source and foreign destination files", async () => {
    const {file, request} = await fixture("tsPackage");
    const dependency = path.join(file, "node_modules", "binding");
    fs.mkdirSync(dependency, {recursive: true});
    fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name: "binding", main: "index.cjs"}));
    fs.writeFileSync(path.join(dependency, "index.cjs"), "module.exports = 1;");
    const metadata = path.join(file, "package.json");
    fs.writeFileSync(metadata, JSON.stringify({...JSON.parse(fs.readFileSync(metadata, "utf8")), dependencies: {binding: "1"}}));
    fs.unlinkSync(path.join(file, "pokie-tuning.json"));
    declarePackageTuning(file, "parameters.json", ["/paytable/A/2"]);
    const project = await resolve(file);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.status).toBe("success");
    const output = path.join(directory, "replaced-bindings");
    const binding = path.join(output, "node_modules", "binding");
    const publish = ArtifactPublicationOwnership.prototype.publish;
    jest.spyOn(ArtifactPublicationOwnership.prototype, "publish").mockImplementation(async function(this: ArtifactPublicationOwnership, from, to, options) {
        await Reflect.apply(publish, this, [from, to, options]);
        if (to === output) {
            expect(fs.lstatSync(binding).isSymbolicLink()).toBe(true);
            fs.unlinkSync(binding);
            fs.mkdirSync(binding);
            fs.writeFileSync(path.join(binding, "package.json"), JSON.stringify({name: "binding", main: "index.cjs"}));
            fs.writeFileSync(path.join(binding, "index.cjs"), "module.exports = 1; // independently changed installation");
        }
    });
    await expect(service.publish(result.candidate!, request, output)).rejects.toThrow(/dependencies changed or are unavailable/);
    expect(sourceInventory(project)).toEqual(before);
    expect(fs.readFileSync(path.join(binding, "index.cjs"), "utf8")).toContain("independently changed installation");
    await service.discard(result.candidate!);
}, 60000);

import {jest} from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {POKIE_VERSION, type GameBlueprint} from "@fromstan/pokie";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../cli/studio/InMemoryRecentProjectsRepository.js";
import {applyJsonText, loadBlueprintEditorState} from "../../cli/studio-client/src/domain/blueprintEditorState.js";
import {Paytable} from "../../src/session/videoslot/paytable/Paytable.js";
import {generateExactWeightedOutcomeLibrary} from "../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {createTunableBlueprintGame} from "../../src/optimization/createTunableBlueprintGame.js";
import {SharedSlotMathPool} from "../../src/wasm/math/internal/SharedSlotMathPool.js";
import {resolveSharedSlotMathModel} from "../../src/generated/resolveSharedSlotMathModel.js";
import {createAuthoredSession} from "../../src/generated/createAuthoredSession.js";
import {SeededRandomNumberGenerator} from "../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {VideoSlotWithFreeGamesSession} from "../../src/session/videoslot/VideoSlotWithFreeGamesSession.js";
import {VideoSlotSession} from "../../src/session/videoslot/VideoSlotSession.js";
import {SymbolsCombination} from "../../src/session/videoslot/combinations/SymbolsCombination.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
import type {OptimizationRequest, OptimizationResult} from "../../src/optimization/OptimizationPolicy.js";
import {OptimizeCommand} from "../../cli/commands/OptimizeCommand.js";
import {StudioOptimizationService} from "../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import type {StudioJobView} from "../../cli/studio/jobs/StudioJobView.js";
import {SharedSlotMath} from "../../src/wasm/math/SharedSlotMath.js";
import {ForcedSymbolsCombinationsGenerator} from "../../src/weightedoutcome/generate/internal/ForcedSymbolsCombinationsGenerator.js";
import {optimizationBlueprint, optimizationRequest} from "./fixtures/OptimizationFixture.js";
import {weightedBlueprint} from "./fixtures/WeightedWholeSequenceGame.js";
import {GameBlueprintValidator} from "../../src/generated/GameBlueprintValidator.js";
import {setSymbolWeight} from "../../cli/studio-client/src/domain/blueprintFormOps.js";

// Source-aware editor -> authoritative filesystem boundary checks. Real browser
// observations, observer independence and material finding closure are separate.
describe("V2C-35 draft correction and explicit persistence", () => {
    let directory: string;
    let service: StudioBlueprintService;
    let source: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera35-"));
        service = new StudioBlueprintService(POKIE_VERSION, path.join(directory, "studio-assets"),
            new StudioHomeService(POKIE_VERSION, new InMemoryRecentProjectsRepository()));
        source = path.join(directory, "weighted design.blueprint.json");
        expect(service.save(source, weightedBlueprint, false).status).toBe("ok");
    });

    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    it("retains exact -1 diagnostics through shared validation and explicit draft persistence, then saves corrected reuse", () => {
        const model: Record<string, unknown> = optimizationBlueprint();
        Reflect.deleteProperty(model, "reelStrips");
        setSymbolWeight(model, "A", -1);
        const original = fs.readFileSync(source);
        const diagnostics = new GameBlueprintValidator().validate(model);
        expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
            code: "blueprint-symbolweights-invalid-weight", message: '"symbolWeights.A" must be a positive integer.',
        })]));
        expect(service.validate(model)).toMatchObject({status: "invalid", errors: expect.arrayContaining([
            expect.objectContaining({code: "blueprint-symbolweights-invalid-weight"}),
        ])});
        // Advanced Save is lossless draft persistence, not a validity verdict.
        // Required-valid UI actions validate first. Preserve the public draft
        // contract and verify that neither persistence nor reload coerces -1.
        const draftPath = path.join(directory, "invalid weight draft.json");
        expect(service.save(draftPath, model, false).status).toBe("ok");
        expect(JSON.parse(fs.readFileSync(draftPath, "utf8")).symbolWeights).toEqual({A: -1});
        const reloaded = service.load(draftPath);
        expect(reloaded).toMatchObject({status: "ok", blueprint: {symbolWeights: {A: -1}}});
        if (reloaded.status !== "ok") throw new Error(reloaded.error);
        expect(service.validate(reloaded.blueprint)).toMatchObject({status: "invalid", errors: expect.arrayContaining([
            expect.objectContaining({code: "blueprint-symbolweights-invalid-weight"}),
        ])});
        expect(model.symbolWeights).toEqual({A: -1});
        expect(fs.readFileSync(source)).toEqual(original);
        for (const weight of [2, 3]) {
            setSymbolWeight(model, "A", weight);
            expect(service.validate(model).status).toBe("ok");
            expect(service.save(source, model, true).status).toBe("ok");
            expect(service.load(source)).toMatchObject({status: "ok", blueprint: {symbolWeights: {A: weight}}});
        }
    });

    it("retains rejected JSON and weighted drafts until correction, then persists only on explicit Save", () => {
        const original = fs.readFileSync(source);
        const loaded = service.load(source);
        if (loaded.status !== "ok") throw new Error(loaded.error);
        const state = loadBlueprintEditorState(loaded.blueprint);
        const syntaxError = applyJsonText(state, '{"reelSequences":');
        expect(syntaxError.jsonError).toEqual(expect.any(String));
        expect(syntaxError.jsonText).toBe('{"reelSequences":');
        expect(syntaxError.blueprint).toBe(state.blueprint);

        const model: GameBlueprint = JSON.parse(JSON.stringify(weightedBlueprint));
        // Form/JSON accepts an object draft; the save boundary rejects conflicting reel authorities.
        model.reelStrips = [["A"], ["A"]];
        const invalidText = JSON.stringify(model);
        const invalid = applyJsonText(syntaxError, invalidText);
        expect(invalid.jsonError).toBeUndefined();
        expect(service.validate(invalid.blueprint).status).toBe("invalid");
        expect(service.save(source, invalid.blueprint, true, loaded.blueprintHash).status).toBe("error");
        expect(invalid.jsonText).toBe(invalidText);
        expect(fs.readFileSync(source)).toEqual(original);

        Reflect.deleteProperty(model, "reelStrips");
        model.availableBets = [0.05, 7.5, 1e-7];
        const sequence = model.reelSequences![0];
        if (sequence.type !== "weighted") throw new Error("Expected weighted source fixture");
        model.reelSequences = [{...sequence, variants: sequence.variants.map((variant, index) =>
            index === 0 ? {...variant, id: "authored tiny weight", weight: 1e-7} : variant)}, ...model.reelSequences!.slice(1)];
        const corrected = applyJsonText(invalid, JSON.stringify(model));
        expect(service.validate(corrected.blueprint).status).toBe("ok");
        expect(corrected.revision).toBeGreaterThan(invalid.revision);
        expect(fs.readFileSync(source)).toEqual(original);
        expect(service.save(source, corrected.blueprint, true, loaded.blueprintHash).status).toBe("ok");
        expect(service.load(source)).toMatchObject({status: "ok", blueprint: model});
        expect(fs.readdirSync(directory)).toEqual([path.basename(source)]);
    });

    it("retains both external changes and the local draft after stale Save, then permits explicit Save As", () => {
        const loaded = service.load(source);
        if (loaded.status !== "ok") throw new Error(loaded.error);
        const model: GameBlueprint = JSON.parse(JSON.stringify(weightedBlueprint));
        model.manifest.name = "Local pending edits";
        const local = applyJsonText(loadBlueprintEditorState(loaded.blueprint), JSON.stringify(model));
        const localText = local.jsonText;
        const external = {...weightedBlueprint, manifest: {...weightedBlueprint.manifest, name: "Another tab saved"}};
        expect(service.save(source, external, true, loaded.blueprintHash).status).toBe("ok");
        const externalBytes = fs.readFileSync(source);
        expect(service.save(source, local.blueprint, true, loaded.blueprintHash)).toMatchObject({
            status: "conflict", reason: "stale", canSaveAs: true,
            editedBlueprint: model, currentBlueprint: external,
        });
        expect(local.jsonText).toBe(localText);
        expect(fs.readFileSync(source)).toEqual(externalBytes);
        const destination = path.join(directory, "retained local draft.json");
        expect(fs.existsSync(destination)).toBe(false);
        expect(service.save(destination, local.blueprint, false).status).toBe("ok");
        expect(service.load(destination)).toMatchObject({status: "ok", blueprint: model});
        expect(fs.readFileSync(source)).toEqual(externalBytes);
        expect(fs.readdirSync(directory).sort()).toEqual([path.basename(source), path.basename(destination)].sort());
    });
});


describe("V2C-35 exact optimizer Wasm ownership", () => {
    it("bounds executable allocations across detached exact sessions", async () => {
        const WasmInstance = WebAssembly.Instance;
        const instances = jest.spyOn(WebAssembly, "Instance").mockImplementation((module, imports) => new WasmInstance(module, imports));
        const game = createTunableBlueprintGame(optimizationBlueprint());
        try {
            for (let i = 0; i < 40; i++) {
                const session = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["A"], ["A"]]));
                session.play();
                expect(session.getWinAmount()).toBe(2);
            }
            expect(instances.mock.calls.length).toBeLessThanOrEqual(8);
        } finally {
            await game.release!();
            instances.mockRestore();
        }
    });
});


describe("V2C-35 shared scratch authority and recovery", () => {
    it("rejects an injected math factory at the authored-session public boundary before executing it", () => {
        const create = jest.fn(() => {
            throw new Error("Injected factory executed");
        });
        expect(() => createAuthoredSession(optimizationBlueprint(), new SeededRandomNumberGenerator(1), undefined,
            {create} as unknown as SharedSlotMathPool)).toThrow(/sharedMathPool/);
        expect(create).not.toHaveBeenCalled();
    });

    it("keeps absent and authored zero paytable maps enumerable without inventing awards", () => {
        const table = new Paytable<string>([0.05]);
        expect(table.getAvailableSymbolsForBet(7.5)).toEqual([]);
        expect(table.getNumbersOfSymbolsForBet(7.5, "A")).toEqual([]);
        expect(table.getNumbersOfSymbolsForBet(0.05, "A")).toEqual([]);
        table.setPayoutForSymbol("A", 2, 0);
        expect(table.getAvailableSymbolsForBet(0.05)).toEqual(["A"]);
        expect(table.getNumbersOfSymbolsForBet(0.05, "A")).toEqual([2]);
        expect(table.getWinAmountForSymbol("A", 2, 0.05)).toBe(0);
        table.setPayoutForSymbol("A", 2, 2);
        expect(table.getWinAmountForSymbol("A", 2, 0.05)).toBe(0.1);
    });

    it("reuses the same public exact-generation game after preflight rejection and a no-op", async () => {
        const game = createTunableBlueprintGame(optimizationBlueprint());
        const options = {game, libraryId: "reuse", pokieVersion: POKIE_VERSION, exact: true, stake: 1, now: () => new Date(0)};
        try {
            game.createSession({seed: "unused"});
            await expect(generateExactWeightedOutcomeLibrary({...options, maxOutcomeSpaceSize: BigInt(2)})).rejects.toThrow(/exceeds/);
            for (let run = 0; run < 2; run++) {
                const result = await generateExactWeightedOutcomeLibrary({...options, maxOutcomeSpaceSize: BigInt(4)});
                expect(result.diagnostics).toMatchObject({strategy: "exact", totalOutcomeSpaceSize: 4});
                expect(result.library.outcomes.map(outcome => ({weight: outcome.weight, win: outcome.artifact.totalWin}))).toEqual([
                    {weight: 1, win: 2}, {weight: 3, win: 0},
                ]);
            }
        } finally {
            await game.release!();
        }
    });

    it("validates full models, detaches keys, bounds churn and reacquires evicted facades", () => {
        const pool = new SharedSlotMathPool();
        const model = {...resolveSharedSlotMathModel(optimizationBlueprint()), paytable: {A: {2: 2}, B: {2: 0}}};
        const WasmInstance = WebAssembly.Instance;
        const instances = jest.spyOn(WebAssembly, "Instance").mockImplementation((module, imports) => new WasmInstance(module, imports));
        const disposed = jest.spyOn(SharedSlotMath.prototype, "dispose");
        try {
            const first = pool.create(model);
            const sibling = pool.create(model);
            expect(instances.mock.calls.length).toBe(0);
            model.paytable.A = {2: 999};
            const screen = [["A"], ["A"]];
            expect(first.evaluate(screen, 1).payout).toBe(2);
            const allocated = instances.mock.calls.length;
            for (const changed of [
                {...first.model, rows: 0},
                {...first.model, paytable: {A: {2: "2"}}},
                {...first.model, reels: 3, rows: 2, reelStrips: [["A"], ["A"], ["X"]], paylines: [[0, 0, 0]]},
            ]) {
                expect(() => pool.create(changed as unknown as typeof model)).toThrow(/Unsupported shared WASM math model/);
            }
            expect(instances.mock.calls.length).toBe(allocated);
            expect(() => first.evaluate([["X"], ["A"]], 1)).toThrow(/Shared math requires/);
            expect(() => first.evaluate(screen, 3)).toThrow(/Shared math requires/);
            expect(first.evaluate(screen, 1).payout).toBe(2);
            for (let payout = 3; payout < 15; payout++) {
                const other = pool.create({...first.model, paytable: {A: {2: payout}}});
                expect(other.evaluate(screen, 1).payout).toBe(payout);
                other.dispose();
                expect(instances.mock.calls.length - disposed.mock.calls.length).toBeLessThanOrEqual(8);
            }
            expect(first.evaluate(screen, 1).payout).toBe(2);
            first.dispose();
            expect(() => first.evaluate(screen, 1)).toThrow(/disposed/);
            expect(sibling.evaluate(screen, 1).payout).toBe(2);
            pool.dispose();
            expect(instances.mock.calls.length).toBe(disposed.mock.calls.length);
            expect(() => sibling.evaluate(screen, 1)).toThrow(/disposed/);
            expect(() => pool.create(model)).toThrow(/disposed/);
        } finally {
            pool.dispose();
            disposed.mockRestore();
            instances.mockRestore();
        }
    });

    it("keeps siblings' results and paytables separate through rejection and subsequent reuse", async () => {
        const blueprint = optimizationBlueprint();
        const game = createTunableBlueprintGame(blueprint);
        let grid = [["A"], ["A"]];
        const first = game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(grid)});
        const sibling = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["A"], ["A"]]));
        try {
            first.play();
            const result = first.getWinEvaluationResult();
            expect(first.getWinAmount()).toBe(2);
            sibling.getPaytable().setPayoutForSymbol("A", 2, 7);
            sibling.play();
            expect(sibling.getWinAmount()).toBe(7);
            expect(first.getWinAmount()).toBe(2);
            expect(first.getWinEvaluationResult()).toBe(result);
            const credits = first.getCreditsAmount();
            grid = [["unknown"], ["A"]];
            expect(() => first.play()).toThrow();
            expect(first.getCreditsAmount()).toBe(credits);
            expect(sibling.getWinAmount()).toBe(7);
            grid = [["A"], ["A"]];
            first.play();
            expect(first.getWinAmount()).toBe(2);
            first.play();
            expect(first.getWinAmount()).toBe(2);
            expect(first.getCreditsAmount()).toBe(credits + 2);
            await game.release!();
            await game.release!();
            expect(() => first.play()).toThrow(/disposed/);
            expect(() => game.createSession({seed: 1})).toThrow(/disposed/);
        } finally {
            await game.release!();
        }
    });

    it("restores successful snapshots into used and fresh sessions after an executed rejection", async () => {
        const blueprint = optimizationBlueprint();
        const game = createTunableBlueprintGame(blueprint);
        const independent = createAuthoredSession(blueprint, new SeededRandomNumberGenerator("restore-pool"));
        try {
            const used = game.createSession({seed: "restore-pool"});
            const fresh = game.createSession({seed: "restore-pool"});
            if (!(used instanceof VideoSlotSession) || !(fresh instanceof VideoSlotSession)) throw new Error("Expected restorable base sessions");
            if (!(independent.session instanceof VideoSlotSession)) throw new Error("Expected independent base session");
            used.play();
            independent.session.play();
            const snapshot = used.toSessionState();
            const credits = used.getCreditsAmount();
            const available = used.getBet();
            // A selected-bet model that overflows must fail before charging and must
            // neither poison sibling models nor require restoration to reuse scratch.
            used.getPaytable().setPayoutForSymbol("A", 2, Infinity);
            expect(() => used.play()).toThrow(/overflow|finite/i);
            expect(used.getCreditsAmount()).toBe(credits);
            used.getPaytable().setPayoutForSymbol("A", 2, 2);
            used.play();
            used.play();
            for (const session of [used, fresh]) {
                session.fromSessionState(snapshot);
                session.setCreditsAmount(credits);
                session.setBet(available);
                session.play();
            }
            independent.session.play();
            expect(used.toSessionState()).toEqual(fresh.toSessionState());
            expect(used.toSessionState()).toEqual(independent.session.toSessionState());
            expect(used.getWinAmount()).toBe(independent.session.getWinAmount());
            expect(used.getCreditsAmount()).toBe(independent.session.getCreditsAmount());
        } finally {
            independent.dispose();
            await game.release!();
        }
    });

    it("preserves weighted whole-sequence and authored free-game paid-entry sessions", async () => {
        const blueprint: GameBlueprint = {...weightedBlueprint, scatters: ["S"],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {2: 3}}}};
        const game = createTunableBlueprintGame(blueprint);
        try {
            const awarded = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["S"], ["S"]]));
            const other = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([["A"], ["A"]]));
            awarded.play();
            const snapshot = awarded.getWinEvaluationResult();
            other.play();
            expect(other.getWinAmount()).toBe(4);
            expect(awarded.getWinAmount()).toBe(0);
            expect(awarded.getWinEvaluationResult()).toBe(snapshot);
            if (!(awarded instanceof VideoSlotWithFreeGamesSession)) throw new Error("Expected free-game session");
            expect(awarded.getStakeAmount()).toBe(0);
            expect(awarded.getFreeGamesSum()).toBe(3);
            const ordinary = game.createSession({seed: 123});
            ordinary.play();
            expect(Number.isFinite(ordinary.getWinAmount())).toBe(true);
        } finally {
            await game.release!();
        }
    });
});

const retainedRequest = (): OptimizationRequest => ({
    targets: [{metric: "rtp", unit: "ratio", value: 0.95, tolerance: {kind: "absolute", value: 0.001}}],
    policy: {strategy: "exact-finite-v1", seed: "optimization-1", budget: 100, maxOutcomes: 100000,
        mode: "base", stake: 1, scope: "paid-entry", tunables: [{path: "/paytable/A/3", values: [1, 2, 3]}], locks: []},
});

describe("V2C-35 retained exact-finite request through public consumers", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera35-optimizer-"));
    });
    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    it("measures the retained public fixture, explicitly retries a reachable target and durably applies only the reviewed result", async () => {
        const source = path.join(directory, "blueprint.json");
        const fixture = fs.readFileSync(path.resolve("tests/v2/fixtures/Valera35FeralBlazingSafari.blueprint.json"));
        fs.writeFileSync(source, fixture);
        const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
        const service = new StudioOptimizationService(jobs, new ProjectOptimizationService(path.join(directory, "scratch")));
        const context = {projectRoot: source, projectId: source, isCurrent: () => true};
        const request = retainedRequest();
        const support = await service.handle("POST", "support", {expectedProjectRoot: source, request}, context);
        expect(support.body).toMatchObject({supported: true});
        const start = async (input: OptimizationRequest) => {
            const supported = await service.handle("POST", "support", {expectedProjectRoot: source, request: input}, context);
            const response = await service.handle("POST", "start", {expectedProjectRoot: source, request: input,
                sourceRevision: (supported.body as {sourceRevision: string}).sourceRevision}, context);
            expect(response.status).toBe(202);
            const {job} = response.body as {job: StudioJobView};
            await service.drain();
            return jobs.get(source, job.id)!;
        };
        try {
            // Use the real retained workload and the real host clock: an HTTP
            // handler, like this timer, must run DURING a candidate's artifact
            // execution rather than after its first full evaluation.
            const evaluate = SharedSlotMath.prototype.evaluate;
            let emitted = 0;
            let emittedAtCancellation: number | undefined;
            let observedRecord: StudioJobView | undefined;
            let cancellationStatus: StudioJobView["status"] | undefined;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const evaluating = jest.spyOn(SharedSlotMath.prototype, "evaluate").mockImplementation(function (this: SharedSlotMath, ...args) {
                if (++emitted === 1) timer = setTimeout(() => {
                    const active = jobs.list(source).find(job => job.operation === "optimization" && job.status === "running");
                    emittedAtCancellation = emitted;
                    if (active !== undefined) {
                        observedRecord = new FileStudioJobRepository(path.join(directory, "jobs")).get(active.id);
                        cancellationStatus = jobs.cancel(source, active.id)?.status;
                    }
                }, 0);
                return Reflect.apply(evaluate, this, args);
            });
            try {
                const cancelled = await start(request);
                expect(emittedAtCancellation).toBeGreaterThan(0);
                expect(emittedAtCancellation).toBeLessThan(1000);
                expect(observedRecord).toMatchObject({status: "running", operation: "optimization"});
                expect(cancellationStatus).toBe("cancelling");
                expect(cancelled).toMatchObject({status: "cancelled", result: {detail: {status: "cancelled", evidence: {evaluated: 0}}}});
                expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(cancelled.id)?.status).toBe("cancelled");
                expect(fs.readFileSync(source)).toEqual(fixture);
                expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
                console.info(`V2C-35 active observation and accepted cancellation during first candidate: ${emittedAtCancellation} artifacts; durable cancelled terminal and drained scratch.`);
            } finally {
                clearTimeout(timer);
                evaluating.mockRestore();
            }
            const terminal = await start(request);
            expect(terminal).toMatchObject({status: "completed", result: {detail: {status: "infeasible", diagnostics: [], evidence: {evaluated: 3, consumedWork: 3, exhaustive: true}}}});
            console.info("V2C-35 retained request completed: infeasible; all 3 candidates evaluated without OOM.");
            expect(fs.readFileSync(source)).toEqual(fixture);
            const result = terminal.result!.detail as unknown as OptimizationResult;
            const measured = result.evidence!.evaluations![0].measured![0];
            expect(Number.isFinite(measured)).toBe(true);
            const corrected = retainedRequest();
            corrected.targets[0].value = measured;
            corrected.targets[0].tolerance = {kind: "absolute", value: 0};
            const selected = await start(corrected);
            expect(selected).toMatchObject({status: "completed", result: {detail: {status: "success", evidence: {evaluated: 1, measured: [measured], selected: {"/paytable/A/3": 1}}}}});
            console.info("V2C-35 corrected explicit retry completed: success; candidate /paytable/A/3 = 1.");
            expect(fs.readFileSync(source)).toEqual(fixture);
            const body = {expectedProjectRoot: source, request: corrected, jobId: selected.id};
            expect((await service.handle("POST", "apply", {...body, request}, context)).status).toBe(409);
            expect(fs.readFileSync(source)).toEqual(fixture);
            expect((await service.handle("POST", "apply", body, context)).status).toBe(200);
            expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[3]).toBe(1);
            expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(selected.id)!.result).toMatchObject({provenance: {authoredApply: {path: source}}});
            expect((await service.handle("POST", "apply", body, context)).status).toBe(409);
            console.info("V2C-35 reviewed Apply persisted /paytable/A/3 = 1 and its durable marker; repeat Apply rejected.");
        } finally {
            await service.shutdown();
        }
        expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        console.info("V2C-35 shutdown released the retained candidate workspace.");
    }, 1200000);

    it("keeps CLI exact results, cancellation and a corrected explicit retry reusable", async () => {
        const source = path.join(directory, "source.blueprint.json");
        const policy = path.join(directory, "policy.json");
        const model = optimizationBlueprint();
        fs.writeFileSync(source, JSON.stringify(model));
        const optimizer = new ProjectOptimizationService(path.join(directory, "scratch"));
        const controller = new AbortController();
        controller.abort();
        const project = await new ProjectTargetResolver().resolve(source, {readConfigurationProvenance: false});
        if (!project) throw new Error("Expected resolved Blueprint");
        expect((await optimizer.optimize(project, optimizationRequest(), {signal: controller.signal})).status).toBe("cancelled");
        const invalid = optimizationRequest();
        invalid.policy.tunables[0].path = "/unknown";
        expect((await optimizer.optimize(project, invalid)).status).toBe("invalid");
        fs.writeFileSync(policy, JSON.stringify(optimizationRequest()));
        const output = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            expect(await new OptimizeCommand(optimizer).run([source, "--policy", policy])).toBe(0);
            const result = JSON.parse(output.mock.calls[output.mock.calls.length - 1][0] as string);
            expect(result).toMatchObject({status: "success", evidence: {measured: [0.75]}});
            expect(JSON.parse(fs.readFileSync(source, "utf8"))).toEqual(model);
            expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        } finally {
            output.mockRestore();
        }
    });
});

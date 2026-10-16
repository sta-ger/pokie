import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import fs from "node:fs";
import ExcelJS from "exceljs";
import {pathToFileURL} from "node:url";
import {Worker} from "node:worker_threads";
import type {SimulationWorkerMessage} from "../../src/simulation/parallel/internal/SimulationWorkerMessage.js";
import path from "node:path";
import {execFileSync} from "node:child_process";
import * as api from "../../src/index.js";
import {boundedBlueprint} from "./fixtures/BoundedMechanicsGame.js";
import {assertWorkflowRejections, generatedMechanicsGame, mechanicsSession} from "./fixtures/ExistingMechanicsGame.js";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioSimulationService} from "../../cli/studio/simulation/StudioSimulationService.js";
import {StudioPlayService} from "../../cli/studio/runtime/StudioPlayService.js";
import {StudioReplayExecutionService} from "../../cli/studio/replay/StudioReplayExecutionService.js";
import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";
import {runChunkedSimulation} from "../../src/simulation/parallel/internal/runChunkedSimulation.js";
import {ControllableDurableWallet} from "../server/wallet/fixtures/ControllableDurableWallet.js";
import {setTransactionBoundaryHook} from "../../src/server/storage/internal/transactionBoundary.js";

function constant(id: Parameters<typeof boundedBlueprint>[0] = "collection") {
    const blueprint = boundedBlueprint(id);
    blueprint.reelStrips = [["C"], ["C"], ["C"]];
    return blueprint;
}
function boundedSession(game: api.PokieGame, seed = 31) {
    return mechanicsSession(game, seed) as api.BoundedVideoSlotSession;
}
function played(result: api.SessionCommandResult) {
    if (result.status !== "played") throw new Error(JSON.stringify(result));
    return result;
}

describe("V2C-14 authored bounded mechanics", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c14-"));
    });
    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    it.each(api.AUTHORED_BOUNDED_MECHANIC_CATALOG)("%s exact terminal budget and collection awards", id => {
        const session = boundedSession(generatedMechanicsGame(constant(id)));
        const runtime = new api.SessionRuntime(session);
        const command: api.SessionCommand = {kind: "spin", roundId: "exact", delivery: "composite"};
        const result = played(runtime.execute(command));
        const respins = id.includes("respins"),
            collection = id.includes("collection");
        expect(result.logicalRound).toMatchObject({status: "completed", cursor: respins ? 9 : 1, totalStake: 0.05, totalWin: respins && collection ? 60 : 0});
        if (respins) expect(session.getBoundedMechanicObservation()!.respins).toEqual({remaining: 0, executed: 8, granted: 0, limit: 8});
        if (id.includes("cascade")) expect(session.getBoundedMechanicObservation()!.cascade).toEqual({winningCascades: 0, evaluatedSteps: 1});
        if (collection) expect(session.getBoundedMechanicObservation()!.collection).toMatchObject({value: respins ? 0 : 3, payout: respins ? 10 : 0, cap: 5, threshold: 4, reset: "subtract-threshold"});
        const before = session.toSessionState();
        expect(runtime.execute(command)).toEqual(result);
        expect(session.toSessionState()).toEqual(before);
        if (collection && !respins) {
            session.play();
            expect(session.getWinAmount()).toBe(10);
            expect(session.getBoundedMechanicObservation()!.collection).toMatchObject({value: 1, payout: 10});
        }
    });

    it.each(api.AUTHORED_BOUNDED_MECHANIC_CATALOG)("%s: catalogue surface rejection boundaries", async row => {
        await assertWorkflowRejections(boundedBlueprint(row), directory);
    });

    it.each(api.AUTHORED_BOUNDED_MECHANIC_CATALOG)("%s CJS/TypeScript identity, initial serialization, stepwise/composite equivalence, next RNG and audit", id => {
        const blueprint = boundedBlueprint(id);
        const game = generatedMechanicsGame(blueprint);
        const typed = generatedMechanicsGame(blueprint, true);
        expect(typed.getConfigHash!()).toBe(game.getConfigHash!());
        expect(typed.getSessionStateSchema!()).toEqual(game.getSessionStateSchema!());
        const composite = boundedSession(game),
            stepwise = boundedSession(typed);
        const before = composite.toSessionState();
        expect(game.getSessionSerializer!().getInitialData(composite)).toMatchObject({totalWin: 0});
        expect(composite.toSessionState()).toEqual(before);
        expect(api.isSessionStateRestorable(composite)).toBe(true);
        const command: api.SessionCommand = {kind: "spin", roundId: "round", delivery: "composite"};
        const first = played(new api.SessionRuntime(composite).execute(command));
        const runtime = new api.SessionRuntime(stepwise);
        let next = played(runtime.execute({...command, delivery: "stepwise"}));
        const restored = boundedSession(typed, 91);
        restored.fromSessionState(JSON.parse(JSON.stringify(stepwise.toSessionState())));
        restored.setCreditsAmount(stepwise.getCreditsAmount());
        const resumed = new api.SessionRuntime(restored, next.logicalRound);
        let deliveries = 1;
        while (next.logicalRound!.status === "pending") {
            const state = stepwise.toSessionState();
            const continuation: api.SessionCommand = {kind: "spin", delivery: "stepwise", continuation: {roundId: "round", cursor: next.logicalRound!.deliveryCursor}};
            next = played(runtime.execute(continuation));
            expect(played(resumed.execute(continuation))).toEqual(next);
            expect(restored.toSessionState()).toEqual(stepwise.toSessionState());
            if (next.logicalRound!.cursor === 1) expect(stepwise.toSessionState()).toEqual(state);
            expect(++deliveries).toBeLessThan(1000);
        }
        expect(first.logicalRound!.status).toBe("completed");
        expect(next.logicalRound!.subrounds.map(({command: _command, ...value}) => value)).toEqual(first.logicalRound!.subrounds.map(({command: _command, ...value}) => value));
        expect(stepwise.toSessionState()).toEqual(composite.toSessionState());
        expect(stepwise.getCreditsAmount()).toBe(composite.getCreditsAmount());
        expect(stepwise.getBoundedMechanicObservation()).toEqual(composite.getBoundedMechanicObservation());
        for (const session of [stepwise, composite, restored]) session.play();
        expect(restored.toSessionState()).toEqual(composite.toSessionState());
        expect(stepwise.toSessionState()).toEqual(composite.toSessionState());
        const auditSession = boundedSession(game);
        for (const delivery of ["stepwise", "composite"] as const) {
            const descriptor = new api.ReplayRecorder().recordAudit(game, auditSession, [{kind: "spin", roundId: delivery, delivery}], {status: "calculated", sessionId: "audit", durability: "detached"}, {seed: 31});
            expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(descriptor.audit))).verification).toBe("verified");
            expect(new api.PublicRoundArtifactProjector().project(descriptor.artifact!).featureEvents).toEqual(descriptor.artifact!.featureEvents);
            if (auditSession.hasPendingLogicalRound()) break;
        }
    });

    it("exact collection cap, crossing, carry, reset, repeated awards, different denominations and isolation", () => {
        const blueprint = constant();
        blueprint.paytable = {C: {3: 2}, A: {3: 0}};
        const game = generatedMechanicsGame(blueprint),
            session = boundedSession(game);
        const isolated = boundedSession(game);
        session.play();
        expect(session.getBoundedMechanicObservation()!.collection).toEqual({value: 3, cap: 5, threshold: 4, contribution: 3, triggered: false, reset: "subtract-threshold", payout: 0});
        expect(session.getWinAmount()).toBe(0.1);
        session.setBet(7.5);
        const restored = boundedSession(game);
        restored.fromSessionState(JSON.parse(JSON.stringify(session.toSessionState())));
        restored.setBet(7.5);
        for (const candidate of [session, restored]) candidate.play();
        expect(session.getWinAmount()).toBe(25);
        expect(session.getBoundedMechanicObservation()!.collection).toMatchObject({value: 1, triggered: true, payout: 10});
        expect(restored.toSessionState()).toEqual(session.toSessionState());
        session.play();
        expect(session.getBoundedMechanicObservation()!.collection).toMatchObject({value: 0, triggered: true});
        expect(isolated.toSessionState().value).toBe(0);
        const zero = constant();
        zero.mechanics!.collection = {...zero.mechanics!.collection!, contribution: 0, payout: 0, reset: "zero"};
        const zeroSession = boundedSession(generatedMechanicsGame(zero));
        zeroSession.play();
        expect(zeroSession.getWinAmount()).toBe(0);
        expect(zeroSession.toSessionState().value).toBe(0);
        zero.mechanics!.collection!.contribution = 2;
        const reset = boundedSession(generatedMechanicsGame(zero));
        reset.play();
        expect(reset.getBoundedMechanicObservation()!.collection).toMatchObject({value: 0, triggered: true, payout: 0});
    });

    it.each([0.05, 7.5, 1e-7])("exact bounded retriggered respins settle each win once at %s", bet => {
        const blueprint = constant("respins-collection");
        blueprint.paytable = {C: {3: 2}};
        const session = boundedSession(generatedMechanicsGame(blueprint));
        session.setBet(bet);
        const runtime = new api.SessionRuntime(session);
        const result = played(runtime.execute({kind: "spin", roundId: "finite", delivery: "composite"}));
        expect(result.logicalRound).toMatchObject({status: "completed", cursor: 9, totalStake: bet});
        expect(result.logicalRound!.totalWin).toBeCloseTo(9 * (bet * 2) + 60, 12);
        expect(result.logicalRound!.subrounds.map(s => s.stake)).toEqual([bet, ...Array(8).fill(0)]);
        expect(session.getCreditsAmount()).toBeCloseTo(10000 - bet + result.logicalRound!.totalWin, 8);
        expect(session.getBoundedMechanicObservation()!.respins).toEqual({remaining: 0, executed: 8, granted: 0, limit: 8});
        const state = session.toSessionState();
        expect(runtime.execute({kind: "spin", roundId: "finite", delivery: "composite"})).toEqual(result);
        expect(session.toSessionState()).toEqual(state);
    });

    it("exact two cascades, terminal evaluation at the bound, unique overlapping removals and overflow", () => {
        const config = new api.VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableBets([0.05]);
        config.setWildSymbols([]);
        config.setScatterSymbols([]);
        config.setAvailableSymbols(["A", "B"]);
        config.setLinesDefinitions(new api.CustomLinesDefinitions().fromMap({first: [0, 0, 0], overlap: [0, 0, 0]}));
        const paytable = new api.Paytable<string>([0.05]);
        paytable.setPayoutForSymbol("A", 3, 2);
        config.setPaytable(paytable);
        const pipeline = new api.VideoSlotWinCalculator(config).getWinEvaluationPipeline();
        const refills: number[][][] = [];
        const resolver = new api.CascadingSpinResolver(pipeline, config, {getRefillSymbols: (_screen, positions, index) => {
            refills.push(positions);
            return [[index === 0 ? "A" : "B"], [index === 0 ? "A" : "B"], [index === 0 ? "A" : "B"]];
        }}, undefined, {maxCascadeSteps: 2});
        const result = resolver.resolve([["A"], ["A"], ["A"]], 0.05);
        expect(result.getCascadeSteps()).toHaveLength(2);
        expect(result.getTotalCascadeWin()).toBe(0.4);
        expect(result.getTerminalEvaluation()!.getTotalWin()).toBe(0);
        expect(refills).toEqual([[[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [2, 0]]]);
        expect(() => new api.CascadingSpinResolver(pipeline, config, {getRefillSymbols: () => [["A"], ["A"], ["A"]]}, undefined, {maxCascadeSteps: 2}).resolve([["A"], ["A"], ["A"]], 0.05)).toThrow(api.MaxCascadeStepsExceededError);
    });

    it("authored terminal-at-bound cascades complete and replay while exhausted entries roll back and retry", () => {
        const blueprint = boundedBlueprint("cascade");
        blueprint.mechanics!.cascade!.maxCascades = 2;
        blueprint.reelStrips = [["A", "B"], ["A", "B"], ["A", "B"]];
        const game = generatedMechanicsGame(blueprint);
        let seed = 0;
        for (; seed < 10000; seed++) {
            const probe = boundedSession(game, seed);
            try {
                probe.play();
            } catch (error) {
                if (!(error instanceof api.MaxCascadeStepsExceededError)) throw error;
                continue;
            }
            if (probe.getBoundedMechanicObservation()!.cascade!.winningCascades === 2) break;
        }
        expect(seed).toBeLessThan(10000);
        const session = boundedSession(game, seed),
            runtime = new api.SessionRuntime(session);
        const command: api.SessionCommand = {kind: "spin", roundId: "bound", delivery: "composite"};
        const result = played(runtime.execute(command));
        expect(result.logicalRound).toMatchObject({status: "completed", mathematicalStatus: "completed", totalStake: 0.05, totalWin: 0.2});
        expect(result.logicalRound!.subrounds[0].artifacts).toHaveLength(3);
        expect(session.getCreditsAmount()).toBeCloseTo(10000 - 0.05 + 0.2);
        const state = session.toSessionState();
        expect(runtime.execute(command)).toEqual(result);
        expect(session.toSessionState()).toEqual(state);
        const recorder = new api.ReplayRecorder();
        const recording = recorder.recordAudit(game, boundedSession(game, seed), [command], {status: "calculated", sessionId: "bound", durability: "detached"}, {seed});
        expect(new api.AuditRoundReplay().replay(game, recording.audit!)).toMatchObject({verification: "verified", completion: "completed"});
        const exhaustedBlueprint = constant("cascade");
        exhaustedBlueprint.reelStrips = [["A"], ["A"], ["A"]];
        exhaustedBlueprint.mechanics!.cascade!.maxCascades = 2;
        const exhausted = boundedSession(generatedMechanicsGame(exhaustedBlueprint));
        const before = exhausted.toSessionState(),
            credits = exhausted.getCreditsAmount();
        for (let retry = 0; retry < 2; retry++) {
            expect(() => new api.SessionRuntime(exhausted).execute(command)).toThrow(api.MaxCascadeStepsExceededError);
            expect(exhausted.toSessionState()).toEqual(before);
            expect(exhausted.getCreditsAmount()).toBe(credits);
            expect(exhausted.getBoundedMechanicObservation()).toBeUndefined();
            expect(exhausted.getWinAmount()).toBe(0);
        }
    });

    it("logical samples survive runner chunks, snapshots and merge; unfinished/restored tails are explicit", async () => {
        const blueprint = constant("respins");
        blueprint.paytable = {C: {3: 2}};
        const game = generatedMechanicsGame(blueprint);
        const uninterrupted = new api.AggregateSimulationRunner(boundedSession(game), 18).run();
        const chunked = await runChunkedSimulation(boundedSession(game), 18, 2);
        expect(chunked.accumulator.getStatistics().logicalRoundMetrics).toEqual(uninterrupted.getStatistics().logicalRoundMetrics);
        expect(chunked.accumulator.getStatistics().totalPayout).toBeCloseTo(uninterrupted.getStatistics().totalPayout, 12);
        const statistics = api.SimulationAccumulator.fromSnapshot(uninterrupted.toSnapshot()).getStatistics();
        expect(statistics.logicalRoundMetrics).toMatchObject({rounds: 2, hitCount: 2, maxWinFrequency: 1, maxWin: 0.8999999999999999});
        const report = new api.SimulationReportBuilder().build({manifest: blueprint.manifest, requestedRounds: 18, statistics, durationMs: 1});
        expect(report).toMatchObject({rounds: 2, hitFrequency: 1, sampling: {acceptedSubrounds: 18, excludedSubrounds: 0}});
        expect(new api.MarkdownSimulationReportRenderer().render(report)).toContain("accepted subrounds: 18");
        expect(new api.HtmlSimulationReportRenderer().render(report)).toContain("accepted subrounds: 18");
        const session = boundedSession(game);
        const prefix = new api.AggregateSimulationRunner(session, 1).run();
        expect(prefix.getStatistics().logicalRoundMetrics!.rounds).toBe(0);
        const restored = boundedSession(game);
        restored.fromSessionState(session.toSessionState());
        const tail = new api.AggregateSimulationRunner(restored, 8).run().getStatistics();
        const tailReport = new api.SimulationReportBuilder().build({manifest: blueprint.manifest, requestedRounds: 8, statistics: tail, durationMs: 1});
        expect(tailReport).toMatchObject({rounds: 0, totalBet: 0, sampling: {acceptedSubrounds: 8, excludedSubrounds: 8}});
    });

    it.each(["respins", "collection"] as const)("rejects malformed %s numeric JSON at generation and direct construction without consuming state", mechanic => {
        const blueprint = constant(mechanic);
        const validRules = JSON.parse(JSON.stringify(blueprint.mechanics));
        const field = mechanic === "respins" ? "maxRespins" : "threshold";
        const expectedPath = `mechanics.${mechanic}.${field}`;
        const config = new api.VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableSymbols(blueprint.symbols);
        const generator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31));
        const session = new api.BoundedVideoSlotSession(config, generator, validRules);
        const before = session.toSessionState();
        const controlGenerator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31));
        const control = new api.BoundedVideoSlotSession(config, controlGenerator, validRules);
        expect(control.toSessionState()).toEqual(before);
        (blueprint.mechanics![mechanic] as unknown as Record<string, unknown>)[field] = {toString: null, valueOf: null};
        expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(expectedPath);
        expect(() => api.renderBuiltGameModuleSource(blueprint, "1.3.0")).toThrow(expectedPath);
        expect(() => new api.BoundedVideoSlotSession(config, generator, blueprint.mechanics!)).toThrow(expectedPath);
        expect(session.toSessionState()).toEqual(before);
        for (let repeat = 0; repeat < 2; repeat++) {
            const reused = new api.BoundedVideoSlotSession(config, generator, validRules);
            // Successful construction draws an initial screen; compare against uninterrupted use.
            const expected = new api.BoundedVideoSlotSession(config, controlGenerator, validRules);
            expect(reused.toSessionState()).toEqual(expected.toSessionState());
            blueprint.mechanics = validRules;
            expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).not.toThrow();
            expect(() => api.renderBuiltGameModuleSource(blueprint, "1.3.0")).not.toThrow();
        }
    });

    it.each(["respins", "collection"] as const)("rejects non-string %s policies consistently at every authored boundary", async mechanic => {
        const field = mechanic === "respins" ? "retrigger" : "reset";
        const expectedPath = `mechanics.${mechanic}.${field}`;
        let policyIndex = 0;
        for (const policy of [[mechanic === "respins" ? "reset" : "zero"], {value: "reset"}, [], {}, null, 0, true, "unknown"]) {
            const blueprint = constant(mechanic);
            (blueprint.mechanics![mechanic] as unknown as Record<string, unknown>)[field] = policy;
            const errors = new api.GameBlueprintValidator().validate(blueprint).filter(issue => issue.path === expectedPath);
            expect(errors).toEqual([expect.objectContaining({path: expectedPath, severity: "error", code: "blueprint-mechanics-invalid"})]);
            expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(expectedPath);
            expect(() => api.renderBuiltGameModuleSource(blueprint, "1.3.0")).toThrow(expectedPath);
            const config = new api.VideoSlotConfig();
            config.setReelsNumber(3);
            config.setReelsSymbolsNumber(1);
            config.setAvailableSymbols(blueprint.symbols);
            expect(() => new api.BoundedVideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31)), blueprint.mechanics!)).toThrow(expectedPath);
            // Inject malformed JSON into an otherwise real, valid XLSX interchange artifact.
            const filename = path.join(directory, `invalid-policy-${policyIndex++}.xlsx`);
            await new api.ParSheetExporter("1.3.0").exportToFile(constant(mechanic), filename);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filename);
            workbook.getWorksheet("Mechanics")!.getCell("B2").value = JSON.stringify(blueprint.mechanics![mechanic]);
            await workbook.xlsx.writeFile(filename);
            const imported = await new api.ParSheetImporter().importFromFile(filename);
            expect(imported.issues).toEqual(expect.arrayContaining([expect.objectContaining({path: expectedPath, severity: "error"})]));
        }
    });

    it.each(["none", "reset"] as const)("restores only reachable %s respin progress before nested mutation or durable effects", async retrigger => {
        const blueprint = constant("respins");
        blueprint.mechanics!.respins!.retrigger = retrigger;
        const game = generatedMechanicsGame(blueprint),
            session = boundedSession(game);
        const initial = api.captureInitialPokieSessionState({seed: 31}, session, game.getSessionSerializer!(), true, game);
        const before = session.toSessionState(),
            credits = session.getCreditsAmount();
        const repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(10000);
        const debit = jest.spyOn(wallet, "debit"),
            credit = jest.spyOn(wallet, "credit");
        const invalid = [{remaining: 1, executed: 0}, {remaining: 0, executed: 1},
            ...(retrigger === "none" ? [{remaining: 2, executed: 6}, {remaining: 0, executed: 8}] : [])];
        for (const counters of invalid) {
            const featureState = {...before, ...counters, entryBet: 0.05};
            expect(() => session.fromSessionState(featureState)).toThrow(/bounded/);
            expect(session.toSessionState()).toEqual(before);
            expect(session.getCreditsAmount()).toBe(credits);
            const saved = {...initial, featureState};
            await repository.save("s", saved);
            expect(await new api.SpinCommandHandler(game, repository, wallet).execute({kind: "spin", sessionId: "s", requestId: "invalid"})).toMatchObject({status: "corrupt-state"});
            expect(await repository.load("s")).toEqual(saved);
            expect(await wallet.getBalance("s")).toBe(10000);
        }
        expect(debit).not.toHaveBeenCalled();
        expect(credit).not.toHaveBeenCalled();
        // Initial, granted entry, every continuation and completed state all round-trip.
        for (let n = 0; n <= (retrigger === "none" ? 3 : 9); n++) {
            const restored = boundedSession(game);
            restored.fromSessionState(session.toSessionState());
            restored.setCreditsAmount(session.getCreditsAmount());
            expect(restored.toSessionState()).toEqual(session.toSessionState());
            restored.play();
            session.play();
            expect(restored.toSessionState()).toEqual(session.toSessionState());
            expect(restored.getCreditsAmount()).toBe(session.getCreditsAmount());
        }
    });

    it("separates a carried prefix and unfinished tail across snapshots, chunk merges and cancellation", async () => {
        const blueprint = constant("respins"),
            game = generatedMechanicsGame(blueprint),
            session = boundedSession(game);
        const prefix = new api.AggregateSimulationRunner(session, 1).run();
        const middle = await runChunkedSimulation(session, 9, 2);
        const statistics = api.SimulationAccumulator.fromSnapshot(JSON.parse(JSON.stringify(middle.accumulator.toSnapshot()))).getStatistics();
        expect(statistics.logicalSampling).toEqual({carriedSubrounds: 1, excludedSubrounds: 1});
        const report = new api.SimulationReportBuilder().build({manifest: blueprint.manifest, requestedRounds: 9, statistics, durationMs: 1});
        expect(report).toMatchObject({rounds: 1, sampling: {acceptedSubrounds: 9, carriedSubrounds: 1, excludedSubrounds: 1}});
        for (const rendered of [new api.MarkdownSimulationReportRenderer().render(report), new api.HtmlSimulationReportRenderer().render(report)]) {
            expect(rendered).toContain("carried subrounds: 1");
            expect(rendered).toContain("excluded unfinished/restored subrounds: 1");
        }
        prefix.merge(api.SimulationAccumulator.fromSnapshot(middle.accumulator.toSnapshot()));
        expect(prefix.getStatistics().logicalSampling).toEqual({carriedSubrounds: 0, excludedSubrounds: 1});
        prefix.merge(new api.AggregateSimulationRunner(session, 8).run());
        expect(prefix.getStatistics()).toMatchObject({rounds: 18, logicalRoundMetrics: {rounds: 2}, logicalSampling: {carriedSubrounds: 0, excludedSubrounds: 0}});
        const cancelledSession = boundedSession(game);
        new api.AggregateSimulationRunner(cancelledSession, 1).run();
        let stop = false;
        await expect(runChunkedSimulation(cancelledSession, 100, 9, {shouldStop: () => stop, onChunkComplete: () => {
            stop = true;
        }})).rejects.toMatchObject({observedPrefix: {rounds: 9, logicalSampling: {carriedSubrounds: 1, excludedSubrounds: 1}}});
    });

    it("legacy Simulation and convergence use completed bounded samples while retaining actual money and tails", () => {
        const blueprint = constant("respins");
        blueprint.paytable = {C: {3: 2}};
        const game = generatedMechanicsGame(blueprint),
            session = boundedSession(game),
            config = new api.SimulationConfig();
        config.setNumberOfRounds(10);
        const simulation = new api.Simulation(session, config);
        simulation.run();
        expect(simulation.getCurrentRoundNumber()).toBe(10);
        expect(simulation.getLogicalRoundStatistics()).toMatchObject({rounds: 1, steps: 9, totalStake: 0.05});
        expect(simulation.getPayouts()).toHaveLength(1);
        expect(simulation.getAveragePayout()).toBeCloseTo(0.9);
        expect(simulation.getHitFrequency()).toBe(1);
        expect(simulation.getAverageBet()).toBe(0.05);
        expect(simulation.getTotalBetAmount()).toBe(0.1);
        expect(simulation.getTotalPayoutAmount()).toBeCloseTo(1);
        expect(simulation.getPayoutsStandardDeviation()).toBe(0);
        const checker = new api.SimulationConvergenceChecker({minRounds: 2, rtpTolerance: 0.01, checkIntervalRounds: 1, stableChecks: 1});
        const other = boundedSession(game),
            accumulator = new api.AggregateSimulationRunner(other, 8).run();
        expect(checker.check(accumulator, 8).converged).toBe(false);
        accumulator.merge(new api.AggregateSimulationRunner(other, 9).run());
        expect(accumulator.getStatistics().logicalRoundMetrics!.rounds).toBe(1);
        expect(checker.check(accumulator, 17).converged).toBe(false);
        accumulator.merge(new api.AggregateSimulationRunner(other, 1).run());
        expect(checker.check(accumulator, 18).converged).toBe(true);
        const incomplete = boundedSession(game);
        config.setNumberOfRounds(1);
        const empty = new api.Simulation(incomplete, config);
        empty.run();
        expect(empty.getPayouts()).toEqual([]);
        expect(empty.getAveragePayout()).toBe(0);
        expect(empty.getHitFrequency()).toBe(0);
        expect(empty.getPayoutsStandardDeviation()).toBe(0);
    });

    it("invalid schemas and tampered progress reject before nested mutation", () => {
        for (const patch of [{cascade: {maxCascades: 0}}, {respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 1, retrigger: "reset", maxRespins: Infinity}}, {collection: {symbolId: "missing", contribution: 1, threshold: 0, cap: 1, reset: "none", payout: -1}}]) {
            const blueprint = {...boundedBlueprint(), mechanics: patch} as api.GameBlueprint;
            expect(new api.GameBlueprintValidator().validate(blueprint).some(i => i.severity === "error")).toBe(true);
            expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow();
        }
        const session = boundedSession(generatedMechanicsGame(constant("respins-collection")));
        session.play();
        const before = session.toSessionState();
        for (const patch of [{value: -1}, {value: 6}, {value: undefined}, {remaining: 9}, {executed: Number.MAX_SAFE_INTEGER}, {entryBet: 0}, {base: {...before.base as object, rngState: -1}}]) {
            expect(() => session.fromSessionState({...before, ...patch} as api.BoundedSessionState)).toThrow();
            expect(session.toSessionState()).toEqual(before);
        }
        const runtime = new api.SessionRuntime(session);
        expect(runtime.execute({kind: "spin", bet: 7.5}).status).toBe("blocked");
        expect(session.toSessionState()).toEqual(before);
    });

    it.each(["atomic", "external"] as const)("%s storage preserves collection and exact duplicate results after reopen", async composition => {
        const game = generatedMechanicsGame(constant("respins-collection"));
        const context = {seed: 31},
            session = boundedSession(game);
        const filename = path.join(directory, "state.sqlite");
        const provider = composition === "external" ? await ControllableDurableWallet.open(path.join(directory, "wallet.sqlite")) : undefined;
        if (provider) await provider.setBalance("s", 10000);
        const open = () => provider ? api.SqliteExternalRoundStore.open(filename, provider) : api.SqliteTransactionalRoundStore.open(filename);
        let store = await open();
        try {
            await store.initialize("s", api.captureInitialPokieSessionState(context, session, game.getSessionSerializer!(), true, game), game);
            const entry: api.RepositoryCommand = {kind: "spin", sessionId: "s", requestId: "entry", roundId: "round", delivery: "stepwise", bet: 0.05};
            const first = await new api.SpinCommandHandler(game, store).execute(entry);
            expect(first.status).toBe("played");
            const snapshot = await store.readSession("s");
            expect(snapshot!.state.featureState).toMatchObject({value: 3, remaining: 2});
            await store.close();
            store = await open();
            expect(await new api.SpinCommandHandler(game, store).execute(entry)).toEqual(first);
            const next: api.RepositoryCommand = {kind: "spin", sessionId: "s", requestId: "next", delivery: "stepwise", continuation: {roundId: "round", cursor: 1}};
            const advanced = await new api.SpinCommandHandler(game, store).execute(next);
            expect(advanced).toMatchObject({status: "played", stake: 0, win: 10});
            expect((await store.readSession("s"))!.state.featureState).toMatchObject({value: 1, remaining: 2, executed: 1});
            expect(await new api.SpinCommandHandler(game, store).execute(next)).toEqual(advanced);
            expect(await new api.SpinCommandHandler(game, store).execute(entry)).toEqual(first);
        } finally {
            await store.close();
            provider?.close();
        }
    });

    it("failed persistence after accumulation/reset rolls back and retry settles exactly once", async () => {
        const game = generatedMechanicsGame(constant("collection")),
            session = boundedSession(game);
        const store = await api.SqliteTransactionalRoundStore.open(path.join(directory, "failure.sqlite"));
        try {
            await store.initialize("s", api.captureInitialPokieSessionState({seed: 31}, session, game.getSessionSerializer!(), true, game), game);
            await new api.SpinCommandHandler(game, store).execute({kind: "spin", sessionId: "s", requestId: "one"});
            const before = await store.readSession("s");
            setTransactionBoundaryHook(store, boundary => boundary === "before:state" ? Promise.reject(new Error("injected persistence failure")) : Promise.resolve());
            const command: api.RepositoryCommand = {kind: "spin", sessionId: "s", requestId: "two"};
            try {
                expect((await new api.SpinCommandHandler(game, store).execute(command)).status).not.toBe("played");
            } finally {
                setTransactionBoundaryHook(store, () => Promise.resolve());
            }
            expect(await store.readSession("s")).toEqual(before);
            const retried = await new api.SpinCommandHandler(game, store).execute(command);
            expect(retried).toMatchObject({status: "played", win: 10});
            expect(await new api.SpinCommandHandler(game, store).execute(command)).toEqual(retried);
        } finally {
            await store.close();
        }
    });
    it.each(api.AUTHORED_BOUNDED_MECHANIC_CATALOG)("%s real CLI/Studio authoring, XLSX, extraction, play, report/download and replay services", async id => {
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const blueprint = boundedBlueprint(id),
            source = path.join(directory, "source.json");
        expect(JSON.parse(fs.readFileSync(path.join(process.cwd(), `examples/blueprints/bounded-${id}.blueprint.json`), "utf8"))).toEqual(blueprint);
        fs.writeFileSync(source, JSON.stringify(blueprint));
        const original = fs.readFileSync(source, "utf8");
        try {
            const validationCode = await new ValidateCommand().run([source, "--format", "json"]);
            const validation = JSON.parse(jest.mocked(console.log).mock.calls.slice(-1)[0][0] as string);
            expect(validation).toMatchObject({valid: true, errors: [], advanced: {structuralValid: true}});
            expect(validationCode).toBe(id.includes("cascade") ? 1 : 2);
            expect(validation.advanced.verdict).toBe(id.includes("cascade") ? "violated" : "inconclusive");
            if (id.includes("cascade")) expect(validation.advanced.checks).toContainEqual(expect.objectContaining({id: "invariants.runtime-transition", status: "violation", message: expect.stringContaining("Maximum cascade steps exceeded")}));
            const destination = path.join(directory, "cli-package");
            fs.mkdirSync(destination);
            expect(await new BuildCommand("1.3.0").run([source, "--target", "tsPackage", "--out", destination])).toBe(0);
            const studio = new StudioBlueprintService("1.3.0", path.join(directory, "studio"), new StudioHomeService("1.3.0"));
            expect(studio.validate(blueprint).status).toBe("ok");
            expect((await studio.build(blueprint, path.join(directory, "studio-package"), source)).status).toBe("ok");
            expect(fs.readFileSync(source, "utf8")).toBe(original);
            const saved = path.join(directory, "saved.json");
            expect(studio.save(saved, blueprint, false).status).toBe("ok");
            expect(studio.load(saved)).toMatchObject({status: "ok", blueprint: {mechanics: blueprint.mechanics}});
            const workbook = path.join(directory, "rules.xlsx"),
                importedFile = path.join(directory, "imported.json");
            expect(await new ParCommand("1.3.0").run(["export", source, "--out", workbook])).toBe(0);
            expect(await new ParCommand("1.3.0").run(["import", workbook, "--out", importedFile, "--format", "json"])).toBe(0);
            const imported = JSON.parse(fs.readFileSync(importedFile, "utf8")) as api.GameBlueprint;
            expect(imported.mechanics).toEqual(blueprint.mechanics);
            expect(api.computeBlueprintHash(imported)).toBe(api.computeBlueprintHash(blueprint));
            const game = generatedMechanicsGame(blueprint);
            const extraction = await new api.PackageBlueprintExtraction().extract(game);
            expect(extraction.status).toBe("complete");
            expect(extraction.blueprint!.mechanics).toEqual(blueprint.mechanics);
            const rebuilt = generatedMechanicsGame(extraction.blueprint!);
            const a = boundedSession(game),
                b = boundedSession(rebuilt),
                c = boundedSession(generatedMechanicsGame(imported));
            for (let n = 0; n < 3; n++) {
                for (const session of [a, b, c]) session.play();
                expect(b.toSessionState()).toEqual(a.toSessionState());
                expect(c.toSessionState()).toEqual(a.toSessionState());
            }
            const reportFile = path.join(directory, "sim.json");
            await new SimCommand(() => Promise.resolve(game)).run([directory, "--rounds", "18", "--seed", "31", "--out", reportFile]);
            const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as api.SimulationReport;
            expect(report.sampling).toMatchObject({unit: "completed-logical-round", acceptedSubrounds: 18});
            for (const format of ["json", "markdown", "html"] as const) expect(buildSimulationReportDownload(report, id, format).body).toMatch(/logical.round/i);
            await new ReportCommand().run([reportFile, "--format", "html", "--out", path.join(directory, "report.html")]);
            expect(fs.readFileSync(path.join(directory, "report.html"), "utf8")).toContain("Logical round sampling");
            const replayFile = path.join(directory, "replay.json");
            const descriptor = new api.ReplayRecorder().recordAudit(game, boundedSession(game), [{kind: "spin", roundId: "audit", delivery: "composite"}], {status: "calculated", sessionId: "original", durability: "detached"}, {seed: 31});
            fs.writeFileSync(replayFile, JSON.stringify(descriptor));
            await new ReplayCommand(() => Promise.resolve(game)).run([directory, "--recording", replayFile, "--out", path.join(directory, "verified.json")]);
            expect(JSON.parse(fs.readFileSync(path.join(directory, "verified.json"), "utf8")).auditStatus).toBe("verified");
            const replay = new StudioReplayExecutionService(undefined, () => Promise.resolve(game));
            try {
                await replay.inspectRecording(directory, descriptor);
                const started = replay.start(directory, {round: descriptor.round, recording: descriptor as NonNullable<Parameters<StudioReplayExecutionService["start"]>[1]["recording"]>});
                if (started.status !== "created") throw new Error(JSON.stringify(started));
                for (let n = 0; n < 1000 && ["queued", "running"].includes(replay.getStatus(directory, started.job.id)!.status); n++) await new Promise<void>(resolve => {
                    setImmediate(resolve);
                });
                expect(replay.getStatus(directory, started.job.id)).toMatchObject({status: "completed"});
                expect(replay.getDownload(directory, started.job.id)).toMatchObject({status: "ok", descriptor: {auditStatus: "verified"}});
            } finally {
                await replay.cancelAll();
            }
            const simulation = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 2);
            try {
                const started = simulation.start(directory, {rounds: 18, workers: 1, seed: "31"});
                if (started.status !== "created") throw new Error(JSON.stringify(started));
                for (let n = 0; n < 1000 && ["queued", "running"].includes(simulation.getStatus(started.job.id)!.status); n++) await new Promise<void>(resolve => {
                    setImmediate(resolve);
                });
                const output = simulation.getReport(directory, started.job.id);
                expect(output).toMatchObject({status: "ok", report: {sampling: {unit: "completed-logical-round", acceptedSubrounds: 18}}});
                expect(simulation.listReports(directory)[0]).toMatchObject({sampling: {unit: "completed-logical-round", acceptedSubrounds: 18}});
                if (output.status !== "ok" || "modes" in output.report) throw new Error("Expected one completed simulation report.");
                expect(output.report.spinsPerSecond).toBe(Math.round(18 / (Math.max(output.report.durationMs, 1) / 1000)));
            } finally {
                await simulation.cancelAll();
            }
            const play = new StudioPlayService(() => Promise.resolve(game));
            try {
                const created = await play.newSession(directory, 31);
                if (created.status !== "ok") throw new Error(JSON.stringify(created));
                const result = await play.spin(created.session.sessionId, undefined, 0.05, undefined, {requestId: "play", roundId: "play", delivery: "composite"});
                expect(result).toMatchObject({status: "ok", session: {logicalRound: {status: "completed"}, boundedMechanics: expect.any(Object), debug: {artifact: {featureEvents: expect.arrayContaining([expect.objectContaining({type: "boundedMechanics"})])}}}});
            } finally {
                await play.reset();
            }
            expect(api.resolveCanonicalWasmGameModel(blueprint).features?.blueprint).toEqual(blueprint);
            expect(game.createExactEnumerationSession).toBeUndefined();
        } finally {
            log.mockRestore();
            error.mockRestore();
        }
    });




    it.each(["cascade", "respins", "collection"] as const)("%s interrupted and completed audit evidence passes CLI and Studio verification", async id => {
        const blueprint = id === "collection" ? constant(id) : boundedBlueprint(id),
            game = generatedMechanicsGame(blueprint);
        let seed = 31;
        if (id !== "collection") {
            for (seed = 0; seed < 1000; seed++) {
                const probe = boundedSession(game, seed);
                probe.play();
                if (probe.hasPendingLogicalRound() || (probe.getBoundedMechanicObservation()!.cascade?.winningCascades ?? 0) > 0) break;
            }
            expect(seed).toBeLessThan(1000);
        }
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            for (const delivery of ["stepwise", "composite"] as const) {
                const session = boundedSession(game, seed);
                // A standalone collection has no interruptible chain: retain its partially filled
                // prior paid round, then audit the threshold crossing from that durable basis.
                if (id === "collection") session.play();
                const descriptor = new api.ReplayRecorder().recordAudit(game, session, [{kind: "spin", roundId: delivery, delivery}], {status: "calculated", sessionId: "prefix", durability: "detached"}, {seed});
                const completion = id !== "collection" && delivery === "stepwise" ? "pending" : "completed";
                expect(descriptor.auditCompletion).toBe(completion);
                if (id === "collection") expect(descriptor.totalWin).toBe(10);
                const recording = path.join(directory, `${delivery}.json`),
                    verified = path.join(directory, `${delivery}-verified.json`);
                fs.writeFileSync(recording, JSON.stringify(descriptor));
                await new ReplayCommand(() => Promise.resolve(game)).run([directory, "--recording", recording, "--out", verified]);
                expect(JSON.parse(fs.readFileSync(verified, "utf8"))).toMatchObject({auditStatus: "verified", auditCompletion: completion});
                const replay = new StudioReplayExecutionService(undefined, () => Promise.resolve(game));
                try {
                    await replay.inspectRecording(directory, descriptor);
                    const started = replay.start(directory, {round: descriptor.round, recording: descriptor as NonNullable<Parameters<StudioReplayExecutionService["start"]>[1]["recording"]>});
                    if (started.status !== "created") throw new Error(JSON.stringify(started));
                    for (let n = 0; n < 1000 && ["queued", "running"].includes(replay.getStatus(directory, started.job.id)!.status); n++) await new Promise<void>(resolve => {
                        setImmediate(resolve);
                    });
                    expect(replay.getDownload(directory, started.job.id)).toMatchObject({status: "ok", descriptor: {auditStatus: "verified", auditCompletion: completion}});
                } finally {
                    await replay.cancelAll();
                }
            }
        } finally {
            log.mockRestore();
        }
    });

    it.each(["lines", "ways", "clusters"] as const)("%s direct construction matches generated weighted mechanics and next RNG", type => {
        const blueprint = boundedBlueprint("cascade-respins-collection");
        blueprint.winModel = type === "clusters" ? {type, minimumClusterSize: 3} : {type};
        Reflect.deleteProperty(blueprint, "reelStrips");
        blueprint.reelSequences = Array.from({length: 3}, () => ({type: "weighted", variants: [{id: "abc", symbols: ["A", "B", "C"], weight: 1}, {id: "cba", symbols: ["C", "B", "A"], weight: 3}]}));
        const config = new api.VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableBets(blueprint.availableBets!);
        config.setWildSymbols([]);
        config.setScatterSymbols([]);
        config.setAvailableSymbols(blueprint.symbols);
        config.setSymbolsSequences(blueprint.reelSequences!.map(reel => new api.WeightedSymbolsSequence((reel as Extract<NonNullable<api.GameBlueprint["reelSequences"]>[number], {type: "weighted"}>).variants, blueprint.symbols)));
        const paytable = new api.Paytable<string>(config.getAvailableBets());
        paytable.setPayoutForSymbol("A", 3, 2);
        paytable.setPayoutForSymbol("B", 3, 0);
        config.setPaytable(paytable);
        const calculator = new api.VideoSlotWinCalculator(config, undefined, undefined, type === "clusters" ? new api.ClusterWinCalculator(config, 3) : undefined, undefined, type === "ways" ? new api.WaysWinCalculator(config) : undefined, type === "lines" ? {} : {minimumClusterSize: 3, aggregationPolicy: new api.SelectedEvaluatorGroupWinAggregationPolicy(type === "ways" ? "ways" : "cluster")});
        const direct = new api.BoundedVideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31)), blueprint.mechanics!, calculator);
        direct.setCreditsAmount(10000);
        direct.setBet(0.05);
        const game = generatedMechanicsGame(blueprint),
            generated = boundedSession(game);
        for (let n = 0; n < 5; n++) {
            const command: api.SessionCommand = {kind: "spin", roundId: `weighted-${n}`, delivery: "composite"};
            const first = played(new api.SessionRuntime(direct).execute(command)),
                second = played(new api.SessionRuntime(generated).execute(command));
            expect(first.logicalRound).toEqual(second.logicalRound);
            expect(direct.toSessionState()).toEqual(generated.toSessionState());
            const restored = boundedSession(game);
            restored.fromSessionState(direct.toSessionState());
            restored.setCreditsAmount(direct.getCreditsAmount());
            const reference = boundedSession(game);
            reference.fromSessionState(generated.toSessionState());
            reference.setCreditsAmount(generated.getCreditsAmount());
            restored.play();
            reference.play();
            expect(restored.toSessionState()).toEqual(reference.toSessionState());
            expect(restored.getSymbolsCombination().toMatrix()).toEqual(reference.getSymbolsCombination().toMatrix());
        }
    });


    it("plain play() holds weighted selections through respins and matches runtime mathematics", () => {
        const blueprint = boundedBlueprint("cascade-respins-collection");
        Reflect.deleteProperty(blueprint, "reelStrips");
        blueprint.reelSequences = Array.from({length: 3}, () => ({type: "weighted", variants: [{id: "abc", symbols: ["A", "B", "C"], weight: 1}, {id: "cba", symbols: ["C", "B", "A"], weight: 3}]}));
        const game = generatedMechanicsGame(blueprint),
            plain = boundedSession(game),
            composite = boundedSession(game);
        for (let n = 0; n < 5; n++) {
            const result = played(new api.SessionRuntime(composite).execute({kind: "spin", roundId: `plain-${n}`, delivery: "composite"}));
            for (const subround of result.logicalRound!.subrounds) {
                expect(plain.getStakeAmount()).toBe(subround.stake);
                plain.play();
                expect(plain.getSymbolsCombination().toMatrix()).toEqual(subround.screen);
                expect(plain.getWinAmount()).toBe(subround.win);
            }
            expect(plain.hasPendingLogicalRound()).toBe(false);
            expect(plain.getCreditsAmount()).toBe(composite.getCreditsAmount());
            expect(plain.toSessionState().value).toBe(composite.toSessionState().value);
            expect((plain.toSessionState().base as {rngState: number}).rngState).toBe((composite.toSessionState().base as {rngState: number}).rngState);
            expect(plain.getSequenceStatistics().map(reel => reel.selections)).toEqual(composite.getSequenceStatistics().map(reel => reel.selections));
        }
    });

    it("direct constructors and rendering reject every unsupported ownership combination", () => {
        const config = new api.VideoSlotConfig();
        config.setAvailableSymbols(["A", "C"]);
        const generator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31));
        expect(() => new api.BoundedVideoSlotSession(config, generator, {cascade: {maxCascades: 0}})).toThrow(/mechanics.cascade.maxCascades/);
        for (const field of ["freeGames", "holdAndWin", "jackpot", "modifiers"] as const) {
            const blueprint = boundedBlueprint();
            Object.assign(blueprint.mechanics!, {[field]: {}});
            expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(/mechanics/);
        }
        const blueprint = boundedBlueprint();
        blueprint.betModes = [{id: "base", runtimeType: "base", isDefault: true}];
        expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(/betModes/);
        const modifiers: api.ScreenModifiers = {wilds: [], rules: []};
        config.setScreenModifiers(modifiers);
        expect(() => new api.BoundedVideoSlotSession(config, generator, {cascade: {maxCascades: 2}})).toThrow(/Unsupported/);
    });

    it("generated cascade deliveries consume neither RNG nor collection/credits and stale cursors reject", () => {
        const blueprint = boundedBlueprint("cascade-collection");
        blueprint.reelStrips = Array.from({length: 3}, () => ["A", "A", "A", "B"]);
        blueprint.mechanics!.collection!.symbolId = "B";
        const game = generatedMechanicsGame(blueprint);
        let seed = 0;
        for (; seed < 1000; seed++) {
            const probe = boundedSession(game, seed);
            try {
                probe.play();
            } catch (error) {
                if (error instanceof api.MaxCascadeStepsExceededError) continue;
                throw error;
            }
            if (probe.getBoundedMechanicObservation()!.cascade!.winningCascades >= 2) break;
        }
        expect(seed).toBeLessThan(1000);
        const session = boundedSession(game, seed),
            runtime = new api.SessionRuntime(session);
        const play = jest.spyOn(session, "play");
        const entry: api.SessionCommand = {kind: "spin", roundId: "cascade", delivery: "stepwise"};
        let result = played(runtime.execute(entry));
        const state = session.toSessionState(),
            credits = session.getCreditsAmount();
        expect(runtime.execute({...entry, bet: 7.5}).status).toBe("invalid-command");
        expect(runtime.execute({kind: "spin", continuation: {roundId: "foreign", cursor: 1}}).status).toBe("invalid-command");
        expect(runtime.execute({kind: "spin", continuation: {roundId: "cascade", cursor: 99}}).status).toBe("invalid-command");
        while (result.logicalRound!.status === "pending") {
            const command: api.SessionCommand = {kind: "spin", delivery: "stepwise", continuation: {roundId: "cascade", cursor: result.logicalRound!.deliveryCursor}};
            result = played(runtime.execute(command));
            expect(runtime.execute(command)).toEqual(result);
            expect(session.toSessionState()).toEqual(state);
            expect(session.getCreditsAmount()).toBe(credits);
        }
        expect(play).toHaveBeenCalledTimes(1);
        expect(result.logicalRound!.totalStake).toBe(0.05);
        expect(runtime.execute(entry)).toEqual(played(runtime.execute(entry)));
        expect(play).toHaveBeenCalledTimes(1);
        runtime.release();
    });

    it.each(["accumulation", "award", "balance", "exhaustion"] as const)("%s rejection restores RNG, value, credits and suppresses the invalid observation", failure => {
        const blueprint = constant(failure === "exhaustion" ? "cascade-collection" : "collection");
        if (failure === "exhaustion") {
            blueprint.paytable = {C: {3: 2}};
            blueprint.mechanics!.cascade!.maxCascades = 2;
        } else if (failure === "accumulation") blueprint.mechanics!.collection!.contribution = Number.MAX_VALUE;
        else {
            blueprint.mechanics!.collection = {...blueprint.mechanics!.collection!, threshold: 1, payout: Number.MAX_VALUE};
            if (failure === "award") blueprint.paytable = {C: {3: Number.MAX_VALUE}};
        }
        const session = boundedSession(generatedMechanicsGame(blueprint));
        if (failure === "balance") session.setCreditsAmount(Number.MAX_VALUE);
        const before = session.toSessionState(),
            balance = session.getCreditsAmount();
        for (let n = 0; n < 2; n++) {
            expect(() => session.play()).toThrow(/overflow|cascade/i);
            expect(session.toSessionState()).toEqual(before);
            expect(session.getCreditsAmount()).toBe(balance);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinningLines()).toEqual({});
            expect(session.getBoundedMechanicObservation()).toBeUndefined();
            const artifact = api.buildRoundArtifactFromSession(session, {roundId: "failed", provenance: {game: blueprint.manifest, pokieVersion: "1.3.0"}});
            expect(artifact.totalWin).toBe(0);
            expect(artifact.featureEvents).toBeUndefined();
        }
    });

    it("long generated reset chains finish at the lifetime bound and repeated release retains bounded executable state", () => {
        const blueprint = constant("respins-collection");
        blueprint.mechanics!.respins!.maxRespins = 90;
        blueprint.mechanics!.respins!.grant = 90;
        const session = boundedSession(generatedMechanicsGame(blueprint));
        let largest = 0;
        const runtime = new api.SessionRuntime(session);
        for (let index = 0; index < 12; index++) {
            const result = played(runtime.execute({kind: "spin", roundId: `long-${index}`, delivery: "composite"}));
            expect(result.logicalRound).toMatchObject({status: "completed", cursor: 91, totalStake: 0.05});
            expect(session.toSessionState().remaining).toBe(0);
            expect(session.toSessionState().executed).toBe(90);
            largest = Math.max(largest, JSON.stringify(session.toSessionState()).length);
            expect(runtime.getRetainedDeliveryCount()).toBeLessThan(10000);
        }
        runtime.release();
        expect(runtime.getRetainedDeliveryCount()).toBe(0);
        expect(runtime.execute({kind: "spin"}).status).toBe("blocked");
        expect(largest).toBeLessThan(500);
    });

    it("no-trigger and non-retriggered respins, exact threshold and zero reset have exact outcomes", () => {
        const noTrigger = constant("respins");
        noTrigger.mechanics!.respins!.trigger.symbolId = "A";
        const ordinary = boundedSession(generatedMechanicsGame(noTrigger));
        ordinary.play();
        expect(ordinary.getBoundedMechanicObservation()!.respins).toMatchObject({remaining: 0, executed: 0, granted: 0});
        const finite = constant("respins-collection");
        finite.mechanics!.respins!.retrigger = "none";
        finite.mechanics!.collection = {...finite.mechanics!.collection!, threshold: 3, cap: 3, reset: "zero"};
        const session = boundedSession(generatedMechanicsGame(finite));
        const result = played(new api.SessionRuntime(session).execute({kind: "spin", roundId: "no-reset", delivery: "composite"}));
        expect(result.logicalRound).toMatchObject({cursor: 3, totalWin: 30, totalStake: 0.05, status: "completed"});
        expect(session.getBoundedMechanicObservation()).toMatchObject({collection: {value: 0, triggered: true, payout: 10}, respins: {remaining: 0, executed: 2}});
    });

    it("cancellation retains the observed simulation prefix without claiming an incomplete round", async () => {
        const game = generatedMechanicsGame(constant("respins-collection"));
        const controller = new AbortController();
        let error: unknown;
        try {
            await new api.ParallelSimulationRunner(directory, 100, {workers: 1, seed: "31", chunkSize: 1, loadGame: () => Promise.resolve(game), signal: controller.signal, onProgress: () => controller.abort()}).run();
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(api.SimulationCancelledError);
        expect((error as api.SimulationCancelledError).observedPrefix).toMatchObject({rounds: 1, totalBet: 0.05, totalPayout: 0, logicalRoundMetrics: {rounds: 0}});
    });


    it("real multiple workers isolate collection trajectories and retain cancellation checkpoints", async () => {
        const runtime = emitPublicRuntime();
        try {
            const blueprint = constant("respins-collection"),
                game = generatedMechanicsGame(blueprint);
            const packageRoot = path.join(runtime.directory, "bounded-workers");
            fs.mkdirSync(packageRoot);
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "bounded-workers", version: "1.0.0", pokie: {entry: "./index.cjs"}}));
            fs.writeFileSync(path.join(packageRoot, "index.cjs"), api.renderBuiltGameModule(blueprint, "1.3.0"));
            const workerEntryUrl = pathToFileURL(path.join(runtime.directory, "node_modules/@fromstan/pokie/dist/esm/simulation/parallel/internal/simulationWorkerEntry.js"));
            const referenceSession = boundedSession(game);
            api.setSimulationModelIdentity(referenceSession, game.getConfigHash?.());
            const reference = new api.AggregateSimulationRunner(referenceSession, 10).run().getStatistics();
            for (const chunkSize of [2, 10]) {
                const results = await new api.SimulationWorkerCoordinator(workerEntryUrl).run([0, 1].map(workerIndex => ({workerIndex, totalWorkers: 2, packageRoot, rounds: 10, seed: String(31 + workerIndex), progressChunkSize: chunkSize})));
                expect(results).toHaveLength(2);
                for (const result of results) {
                    const statistics = api.SimulationAccumulator.fromSnapshot(result.accumulator).getStatistics();
                    expect(statistics).toEqual(reference);
                    expect(result.accumulator.logicalSamplingRanges).toHaveLength(1);
                }
                const merged = new api.SimulationStatisticsMerger().merge(results).statistics;
                expect(merged).toMatchObject({rounds: 20, totalPayout: 120, totalBet: 0.2, logicalRoundMetrics: {rounds: 2}, logicalSampling: {carriedSubrounds: 0, excludedSubrounds: 2}});
                expect(new api.SimulationReportBuilder().build({manifest: blueprint.manifest, requestedRounds: 20, statistics: merged, durationMs: 1, workers: 2})).toMatchObject({rounds: 2, sampling: {acceptedSubrounds: 20, excludedSubrounds: 2, trajectories: "independent-session-per-worker"}});
            }
            const controller = new AbortController(),
                checkpoints = new Map<number, api.SimulationAccumulatorSnapshot>();
            const threadIds = new Set<number>();
            const coordinator = new api.SimulationWorkerCoordinator(workerEntryUrl, request => {
                const worker = new Worker(workerEntryUrl, {workerData: request});
                threadIds.add(worker.threadId);
                worker.on("message", (message: SimulationWorkerMessage) => {
                    if (!controller.signal.aborted && message.type === "progress" && message.accumulator) checkpoints.set(message.workerIndex, message.accumulator);
                });
                return worker;
            });
            await expect(new api.ParallelSimulationRunner(packageRoot, 20, {workers: 2, seed: "31", chunkSize: 10, signal: controller.signal,
                createWorkerCoordinator: () => coordinator,
                onProgress: () => {
                    if (checkpoints.size === 2) controller.abort();
                },}).run()).rejects.toMatchObject({observedPrefix: {rounds: 20, totalPayout: 120, logicalRoundMetrics: {rounds: 2}, logicalSampling: {carriedSubrounds: 0, excludedSubrounds: 2}}});
            expect(threadIds.size).toBe(2);
            expect(checkpoints.size).toBe(2);
            const reopened = JSON.parse(JSON.stringify([...checkpoints.values()])) as api.SimulationAccumulatorSnapshot[];
            expect(new api.SimulationStatisticsMerger().merge(reopened.map(accumulator => ({accumulator}))).statistics).toMatchObject({rounds: 20, totalPayout: 120, logicalSampling: {carriedSubrounds: 0, excludedSubrounds: 2}});
        } finally {
            runtime.dispose();
        }
    }, 120000);

    it("Studio cancelled jobs retain their accepted prefix after reopening durable job storage", async () => {
        const game = generatedMechanicsGame(constant("respins-collection")),
            jobDirectory = path.join(directory, "jobs"),
            jobs = new StudioJobService(new FileStudioJobRepository(jobDirectory), undefined, () => "cancel-prefix");
        const service: StudioSimulationService = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 1, undefined, () => {
            service.cancelForProject(directory, "cancel-prefix");
            return Promise.resolve();
        });
        service.attachJobService(jobs);
        try {
            const started = service.start(directory, {rounds: 100, workers: 1, seed: "31"});
            if (started.status !== "created") throw new Error(JSON.stringify(started));
            for (let n = 0; n < 1000 && ["queued", "running", "cancelling"].includes(service.getStatus(started.job.id)!.status); n++) await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
            expect(service.getStatus(started.job.id)).toMatchObject({status: "cancelled", observedPrefix: {rounds: 1, totalBet: 0.05, totalPayout: 0, logicalRoundMetrics: {rounds: 0}}});
            expect(service.getReport(directory, started.job.id)).toMatchObject({status: "not-ready", jobStatus: "cancelled"});
            const reopened = new StudioSimulationService();
            reopened.attachJobService(new StudioJobService(new FileStudioJobRepository(jobDirectory)));
            expect(reopened.getStatusForProject(directory, started.job.id)).toMatchObject({status: "cancelled", observedPrefix: {rounds: 1, totalBet: 0.05, totalPayout: 0, logicalRoundMetrics: {rounds: 0}}});
            expect(reopened.getReport(directory, started.job.id)).toMatchObject({status: "not-ready", jobStatus: "cancelled"});
        } finally {
            await service.cancelAll();
        }
    });

    it("file session restore uses compatible wallet, result and recovery ports across collection trigger failures", async () => {
        const game = generatedMechanicsGame(constant("respins-collection"));
        const file = () => new api.FileSessionRepository(path.join(directory, "sessions"));
        const wallet = new api.InMemoryWallet(10000),
            results = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            operations = new api.InMemorySpinOperationLog();
        const session = boundedSession(game);
        await file().save("s", api.captureInitialPokieSessionState({seed: 31}, session, game.getSessionSerializer!(), true, game));
        const handler = (model = game) => new api.SpinCommandHandler(model, file(), wallet, results, operations, true);
        const entry: api.RepositoryCommand = {kind: "spin", sessionId: "s", requestId: "entry", roundId: "round", delivery: "stepwise", bet: 0.05};
        const first = await handler().execute(entry);
        expect(first.status).toBe("played");
        const prefix = await file().load("s");
        const continuation: api.RepositoryCommand = {kind: "spin", sessionId: "s", requestId: "next", delivery: "stepwise", continuation: {roundId: "round", cursor: 1}};
        const controller = new AbortController();
        controller.abort();
        expect((await handler().execute(continuation, controller.signal)).status).toBe("blocked");
        expect(await file().load("s")).toEqual(prefix);
        for (const failure of ["calculation", "capture", "serialization"] as const) {
            const failing: api.PokieGame = {...game, createSession(context) {
                const created = game.createSession(context) as api.BoundedVideoSlotSession;
                if (failure === "calculation") jest.spyOn(created, "play").mockImplementation(() => {
                    throw new Error("calculation rejected");
                });
                if (failure === "capture") {
                    const play = created.play.bind(created);
                    jest.spyOn(created, "play").mockImplementation(() => {
                        play();
                        jest.spyOn(created, "toSessionState").mockImplementation(() => {
                            throw new Error("capture rejected");
                        });
                    });
                }
                return created;
            }, ...(failure === "serialization" ? {getSessionSerializer: () => ({getInitialData: game.getSessionSerializer!().getInitialData.bind(game.getSessionSerializer!()), getRoundData: () => {
                throw new Error("serialization rejected");
            }})} : {})};
            const result = await handler(failing).execute({...continuation, requestId: failure});
            expect(result.status).not.toBe("played");
            expect(await file().load("s")).toEqual(prefix);
        }
        const advanced = await handler().execute(continuation);
        expect(advanced).toMatchObject({status: "played", stake: 0, win: 10});
        expect(await handler().execute(continuation)).toEqual(advanced);
        expect(await handler().execute(entry)).toEqual(first);
        expect((await file().load("s"))!.featureState).toMatchObject({value: 1, remaining: 2});
    });

    it("new public processes resume active chains and partial collections via durable SpinCommandHandler", () => {
        const runtime = emitPublicRuntime();
        try {
            const script = path.join(runtime.directory, "continue.cjs");
            fs.writeFileSync(script, `
const api = require("@fromstan/pokie");
const fs = require("node:fs");
(async () => {
    const [modulePath, database, mode, seedText] = process.argv.slice(2);
    const seed = Number(seedText), game = require(modulePath), store = await api.SqliteTransactionalRoundStore.open(database);
    try {
        if (mode !== "resume") {
            const session = game.createSession({seed}); session.setBet(0.05); session.setCreditsAmount(10000);
            await store.initialize("s", api.captureInitialPokieSessionState({seed}, session, game.getSessionSerializer(), true, game), game);
        }
        const handler = new api.SpinCommandHandler(game, store);
        let result = await handler.execute({kind: "spin", sessionId: "s", requestId: "entry", roundId: "round", bet: 0.05, delivery: "stepwise"});
        if (result.status !== "played") throw new Error(JSON.stringify(result));
        if (mode !== "prefix") {
            for (let n = 0; result.state.logicalRound.status === "pending"; n++) {
                if (n > 10000) throw new Error("unbounded");
                const cursor = result.state.logicalRound.deliveryCursor;
                result = await handler.execute({kind: "spin", sessionId: "s", requestId: "next-" + cursor, delivery: "stepwise", continuation: {roundId: "round", cursor}});
                if (result.status !== "played") throw new Error(JSON.stringify(result));
            }
            result = await handler.execute({kind: "spin", sessionId: "s", requestId: "paid-next", roundId: "paid-next", bet: 7.5, delivery: "composite"});
            if (result.status !== "played") throw new Error(JSON.stringify(result));
        }
        const saved = await store.readSession("s");
        console.log(JSON.stringify({pid: process.pid, feature: saved.state.featureState, logical: saved.state.logicalRound, balance: await store.getBalance("s"), win: result.win}));
    } finally { await store.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
`);
            for (const id of ["cascade", "respins", "collection", "cascade-respins-collection"] as const) {
                const blueprint = id.includes("cascade") ? boundedBlueprint(id) : constant(id);
                let seed = 31;
                if (id.includes("cascade")) {
                    const game = generatedMechanicsGame(blueprint);
                    for (seed = 0; seed < 1000; seed++) {
                        const session = boundedSession(game, seed);
                        session.play();
                        if ((session.getBoundedMechanicObservation()!.cascade?.winningCascades ?? 0) > 0) break;
                    }
                    expect(seed).toBeLessThan(1000);
                }
                const moduleFile = path.join(runtime.directory, `${id}.cjs`);
                fs.writeFileSync(moduleFile, api.renderBuiltGameModule(blueprint, "1.3.0"));
                const run = (mode: string, db: string) => JSON.parse(execFileSync(process.execPath, [script, moduleFile, path.join(directory, db), mode, String(seed)], {encoding: "utf8", timeout: 30000}));
                const reference = run("baseline", `${id}-reference.sqlite`),
                    prefix = run("prefix", `${id}-resumed.sqlite`),
                    resumed = run("resume", `${id}-resumed.sqlite`);
                expect(prefix.pid).not.toBe(resumed.pid);
                expect(resumed.pid).not.toBe(process.pid);
                if (id !== "collection") expect(prefix.logical.status).toBe("pending");
                else expect(prefix.feature.value).toBe(3);
                const {pid: _referencePid, ...expected} = reference,
                    {pid: _resumedPid, ...actual} = resumed;
                expect(actual).toEqual(expected);
            }
        } finally {
            runtime.dispose();
        }
    }, 120000);

});

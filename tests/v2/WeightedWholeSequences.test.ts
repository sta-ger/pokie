import {EditCommand} from "../../cli/commands/EditCommand.js";
import {runInNewContext} from "node:vm";
import {runChunkedSimulation} from "../../src/simulation/parallel/internal/runChunkedSimulation.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {weightedBlueprint, weightedConfig, weightedGame} from "./fixtures/WeightedWholeSequenceGame.js";
import {ForcedSymbolsCombinationsGenerator} from "../../src/weightedoutcome/generate/internal/ForcedSymbolsCombinationsGenerator.js";
import {streamExactWeightedOutcomes} from "../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {renderBuiltGameModuleSource} from "../../src/generated/renderBuiltGameModule.js";
import ts from "typescript";

const variants = [{id: "a", symbols: ["A", "A"], weight: 1}, {id: "b", symbols: ["B", "B"], weight: 3}];
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("canonical weighted whole sequences", () => {
    it("rejects reordered initialization selections before replacing executable state", () => {
        const config = weightedConfig();
        config.setSymbolsSequences([new api.WeightedSymbolsSequence(variants, ["A", "B"]), new api.WeightedSymbolsSequence(variants, ["A", "B"])]);
        const generator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(0));
        generator.generateSymbolsCombination();
        const saved = generator.getSelectionState();
        expect(saved.selections.map(selection => selection.reelIndex)).toEqual([0, 1]);
        expect(() => generator.setSelectionState({...saved, selections: [...saved.selections].reverse()})).toThrow("Invalid retained weighted selection");
        expect(generator.getSelectionState()).toEqual(saved);
    });
    it("selects anew for a base round and successive purchased features across direct, restored and audited delivery", () => {
        const blueprint = json(weightedBlueprint);
        blueprint.scatters = ["S"];
        blueprint.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 0}}};
        blueprint.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}];
        const game = weightedGame(blueprint),
            seed = 42;
        const stepwise = game.createSession({seed}) as api.VideoSlotWithBetModesSession;
        const composite = game.createSession({seed}) as api.VideoSlotWithBetModesSession;
        const direct = game.createSession({seed}) as api.VideoSlotWithBetModesSession;
        const runtimes = [new api.SessionRuntime(stepwise), new api.SessionRuntime(composite)];
        const commands: api.SessionCommand[] = [];
        for (const [index, id] of ["first", "purchase", "purchase-again"].entries()) {
            const command: api.SessionCommand = {kind: "spin", roundId: id, ...(index ? {mode: "buy"} : {}), delivery: "composite", maxSubrounds: 10};
            commands.push(command);
            const complete = runtimes[1].execute(command);
            let result = runtimes[0].execute({...command, delivery: "stepwise"});
            expect(result.status).toBe("played");
            if (result.status !== "played") throw new Error("Expected played entry");
            expect(stepwise.getSequenceSelections()[0].context).toBe(`logical:${id}`);
            expect(api.validateLogicalRound(result.logicalRound)).toBeUndefined();
            const restored = game.createSession({seed}) as api.VideoSlotWithBetModesSession;
            restored.fromSessionState(json(stepwise.toSessionState()));
            restored.setCreditsAmount(stepwise.getCreditsAmount());
            restored.setBet(stepwise.getBet());
            const resumed = new api.SessionRuntime(restored, result.logicalRound);
            while (result.logicalRound?.status === "pending") {
                const continuation: api.SessionCommand = {kind: "spin", continuation: {roundId: id, cursor: result.logicalRound.deliveryCursor}, delivery: "stepwise"};
                result = runtimes[0].execute(continuation);
                expect(resumed.execute(continuation)).toEqual(result);
                if (result.status !== "played") throw new Error("Expected played continuation");
                expect(api.validateLogicalRound(result.logicalRound)).toBeUndefined();
            }
            expect(complete.status).toBe("played");
            expect(restored.toSessionState()).toEqual(stepwise.toSessionState());
            expect(composite.toSessionState()).toEqual(stepwise.toSessionState());
            expect(stepwise.getSequenceStatistics()[0].selections).toBe(index + 1);
            if (index) direct.setBetMode("buy");
            for (let spin = 0; spin < (index ? 3 : 1); spin++) direct.play();
            expect(direct.getSequenceStatistics()).toEqual(stepwise.getSequenceStatistics());
            expect(direct.getSymbolsCombination().toMatrix()).toEqual(stepwise.getSymbolsCombination().toMatrix());
            expect(direct.getWinAmount()).toBe(stepwise.getWinAmount());
            expect(direct.getCreditsAmount()).toBe(stepwise.getCreditsAmount());
            expect(direct.toSessionState()).toMatchObject({base: {base: {rngState: (stepwise.toSessionState().base as {base: {rngState: number}}).base.rngState}}});
            resumed.release();
        }
        const recorder = new api.ReplayRecorder(),
            audited = game.createSession({seed}) as api.VideoSlotWithBetModesSession;
        const descriptor = recorder.recordAudit(game, audited, commands, {status: "calculated", sessionId: "purchases", durability: "detached"}, {seed});
        expect(audited.toSessionState()).toEqual(stepwise.toSessionState());
        expect(new api.AuditRoundReplay().replay(game, json(descriptor.audit!)).verification).toBe("verified");
        recorder.releaseAuditSession(audited);
        runtimes.forEach(runtime => runtime.release());
    });

    it.each(["logical:requested", "implicit:7"])("restores a pending context %s and its next RNG draws", context => {
        const game = weightedGame(),
            first = game.createSession({seed: 19}) as api.VideoSlotSession;
        first.play();
        first.setSelectionContext(context);
        const saved = json(first.toSessionState()),
            restored = game.createSession({seed: 19}) as api.VideoSlotSession;
        expect(saved.selectionContext).toBe(context);
        api.validateExecutableState(saved, first.getSessionStateSchema());
        restored.fromSessionState(saved);
        first.play();
        restored.play();
        expect(restored.getSequenceSelections()[0].context).toBe(context);
        expect(restored.toSessionState()).toEqual(first.toSessionState());
        expect(restored.getSymbolsCombination().toMatrix()).toEqual(first.getSymbolsCombination().toMatrix());
        first.play();
        restored.play();
        expect(restored.toSessionState()).toEqual(first.toSessionState());
        const invalid = {...saved, selectionContext: "implicit:0"};
        expect(() => restored.fromSessionState(invalid)).toThrow("context");
        if (context.startsWith("implicit:")) expect(() => restored.fromSessionState({...saved, implicitRound: 0})).toThrow("context");
    });

    it("captures a newly forced feature before its first draw without treating it as a continuation", () => {
        const blueprint = json(weightedBlueprint);
        blueprint.scatters = ["S"];
        blueprint.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 0}}};
        const game = weightedGame(blueprint),
            session = game.createSession({seed: 9}) as api.VideoSlotWithFreeGamesSession;
        session.play();
        session.setFreeGamesSum(2);
        session.setSelectionContext("logical:forced");
        const saved = json(session.toSessionState());
        expect(saved.featureEntryPending).toBe(true);
        const restored = game.createSession({seed: 9}) as api.VideoSlotWithFreeGamesSession;
        restored.fromSessionState(saved);
        restored.setCreditsAmount(session.getCreditsAmount());
        for (let round = 0; round < 2; round++) {
            session.play();
            restored.play();
            expect(restored.toSessionState()).toEqual(session.toSessionState());
            expect(restored.getSequenceSelections()[0].context).toBe("logical:forced");
            expect(restored.getSequenceStatistics()[0].selections).toBe(2);
        }
    });

    it.each(["terminal-only", "multi-step", "bounded-exhaustion"])("validates, reconstructs and audits retained weighted %s cascades", kind => {
        const generated = weightedGame({...weightedBlueprint, paytable: {}});
        const game: api.PokieGame = {...generated, createSession: context => {
            const session = generated.createSession(context) as api.VideoSlotSession & api.CascadeResultProviding;
            session.getCascadeResult = () => {
                const screen = session.getSymbolsCombination().toMatrix(),
                    evaluation = new api.WinEvaluationResult<string>();
                const steps = kind === "terminal-only" ? [] : [new api.CascadeStep(screen, evaluation, [], []), new api.CascadeStep(screen, evaluation, [], [])];
                return new api.CascadeResult(screen, screen, steps, {maxCascadeStepsExceeded: kind === "bounded-exhaustion"}, {}, {}, kind === "bounded-exhaustion" ? undefined : evaluation);
            };
            return session;
        }};
        const session = game.createSession({seed: 8}) as api.VideoSlotSession,
            runtime = new api.SessionRuntime(session);
        let result = runtime.execute({kind: "spin", roundId: "cascade", delivery: "stepwise"});
        if (result.status !== "played" || !result.logicalRound) throw new Error("Expected logical cascade");
        expect(api.validateLogicalRound(result.logicalRound)).toBeUndefined();
        const retained = json(result.logicalRound);
        expect(() => new api.SessionRuntime(session, retained)).not.toThrow();
        while (result.logicalRound.status === "pending") {
            result = runtime.execute({kind: "spin", continuation: {roundId: "cascade", cursor: result.logicalRound.deliveryCursor}, delivery: "stepwise"});
            if (result.status !== "played" || !result.logicalRound) throw new Error("Expected cascade delivery");
        }
        expect(api.validateLogicalRound(result.logicalRound)).toBeUndefined();
        const template = api.buildRoundArtifactFromSession(session, {roundId: "cascade", provenance: {game: game.getManifest(), pokieVersion: "1"}});
        const artifact = api.buildLogicalRoundArtifact(result.logicalRound, template);
        artifact.steps.forEach(step => expect(step.sequenceSelections).toEqual(session.getSequenceSelections()));
        const recorder = new api.ReplayRecorder(),
            audited = game.createSession({seed: 8});
        const descriptor = recorder.recordAudit(game, audited, [{kind: "spin", roundId: "cascade", delivery: "composite", maxSubrounds: 10}], {status: "calculated", sessionId: "cascade", durability: "detached"}, {seed: 8});
        expect(new api.AuditRoundReplay().replay(game, json(descriptor.audit!)).verification).toBe("verified");
        recorder.releaseAuditSession(audited);
        runtime.release();
    });

    it("reserves explicitly used implicit contexts for both session and standalone allocation", () => {
        const config = weightedConfig();
        const session = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(3)));
        session.setSelectionContext("implicit:1");
        session.play();
        session.play();
        expect(session.getSequenceSelections()[0].context).toBe("implicit:2");
        expect(session.getSequenceStatistics()[0].selections).toBe(2);
        const generator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(3));
        generator.setSelectionContext("implicit:1");
        generator.generateSymbolsCombination();
        const restored = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(3));
        restored.setSelectionState(json(generator.getSelectionState()));
        expect(() => restored.setSelectionState({...generator.getSelectionState(), implicitGeneration: 0})).toThrow("Unreserved");
        restored.setRandomState(generator.getRandomState());
        restored.generateSymbolsCombination();
        expect(restored.getSequenceSelections()[0].context).toBe("implicit:2");
        expect(restored.getSequenceStatistics()[0].selections).toBe(2);
        restored.setSelectionContext("logical:pending-generator");
        const pending = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(3));
        pending.setSelectionState(json(restored.getSelectionState()));
        pending.setRandomState(restored.getRandomState());
        expect(pending.generateSymbolsCombination().toMatrix()).toEqual(restored.generateSymbolsCombination().toMatrix());
        expect(pending.getSelectionState()).toEqual(restored.getSelectionState());
        expect(pending.getSequenceSelections()[0].context).toBe("logical:pending-generator");
    });

    it.each([Number.MIN_VALUE, 1e-200])("rejects positive stop/joint mass underflow for weight %s", weight => {
        const reel = new api.WeightedSymbolsSequence(variants.map((variant, index) => ({...variant, weight: index ? 1 : weight})));
        expect(reel.getProbabilities()[0]).toBeGreaterThan(0);
        expect(() => api.SymbolsCombinationsAnalyzer.getWeightedCombinations([reel, reel], 1)).toThrow("not representable in binary64");
    });

    it("estimates exact and positive weighted stop cardinality without reading or constructing windows", async () => {
        const game = weightedGame(),
            probe = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([]));
        const exact = new api.SymbolsSequence().fromArray(Array.from({length: 1000}, () => "A"));
        const weighted = new api.WeightedSymbolsSequence([...variants, {id: "zero", symbols: ["A", "B"], weight: 0}]);
        const reads = [jest.spyOn(exact, "getSymbols"), jest.spyOn(weighted, "getSymbols")];
        reads.forEach(read => read.mockImplementation(() => {
            throw new Error("Must not enumerate windows");
        }));
        probe.getSymbolsSequences = () => [exact, weighted];
        const large = {...game, createExactEnumerationSession: () => probe};
        expect(api.estimateExactOutcomeSpaceSize(large)).toMatchObject({reelSizes: [1000, 4], totalOutcomeSpaceSize: BigInt(4000)});
        await expect(api.generateExactWeightedOutcomeLibrary({libraryId: "capped", game: large, pokieVersion: "1", maxOutcomeSpaceSize: BigInt(10)})).rejects.toThrow();
        reads.forEach(read => expect(read).not.toHaveBeenCalled());
    });
    it.each([0, 1, 2, 3])("selects 1:3 boundary %i as one intact array", draw => {
        const definition = new api.WeightedSymbolsSequence(variants);
        const calls: number[][] = [];
        const chosen = definition.select({getRandomInt(min, max) {
            calls.push([min, max]);
            return draw;
        }});
        expect(chosen.id).toBe(draw === 0 ? "a" : "b");
        expect(chosen.symbols).toEqual(draw === 0 ? ["A", "A"] : ["B", "B"]);
        expect(calls).toEqual([[0, 4]]);
        expect(definition.getSize()).toBe(2);
        expect(definition.getSymbolWeight("A")).toBe(25);
        expect(() => definition.getSymbol(0)).toThrow("contextual selection");
    });

    it("orders initialization and paid draws by reel; retains arrays and wraps without read draws", () => {
        const config = weightedConfig(3),
            calls: number[][] = [];
        const numbers = [0, 1, 0, 3, 1, 1, 0, 0, 0];
        const generator = new api.SymbolsCombinationsGenerator(config, {getRandomInt(min, max) {
            calls.push([min, max]);
            return numbers.shift()!;
        }});
        const session = new api.VideoSlotSession(config, generator);
        expect(session.getSymbolsCombination().toMatrix()).toEqual([["C", "A", "C"], ["A", "A", "A"]]);
        expect(session.getSequenceStatistics()[0].selections).toBe(0);
        session.setSelectionContext("logical:one");
        session.play();
        expect(session.getSymbolsCombination().toMatrix()[0]).toEqual(["D", "B", "D"]);
        expect(session.getSequenceSelections()).toEqual([{reelIndex: 0, variantId: "b", context: "logical:one"}]);
        const before = calls.length;
        session.getSequenceSelections();
        session.getSequenceStatistics();
        config.getSymbolsSequences()[0].getSize();
        session.getSymbolsCombination().toMatrix();
        expect(calls).toHaveLength(before);
        session.setSelectionContext("logical:one");
        session.play();
        expect(session.getSequenceSelections()[0].variantId).toBe("b");
        expect(calls).toEqual([[0, 4], [0, 2], [0, 2], [0, 4], [0, 2], [0, 2], [0, 2], [0, 2]]);
        expect(session.getSequenceStatistics()[0].selections).toBe(1);
    });

    it("selects two weighted reels independently in reel/variant/stop order", () => {
        const config = weightedConfig(3);
        config.setSymbolsSequences([config.getSymbolsSequences()[0], new api.WeightedSymbolsSequence([{id: "aa", symbols: ["A", "A"], weight: 1}, {id: "cd", symbols: ["C", "D"], weight: 3}])]);
        const calls: number[][] = [],
            values = [0, 1, 3, 0, 3, 1, 0, 1];
        const session = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, {getRandomInt: (min, max) => {
            calls.push([min, max]);
            return values.shift()!;
        }}));
        session.setSelectionContext("logical:multiple");
        session.play();
        expect(session.getSymbolsCombination().toMatrix()).toEqual([["D", "B", "D"], ["A", "A", "A"]]);
        expect(session.getSequenceSelections()).toEqual([{reelIndex: 0, variantId: "b", context: "logical:multiple"}, {reelIndex: 1, variantId: "aa", context: "logical:multiple"}]);
        expect(calls).toEqual([[0, 4], [0, 2], [0, 4], [0, 2], [0, 4], [0, 2], [0, 4], [0, 2]]);
    });

    it("reselects for direct paid rounds, isolates shared definitions, and blocks unfunded draws", () => {
        const config = weightedConfig();
        const first = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(1)));
        const second = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(2)));
        first.play();
        first.play();
        expect(first.getSequenceSelections()[0].context).toBe("implicit:2");
        expect(second.getSequenceSelections()[0].context).toBe("initialization");
        const saved = json(first.toSessionState());
        first.setCreditsAmount(0);
        first.play();
        expect(first.toSessionState()).toEqual(saved);
    });

    it.each([
        [], Array(1) as api.WeightedSequenceVariant[], [{...variants[0], symbols: Array(1) as string[]}], [{...variants[0], id: ""}], [{...variants[0], weight: -1}], [{...variants[0], weight: NaN}],
        [{...variants[0], weight: Infinity}], [{...variants[0], weight: 0}],
        [variants[0], {...variants[1], id: "a"}], [variants[0], {...variants[0], id: "other"}],
        [{...variants[0], symbols: []}], [{...variants[0], symbols: ["unknown"]}],
        [variants[0], {...variants[1], symbols: ["B"]}],
    ].map(invalid => [invalid]))("rejects malformed direct definitions %# without RNG", invalid => {
        expect(() => new api.WeightedSymbolsSequence(invalid, ["A", "B"])).toThrow();
    });

    it("allows distinct cyclic rotations, case-sensitive IDs, zero entries and numeric extremes", () => {
        const definition = new api.WeightedSymbolsSequence([
            {id: "a", symbols: ["A", "B"], weight: Number.MAX_VALUE}, {id: "A", symbols: ["B", "A"], weight: Number.MAX_VALUE},
            {id: "zero", symbols: ["A", "A"], weight: 0},
        ]);
        expect(definition.getProbabilities()).toEqual([0.5, 0.5, 0]);
        expect(definition.getIntegerWeights()).toEqual([BigInt(1), BigInt(1), BigInt(0)]);
        expect(new api.WeightedSymbolsSequence(variants.map(v => ({...v, weight: v.weight / 8}))).getIntegerWeights()).toEqual([BigInt(1), BigInt(3)]);
        const extreme = new api.WeightedSymbolsSequence([{...variants[0], weight: Number.MIN_VALUE}, {...variants[1], weight: Number.MAX_VALUE}]);
        expect(extreme.getIntegerWeights()[0]).toBe(BigInt(1));
        expect(extreme.select({getRandomInt: () => 0}).id).toBe("a");
    });

    it("rejects source conflicts, unknown symbols, wrong counts and ambiguous variants with stable paths", () => {
        const validator = new api.GameBlueprintValidator();
        expect(validator.validate(weightedBlueprint).filter(issue => issue.severity === "error")).toEqual([]);
        for (const key of ["reelStrips", "reelStripGeneration", "symbolWeights"]) {
            expect(validator.validate({...weightedBlueprint, [key]: []}).some(issue => issue.code === "blueprint-reel-sequences-invalid")).toBe(true);
        }
        expect(validator.validate({...weightedBlueprint, reelSequences: []}).some(issue => issue.message.includes("reelSequences"))).toBe(true);
        expect(validator.validate({...weightedBlueprint, reelSequences: [{type: "weighted", variants: [{id: "bad", weight: 1, symbols: ["unknown"]}]}, weightedBlueprint.reelSequences![1]]}).find(issue => issue.code === "blueprint-reel-sequences-invalid")?.message).toContain("reelSequences[0].variants[0].symbols");
        expect(() => new api.VideoSlotConfig().setSymbolsSequences([new api.WeightedSymbolsSequence(variants)])).toThrow("one definition per reel");
    });

    it("preserves exact-only initialization, screens, awards and subsequent seeded RNG state", () => {
        const config = weightedConfig();
        config.setSymbolsSequences([new api.SymbolsSequence().fromArray(["A", "B"]), new api.SymbolsSequence().fromArray(["A", "A"])]);
        const rng = new api.SeededRandomNumberGenerator(123),
            reference = new api.SeededRandomNumberGenerator(123);
        const session = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, rng));
        for (let round = 0; round < 30; round++) {
            const stop = reference.getRandomInt(0, 2);
            reference.getRandomInt(0, 2);
            expect(session.getSymbolsCombination().toMatrix()).toEqual([[stop === 0 ? "A" : "B"], ["A"]]);
            expect(rng.toSessionState()).toBe(reference.toSessionState());
            if (round > 0) expect(session.getWinAmount()).toBe(stop === 0 ? 4 : 0);
            session.play();
        }
        expect(session.toSessionState()).not.toHaveProperty("sequenceState");
    });

    it("restores retained identity and the next round, rejects tampered ID/context without draws", () => {
        const game = weightedGame(),
            session = game.createSession({seed: 27}) as api.VideoSlotSession;
        new api.SessionRuntime(session).execute({kind: "spin", roundId: "restore", delivery: "stepwise"});
        const saved = json(session.toSessionState()),
            restored = game.createSession({seed: 27}) as api.VideoSlotSession;
        restored.fromSessionState(saved);
        expect(restored.getSequenceSelections()).toEqual(session.getSequenceSelections());
        session.play();
        restored.play();
        expect(restored.getSymbolsCombination().toMatrix()).toEqual(session.getSymbolsCombination().toMatrix());
        expect(restored.toSessionState()).toEqual(session.toSessionState());
        const tampered = json(saved) as {sequenceState: {context: string; selections: {variantId: string}[]}};
        tampered.sequenceState.selections[0].variantId = "foreign";
        expect(() => restored.fromSessionState(tampered)).toThrow();
        tampered.sequenceState.context = "foreign";
        expect(() => restored.fromSessionState(tampered)).toThrow();
    });

    it("binds variants to canonical artifacts, public/JSON projection, replay and audit hashing", () => {
        const game = weightedGame(),
            session = game.createSession({seed: 7});
        const recorder = new api.ReplayRecorder();
        const descriptor = recorder.recordAudit(game, session, [{kind: "spin", roundId: "audited", delivery: "stepwise"}], {status: "calculated", sessionId: "weighted", durability: "detached"}, {seed: 7});
        expect(descriptor.artifact?.sequenceSelections?.[0]).toMatchObject({reelIndex: 0, context: "logical:audited"});
        expect(new api.AuditRoundReplay().replay(game, json(descriptor.audit!)).verification).toBe("verified");
        const artifact = descriptor.artifact!;
        expect(new api.PublicRoundArtifactProjector().project(artifact).sequenceSelections).toEqual(artifact.sequenceSelections);
        const tampered = json(artifact) as unknown as {sequenceSelections: {context: string}[]};
        tampered.sequenceSelections[0].context = "logical:other";
        expect(new api.RoundArtifactValidator().validate(tampered as unknown as api.RoundArtifact).length).toBeGreaterThan(0);
        expect(api.computeRoundArtifactHash(tampered as unknown as api.RoundArtifact)).not.toBe(artifact.hash);
        recorder.releaseAuditSession(session);
    });

    it("reuses accepted retry selections and restores counters with RNG after calculation failure", () => {
        const game = weightedGame(),
            session = game.createSession({seed: 12}) as api.VideoSlotSession,
            runtime = new api.SessionRuntime(session);
        const command: api.SessionCommand = {kind: "spin", roundId: "retry", delivery: "stepwise"};
        const accepted = runtime.execute(command),
            saved = json(session.toSessionState());
        expect(runtime.execute(command)).toEqual(accepted);
        expect(session.toSessionState()).toEqual(saved);
        expect(runtime.execute({kind: "spin", roundId: "invalid", bet: 999, delivery: "stepwise"}).status).toBe("invalid-command");
        expect(session.toSessionState()).toEqual(saved);
        const play = session.play.bind(session);
        session.play = () => {
            play();
            throw new Error("calculation failed");
        };
        expect(() => runtime.execute({...command, roundId: "failed"})).toThrow("calculation failed");
        expect(session.toSessionState()).toEqual(saved);
        runtime.release();
    });

    it("retains one variant across free continuations in stepwise and composite delivery", () => {
        const blueprint = json(weightedBlueprint);
        blueprint.scatters = ["S"];
        blueprint.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {1: 2}}};
        blueprint.reelSequences![1] = {type: "exact", symbols: ["S", "A", "A"]};
        const game = weightedGame(blueprint);
        let seed = 0;
        for (; seed < 1000; seed++) {
            const probe = game.createSession({seed}) as api.VideoSlotWithFreeGamesSession;
            probe.play();
            if (probe.getFreeGamesSum() !== 2) continue;
            probe.play();
            probe.play();
            if (!probe.hasPendingLogicalRound()) break;
        }
        expect(seed).toBeLessThan(1000);
        const sessions = [game.createSession({seed}), game.createSession({seed})] as api.VideoSlotWithFreeGamesSession[];
        const first = new api.SessionRuntime(sessions[0]),
            second = new api.SessionRuntime(sessions[1]);
        const a = first.execute({kind: "spin", roundId: "feature", delivery: "stepwise"});
        const b = second.execute({kind: "spin", roundId: "feature", delivery: "composite", maxSubrounds: 10});
        expect(a.status).toBe("played");
        expect(b.status).toBe("played");
        expect(sessions[0].getSequenceStatistics()[0].selections).toBe(1);
        const active = sessions[0].getSequenceSelections();
        const restored = game.createSession({seed}) as api.VideoSlotWithFreeGamesSession;
        restored.fromSessionState(json(sessions[0].toSessionState()));
        if (a.status === "played" && a.logicalRound?.status === "pending") {
            const resumed = new api.SessionRuntime(restored, a.logicalRound);
            const continuation: api.SessionCommand = {kind: "spin", continuation: {roundId: "feature", cursor: a.logicalRound.deliveryCursor}, delivery: "composite", maxSubrounds: 10};
            first.execute(continuation);
            resumed.execute(continuation);
            expect(restored.toSessionState()).toEqual(sessions[0].toSessionState());
            resumed.release();
        }
        expect(sessions[0].getSequenceSelections()).toEqual(active);
        expect(sessions[0].toSessionState()).toEqual(sessions[1].toSessionState());
        first.release();
        second.release();
    });

    it("restores the standalone generator's next implicit context and variant draw", () => {
        const config = weightedConfig();
        const generator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(71));
        generator.generateSymbolsCombination();
        const random = generator.getRandomState();
        const selection = json(generator.getSelectionState());
        const expected = generator.generateSymbolsCombination().toMatrix();
        const restored = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(0));
        restored.setRandomState(random);
        restored.setSelectionContext("logical:discarded");
        restored.setSelectionState(selection);
        expect(restored.generateSymbolsCombination().toMatrix()).toEqual(expected);
        expect(restored.getSequenceSelections()).toEqual(generator.getSequenceSelections());
        expect(restored.getSequenceSelections()[0].context).toBe("implicit:2");
        expect(restored.getRandomState()).toBe(generator.getRandomState());
    });

    it("rejects live definition replacement and mixed exact-strip tampering without altering context or RNG", () => {
        const config = weightedConfig();
        const session = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(91)));
        session.play();
        const saved = json(session.toSessionState());
        const definitions = config.getSymbolsSequences();
        config.setSymbolsSequences([new api.WeightedSymbolsSequence([{id: "a", weight: 1, symbols: ["B", "D"]}, {id: "b", weight: 3, symbols: ["A", "C"]}]), definitions[1]]);
        expect(() => session.play()).toThrow("definitions changed");
        expect(() => session.getSequenceStatistics()).toThrow("definitions changed");
        config.setSymbolsSequences(definitions);
        expect(session.toSessionState()).toEqual(saved);
        const tampered = json(saved);
        tampered.reelStrips![1] = ["B", "B"];
        expect(() => session.fromSessionState(tampered)).toThrow("exact strip");
        expect(session.toSessionState()).toEqual(saved);
    });

    it("binds restored active contexts to the supplied logical round before any continuation draw", () => {
        const game = weightedGame();
        const session = game.createSession({seed: 8}) as api.VideoSlotSession;
        const runtime = new api.SessionRuntime(session);
        const accepted = runtime.execute({kind: "spin", roundId: "bound", delivery: "stepwise"});
        if (accepted.status !== "played") throw new Error("Expected accepted round.");
        const tampered = json(session.toSessionState()) as {rngState: number; reelStrips: string[][]; implicitRound: number; sequenceState: {context: string; selections: api.ReelSequenceSelection[]}};
        tampered.sequenceState.context = "logical:foreign";
        tampered.sequenceState.selections = tampered.sequenceState.selections.map(selection => ({...selection, context: "logical:foreign"}));
        const restored = game.createSession({seed: 8}) as api.VideoSlotSession;
        restored.fromSessionState(tampered);
        expect(() => new api.SessionRuntime(restored, accepted.logicalRound)).toThrow("weighted selections");
        expect(restored.toSessionState().rngState).toBe(tampered.rngState);
        runtime.release();
    });

    it("edits a real weighted Blueprint through the CLI wizard without discarding its source or other authored fields", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weighted-edit-"));
        const file = path.join(directory, "weighted.blueprint.json");
        const model: api.GameBlueprint & {notes: string} = {...json(weightedBlueprint), symbols: ["A", "B"], paytable: {A: {2: 4}, B: {2: 0}}, winModel: {type: "ways"}, notes: "Keep this authored field", screenGeometry: {generated: {reels: 2, rows: 3}, visible: {rowOffset: 1, rows: 1}, evaluated: {rowOffset: 1, rows: 1}, paylineSpace: "evaluated"}};
        fs.writeFileSync(file, JSON.stringify(model));
        let closed = false;
        const questions: string[] = [];
        const prompt = {ask: (question: string): Promise<string> => {
            questions.push(question);
            if (questions.length > 60) throw new Error("Wizard exceeded its bounded question count.");
            if (question.startsWith("Game name")) return Promise.resolve("Edited weighted game");
            if (question.startsWith("Save this blueprint")) return Promise.resolve("y");
            return Promise.resolve("");
        }, close: () => {
            closed = true;
        }};
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const command = new EditCommand(undefined, undefined, undefined, undefined, undefined, () => prompt, () => true);
            expect(await command.run([file])).toBe(0);
            const edited = JSON.parse(fs.readFileSync(file, "utf8")) as typeof model;
            expect(edited.reelSequences).toEqual(model.reelSequences);
            expect(edited.winModel).toEqual(model.winModel);
            expect(edited.screenGeometry).toEqual(model.screenGeometry);
            expect(edited.notes).toBe(model.notes);
            expect(edited.manifest.name).toBe("Edited weighted game");
            expect(questions.some(question => question.includes("Reel weighting"))).toBe(false);
            expect(closed).toBe(true);
        } finally {
            log.mockRestore();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("reports zero/partial coverage, run-local deltas, merged counters and bounded long-session state", () => {
        const game = weightedGame(),
            session = game.createSession({seed: 321}) as api.VideoSlotSession;
        const unseen = session.getSequenceStatistics()[0];
        expect(unseen.selections).toBe(0);
        expect(unseen.variants.every(variant => variant.uncovered && variant.frequency === 0)).toBe(true);
        session.setCreditsAmount(100000);
        const first = new api.AggregateSimulationRunner(session, 1000).run(),
            second = new api.AggregateSimulationRunner(session, 1000).run();
        expect(second.getStatistics().reelSequences![0].selections).toBe(1000);
        first.merge(api.SimulationAccumulator.fromSnapshot(second.toSnapshot()));
        expect(first.getStatistics().reelSequences![0].selections).toBe(2000);
        const stats = new api.AggregateSimulationRunner(session, 10000).run().getStatistics();
        expect(stats.reelSequences![0].variants[0].frequency).toBeCloseTo(0.25, 1);
        // tolerance < 0.05
        expect(Math.abs(stats.rtp - 1)).toBeLessThan(0.06);
        const state = session.toSessionState() as {sequenceState: {selections: unknown[]; counts: Record<string, number>[]}};
        expect(state.sequenceState.selections).toHaveLength(1);
        expect(Object.keys(state.sequenceState.counts[0])).toHaveLength(2);
        expect(JSON.stringify(state).length).toBeLessThan(600);
    });

    it("keeps unseen/zero variants through chunks, worker merges, reports and incompatible-model rejection", async () => {
        const blueprint = json(weightedBlueprint);
        (blueprint.reelSequences![0] as {variants: api.WeightedSequenceVariant[]}).variants.push({id: "zero", weight: 0, symbols: ["A", "B"]});
        const game = weightedGame(blueprint),
            a = game.createSession({seed: 18}) as api.VideoSlotSession,
            b = game.createSession({seed: 18}) as api.VideoSlotSession;
        const empty = new api.AggregateSimulationRunner(a, 0).run().getStatistics();
        expect(empty.reelSequences![0].variants[2]).toMatchObject({count: 0, frequency: 0, uncovered: false});
        const direct = new api.AggregateSimulationRunner(a, 100).run();
        const chunked = await runChunkedSimulation(b, 100, 7, {});
        expect(chunked.accumulator.getStatistics().reelSequences).toEqual(direct.getStatistics().reelSequences);
        const merged = new api.SimulationStatisticsMerger().merge([{accumulator: direct.toSnapshot()}, {accumulator: chunked.accumulator.toSnapshot()}]).statistics;
        expect(merged.reelSequences![0].selections).toBe(200);
        const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 200, statistics: merged, durationMs: 1});
        expect(json(report).reelSequences![0].variants).toHaveLength(3);
        expect(new api.MarkdownSimulationReportRenderer().render(report)).toContain("zero weight");
        expect(new api.HtmlSimulationReportRenderer().render(report)).toContain("zero weight");
        const changed = json(blueprint);
        (changed.reelSequences![0] as {variants: api.WeightedSequenceVariant[]}).variants[0] = {...variants[0], id: "changed"};
        const other = new api.AggregateSimulationRunner(weightedGame(changed).createSession({seed: 1}), 1).run();
        expect(() => direct.merge(other)).toThrow("incompatible weighted reel models");
        const cancelled = new AbortController();
        cancelled.abort();
        const before = fs.readdirSync(os.tmpdir()).filter(file => file.startsWith("pokie-exact-grids-"));
        await expect(streamExactWeightedOutcomes({libraryId: "cancelled", game, pokieVersion: "1", signal: cancelled.signal}).next()).rejects.toBeInstanceOf(api.WeightedOutcomeLibraryGenerationCancelledError);
        expect(fs.readdirSync(os.tmpdir()).filter(file => file.startsWith("pokie-exact-grids-"))).toEqual(before);
    });

    it("matches exact tiny-fixture RTP and total probability; preserves generated TS parity", async () => {
        const game = weightedGame();
        const {library, diagnostics} = await api.generateExactWeightedOutcomeLibrary({libraryId: "tiny", game, pokieVersion: "1.3.0"});
        expect(diagnostics.totalOutcomeSpaceSize).toBe(8);
        expect(library.outcomes).toHaveLength(2);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(1);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight * outcome.artifact.totalWin, 0)).toBe(1);
        expect(library.outcomes.every(outcome => outcome.artifact.sequenceSelections === undefined)).toBe(true);
        const probe = game.createExactEnumerationSession!(new ForcedSymbolsCombinationsGenerator([]));
        const analysis = api.SymbolsCombinationsAnalyzer.getWeightedCombinations(probe.getSymbolsSequences(), 1);
        expect(analysis.map(entry => entry.probability).sort()).toEqual([0.25, 0.75]);
        const module = {exports: {}};
        const compiled = ts.transpileModule(renderBuiltGameModuleSource(weightedBlueprint, "1.3.0"), {compilerOptions: {module: ts.ModuleKind.CommonJS}});
        runInNewContext(compiled.outputText, {require: () => api, module, exports: module.exports});
        const typed = module.exports as api.PokieGame;
        const a = game.createSession({seed: 2}) as api.VideoSlotSession,
            b = typed.createSession({seed: 2}) as api.VideoSlotSession;
        for (let round = 0; round < 10; round++) {
            a.play();
            b.play();
            expect(a.toSessionState()).toEqual(b.toSessionState());
            expect(a.getWinAmount()).toBe(b.getWinAmount());
        }
    });

    it("carries weighted mass through disk staging and rejects changed-model checkpoints", async () => {
        const game = weightedGame(),
            options = {libraryId: "disk", game, pokieVersion: "1.3.0"};
        const outcomes: api.WeightedOutcomeInput[] = [];
        for await (const outcome of streamExactWeightedOutcomes(options)) outcomes.push(outcome);
        expect(outcomes.reduce((sum, outcome) => sum + outcome.weight * outcome.artifact.totalWin, 0)).toBe(1);
        const controller = new AbortController();
        controller.abort();
        let checkpoint: api.ExactEnumerationCheckpoint | undefined;
        try {
            await api.generateExactWeightedOutcomeLibrary({...options, signal: controller.signal});
        } catch (error) {
            checkpoint = (error as api.WeightedOutcomeLibraryGenerationCancelledError).checkpoint;
        }
        expect(checkpoint).toBeDefined();
        const changed = json(weightedBlueprint);
        (changed.reelSequences![0] as {variants: api.WeightedSequenceVariant[]}).variants[0] = {...variants[0], id: "changed"};
        await expect(api.generateExactWeightedOutcomeLibrary({...options, game: weightedGame(changed), resumeFrom: checkpoint})).rejects.toMatchObject({code: "weighted-outcome-library-generation-checkpoint-mismatch"});
    });

    it("persists and replays weighted identities through File and SQLite repositories with idempotent retry", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weighted-persistence-"));
        const game = weightedGame(),
            context = {seed: 3},
            session = game.createSession(context);
        session.setCreditsAmount(100);
        const initial = api.captureInitialPokieSessionState(context, session, game.getSessionSerializer!(), true, game);
        let store: api.SqliteTransactionalRoundStore | undefined;
        try {
            const files = new api.FileSessionRepository(path.join(directory, "sessions"));
            await files.save("weighted", initial);
            const loaded = (await files.load("weighted"))!;
            expect(api.validatePersistedSession(loaded, game)).toBeUndefined();
            store = await api.SqliteTransactionalRoundStore.open(path.join(directory, "rounds.sqlite"));
            await store.initialize("weighted", loaded, game);
            const command: api.RepositoryCommand = {kind: "spin", sessionId: "weighted", requestId: "one", roundId: "persisted", delivery: "stepwise"};
            const result = await new api.SpinCommandHandler(game, store, {sessionCapturePolicyMode: "full"}).execute(command);
            expect(result.status).toBe("played");
            if (result.status !== "played") throw new Error(JSON.stringify(result));
            expect(result.state.roundArtifact?.sequenceSelections?.[0].context).toBe("logical:persisted");
            expect(new api.AuditRoundReplay().replay(game, json(result.audit!)).verification).toBe("verified");
            await store.close();
            store = await api.SqliteTransactionalRoundStore.open(path.join(directory, "rounds.sqlite"));
            const retry = await new api.SpinCommandHandler(game, store, {sessionCapturePolicyMode: "full"}).execute(command);
            expect(retry.status).toBe("played");
            if (retry.status === "played") expect(retry.state.featureState).toEqual(result.state.featureState);
            const saved = (await store.readSession("weighted"))!.state;
            const reordered = json(saved) as api.PokieSessionState & {featureState: {sequenceState: {selections: api.ReelSequenceSelection[]}}};
            reordered.featureState.sequenceState.selections = reordered.featureState.sequenceState.selections.map(({context: retainedContext, reelIndex, variantId}) => ({variantId, context: retainedContext, reelIndex}));
            expect(api.validatePersistedSession(reordered, game)).toBeUndefined();
            await files.save("weighted", saved);
            expect((await files.load("weighted"))!.featureState).toEqual(result.state.featureState);
            const tampered = json(saved) as api.PokieSessionState & {featureState: {sequenceState: {context: string}}};
            tampered.featureState.sequenceState.context = "logical:foreign";
            expect(api.validatePersistedSession(tampered, game)?.status).toBe("corrupt-state");
        } finally {
            await store?.close();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("compensates failed persistence without committing a selection event or advancing the next draw", async () => {
        const game = weightedGame(),
            context = {seed: 13},
            session = game.createSession(context);
        session.setCreditsAmount(100);
        const initial = api.captureInitialPokieSessionState(context, session, game.getSessionSerializer!(), true, game);
        const memory = new api.InMemorySessionRepository();
        await memory.save("failure", initial);
        let fail = true;
        const repository: api.SessionRepository = {
            load: id => memory.load(id),
            save: async (id, state) => {
                if (fail) {
                    fail = false;
                    throw new Error("persistence failed");
                }
                await memory.save(id, state);
            },
        };
        const wallet = new api.InMemoryWallet(100);
        const handler = new api.SpinCommandHandler(game, repository, wallet, undefined, undefined, true);
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "failure", requestId: "failed", roundId: "failure-round", delivery: "stepwise"};
        expect((await handler.execute(command)).status).toBe("storage-error");
        expect((await memory.load("failure"))!.featureState).toEqual(initial.featureState);
        expect(await wallet.getBalance("failure")).toBe(100);
        const retry = await handler.execute({...command, requestId: "successful"});
        expect(retry.status).toBe("played");
        new api.SessionRuntime(session).execute({kind: "spin", roundId: "failure-round", delivery: "stepwise"});
        if (retry.status === "played") expect(retry.state.featureState).toEqual((session as api.VideoSlotSession).toSessionState());
        new api.SessionRuntime(session).release();
    });

    it("uses weighted probabilities when sampling and rejects malformed models before generation/publication", async () => {
        const game = weightedGame();
        const {library} = await api.generateSampledWeightedOutcomeLibrary({libraryId: "sampled", game, pokieVersion: "1", sampled: {sampleSize: BigInt(5000), seed: "weighted-sample"}});
        const analysis = new api.WeightedOutcomeLibraryAnalyzer().analyze(library);
        expect(Math.abs(analysis.rtp - 1)).toBeLessThan(0.06);
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "weighted-preflight-"));
        try {
            const invalid = {...weightedBlueprint, reelStrips: [["A"], ["A"]]};
            const target = path.join(directory, "invalid");
            expect(() => new api.GamePackageGenerator("1").generate(invalid, directory, target)).toThrow("exactly one reel source");
            expect(fs.existsSync(target)).toBe(false);
            for (const rows of [0, -1, 1.5]) {
                expect(() => new api.GamePackageGenerator("1").generate({...weightedBlueprint, rows}, directory, target)).toThrow("rows must be a positive integer");
                expect(fs.existsSync(target)).toBe(false);
            }
            const source = path.join(directory, "weighted.blueprint.json");
            fs.writeFileSync(source, JSON.stringify(weightedBlueprint));
            const planner = new api.ArtifactConversionPlanner();
            const project: api.PokieProject = {type: "blueprint", rootPath: source, capabilities: api.PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "Blueprint fields"};
            expect(planner.plan(project, "parWorkbook").status).not.toBe("unavailable");
            expect(planner.plan(project, "wasm").status).not.toBe("unavailable");
            const unsupported = path.join(directory, "unsupported");
            await expect(new api.WasmArtifactBuilder("1").build(project, path.join(unsupported, "game.pokie.wasm"))).resolves.toMatchObject({outputPath: path.join(unsupported, "game.pokie.wasm")});
            const issues = await new api.ParSheetExporter("1").exportToFile(weightedBlueprint, path.join(directory, "game.xlsx"));
            expect(issues.filter(issue => issue.severity === "error")).toEqual([]);
            expect(fs.existsSync(path.join(unsupported, "game.pokie.wasm"))).toBe(true);
            fs.writeFileSync(source, JSON.stringify(invalid));
            expect(() => api.loadGameBlueprint(source)).toThrow("reelSequences");
            expect(api.loadGameBlueprint(source, {preserveInvalidAuthoredContent: true})).toEqual(invalid);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
        const config = weightedConfig(),
            calls: number[] = [];
        config.setReelsNumber(3);
        expect(() => new api.SymbolsCombinationsGenerator(config, {getRandomInt: (_min, max) => {
            calls.push(max);
            return 0;
        }}).generateSymbolsCombination()).toThrow("one definition per reel");
        expect(calls).toEqual([]);
        config.setReelsNumber(2);
        config.setReelsSymbolsNumber(0);
        expect(() => new api.SymbolsCombinationsGenerator(config, {getRandomInt: (_min, max) => {
            calls.push(max);
            return 0;
        }}).generateSymbolsCombination()).toThrow("generated rows");
        expect(calls).toEqual([]);
    });

    it("rejects unsupported alternate/custom generators and literal-only conversions before draws/output", () => {
        const config = weightedConfig(),
            calls: number[] = [],
            rng = {getRandomInt: (_min: number, max: number) => {
                calls.push(max);
                return 0;
            }};
        expect(() => new api.ResizableSymbolsCombinationsGenerator(config, [1, 1], rng).generateSymbolsCombination()).toThrow("weighted whole sequences");
        expect(() => new api.VariableHeightSymbolsCombinationsGenerator(config, [new api.SymbolsSequence<number>().fromArray([1]), new api.SymbolsSequence<number>().fromArray([1])], rng).generateSymbolsCombination()).toThrow("weighted whole sequences");
        expect(calls).toEqual([]);
        expect(api.prepareBlueprintForParSheetExport(weightedBlueprint).blueprint?.reelSequences).toEqual(weightedBlueprint.reelSequences);
        expect(api.resolveCanonicalWasmGameModel(weightedBlueprint).features?.blueprint.reelSequences).toEqual(weightedBlueprint.reelSequences);
        expect(api.buildGameModelReels(weightedBlueprint).reels[0]).toMatchObject({source: "weighted", weightedVariants: variants.map((v, i) => ({...v, id: i ? "all-B" : "all-A"}))});
    });
});

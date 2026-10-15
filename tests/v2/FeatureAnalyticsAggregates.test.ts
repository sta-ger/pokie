import fs from "node:fs";
import path from "node:path";
import {Worker} from "node:worker_threads";
import {pathToFileURL} from "node:url";
import * as api from "../../src/index.js";
import {analyticsEnvelope, type FeatureAnalyticsObservation} from "../../src/simulation/FeatureAnalytics.js";
import {runChunkedSimulation} from "../../src/simulation/parallel/internal/runChunkedSimulation.js";
import {boundedBlueprint} from "./fixtures/BoundedMechanicsGame.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";
import {generatedMechanicsGame, mechanicsSession, existingMechanicsBlueprint} from "./fixtures/ExistingMechanicsGame.js";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";

const envelope = analyticsEnvelope("known-answer", true, true);
const component = (amount: number, type = "line", id = "L", symbol: string | null = "A", partition: "base" | "feature" | "jackpot" = "base") => ({
    amount,
    type,
    id,
    symbol,
    partition,
});
const observation = (overrides: Partial<FeatureAnalyticsObservation> = {}): FeatureAnalyticsObservation => ({
    envelope,
    source: "one",
    logicalEntry: true,
    logicalCompletion: true,
    carriedSubround: false,
    cascadeSteps: 0,
    mode: "base",
    components: [],
    features: [],
    ...overrides,
});
const corpus: Array<[number, number, FeatureAnalyticsObservation]> = [
    [
        8,
        6,
        observation({
            logicalCompletion: false,
            components: [component(2), component(2, "scatter", "S", "S"), component(2, "jackpot", "mini", null, "jackpot")],
            features: [{feature: "freeGames", entry: true, granted: 2}],
        }),
    ],
    [
        0,
        4,
        observation({
            logicalEntry: false,
            logicalCompletion: false,
            cascadeSteps: 3,
            components: [component(2, "line", "L", "A", "feature"), component(2, "line", "L", "A", "feature")],
            features: [{feature: "freeGames", retrigger: true, granted: 1}],
        }),
    ],
    [0, 0, observation({logicalEntry: false, features: [{feature: "freeGames", completion: {duration: 2, win: 4}}]})],
    [
        8,
        10,
        observation({
            mode: "buy",
            components: [component(10, "value", "bonus", "bonus", "feature")],
            features: [{feature: "weightedBonus", entry: true, completion: {duration: 0, win: 10}}],
        }),
    ],
    [
        8,
        10,
        observation({
            components: [component(10), component(0, "value", "bonus", "bonus", "feature")],
            features: [{feature: "weightedBonus", entry: true, completion: {duration: 0, win: 0}}],
        }),
    ],
];
function aggregate(rows = corpus) {
    const a = new api.SimulationAccumulator();
    for (const row of rows) a.addRound(...row);
    return a;
}
const ratio = (numerator: number, denominator: number, value: number) => ({numerator, denominator, value});

describe("V2C-16 feature analytics", () => {
    it("known answers retain every numerator, denominator, distribution and conserved attribution", () => {
        const a = aggregate().getStatistics().analytics!;
        expect(a).toMatchObject({
            subrounds: 5,
            paidEntries: 3,
            logicalEntries: 3,
            logicalCompletions: 3,
            cascadeSteps: 3,
            totalStake: 24,
            totalWin: 30,
            deadSpins: 1,
            maxWin: 10,
            maxWinCount: 2,
            partition: {base: 14, feature: 14, jackpot: 2, unavailable: 0},
            topWins: [10, 10, 6, 4],
            betModes: {base: 20, buy: 10},
        });
        expect(a.lifecycle.freeGames).toEqual({
            entryPerPaidRound: ratio(1, 3, 1 / 3),
            entryPerLogicalRound: ratio(1, 3, 1 / 3),
            retriggerPerEntry: ratio(1, 1, 1),
            averageDuration: ratio(2, 1, 2),
            averageWin: ratio(4, 1, 4),
            incomplete: 0,
            carriedCompletions: 0,
            carriedIncomplete: 0,
        });
        expect(a.features.freeGames).toEqual({
            entries: 1,
            entrySubrounds: 0,
            retriggers: 1,
            grants: 3,
            completions: 1,
            excludedCompletions: 0,
            durationSum: 2,
            winSum: 4,
            durationHistogram: [0, 1, 0, 0],
            winHistogram: [0, 1, 0, 0],
        });
        expect(a.features.weightedBonus).toMatchObject({
            entries: 2,
            completions: 2,
            durationSum: 0,
            winSum: 10,
            durationHistogram: [2, 0, 0, 0],
            winHistogram: [1, 0, 1, 0],
        });
        expect(a.lifecycle.weightedBonus.averageWin).toEqual(ratio(10, 2, 5));
        expect(a.hitRates).toEqual({
            symbol: {A: ratio(3, 5, 0.6), S: ratio(1, 5, 0.2), bonus: ratio(2, 5, 0.4)},
            line: {L: ratio(3, 5, 0.6)},
            scatter: {S: ratio(1, 5, 0.2)},
        });
        expect(a.components[JSON.stringify(["line", "L", "A"])]).toMatchObject({samples: 3, occurrences: 4, amount: 16});
        expect(a.deadSpinRate).toEqual(ratio(1, 5, 0.2));
        expect(a.maxWinRate).toEqual(ratio(2, 5, 0.4));
        expect(a.maxWinContribution).toEqual(ratio(20, 30, 2 / 3));
        expect(a.topWinContribution).toEqual(ratio(30, 30, 1));
        expect(a.contribution.feature).toEqual({rtp: ratio(14, 24, 14 / 24), payoutShare: ratio(14, 30, 14 / 30)});
        expect(a.contribution.base.rtp).toEqual(ratio(14, 24, 14 / 24));
        expect(a.contribution.jackpot.payoutShare).toEqual(ratio(2, 30, 2 / 30));
        expect(a.betModeContribution.buy).toEqual({rtp: ratio(10, 24, 10 / 24), payoutShare: ratio(10, 30, 1 / 3)});
    });
    it("identical corpus partitions, reversed order, empty shares and JSON round trips merge exact counts and money", () => {
        const expected = aggregate().getStatistics().analytics;
        for (const rows of [
            [corpus.slice(0, 1), [], corpus.slice(1, 4), corpus.slice(4)],
            [corpus.slice(4), corpus.slice(1, 4), [], corpus.slice(0, 1)],
        ]) {
            const merged = new api.SimulationStatisticsMerger().merge(
                rows.map((part) => ({accumulator: JSON.parse(JSON.stringify(aggregate(part).toSnapshot()))})),
            ).statistics;
            expect(merged.analytics).toEqual(expected);
        }
        const independent = aggregate(corpus.slice(0, 1));
        const tail = corpus.slice(1, 3).map(([b, w, o]): (typeof corpus)[number] => [b, w, {...o, source: "another-worker"}]);
        independent.merge(aggregate(tail));
        expect(independent.getStatistics().analytics!.lifecycle.freeGames).toMatchObject({incomplete: 1, carriedCompletions: 1});
    });
    it.each([0.05, 7.5, 1e-7, 0])("retains actual fractional/zero stake %s, zero payouts and no-entry finite conventions", (stake) => {
        const a = new api.SimulationAccumulator();
        a.configureAnalytics(envelope);
        a.addRound(stake, 0, observation());
        const stats = a.getStatistics().analytics!;
        expect(stats.totalStake).toBe(stake);
        expect(stats.features.freeGames.entries).toBe(0);
        expect(stats.deadSpinRate).toEqual(ratio(1, 1, 1));
        expect(stats.lifecycle.freeGames.averageWin).toEqual(ratio(0, 0, 0));
        expect(JSON.stringify(stats)).not.toMatch(/null/);
        // all numbers remain finite; model/symbol fields here are non-null
    });
    it("rejects malformed input and incompatible/missing provenance before accumulator mutation", () => {
        const a = aggregate(),
            before = a.toSnapshot();
        for (const patch of [
            {components: [component(NaN)]},
            {cascadeSteps: -1},
            {features: [{feature: "freeGames" as const, entry: true, retrigger: true}]},
            {features: [{feature: "respins" as const, completion: {duration: -1, win: 0}}]},
        ]) {
            expect(() => a.addRound(1, 0, observation(patch))).toThrow();
            expect(a.toSnapshot()).toEqual(before);
        }
        expect(() => a.addRound(1, 0, observation({features: [{feature: "freeGames", entry: "yes"} as unknown as api.AnalyticsFeatureEvent]}))).toThrow(
            /analytics/,
        );
        expect(a.toSnapshot()).toEqual(before);
        const reserved = aggregate([[1, 0, observation({source: "__proto__", features: [{feature: "freeGames", entry: true}]})]]).toSnapshot();
        expect(Object.keys(reserved.analytics!.sources)).toEqual(["__proto__"]);
        expect(api.SimulationAccumulator.fromSnapshot(JSON.parse(JSON.stringify(reserved))).getStatistics().analytics!.features.freeGames.entries).toBe(1);
        for (const patch of [{modelId: "other"}, {modelId: null}, {schemaVersion: 2}, {policy: "different"}]) {
            const snapshot = aggregate().toSnapshot();
            Object.assign(snapshot.analytics!.envelope, patch);
            expect(() => a.merge(api.SimulationAccumulator.fromSnapshot(snapshot))).toThrow(/analytics/i);
            expect(a.toSnapshot()).toEqual(before);
        }
        const sparse = aggregate().toSnapshot();
        Reflect.deleteProperty(sparse.analytics!.topWins, "1");
        expect(() => api.SimulationAccumulator.fromSnapshot(sparse)).toThrow(/analytics/);
        for (const corrupt of [
            (s: api.FeatureAnalyticsSnapshot) => s.features.freeGames.completions++,
            (s: api.FeatureAnalyticsSnapshot) => s.partition.base++,
            (s: api.FeatureAnalyticsSnapshot) => (s.deadSpins = Infinity),
        ]) {
            const snapshot = aggregate().toSnapshot();
            corrupt(snapshot.analytics!);
            expect(() => api.SimulationAccumulator.fromSnapshot(snapshot)).toThrow(/analytics/i);
        }
    });
    it("long deterministic accumulation retains fixed cardinalities, exact maxima and bounded top ties", () => {
        const a = new api.SimulationAccumulator();
        let cardinalities: number[] = [];
        for (let i = 0; i < 20000; i++) {
            a.addRound(...corpus[i % corpus.length]);
            if (i === 99 || i === 19999) {
                const s = a.toSnapshot().analytics!;
                const sizes = [
                    s.topWins.length,
                    Object.keys(s.components).length,
                    Object.keys(s.sources).length,
                    Object.keys(s.betModes).length,
                    ...Object.values(s.features).map((f) => f.winHistogram.length),
                ];
                if (i === 99) cardinalities = sizes;
                else expect(sizes).toEqual(cardinalities);
            }
        }
        const s = a.getStatistics().analytics!;
        expect(s.maxWinCount).toBe(8000);
        expect(s.topWins).toEqual(Array(10).fill(10));
        expect(s.topWinContribution).toEqual(ratio(100, 120000, 100 / 120000));
    });
    it("real supported compositions use canonical components once, preserve chunk crossings and unfinished tails", async () => {
        const blueprint = weightedBonusBlueprint();
        blueprint.availableBets = [1];
        blueprint.mechanics!.weightedBonus!.outcomes = [{id: "only", weight: 1, targetId: "bonus-respins", payout: 8, payoutUnits: "currency", duration: 2}];
        const game = generatedMechanicsGame(blueprint);
        const make = () => {
            const s = game.createSession({seed: "same"});
            s.setCreditsAmount(100000);
            return s;
        };
        const direct = new api.AggregateSimulationRunner(make(), 8).run().getStatistics();
        const chunked = (await runChunkedSimulation(make(), 8, 1)).accumulator.getStatistics();
        expect(chunked.analytics).toEqual(direct.analytics);
        expect(direct.analytics).toMatchObject({
            subrounds: 8,
            paidEntries: 3,
            logicalEntries: 3,
            logicalCompletions: 2,
            totalStake: 3,
            totalWin: 40,
            partition: {base: 6, feature: 34, jackpot: 0},
        });
        expect(direct.analytics!.features.weightedBonus).toMatchObject({entries: 3, completions: 2, durationSum: 4, winSum: 24});
        expect(direct.analytics!.lifecycle.weightedBonus.incomplete).toBe(1);
        const middleSession = make();
        new api.AggregateSimulationRunner(middleSession, 1).run();
        const middle = new api.AggregateSimulationRunner(middleSession, 1).run().getStatistics().analytics!;
        expect(middle.lifecycle.weightedBonus).toMatchObject({incomplete: 1, carriedIncomplete: 1});
        const source = make();
        new api.AggregateSimulationRunner(source, 1).run();
        const restored = make() as api.BoundedVideoSlotSession;
        restored.fromSessionState((source as api.BoundedVideoSlotSession).toSessionState());
        const tail = new api.AggregateSimulationRunner(restored, 2).run().getStatistics().analytics!;
        expect(tail.features.weightedBonus).toMatchObject({entries: 0, completions: 0, excludedCompletions: 1});
        const restoredPending = make() as api.BoundedVideoSlotSession;
        restoredPending.fromSessionState((source as api.BoundedVideoSlotSession).toSessionState());
        const pending = new api.AggregateSimulationRunner(restoredPending, 1).run().getStatistics().analytics!;
        expect(pending.lifecycle.weightedBonus.carriedIncomplete).toBe(1);
        expect(tail.logicalCompletions).toBe(0);
        expect(tail.carriedSubrounds).toBe(2);
        for (const row of api.AUTHORED_MECHANIC_CATALOG.filter((row) => row.progression === "freeGames" || row.progression === "holdAndWin")) {
            const composed = generatedMechanicsGame(existingMechanicsBlueprint(row));
            const statistics = new api.AggregateSimulationRunner(mechanicsSession(composed), 30).run().getStatistics();
            const analytics = statistics.analytics!;
            expect(Object.values(analytics.partition).reduce((a, b) => a + b, 0)).toBeCloseTo(statistics.totalPayout, 10);
            expect(analytics.envelope.lifecycle).toBe(true);
        }
    });
    it("long exhausted cascade runs compact logical ranges, retaining truthful incomplete observations", () => {
        const config = new api.VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableSymbols(["A"]);
        config.setWildSymbols([]);
        config.setScatterSymbols([]);
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setSymbolsSequences(Array.from({length: 3}, () => new api.SymbolsSequence().fromArray(["A"])));
        const paytable = new api.Paytable<string>([1]);
        paytable.setPayoutForSymbol("A", 3, 2);
        config.setPaytable(paytable);
        const calculator = new api.VideoSlotWinCalculator(config);
        class ExhaustedSession extends api.AbstractVideoSlotSessionDecorator implements api.CascadeResultProviding {
            private result = new api.CascadeResult<string>([["A"], ["A"], ["A"]], [["A"], ["A"], ["A"]], []);
            public getCascadeResult() {
                return this.result;
            }
            public override getWinEvaluationResult() {
                return new api.WinEvaluationResult({
                    winComponents: this.result.getCascadeSteps().flatMap((step) => step.getWinEvaluationResult().getWinComponents()),
                });
            }
            public override getWinAmount() {
                return this.getWinEvaluationResult().getTotalWin();
            }
            public override play() {
                this.baseSession.play();
                this.result = new api.CascadingSpinResolver(
                    calculator.getWinEvaluationPipeline(),
                    config,
                    {getRefillSymbols: () => [["A"], ["A"], ["A"]]},
                    undefined,
                    {maxCascadeSteps: 1, onMaxCascadeStepsExceeded: "stop"},
                ).resolve([["A"], ["A"], ["A"]], 1);
            }
        }
        const session = new ExhaustedSession(
            new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(1))),
        );
        session.setCreditsAmount(100000);
        const a = new api.AggregateSimulationRunner(session, 2000).run();
        const snapshot = a.toSnapshot();
        expect(snapshot.logicalSamplingRanges![0].observed).toEqual([]);
        expect(snapshot.logicalSamplingRanges![0].completed).toEqual([]);
        expect(a.getStatistics().logicalSampling).toEqual({carriedSubrounds: 0, excludedSubrounds: 2000});
        expect(a.getStatistics().analytics!.features.cascade).toMatchObject({entries: 2000, completions: 0});
    });
    it("emitted real workers match exact-request oracle and carry analytics through package exports", async () => {
        const runtime = emitPublicRuntime();
        try {
            const blueprint = weightedBonusBlueprint();
            blueprint.availableBets = [1];
            const game = generatedMechanicsGame(blueprint),
                root = path.join(runtime.directory, "analytics-game");
            fs.mkdirSync(root);
            fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "analytics-game", version: "1.0.0", pokie: {entry: "./index.cjs"}}));
            fs.writeFileSync(path.join(root, "index.cjs"), api.renderBuiltGameModule(blueprint, "1.3.0"));
            const workerEntryUrl = pathToFileURL(
                path.join(runtime.directory, "node_modules/@fromstan/pokie/dist/esm/simulation/parallel/internal/simulationWorkerEntry.js"),
            );
            const requests = [0, 1].map((workerIndex) => ({
                workerIndex,
                totalWorkers: 2,
                packageRoot: root,
                rounds: workerIndex ? 8 : 11,
                seed: api.WorkerSeedStrategy.deriveSeed("oracle", workerIndex, 2),
                progressChunkSize: 2,
            }));
            const results = await new api.SimulationWorkerCoordinator(workerEntryUrl).run(requests);
            const oracles = requests.map((request) => {
                const session = game.createSession({seed: request.seed});
                session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
                api.setSimulationModelIdentity(session, game.getConfigHash?.());
                return {accumulator: new api.AggregateSimulationRunner(session, request.rounds).run().toSnapshot()};
            });
            const merged = new api.SimulationStatisticsMerger().merge(results).statistics.analytics!;
            expect(merged).toEqual(new api.SimulationStatisticsMerger().merge(oracles).statistics.analytics);
            expect(merged.envelope.modelId).toBe(game.getConfigHash!());
            const original = game.createSession({seed: "oracle"});
            original.setCreditsAmount(Number.MAX_SAFE_INTEGER);
            api.setSimulationModelIdentity(original, game.getConfigHash?.());
            const sequential = new api.AggregateSimulationRunner(original, 19).run().getStatistics();
            const singleWorker = await new api.ParallelSimulationRunner(root, 19, {
                seed: "oracle",
                workers: 1,
                chunkSize: 2,
                loadGame: () => Promise.resolve(game),
            }).run();
            expect(singleWorker.statistics.analytics).toEqual(sequential.analytics);
            const workers: Worker[] = [];
            const createCoordinator = (entry: URL) =>
                new api.SimulationWorkerCoordinator(entry, (request) => {
                    const worker = new Worker(entry, {workerData: request});
                    workers.push(worker);
                    return worker;
                });
            const different = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
            different.paytable.C[3] = 3;
            const otherRoot = path.join(runtime.directory, "other-model");
            fs.mkdirSync(otherRoot);
            fs.writeFileSync(path.join(otherRoot, "package.json"), JSON.stringify({name: "other-model", version: "1.0.0", pokie: {entry: "./index.cjs"}}));
            fs.writeFileSync(path.join(otherRoot, "index.cjs"), api.renderBuiltGameModule(different, "1.3.0"));
            await expect(
                createCoordinator(workerEntryUrl).run(requests.map((request, index) => ({...request, packageRoot: index ? otherRoot : root}))),
            ).rejects.toThrow(/analytics.*provenance/);
            expect(workers.every((worker) => worker.threadId === -1)).toBe(true);
            const incompatibleEntry = path.join(runtime.directory, "incompatible-schema.mjs");
            fs.writeFileSync(
                incompatibleEntry,
                `import {parentPort, workerData} from "node:worker_threads";
const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = message => { if (workerData.workerIndex === 1 && message.accumulator?.analytics) message.accumulator.analytics.envelope.schemaVersion = 99; post(message); };
await import(${JSON.stringify(workerEntryUrl.href)});`,
            );
            await expect(createCoordinator(pathToFileURL(incompatibleEntry)).run(requests)).rejects.toThrow(/analytics.*schema/);
            expect(workers.every((worker) => worker.threadId === -1)).toBe(true);

            for (const patch of [{modelId: "wrong-model"}, {schemaVersion: 99}]) {
                const incompatible = JSON.parse(JSON.stringify(results));
                Object.assign(incompatible[1].accumulator.analytics.envelope, patch);
                expect(() => new api.SimulationStatisticsMerger().merge(incompatible)).toThrow(/analytics/i);
            }
        } finally {
            runtime.dispose();
        }
    }, 120000);
});

it("natural retriggers retain one entry and bounded active state for a long unfinished feature", async () => {
    const blueprint = existingMechanicsBlueprint(api.AUTHORED_MECHANIC_CATALOG.find((row) => row.id === "free-games")!);
    blueprint.availableBets = [1];
    blueprint.reelStrips = [["S"], ["S"], ["S"]];
    blueprint.paytable = {S: {3: 0}};
    const session = generatedMechanicsGame(blueprint).createSession({seed: "retrigger"});
    session.setCreditsAmount(10000);
    const result = await runChunkedSimulation(session, 3000, 17);
    const snapshot = result.accumulator.toSnapshot();
    expect(snapshot.analytics!.features.freeGames).toMatchObject({entries: 1, retriggers: 2999, grants: 6000, completions: 0});
    expect(result.accumulator.getStatistics().analytics!.lifecycle.freeGames.incomplete).toBe(1);
    expect(snapshot.logicalSamplingRanges![0].observed).toHaveLength(1);
    expect(Object.keys(snapshot.analytics!.sources)).toHaveLength(1);
    expect(snapshot.analytics!.topWins).toEqual([]);
    expect(snapshot.analytics!.maxWinCount).toBe(3000);
});

it("supported collection/respin/cascade and modifier contracts conserve money at the observer boundary", () => {
    for (const id of api.AUTHORED_BOUNDED_MECHANIC_CATALOG) {
        const blueprint: api.GameBlueprint = JSON.parse(
            fs.readFileSync(path.join(__dirname, `../../examples/blueprints/bounded-${id}.blueprint.json`), "utf8"),
        );
        const stats = new api.AggregateSimulationRunner(mechanicsSession(generatedMechanicsGame(blueprint)), 20).run().getStatistics();
        expect(stats.analytics!.totalWin).toBe(stats.totalPayout);
        expect(Object.values(stats.analytics!.partition).reduce((a, b) => a + b, 0)).toBeCloseTo(stats.totalPayout, 10);
    }
    for (const id of api.AUTHORED_MODIFIER_CATALOG) {
        const blueprint: api.GameBlueprint = JSON.parse(fs.readFileSync(path.join(__dirname, `../../examples/blueprints/wild-${id}.blueprint.json`), "utf8"));
        const stats = new api.AggregateSimulationRunner(mechanicsSession(generatedMechanicsGame(blueprint)), 20).run().getStatistics();
        expect(stats.analytics!.envelope.supportedFeatures).toContain("modifiers");
        expect(stats.analytics!.totalWin).toBe(stats.totalPayout);
    }
});

it("purchase entries count the executed first free spin and never add released free banks twice", () => {
    const blueprint = existingMechanicsBlueprint(api.AUTHORED_MECHANIC_CATALOG.find((row) => row.id === "modes")!);
    blueprint.availableBets = [1];
    blueprint.reelStrips = [["A"], ["A"], ["A"]];
    blueprint.paytable = {A: {3: 2}};
    const session = generatedMechanicsGame(blueprint).createSession({seed: "purchase"});
    session.setCreditsAmount(10000);
    const runner = new api.AggregateSimulationRunner(session, 2, undefined, undefined, new api.FixedBetModeForNextSimulationRoundSetting("buy"));
    const stats = runner.run().getStatistics().analytics!;
    expect(stats).toMatchObject({
        paidEntries: 1,
        logicalEntries: 1,
        logicalCompletions: 1,
        totalStake: 10,
        totalWin: 4,
        partition: {base: 0, feature: 4, jackpot: 0},
    });
    expect(stats.features.freeGames).toMatchObject({entries: 1, entrySubrounds: 1, completions: 1, durationSum: 2, winSum: 4, grants: 2});
    expect(stats.betModes.buy).toBe(4);
});

it("keeps raw fractional totals and makes no arbitrary floating-point associativity claim", () => {
    const rows = [0.1, 0.2, 0.3].map((n) => [n, n, observation({components: [component(n)]})] as (typeof corpus)[number]);
    const sequential = aggregate(rows).getStatistics().analytics!;
    const split = new api.SimulationStatisticsMerger().merge([rows.slice(0, 1), rows.slice(1)].map((part) => ({accumulator: aggregate(part).toSnapshot()})))
        .statistics.analytics!;
    expect(sequential.totalStake).toBe(0.6000000000000001);
    expect(split.totalStake).toBe(0.6);
    expect(sequential.totalStake).not.toBe(split.totalStake);
    expect(split.subrounds).toBe(sequential.subrounds);
});

it("nested collection and respin lifecycle totals overlap while canonical payouts remain additive", () => {
    const blueprint = boundedBlueprint("respins-collection");
    blueprint.reelStrips = [["C"], ["C"], ["C"]];
    const statistics = new api.AggregateSimulationRunner(mechanicsSession(generatedMechanicsGame(blueprint)), 9).run().getStatistics();
    const a = statistics.analytics!;
    expect(a).toMatchObject({subrounds: 9, paidEntries: 1, logicalEntries: 1, logicalCompletions: 1, totalStake: 0.05, totalWin: 60, partition: {base: 0, feature: 60, jackpot: 0, unavailable: 0}});
    expect(a.features.respins).toMatchObject({entries: 1, retriggers: 6, grants: 8, completions: 1, durationSum: 8, winSum: 60});
    expect(a.features.collection).toMatchObject({entries: 6, completions: 6, durationSum: 0, winSum: 60, durationHistogram: [6, 0, 0, 0], winHistogram: [0, 0, 6, 0]});
    expect(a.lifecycle.respins.averageDuration).toEqual(ratio(8, 1, 8));
    expect(a.lifecycle.collection.averageWin).toEqual(ratio(60, 6, 10));
    expect(a.hitRates.symbol.C).toEqual(ratio(6, 9, 2 / 3));
    expect(a.deadSpinRate).toEqual(ratio(3, 9, 1 / 3));
});

it("instant Hold&Win completion separates granted respins from executed duration and attributes its components once", () => {
    const blueprint = existingMechanicsBlueprint(api.AUTHORED_MECHANIC_CATALOG.find(row => row.id === "hold-flat")!);
    blueprint.reelStrips = [["C"], ["C"], ["C"]];
    const a = new api.AggregateSimulationRunner(mechanicsSession(generatedMechanicsGame(blueprint)), 1).run().getStatistics().analytics!;
    expect(a.features.holdAndWin).toMatchObject({entries: 1, grants: 2, completions: 1, durationSum: 0, winSum: 6, durationHistogram: [1, 0, 0, 0], winHistogram: [0, 1, 0, 0]});
    expect(a.partition).toEqual({base: 0, feature: 6, jackpot: 0, unavailable: 0});
    expect(a.hitRates.symbol.C).toEqual(ratio(1, 1, 1));
    expect(Object.values(a.components)[0]).toMatchObject({samples: 1, occurrences: 3, amount: 6});
});

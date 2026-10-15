import ts from "typescript";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import {setTransactionBoundaryHook} from "../../src/server/storage/internal/transactionBoundary.js";
import {ControllableDurableWallet} from "../server/wallet/fixtures/ControllableDurableWallet.js";
import {pathToFileURL} from "node:url";
import {Worker} from "node:worker_threads";
import path from "node:path";
import {execFileSync} from "node:child_process";
import * as api from "../../src/index.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";
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

function boundedSession(game: api.PokieGame, seed: string | number = 31) {
    return mechanicsSession(game, seed) as api.BoundedVideoSlotSession;
}
function played(result: api.SessionCommandResult) {
    if (result.status !== "played") throw new Error(JSON.stringify(result));
    return result;
}
function direct(blueprint = weightedBonusBlueprint(), seed = 31) {
    const config = new api.VideoSlotConfig();
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(blueprint.symbols);
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setAvailableBets(blueprint.availableBets!);
    config.setSymbolsSequences(
        blueprint.reelStrips!.map((strip) => new api.SymbolsSequence<string>().fromArray(strip)),
    );
    const paytable = new api.Paytable<string>(blueprint.availableBets!);
    paytable.setPayoutForSymbol("C", 3, 2);
    config.setPaytable(paytable);
    const rng = new api.SeededRandomNumberGenerator(seed),
        generator = new api.SymbolsCombinationsGenerator(config, rng);
    return {config, rng, generator, session: new api.BoundedVideoSlotSession(config, generator, blueprint.mechanics!)};
}

describe("V2C-15 weighted bonus authoring", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c15-"));
    });
    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));
    it("weighted-bonus: catalogue surface rejection boundaries", async () => {
        await assertWorkflowRejections(weightedBonusBlueprint(), directory);
    });

    it.each([
        ["missing-weight", "outcomes.0.weight", undefined],
        ["string-weight", "outcomes.0.weight", "1"],
        ["nan-weight", "outcomes.0.weight", NaN],
        ["infinite-weight", "outcomes.0.weight", Infinity],
        ["negative-weight", "outcomes.0.weight", -1],
        ["fractional-weight", "outcomes.0.weight", 0.1],
        ["unsafe-weight", "outcomes.0.weight", Number.MAX_SAFE_INTEGER],
        ["zero-total", "outcomes", []],
        ["missing-id", "id", undefined],
        ["blank-id", "id", " "],
        ["uppercase-id", "id", "Prizes"],
        ["whitespace-id", "id", "prizes "],
        ["reserved-id", "id", "constructor"],
        ["proto-id", "id", "__proto__"],
        ["tojson-id", "id", "toJSON"],
        ["duplicate-id", "outcomes.1.id", "small"],
        ["unknown-target", "outcomes.0.targetId", "absent"],
        ["unknown-feature", "feature.type", "freeGames"],
        ["bad-context", "context", "every-spin"],
        ["unknown-field", "callback", "execute"],
        ["negative-payout", "outcomes.0.payout", -1],
        ["infinite-payout", "outcomes.0.payout", Infinity],
        ["bad-units", "outcomes.0.payoutUnits", "coins"],
        ["fractional-duration", "outcomes.0.duration", 0.5],
        ["long-duration", "outcomes.0.duration", 3],
        ["bad-limit", "feature.maxDuration", 91],
        ["malformed-table", "outcomes.0", null],
        ["missing-outcomes", "outcomes", undefined],
    ])(
        "negative %s fails validation, rendering, construction and publication before mutation",
        async (_id, field, value) => {
            const blueprint = weightedBonusBlueprint();
            const table = blueprint.mechanics!.weightedBonus! as unknown as Record<string, unknown>;
            const keys = (field as string).split(".");
            let cursor = table;
            for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
            if (value === undefined) Reflect.deleteProperty(cursor, keys[keys.length - 1]);
            else cursor[keys[keys.length - 1]] = value;
            expect(api.validateWeightedBonus(table, blueprint.symbols, 3).length).toBeGreaterThan(0);
            const issues = new api.GameBlueprintValidator()
                .validate(blueprint)
                .filter((issue) => issue.severity === "error");
            expect(issues).toContainEqual(
                expect.objectContaining({
                    code: expect.stringMatching(/^weighted-bonus-/),
                    path: expect.stringMatching(/^mechanics.weightedBonus/),
                }),
            );
            const {config, generator, rng} = direct();
            const before = rng.toSessionState();
            expect(() => new api.BoundedVideoSlotSession(config, generator, blueprint.mechanics!)).toThrow(
                /mechanics.weightedBonus/,
            );
            expect(rng.toSessionState()).toBe(before);
            expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(/mechanics.weightedBonus/);
            expect(() => api.renderBuiltGameModuleSource(blueprint, "1.3.0")).toThrow(/mechanics.weightedBonus/);
            const studio = new StudioBlueprintService("1.3.0", directory, new StudioHomeService("1.3.0"));
            expect(studio.validate(blueprint).status).toBe("invalid");
            expect(studio.previewBuild(blueprint, path.join(directory, "studio-invalid")).status).toBe("invalid");
            expect((await studio.build(blueprint, path.join(directory, "studio-invalid"))).status).toBe("invalid");
            expect(fs.existsSync(path.join(directory, "studio-invalid"))).toBe(false);
            const destination = path.join(directory, "invalid");
            expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, destination)).toThrow(
                /mechanics.weightedBonus/,
            );
            expect(fs.existsSync(destination)).toBe(false);
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "keep"), "original");
            expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, destination)).toThrow();
            expect(fs.readFileSync(path.join(destination, "keep"), "utf8")).toBe("original");
            fs.rmSync(destination, {recursive: true});
            expect(() =>
                new api.GamePackageGenerator("1.3.0").generate(weightedBonusBlueprint(), directory, destination),
            ).not.toThrow();
        },
    );

    it.each(["all-zero", "total-overflow", "duplicate-effect", "unknown-trigger", "unknown-outcome-field", "empty"])(
        "rejects %s before an RNG draw",
        (kind) => {
            const blueprint = weightedBonusBlueprint(),
                table = blueprint.mechanics!.weightedBonus!;
            if (kind === "all-zero") for (const outcome of table.outcomes) outcome.weight = 0;
            if (kind === "total-overflow") table.outcomes[0].weight = 0x100000000;
            if (kind === "duplicate-effect") table.outcomes.push({...table.outcomes[0], id: "copy"});
            if (kind === "unknown-trigger") table.trigger.symbolId = "missing";
            if (kind === "unknown-outcome-field") Reflect.set(table.outcomes[0], "callback", "opaque");
            if (kind === "empty") table.outcomes = [];
            expect(
                new api.GameBlueprintValidator().validate(blueprint).some((issue) => issue.severity === "error"),
            ).toBe(true);
            const {config, generator, rng} = direct();
            const before = rng.toSessionState();
            expect(() => new api.BoundedVideoSlotSession(config, generator, blueprint.mechanics!)).toThrow();
            expect(rng.toSessionState()).toBe(before);
        },
    );

    it.each([
        "freeGames",
        "holdAndWin",
        "jackpot",
        "modifiers",
        "cascade",
        "respins",
        "collection",
        "betModes",
        "screenGeometry",
    ])("rejects the incompatible %s owner before construction/build", (key) => {
        const blueprint = weightedBonusBlueprint();
        if (key === "betModes") blueprint.betModes = [];
        else if (key === "screenGeometry") blueprint.screenGeometry = {
            generated: {reels: 3, rows: 1},
            visible: {rowOffset: 0, rows: 1},
            evaluated: {rowOffset: 0, rows: 1},
            paylineSpace: "evaluated",
        };
        else Reflect.set(blueprint.mechanics!, key, {});
        expect(new api.GameBlueprintValidator().validate(blueprint)).toContainEqual(
            expect.objectContaining({code: "weighted-bonus-composition"}),
        );
        expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(/weightedBonus/);
        expect(() =>
            new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, "invalid-composition"),
        ).toThrow();
        expect(fs.existsSync(path.join(directory, "invalid-composition"))).toBe(false);
    });

    it("tampered identity, context, model, duration and counters fail before nested restoration", () => {
        const game = generatedMechanicsGame(weightedBonusBlueprint());
        const session = boundedSession(game, 0);
        const first = played(
            new api.SessionRuntime(session).execute({kind: "spin", roundId: "tamper", delivery: "stepwise"}),
        );
        const state = session.toSessionState();
        for (const patch of [
            (s: api.BoundedSessionState) => {
                s.bonus!.selection!.outcomeId = "small";
            },
            (s: api.BoundedSessionState) => {
                s.bonus!.selection!.context = "logical:foreign";
            },
            (s: api.BoundedSessionState) => {
                s.bonus!.selection!.model += "changed";
            },
            (s: api.BoundedSessionState) => {
                s.bonus!.counts[2] = 1;
            },
            (s: api.BoundedSessionState) => {
                s.remaining = 1;
            },
            (s: api.BoundedSessionState) => {
                s.bonus!.completed = 1;
            },
        ]) {
            const invalid = JSON.parse(JSON.stringify(state)) as api.BoundedSessionState;
            patch(invalid);
            expect(() => session.fromSessionState(invalid)).toThrow(/bonus/i);
            expect(session.toSessionState()).toEqual(state);
        }
        const foreign = JSON.parse(JSON.stringify(first.logicalRound)) as api.LogicalRound;
        const artifact = foreign.subrounds[0].artifacts![0];
        const event = artifact.featureEvents!.find((event) => event.type === "boundedMechanics")!;
        Reflect.set((event.data!.weightedBonus as {selection: object}).selection, "outcomeId", "small");
        expect(() => new api.SessionRuntime(session, foreign)).toThrow(/bonus identity/);
        const audit = new api.ReplayRecorder().recordAudit(
            game,
            boundedSession(game, 0),
            [{kind: "spin", roundId: "audit", delivery: "composite"}],
            {status: "calculated", sessionId: "s", durability: "detached"},
            {seed: 0},
        );
        expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(audit.audit))).verification).toBe(
            "verified",
        );
        const changed = weightedBonusBlueprint();
        changed.mechanics!.weightedBonus!.outcomes[0].payout++;
        expect(() => new api.AuditRoundReplay().replay(generatedMechanicsGame(changed), audit.audit!)).toThrow();
    });

    it("coordinated duration corruption rejects direct logical restoration before another draw", () => {
        const game = generatedMechanicsGame(weightedBonusBlueprint());
        const source = boundedSession(game, 0);
        const entry = played(new api.SessionRuntime(source).execute({kind: "spin", roundId: "progress", delivery: "stepwise"}));
        const corrupt = source.toSessionState();
        expect(corrupt).toMatchObject({executed: 0, remaining: 2});
        corrupt.executed = 1;
        corrupt.remaining = 1;
        const restored = boundedSession(game, 91);
        restored.fromSessionState(corrupt);
        const before = restored.toSessionState();
        expect(() => new api.SessionRuntime(restored, entry.logicalRound)).toThrow(/bonus duration progress/);
        expect(restored.toSessionState()).toEqual(before);
    });

    it.each([false, true])("retained progress rejects fresh handlers before creation or effects; untampered retries finish two respins (explicit: %s)", async explicit => {
        const game = generatedMechanicsGame(weightedBonusBlueprint());
        const repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(10000),
            results = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>();
        await repository.save("s", api.captureInitialPokieSessionState({seed: 0}, boundedSession(game, 0), game.getSessionSerializer!(), true, game));
        const handler = () => new api.SpinCommandHandler(game, repository, wallet, results);
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "s", requestId: "entry", ...(explicit ? {roundId: "round", delivery: "stepwise" as const} : {})};
        const entry = await handler().execute(command);
        if (entry.status !== "played") throw new Error(JSON.stringify(entry));
        expect(entry).toMatchObject({stake: 0.05, win: 0.35, state: {featureState: {executed: 0, remaining: 2}}});
        const continuation = (cursor: number): api.RepositoryCommand => ({kind: "spin", sessionId: "s", requestId: `next-${cursor}`, ...(explicit ? {delivery: "stepwise", continuation: {roundId: "round", cursor}} : {})});
        for (const patch of ["progress", "identity", "missing-observation"] as const) {
            const corrupt = JSON.parse(JSON.stringify(entry.state)) as api.PokieSessionState;
            const feature = corrupt.featureState as api.BoundedSessionState;
            if (patch === "progress") {
                feature.executed = 1;
                feature.remaining = 1; 
            }
            if (patch === "identity") feature.bonus!.selection!.context = "logical:foreign";
            if (patch === "missing-observation") {
                Reflect.deleteProperty(corrupt, "roundPayload");
                Reflect.deleteProperty(corrupt, "roundArtifact");
                if (corrupt.logicalRound) Reflect.set(corrupt.logicalRound.subrounds[0].artifacts![0], "featureEvents", []);
            }
            await repository.save("s", corrupt);
            const save = jest.spyOn(repository, "save"), 
                create = jest.spyOn(game, "createSession"), 
                debit = jest.spyOn(wallet, "debit"), 
                credit = jest.spyOn(wallet, "credit");
            expect(api.validatePersistedSession(corrupt, game)).toMatchObject({status: "corrupt-state"});
            expect((await handler().execute(continuation(1))).status).toBe("corrupt-state");
            for (const spy of [save, create, debit, credit]) {
                expect(spy).not.toHaveBeenCalled();
                spy.mockRestore(); 
            }
            expect(await repository.load("s")).toEqual(corrupt);
        }
        await repository.save("s", entry.state);
        expect(await handler().execute(command)).toEqual(entry);
        let totalStake = entry.stake!, 
            totalWin = entry.win;
        for (const cursor of [1, 2]) {
            const next = await handler().execute(continuation(cursor));
            if (next.status !== "played") throw new Error(JSON.stringify(next));
            expect(next).toMatchObject({stake: 0, win: 0.1, state: {featureState: {executed: cursor, remaining: 2 - cursor}}});
            expect(await handler().execute(continuation(cursor))).toEqual(next);
            totalStake += next.stake!;
            totalWin += next.win;
            expect(api.validatePersistedSession(next.state, game)).toBeUndefined();
            if (explicit && cursor === 2) {
                expect(next.state.logicalRound).toMatchObject({cursor: 3, totalStake: 0.05});
                expect(next.state.logicalRound!.totalWin).toBeCloseTo(0.55, 12);
            }
        }
        expect(totalStake).toBe(0.05);
        expect(totalWin).toBeCloseTo(0.55, 12);
        expect(await handler().execute(command)).toEqual(entry);
    });

    it("snapshots, chunks, legacy simulation and independent workers retain eligible denominators and unfinished tails", async () => {
        const game = generatedMechanicsGame(weightedBonusBlueprint());
        const session = boundedSession(game, 0);
        const prefix = new api.AggregateSimulationRunner(session, 1).run();
        expect(prefix.getStatistics().weightedBonus).toMatchObject({selections: 1, completed: 0, incomplete: 1});
        const restored = boundedSession(game, 0);
        restored.fromSessionState(session.toSessionState());
        const tail = new api.AggregateSimulationRunner(restored, 2).run();
        expect(tail.getStatistics().weightedBonus).toMatchObject({selections: 0, completed: 1, incomplete: -1});
        prefix.merge(tail);
        expect(prefix.getStatistics().weightedBonus).toMatchObject({selections: 1, completed: 1, incomplete: 0});
        expect(
            api.SimulationAccumulator.fromSnapshot(JSON.parse(JSON.stringify(prefix.toSnapshot()))).getStatistics()
                .weightedBonus,
        ).toEqual(prefix.getStatistics().weightedBonus);
        const a = new api.AggregateSimulationRunner(boundedSession(game, 0), 18).run().getStatistics();
        expect(a.weightedBonus).toMatchObject({
            selections: 8,
            completed: 8,
            outcomes: [{count: 3, frequency: 3 / 8}, {count: 5, frequency: 5 / 8}, {count: 0}],
        });
        const b = await runChunkedSimulation(boundedSession(game, 0), 18, 2);
        expect(b.accumulator.getStatistics().weightedBonus).toEqual(a.weightedBonus);
        const config = new api.SimulationConfig();
        config.setNumberOfRounds(18);
        const legacy = new api.Simulation(boundedSession(game, 0), config);
        legacy.run();
        expect(legacy.getWeightedBonusStatistics()).toEqual(a.weightedBonus);
        const changed = {...a.weightedBonus!, model: "another-model"};
        expect(() => api.mergeWeightedBonusStatistics(a.weightedBonus, changed)).toThrow(/incompatible/);
        const report = new api.SimulationReportBuilder().build({
            manifest: game.getManifest(),
            statistics: a,
            requestedRounds: 18,
            durationMs: 1,
        });
        expect(new api.SimulationReportDiffer().diff(report, {...report, weightedBonus: changed})).toMatchObject({
            changed: true,
            weightedBonus: {configurationChanged: true},
        });
        const cancelled = new AbortController();
        await expect(
            new api.ParallelSimulationRunner(directory, 100, {
                workers: 1,
                seed: "0",
                chunkSize: 1,
                loadGame: () => Promise.resolve(game),
                signal: cancelled.signal,
                onProgress: () => cancelled.abort(),
            }).run(),
        ).rejects.toMatchObject({observedPrefix: {rounds: 1, weightedBonus: {selections: 1}}});
    });

    it.each(["atomic", "external"] as const)(
        "%s durable failure, fresh handlers and duplicates settle selection once",
        async (composition) => {
            const game = generatedMechanicsGame(weightedBonusBlueprint());
            const session = boundedSession(game, 0);
            const filename = path.join(directory, "state.sqlite");
            const provider =
                composition === "external"
                    ? await ControllableDurableWallet.open(path.join(directory, "wallet.sqlite"))
                    : undefined;
            if (provider) await provider.setBalance("s", 10000);
            const open = () =>
                provider
                    ? api.SqliteExternalRoundStore.open(filename, provider)
                    : api.SqliteTransactionalRoundStore.open(filename);
            let store = await open();
            try {
                await store.initialize(
                    "s",
                    api.captureInitialPokieSessionState({seed: 0}, session, game.getSessionSerializer!(), true, game),
                    game,
                );
                const initial = await store.readSession("s");
                const command: api.RepositoryCommand = {
                    kind: "spin",
                    sessionId: "s",
                    requestId: "entry",
                    roundId: "round",
                    delivery: "stepwise",
                    bet: 0.05,
                };
                if (provider) provider.fault = "before-credit";
                else setTransactionBoundaryHook(store, (boundary) =>
                    boundary === "before:state"
                        ? Promise.reject(new Error("persistence rejected"))
                        : Promise.resolve(),
                );
                try {
                    expect((await new api.SpinCommandHandler(game, store).execute(command)).status).not.toBe("played");
                } finally {
                    setTransactionBoundaryHook(store, () => Promise.resolve());
                    if (provider) provider.fault = undefined;
                }
                // External settlement can retain a recoverable operation; recovery must publish the
                // same calculated selection, never a second draw or wallet credit.
                if (!provider) expect(await store.readSession("s")).toEqual(initial);
                const first = await new api.SpinCommandHandler(game, store).execute(command);
                expect(first).toMatchObject({status: "played", stake: 0.05, win: 0.35});
                const prefix = await store.readSession("s");
                expect(prefix!.state.featureState).toMatchObject({
                    bonus: {counts: [0, 1, 0], completed: 0},
                    remaining: 2,
                });
                await store.close();
                store = await open();
                expect(await new api.SpinCommandHandler(game, store).execute(command)).toEqual(first);
                for (let cursor = 1; cursor <= 2; cursor++) {
                    const next: api.RepositoryCommand = {
                        kind: "spin",
                        sessionId: "s",
                        requestId: `next-${cursor}`,
                        delivery: "stepwise",
                        continuation: {roundId: "round", cursor},
                    };
                    if (cursor === 1) {
                        const committed = await store.readSession("s");
                        if (provider) provider.fault = "before-credit";
                        else setTransactionBoundaryHook(store, (boundary) =>
                            boundary === "before:state"
                                ? Promise.reject(new Error("prefix persistence rejected"))
                                : Promise.resolve(),
                        );
                        try {
                            expect((await new api.SpinCommandHandler(game, store).execute(next)).status).not.toBe(
                                "played",
                            );
                        } finally {
                            setTransactionBoundaryHook(store, () => Promise.resolve());
                            if (provider) provider.fault = undefined;
                        }
                        expect((await store.readSession("s"))!.state.featureState).toEqual(
                            committed!.state.featureState,
                        );
                    }
                    const advanced = await new api.SpinCommandHandler(game, store).execute(next);
                    expect(advanced).toMatchObject({status: "played", stake: 0, win: 0.1});
                    expect(await new api.SpinCommandHandler(game, store).execute(next)).toEqual(advanced);
                }
                expect((await store.readSession("s"))!.state.featureState).toMatchObject({
                    bonus: {counts: [0, 1, 0], completed: 1},
                    remaining: 0,
                    executed: 2,
                });
                if (provider) expect(
                    provider.transactions("s").filter((transaction) => transaction.kind === "credit"),
                ).toHaveLength(3);
                expect(await new api.SpinCommandHandler(game, store).execute(command)).toEqual(first);
            } finally {
                await store.close();
                provider?.close();
            }
        },
    );

    it("overflow rolls back selection, effects, money and RNG; retry publishes no invalid observation", () => {
        const blueprint = weightedBonusBlueprint();
        blueprint.mechanics!.weightedBonus!.outcomes[1].payout = Number.MAX_VALUE;
        const session = boundedSession(generatedMechanicsGame(blueprint), 0);
        session.setBet(7.5);
        const before = session.toSessionState(),
            credits = session.getCreditsAmount();
        for (let retry = 0; retry < 2; retry++) {
            expect(() => session.play()).toThrow(/overflow/);
            expect(session.toSessionState()).toEqual(before);
            expect(session.getCreditsAmount()).toBe(credits);
            expect(session.getWeightedBonusStatistics()!.selections).toBe(0);
            expect(session.getBoundedMechanicObservation()).toBeUndefined();
            expect(session.getWinAmount()).toBe(0);
        }
    });

    it("real worker isolation, chunk merges and fresh-process durable continuation preserve the next draw", async () => {
        const runtime = emitPublicRuntime();
        try {
            const blueprint = weightedBonusBlueprint(),
                game = generatedMechanicsGame(blueprint);
            const root = path.join(runtime.directory, "bonus-game");
            fs.mkdirSync(root);
            fs.writeFileSync(
                path.join(root, "package.json"),
                JSON.stringify({name: "bonus-game", version: "1.0.0", pokie: {entry: "./index.cjs"}}),
            );
            const modulePath = path.join(root, "index.cjs");
            fs.writeFileSync(modulePath, api.renderBuiltGameModule(blueprint, "1.3.0"));
            const workerEntryUrl = pathToFileURL(
                path.join(
                    runtime.directory,
                    "node_modules/@fromstan/pokie/dist/esm/simulation/parallel/internal/simulationWorkerEntry.js",
                ),
            );
            const threadIds = new Set<number>();
            const coordinator = new api.SimulationWorkerCoordinator(workerEntryUrl, (request) => {
                const worker = new Worker(workerEntryUrl, {workerData: request});
                threadIds.add(worker.threadId);
                return worker;
            });
            const results = await coordinator.run(
                [0, 1].map((workerIndex) => ({
                    workerIndex,
                    totalWorkers: 2,
                    packageRoot: root,
                    rounds: 18,
                    seed: String(workerIndex),
                    progressChunkSize: 2,
                })),
            );
            expect(threadIds.size).toBe(2);
            for (let i = 0; i < 2; i++) {
                const reference = new api.AggregateSimulationRunner(boundedSession(game, String(i)), 18)
                    .run()
                    .getStatistics();
                expect(
                    api.SimulationAccumulator.fromSnapshot(results[i].accumulator).getStatistics().weightedBonus,
                ).toEqual(reference.weightedBonus);
            }
            const merged = new api.SimulationStatisticsMerger().merge(results).statistics;
            expect(merged.weightedBonus!.selections).toBe(
                results.reduce((sum, r) => sum + r.accumulator.weightedBonus!.selections, 0),
            );
            const script = path.join(runtime.directory, "resume.cjs");
            fs.writeFileSync(
                script,
                `
const api = require("@fromstan/pokie");
(async () => {
    const [file, database, mode] = process.argv.slice(2), game = require(file);
    const store = await api.SqliteTransactionalRoundStore.open(database);
    try {
        if (mode !== "resume") {
            const session = game.createSession({seed: 0}); session.setBet(0.05); session.setCreditsAmount(10000);
            await store.initialize("s", api.captureInitialPokieSessionState({seed: 0}, session, game.getSessionSerializer(), true, game), game);
        }
        const handler = new api.SpinCommandHandler(game, store);
        let result = await handler.execute({kind: "spin", sessionId: "s", requestId: "entry", roundId: "round", bet: 0.05, delivery: "stepwise"});
        if (result.status !== "played") throw new Error(JSON.stringify(result));
        if (mode !== "prefix") {
            while (result.state.logicalRound.status === "pending") {
                const cursor = result.state.logicalRound.deliveryCursor;
                result = await handler.execute({kind: "spin", sessionId: "s", requestId: "next-" + cursor, continuation: {roundId: "round", cursor}, delivery: "stepwise"});
                if (result.status !== "played") throw new Error(JSON.stringify(result));
            }
            result = await handler.execute({kind: "spin", sessionId: "s", requestId: "paid-next", roundId: "paid-next", bet: 7.5, delivery: "composite"});
            if (result.status !== "played") throw new Error(JSON.stringify(result));
        }
        const saved = await store.readSession("s");
        console.log(JSON.stringify({feature: saved.state.featureState, balance: await store.getBalance("s"), win: result.win}));
    } finally { await store.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});`,
            );
            const run = (mode: string, db: string) =>
                JSON.parse(
                    execFileSync(process.execPath, [script, modulePath, path.join(directory, db), mode], {
                        encoding: "utf8",
                        timeout: 30000,
                    }),
                );
            const expected = run("baseline", "baseline.sqlite");
            expect(run("prefix", "restored.sqlite").feature).toMatchObject({
                remaining: 2,
                bonus: {selection: {outcomeId: "large"}, counts: [0, 1, 0]},
            });
            expect(run("resume", "restored.sqlite")).toEqual(expected);
        } finally {
            runtime.dispose();
        }
    }, 120000);

    it("cancelled durable Studio jobs retain observations without a completed report", async () => {
        const game = generatedMechanicsGame(weightedBonusBlueprint());
        const jobsDirectory = path.join(directory, "jobs"),
            jobs = new StudioJobService(new FileStudioJobRepository(jobsDirectory), undefined, () => "cancel-bonus");
        const service: StudioSimulationService = new StudioSimulationService(
            undefined,
            () => Promise.resolve(game),
            undefined,
            1,
            undefined,
            () => {
                service.cancelForProject(directory, "cancel-bonus");
                return Promise.resolve();
            },
        );
        service.attachJobService(jobs);
        try {
            const started = service.start(directory, {rounds: 100, workers: 1, seed: "0"});
            if (started.status !== "created") throw new Error(JSON.stringify(started));
            for (
                let n = 0;
                n < 1000 && ["queued", "running", "cancelling"].includes(service.getStatus(started.job.id)!.status);
                n++
            ) await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            expect(service.getStatus(started.job.id)).toMatchObject({
                status: "cancelled",
                observedPrefix: {rounds: 1, weightedBonus: {selections: 1}},
            });
            expect(service.getReport(directory, started.job.id)).toMatchObject({
                status: "not-ready",
                jobStatus: "cancelled",
            });
            const reopened = new StudioSimulationService();
            reopened.attachJobService(new StudioJobService(new FileStudioJobRepository(jobsDirectory)));
            expect(reopened.getStatusForProject(directory, started.job.id)).toMatchObject({
                status: "cancelled",
                observedPrefix: {weightedBonus: {selections: 1}},
            });
        } finally {
            await service.cancelAll();
        }
    });

    it("custom-only rules remain visible without session creation or loss of inspectable sections", async () => {
        const game = generatedMechanicsGame(weightedBonusBlueprint());
        const descriptor = await game.getModelDescriptor!();
        descriptor.sourceKind = "custom";
        descriptor.unsupported = [
            {
                path: "mechanics.dynamic",
                code: "custom-bonus-callback",
                message: "Dynamic target callback is not representable by finite weighted bonus outcomes.",
            },
        ];
        const createSession = jest.fn(game.createSession.bind(game));
        const custom: api.PokieGame = {...game, createSession, getModelDescriptor: () => descriptor};
        const extraction = await new api.PackageBlueprintExtraction().extract(custom);
        expect(extraction).toMatchObject({
            status: "unsupported",
            diagnostics: expect.arrayContaining(descriptor.unsupported.map((d) => expect.objectContaining(d))),
        });
        expect(extraction.blueprint).toBeUndefined();
        const model = api.buildPackageGameModelProjection(extraction);
        expect(model.mechanics).toMatchObject({
            status: "unavailable",
            reason: expect.stringContaining("custom-bonus-callback"),
        });
        expect(model.symbols.status).toBe("available");
        expect(createSession).not.toHaveBeenCalled();
        expect(await custom.getModelDescriptor!()).toEqual(descriptor);
    });

    it("real malformed XLSX and descriptors retain field errors and permit corrected reuse", async () => {
        const blueprint = weightedBonusBlueprint();
        const file = path.join(directory, "invalid.xlsx");
        await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, file);
        const book = new ExcelJS.Workbook();
        await book.xlsx.readFile(file);
        const malformed = JSON.parse(JSON.stringify(blueprint));
        malformed.mechanics.weightedBonus.outcomes[0].weight = "invalid";
        book.getWorksheet("Mechanics")!.getCell("B2").value = JSON.stringify(malformed.mechanics.weightedBonus);
        await book.xlsx.writeFile(file);
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.issues).toContainEqual(
            expect.objectContaining({
                path: "mechanics.weightedBonus.outcomes.0.weight",
                code: "weighted-bonus-weight",
                severity: "error",
            }),
        );
        const game = generatedMechanicsGame(blueprint),
            descriptor = await game.getModelDescriptor!();
        descriptor.model.mechanics = malformed.mechanics;
        const invalid = await new api.PackageBlueprintExtraction().extract({
            ...game,
            getModelDescriptor: () => descriptor,
        });
        expect(invalid.status).not.toBe("complete");
        expect(invalid.diagnostics).toContainEqual(
            expect.objectContaining({path: "mechanics.weightedBonus.outcomes.0.weight"}),
        );
        await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, path.join(directory, "corrected.xlsx"));
        expect(
            (await new api.ParSheetImporter().importFromFile(path.join(directory, "corrected.xlsx"))).blueprint
                .mechanics,
        ).toEqual(blueprint.mechanics);
    });

    it("cancelled build/replay work publishes no successful artifact and releases the runtime", async () => {
        const blueprint = weightedBonusBlueprint(),
            game = generatedMechanicsGame(blueprint);
        const cancelled = new AbortController();
        cancelled.abort();
        const destination = path.join(directory, "cancelled-build");
        expect(() =>
            new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, destination, undefined, {
                signal: cancelled.signal,
            }),
        ).toThrow(/cancel/i);
        expect(fs.existsSync(destination)).toBe(false);
        expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, destination)).not.toThrow();
        const release = jest.fn(() => Promise.resolve());
        const service: StudioReplayExecutionService = new StudioReplayExecutionService(
            undefined,
            () => Promise.resolve(game),
            1,
            undefined,
            () => {
                service.cancel(directory, "cancel-replay");
                return Promise.resolve();
            },
            () => "cancel-replay",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            release,
        );
        try {
            const started = service.start(directory, {round: 100, seed: "0"});
            if (started.status !== "created") throw new Error(JSON.stringify(started));
            for (
                let n = 0;
                n < 1000 &&
                ["queued", "running", "cancelling"].includes(service.getStatus(directory, started.job.id)!.status);
                n++
            ) await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            await service.cancelAll();
            expect(service.getStatus(directory, started.job.id)).toMatchObject({status: "cancelled"});
            expect(service.getDownload(directory, started.job.id).status).not.toBe("ok");
            expect(release).toHaveBeenCalledTimes(1);
        } finally {
            await service.cancelAll();
        }
    });

    it("real CLI/Studio authoring, XLSX, extraction, play, report/download and replay services", async () => {
        const id = "weighted-bonus";
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const blueprint = weightedBonusBlueprint(),
            source = path.join(directory, "source.json");
        expect(
            JSON.parse(fs.readFileSync(path.join(process.cwd(), `examples/blueprints/${id}.blueprint.json`), "utf8")),
        ).toEqual(blueprint);
        fs.writeFileSync(source, JSON.stringify(blueprint));
        const original = fs.readFileSync(source, "utf8");
        try {
            expect(await new ValidateCommand().run([source])).toBe(0);
            const destination = path.join(directory, "cli-package");
            fs.mkdirSync(destination);
            expect(await new BuildCommand("1.3.0").run([source, "--target", "tsPackage", "--out", destination])).toBe(
                0,
            );
            const studio = new StudioBlueprintService(
                "1.3.0",
                path.join(directory, "studio"),
                new StudioHomeService("1.3.0"),
            );
            expect(studio.validate(blueprint).status).toBe("ok");
            expect((await studio.build(blueprint, path.join(directory, "studio-package"), source)).status).toBe("ok");
            expect(fs.readFileSync(source, "utf8")).toBe(original);
            const saved = path.join(directory, "saved.json");
            expect(studio.save(saved, blueprint, false).status).toBe("ok");
            expect(studio.load(saved)).toMatchObject({status: "ok", blueprint: {mechanics: blueprint.mechanics}});
            const workbook = path.join(directory, "rules.xlsx"),
                importedFile = path.join(directory, "imported.json");
            expect(await new ParCommand("1.3.0").run(["export", source, "--out", workbook])).toBe(0);
            expect(
                await new ParCommand("1.3.0").run(["import", workbook, "--out", importedFile, "--format", "json"]),
            ).toBe(0);
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
            await new SimCommand(() => Promise.resolve(game)).run([
                directory,
                "--rounds",
                "18",
                "--seed",
                "31",
                "--out",
                reportFile,
            ]);
            const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as api.SimulationReport;
            expect(report.weightedBonus).toMatchObject({tableId: "prizes", selections: expect.any(Number)});
            expect(report.sampling).toMatchObject({unit: "completed-logical-round", acceptedSubrounds: 18});
            for (const format of ["json", "markdown", "html"] as const) expect(buildSimulationReportDownload(report, id, format).body).toMatch(
                /weighted.?bonus|weightedBonus/i,
            );
            await new ReportCommand().run([
                reportFile,
                "--format",
                "html",
                "--out",
                path.join(directory, "report.html"),
            ]);
            expect(fs.readFileSync(path.join(directory, "report.html"), "utf8")).toContain("Weighted bonus prizes");
            const replayFile = path.join(directory, "replay.json");
            const descriptor = new api.ReplayRecorder().recordAudit(
                game,
                boundedSession(game),
                [{kind: "spin", roundId: "audit", delivery: "composite"}],
                {status: "calculated", sessionId: "original", durability: "detached"},
                {seed: 31},
            );
            fs.writeFileSync(replayFile, JSON.stringify(descriptor));
            await new ReplayCommand(() => Promise.resolve(game)).run([
                directory,
                "--recording",
                replayFile,
                "--out",
                path.join(directory, "verified.json"),
            ]);
            expect(JSON.parse(fs.readFileSync(path.join(directory, "verified.json"), "utf8")).auditStatus).toBe(
                "verified",
            );
            const replay = new StudioReplayExecutionService(undefined, () => Promise.resolve(game));
            try {
                await replay.inspectRecording(directory, descriptor);
                const started = replay.start(directory, {
                    round: descriptor.round,
                    recording: descriptor as NonNullable<
                        Parameters<StudioReplayExecutionService["start"]>[1]["recording"]
                    >,
                });
                if (started.status !== "created") throw new Error(JSON.stringify(started));
                for (
                    let n = 0;
                    n < 1000 && ["queued", "running"].includes(replay.getStatus(directory, started.job.id)!.status);
                    n++
                ) await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                expect(replay.getStatus(directory, started.job.id)).toMatchObject({status: "completed"});
                expect(replay.getDownload(directory, started.job.id)).toMatchObject({
                    status: "ok",
                    descriptor: {auditStatus: "verified"},
                });
            } finally {
                await replay.cancelAll();
            }
            const simulation = new StudioSimulationService(undefined, () => Promise.resolve(game), undefined, 2);
            try {
                const started = simulation.start(directory, {rounds: 18, workers: 1, seed: "31"});
                if (started.status !== "created") throw new Error(JSON.stringify(started));
                for (
                    let n = 0;
                    n < 1000 && ["queued", "running"].includes(simulation.getStatus(started.job.id)!.status);
                    n++
                ) await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                const output = simulation.getReport(directory, started.job.id);
                expect(output).toMatchObject({
                    status: "ok",
                    report: {sampling: {unit: "completed-logical-round", acceptedSubrounds: 18}},
                });
                expect(simulation.listReports(directory)[0]).toMatchObject({
                    sampling: {unit: "completed-logical-round", acceptedSubrounds: 18},
                });
                if (output.status !== "ok" || "modes" in output.report) throw new Error("Expected one completed simulation report.");
                expect(output.report.spinsPerSecond).toBe(
                    Math.round(18 / (Math.max(output.report.durationMs, 1) / 1000)),
                );
            } finally {
                await simulation.cancelAll();
            }
            const play = new StudioPlayService(() => Promise.resolve(game));
            try {
                const created = await play.newSession(directory, 31);
                if (created.status !== "ok") throw new Error(JSON.stringify(created));
                const result = await play.spin(created.session.sessionId, undefined, 0.05, undefined, {
                    requestId: "play",
                    roundId: "play",
                    delivery: "composite",
                });
                expect(result).toMatchObject({
                    status: "ok",
                    session: {
                        logicalRound: {status: "completed"},
                        boundedMechanics: expect.any(Object),
                        debug: {
                            artifact: {
                                featureEvents: expect.arrayContaining([
                                    expect.objectContaining({type: "boundedMechanics"}),
                                ]),
                            },
                        },
                    },
                });
            } finally {
                await play.reset();
            }
            expect(() => api.resolveCanonicalWasmGameModel(blueprint)).toThrow(/weighted bonus/);
            expect(game.createExactEnumerationSession).toBeUndefined();
            expect(() => api.estimateExactOutcomeSpaceSize(game)).toThrow(/weighted bonus/);
            const enumeration = jest.fn(() => mechanicsSession(game));
            expect(() =>
                api.estimateExactOutcomeSpaceSize({...game, createExactEnumerationSession: enumeration}),
            ).toThrow(/weighted bonus/);
            expect(enumeration).not.toHaveBeenCalled();
            const project = await new api.ProjectTargetResolver().resolve(source);
            if (!project) throw new Error("Expected the authored Blueprint project.");
            for (const targetKind of ["wasm", "outcomeLibrary", "stakeAdapter"] as const) {
                const target = path.join(directory, `unsupported-${targetKind}`);
                await expect(
                    new BuildCommand("1.3.0").run([source, "--target", targetKind, "--out", target]),
                ).rejects.toThrow(/weighted bonus/);
                expect(fs.existsSync(target)).toBe(false);
                const plan = new api.ArtifactConversionPlanner().plan(
                    project,
                    targetKind,
                );
                expect(api.describeArtifactConversionPlanDiagnostic(plan)).toMatch(/weighted bonus/);
                expect(api.describeArtifactConversionPlanDiagnostic(plan)).not.toMatch(/Missing prerequisite/);
            }
        } finally {
            log.mockRestore();
            error.mockRestore();
        }
    });
});

it.each([0, 1, 2, 3, 4, 0xffffffff])(
    "cumulative boundary %s selects one identity and zero mass never draws",
    (point) => {
        const table = weightedBonusBlueprint().mechanics!.weightedBonus!;
        const rng = {getRandomInt: jest.fn(() => point)};
        expect(api.selectWeightedBonus(table, rng).id).toBe(point % 4 === 0 ? "small" : "large");
        expect(rng.getRandomInt).toHaveBeenCalledTimes(1);
        expect(rng.getRandomInt).toHaveBeenCalledWith(0, 0x100000000);
    },
);

it("rejection sampling preserves probability mass and validates its RNG boundary", () => {
    const table = weightedBonusBlueprint().mechanics!.weightedBonus!;
    table.outcomes[1].weight = 2;
    const rng = {getRandomInt: jest.fn().mockReturnValueOnce(0xffffffff).mockReturnValueOnce(1)};
    expect(api.selectWeightedBonus(table, rng).id).toBe("large");
    expect(rng.getRandomInt).toHaveBeenCalledTimes(2);
    for (const invalid of [-1, 0.1, NaN, Infinity, 0x100000000]) expect(() => api.selectWeightedBonus(table, {getRandomInt: () => invalid})).toThrow(/RNG/);
});

it.each(["lines", "ways", "clusters"] as const)(
    "known-answer %s direct/generated CJS/TS, payout duration, stable reads and restored next RNG",
    (type) => {
        const blueprint = weightedBonusBlueprint();
        blueprint.winModel = type === "clusters" ? {type, minimumClusterSize: 3} : {type};
        const game = generatedMechanicsGame(blueprint),
            typed = generatedMechanicsGame(blueprint, true);
        const session = boundedSession(game, 0),
            stepwise = boundedSession(typed, 0);
        const before = session.toSessionState();
        for (let n = 0; n < 3; n++) game.getSessionSerializer!().getInitialData(session);
        expect(session.toSessionState()).toEqual(before);
        expect(session.getWeightedBonusStatistics()).toMatchObject({selections: 0, completed: 0});
        const command: api.SessionCommand = {kind: "spin", roundId: "known", delivery: "composite"};
        const result = played(new api.SessionRuntime(session).execute(command));
        expect(result.logicalRound).toMatchObject({status: "completed", totalStake: 0.05});
        const state = session.toSessionState();
        expect(state.bonus!.selection).toMatchObject({tableId: "prizes", outcomeId: "large", context: "logical:known"});
        expect(state).toMatchObject({remaining: 0, executed: 2});
        expect(result.logicalRound!.cursor).toBe(3);
        expect(result.logicalRound!.totalWin).toBeCloseTo(0.55, 12);
        expect(session.getCreditsAmount()).toBeCloseTo(10000.5, 8);
        expect(session.getWeightedBonusStatistics()).toMatchObject({
            selections: 1,
            completed: 1,
            incomplete: 0,
            outcomes: [
                {id: "small", probability: 0.25, count: 0, frequency: 0, uncovered: true},
                {id: "large", probability: 0.75, count: 1, frequency: 1, uncovered: false},
                {id: "zero", probability: 0, count: 0},
            ],
        });
        const runtime = new api.SessionRuntime(stepwise);
        let next = played(runtime.execute({...command, delivery: "stepwise"}));
        const restored = boundedSession(game);
        restored.fromSessionState(JSON.parse(JSON.stringify(stepwise.toSessionState())));
        restored.setCreditsAmount(stepwise.getCreditsAmount());
        const continuation = new api.SessionRuntime(restored, next.logicalRound);
        while (next.logicalRound!.status === "pending") {
            const input: api.SessionCommand = {
                kind: "spin",
                delivery: "stepwise",
                continuation: {roundId: "known", cursor: next.logicalRound!.deliveryCursor},
            };
            next = played(runtime.execute(input));
            expect(continuation.execute(input)).toEqual(next);
            const saved = stepwise.toSessionState();
            expect(runtime.execute(input)).toEqual(next);
            expect(stepwise.toSessionState()).toEqual(saved);
        }
        expect(stepwise.toSessionState()).toEqual(state);
        expect(restored.toSessionState()).toEqual(state);
        for (const candidate of [session, restored, stepwise]) candidate.play();
        expect(restored.toSessionState()).toEqual(session.toSessionState());
        expect(stepwise.toSessionState()).toEqual(session.toSessionState());
        if (type === "lines") {
            const plain = direct(blueprint, 0).session;
            plain.setCreditsAmount(10000);
            plain.setBet(0.05);
            for (let i = 0; i < 3; i++) plain.play();
            expect(plain.getWeightedBonusStatistics()).toMatchObject({selections: 1, completed: 1});
            expect(plain.toSessionState().base).toEqual(state.base);
        }
    },
);

it("no trigger, zero effect, zero duration and distinct denominations preserve stake and finite selection counts", () => {
    for (const bet of [0.05, 7.5, 1e-7]) {
        const blueprint = weightedBonusBlueprint();
        blueprint.mechanics!.weightedBonus!.trigger.symbolId = "A";
        const noTrigger = boundedSession(generatedMechanicsGame(blueprint));
        noTrigger.setBet(bet);
        noTrigger.play();
        expect(noTrigger.getWeightedBonusStatistics()!.selections).toBe(0);
        expect(noTrigger.getBoundedMechanicObservation()!.weightedBonus).toBeUndefined();
        expect(noTrigger.getWinAmount()).toBe(bet * 2);
        const table = blueprint.mechanics!.weightedBonus!;
        table.trigger.symbolId = "C";
        table.outcomes = [{...table.outcomes[2], weight: 1}];
        const zero = boundedSession(generatedMechanicsGame(blueprint));
        zero.setBet(bet);
        const result = played(
            new api.SessionRuntime(zero).execute({kind: "spin", roundId: "zero", delivery: "composite"}),
        );
        expect(result.logicalRound).toMatchObject({cursor: 1, totalStake: bet, totalWin: bet * 2});
        expect(zero.getWeightedBonusStatistics()).toMatchObject({
            selections: 1,
            completed: 1,
            outcomes: [{id: "zero", count: 1}],
        });
        expect(zero.getBoundedMechanicObservation()!.weightedBonus).toMatchObject({
            payout: 0,
            remaining: 0,
            executed: 0,
        });
    }
});

it("launch register has all mandatory families and exact/negative cells for every fixed variant", () => {
    expect(api.MANDATORY_AUTHORED_FAMILIES).toEqual([
        "freeGames/retrigger",
        "Hold&Win",
        "Jackpot",
        "BetMode",
        "wild variants",
        "multipliers",
        "cascade/respins",
        "collections/accumulators",
        "transforms/reel modifiers",
        "weighted bonus outcomes",
    ]);
    const expected = [
        "free-games",
        "modes",
        "hold-flat",
        "hold-flat-modes",
        "hold-bet",
        "hold-bet-modes",
        "fixed-base",
        "fixed-base-modes",
        "fixed-freeGames",
        "fixed-freeGames-modes",
        "fixed-holdAndWin",
        "fixed-holdAndWin-modes",
        "fixed-holdAndWin-bet",
        "fixed-holdAndWin-bet-modes",
        "accumulating-base",
        "accumulating-base-modes",
        "accumulating-freeGames",
        "accumulating-freeGames-modes",
        "accumulating-holdAndWin",
        "accumulating-holdAndWin-modes",
        "accumulating-holdAndWin-bet",
        "accumulating-holdAndWin-bet-modes",
        "modifier-expanding",
        "modifier-sticky",
        "modifier-restricted",
        "modifier-multiplier",
        "modifier-transform",
        "modifier-reel",
        "bounded-cascade",
        "bounded-respins",
        "bounded-collection",
        "bounded-cascade-collection",
        "bounded-respins-collection",
        "bounded-cascade-respins",
        "bounded-cascade-respins-collection",
        "weighted-bonus",
    ];
    const rows = api.AUTHORED_WORKFLOW_SUPPORT_CATALOG;
    expect(rows.map((row) => row.id).sort()).toEqual(expected.sort());
    expect(new Set(rows.map((row) => row.id)).size).toBe(36);
    expect(new Set(rows.flatMap((row) => row.families))).toEqual(new Set(api.MANDATORY_AUTHORED_FAMILIES));
    const declarations = new Map<string, string[]>();
    for (const row of rows) {
        expect(new Set(Object.values(row.cells).map(cell => cell.negativeAssertion)).size).toBe(9);
        expect(Object.keys(row.cells).sort()).toEqual(
            [
                "core",
                "schema",
                "editor",
                "build",
                "runtime-restore",
                "simulation-report",
                "extraction",
                "PAR",
                "replay",
            ].sort(),
        );
        for (const cell of Object.values(row.cells)) {
            expect(cell.variant).toBe(row.id);
            expect(cell.assertion.length).toBeGreaterThan(20);
            expect(cell.negativeAssertion.length).toBeGreaterThan(30);
            expect(cell.exactFixture.split("#")[0]).toBe(cell.testOwner);
            expect(cell.dataFixture).not.toContain("#");
            for (const reference of [cell.exactFixture, cell.negativeFixture, ...(cell.additionalExactFixtures ?? []), ...(cell.additionalNegativeFixtures ?? [])]) {
                const [owner, title] = reference.split("#");
                // Referential integrity uses full, actual Jest declarations, never a substring
                // in a comment or a fixture filename. Behavior is asserted by those executed cases.
                let declared = declarations.get(owner);
                if (!declared) {
                    declared = [];
                    const source = ts.createSourceFile(owner, fs.readFileSync(owner, "utf8"), ts.ScriptTarget.Latest, true);
                    const titles = declared;
                    const visit = (node: ts.Node): void => {
                        if (ts.isCallExpression(node) && node.arguments.length >= 2 && ts.isStringLiteralLike(node.arguments[0]) &&
                        (ts.isIdentifier(node.expression) && ["it", "test"].includes(node.expression.text) ||
                        ts.isCallExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === "each")) titles.push(node.arguments[0].text);
                        ts.forEachChild(node, visit);
                    };
                    visit(source);
                    declarations.set(owner, declared);
                }
                expect(declared).toContain(title);
            }
        }
    }
});

it.each([0.05, 7.5, 1e-7])("both known outcomes preserve payout units and charged denomination %s", (bet) => {
    const game = generatedMechanicsGame(weightedBonusBlueprint());
    for (const [seed, id, duration, payout] of [
        [0, "large", 2, 11 * bet],
        [31, "small", 0, 3 + 2 * bet],
    ] as const) {
        const session = boundedSession(game, seed);
        session.setBet(bet);
        const result = played(
            new api.SessionRuntime(session).execute({kind: "spin", roundId: "known", delivery: "composite"}),
        );
        expect(result.logicalRound).toMatchObject({totalStake: bet, cursor: duration + 1});
        expect(result.logicalRound!.totalWin).toBeCloseTo(payout, 12);
        expect(session.toSessionState().bonus!.selection!.outcomeId).toBe(id);
        expect(session.toSessionState().executed).toBe(duration);
    }
});

it("direct explicit contexts cannot redraw a consumed entry or replace an active selection", () => {
    const session = boundedSession(generatedMechanicsGame(weightedBonusBlueprint()), 0);
    session.setSelectionContext("logical:direct");
    session.play();
    const prefix = session.toSessionState();
    expect(() => session.setSelectionContext("logical:foreign")).toThrow(/context/);
    expect(session.toSessionState()).toEqual(prefix);
    for (let i = 0; i < 2; i++) session.play();
    const completed = session.toSessionState();
    expect(() => session.setSelectionContext("logical:direct")).toThrow(/consumed/);
    expect(session.toSessionState()).toEqual(completed);
    session.setSelectionContext("implicit:20");
    session.play();
    expect(() => session.validateSessionState(session.toSessionState())).not.toThrow();
});

it("weighted reels and bonus tables own separate selections while reusing the logical context", () => {
    const blueprint = weightedBonusBlueprint();
    Reflect.deleteProperty(blueprint, "reelStrips");
    blueprint.reelSequences = [
        {
            type: "weighted",
            variants: [
                {id: "first", weight: 1, symbols: ["C", "C"]},
                {id: "second", weight: 3, symbols: ["A", "C"]},
            ],
        },
        {type: "exact", symbols: ["C"]},
        {type: "exact", symbols: ["C"]},
    ];
    blueprint.mechanics!.weightedBonus!.trigger.minimumCount = 1;
    const game = generatedMechanicsGame(blueprint),
        session = boundedSession(game, 0);
    const initial = session.getSequenceStatistics()[0].selections;
    expect(initial).toBe(0);
    const result = played(
        new api.SessionRuntime(session).execute({kind: "spin", roundId: "both", delivery: "composite"}),
    );
    expect(result.logicalRound!.status).toBe("completed");
    expect(session.getSequenceStatistics()[0].selections).toBe(1);
    expect(session.getWeightedBonusStatistics()!.selections).toBe(1);
    expect(session.getSequenceSelections()[0].context).toBe("logical:both");
    expect(session.toSessionState().bonus!.selection!.context).toBe("logical:both");
    const extractedHash = generatedMechanicsGame(blueprint, true).getConfigHash!();
    expect(extractedHash).toBe(game.getConfigHash!());
    const restored = boundedSession(game, 0);
    restored.fromSessionState(session.toSessionState());
    for (const candidate of [session, restored]) candidate.play();
    expect(restored.toSessionState()).toEqual(session.toSessionState());
});

it("an explicit pending direct request restores without consuming its draw or changing the prior identity", () => {
    const game = generatedMechanicsGame(weightedBonusBlueprint()),
        session = boundedSession(game, 31);
    session.play();
    expect(session.toSessionState().bonus!.selection!.outcomeId).toBe("small");
    session.setSelectionContext("implicit:20");
    const before = session.toSessionState(),
        restored = boundedSession(game, 31);
    restored.fromSessionState(JSON.parse(JSON.stringify(before)));
    restored.setCreditsAmount(session.getCreditsAmount());
    expect(session.toSessionState()).toEqual(before);
    for (const candidate of [session, restored]) candidate.play();
    expect(restored.toSessionState()).toEqual(session.toSessionState());
    expect(session.toSessionState().bonus!.selection!.context).toBe("implicit:20");
});

it("descending consumed implicit contexts reject before changing the request, money or next RNG", () => {
    const blueprint = weightedBonusBlueprint();
    for (const outcome of blueprint.mechanics!.weightedBonus!.outcomes) outcome.duration = 0;
    const game = generatedMechanicsGame(blueprint), 
        session = boundedSession(game, 0);
    session.setSelectionContext("implicit:20");
    session.play();
    const before = session.toSessionState(), 
        credits = session.getCreditsAmount();
    expect(() => session.setSelectionContext("implicit:1")).toThrow(/implicit context must advance/);
    expect(session.toSessionState()).toEqual(before);
    expect(session.getCreditsAmount()).toBe(credits);
    const restored = boundedSession(game, 91);
    restored.fromSessionState(JSON.parse(JSON.stringify(before)));
    restored.setCreditsAmount(credits);
    for (const candidate of [session, restored]) candidate.play();
    expect(session.toSessionState().bonus!.context).toBe("implicit:21");
    expect(restored.toSessionState()).toEqual(session.toSessionState());
    expect(restored.getWinAmount()).toBe(session.getWinAmount());
});

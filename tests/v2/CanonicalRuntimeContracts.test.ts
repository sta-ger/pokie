import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as publicApi from "@fromstan/pokie";
import {
    BetModeDefinition, BetModesConfig, FreeGamesForcedFeatureEntryHandler, VideoSlotWithBetModesSession, type VideoSlotSessionHandling, SessionRuntime, SpinCommandHandler, Simulation, SimulationConfig, AggregateSimulationRunner, ReplayRecorder, generateExactWeightedOutcomeLibrary, InMemorySessionRepository, InMemoryWallet, InMemorySpinOperationLog,
    captureInitialPokieSessionState, VideoSlotSession, VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesConfig, VideoSlotConfig, VideoSlotWinCalculator, Paytable,
    SymbolsCombinationsGenerator, SeededRandomNumberGenerator, SymbolsSequence,
    CustomLinesDefinitions, VideoSlotSessionSerializer,
    renderBuiltGameModule, renderBuiltGameModuleSource,
    type PokieGame, type GameBlueprint, type PokieSessionState, type RepositoryCommand,
} from "@fromstan/pokie";
import {fractionalBetBlueprint, screenMultiplier} from "../fixtures/math/FractionalBetFixture.js";
import {authoritativePaytableBlueprint} from "../fixtures/math/AuthoritativePaytableFixture.js";
import {extensionRound} from "./fixtures/RuntimeExtension.js";
import {inspectRuntimeGraph} from "./helpers/runtimeGraph.js";

const root = path.resolve(__dirname, "../..");

function generated(blueprint: GameBlueprint, typed = false): PokieGame {
    const source = typed ? ts.transpileModule(renderBuiltGameModuleSource(blueprint, "1.3.0"), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText : renderBuiltGameModule(blueprint, "1.3.0");
    const module = {exports: {} as {default?: PokieGame}};
    vm.runInNewContext(`(function(require, module, exports) {${source}\n})`)((name: string) => {
        if (name !== "@fromstan/pokie") throw new Error(`Private generated import: ${name}`);
        return publicApi;
    }, module, module.exports);
    return (module.exports.default ?? module.exports) as PokieGame;
}

function authored(blueprint: GameBlueprint): PokieGame {
    return {
        getManifest: () => blueprint.manifest,
        createSession: context => {
            const config = new VideoSlotConfig();
            config.setAvailableBets(blueprint.availableBets!);
            config.setBet(blueprint.availableBets![0]);
            config.setReelsNumber(blueprint.reels);
            config.setReelsSymbolsNumber(blueprint.rows);
            config.setAvailableSymbols(blueprint.symbols);
            config.setWildSymbols(blueprint.wilds!);
            config.setScatterSymbols(blueprint.scatters!);
            config.setSymbolsSequences(blueprint.reelStrips!.map(strip => new SymbolsSequence().fromArray(strip)));
            config.setLinesDefinitions(new CustomLinesDefinitions().fromMap(Object.fromEntries(blueprint.paylines!.map((line, index) => [String(index), line]))));
            // Fresh authored table after the default-populating setters, matching generated assembly.
            const paytable = new Paytable<string>(config.getAvailableBets(), config.getAvailableSymbols());
            for (const [symbol, payouts] of Object.entries(blueprint.paytable)) {
                for (const [count, multiplier] of Object.entries(payouts)) paytable.setPayoutForSymbol(symbol, Number(count), multiplier);
            }
            config.setPaytable(paytable);
            const rng = new SeededRandomNumberGenerator(context?.seed ?? 7);
            const feature = blueprint.mechanics?.freeGames;
            let session: VideoSlotSessionHandling;
            if (feature !== undefined) {
                const free = new VideoSlotWithFreeGamesConfig(config, {});
                for (const [count, grant] of Object.entries(feature.awardsByCount)) free.setFreeGamesForScatters(feature.scatterSymbol, Number(count), grant);
                session = new VideoSlotWithFreeGamesSession(free, new SymbolsCombinationsGenerator(free, rng), new VideoSlotWinCalculator(free));
            } else {
                session = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, rng), new VideoSlotWinCalculator(config));
            }
            if (blueprint.betModes !== undefined) {
                const modes = blueprint.betModes.map(mode => new BetModeDefinition(mode.id, {stakeMultiplier: mode.costMultiplier ?? 1, forcesFeatureEntry: mode.runtimeType === "buyFeature"}));
                return new VideoSlotWithBetModesSession(session, new BetModesConfig(modes, "base"), new FreeGamesForcedFeatureEntryHandler(3));
            }
            return session;
        },
        getSessionSerializer: () => new VideoSlotSessionSerializer(),
    };
}

async function initialize(game: PokieGame, seed: string | number, repository: InMemorySessionRepository, wallet: InMemoryWallet): Promise<PokieSessionState> {
    const session = game.createSession({seed});
    const state = captureInitialPokieSessionState({seed}, session, game.getSessionSerializer?.(), false, game);
    await repository.save("session", state);
    await wallet.setBalance("session", state.credits!);
    return state;
}

describe("V2C-02 canonical runtime contracts", () => {
    it.each([0.05, 7.5, 1e-7])("delegates generated CJS/TS and code-first fractional math at %s through one portable command", bet => {
        const blueprint = fractionalBetBlueprint([bet], true);
        const sessions = [generated(blueprint), generated(blueprint, true), authored(blueprint)].map(game => game.createSession({seed: "0"}) as VideoSlotSession);
        const plays = sessions.map(session => jest.spyOn(session, "play"));
        for (let round = 0; round < 8; round++) {
            const results = sessions.map(session => new SessionRuntime(session).execute({kind: "spin", bet}));
            expect(results[1]).toEqual(results[0]);
            expect(results[2]).toEqual(results[0]);
            sessions.forEach(session => {
                expect(session.getWinAmount()).toBe(screenMultiplier(session.getSymbolsCombination().toMatrix()) * bet);
                expect(session.toSessionState()).toEqual(sessions[0].toSessionState());
            });
        }
        plays.forEach(play => expect(play).toHaveBeenCalledTimes(8));
    });

    it.each(["missing-symbol", "missing-count", "zero", "positive"] as const)("retains authored %s paytables without changing constructor defaults", kind => {
        const blueprint = authoritativePaytableBlueprint(kind, 0.05);
        for (const game of [generated(blueprint), generated(blueprint, true), authored(blueprint)]) {
            const session = game.createSession({seed: 1});
            const result = new SessionRuntime(session).execute({kind: "spin"});
            expect(result).toMatchObject({status: "played", win: kind === "positive" ? 0.1 : 0});
        }
        const legacy = new VideoSlotSession();
        expect(legacy.canPlayNextGame()).toBe(true);
        expect(legacy.getPaytable().getWinAmountForSymbol("A", 3, legacy.getBet())).toBeGreaterThan(0);
    });

    it.each([7, "7"])("restores base RNG from serialized records and fresh definitions for seed %s", async seed => {
        const blueprint = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        for (const make of [() => generated(blueprint), () => generated(blueprint, true), () => authored(blueprint)]) {
            const continuous = new InMemorySessionRepository(),
                wallet = new InMemoryWallet();
            const reconstructed = new InMemorySessionRepository(),
                restoredWallet = new InMemoryWallet();
            await initialize(make(), seed, continuous, wallet);
            await initialize(make(), seed, reconstructed, restoredWallet);
            const live = new SpinCommandHandler(make(), continuous, wallet);
            for (let round = 0; round < 8; round++) {
                const coldRepository = new InMemorySessionRepository();
                await coldRepository.save("session", JSON.parse(JSON.stringify(await reconstructed.load("session"))));
                const cold = new SpinCommandHandler(make(), coldRepository, restoredWallet);
                const command: RepositoryCommand = {kind: "spin", sessionId: "session", bet: [0.05, 7.5, 1e-7][round % 3]};
                const a = await live.execute(command),
                    b = await cold.execute(command);
                expect(a.status).toBe("played");
                expect(b.status).toBe("played");
                if (a.status !== "played" || b.status !== "played") throw new Error("Continuation rejected");
                expect(b.state).toEqual(a.state);
                expect({win: b.win, stake: b.stake, credits: b.credits}).toEqual({win: a.win, stake: a.stake, credits: a.credits});
                await reconstructed.save("session", b.state);
                expect(JSON.stringify(b.state.initialPayload)).not.toContain("rngState");
                expect(JSON.stringify(b.state.roundPayload)).not.toContain("rngState");
            }
        }
    });

    it("alternates runtime instances against committed revisions, never a stale cached RNG", async () => {
        const blueprint = fractionalBetBlueprint([0.05], true),
            repository = new InMemorySessionRepository(),
            wallet = new InMemoryWallet();
        const referenceRepository = new InMemorySessionRepository(),
            referenceWallet = new InMemoryWallet();
        await initialize(generated(blueprint), "0", repository, wallet);
        await initialize(generated(blueprint), "0", referenceRepository, referenceWallet);
        const a = new SpinCommandHandler(generated(blueprint), repository, wallet),
            b = new SpinCommandHandler(generated(blueprint), repository, wallet);
        const reference = new SpinCommandHandler(generated(blueprint), referenceRepository, referenceWallet);
        for (let round = 0; round < 8; round++) {
            expect(await (round % 2 ? b : a).execute({kind: "spin", sessionId: "session"})).toEqual(await reference.execute({kind: "spin", sessionId: "session"}));
        }
    });

    it("restores free entry, progress, retriggers, bank, last grant and return to paid play at zero balance", async () => {
        const blueprint: GameBlueprint = {...fractionalBetBlueprint([0.05], true), symbols: ["A", "S"], scatters: ["S"], reelStrips: [["S", "A"], ["S", "A"], ["S", "A"]],
            paytable: {A: {3: 5}, S: {3: 0}}, mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}}};
        for (const make of [() => generated(blueprint), () => authored(blueprint)]) {
            const repository = new InMemorySessionRepository(),
                wallet = new InMemoryWallet();
            const initial = await initialize(make(), "0", repository, wallet);
            // Persist a real feature entry with a nested seeded base snapshot and no real balance.
            const session = make().createSession({seed: "0"}) as VideoSlotWithFreeGamesSession;
            session.fromSessionState({...session.toSessionState(), freeGamesNum: 0, freeGamesSum: 12, freeGamesBank: 0.1, wonFreeGamesNumber: 2});
            session.setCreditsAmount(0);
            const state = {...initial, credits: 0, featureState: session.toSessionState()};
            await repository.save("session", state);
            await wallet.setBalance("session", 0);
            const expected = new SessionRuntime(session);
            let retrigger = false,
                returned = false;
            for (let round = 0; round < 40; round++) {
                const next = expected.execute({kind: "spin"});
                if (next.status !== "played") break;
                const coldRepository = new InMemorySessionRepository();
                await coldRepository.save("session", JSON.parse(JSON.stringify(await repository.load("session"))));
                const cold = new SpinCommandHandler(make(), coldRepository, wallet);
                const result = await cold.execute({kind: "spin", sessionId: "session"});
                expect(result).toMatchObject({status: "played", win: next.win, credits: next.credits, stake: next.stake});
                if (result.status !== "played") throw new Error("Free continuation rejected");
                expect(result.state.featureState).toEqual(session.toSessionState());
                expect(result.state.screen).toEqual(session.getSymbolsCombination().toMatrix());
                retrigger ||= session.getWonFreeGamesNumber() > 0;
                await repository.save("session", result.state);
                if (next.stake > 0) {
                    returned = true;
                    break;
                }
            }
            expect(retrigger).toBe(true);
            expect(returned).toBe(true);
        }
    });

    it("restores nested bet-mode/free-game state and preserves one-shot buy provenance", async () => {
        const blueprint: GameBlueprint = {...fractionalBetBlueprint([0.05], true), scatters: ["B"],
            mechanics: {freeGames: {scatterSymbol: "B", awardsByCount: {3: 2}}},
            betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 2},
                {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}]};
        for (const make of [() => generated(blueprint), () => generated(blueprint, true), () => authored(blueprint)]) {
            const repository = new InMemorySessionRepository(),
                wallet = new InMemoryWallet();
            const continuousRepository = new InMemorySessionRepository(),
                continuousWallet = new InMemoryWallet();
            await initialize(make(), 7, repository, wallet);
            await initialize(make(), 7, continuousRepository, continuousWallet);
            const continuous = new SpinCommandHandler(make(), continuousRepository, continuousWallet);
            for (let round = 0; round < 8; round++) {
                const coldRepository = new InMemorySessionRepository();
                await coldRepository.save("session", JSON.parse(JSON.stringify(await repository.load("session"))));
                const cold = new SpinCommandHandler(make(), coldRepository, wallet);
                const selectedMode = round === 4 ? {mode: "ante"} : {};
                const command: RepositoryCommand = {kind: "spin", sessionId: "session", ...(round === 0 ? {mode: "buy"} : selectedMode)};
                const a = await continuous.execute(command),
                    b = await cold.execute(command);
                if (a.status !== "played" || b.status !== "played") throw new Error("Nested continuation rejected");
                expect(b.state).toEqual(a.state);
                expect(b.stake).toBe(a.stake);
                expect(b.mode).toBe(a.mode);
                if (round === 0) {
                    expect(b).toMatchObject({stake: 0.25, mode: "buy", state: {featureState: {betModeId: "base"}}});
                }
                await repository.save("session", b.state);
            }
        }
    });

    it.each([false, true])("rejects malformed commands/state with mutation-free outcomes (cache=%s)", async cached => {
        const blueprint = fractionalBetBlueprint([0.05], true),
            game = generated(blueprint);
        const negative: {name: string; command?: unknown; change?: (state: PokieSessionState) => void; status: string}[] = [
            {name: "null", command: null, status: "invalid-command"},
            {name: "kind", command: {kind: "unknown", sessionId: "session"}, status: "invalid-command"},
            {name: "identifier", command: {kind: "spin", sessionId: ""}, status: "invalid-command"},
            {name: "NUL", command: {kind: "spin", sessionId: "session", requestId: "a\0b"}, status: "invalid-command"},
            ...[NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(expectedVersion => ({name: `revision ${expectedVersion}`, command: {kind: "spin", sessionId: "session", expectedVersion}, status: "invalid-command"})),
            ...[NaN, Infinity, -Infinity, 0, -1, "0.05", 7.5].map(bet => ({name: `bet ${bet}`, command: {kind: "spin", sessionId: "session", bet}, status: "invalid-command"})),
            {name: "mode", command: {kind: "spin", sessionId: "session", mode: "unknown"}, status: "invalid-command"},
            {name: "missing", command: {kind: "spin", sessionId: "missing"}, status: "not-found"},
            {name: "game", change: state => {
                state.identity = {...state.identity!, gameId: "other"};
            }, status: "incompatible-state"},
            {name: "model", change: state => {
                state.identity = {...state.identity!, modelHash: "other"};
            }, status: "incompatible-state"},
            {name: "schema", change: state => {
                state.identity = {...state.identity!, stateSchemaVersion: "2"};
            }, status: "incompatible-state"},
            {name: "identity", change: state => {
                Reflect.deleteProperty(state, "identity");
            }, status: "incompatible-state"},
            {name: "feature", change: state => {
                Reflect.deleteProperty(state, "featureState");
            }, status: "corrupt-state"},
            {name: "rng", change: state => {
                state.featureState = {rngState: -1};
            }, status: "corrupt-state"},
            {name: "missing RNG", change: state => {
                state.featureState = {};
            }, status: "corrupt-state"},
            {name: "null capabilities", change: state => {
                Reflect.set(state, "commandCapabilities", null);
            }, status: "corrupt-state"},
            {name: "missing codec", change: state => {
                Reflect.deleteProperty(state, "stateSchema");
            }, status: "corrupt-state"},
            {name: "credits", change: state => {
                state.credits = NaN;
            }, status: "corrupt-state"},
            {name: "screen", change: state => {
                state.screen = ["bad"] as unknown as unknown[][];
            }, status: "corrupt-state"},
        ];
        for (const row of negative) {
            const repository = new InMemorySessionRepository(),
                wallet = new InMemoryWallet();
            const state = await initialize(game, "0", repository, wallet);
            const operationLog = new InMemorySpinOperationLog();
            await operationLog.record({sessionId: "session", requestId: "pending", attemptId: "pending", debitTransactionId: "debit", creditTransactionId: "credit", stakeAmount: 0.05,
                expectedVersion: 1, checkpoint: "started", startedAt: "2020-01-01T00:00:00Z", updatedAt: "2020-01-01T00:00:00Z"});
            const runtime = new SpinCommandHandler(game, repository, wallet, undefined, operationLog, true);
            const session = game.createSession({seed: "0"}) as VideoSlotSession;
            if (cached) runtime.primeSession("session", session, 1);
            if (row.change) {
                row.change(state);
                await repository.save("session", state);
            }
            const before = await repository.loadVersioned("session"),
                executable = session.toSessionState();
            const mutations = [jest.spyOn(game, "createSession"), jest.spyOn(SeededRandomNumberGenerator.prototype, "getRandomInt"), jest.spyOn(operationLog, "record"), jest.spyOn(operationLog, "delete"), jest.spyOn(operationLog, "tryClaimForReconciliation"), jest.spyOn(session, "play"), jest.spyOn(session, "setBet"), jest.spyOn(session, "setCreditsAmount"), jest.spyOn(wallet, "debit"), jest.spyOn(wallet, "credit"), jest.spyOn(repository, "save"), jest.spyOn(repository, "saveVersioned")];
            const submitted = row.command === undefined ? {kind: "spin", sessionId: "session", requestId: "pending"} : row.command;
            const command = typeof submitted === "object" && submitted !== null ? {requestId: "pending", ...submitted} : submitted;
            const result = await runtime.execute(command as RepositoryCommand);
            expect({name: row.name, status: result.status}).toEqual({name: row.name, status: row.status});
            mutations.forEach(spy => {
                expect(spy).not.toHaveBeenCalled();
                spy.mockRestore();
            });
            expect(await repository.loadVersioned("session")).toEqual(before);
            expect(session.toSessionState()).toEqual(executable);
        }
    });

    it("prepared commands execute once and a rollback cannot undo or re-execute a settled round", () => {
        const session = generated(fractionalBetBlueprint([0.05], true)).createSession({seed: 7}) as VideoSlotSession;
        const runtime = new SessionRuntime(session);
        const prepared = runtime.prepare({kind: "spin"}, session.getCreditsAmount());
        if (prepared.status !== "ready") throw new Error("Round was not prepared");
        expect(prepared.execute().status).toBe("played");
        const after = session.toSessionState(),
            credits = session.getCreditsAmount();
        expect(prepared.rollback()).toBe(false);
        expect(() => prepared.execute()).toThrow("no longer executable");
        expect(session.toSessionState()).toEqual(after);
        expect(session.getCreditsAmount()).toBe(credits);
        const cancelled = runtime.prepare({kind: "spin"}, credits);
        if (cancelled.status !== "ready") throw new Error("Round was not prepared");
        expect(cancelled.rollback()).toBe(true);
        expect(() => cancelled.execute()).toThrow("no longer executable");
        expect(session.toSessionState()).toEqual(after);
    });

    it("simulation, aggregate, replay and exact enumeration delegate execution to the portable boundary", async () => {
        const blueprint = fractionalBetBlueprint([0.05], true);
        const game = generated(blueprint);
        const execution = jest.spyOn(SessionRuntime.prototype, "execute");
        try {
            const config = new SimulationConfig();
            config.setNumberOfRounds(2);
            new Simulation(game.createSession({seed: 7}), config).run();
            expect(execution).toHaveBeenCalledTimes(2);
            execution.mockClear();
            new AggregateSimulationRunner(game.createSession({seed: 7}), 3).run();
            expect(execution).toHaveBeenCalledTimes(3);
            execution.mockClear();
            new ReplayRecorder().record({game, seed: "7", round: 4});
            expect(execution).toHaveBeenCalledTimes(4);
            execution.mockClear();
            const {library} = await generateExactWeightedOutcomeLibrary({game, libraryId: "canonical", pokieVersion: "1.3.0"});
            expect(execution).toHaveBeenCalledTimes(8);
            expect(library.outcomes).toHaveLength(8);
            for (const {artifact} of library.outcomes) expect(artifact.totalWin).toBe(screenMultiplier(artifact.screen) * 0.05);
        } finally {
            execution.mockRestore();
        }
    });

    it.each([false, true])("rejects incomplete free-game nested state before reconstruction or cached execution (cache=%s)", async cached => {
        const blueprint: GameBlueprint = {...fractionalBetBlueprint([0.05], true), mechanics: {freeGames: {scatterSymbol: "B", awardsByCount: {3: 2}}}, scatters: ["B"]};
        for (const make of [() => generated(blueprint), () => authored(blueprint)]) {
            for (const change of [
                (value: Record<string, unknown>) => {
                    value.freeGamesNum = -1;
                },
                (value: Record<string, unknown>) => {
                    value.freeGamesBank = Infinity;
                },
                (value: Record<string, unknown>) => {
                    Reflect.deleteProperty(value, "base");
                },
                (value: Record<string, unknown>) => {
                    value.base = {};
                },
                (value: Record<string, unknown>) => {
                    value.wonFreeGamesNumber = -1;
                },
            ]) {
                const game = make(),
                    repository = new InMemorySessionRepository(),
                    wallet = new InMemoryWallet();
                const state = await initialize(game, 7, repository, wallet);
                const validSession = game.createSession({seed: 7}) as VideoSlotWithFreeGamesSession;
                change(state.featureState as Record<string, unknown>);
                await repository.save("session", state);
                const runtime = new SpinCommandHandler(game, repository, wallet);
                if (cached) runtime.primeSession("session", validSession, 2);
                const before = await repository.loadVersioned("session"),
                    executable = validSession.toSessionState();
                const factory = jest.spyOn(game, "createSession"),
                    draws = jest.spyOn(SeededRandomNumberGenerator.prototype, "getRandomInt");
                const play = jest.spyOn(validSession, "play"),
                    debit = jest.spyOn(wallet, "debit");
                expect(await runtime.execute({kind: "spin", sessionId: "session"})).toMatchObject({status: "corrupt-state"});
                expect(factory).not.toHaveBeenCalled();
                expect(draws).not.toHaveBeenCalled();
                expect(play).not.toHaveBeenCalled();
                expect(debit).not.toHaveBeenCalled();
                expect(await repository.loadVersioned("session")).toEqual(before);
                expect(validSession.toSessionState()).toEqual(executable);
                [factory, draws, play, debit].forEach(spy => spy.mockRestore());
            }
        }
    });

    it("does not publish success on a save failure, retains the cause, compensates and evicts unsafe execution", async () => {
        const game = generated(fractionalBetBlueprint([0.05], true)),
            repository = new InMemorySessionRepository(),
            wallet = new InMemoryWallet();
        await initialize(game, 7, repository, wallet);
        const before = await repository.loadVersioned("session"),
            balance = await wallet.getBalance("session");
        const runtime = new SpinCommandHandler(game, repository, wallet);
        const save = jest.spyOn(repository, "saveVersioned").mockRejectedValueOnce(new Error("disk unavailable"));
        expect(await runtime.execute({kind: "spin", sessionId: "session"})).toMatchObject({status: "storage-error", reason: "disk unavailable"});
        expect(await repository.loadVersioned("session")).toEqual(before);
        expect(await wallet.getBalance("session")).toBe(balance);
        expect(runtime.getLiveSession("session")).toBeUndefined();
        const primary = new Error("primary save failure");
        save.mockRejectedValueOnce(primary);
        await expect(runtime.handle("session")).rejects.toBe(primary);
        save.mockRestore();
        expect(await runtime.execute({kind: "spin", sessionId: "session"})).toMatchObject({status: "played"});
    });

    it("detaches returned and idempotent results from persisted data and each other", async () => {
        const game = generated(fractionalBetBlueprint([0.05], true)),
            repository = new InMemorySessionRepository(),
            wallet = new InMemoryWallet();
        await initialize(game, 7, repository, wallet);
        const runtime = new SpinCommandHandler(game, repository, wallet);
        const result = await runtime.execute({kind: "spin", sessionId: "session", requestId: "retry"});
        if (result.status !== "played") throw new Error("Round was rejected");
        const before = await repository.loadVersioned("session");
        result.state.screen![0][0] = "caller mutation";
        result.state.initialPayload!.bet = 999;
        expect(await repository.loadVersioned("session")).toEqual(before);
        const retry = await runtime.execute({kind: "spin", sessionId: "session", requestId: "retry"});
        expect(retry).toMatchObject({status: "played", state: before!.state});
        if (retry.status !== "played") throw new Error("Retry was rejected");
        retry.state.screen![0][0] = "retry mutation";
        expect(await runtime.execute({kind: "spin", sessionId: "session", requestId: "retry"})).toMatchObject({status: "played", state: before!.state});
    });

    it("executes the documented consumer extension and inspects the portable dependency graph", async () => {
        expect(await extensionRound()).toMatchObject({status: "played", version: 2});
        expect(inspectRuntimeGraph([path.join(root, "src/runtime/SessionRuntime.ts"), path.join(root, "src/browser.ts")], {portable: true}).length).toBeGreaterThan(1);
    });

    it("strictly compiles a real ESM/CJS consumer against freshly emitted package declarations and export conditions", () => {
        const directory = fs.mkdtempSync(path.join(root, "node_modules/.cache/pokie-tmp/v2c02-consumer-"));
        try {
            // Give the consumer its own package scope so NodeNext cannot self-reference
            // the enclosing checkout instead of the freshly emitted dependency below.
            fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({name: "v2c02-consumer", private: true, type: "module"}));
            const packageRoot = path.join(directory, "node_modules/@fromstan/pokie");
            fs.mkdirSync(packageRoot, {recursive: true});
            const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({...metadata, private: true, scripts: {}}));
            const config = ts.readConfigFile(path.join(root, "tsconfig.prod.json"), ts.sys.readFile);
            const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
            const program = ts.createProgram(parsed.fileNames, {...parsed.options, declaration: true, emitDeclarationOnly: true, rootDir: path.join(root, "src"), outDir: path.join(packageRoot, "dist/esm")});
            expect(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
            expect(program.emit().emitSkipped).toBe(false);
            fs.cpSync(path.join(packageRoot, "dist/esm"), path.join(packageRoot, "dist/cjs"), {recursive: true});
            fs.writeFileSync(path.join(packageRoot, "dist/cjs/package.json"), JSON.stringify({type: "commonjs"}));
            const fixture = fs.readFileSync(path.join(root, "tests/v2/fixtures/RuntimeExtension.ts"), "utf8");
            for (const extension of ["mts", "cts"]) {
                const file = path.join(directory, `consumer.${extension}`);
                fs.writeFileSync(file, fixture);
                const consumer = ts.createProgram([file], {strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: ["node"]});
                expect(ts.getPreEmitDiagnostics(consumer).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
                const resolved = ts.resolveModuleName("@fromstan/pokie", file, consumer.getCompilerOptions(), ts.sys, undefined, undefined, extension === "mts" ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS);
                const declaration = path.join(packageRoot, `dist/${extension === "mts" ? "esm" : "cjs"}/index.d.ts`);
                expect(resolved.resolvedModule?.resolvedFileName).toBe(declaration);
                expect(consumer.getSourceFile(declaration)).toBeDefined();
                expect(consumer.getSourceFiles().some(source => source.fileName.startsWith(path.join(root, "dist") + path.sep))).toBe(false);
            }
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    }, 60000);
});

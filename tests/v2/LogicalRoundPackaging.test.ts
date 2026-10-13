import {ControllableDurableWallet} from "../server/wallet/fixtures/ControllableDurableWallet.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {createOverscanGame} from "./fixtures/OverscanGame.js";
import {setTransactionBoundaryHook} from "../../src/server/storage/internal/transactionBoundary.js";

function game(grant = 1, purchased = 3): api.PokieGame {
    return createOverscanGame({
        manifest: {id: "logical-round", name: "Logical round", version: "1"}, reels: 3, rows: 1,
        availableBets: [0.05, 7.5, 1e-7], symbols: ["A", "S"], wilds: [], scatters: ["S"],
        paylines: [[0, 0, 0]], paytable: {A: {"3": 2}, S: {"1": 0}},
        reelStrips: Array.from({length: 3}, () => ["A", "A", "S", "A"]),
        mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"1": grant, "2": 0, "3": 0}}},
        betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: purchased}],
    });
}
function cascadeGame(onCalculate: () => void, options: api.CascadeResolverOptions = {}): api.PokieGame {
    const config = new api.VideoSlotConfig();
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A", "B"]);
    config.setScatterSymbols([]);
    config.setWildSymbols([]);
    config.setAvailableBets([1]);
    config.setBet(1);
    config.setSymbolsSequences(Array.from({length: 3}, () => new api.SymbolsSequence().fromArray(["A"])));
    config.setLinesDefinitions(new api.CustomLinesDefinitions().fromMap({line: [0, 0, 0]}));
    const paytable = new api.Paytable<string>([1], ["A", "B"]);
    paytable.setPayoutForSymbol("A", 3, 2);
    paytable.setPayoutForSymbol("B", 3, 0);
    config.setPaytable(paytable);
    class CascadeSession extends api.AbstractVideoSlotSessionDecorator implements api.CascadeResultProviding {
        private result?: api.CascadeResult;
        private win = 0;
        public getCascadeResult(): api.CascadeResult {
            if (!this.result) throw new Error("No cascade calculated");
            return this.result; 
        }
        public override getSymbolsCombination() {
            return this.result ? new api.SymbolsCombination().fromMatrix(this.result.getFinalScreen()) : this.baseSession.getSymbolsCombination(); 
        }
        public override getWinAmount(): number {
            return this.win; 
        }
        public getStakeAmount(): number {
            return this.getBet(); 
        }
        public override play(): void {
            onCalculate();
            const before = this.getCreditsAmount();
            this.baseSession.play();
            this.result = new api.CascadingSpinResolver(new api.VideoSlotWinCalculator(config).getWinEvaluationPipeline(), config,
                {getRefillSymbols: (_screen, _removed, index) => Array.from({length: 3}, () => [index === 0 ? "A" : "B"])}, undefined, options).resolve(this.baseSession.getSymbolsCombination().toMatrix(), this.getBet());
            this.win = this.result.getTotalCascadeWin();
            this.setCreditsAmount(before - this.getBet() + this.win);
        }
        public getSessionStateSchema(): api.SessionStateSchema {
            return {kind: "custom"}; 
        }
        public isSessionStateRestorable(): boolean {
            return true; 
        }
        public validateSessionState(value: unknown): void {
            const state = value as {base: unknown; win: number};
            if (!state || !Number.isFinite(state.win) || state.win < 0) throw new Error("Invalid cascade continuation");
            (this.baseSession as api.VideoSlotSession).validateSessionState(state.base);
        }
        public toSessionState() {
            return {base: (this.baseSession as api.VideoSlotSession).toSessionState(), win: this.win}; 
        }
        public fromSessionState(value: unknown): this {
            this.validateSessionState(value);
            const state = value as ReturnType<CascadeSession["toSessionState"]>;
            (this.baseSession as api.VideoSlotSession).fromSessionState(state.base);
            this.win = state.win;
            return this;
        }
    }
    return {getManifest: () => ({id: "cascade-delivery", name: "Cascade", version: "1"}), supportsLogicalRoundDelivery: () => true,
        getSessionStateSchema: () => ({kind: "custom"}), getSessionCommandCapabilities: () => ({bets: [1]}),
        validateSessionState: value => {
            const state = value as {base: unknown; win: number};
            if (!state || !Number.isFinite(state.win) || state.win < 0) throw new Error("Invalid cascade continuation");
            api.validateExecutableState(state.base, {kind: "seeded-video-slot", reels: 3, symbols: ["A", "B"]}); 
        },
        createSession: context => new CascadeSession(new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(context?.seed ?? 7)))),
        getSessionSerializer: () => ({getInitialData: session => new api.VideoSlotSessionSerializer().getInitialData(session as api.VideoSlotSessionHandling),
            getRoundData: session => new api.CascadeSessionSerializer().getRoundData(session as CascadeSession)})};
}

function played(result: api.SessionCommandResult) {
    expect(result.status).toBe("played");
    if (result.status !== "played") throw new Error(result.reason);
    return result;
}
function settled(result: api.SpinCommandResult) {
    if (result.status !== "played") throw new Error("reason" in result ? result.reason : result.status);
    expect(result.status).toBe("played");
    return result;
}
function comparable(round: api.LogicalRound) {
    return {...round, entry: undefined, subrounds: round.subrounds.map(step => ({...step, command: undefined}))};
}
function snapshot(session: api.GameSessionHandling) {
    return (session as api.GameSessionHandling & api.ConvertableToSessionState).toSessionState();
}

describe("logical-round delivery and mathematical boundaries", () => {
    it.each(["independent", "local", "external"])("binds completed logical identity independently of request identity (%s)", async composition => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-logical-identity-"));
        const model = game(0);
        const initial = api.captureInitialPokieSessionState({seed: 7}, model.createSession({seed: 7}), model.getSessionSerializer?.(), false, model);
        const repository = new api.InMemorySessionRepository();
        const wallet = new api.InMemoryWallet(initial.credits);
        const provider = composition === "external" ? await ControllableDurableWallet.open(path.join(directory, "provider.sqlite")) : undefined;
        let store: api.TransactionalRoundStore | api.ExternalRoundStore | undefined;
        if (composition === "local") store = await api.SqliteTransactionalRoundStore.open(path.join(directory, "round.sqlite"));
        else if (provider) store = await api.SqliteExternalRoundStore.open(path.join(directory, "round.sqlite"), provider);
        try {
            if (provider) await provider.setBalance("session", initial.credits!);
            if (store) await store.initialize("session", initial, model);
            else await repository.save("session", initial);
            const handler = store ? new api.SpinCommandHandler(model, store) : new api.SpinCommandHandler(model, repository, wallet);
            const entry: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: "entry", roundId: "round", delivery: "composite"};
            const first = settled(await handler.execute(entry));
            expect(first.state.logicalRound?.status).toBe("completed");
            expect(await handler.execute({...entry, requestId: "second"})).toMatchObject({status: "identity-conflict"});
            expect(await handler.execute({kind: "spin", sessionId: "session", requestId: "entry"})).toMatchObject({status: "identity-conflict"});
            const later = settled(await handler.execute({...entry, requestId: "later", roundId: "later"}));
            expect(await handler.execute({...entry, requestId: "third"})).toMatchObject({status: "identity-conflict"});
            expect(await handler.execute(entry)).toEqual(first);
            expect(later.state.logicalRoundStatistics).toMatchObject({rounds: 2, totalStake: 0.1});
            expect(await (store ?? wallet).getBalance("session")).toBe(later.credits);
        } finally {
            await store?.close();
            provider?.close();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("rejects corrupt retained artifacts, commands, cursors and executable progress before effects", async () => {
        const model = game(0);
        const repository = new api.InMemorySessionRepository();
        const wallet = new api.InMemoryWallet(100);
        await repository.save("session", api.captureInitialPokieSessionState({seed: 7}, model.createSession({seed: 7}), model.getSessionSerializer?.(), false, model));
        const first = settled(await new api.SpinCommandHandler(model, repository, wallet).execute({kind: "spin", sessionId: "session", requestId: "entry", roundId: "round", delivery: "stepwise", mode: "buy"}));
        const original = JSON.stringify(first.state);
        const debit = jest.spyOn(wallet, "debit");
        const corruptions: ((state: api.PokieSessionState) => void)[] = [
            state => {
                (state.logicalRound!.subrounds[0].artifacts![0] as {wins: unknown}).wins = "bad";
            },
            state => {
                (state.logicalRound!.subrounds[0].command as unknown as {sessionId: string}).sessionId = "foreign";
            },
            state => {
                (state.logicalRound as {status: string}).status = "completed";
            },
            state => {
                (state.logicalRound as {stageCursor: number}).stageCursor = 0;
            },
            state => {
                (state.featureState as {base: {freeGamesNum: number; freeGamesSum: number}}).base.freeGamesNum = (state.featureState as {base: {freeGamesSum: number}}).base.freeGamesSum;
            },
        ];
        for (const corrupt of corruptions) {
            const state = JSON.parse(original) as api.PokieSessionState;
            corrupt(state);
            await repository.save("session", state);
            const version = (await repository.loadVersioned("session"))!.version;
            const result = await new api.SpinCommandHandler(model, repository, wallet).execute({kind: "spin", sessionId: "session", requestId: "next", continuation: {roundId: "round", cursor: 1}});
            expect(result).toMatchObject({status: "corrupt-state"});
            expect((await repository.loadVersioned("session"))!.version).toBe(version);
        }
        expect(debit).not.toHaveBeenCalled();
    });

    it("a thrown composite successor exposes its committed prefix and exact retry identity", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-logical-thrown-"));
        const model = game(0);
        const store = await api.SqliteTransactionalRoundStore.open(path.join(directory, "round.sqlite"));
        try {
            await store.initialize("session", api.captureInitialPokieSessionState({seed: 7}, model.createSession({seed: 7}), model.getSessionSerializer?.(), false, model), model);
            let committed = false;
            setTransactionBoundaryHook(store, boundary => {
                if (boundary === "after:commit") committed = true;
                if (committed && boundary === "before:request") throw new Error("successor storage failure");
                return Promise.resolve();
            });
            const handler = new api.SpinCommandHandler(model, store);
            const entry: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: "composite", roundId: "round", delivery: "composite", mode: "buy"};
            expect(await handler.execute(entry)).toMatchObject({status: "storage-error", committedProgress: {roundId: "round", cursor: 1, requestId: "composite"}});
            expect((await store.readSession("session"))!.state.logicalRound?.cursor).toBe(1);
            setTransactionBoundaryHook(store, () => Promise.resolve());
            expect(settled(await handler.execute(entry)).state.logicalRound).toMatchObject({status: "completed", cursor: 3, totalStake: 0.25});
        } finally {
            await store.close();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("uses the execution contract for base and unsupported custom capabilities", () => {
        const base = new api.GameSession();
        expect(api.SessionRuntime.supportsLogicalRoundDelivery(base)).toBe(true);
        expect(new api.SessionRuntime(base).execute({kind: "spin", delivery: "composite", roundId: "base"})).toMatchObject({status: "played", logicalRound: {status: "completed", cursor: 1}});
        const custom = {...base, getBet: () => 1} as unknown as api.GameSessionHandling;
        expect(api.SessionRuntime.supportsLogicalRoundDelivery(custom)).toBe(false);
        expect(new api.SessionRuntime(custom).execute({kind: "spin", delivery: "stepwise", roundId: "custom"})).toMatchObject({status: "invalid-command"});
    });

    it("exhausted cascades cannot publish completed replay or logical statistics", () => {
        const model = cascadeGame(() => undefined, {maxCascadeSteps: 1, onMaxCascadeStepsExceeded: "stop"});
        expect(() => new api.ReplayRecorder().record({game: model, round: 1, unit: "logical-round"})).toThrow(/exhausted/);
        expect(() => new api.ReplayRecorder().record({game: model, round: 1})).toThrow(/exhausted/);
        const statistics = new api.AggregateSimulationRunner(model.createSession({seed: 7}), 1).run().getStatistics();
        expect(statistics.rounds).toBe(1);
        expect(statistics.logicalRounds).toBeUndefined();
    });

    it.each([0.05, 7.5, 1e-7])("packages the identical paid entry, retriggers, bank and next RNG round at bet %s", bet => {
        const a = game().createSession({seed: 17}), 
            b = game().createSession({seed: 17});
        const runtime = new api.SessionRuntime(a);
        let step = played(runtime.execute({kind: "spin", delivery: "stepwise", roundId: "round", bet, mode: "buy"}));
        const composite = played(new api.SessionRuntime(b).execute({kind: "spin", delivery: "composite", roundId: "round", bet, mode: "buy"}));
        while (step.logicalRound!.status === "pending") step = played(runtime.execute({kind: "spin", continuation: {roundId: "round", cursor: step.logicalRound!.deliveryCursor}, delivery: "stepwise"}));
        expect(comparable(step.logicalRound!)).toEqual(comparable(composite.logicalRound!));
        expect(step.logicalRound!.totalStake).toBe(bet * 5);
        expect(step.logicalRound!.subrounds.slice(1).every(s => s.stake === 0)).toBe(true);
        expect(step.logicalRound!.totalPayout).toBeCloseTo(step.logicalRound!.totalWin, 6);
        expect(snapshot(a)).toEqual(snapshot(b));
        expect(a.getCreditsAmount()).toEqual(b.getCreditsAmount());
        expect(played(runtime.execute({kind: "spin"}))).toEqual(played(new api.SessionRuntime(b).execute({kind: "spin"})));
        expect(snapshot(a)).toEqual(snapshot(b));
        expect((a as api.GameSessionHandling & api.BetModeSelecting).getBetModeId()).toBe("base");
    });

    it("cascade bound exhaustion retains its evaluated prefix and cannot purchase another entry", () => {
        const session = cascadeGame(() => undefined, {maxCascadeSteps: 1, onMaxCascadeStepsExceeded: "stop"}).createSession({seed: 7});
        const runtime = new api.SessionRuntime(session);
        const result = played(runtime.execute({kind: "spin", delivery: "composite", roundId: "bounded-cascade"}));
        expect(result.logicalRound).toMatchObject({status: "exhausted", mathematicalStatus: "exhausted", cursor: 1, totalStake: 1, totalWin: 2});
        expect(runtime.execute({kind: "spin", roundId: "next", delivery: "stepwise"})).toMatchObject({status: "invalid-command"});
        const throwing = cascadeGame(() => undefined, {maxCascadeSteps: 1, onMaxCascadeStepsExceeded: "throw"}).createSession({seed: 7});
        const before = snapshot(throwing), 
            credits = throwing.getCreditsAmount();
        expect(() => new api.SessionRuntime(throwing).execute({kind: "spin", delivery: "composite", roundId: "throw"})).toThrow(api.MaxCascadeStepsExceededError);
        expect(snapshot(throwing)).toEqual(before);
        expect(throwing.getCreditsAmount()).toBe(credits);
    });

    it("retains direct duplicate deliveries even after another round without another draw", () => {
        const session = game().createSession({seed: 17}), 
            runtime = new api.SessionRuntime(session);
        const entry: api.SessionCommand = {kind: "spin", roundId: "first", delivery: "composite", mode: "buy"};
        const saved = played(runtime.execute(entry));
        runtime.execute({kind: "spin", roundId: "second", delivery: "composite"});
        const before = snapshot(session);
        expect(runtime.execute(entry)).toEqual(saved);
        expect(runtime.execute({...entry, mode: "base"})).toMatchObject({status: "invalid-command"});
        expect(snapshot(session)).toEqual(before);
        expect(Object.isFrozen(runtime.getLogicalRound())).toBe(false);
    });

    it("rejects foreign, skipped, stale and entry-changing continuations before mutation", () => {
        const session = game().createSession({seed: 17}), 
            runtime = new api.SessionRuntime(session);
        played(runtime.execute({kind: "spin", roundId: "round", delivery: "stepwise", mode: "buy"}));
        const before = snapshot(session), 
            credits = session.getCreditsAmount();
        for (const command of [
            {kind: "spin", continuation: {roundId: "foreign", cursor: 1}},
            {kind: "spin", continuation: {roundId: "round", cursor: 2}},
            {kind: "spin", continuation: {roundId: "round", cursor: 1}, bet: 7.5},
            {kind: "spin", delivery: "stepwise", roundId: "purchase", mode: "buy"},
            {kind: "spin"},
        ] as api.SessionCommand[]) expect(runtime.execute(command)).toMatchObject({status: "invalid-command"});
        expect(snapshot(session)).toEqual(before);
        expect(session.getCreditsAmount()).toBe(credits);
    });

    it("rejects a mutated entry bet or paid continuation before another draw", () => {
        const session = game(0).createSession({seed: 7}), 
            runtime = new api.SessionRuntime(session);
        played(runtime.execute({kind: "spin", roundId: "round", delivery: "stepwise", mode: "buy"}));
        session.setBet(7.5);
        const before = snapshot(session), 
            play = jest.spyOn(session, "play");
        expect(runtime.execute({kind: "spin", continuation: {roundId: "round", cursor: 1}})).toMatchObject({status: "invalid-command"});
        expect(snapshot(session)).toEqual(before);
        expect(play).not.toHaveBeenCalled();
        session.setBet(0.05);
        jest.spyOn(session as api.GameSessionHandling & api.StakeAmountDetermining, "getStakeAmount").mockReturnValue(0.05);
        expect(runtime.execute({kind: "spin", continuation: {roundId: "round", cursor: 1}})).toMatchObject({status: "invalid-command"});
        expect(play).not.toHaveBeenCalled();
    });

    it("an unsupported purchase rolls back the selected mode before it can become latent", () => {
        const config = new api.VideoSlotConfig();
        const session = new api.VideoSlotWithBetModesSession(new api.VideoSlotSession(config),
            new api.BetModesConfig([new api.BetModeDefinition("base"), new api.BetModeDefinition("buy", {forcesFeatureEntry: true, stakeMultiplier: 5})], "base"));
        const before = session.getCreditsAmount();
        expect(new api.SessionRuntime(session).execute({kind: "spin", mode: "buy", roundId: "buy", delivery: "stepwise"})).toMatchObject({status: "blocked"});
        expect(session.getBetModeId()).toBe("base");
        expect(session.getCreditsAmount()).toBe(before);
    });

    it("zero natural grants complete one entry, while a bounded feature keeps an explicit successor", () => {
        const session = game(0).createSession({seed: 7}), 
            runtime = new api.SessionRuntime(session);
        const result = played(runtime.execute({kind: "spin", roundId: "zero", delivery: "composite"}));
        expect(result.logicalRound).toMatchObject({status: "completed", cursor: 1, totalStake: 0.05});
        const long = game(0).createSession({seed: 7}), 
            bounded = new api.SessionRuntime(long);
        const prefix = played(bounded.execute({kind: "spin", roundId: "bounded", mode: "buy", delivery: "composite", maxSubrounds: 1}));
        expect(prefix.logicalRound).toMatchObject({status: "pending", cursor: 1});
        const end = played(bounded.execute({kind: "spin", continuation: {roundId: "bounded", cursor: 1}, delivery: "composite"}));
        expect(end.logicalRound).toMatchObject({status: "completed", cursor: 3, totalStake: 0.25});
    });

    it("shared retry retention preserves detached historical prefixes of a long chain", () => {
        const session = game(0, 30).createSession({seed: 7});
        const runtime = new api.SessionRuntime(session);
        const entries: {command: api.SessionCommand; output: api.SessionCommandResult}[] = [];
        let command: api.SessionCommand = {kind: "spin", delivery: "stepwise", roundId: "shared", mode: "buy"};
        while (entries.length === 0 || runtime.hasPendingLogicalRound()) {
            const output = played(runtime.execute(command));
            entries.push({command, output});
            if (output.logicalRound?.status !== "pending") break;
            command = {kind: "spin", delivery: "stepwise", continuation: {roundId: "shared", cursor: output.logicalRound.deliveryCursor}};
        }
        const before = snapshot(session);
        for (const entry of entries) {
            expect(runtime.execute(entry.command)).toEqual(entry.output);
            const detached = played(runtime.execute(entry.command));
            (detached.logicalRound!.subrounds[0] as {win: number}).win = 999;
            expect(runtime.execute(entry.command)).toEqual(entry.output);
        }
        expect(snapshot(session)).toEqual(before);
        expect(entries).toHaveLength(30);
    });

    it("finishes a long finite feature iteratively and settles its bank once", () => {
        const session = game(0, 150).createSession({seed: 7});
        const runtime = new api.SessionRuntime(session);
        const result = played(runtime.execute({kind: "spin", roundId: "long", delivery: "composite", mode: "buy", maxSubrounds: 151}));
        expect(result.logicalRound).toMatchObject({status: "completed", cursor: 150, totalStake: 0.25});
        expect(result.logicalRound!.totalPayout).toBeCloseTo(result.logicalRound!.totalWin, 6);
        expect(runtime.execute({kind: "spin", continuation: {roundId: "long", cursor: 150}})).toMatchObject({status: "invalid-command"});
    });

    it("a retrigger on the nominal last free game postpones completion and bank release", () => {
        const config = new api.VideoSlotConfig();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(1);
        config.setAvailableSymbols(["A", "S"]);
        config.setScatterSymbols(["S"]);
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setLinesDefinitions(new api.CustomLinesDefinitions().fromMap({line: [0, 0, 0]}));
        const table = new api.Paytable<string>([1], ["A", "S"]);
        table.setPayoutForSymbol("A", 3, 2);
        table.setPayoutForSymbol("S", 3, 0);
        config.setPaytable(table);
        const free = new api.VideoSlotWithFreeGamesConfig(config, {});
        free.setFreeGamesForScatters("S", 3, 2);
        const screens = ["A", "S", "A", "S", "A", "A"];
        let draw = 0;
        const session = new api.VideoSlotWithFreeGamesSession(free, {generateSymbolsCombination: () => {
            const symbol = screens[draw++];
            return new api.SymbolsCombination().fromMatrix(Array.from({length: 3}, () => [symbol])); 
        }});
        const runtime = new api.SessionRuntime(session);
        let result = played(runtime.execute({kind: "spin", roundId: "retrigger", delivery: "stepwise"}));
        expect(result.logicalRound?.cursor).toBe(1);
        result = played(runtime.execute({kind: "spin", continuation: {roundId: "retrigger", cursor: 1}}));
        const credits = result.credits;
        result = played(runtime.execute({kind: "spin", continuation: {roundId: "retrigger", cursor: 2}}));
        expect(result.logicalRound).toMatchObject({status: "pending", cursor: 3});
        expect(result.credits).toBe(credits);
        result = played(runtime.execute({kind: "spin", continuation: {roundId: "retrigger", cursor: 3}, delivery: "composite"}));
        expect(result.logicalRound).toMatchObject({status: "completed", cursor: 5, totalStake: 1, totalWin: 6, totalPayout: 6});
        expect(draw).toBe(6);
        // Includes the initial display, with no extra finishing draw.
    });

    it("logical statistics close once across chunk boundaries without changing step quotas", () => {
        const session = game(0).createSession({seed: 7});
        (session as api.GameSessionHandling & api.BetModeSelecting).setBetMode("buy");
        const a = new api.AggregateSimulationRunner(session, 1).run();
        const b = new api.AggregateSimulationRunner(session, 2).run();
        expect(a.getStatistics().rounds).toBe(1);
        expect(a.getStatistics().logicalRounds).toBeUndefined();
        expect(b.getStatistics().logicalRounds).toEqual({rounds: 1, steps: 3, totalStake: 0.25, totalWin: expect.any(Number)});
        a.merge(b);
        expect(api.SimulationAccumulator.fromSnapshot(a.toSnapshot()).getStatistics().logicalRounds).toEqual(b.getStatistics().logicalRounds);
    });

    it("does not fabricate a completed observation for a feature tail whose entry was not observed", () => {
        const session = game(0).createSession({seed: 7});
        (session as api.GameSessionHandling & api.BetModeSelecting).setBetMode("buy");
        session.play();
        const statistics = new api.AggregateSimulationRunner(session, 2).run().getStatistics();
        expect(statistics.rounds).toBe(2);
        expect(statistics.logicalRounds).toBeUndefined();
    });

    it("replay addresses a logical round with its actual entry command and ordered artifact", () => {
        const descriptor = new api.ReplayRecorder().record({game: game(0), seed: "7", round: 1, unit: "logical-round", entryCommands: [{kind: "spin", mode: "buy", bet: 7.5}]});
        expect(descriptor.logicalRound).toMatchObject({status: "completed", cursor: 3, totalStake: 37.5, mode: "buy"});
        expect(descriptor.artifact!.provenance.configHash).toBe(game(0).getConfigHash!());
        expect(descriptor.artifact!.steps).toHaveLength(3);
        expect(descriptor.totalWin).toBe(descriptor.artifact!.totalWin);
    });

    it("restarts at each committed subround and replays historical/final outputs independently", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-logical-")), 
            filename = path.join(directory, "round.sqlite");
        const model = game(0);
        let store = await api.SqliteTransactionalRoundStore.open(filename);
        try {
            const initial = api.captureInitialPokieSessionState({seed: 7}, model.createSession({seed: 7}), model.getSessionSerializer?.(), false, model);
            await store.initialize("session", initial, model);
            const command: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: "entry", roundId: "round", delivery: "stepwise", mode: "buy", expectedVersion: 1};
            const first = settled(await new api.SpinCommandHandler(model, store, {captureDebugSessionData: false}).execute(command));
            let current = first;
            const history: {command: api.RepositoryCommand; result: api.SpinCommandResult}[] = [{command, result: first}];
            while (current.state.logicalRound!.status === "pending") {
                await store.close();
                store = await api.SqliteTransactionalRoundStore.open(filename);
                const next: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: `next:${current.version}`, delivery: "stepwise", expectedVersion: current.version,
                    continuation: {roundId: "round", cursor: current.state.logicalRound!.deliveryCursor}};
                const handler = new api.SpinCommandHandler(game(0), store, {captureDebugSessionData: false});
                const [owner, duplicate] = await Promise.all([handler.execute(next), handler.execute(next)]);
                expect(duplicate).toEqual(owner);
                current = settled(owner);
                history.push({command: next, result: current});
            }
            expect(current.state.logicalRound!.cursor).toBe(3);
            const version = (await store.readSession("session"))!.version;
            for (const saved of history) expect(await new api.SpinCommandHandler(game(0), store).execute(saved.command)).toEqual(saved.result);
            expect((await store.readSession("session"))!.version).toBe(version);
            expect(await store.getBalance("session")).toBe(current.credits);
            expect(await new api.SpinCommandHandler(model, store).execute({...command, delivery: "composite"})).toMatchObject({status: "identity-conflict"});
            expect(await new api.SpinCommandHandler(model, store).execute({kind: "spin", sessionId: "session", requestId: "stale", continuation: {roundId: "round", cursor: 1}})).toMatchObject({status: "invalid-command"});
        } finally {
            await store.close();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it.each([false, true])("restart delivers saved cascade stages without calculation or settlement (external=%s)", async external => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-cascade-delivery-"));
        let calculations = 0;
        const model = cascadeGame(() => calculations++);
        const provider = external ? await ControllableDurableWallet.open(path.join(directory, "provider.sqlite")) : undefined;
        const filename = path.join(directory, "round.sqlite");
        const open = () => provider ? api.SqliteExternalRoundStore.open(filename, provider) : api.SqliteTransactionalRoundStore.open(filename);
        let store = await open();
        try {
            const initial = api.captureInitialPokieSessionState({seed: 7}, model.createSession({seed: 7}), model.getSessionSerializer?.(), false, model);
            if (provider) await provider.setBalance("session", initial.credits!);
            await store.initialize("session", initial, model);
            let result = settled(await new api.SpinCommandHandler(model, store).execute({kind: "spin", sessionId: "session", requestId: "entry", delivery: "stepwise", roundId: "round"}));
            expect(result.state.logicalRound).toMatchObject({status: "pending", mathematicalStatus: "completed", cursor: 1, deliveryCursor: 1});
            const balance = await store.getBalance("session");
            const debit = provider && jest.spyOn(provider, "debit"), 
                credit = provider && jest.spyOn(provider, "credit");
            while (result.state.logicalRound!.status === "pending") {
                await store.close();
                store = await open();
                const command: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: `stage:${result.state.logicalRound!.deliveryCursor}`, delivery: "stepwise",
                    continuation: {roundId: "round", cursor: result.state.logicalRound!.deliveryCursor}};
                const handler = new api.SpinCommandHandler(model, store);
                result = settled(await handler.execute(command));
                expect(result.deliveryOnly).toBe(true);
                expect(await handler.execute(command)).toEqual(result);
            }
            expect(result.state.logicalRound).toMatchObject({status: "completed", cursor: 1, deliveryCursor: 3, totalStake: 1, totalWin: 4});
            expect(result.state.logicalRoundStatistics?.rounds).toBe(1);
            expect(calculations).toBe(1);
            expect(await store.getBalance("session")).toBe(balance);
            if (provider) {
                expect(debit).not.toHaveBeenCalled();
                expect(credit).not.toHaveBeenCalled(); 
            }
        } finally {
            await store.close();
            provider?.close();
            fs.rmSync(directory, {recursive: true, force: true}); 
        }
    });

    it("cancellation after commit preserves the prefix and resumes its exact successor", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-logical-cancel-"));
        const model = game(0), 
            store = await api.SqliteTransactionalRoundStore.open(path.join(directory, "round.sqlite"));
        const abort = new AbortController();
        try {
            await store.initialize("session", api.captureInitialPokieSessionState({seed: 7}, model.createSession({seed: 7}), model.getSessionSerializer?.(), false, model), model);
            setTransactionBoundaryHook(store, boundary => {
                if (boundary === "after:commit") abort.abort();
                return Promise.resolve();
            });
            const handler = new api.SpinCommandHandler(model, store);
            const command: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: "composite", roundId: "round", delivery: "composite", mode: "buy"};
            const prefix = settled(await handler.execute(command, abort.signal));
            expect(prefix.state.logicalRound).toMatchObject({status: "pending", cursor: 1});
            setTransactionBoundaryHook(store, () => Promise.resolve());
            const resumed = settled(await handler.execute(command));
            expect(resumed.state.logicalRound).toMatchObject({status: "completed", cursor: 3, totalStake: 0.25});
            expect(await handler.execute(command)).toEqual(resumed);
        } finally {
            setTransactionBoundaryHook(store, () => Promise.resolve());
            await store.close();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
});

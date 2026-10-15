import fs from "node:fs";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {generatedMechanicsGame, mechanicsSession} from "./fixtures/ExistingMechanicsGame.js";
import {StudioPlayService} from "../../cli/studio/runtime/StudioPlayService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";

const catalogue = api.AUTHORED_MODIFIER_CATALOG;
function fixture(id: (typeof catalogue)[number] = "multiplier"): api.GameBlueprint {
    return JSON.parse(
        fs.readFileSync(path.join(__dirname, `../../examples/blueprints/wild-${id}.blueprint.json`), "utf8"),
    );
}
const errors = (b: unknown) =>
    new api.GameBlueprintValidator().validate(b).filter((issue) => issue.severity === "error");
function directConfig(blueprint: api.GameBlueprint): api.VideoSlotConfig {
    const config = new api.VideoSlotConfig();
    config.setReelsNumber(blueprint.reels);
    config.setReelsSymbolsNumber(blueprint.rows);
    config.setAvailableBets(blueprint.availableBets!);
    config.setWildSymbols(blueprint.wilds!);
    config.setScatterSymbols(blueprint.scatters!);
    config.setAvailableSymbols(blueprint.symbols);
    config.setScreenGeometry(blueprint.screenGeometry);
    const paytable = new api.Paytable(config.getAvailableBets());
    for (const [symbol, payouts] of Object.entries(blueprint.paytable)) for (const [count, amount] of Object.entries(payouts)) paytable.setPayoutForSymbol(symbol, Number(count), amount);
    config.setPaytable(paytable);
    config.setSymbolsSequences(blueprint.reelStrips!.map((strip) => new api.SymbolsSequence().fromArray(strip)));
    config.setScreenModifiers(blueprint.mechanics!.modifiers);
    config.setBet(0.05);
    config.setCreditsAmount(10000);
    return config;
}

describe("V2C-13 finite modifier authoring", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c13-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it.each(["component", "aggregate", "balance"] as const)("%s overflow rejects atomically and seeded retry matches uninterrupted execution", failure => {
        const b = fixture("sticky");
        b.rows = failure === "aggregate" ? 3 : 1;
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        const config = directConfig(b);
        const generator = new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31));
        const session = new api.VideoSlotSession(config, generator);
        session.setBet(1e-7);
        session.play(); // Retain a real sticky cell and a successful prior observation.
        const reference = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31)));
        reference.fromSessionState(JSON.parse(JSON.stringify(session.toSessionState())));
        const before = session.toSessionState();
        const selections = generator.getSelectionState();
        const screen = session.getSymbolsCombination().toMatrix();
        session.setBet(failure === "component" ? 7.5 : 0.05);
        session.setCreditsAmount(failure === "balance" ? Number.MAX_VALUE : 10000);
        const credits = session.getCreditsAmount();
        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => session.play()).toThrow(/overflow/);
            expect(session.toSessionState()).toEqual(before);
            expect(generator.getSelectionState()).toEqual(selections);
            expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(session.getCreditsAmount()).toBe(credits);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
            expect(session.getWinningLines()).toEqual({});
            expect(session.getModifierObservation()).toBeUndefined();
            const artifact = api.buildRoundArtifactFromSession(session, {roundId: "rejected", provenance: {game: b.manifest, pokieVersion: "1.3.0"}});
            expect(artifact.totalWin).toBe(0);
            expect(artifact.featureEvents).toBeUndefined();
        }
        for (const candidate of [session, reference]) {
            candidate.setBet(1e-7);
            candidate.setCreditsAmount(10000);
            candidate.play();
        }
        expect(session.toSessionState()).toEqual(reference.toSessionState());
        expect(session.getCreditsAmount()).toBe(reference.getCreditsAmount());
        expect(session.getWinEvaluationResult()).toEqual(reference.getWinEvaluationResult());
        expect(session.getModifierObservation()).toEqual(reference.getModifierObservation());
    });

    it("generated three-row MAX_VALUE modifier payout rejects instead of settling an infinite aggregate", () => {
        const b = fixture("sticky");
        b.rows = 3;
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        const session = mechanicsSession(generatedMechanicsGame(b));
        const before = session.toSessionState();
        expect(() => session.play()).toThrow(/overflow/);
        expect(session.toSessionState()).toEqual(before);
        expect(session.getCreditsAmount()).toBe(10000);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getModifierObservation!()).toBeUndefined();
    });

    it.each(["bank", "terminal-balance", "funding"] as const)("F1a/F1b generated free-game %s rejection restores the complete continuation", failure => {
        const b = fixture("sticky");
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
        const game = generatedMechanicsGame(b);
        const session = mechanicsSession(game) as ReturnType<typeof mechanicsSession> & api.VideoSlotWithFreeGamesSessionHandling;
        session.setFreeGamesSum(failure === "terminal-balance" ? 1 : 3);
        session.setCreditsAmount(failure === "terminal-balance" ? Number.MAX_VALUE / 2 : 0);
        if (failure === "terminal-balance") session.setFreeGamesBank(Number.MAX_VALUE / 2);
        session.setBet(failure === "funding" ? 7.5 : 0.05);
        if (failure === "bank") {
            session.play();
            expect(session.getFreeGamesBank()).toBe(8.988465674311579e307);
            session.play();
            expect(session.getFreeGamesBank()).toBe(Number.MAX_VALUE);
            expect(session.getFreeGamesNum()).toBe(2);
        }
        const before = JSON.parse(JSON.stringify(session.toSessionState()));
        const credits = session.getCreditsAmount();
        const screen = session.getSymbolsCombination().toMatrix();
        const reference = mechanicsSession(game) as ReturnType<typeof mechanicsSession> & api.VideoSlotWithFreeGamesSessionHandling;
        reference.fromSessionState(before);
        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => session.play()).toThrow(/overflow/);
            expect(session.getCreditsAmount()).toBe(credits);
            expect(session.toSessionState()).toEqual(before);
            expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
            expect(session.getModifierObservation!()).toBeUndefined();
            expect(new api.VideoSlotSessionSerializer().getRoundData(session).totalWin).toBe(0);
        }
        // Clear only the already-tested bank/final-balance obstacle; retry consumes the same
        // seeded screen and retained lifetime as a fresh restoration of the pre-call state.
        for (const candidate of [session, reference]) {
            candidate.setFreeGamesBank(0);
            candidate.setBet(1e-7);
            candidate.setCreditsAmount(0);
            candidate.play();
        }
        expect(session.toSessionState()).toEqual(reference.toSessionState());
        expect(session.getCreditsAmount()).toBe(reference.getCreditsAmount());
        expect(session.getModifierObservation!()).toEqual(reference.getModifierObservation!());
    });

    it.each(["ante", "buy"])("F1c generated rejected %s preserves mode intent, charges, grants and weighted selections", mode => {
        const b = fixture("sticky");
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
        b.betModes = [{id: "base", runtimeType: "base", isDefault: true},
            {id: "ante", runtimeType: "ante", costMultiplier: 2},
            {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2}];
        Reflect.deleteProperty(b, "reelStrips");
        b.reelSequences = ["A", "W2", "A"].map(symbol => ({type: "weighted", variants: [
            {id: "first", symbols: [symbol], weight: 1}, {id: "second", symbols: ["B"], weight: 2},
        ]}));
        b.mechanics!.modifiers!.rules.unshift(
            {id: "side-transform", type: "transform", space: "evaluated", positions: [[0, 0], [2, 0]], from: "B", to: "A"},
            {id: "wild-transform", type: "transform", space: "evaluated", positions: [[1, 0]], from: "B", to: "W2"},
        );
        const game = generatedMechanicsGame(b),
            session = mechanicsSession(game);
        session.setBet(7.5);
        session.setBetMode!(mode);
        const before = JSON.parse(JSON.stringify(session.toSessionState()));
        const selections = session.getSequenceSelections!();
        const statistics = session.getSequenceStatistics!();
        const reference = mechanicsSession(game);
        reference.fromSessionState(before);
        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => session.play()).toThrow(/overflow/);
            expect(session.getCreditsAmount()).toBe(10000);
            expect(session.toSessionState()).toEqual(before);
            expect(session.getBetModeId!()).toBe(mode);
            expect(api.observeVideoSlotFeatures(session).chargedBetModeId).toBeUndefined();
            expect(session.getSequenceSelections!()).toEqual(selections);
            expect(session.getSequenceStatistics!()).toEqual(statistics);
        }
        for (const candidate of [session, reference]) {
            candidate.setBet(1e-7);
            candidate.play();
        }
        expect(session.toSessionState()).toEqual(reference.toSessionState());
        expect(session.getCreditsAmount()).toBe(reference.getCreditsAmount());
        expect(api.observeVideoSlotFeatures(session).chargedBetModeId).toBe(mode);
        expect(session.getBetModeId!()).toBe(mode === "buy" ? "base" : "ante");
        if (mode === "buy") expect(session.getCreditsAmount()).toBe(10000 - 10e-7);
        expect(session.getWinEvaluationResult()).toEqual(reference.getWinEvaluationResult());
    });

    it.each((["fixed", "accumulating"] as const).flatMap(type => ["base", "buy"].map(mode => ({type, mode}))))("F1d generated $type/$mode jackpot overflow rolls back nested free games, modes, pools and statistics", ({type, mode}) => {
        const b = fixture("sticky");
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
        b.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 1}];
        b.mechanics!.jackpot = {pool: type === "fixed" ? {id: "mini", type, amount: Number.MAX_VALUE} : {id: "mini", type, seedValue: Number.MAX_VALUE},
            contribution: {type: "percentage", percentage: 0.1}, trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1}, award: "single-tier"};
        const game = generatedMechanicsGame(b),
            session = mechanicsSession(game);
        session.setBetMode!(mode);
        const before = JSON.parse(JSON.stringify(session.toSessionState()));
        const reference = mechanicsSession(game);
        reference.fromSessionState(before);
        for (const candidate of [session, reference]) {
            expect(() => candidate.play()).toThrow(/overflow/);
            expect(candidate.toSessionState()).toEqual(before);
            expect(candidate.getCreditsAmount()).toBe(10000);
            expect(candidate.getWinAmount()).toBe(0);
            expect(candidate.getWinEvaluationResult().getWinComponents()).toEqual([]);
            const observation = api.observeVideoSlotFeatures(candidate);
            expect(observation.modifiers).toBeUndefined();
            expect(observation.jackpot).toMatchObject({pools: [{id: "mini", value: Number.MAX_VALUE}], statistics: {}});
            expect(observation.jackpot!.award).toBeUndefined();
        }
    });

    it.each(["fixed", "accumulating"] as const)("F1d failed generated step after a successful %s jackpot exposes no prior payout or award", type => {
        const b = fixture("sticky");
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.jackpot = {pool: type === "fixed" ? {id: "mini", type, amount: 10} : {id: "mini", type, seedValue: 10},
            contribution: {type: "percentage", percentage: 0.1}, trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1}, award: "single-tier"};
        const game = generatedMechanicsGame(b),
            session = mechanicsSession(game);
        session.setBet(1e-7);
        session.play();
        expect(api.observeVideoSlotFeatures(session).jackpot!.award).toBeDefined();
        const before = JSON.parse(JSON.stringify(session.toSessionState()));
        const credits = session.getCreditsAmount();
        const reference = mechanicsSession(game);
        reference.fromSessionState(before);
        session.setBet(7.5);
        expect(() => session.play()).toThrow(/overflow/);
        expect(session.toSessionState()).toEqual(before);
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
        const data = new api.VideoSlotSessionSerializer().getRoundData(session);
        expect(data.totalWin).toBe(0);
        expect(data.winningPositions).toEqual([]);
        expect(data.jackpot!.award).toBeUndefined();
        expect(data.modifiers).toBeUndefined();
        const artifact = api.buildRoundArtifactFromSession(session, {roundId: "rejected", provenance: {game: b.manifest, pokieVersion: "1.3.0"}});
        expect(artifact.totalWin).toBe(0);
        expect(artifact.featureEvents?.find(event => event.type === "jackpot")?.data).not.toHaveProperty("award");
        session.setCreditsAmount(0);
        session.play(); // An insufficient-credit no-op must not make a rejected result visible again.
        expect(session.getWinAmount()).toBe(0);
        expect(api.observeVideoSlotFeatures(session).jackpot!.award).toBeUndefined();
        for (const candidate of [session, reference]) {
            candidate.setBet(1e-7);
            candidate.setCreditsAmount(10000);
            candidate.play();
        }
        expect(session.toSessionState()).toEqual(reference.toSessionState());
        expect(session.getCreditsAmount()).toBe(reference.getCreditsAmount());
        expect(session.getWinEvaluationResult()).toEqual(reference.getWinEvaluationResult());
    });

    it.each([undefined, "stepwise", "composite"].flatMap(delivery => [false, true].flatMap(prepared => [false, true].map(jackpot =>
        ({delivery: delivery as api.SessionCommand["delivery"], prepared, jackpot}))),
    ))("F1f generated sticky/$delivery prepared=$prepared jackpot=$jackpot recovers selections and hides rejected observations", ({delivery, prepared, jackpot}) => {
        const b = fixture("sticky");
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
        b.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 2},
            {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2}];
        Reflect.deleteProperty(b, "reelStrips");
        b.reelSequences = ["A", "W2", "A"].map(symbol => ({type: "weighted", variants: [
            {id: "first", symbols: [symbol], weight: 1}, {id: "second", symbols: [symbol, symbol], weight: 2},
        ]}));
        if (jackpot) b.mechanics!.jackpot = {pool: {id: "mini", type: "fixed", amount: 10}, contribution: {type: "percentage", percentage: 0.1},
            trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1}, award: "single-tier"};
        const game = generatedMechanicsGame(b);
        const session = mechanicsSession(game);
        const runtime = new api.SessionRuntime(session);
        const success: api.SessionCommand = {kind: "spin", bet: 1e-7, mode: "ante", roundId: "settled", delivery: "composite"};
        const saved = runtime.execute(success);
        expect(saved.status).toBe("played");
        expect(session.getWinAmount()).toBeGreaterThan(1e302);
        const serializer = new api.VideoSlotSessionSerializer();
        const settledData = serializer.getRoundData(session);
        if (jackpot) expect(settledData.jackpot?.award).toEqual({poolId: "mini", amount: 10});
        expect(runtime.execute({kind: "spin", mode: "missing"})).toMatchObject({status: "invalid-command"});
        expect(serializer.getRoundData(session)).toEqual(settledData);
        if (prepared) session.setSelectionContext!("pending:unchanged");
        const before = JSON.parse(JSON.stringify(session.toSessionState()));
        const selections = session.getSequenceSelections!();
        const statistics = session.getSequenceStatistics!();
        const credits = session.getCreditsAmount();
        const reference = mechanicsSession(game);
        reference.fromSessionState(before);
        reference.setBet(1e-7);
        reference.setCreditsAmount(credits);
        const command: api.SessionCommand = {kind: "spin", bet: 7.5, mode: "buy", roundId: "bad", delivery};
        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => {
                if (!prepared) return runtime.execute(command);
                const ready = runtime.prepare(command, credits);
                if (ready.status !== "ready") throw new Error(ready.reason);
                return ready.execute();
            }).toThrow(/overflow/);
            expect(session.toSessionState()).toEqual(before);
            expect(session.getBet()).toBe(1e-7);
            expect(session.getBetModeId!()).toBe("ante");
            expect(session.getCreditsAmount()).toBe(credits);
            expect(session.getSequenceSelections!()).toEqual(selections);
            expect(session.getSequenceStatistics!()).toEqual(statistics);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinningLines()).toEqual({});
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
            const data = serializer.getRoundData(session);
            expect(data.totalWin).toBe(0);
            expect(data.winningPositions).toEqual([]);
            expect(data.modifiers).toBeUndefined();
            expect(data.jackpot?.award).toBeUndefined();
            const artifact = api.buildRoundArtifactFromSession(session, {roundId: "rejected", provenance: {game: b.manifest, pokieVersion: "1.3.0"}});
            expect(artifact.totalWin).toBe(0);
            expect(artifact.wins).toEqual([]);
            expect(artifact.featureEvents?.find(event => event.type === "jackpot")?.data).not.toHaveProperty("award");
            expect(runtime.execute(success)).toEqual(saved);
            expect(session.getWinAmount()).toBe(0);
            expect(session.toSessionState()).toEqual(before);
        }
        // Retry the rejected identity with its supported stake and mode. It was never accepted.
        const retry: api.SessionCommand = {kind: "spin", bet: 1e-7, mode: "ante", roundId: "bad", delivery: "composite"};
        const expected = new api.SessionRuntime(reference).execute(retry);
        const actual = runtime.execute(retry);
        expect(actual).toEqual(expected);
        expect(session.toSessionState()).toEqual(reference.toSessionState());
        expect(serializer.getRoundData(session)).toEqual(serializer.getRoundData(reference));
        const settled = JSON.parse(JSON.stringify(session.toSessionState()));
        expect(runtime.execute(retry)).toEqual(actual);
        expect(session.toSessionState()).toEqual(settled);
    });

    it("F1f generated composite overflow preserves its committed prefix and resumes settlement exactly once", () => {
        const b = fixture("sticky");
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
        b.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2}];
        const game = generatedMechanicsGame(b);
        const session = mechanicsSession(game);
        session.setCreditsAmount(Number.MAX_VALUE / 2);
        let accepted = 0;
        let prefixState: unknown;
        let prefix: Extract<api.SessionCommandResult, {status: "played"}>;
        const runtime = new api.SessionRuntime(session, undefined, (_command, result) => {
            accepted++;
            prefix = result;
            prefixState = JSON.parse(JSON.stringify(session.toSessionState()));
        });
        const command: api.SessionCommand = {kind: "spin", mode: "buy", roundId: "overflow", delivery: "composite"};
        for (let attempt = 0; attempt < 2; attempt++) {
            let failure: Error & {committedProgress?: api.SessionCommandProgress};
            try {
                runtime.execute(command);
                throw new Error("Expected terminal balance overflow");
            } catch (error) {
                failure = error as typeof failure;
            }
            expect(failure.message).toMatch(/overflow/);
            expect(failure.committedProgress?.committedResult).toEqual(prefix!);
            expect(runtime.getLogicalRound()).toEqual(prefix!.logicalRound);
            expect(prefix!.logicalRound).toMatchObject({cursor: 1, status: "pending"});
            expect(prefix!.win).toBeGreaterThan(8e307);
            expect(session.toSessionState()).toEqual(prefixState);
            expect(session.getCreditsAmount()).toBe(prefix!.credits);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
            expect(new api.VideoSlotSessionSerializer().getRoundData(session).modifiers).toBeUndefined();
            expect(accepted).toBe(1);
        }
        // Repair the external balance, retaining the already committed feature bank and RNG.
        session.setCreditsAmount(0);
        const reference = mechanicsSession(game);
        reference.fromSessionState(prefixState);
        reference.setCreditsAmount(0);
        const expected = new api.SessionRuntime(reference, prefix!.logicalRound).execute({kind: "spin", delivery: "stepwise", continuation: {roundId: "overflow", cursor: 1}});
        const result = runtime.execute(command);
        expect(result).toEqual(expected);
        expect(result).toMatchObject({logicalRound: {status: "completed", cursor: 2, totalStake: 0.5}, credits: Number.MAX_VALUE});
        expect(session.toSessionState()).toEqual(reference.toSessionState());
        expect(accepted).toBe(2);
        const after = JSON.parse(JSON.stringify(session.toSessionState()));
        expect(runtime.execute(command)).toEqual(result);
        expect(session.toSessionState()).toEqual(after);
        expect(accepted).toBe(2);
    });

    it("generated composed overflow leaves public repository/wallet unchanged and a fresh-handler retry audits once", async () => {
        const b = fixture("sticky");
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: Number.MAX_VALUE}];
        b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
        b.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2}];
        b.mechanics!.jackpot = {pool: {id: "mini", type: "accumulating", seedValue: 10},
            contribution: {type: "percentage", percentage: 0.1}, trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1}, award: "single-tier"};
        const game = generatedMechanicsGame(b),
            repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(10000);
        const initial = api.captureInitialPokieSessionState({seed: 31}, mechanicsSession(game), game.getSessionSerializer!(), true, game);
        await repository.save("s", initial);
        const handler = () => new api.SpinCommandHandler(game, repository, wallet);
        const command = {kind: "spin" as const, sessionId: "s", requestId: "overflow", mode: "buy", bet: 7.5};
        for (let attempt = 0; attempt < 2; attempt++) {
            expect((await handler().execute(command)).status).toBe("execution-error");
            expect(await repository.load("s")).toEqual(initial);
            expect(await wallet.getBalance("s")).toBe(10000);
        }
        const result = await handler().execute({...command, requestId: "retry", bet: 1e-7});
        if (result.status !== "played") throw new Error(JSON.stringify(result));
        expect(result.stake).toBe(10e-7);
        expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(result.audit))).verification).toBe("verified");
        expect(api.validatePersistedSession(result.state, game)).toBeUndefined();
    });

    it("calculator reuse reads current authored factors and fresh restoration has identical math", () => {
        const b = fixture("sticky");
        b.reelStrips = [["A"], ["W2"], ["A"]];
        const config = directConfig(b);
        config.setScreenModifiers(undefined);
        const reused = new api.VideoSlotWinCalculator(config);
        const screen = new api.SymbolsCombination().fromMatrix(b.reelStrips);
        reused.calculateWin(0.05, screen);
        expect(reused.getWinAmount()).toBe(0.5);
        for (const factor of [2, 0, 3]) {
            config.setScreenModifiers({wilds: [{symbol: "W2", factor}], rules: b.mechanics!.modifiers!.rules});
            reused.calculateWin(0.05, screen);
            const fresh = new api.VideoSlotWinCalculator(config);
            fresh.calculateWin(0.05, screen);
            expect(reused.getWinAmount()).toBe(0.5 * factor);
            expect(reused.getWinEvaluationResult()).toEqual(fresh.getWinEvaluationResult());
            const session = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31)), reused);
            session.play();
            const restored = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(99)), fresh);
            restored.fromSessionState(JSON.parse(JSON.stringify(session.toSessionState())));
            restored.setCreditsAmount(session.getCreditsAmount());
            expect(session.isSessionStateRestorable()).toBe(true);
            expect(restored.getSessionStateSchema()).toEqual(session.getSessionStateSchema());
            session.play();
            restored.play();
            expect(session.getWinAmount()).toBe(restored.getWinAmount());
            expect(session.getCreditsAmount()).toBe(restored.getCreditsAmount());
            expect(session.toSessionState()).toEqual(restored.toSessionState());
        }
    });

    it("late modifier configuration rejects a value evaluator at calculation and validation boundaries", () => {
        const config = directConfig(fixture());
        config.setScreenModifiers(undefined);
        const calculator = new api.VideoSlotWinCalculator(config, undefined, undefined, undefined, new api.ValueWinCalculator({A: 2}));
        config.setScreenModifiers(fixture().mechanics!.modifiers);
        const screen = new api.SymbolsCombination().fromMatrix([["A"], ["W2"], ["W3"]]);
        expect(() => calculator.calculateWin(0.05, screen)).toThrow(/value evaluators/);
        expect(() => calculator.validateWinEvaluation(0.05, screen)).toThrow(/value evaluators/);
        expect(() => calculator.getWinEvaluationPipeline()).toThrow(/value evaluators/);
        expect(calculator.getWinAmount()).toBe(0);
        expect(calculator.isStatelessForSessionRestoration()).toBe(false);
    });

    it.each([undefined, [], ["A"]])("authored substitutes %p override legacy restrictions and match generated execution", substitutes => {
        const b = fixture();
        b.reelStrips = [["A"], ["W2"], ["A"]];
        b.mechanics!.modifiers!.wilds = [{symbol: "W2", factor: 2, ...(substitutes === undefined ? {} : {substitutes})}];
        const config = directConfig(b);
        config.setWildSubstitutions({W2: [], W3: ["B"]});
        expect(config.getWildSubstitutions()).toEqual({W3: ["B"], ...(substitutes === undefined ? {} : {W2: substitutes})});
        const direct = new api.VideoSlotSession(config);
        const generated = mechanicsSession(generatedMechanicsGame(b));
        direct.play();
        generated.play();
        expect(direct.getWinAmount()).toBe(substitutes?.length === 0 ? 0 : 1);
        expect(direct.getWinAmount()).toBe(generated.getWinAmount());
        config.setScreenModifiers(undefined);
        expect(config.getWildSubstitutions()).toEqual({W2: [], W3: ["B"]});
        const legacy = new api.VideoSlotSession(config);
        legacy.play();
        expect(legacy.getWinAmount()).toBe(0);
    });

    it("requires exact catalogue/example coverage", () => {
        const files = fs
            .readdirSync(path.join(__dirname, "../../examples/blueprints"))
            .filter((name) => name.startsWith("wild-") && name.endsWith(".blueprint.json"));
        expect(files.map((name) => name.slice(5, -15)).sort()).toEqual([...catalogue].sort());
        expect(catalogue).toEqual(["expanding", "sticky", "restricted", "multiplier", "transform", "reel"]);
    });

    it.each(catalogue.flatMap((id) => (["lines", "ways", "clusters"] as const).map((type) => ({id, type}))))(
        "$id/$type: CLI/services, Play, generated CJS/TS, XLSX, extraction, sim/report/replay preserve rules",
        async ({id, type}) => {
            const blueprint = fixture(id);
            blueprint.winModel = type === "clusters" ? {type, minimumClusterSize: 3} : {type};
            expect(errors(blueprint)).toEqual([]);
            const source = path.join(directory, "source.json");
            fs.writeFileSync(source, JSON.stringify(blueprint));
            expect(await new ValidateCommand().run([source])).toBe(0);
            expect(
                await new BuildCommand("1.3.0").run([
                    source,
                    "--target",
                    "tsPackage",
                    "--out",
                    path.join(directory, "built"),
                ]),
            ).toBe(0);
            const game = generatedMechanicsGame(blueprint);
            const extracted = await new api.PackageBlueprintExtraction().extract(game);
            expect(extracted.status).toBe("complete");
            expect(extracted.blueprint!.mechanics).toEqual(blueprint.mechanics);
            const workbook = path.join(directory, "rules.xlsx"),
                importedPath = path.join(directory, "imported.json");
            expect(await new ParCommand("1.3.0").run(["export", source, "--out", workbook])).toBe(0);
            expect(
                await new ParCommand("1.3.0").run(["import", workbook, "--out", importedPath, "--format", "json"]),
            ).toBe(0);
            const imported = JSON.parse(fs.readFileSync(importedPath, "utf8")) as api.GameBlueprint;
            expect(imported.mechanics).toEqual(blueprint.mechanics);
            expect(api.computeBlueprintHash(imported)).toBe(api.computeBlueprintHash(blueprint));
            const studioBlueprint = new StudioBlueprintService(
                "1.3.0",
                path.join(directory, "studio"),
                new StudioHomeService("1.3.0"),
            );
            expect(studioBlueprint.validate(blueprint).status).toBe("ok");
            const savedPath = path.join(directory, "saved.json");
            expect(studioBlueprint.save(savedPath, blueprint, false).status).toBe("ok");
            expect(studioBlueprint.load(savedPath)).toMatchObject({
                status: "ok",
                blueprint: {mechanics: blueprint.mechanics},
            });
            const games = [
                game,
                generatedMechanicsGame(blueprint, true),
                generatedMechanicsGame(extracted.blueprint!),
                generatedMechanicsGame(imported),
            ];
            const config = directConfig(blueprint);
            const sessions = [
                ...games.map((g) => mechanicsSession(g)),
                new api.VideoSlotSession(
                    config,
                    new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31)),
                    new api.VideoSlotWinCalculator(
                        config,
                        undefined,
                        undefined,
                        type === "clusters" ? new api.ClusterWinCalculator(config, 3) : undefined,
                        undefined,
                        type === "ways" ? new api.WaysWinCalculator(config) : undefined,
                        {
                            minimumClusterSize: 3,
                            aggregationPolicy: new api.SelectedEvaluatorGroupWinAggregationPolicy(
                                {clusters: "cluster", ways: "ways", lines: "line"}[type],
                            ),
                        },
                    ),
                ),
            ];
            for (const bet of [0.05, 7.5, 1e-7]) {
                for (let round = 0; round < 4; round++) {
                    sessions.forEach((session) => {
                        session.setBet(bet);
                        session.play();
                    });
                    const expected = sessions[0];
                    sessions.slice(1).forEach((session) => {
                        expect(session.getSymbolsCombination().toMatrix()).toEqual(
                            expected.getSymbolsCombination().toMatrix(),
                        );
                        expect(session.getWinAmount()).toBe(expected.getWinAmount());
                        expect(session.toSessionState()).toEqual(expected.toSessionState());
                    });
                    const snapshot = JSON.parse(JSON.stringify(expected.toSessionState()));
                    const restored = mechanicsSession(game);
                    restored.fromSessionState(snapshot).setBet(bet);
                    restored.setCreditsAmount(expected.getCreditsAmount());
                    expected.play();
                    restored.play();
                    expect(restored.toSessionState()).toEqual(expected.toSessionState());
                    expect(new api.VideoSlotSessionSerializer().getRoundData(restored)).toEqual(
                        new api.VideoSlotSessionSerializer().getRoundData(expected),
                    );
                    // Keep the remaining parity participants on the same step.
                    sessions.slice(1).forEach((session) => session.play());
                }
            }
            const replay = new api.ReplayRecorder().record({game, seed: "31", round: 3});
            expect(new api.ReplayRecorder().record({game: games[2], seed: "31", round: 3})).toMatchObject({
                totalBet: replay.totalBet,
                totalWin: replay.totalWin,
                screen: replay.screen,
            });
            const reportPath = path.join(directory, "simulation.json");
            await new SimCommand(() => Promise.resolve(game)).run([
                directory,
                "--rounds",
                "8",
                "--seed",
                "31",
                "--out",
                reportPath,
            ]);
            const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as api.SimulationReport;
            expect(report.modifiers?.steps).toBe(8);
            for (const format of ["json", "markdown", "html"] as const) expect(buildSimulationReportDownload(report, "rules", format).body).toMatch(/modifiers/i);
            await new ReportCommand().run([
                reportPath,
                "--format",
                "html",
                "--out",
                path.join(directory, "report.html"),
            ]);
            const replayPath = path.join(directory, "replay.json");
            await new ReplayCommand(() => Promise.resolve(game)).run([
                directory,
                "--round",
                "3",
                "--seed",
                "31",
                "--out",
                replayPath,
            ]);
            expect(JSON.parse(fs.readFileSync(replayPath, "utf8")).screen).toEqual(replay.screen);
            const play = new StudioPlayService(() => Promise.resolve(game));
            try {
                const created = await play.newSession(directory, 31);
                if (created.status !== "ok") throw new Error(JSON.stringify(created));
                expect(
                    (
                        await play.spin(created.session.sessionId, undefined, 0.05, undefined, {
                            requestId: "play",
                            roundId: "play",
                            delivery: "composite",
                        })
                    ).status,
                ).toBe("ok");
            } finally {
                await play.reset();
            }
            expect(api.buildGameModelProjection(blueprint).mechanics).toMatchObject({
                status: "available",
                data: blueprint.mechanics,
            });
            expect(() => api.resolveCanonicalWasmGameModel(blueprint)).toThrow(/modifiers/);
            if (id === "sticky") expect(game.createExactEnumerationSession).toBeUndefined();
            else expect(game.createExactEnumerationSession).toBeDefined();
        },
    );

    it.each(["lines", "ways", "clusters"] as const)(
        "%s: hand-calculated overlapping transform and restricted multiplier wilds pay 3",
        (type) => {
            const b = fixture("transform");
            b.winModel = type === "clusters" ? {type, minimumClusterSize: 3} : {type};
            const session = mechanicsSession(generatedMechanicsGame(b));
            const before = session.getCreditsAmount();
            session.play();
            expect(session.getSymbolsCombination().toMatrix()).toEqual([["A"], ["W2"], ["W3"]]);
            expect(session.getWinAmount()).toBe(3); // 0.05 × 10 × 2 × 3
            expect(session.getCreditsAmount()).toBe(before - 0.05 + 3);
            const components = session.getWinEvaluationResult().getWinComponents();
            expect(components).toHaveLength(1);
            expect(components[0].getWinAmount()).toBe(3);
            expect(components[0].getWinningPositions()).toEqual([
                [0, 0],
                [1, 0],
                [2, 0],
            ]);
            expect(components[0].getMultiplierBreakdown()).toEqual([
                {
                    source: "authored-wild-product",
                    positions: [
                        [0, 0],
                        [1, 0],
                        [2, 0],
                    ],
                    values: [2, 3],
                    combinedMultiplier: 6,
                },
            ]);
            const artifact = api.buildRoundArtifactFromSession(session, {
                roundId: "known",
                provenance: {game: b.manifest, pokieVersion: "1.3.0"},
            });
            expect(artifact.totalWin).toBe(3);
            expect(new api.RoundArtifactValidator().validate(artifact)).toEqual([]);
        },
    );

    it("zero factors, forbidden substitutions, losing multipliers, wild own paytables and multiple lines", () => {
        const b = fixture();
        b.mechanics!.modifiers!.wilds[0].factor = 0;
        let session = mechanicsSession(generatedMechanicsGame(b));
        session.play();
        expect(session.getWinAmount()).toBe(0);
        b.mechanics!.modifiers!.wilds[0].factor = 2;
        b.mechanics!.modifiers!.wilds[0].substitutes = [];
        session = mechanicsSession(generatedMechanicsGame(b));
        session.play();
        expect(session.getWinAmount()).toBe(0);
        b.mechanics!.modifiers!.wilds[0].substitutes = ["A"];
        b.reelStrips = [["B"], ["W2"], ["W3"]];
        session = mechanicsSession(generatedMechanicsGame(b));
        session.play();
        expect(session.getWinAmount()).toBe(0);
        b.reelStrips = [["W2"], ["W2"], ["W2"]];
        b.paytable = {W2: {3: 5}};
        session = mechanicsSession(generatedMechanicsGame(b));
        session.play();
        expect(session.getWinAmount()).toBe(0); // Existing line contract: an all-wild line has no regular target.
        b.reelStrips = [
            ["A", "A"],
            ["W2", "W2"],
            ["W3", "W3"],
        ];
        b.rows = 2;
        b.paytable = {A: {3: 10}};
        session = mechanicsSession(generatedMechanicsGame(b));
        session.play();
        expect(session.getWinAmount()).toBe(6);
    });

    it("ordered transform → expansion → sticky captures identity; expiry, reads and insufficient credits do not renew it", () => {
        const b = fixture("sticky");
        b.rows = 2;
        b.reelStrips = [
            ["A", "A"],
            ["B", "B"],
            ["W3", "W3"],
        ];
        b.mechanics!.modifiers!.rules = [
            {id: "make", type: "transform", space: "evaluated", positions: [[1, 0]], from: "B", to: "W2"},
            {id: "expand", type: "expand", space: "evaluated", positions: [[1, 0]], symbol: "W2"},
            {id: "retain", type: "sticky", space: "evaluated", positions: [[1, 1]], symbol: "W2", lifetime: 3},
        ];
        const config = directConfig(b),
            session = new api.VideoSlotSession(
                config,
                new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(31)),
            );
        session.play();
        expect(session.getWinAmount()).toBe(6);
        const captured = session.toSessionState().modifierState!;
        expect(captured.cells).toEqual([{ruleId: "retain", position: [1, 1], symbol: "W2", factor: 2, remaining: 2}]);
        const credits = session.getCreditsAmount();
        session.setCreditsAmount(0);
        session.play();
        expect(session.toSessionState().modifierState).toEqual(captured);
        new api.VideoSlotSessionSerializer().getRoundData(session);
        session.getModifierObservation();
        expect(session.toSessionState().modifierState).toEqual(captured);
        session.setCreditsAmount(credits);
        session.play();
        expect(session.toSessionState().modifierState!.cells[0].remaining).toBe(1);
        session.play();
        expect(session.toSessionState().modifierState!.cells).toEqual([]);
        session.play();
        expect(session.toSessionState().modifierState!.cells[0].remaining).toBe(2);
        const reversed = structuredClone(b);
        reversed.mechanics!.modifiers!.rules.reverse();
        expect(api.computeGameBlueprintHash(reversed)).not.toBe(api.computeGameBlueprintHash(b));
        expect(() =>
            mechanicsSession(generatedMechanicsGame(reversed)).fromSessionState(session.toSessionState()),
        ).toThrow(/model/);
    });

    it("JSON restoration into fresh public handlers, duplicate delivery, settlement failure/retry and audit replay advance sticky once", async () => {
        const game = generatedMechanicsGame(fixture("sticky"));
        const repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(10000);
        const initial = api.captureInitialPokieSessionState(
            {seed: 31},
            mechanicsSession(game),
            game.getSessionSerializer!(),
            true,
            game,
        );
        expect(initial.executionState).toBe("durably-restorable");
        await repository.save("s", initial);
        const idempotency = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            operations = new api.InMemorySpinOperationLog();
        const reconciliation = new api.SpinReconciliationService(
            wallet,
            repository,
            idempotency,
            operations,
            true,
            false,
            0,
            undefined,
            undefined,
            game,
        );
        const handler = () =>
            new api.SpinCommandHandler(game, repository, wallet, idempotency, operations, true, reconciliation);
        const credit = jest.spyOn(wallet, "credit").mockRejectedValueOnce(new Error("settlement unavailable"));
        const command = {kind: "spin" as const, sessionId: "s", requestId: "retry", bet: 0.05};
        expect((await handler().execute(command)).status).toBe("settlement-error");
        credit.mockRestore();
        const first = await handler().execute(command);
        if (first.status !== "played") throw new Error(JSON.stringify(first));
        expect(
            (first.state.featureState as {modifierState: api.ScreenModifierState}).modifierState.cells[0].remaining,
        ).toBe(2);
        const duplicate = await handler().execute(command);
        expect(duplicate).toEqual(first);
        expect(await repository.load("s")).toEqual(first.state);
        const persisted = JSON.parse(JSON.stringify(await repository.load("s")));
        await repository.save("s", persisted);
        for (let step = 1; step <= 3; step++) {
            const next = await handler().execute({...command, requestId: `next-${step}`});
            if (next.status !== "played") throw new Error(JSON.stringify(next));
            expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(next.audit))).verification).toBe(
                "verified",
            );
            expect(api.validatePersistedSession(next.state, game)).toBeUndefined();
        }
        const corrupt = JSON.parse(JSON.stringify(first.state));
        corrupt.featureState.modifierState.cells[0].position = [9, 0];
        await repository.save("s", corrupt);
        const save = jest.spyOn(repository, "save"),
            debit = jest.spyOn(wallet, "debit");
        expect((await handler().execute({...command, requestId: "corrupt"})).status).toBe("corrupt-state");
        expect(save).not.toHaveBeenCalled();
        expect(debit).not.toHaveBeenCalled();
    });

    it("rejects invalid fields, coordinates, factors, symbols, lifetimes and duplicate/conflicting identities before publication", () => {
        const b = fixture("sticky");
        const rules = b.mechanics!.modifiers!.rules;
        const invalid = [
            {...b, mechanics: {modifiers: {...b.mechanics!.modifiers, unknown: true}}},
            {...b, mechanics: {modifiers: {wilds: new Array(1), rules: []}}},
            {...b, mechanics: {modifiers: {wilds: [], rules: new Array(1)}}},
            ...[[3, 0], [-1, 0], [1, 1], [1.5, 0], [1], [1, 0, 0]].map((position) => ({
                ...b,
                mechanics: {modifiers: {...b.mechanics!.modifiers, rules: [{...rules[0], positions: [position]}]}},
            })),
            ...[0, -1, 1.5].map((lifetime) => ({
                ...b,
                mechanics: {modifiers: {...b.mechanics!.modifiers, rules: [{...rules[0], lifetime}]}},
            })),
            {...b, mechanics: {modifiers: {...b.mechanics!.modifiers, rules: [rules[0], rules[0]]}}},
            {...b, mechanics: {modifiers: {wilds: [{symbol: "W2", factor: -1}], rules: []}}},
            {...b, mechanics: {modifiers: {wilds: [{symbol: "W2", substitutes: ["unknown"]}], rules: []}}},
            {...b, mechanics: {modifiers: {...b.mechanics!.modifiers, rules: [{...rules[0], symbol: "unknown"}]}}},
            {
                ...b,
                mechanics: {
                    modifiers: {
                        wilds: [],
                        rules: [{id: "reel", type: "reel", symbol: "A", space: "evaluated", positions: [], reels: [3]}],
                    },
                },
            },
        ];
        for (const candidate of invalid) {
            expect(errors(candidate).length).toBeGreaterThan(0);
            expect(() => api.renderBuiltGameModule(candidate as api.GameBlueprint, "1.3.0")).toThrow();
            expect(() =>
                new api.GamePackageGenerator("1.3.0").generate(candidate as api.GameBlueprint, directory),
            ).toThrow();
            const config = directConfig(b);
            expect(() => config.setScreenModifiers(candidate.mechanics.modifiers as api.ScreenModifiers)).toThrow();
        }
        expect(fs.readdirSync(directory)).toEqual([]);
    });

    it("custom multiplier combine callbacks remain uncertified, and custom descriptor diagnostics prevent flattening", async () => {
        const config = directConfig(fixture());
        const calculator = new api.VideoSlotWinCalculator(
            config,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {multiplierResolver: new api.MultiplierResolver({W2: 2}, {combine: (a, b) => a + b})},
        );
        expect(calculator.isStatelessForSessionRestoration()).toBe(false);
        const generated = generatedMechanicsGame(fixture());
        const game = {
            ...generated,
            getModelDescriptor() {
                return {
                    ...generated.getModelDescriptor!(),
                    sourceKind: "custom" as const,
                    unsupported: [
                        {
                            path: "mechanics.modifiers",
                            code: "custom-transform",
                            message: "Custom callback equivalence is not established.",
                        },
                    ],
                };
            },
        };
        expect((await new api.PackageBlueprintExtraction().extract(game)).status).toBe("unsupported");
    });
    it.each(["composite", "stepwise"] as const)(
        "sticky state survives free games and mode changes through %s delivery",
        async (delivery) => {
            const b = fixture("sticky");
            b.mechanics!.jackpot = {
                pool: {id: "mini", type: "accumulating", seedValue: 5},
                contribution: {type: "percentage", percentage: 0.1},
                trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1},
                award: "single-tier",
            };
            b.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}, retriggerPolicy: "additive"};
            b.betModes = [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "ante", runtimeType: "ante", costMultiplier: 1.5},
                {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2},
            ];
            const game = generatedMechanicsGame(b),
                repository = new api.InMemorySessionRepository(),
                wallet = new api.InMemoryWallet(10000);
            await repository.save(
                "s",
                api.captureInitialPokieSessionState(
                    {seed: 31},
                    mechanicsSession(game),
                    game.getSessionSerializer!(),
                    true,
                    game,
                ),
            );
            const handler = () => new api.SpinCommandHandler(game, repository, wallet);
            let result = await handler().execute({
                kind: "spin",
                sessionId: "s",
                requestId: "buy",
                roundId: "buy",
                bet: 0.05,
                mode: "buy",
                delivery,
            });
            if (result.status !== "played") throw new Error(JSON.stringify(result));
            expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(result.audit))).verification).toBe(
                "verified",
            );
            if (delivery === "stepwise") {
                for (let cursor = 1; result.state.logicalRound?.status === "pending" && cursor <= 3; cursor++) {
                    result = await handler().execute({
                        kind: "spin",
                        sessionId: "s",
                        requestId: `continue-${cursor}`,
                        delivery,
                        continuation: {roundId: "buy", cursor},
                    });
                    if (result.status !== "played") throw new Error(JSON.stringify(result));
                    expect(result.stake).toBe(0);
                    expect(
                        new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(result.audit))).verification,
                    ).toBe("verified");
                }
            }
            expect(api.validatePersistedSession(result.state, game)).toBeUndefined();
            const resumed = await handler().execute({
                kind: "spin",
                sessionId: "s",
                requestId: "ante",
                mode: "ante",
                bet: 7.5,
            });
            expect(resumed.status).toBe("played");
            if (resumed.status !== "played") throw new Error(JSON.stringify(resumed));
            expect(resumed.stake).toBe(11.25);
            expect(
                new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(resumed.audit))).verification,
            ).toBe("verified");
        },
    );

    it("stateless exact enumeration pays through the same modifier path and sticky is unsupported", async () => {
        const game = generatedMechanicsGame(fixture("transform"));
        const {library} = await api.generateExactWeightedOutcomeLibrary({
            libraryId: "modifiers",
            game,
            pokieVersion: "1.3.0",
        });
        expect(library.outcomes).toHaveLength(1);
        expect(library.outcomes[0].artifact.totalWin).toBe(3);
        await expect(
            api.generateExactWeightedOutcomeLibrary({
                libraryId: "sticky",
                game: generatedMechanicsGame(fixture("sticky")),
                pokieVersion: "1.3.0",
            }),
        ).rejects.toMatchObject({code: "weighted-outcome-library-generation-unsupported"});
    });

    it("rejects value evaluators and HoldAndWin composition instead of silently bypassing semantics", () => {
        const config = directConfig(fixture());
        expect(
            () =>
                new api.VideoSlotWinCalculator(
                    config,
                    undefined,
                    undefined,
                    undefined,
                    new api.ValueWinCalculator({A: 2}),
                ),
        ).toThrow(/value/);
        const b = fixture();
        b.mechanics!.holdAndWin = {
            minimumCount: 1,
            initialRespins: 2,
            retriggerPolicy: "reset-on-new-lock",
            symbolEffects: {A: {kind: "value", amount: 2}},
            payout: {type: "sum-with-multiplier", amountsAreBetMultiples: false},
        };
        expect(errors(b)).toEqual(expect.arrayContaining([expect.objectContaining({path: "mechanics.modifiers"})]));
    });

    it("sticky retains the acquired wild when generation changes, expires once, and isolates sessions", () => {
        const b = fixture("sticky"),
            config = directConfig(b);
        let matrix = [["A"], ["W2"], ["W3"]];
        const session = new api.VideoSlotSession(config, {
            generateSymbolsCombination: () => new api.SymbolsCombination().fromMatrix(matrix),
        });
        session.play();
        expect(session.getWinAmount()).toBe(3);
        matrix = [["A"], ["B"], ["W3"]];
        session.play();
        expect(session.getWinAmount()).toBe(3);
        session.play();
        expect(session.getWinAmount()).toBe(3);
        expect(session.getModifierObservation()!.sticky[0]).toMatchObject({symbol: "W2", factor: 2, remaining: 0});
        session.play();
        expect(session.getWinAmount()).toBe(0);
        expect(
            new api.VideoSlotSession(config, {
                generateSymbolsCombination: () => new api.SymbolsCombination().fromMatrix(matrix),
            }).toSessionState().modifierState!.cells,
        ).toEqual([]);
        const before = session.toSessionState(),
            credits = session.getCreditsAmount();
        matrix = [["A"], ["unknown"], ["W3"]];
        expect(() => session.play()).toThrow(/unknown/);
        expect(session.getWinAmount()).toBe(0);
        expect(session.getModifierObservation()).toBeUndefined();
        expect(session.getCreditsAmount()).toBe(credits);
        expect(session.toSessionState()).toEqual(before);
        matrix = [["A", "A"], ["B"], ["W3"]];
        expect(() => session.play()).toThrow(/dimensions/);
        expect(session.getCreditsAmount()).toBe(credits);
    });

    it("chunked sessions retain sticky trajectories and worker snapshots merge observations without sharing state", () => {
        const game = generatedMechanicsGame(fixture("sticky"));
        const continuous = mechanicsSession(game),
            chunked = mechanicsSession(game);
        const full = new api.AggregateSimulationRunner(continuous, 8).run();
        const first = new api.AggregateSimulationRunner(chunked, 3).run();
        const second = new api.AggregateSimulationRunner(chunked, 5).run();
        first.merge(api.SimulationAccumulator.fromSnapshot(JSON.parse(JSON.stringify(second.toSnapshot()))));
        expect(first.getStatistics()).toMatchObject({
            rounds: 8,
            totalPayout: full.getStatistics().totalPayout,
            modifiers: full.getStatistics().modifiers,
        });
        expect(chunked.toSessionState()).toEqual(continuous.toSessionState());
        const fresh = mechanicsSession(game, 32);
        expect((fresh.toSessionState() as {modifierState: api.ScreenModifierState}).modifierState.cells).toEqual([]);
        expect(
            (continuous.toSessionState() as {modifierState: api.ScreenModifierState}).modifierState.cells.length,
        ).toBeGreaterThan(0);
    });

    it.each(catalogue)(
        "%s: mixed exact/weighted source preserves initialization, continued restore and replay",
        async (id) => {
            const b = fixture(id),
                strips = b.reelStrips!;
            Reflect.deleteProperty(b, "reelStrips");
            b.reelSequences = strips.map((symbols, reel) =>
                reel === 0
                    ? {type: "exact", symbols}
                    : {
                        type: "weighted",
                        variants: [
                            {id: "authored", symbols, weight: 1},
                            {id: "alternative", symbols: ["B"], weight: 2},
                        ],
                    },
            );
            const game = generatedMechanicsGame(b),
                extracted = await new api.PackageBlueprintExtraction().extract(game);
            expect(extracted.status).toBe("complete");
            const session = mechanicsSession(game),
                copy = mechanicsSession(generatedMechanicsGame(extracted.blueprint!, true));
            for (let step = 0; step < 8; step++) {
                session.play();
                copy.play();
                expect(copy.toSessionState()).toEqual(session.toSessionState());
                expect(copy.getWinAmount()).toBe(session.getWinAmount());
                const fresh = mechanicsSession(game);
                fresh.fromSessionState(JSON.parse(JSON.stringify(session.toSessionState())));
                expect(fresh.toSessionState()).toEqual(session.toSessionState());
            }
            expect(new api.ReplayRecorder().record({game, seed: "31", round: 8}).artifact).toEqual(
                new api.ReplayRecorder().record({game: generatedMechanicsGame(b, true), seed: "31", round: 8}).artifact,
            );
            for (const context of [{seed: 31}, undefined]) {
                const unplayed = game.createSession(context) as api.VideoSlotSession;
                expect((unplayed.toSessionState().modifierState as api.ScreenModifierState).cells).toEqual([]);
                expect(unplayed.isSessionStateRestorable()).toBe(true);
            }
        },
    );

    it.each([
        {type: "lines" as const, expected: 6},
        {type: "ways" as const, expected: 144},
        {type: "clusters" as const, expected: 18},
    ])("$type applies the declared product to its component scope on a two-row screen", ({type, expected}) => {
        const b = fixture();
        b.rows = 2;
        b.reelStrips = [
            ["A", "A"],
            ["W2", "W2"],
            ["W3", "W3"],
        ];
        b.paytable = {A: type === "clusters" ? {3: 10, 6: 10} : {3: 10}};
        b.winModel = type === "clusters" ? {type, minimumClusterSize: 3} : {type};
        const session = mechanicsSession(generatedMechanicsGame(b));
        session.play();
        expect(session.getWinAmount()).toBe(expected);
        const components = session.getWinEvaluationResult().getWinComponents();
        expect(components).toHaveLength(type === "lines" ? 2 : 1);
        if (type !== "lines") {
            expect(components[0].getMultiplierBreakdown()[0].combinedMultiplier).toBe(36);
            expect(components[0].getMultiplierBreakdown()[0].values.sort()).toEqual([2, 2, 3, 3]);
            expect(components[0].getWinningPositions()).toHaveLength(6);
        }
    });

    it("product applies once per repeated coordinate and custom options cannot acquire restore certification by mutation", () => {
        const config = directConfig(fixture()),
            symbols = new api.SymbolsCombination().fromMatrix([["A"], ["W2"], ["W3"]]);
        const component = new api.ValueWinComponent(
            new api.WinningValue(
                "A",
                [
                    [1, 0],
                    [1, 0],
                ],
                1,
            ),
        );
        const context = new api.WinEvaluationContext(0.05, symbols, config);
        expect(new api.MultiplierResolver<string>({W2: 2}, {uniquePositions: true}).resolve(component, context)).toEqual({
            winAmount: 2,
            breakdown: [{source: "symbol-multipliers", positions: [[1, 0]], values: [2], combinedMultiplier: 2}],
        });
        const options: api.VideoSlotWinCalculatorOptions = {
            multiplierResolver: new api.MultiplierResolver({W2: 2}, {combine: (a, b) => a + b}),
        };
        const calculator = new api.VideoSlotWinCalculator(
            config,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            options,
        );
        Reflect.deleteProperty(options, "multiplierResolver");
        expect(calculator.isStatelessForSessionRestoration()).toBe(false);
    });

    it.each(["identity", "ruleId", "symbol", "factor", "remaining-zero", "remaining-long", "duplicate"])(
        "corrupt retained %s is rejected before wallet or repository mutation",
        async (field) => {
            const game = generatedMechanicsGame(fixture("sticky")),
                session = mechanicsSession(game);
            session.play();
            const valid = api.captureInitialPokieSessionState(
                {seed: 31},
                session,
                game.getSessionSerializer!(),
                true,
                game,
            );
            expect(api.validatePersistedSession(valid, game)).toBeUndefined();
            const corrupt = JSON.parse(JSON.stringify(valid));
            const state = corrupt.featureState.modifierState;
            if (field === "identity") state.identity = "other-model";
            else if (field === "duplicate") state.cells.push({...state.cells[0]});
            else {
                const values: Record<string, unknown> = {factor: 9, "remaining-zero": 0, "remaining-long": 3};
                state.cells[0][field.startsWith("remaining") ? "remaining" : field] = values[field] ?? "unknown";
            }
            const repository = new api.InMemorySessionRepository(),
                wallet = new api.InMemoryWallet(10000);
            await repository.save("s", corrupt);
            const save = jest.spyOn(repository, "save"),
                debit = jest.spyOn(wallet, "debit"),
                credit = jest.spyOn(wallet, "credit");
            expect(
                (
                    await new api.SpinCommandHandler(game, repository, wallet).execute({
                        kind: "spin",
                        sessionId: "s",
                        requestId: "corrupt",
                    })
                ).status,
            ).toBe("corrupt-state");
            for (const spy of [save, debit, credit]) expect(spy).not.toHaveBeenCalled();
            expect(await repository.load("s")).toEqual(corrupt);
        },
    );
});

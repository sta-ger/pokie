import ExcelJS from "exceljs";
import {mergeJackpotStatisticsSnapshots} from "../../src/simulation/JackpotStatisticsMerging.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {StudioPlayService} from "../../cli/studio/runtime/StudioPlayService.js";
import fs from "node:fs";
import path from "node:path";
import * as api from "@fromstan/pokie";
import {existingMechanicsBlueprint, generatedMechanicsGame, mechanicsSession} from "./fixtures/ExistingMechanicsGame.js";

const catalogue = api.AUTHORED_MECHANIC_CATALOG;
const errors = (b: unknown) => new api.GameBlueprintValidator().validate(b).filter(issue => issue.severity === "error");

describe("V2C-12 catalogue-driven public authored workflows", () => {
    let directory: string;
    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c12-"));
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("covers every declared supported variant and composition with a fixture", () => {
        expect(new Set(catalogue.map(row => row.id)).size).toBe(catalogue.length);
        expect(catalogue).toHaveLength(22);
        expect(new Set(catalogue.map(row => row.progression))).toEqual(new Set(["base", "freeGames", "holdAndWin"]));
        for (const row of catalogue) expect(errors(existingMechanicsBlueprint(row))).toEqual([]);
    });

    it.each(catalogue)("$id: validation/build/extraction/real XLSX/seeded continuation/replay/simulation/report", async row => {
        const blueprint = existingMechanicsBlueprint(row);
        expect(errors(blueprint)).toEqual([]);
        const built = new api.GamePackageGenerator("1.3.0").generate(blueprint, directory);
        expect(fs.readFileSync(path.join(built.projectRoot, "dist/index.js"), "utf8")).toBe(api.renderBuiltGameModule(blueprint, "1.3.0"));
        const game = generatedMechanicsGame(blueprint);
        const source = path.join(directory, "source.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        expect(await new ValidateCommand().run([source])).toBe(0);
        expect(await new BuildCommand("1.3.0").run([source, "--target", "tsPackage", "--out", path.join(directory, "cli-built")])).toBe(0);
        const cliWorkbook = path.join(directory, "cli.xlsx"),
            cliImport = path.join(directory, "cli-import.json");
        expect(await new ParCommand("1.3.0").run(["export", source, "--out", cliWorkbook])).toBe(0);
        expect(await new ParCommand("1.3.0").run(["import", cliWorkbook, "--out", cliImport, "--format", "json"])).toBe(0);
        expect(JSON.parse(fs.readFileSync(cliImport, "utf8")).mechanics).toEqual(blueprint.mechanics);
        const reportPath = path.join(directory, "simulation.json");
        await new SimCommand(() => Promise.resolve(game)).run([built.projectRoot, "--rounds", "30", "--seed", "31", ...(row.modes ? ["--mode", "all"] : []), "--out", reportPath]);
        const cliReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        if (row.modes) expect(Object.keys(cliReport.modes)).toEqual(blueprint.betModes!.map(mode => mode.id));
        await new ReportCommand().run([reportPath, "--format", "html", "--out", path.join(directory, "report.html")]);
        await new ReplayCommand(() => Promise.resolve(game)).run([built.projectRoot, "--round", "3", "--seed", "31", "--out", path.join(directory, "replay.json")]);
        expect(JSON.parse(fs.readFileSync(path.join(directory, "replay.json"), "utf8")).round).toBe(3);
        const studio = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await studio.newSession(built.projectRoot, 31);
            if (created.status !== "ok") throw new Error(JSON.stringify(created));
            const played = await studio.spin(created.session.sessionId, undefined, 0.05, row.modes ? "ante" : undefined, {requestId: "studio", roundId: "studio", delivery: "composite"});
            if (played.status !== "ok") throw new Error(JSON.stringify(played));
        } finally {
            await studio.reset();
        }

        const extracted = await new api.PackageBlueprintExtraction().extract(game);
        expect(extracted.diagnostics.filter(issue => issue.severity !== "warning")).toEqual([]);
        expect(extracted.status).toBe("complete");
        expect(extracted.blueprint?.mechanics).toEqual(blueprint.mechanics);
        const workbook = path.join(directory, "mechanics.xlsx");
        expect((await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, workbook)).filter(issue => issue.severity === "error")).toEqual([]);
        const imported = await new api.ParSheetImporter().importFromFile(workbook);
        expect(imported.issues.filter(issue => issue.severity === "error")).toEqual([]);
        expect(imported.blueprint.mechanics).toEqual(blueprint.mechanics);
        expect(api.computeBlueprintHash(imported.blueprint)).toBe(api.computeBlueprintHash(blueprint));
        const games = [game, generatedMechanicsGame(blueprint, true), generatedMechanicsGame(extracted.blueprint!), generatedMechanicsGame(imported.blueprint)];
        const sessions = games.map(g => mechanicsSession(g));
        for (let round = 0; round < 35; round++) {
            for (const session of sessions) {
                if (!session.hasPendingLogicalRound()) session.setBet(blueprint.availableBets![round % 3]);
                if (row.modes && !session.hasPendingLogicalRound()) session.setBetMode!(round % 3 === 0 && row.progression === "freeGames" ? "buy-more" : "ante");
                expect(session.isSessionStateRestorable()).toBe(true);
                const before = session.getCreditsAmount(),
                    stake = api.determineStakeAmount(session, session.getBet());
                session.play();
                expect(session.getCreditsAmount()).toBeCloseTo(before - stake + session.getWinAmount(), 8);
            }
            const snapshot = JSON.parse(JSON.stringify(sessions[0].toSessionState()));
            for (const session of sessions.slice(1)) {
                expect(session.toSessionState()).toEqual(sessions[0].toSessionState());
                expect(new api.VideoSlotSessionSerializer().getRoundData(session)).toEqual(new api.VideoSlotSessionSerializer().getRoundData(sessions[0]));
            }
            const restored = mechanicsSession(game);
            restored.setBet(sessions[0].getBet());
            restored.setCreditsAmount(sessions[0].getCreditsAmount());
            restored.fromSessionState(snapshot);
            expect(restored.toSessionState()).toEqual(snapshot);
            sessions[3] = restored;
        }
        const replay = new api.ReplayRecorder();
        const recorded = replay.recordAudit(game, mechanicsSession(game), [{kind: "spin", bet: 0.05, ...(row.modes ? {mode: row.progression === "freeGames" ? "buy" : "ante"} : {}), delivery: "composite", roundId: "audit"}], {status: "calculated", sessionId: "s", durability: "detached"}, {seed: 31});
        expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(recorded.audit))).verification).toBe("verified");
        const seeded = replay.record({game, seed: "31", round: 2});
        expect(replay.record({game: games[2], seed: "31", round: 2})).toMatchObject({totalBet: seeded.totalBet, totalWin: seeded.totalWin, screen: seeded.screen});
        for (const mode of blueprint.betModes?.map(mode => mode.id) ?? [undefined]) {
            const session = mechanicsSession(game);
            const runner = new api.AggregateSimulationRunner(session, 40, undefined, undefined, mode ? new api.FixedBetModeForNextSimulationRoundSetting(mode) : undefined);
            const statistics = runner.run().getStatistics();
            const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 40, statistics, seed: "31", durationMs: 1, breakdown: runner.getBreakdownStatistics(), jackpot: runner.getJackpotStatistics(), betMode: mode});
            expect(report.totalBet).toBe(statistics.totalBet);
            expect(report.totalWin).toBe(statistics.totalPayout);
            expect(new api.MarkdownSimulationReportRenderer().render(report)).toContain(row.id);
            expect(new api.HtmlSimulationReportRenderer().render(report)).toContain(row.id);
            expect(JSON.parse(JSON.stringify(report)).totalWin).toBe(report.totalWin);
            if (row.jackpot) expect(report.jackpot).toBeDefined();
        }
    });

    it("rejects conflicts and unknown fields through validation, direct rendering and generation without writing", () => {
        const b = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-flat")!);
        const invalid = [
            {...b, mechanics: {...b.mechanics, unknown: {}}},
            {...b, mechanics: {...b.mechanics, freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}}},
            {...b, mechanics: {holdAndWin: {...b.mechanics!.holdAndWin!, retriggerPolicy: "additive"}}},
            {...b, mechanics: {jackpot: {pool: {id: "x", type: "accumulating", seedValue: -1}}}},
        ];
        for (const candidate of invalid) {
            expect(errors(candidate).length).toBeGreaterThan(0);
            expect(() => api.renderBuiltGameModule(candidate as api.GameBlueprint, "1.3.0")).toThrow();
            expect(() => new api.GamePackageGenerator("1.3.0").generate(candidate as api.GameBlueprint, directory)).toThrow();
        }
        expect(fs.readdirSync(directory)).toEqual([]);
    });
    it.each([false, true])("F1 rejects changed entry denomination before mutation (explicit delivery: %s)", async explicit => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        blueprint.reelStrips = [["C"], ["A"], ["A"]];
        const game = generatedMechanicsGame(blueprint),
            session = mechanicsSession(game);
        const repository = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(100);
        await repository.save("s", api.captureInitialPokieSessionState({seed: 31}, session, game.getSessionSerializer!(), true, game));
        const handler = () => new api.SpinCommandHandler(game, repository, wallet);
        const first = await handler().execute({kind: "spin", sessionId: "s", requestId: "entry", bet: 0.05, ...(explicit ? {roundId: "entry", delivery: "stepwise" as const} : {})});
        if (first.status !== "played") throw new Error(JSON.stringify(first));
        expect(first.state.chargedEntry).toEqual({bet: 0.05});
        expect(first.state.logicalRound !== undefined).toBe(explicit);
        const continuation = (cursor: number) => explicit ? {delivery: "stepwise" as const, continuation: {roundId: "entry", cursor}} : {};
        const state = JSON.parse(JSON.stringify(first.state)) as api.PokieSessionState;
        (state.featureState as {entryBet: number}).entryBet = 7.5;
        expect(api.validatePersistedSession(state, game)).toMatchObject({status: "corrupt-state", reason: expect.stringContaining("entry denomination")});
        await repository.save("s", state);
        const save = jest.spyOn(repository, "save"),
            create = jest.spyOn(game, "createSession"),
            debit = jest.spyOn(wallet, "debit"),
            credit = jest.spyOn(wallet, "credit");
        const rejected = await handler().execute({kind: "spin", sessionId: "s", requestId: "continue", ...continuation(1)});
        expect(rejected.status).toBe("corrupt-state");
        expect(save).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(debit).not.toHaveBeenCalled();
        expect(credit).not.toHaveBeenCalled();
        expect(await repository.load("s")).toEqual(state);
        jest.restoreAllMocks();
        await repository.save("s", first.state);
        const second = await handler().execute({kind: "spin", sessionId: "s", requestId: "second", ...continuation(1), ...(!explicit ? {bet: 7.5} : {})});
        if (second.status !== "played") throw new Error(JSON.stringify(second));
        const final = await handler().execute({kind: "spin", sessionId: "s", requestId: "final", ...continuation(2)});
        expect(final).toMatchObject({status: "played", win: 0.1, stake: 0, state: {chargedEntry: {bet: 0.05}}});
    });

    it.each((["fixed", "accumulating"] as const).flatMap(poolType => ["constructor", "__proto__"].map(id => ({id, poolType}))))("F4 preserves $poolType pool $id through both generated formats, restoration, simulation deltas and reporting", ({id, poolType}) => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === `${poolType}-base`)!);
        blueprint.mechanics!.jackpot!.pool.id = id;
        blueprint.reelStrips = [["J"], ["A"], ["A"]];
        expect(errors(blueprint)).toEqual([]);
        for (const typed of [false, true]) {
            const game = generatedMechanicsGame(blueprint, typed),
                session = mechanicsSession(game);
            const runner = new api.AggregateSimulationRunner(session, 2);
            runner.run();
            expect(runner.getJackpotStatistics()!.awardCount).toBe(2);
            expect(runner.getJackpotStatistics()!.totalAwarded).toBeCloseTo(poolType === "fixed" ? 20 : 20.01);
            expect(runner.getJackpotStatistics()!.totalContributed).toBeCloseTo(0.01);
            expect(Object.keys(runner.getJackpotStatistics()!.pools)).toEqual([id]);
            const snapshot = JSON.parse(JSON.stringify(session.toSessionState()));
            expect(Object.keys(snapshot.pools ?? {})).toEqual(poolType === "fixed" ? [] : [id]);
            expect(Object.keys(snapshot.poolStatistics)).toEqual([id]);
            const restored = mechanicsSession(game);
            restored.fromSessionState(snapshot);
            expect(restored.toSessionState()).toEqual(snapshot);
            const nextRunner = new api.AggregateSimulationRunner(restored, 1);
            const result = nextRunner.run();
            const statistics = nextRunner.getJackpotStatistics()!;
            expect(statistics.awardCount).toBe(1);
            expect(statistics.totalAwarded).toBeCloseTo(poolType === "fixed" ? 10 : 10.005);
            expect(statistics.totalContributed).toBeCloseTo(0.005);
            const merged = mergeJackpotStatisticsSnapshots(runner.getJackpotStatistics(), statistics);
            expect(merged.pools[id].awardCount).toBe(3);
            expect(merged.pools[id].totalAwarded).toBeCloseTo(poolType === "fixed" ? 30 : 30.015);
            expect(merged.pools[id].totalContributed).toBeCloseTo(0.015);
            const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 1, statistics: result.getStatistics(), durationMs: 1, jackpot: statistics});
            expect(JSON.parse(JSON.stringify(report)).jackpot.pools[id]).toBeDefined();
        }
    });

    it("F5 preserves canonical lock identity and exact audit replay through reordered effects, extraction and PAR", async () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        blueprint.reelStrips = [["C"], ["M"], ["A"]];
        const reordered = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
        const effects = reordered.mechanics!.holdAndWin!.symbolEffects;
        reordered.mechanics!.holdAndWin!.symbolEffects = {M: effects.M, C: effects.C};
        expect(api.computeGameBlueprintHash(reordered)).toBe(api.computeGameBlueprintHash(blueprint));
        const game = generatedMechanicsGame(blueprint),
            reorderedGame = generatedMechanicsGame(reordered);
        const extracted = await new api.PackageBlueprintExtraction().extract(reorderedGame);
        const workbook = path.join(directory, "reordered.xlsx");
        await new api.ParSheetExporter("1.3.0").exportToFile(reordered, workbook);
        const imported = await new api.ParSheetImporter().importFromFile(workbook);
        const games = [reorderedGame, generatedMechanicsGame(reordered, true), generatedMechanicsGame(extracted.blueprint!), generatedMechanicsGame(imported.blueprint)];
        const recorded = new api.ReplayRecorder().recordAudit(game, mechanicsSession(game), [{kind: "spin", bet: 0.05, delivery: "composite", roundId: "key-order"}], {status: "calculated", sessionId: "s", durability: "detached"}, {seed: 31});
        for (const equivalent of games) {
            expect(equivalent.getConfigHash!()).toBe(game.getConfigHash!());
            expect(new api.AuditRoundReplay().replay(equivalent, JSON.parse(JSON.stringify(recorded.audit))).verification).toBe("verified");
            const session = mechanicsSession(equivalent);
            session.play();
            expect((session.toSessionState() as {lockedSymbols: {position: number[]}[]}).lockedSymbols.map(lock => lock.position)).toEqual([[0, 0], [1, 0]]);
        }
    });

    it.each(["   ", 42, null, {}])("F6 aligns field diagnostics for mode id %p across CLI, Studio, resolver and generation", async id => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-flat-modes")!);
        (blueprint.betModes![0] as unknown as {id: unknown}).id = id;
        expect(errors(blueprint)).toContainEqual(expect.objectContaining({code: "blueprint-betmode-invalid-id", path: "betModes[0].id"}));
        expect(new StudioBlueprintService("1.3.0", directory, new StudioHomeService("1.3.0")).validate(blueprint)).toMatchObject({status: "invalid", errors: expect.arrayContaining([expect.objectContaining({path: "betModes[0].id"})])});
        const source = path.join(directory, "invalid.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        expect(await new ValidateCommand().run([source])).toBe(1);
        expect(() => api.resolveBetModeCodegenWiring(blueprint)).toThrow(/betModes\[0\].id/);
        expect(() => api.renderBuiltGameModule(blueprint, "1.3.0")).toThrow(/betModes\[0\].id/);
        expect(() => api.renderBuiltGameModuleSource(blueprint, "1.3.0")).toThrow(/betModes\[0\].id/);
        expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, "rejected")).toThrow(/betModes\[0\].id/);
        expect(fs.existsSync(path.join(directory, "rejected"))).toBe(false);
    });

    it("F7 rejects HoldAndWin outside modes before play/restore and advances supported zero-credit continuations exactly once", () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-flat-modes")!);
        blueprint.reelStrips = [["C"], ["A"], ["A"]];
        const game = generatedMechanicsGame(blueprint),
            innerModes = mechanicsSession(game);
        const unsupported = new api.VideoSlotWithHoldAndWinSession(innerModes, 2, new api.SymbolSetHoldAndWinCollector(blueprint.mechanics!.holdAndWin!.symbolEffects), new api.MinimumCountHoldAndWinTrigger(1));
        innerModes.setBetMode!("ante");
        const before = innerModes.toSessionState();
        expect(unsupported.isSessionStateRestorable()).toBe(false);
        expect(() => unsupported.play()).toThrow(/inside bet modes/);
        expect(() => unsupported.fromSessionState(unsupported.toSessionState())).toThrow(/inside bet modes/);
        expect(() => unsupported.validateSessionState(unsupported.toSessionState())).toThrow(/inside bet modes/);
        expect(innerModes.toSessionState()).toEqual(before);
        const session = mechanicsSession(game);
        session.setBetMode!("ante");
        session.play();
        session.setCreditsAmount(0);
        const base = Reflect.get(Reflect.get(session, "baseSession"), "baseSession") as api.VideoSlotSessionHandling;
        const play = jest.spyOn(base, "play");
        const rngBefore = (base as unknown as api.ConvertableToSessionState<{rngState: number}>).toSessionState().rngState;
        session.play();
        expect(play).toHaveBeenCalledTimes(1);
        expect((base as unknown as api.ConvertableToSessionState<{rngState: number}>).toSessionState().rngState).not.toBe(rngBefore);
        expect(session.getCreditsAmount()).toBe(0);
        expect((session.toSessionState() as {base: {respinsRemaining: number}}).base.respinsRemaining).toBe(1);
    });

    it.each(["hold-flat", "modes", "fixed-base"])("F7 rejects free games outside %s before mutation or certification", id => {
        const base = mechanicsSession(generatedMechanicsGame(existingMechanicsBlueprint(catalogue.find(row => row.id === id)!)));
        const free = mechanicsSession(generatedMechanicsGame(existingMechanicsBlueprint(catalogue.find(row => row.id === "free-games")!)));
        const config = Reflect.get(free, "config") as api.VideoSlotWithFreeGamesConfig;
        const wrapped = new api.VideoSlotWithFreeGamesSession(config, undefined, undefined, base);
        const before = JSON.parse(JSON.stringify(base.toSessionState()));
        expect(wrapped.isSessionStateRestorable()).toBe(false);
        expect(() => wrapped.play()).toThrow(/Free games must be inside/);
        expect(() => wrapped.validateSessionState(wrapped.toSessionState())).toThrow(/Free games must be inside/);
        expect(() => wrapped.fromSessionState(wrapped.toSessionState())).toThrow(/Free games must be inside/);
        expect(() => api.validateExecutableState(wrapped.toSessionState(), wrapped.getSessionStateSchema())).toThrow(/Free games must be inside/);
        expect(base.toSessionState()).toEqual(before);
    });

    it("F7 rejects modes outside jackpot and retains actual ante contributions in the supported order", () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "accumulating-base")!);
        blueprint.reelStrips = [["A"], ["A"], ["A"]];
        const base = mechanicsSession(generatedMechanicsGame(blueprint));
        const wrapped = new api.VideoSlotWithBetModesSession(base, new api.BetModesConfig([new api.BetModeDefinition("base"), new api.BetModeDefinition("ante", {stakeMultiplier: 1.5})]));
        wrapped.setBetMode("ante");
        const before = JSON.parse(JSON.stringify(base.toSessionState()));
        expect(wrapped.isSessionStateRestorable()).toBe(false);
        for (const action of [() => wrapped.play(), () => wrapped.validateEntryAction(), () => wrapped.validateSessionState(wrapped.toSessionState()), () => wrapped.fromSessionState(wrapped.toSessionState()), () => api.validateExecutableState(wrapped.toSessionState(), wrapped.getSessionStateSchema())]) expect(action).toThrow(/Bet modes must be inside jackpot/);
        expect(base.toSessionState()).toEqual(before);
        const supportedBlueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "accumulating-holdAndWin-modes")!);
        supportedBlueprint.reelStrips = [["C"], ["A"], ["A"]];
        const supported = mechanicsSession(generatedMechanicsGame(supportedBlueprint));
        supported.setBetMode!("ante");
        expect(supported.getStakeAmount()).toBeCloseTo(0.075, 12);
        supported.play();
        expect(api.observeVideoSlotFeatures(supported).jackpot?.statistics.mini.totalContributed).toBeCloseTo(0.0075, 12);
        expect(supported.hasPendingLogicalRound()).toBe(true);
        expect(supported.getStakeAmount()).toBe(0);
        const restored = mechanicsSession(generatedMechanicsGame(supportedBlueprint));
        restored.fromSessionState(JSON.parse(JSON.stringify(supported.toSessionState())));
        restored.setCreditsAmount(0);
        const beforeContinuation = JSON.parse(JSON.stringify(restored.toSessionState()));
        restored.play();
        expect(restored.hasPendingLogicalRound()).toBe(true);
        expect(api.observeVideoSlotFeatures(restored).holdAndWin?.respinsRemaining).toBe(1);
        expect(api.observeVideoSlotFeatures(restored).jackpot?.statistics.mini.totalContributed).toBeCloseTo(0.0075, 12);
        expect(restored.toSessionState()).not.toEqual(beforeContinuation);
        expect(restored.isSessionStateRestorable()).toBe(true);
    });

    it.each(["__proto__", "constructor", "prototype", "toJSON"])("F8 rejects reserved own symbol effect %s consistently before publication", async symbol => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        blueprint.symbols.push(symbol);
        blueprint.reelStrips = [[symbol], ["A"], ["A"]];
        const effects = blueprint.mechanics!.holdAndWin!.symbolEffects;
        Reflect.defineProperty(effects, symbol, {value: {kind: "value", amount: 2}, enumerable: true, configurable: true});
        const diagnostic = {code: "blueprint-mechanics-symbol-key-unsupported", path: `mechanics.holdAndWin.symbolEffects.${symbol}`};
        expect(errors(blueprint)).toContainEqual(expect.objectContaining(diagnostic));
        expect(new StudioBlueprintService("1.3.0", directory, new StudioHomeService("1.3.0")).validate(blueprint)).toMatchObject({status: "invalid", errors: expect.arrayContaining([expect.objectContaining(diagnostic)])});
        for (const render of [api.renderBuiltGameModule, api.renderBuiltGameModuleSource]) expect(() => render(blueprint, "1.3.0")).toThrow(/reserved symbol-effect key.*rename the symbol/);
        expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, "rejected")).toThrow(/reserved symbol-effect key/);
        const source = path.join(directory, "invalid.blueprint.json"), 
            destination = path.join(directory, "rejected.xlsx");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        expect(await new ValidateCommand().run([source])).toBe(1);
        await expect(new BuildCommand("1.3.0").run([source, "--target", "tsPackage", "--out", path.join(directory, "cli-rejected")])).rejects.toThrow(/reserved symbol-effect key/);
        expect(await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, destination)).toContainEqual(expect.objectContaining(diagnostic));
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(path.join(directory, "rejected"))).toBe(false);
        expect(fs.existsSync(path.join(directory, "cli-rejected"))).toBe(false);
        const withoutEffect = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
        Reflect.deleteProperty(withoutEffect.mechanics!.holdAndWin!.symbolEffects, symbol);
        expect(api.computeGameBlueprintHash(withoutEffect)).not.toBe(api.computeGameBlueprintHash(blueprint));
        expect(api.computeBlueprintHash(withoutEffect)).not.toBe(api.computeBlueprintHash(blueprint));
        const valid = existingMechanicsBlueprint(catalogue.find(row => row.id === "hold-bet")!);
        const workbookPath = path.join(directory, "import.xlsx");
        await new api.ParSheetExporter("1.3.0").exportToFile(valid, workbookPath);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(workbookPath);
        workbook.getWorksheet("Symbols")!.addRow([symbol]);
        const sheet = workbook.getWorksheet("Mechanics")!;
        sheet.getRow(2).getCell(2).value = JSON.stringify(blueprint.mechanics!.holdAndWin);
        await workbook.xlsx.writeFile(workbookPath);
        const imported = await new api.ParSheetImporter().importFromFile(workbookPath);
        expect(imported.issues).toContainEqual(expect.objectContaining(diagnostic));
        const game = generatedMechanicsGame(valid);
        game.getModelDescriptor = () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: blueprint});
        expect((await new api.PackageBlueprintExtraction().extract(game)).status).not.toBe("complete");
    });

    it.each([false, true])("F9 binds changed/deleted charged mode to purchase entry across fresh handlers (explicit: %s)", async explicit => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "accumulating-freeGames-modes")!);
        blueprint.reelStrips = [["A"], ["A"], ["A"]];
        const game = generatedMechanicsGame(blueprint), 
            repository = new api.InMemorySessionRepository(), 
            wallet = new api.InMemoryWallet(100);
        await repository.save("s", api.captureInitialPokieSessionState({seed: 31}, mechanicsSession(game), game.getSessionSerializer!(), true, game));
        const handler = () => new api.SpinCommandHandler(game, repository, wallet);
        const entry = await handler().execute({kind: "spin", sessionId: "s", requestId: "buy", bet: 0.05, mode: "buy-more", ...(explicit ? {roundId: "buy", delivery: "stepwise" as const} : {})});
        if (entry.status !== "played") throw new Error(JSON.stringify(entry));
        expect(entry.state.chargedEntry).toEqual({bet: 0.05, mode: "buy-more"});
        const continuation = explicit ? {delivery: "stepwise" as const, continuation: {roundId: "buy", cursor: 1}} : {};
        for (const mode of ["base", undefined]) {
            const corrupt = JSON.parse(JSON.stringify(entry.state)) as api.PokieSessionState;
            const state = corrupt.featureState as {base: api.BetModeSessionState};
            if (mode === undefined) Reflect.deleteProperty(state.base, "chargedBetModeId");
            else state.base.chargedBetModeId = mode;
            expect(api.validatePersistedSession(corrupt, game)).toMatchObject({status: "corrupt-state", reason: expect.stringContaining("attribution")});
            await repository.save("s", corrupt);
            const save = jest.spyOn(repository, "save"), 
                create = jest.spyOn(game, "createSession"), 
                debit = jest.spyOn(wallet, "debit"), 
                credit = jest.spyOn(wallet, "credit");
            expect((await handler().execute({kind: "spin", sessionId: "s", requestId: "invalid", ...continuation})).status).toBe("corrupt-state");
            for (const spy of [save, create, debit, credit]) expect(spy).not.toHaveBeenCalled();
            jest.restoreAllMocks();
            expect(await repository.load("s")).toEqual(corrupt);
            if (explicit) {
                const restored = mechanicsSession(game);
                restored.fromSessionState(corrupt.featureState);
                const before = JSON.parse(JSON.stringify(restored.toSessionState()));
                expect(() => new api.SessionRuntime(restored, entry.state.logicalRound)).toThrow(/attribution/);
                expect(restored.toSessionState()).toEqual(before);
            }
        }
        await repository.save("s", entry.state);
        const continued = await handler().execute({kind: "spin", sessionId: "s", requestId: "valid", ...continuation});
        expect(continued).toMatchObject({status: "played", mode: "buy-more", stake: 0, state: {roundPayload: {chargedBetModeId: "buy-more"}, chargedEntry: {bet: 0.05, mode: "buy-more"}}});
        if (continued.status !== "played") throw new Error(JSON.stringify(continued));
        expect(api.validatePersistedSession(continued.state, game)).toBeUndefined();
        if (explicit) expect(continued.state.logicalRound?.mode).toBe("buy-more");
    });

    it("F2 retains generated mechanic observations in public logical delivery", () => {
        const blueprint = existingMechanicsBlueprint(catalogue.find(row => row.id === "fixed-holdAndWin-modes")!);
        blueprint.reelStrips = [["C"], ["A"], ["J"]];
        const session = mechanicsSession(generatedMechanicsGame(blueprint));
        const result = new api.SessionRuntime(session).execute({kind: "spin", bet: 0.05, mode: "ante", roundId: "observations", delivery: "composite"});
        if (result.status !== "played" || !result.logicalRound) throw new Error(JSON.stringify(result));
        const visible = api.projectLogicalRound(result.logicalRound);
        expect(visible.subrounds[0].featureEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({type: "holdAndWin", data: expect.objectContaining({active: true, locks: expect.any(Array), respinsRemaining: 2, payout: 0})}),
            expect.objectContaining({type: "jackpot", data: expect.objectContaining({pools: [{id: "mini", value: 10}], award: {poolId: "mini", amount: 10}})}),
            {type: "chargedBetMode", data: {id: "ante"}},
        ]));
        expect(visible.currentStep!.featureEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({type: "holdAndWin", data: expect.objectContaining({active: false, respinsRemaining: 0, payout: 2})}),
        ]));
    });

});

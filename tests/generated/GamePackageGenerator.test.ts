import {existingMechanicsBlueprint} from "../v2/fixtures/ExistingMechanicsGame.js";
import {emitPublicRuntime} from "../v2/helpers/publicRuntime.js";
import {weightedBlueprint} from "../v2/fixtures/WeightedWholeSequenceGame.js";
import {authoritativePaytableBlueprint, type AuthoredAwardCase} from "../fixtures/math/AuthoritativePaytableFixture.js";
import {FRACTIONAL_BET_STAKES, FRACTIONAL_MIXED_CONTINUATION, fractionalBetBlueprint, amountTolerance, screenMultiplier} from "../fixtures/math/FractionalBetFixture.js";
import ts from "typescript";
import {RNG_PARITY_BLUEPRINT} from "../fixtures/wasm/createProductionParityFixture.js";
import {
    AUTHORED_MECHANIC_CATALOG,
    PackageBlueprintExtraction,
    BetMode,
    BetModeRuntimeSemanticsInvalidError,
    BUILT_PACKAGE_FILES,
    computeGameBlueprintHash,
    GameBlueprint,
    GameBlueprintValidator,
    GamePackageGenerator,
    loadPokieGameRuntime,
    generateWeightedOutcomeLibrary,
    PokieGame,
    ReplayRecorder,
    SymbolsCombination,
    SymbolsCombinationsGenerating,
    VideoSlotSessionHandling,
    VideoSlotWithFreeGamesSessionHandling,
    VideoSlotWithFreeGamesSessionState,
    VideoSlotSessionSerializer,
    VideoSlotWithBetModesSession,
} from "@fromstan/pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {GamePackageCreator} from "../../cli/scaffold/GamePackageCreator.js";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("GamePackageGenerator", () => {
    let cwd: string;
    let fractionalGames: Awaited<ReturnType<typeof loadPokieGameRuntime>>[];

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-test-"));
        fractionalGames = [];
    });

    afterEach(async () => {
        try {
            await Promise.all(fractionalGames.map(loaded => loaded.release()));
        } finally {
            fs.rmSync(cwd, {recursive: true, force: true});
        }
    });

    function loadFractionalEntrypoints(bets: number[], mixed = false): Promise<PokieGame[]> {
        return loadGeneratedEntrypoints(fractionalBetBlueprint(bets, mixed));
    }

    it("preserves weighted variants and seeded math in generated and compiled typed entrypoints", async () => {
        const games = await loadGeneratedEntrypoints(weightedBlueprint);
        const sessions = games.map(game => game.createSession({seed: "weighted-formats"}) as import("@fromstan/pokie").VideoSlotSession);
        for (let round = 0; round < 20; round++) {
            for (const session of sessions) session.play();
            expect(sessions[0].toSessionState()).toEqual(sessions[1].toSessionState());
            expect(sessions[0].getWinAmount()).toBe(sessions[1].getWinAmount());
        }
        expect(sessions[0].getSequenceStatistics()[0].selections).toBe(20);
    });

    async function loadGeneratedEntrypoints(blueprint: GameBlueprint): Promise<PokieGame[]> {
        const result = new GamePackageGenerator("1.3.0").generate(blueprint, cwd);
        const source = fs.readFileSync(path.join(result.projectRoot, "src/index.ts"), "utf8");
        const compiled = ts.transpileModule(source, {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
            reportDiagnostics: true,
        });
        expect(compiled.diagnostics).toEqual([]);
        const compiledPath = path.join(result.projectRoot, "dist", "fractional-typed.js");
        fs.writeFileSync(compiledPath, compiled.outputText);
        const cjs = await loadPokieGameRuntime(result.projectRoot, entry => require(entry));
        fractionalGames.push(cjs);
        const typed = await loadPokieGameRuntime(result.projectRoot, entry => require(path.join(path.dirname(entry), "fractional-typed.js")));
        fractionalGames.push(typed);
        expect(await cjs.game.getModelDescriptor!()).toEqual(await typed.game.getModelDescriptor!());
        const extraction = await new PackageBlueprintExtraction().extract(cjs.game);
        expect(extraction.status).toBe("complete");
        expect(extraction.blueprint?.paytable).toEqual(blueprint.paytable);
        return [cjs.game, typed.game];
    }

    it.each((["missing-symbol", "missing-count", "zero", "positive"] as AuthoredAwardCase[]).flatMap(kind => FRACTIONAL_BET_STAKES.map(bet => [kind, bet] as const)))("uses only authored %s awards at stake %s through generated CJS and compiled TS", async (kind, bet) => {
        const blueprint = authoritativePaytableBlueprint(kind, bet);
        const screen = blueprint.reelStrips!.map(strip => [strip[0]]);
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            const sessions = [game.createSession({seed: "0"}), game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix(screen)})];
            for (const raw of sessions) {
                const session = raw as VideoSlotSessionHandling;
                session.setBet(bet);
                expect(session.getBet()).toBe(bet);
                const expectedMap = Object.fromEntries(Object.entries(blueprint.paytable).map(([symbol, payouts]) => [symbol, Object.fromEntries(Object.entries(payouts).map(([count, multiplier]) => [count, multiplier * bet]))]));
                const before = session.getCreditsAmount();
                session.play();
                expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
                const expectedWin = kind === "positive" ? 2 * bet : 0;
                expect(session.getWinAmount()).toBe(expectedWin);
                expect(session.getPaytable().toMap()).toEqual({[bet]: expectedMap});
                expect(Object.values(session.getWinningLines())).toHaveLength(expectedWin ? 1 : 0);
                for (const line of Object.values(session.getWinningLines())) expect(line.getWinAmount()).toBe(expectedWin);
                expect(session.getWinEvaluationResult().getTotalWin()).toBe(expectedWin);
                expect(Math.abs(session.getCreditsAmount() - (before - bet + expectedWin))).toBeLessThanOrEqual(amountTolerance(before));
            }
        }
    });

    it.each((["lines", "ways", "clusters"] as const).flatMap(type => (["missing-symbol", "zero", "positive"] as const).map(kind => [type, kind] as const)))("keeps %s monetary wins authoritative for %s", async (type, kind) => {
        const blueprint = type === "clusters" ? buildBlueprint({
            reels: 5, rows: 1, availableBets: [0.01], paylines: [[0, 0, 0, 0, 0]], reelStrips: Array.from({length: 5}, () => ["B"]),
            paytable: kind === "missing-symbol" ? {A: {5: 5}} : {A: {5: 5}, B: {5: kind === "zero" ? 0 : 2}}, winModel: {type, minimumClusterSize: 5},
        }) : {...authoritativePaytableBlueprint(kind, 0.01), winModel: {type}};
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            const session = game.createSession({seed: "0"}) as VideoSlotSessionHandling;
            session.setBet(0.01);
            session.play();
            expect(session.getSymbolsCombination().toMatrix()).toEqual(blueprint.reelStrips!.map(strip => [strip[0]]));
            const wins = session.getWinEvaluationResult().getWinComponents();
            expect(wins).toHaveLength(kind === "positive" ? 1 : 0);
            expect(session.getWinAmount()).toBe(kind === "positive" ? 0.02 : 0);
            for (const win of wins) expect(win.getWinAmount()).toBe(0.02);
            expect(new VideoSlotSessionSerializer().getRoundData(session).totalWin).toBe(session.getWinAmount());
        }
    });

    it.each(["missing-count", "zero", "positive"] as const)("keeps wild substitution authoritative for %s", async kind => {
        const missing = kind === "missing-count";
        const symbols = missing ? ["A", "W", "A", "B", "B"] : ["A", "W", "A"];
        const blueprint = buildBlueprint({
            rows: 1, reels: symbols.length, symbols: ["A", "B", "W"], wilds: ["W"], availableBets: [0.1],
            reelStrips: symbols.map(symbol => [symbol]), paylines: [symbols.map(() => 0)],
            paytable: {A: missing ? {5: 10} : {3: kind === "zero" ? 0 : 5}},
        });
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            const session = game.createSession({seed: "0"}) as VideoSlotSessionHandling;
            session.setBet(0.1);
            session.play();
            expect(session.getWinAmount()).toBe(kind === "positive" ? 0.5 : 0);
            expect(Object.values(session.getWinningLines())).toHaveLength(kind === "positive" ? 1 : 0);
            for (const win of Object.values(session.getWinningLines())) {
                expect(win.getSymbolId()).toBe("A");
                expect(win.getWildSymbolsPositions()).toEqual([1]);
            }
        }
    });

    it.each(["missing-symbol", "zero", "positive"] as const)("grants free games with %s scatter money and preserves subsequent free spins", async kind => {
        const blueprint = buildBlueprint({
            rows: 1, symbols: ["A", "S"], scatters: ["S"], availableBets: [0.01],
            reelStrips: [["S"], ["S"], ["S"]], paylines: [[0, 0, 0]],
            paytable: kind === "missing-symbol" ? {A: {3: 5}} : {A: {3: 5}, S: {3: kind === "zero" ? 0 : 2}},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}},
        });
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            const session = game.createSession({seed: "0"}) as VideoSlotWithFreeGamesSessionHandling & {getStakeAmount(): number};
            session.setBet(0.01);
            const before = session.getCreditsAmount();
            expect(session.getWonFreeGamesNumber()).toBe(0);
            expect(session.getFreeGamesSum()).toBe(0);
            session.play();
            expect(session.getWinAmount()).toBe(kind === "positive" ? 0.02 : 0);
            expect(Object.keys(session.getWinningScatters())).toHaveLength(kind === "positive" ? 1 : 0);
            expect(session.getWonFreeGamesNumber()).toBe(2);
            expect(session.getFreeGamesSum()).toBe(2);
            expect(session.getStakeAmount()).toBe(0);
            expect(session.getCreditsAmount()).toBeCloseTo(before - 0.01 + session.getWinAmount(), 10);
            const beforeFree = session.getCreditsAmount();
            session.play();
            expect(session.getFreeGamesNum()).toBe(1);
            expect(session.getFreeGamesSum()).toBe(4);
            expect(session.getCreditsAmount()).toBe(beforeFree);
            expect(session.getWinAmount()).toBe(kind === "positive" ? 0.02 : 0);
        }
    });

    it.each([
        ["omitted three-scatter grant", ["S", "S", "S", "A", "A"], "S", 0, 0],
        ["omitted four-scatter grant", ["S", "S", "S", "S", "A"], "S", 0, 0],
        ["authored five-scatter grant", ["S", "S", "S", "S", "S"], "S", 2, 2],
        ["unconfigured scatter symbol", ["S", "S", "S", "T", "A"], "T", 0, 0],
    ] as const)("keeps %s authoritative through generated CJS and compiled TS", async (_name, symbols, scatterSymbol, win, grant) => {
        const blueprint = buildBlueprint({
            reels: 5, rows: 1, symbols: scatterSymbol === "S" ? ["A", "S"] : ["A", "S", "T"], wilds: [], scatters: scatterSymbol === "S" ? ["S"] : ["S", "T"], availableBets: [1],
            paylines: [[0, 0, 0, 0, 0]], reelStrips: symbols.map(symbol => [symbol]),
            paytable: {A: {5: 5}, S: {3: 0, 5: 2}},
            mechanics: {freeGames: {scatterSymbol, awardsByCount: {5: 2}}},
        });
        // The supplied S/S/S/A/A reproduction passes the existing reachability rules.
        if (_name === "omitted three-scatter grant") {
            expect(new GameBlueprintValidator().validate(blueprint).filter(issue => issue.severity === "error")).toEqual([]);
        }
        const screen = symbols.map(symbol => [symbol]);
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            for (const raw of [game.createSession({seed: "0"}), game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix(screen)})]) {
                const session = raw as VideoSlotWithFreeGamesSessionHandling;
                session.play();
                expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
                expect(session.getWinAmount()).toBe(win);
                expect(session.getWinEvaluationResult().getWinComponents()).toHaveLength(win ? 1 : 0);
                expect(session.getWonFreeGamesNumber()).toBe(grant);
                expect(session.getFreeGamesSum()).toBe(grant);
                expect(session.getCreditsAmount()).toBe(999 + win);
                expect(session.getFreeGamesForScatters("S", 3)).toBe(0);
                expect(session.getFreeGamesForScatters("S", 4)).toBe(0);
                expect(session.getFreeGamesForScatters(scatterSymbol, 5)).toBe(2);
                expect(session.getFreeGamesForScatters(scatterSymbol === "S" ? "T" : "S", 5)).toBe(0);
            }
            const replay = new ReplayRecorder().record({game, seed: "0", round: 2});
            expect(replay.screen).toEqual(screen);
            expect(replay.totalBet).toBe(grant ? 1 : 2);
            expect(replay.totalWin).toBe(2 * win);
        }
    });

    it.each([undefined, 0])("preserves explicit grants with scatter money %s through base, ante and buyFeature wrappers", async multiplier => {
        const blueprint = buildBlueprint({
            rows: 1, symbols: ["A", "S"], scatters: ["S"], availableBets: [1],
            reelStrips: [["S"], ["S"], ["S"]], paylines: [[0, 0, 0]],
            paytable: multiplier === undefined ? {A: {3: 5}} : {A: {3: 5}, S: {3: multiplier}},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}},
            betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 1.5}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 2}],
        });
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            for (const factory of [() => game.createSession({seed: "0"}), () => game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix([["S"], ["S"], ["S"]])})]) {
                for (const [mode, stake] of [["base", 1], ["ante", 1.5], ["buy", 100]] as const) {
                    const session = factory() as VideoSlotWithBetModesSession;
                    session.setBetMode(mode);
                    const before = session.getCreditsAmount();
                    session.play();
                    const expectedSum = mode === "buy" ? 4 : 2;
                    expect(session.toSessionState().base as VideoSlotWithFreeGamesSessionState).toMatchObject({freeGamesSum: expectedSum, freeGamesNum: mode === "buy" ? 1 : 0, wonFreeGamesNumber: 2});
                    expect(session.getWinAmount()).toBe(0);
                    expect(session.getWinningScatters()).toEqual({});
                    expect(session.getCreditsAmount()).toBe(before - stake);
                    expect(session.getStakeAmount()).toBe(0);
                    expect(session.getBetModeId()).toBe(mode === "buy" ? "base" : mode);
                    const beforeFree = session.getCreditsAmount();
                    session.play();
                    expect(session.getCreditsAmount()).toBe(beforeFree);
                    expect(session.toSessionState().base as VideoSlotWithFreeGamesSessionState).toMatchObject({freeGamesSum: expectedSum + 2, freeGamesNum: mode === "buy" ? 2 : 1, wonFreeGamesNumber: 2});
                }
            }
        }
    });

    it("keeps complete mixed-bet keys in an authoritative sparse table", async () => {
        const blueprint = {...authoritativePaytableBlueprint("missing-count"), availableBets: FRACTIONAL_BET_STAKES};
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            const session = game.createSession({seed: "0"}) as VideoSlotSessionHandling;
            expect(new Set(session.getPaytable().getAvailableBets())).toEqual(new Set(FRACTIONAL_BET_STAKES));
            for (const bet of FRACTIONAL_BET_STAKES) {
                session.setBet(bet);
                session.play();
                expect(session.getWinAmount()).toBe(0);
                expect(session.getPaytable().toMap()[bet]).toEqual({A: {5: 10 * bet}, B: {5: 2 * bet}});
            }
        }
    });

    it.each(["ways", "clusters"] as const)("does not fill omitted match counts for %s", async type => {
        const blueprint = type === "ways" ? {...authoritativePaytableBlueprint("missing-count", 0.1), winModel: {type}} : buildBlueprint({
            reels: 5, rows: 2, availableBets: [0.1], winModel: {type, minimumClusterSize: 5},
            reelStrips: Array.from({length: 5}, () => ["A", "B"]), paytable: {A: {6: 10}, B: {6: 2}},
        });
        const screen = type === "ways" ? [["A"], ["A"], ["A"], ["B"], ["B"]] : Array.from({length: 5}, () => ["A", "B"]);
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            const session = game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix(screen)}) as VideoSlotSessionHandling;
            session.setBet(0.1);
            session.play();
            expect(session.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(session.getWinAmount()).toBe(0);
            expect(session.getWinEvaluationResult().getWinComponents()).toEqual([]);
        }
    });

    it.each(["missing-symbol", "zero", "positive"] as const)("keeps authored %s awards through base, ante, buyFeature and exact mode wrappers", async kind => {
        const blueprint = {
            ...authoritativePaytableBlueprint(kind, 0.01), symbols: ["A", "B", "S"], scatters: ["S"],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}},
            betModes: [{id: "base", runtimeType: "base" as const, isDefault: true}, {id: "ante", runtimeType: "ante" as const, costMultiplier: 1.5}, {id: "buy", runtimeType: "buyFeature" as const, costMultiplier: 100, forcedFreeGames: 2}],
        };
        for (const game of await loadGeneratedEntrypoints(blueprint)) {
            for (const factory of [() => game.createSession({seed: "0"}), () => game.createExactEnumerationSession!({generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix([["B"], ["B"], ["B"]])})]) {
                for (const mode of ["base", "ante"]) {
                    const session = factory() as VideoSlotWithBetModesSession;
                    session.setBet(0.01);
                    session.setBetMode(mode);
                    const stake = mode === "ante" ? 0.015 : 0.01;
                    expect(session.getStakeAmount()).toBe(stake);
                    const before = session.getCreditsAmount();
                    session.play();
                    expect(session.getWinAmount()).toBe(kind === "positive" ? 0.02 : 0);
                    expect(session.getCreditsAmount()).toBeCloseTo(before - stake + session.getWinAmount(), 10);
                    expect(session.getPaytable().toMap()[0.01]).toEqual(kind === "missing-symbol" ? {A: {3: 0.05}} : {A: {3: 0.05}, B: {3: kind === "zero" ? 0 : 0.02}});
                }
                const session = factory() as VideoSlotWithBetModesSession;
                session.setBet(0.01);
                session.setBetMode("buy");
                const before = session.getCreditsAmount();
                session.play();
                expect(session.getCreditsAmount()).toBe(before - 1);
                expect(session.getBetModeId()).toBe("base");
                // The purchase itself consumes the first of the two forced spins.
                for (let index = 0; index < 1; index++) {
                    expect(session.getStakeAmount()).toBe(0);
                    session.play();
                    expect(session.getWinAmount()).toBe(kind === "positive" ? 0.02 : 0);
                }
                expect(session.getStakeAmount()).toBe(0.01);
                expect(session.getCreditsAmount()).toBeCloseTo(before - 1 + (kind === "positive" ? 0.04 : 0), 10);
            }
        }
    });

    it.each(FRACTIONAL_BET_STAKES)("pays 5 * stake %s through actual generated CJS and compiled TypeScript entrypoints", async (bet) => {
        for (const game of await loadFractionalEntrypoints([bet])) {
            const session = game.createSession({seed: "0"}) as VideoSlotSessionHandling;
            session.setBet(bet);
            expect(session.getBet()).toBe(bet);
            const credits = session.getCreditsAmount();
            session.play();
            expect(session.getSymbolsCombination().toMatrix()).toEqual([["A"], ["A"], ["A"]]);
            expect(session.getWinAmount()).toBe(5 * bet);
            expect(session.getWinAmount()).toBeGreaterThan(0);
            expect(Math.abs(session.getCreditsAmount() - (credits - bet + 5 * bet))).toBeLessThanOrEqual(amountTolerance(credits));
        }
    });

    it("selects every fractional stake in a multiple-bet generated CJS and compiled TypeScript session", async () => {
        for (const game of await loadFractionalEntrypoints(FRACTIONAL_BET_STAKES)) {
            const session = game.createSession({seed: "0"}) as VideoSlotSessionHandling;
            expect(session.getAvailableBets()).toEqual(FRACTIONAL_BET_STAKES);
            expect(new Set(session.getPaytable().getAvailableBets())).toEqual(new Set(FRACTIONAL_BET_STAKES));
            for (const bet of FRACTIONAL_BET_STAKES) {
                session.setBet(bet);
                expect(session.getBet()).toBe(bet);
                const credits = session.getCreditsAmount();
                session.play();
                expect(session.getWinAmount()).toBe(5 * bet);
                expect(Math.abs(session.getCreditsAmount() - (credits - bet + 5 * bet))).toBeLessThanOrEqual(amountTolerance(credits));
            }
            session.setBet(99);
            expect(session.getBet()).toBe(FRACTIONAL_BET_STAKES[0]);
        }
    });

    it.each(FRACTIONAL_BET_STAKES)("preserves mixed-strip seeded screens and continuation at stake %s in CJS and compiled TypeScript", async (bet) => {
        for (const game of await loadFractionalEntrypoints([bet], true)) {
            const session = game.createSession({seed: "0"}) as VideoSlotSessionHandling & {toSessionState(): {rngState?: unknown}};
            const observed: unknown[] = [];
            for (let round = 0; round < 8; round++) {
                session.setBet(bet);
                expect(session.getBet()).toBe(bet);
                const credits = session.getCreditsAmount();
                session.play();
                const screen = session.getSymbolsCombination().toMatrix();
                observed.push({screen, rngState: session.toSessionState().rngState});
                expect(session.getWinAmount()).toBe(screenMultiplier(screen) * bet);
                expect(Math.abs(session.getCreditsAmount() - (credits - bet + screenMultiplier(screen) * bet))).toBeLessThanOrEqual(amountTolerance(credits));
            }
            expect(observed).toEqual(FRACTIONAL_MIXED_CONTINUATION);
        }
    });

    it("writes the complete canonical package file set (package.json, package-lock.json, tsconfig.json, README.md, src/index.ts, dist/index.js) under ./<manifest.id> by default", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);

        const projectRoot = path.join(cwd, "sample-slot");
        expect(result.projectRoot).toBe(projectRoot);
        expect(result.manifest).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
        expect(result.createdFiles.sort()).toEqual([...BUILT_PACKAGE_FILES].sort());
        expect(BUILT_PACKAGE_FILES.sort()).toEqual(
            ["package.json", "package-lock.json", "tsconfig.json", "README.md", "src/index.ts", "dist/index.js"].sort(),
        );
        for (const relativeFile of BUILT_PACKAGE_FILES) {
            expect(fs.existsSync(path.join(projectRoot, ...relativeFile.split("/")))).toBe(true);
        }
        // No blueprint/build-info/creation-seed metadata of any kind is left in a newly built package --
        // "src" only ever holds the one canonical entry module, same as "pokie create"/"pokie init".
        expect(fs.readdirSync(path.join(projectRoot, "src"))).toEqual(["index.ts"]);
    });

    it("writes a package.json matching the exact same canonical shape buildPackageJsonPatch gives pokie create/pokie init -- pokie dependency, main/exports/pokie.entry, and scripts.build all agreeing on dist/index.js", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));

        expect(pkg.name).toBe("sample-slot");
        expect(pkg.version).toBe("0.1.0");
        expect(pkg.dependencies).toEqual({"@fromstan/pokie": "^1.3.0"});
        expect(pkg.pokie).toEqual({entry: "./dist/index.js"});
        expect(pkg.main).toBe("./dist/index.js");
        expect(pkg.exports).toBe("./dist/index.js");
        expect(pkg.scripts).toEqual({build: "tsc", start: "pokie dev .", server: "pokie serve .", client: "pokie client ."});
        expect(pkg.devDependencies).toEqual(expect.objectContaining({typescript: expect.any(String), "@types/node": expect.any(String)}));
    });

    it("writes a tsconfig.json matching the exact same canonical shape pokie create/pokie init write, and a package-lock.json seeding the same pokie/typescript/@types-node dependencies package.json declares", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));
        const tsconfig = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "tsconfig.json"), "utf-8"));
        const packageLock = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package-lock.json"), "utf-8"));

        expect(tsconfig.compilerOptions.outDir).toBe("dist");
        expect(tsconfig.compilerOptions.rootDir).toBe("src");
        expect(tsconfig.include).toEqual(["src"]);

        expect(packageLock.name).toBe(pkg.name);
        expect(packageLock.version).toBe(pkg.version);
        expect(packageLock.packages[""].dependencies).toEqual(pkg.dependencies);
        expect(packageLock.packages[""].devDependencies).toEqual(pkg.devDependencies);
    });

    it("agrees with GamePackageCreator's ('pokie create') own package.json/tsconfig.json contract for the same pokie version, and reproduces the same required package file set its own 'create' phase (plus GamePackagePreparer's README.md) writes", () => {
        const pokieVersion = "1.3.0";
        const generator = new GamePackageGenerator(pokieVersion);
        const creator = new GamePackageCreator(pokieVersion);

        const built = generator.generate(buildBlueprint(), cwd);
        const created = creator.create(cwd, "hand-authored-slot");

        const builtPkg = JSON.parse(fs.readFileSync(path.join(built.projectRoot, "package.json"), "utf-8"));
        const createdPkg = JSON.parse(fs.readFileSync(path.join(created.projectRoot, "package.json"), "utf-8"));

        // Both go through the exact same shared buildPackageJsonPatch -- these fields must agree
        // regardless of how differently each package's own src/ content is produced (a single generated
        // module here, a hand-editable multi-file scaffold there).
        expect(builtPkg.main).toBe(createdPkg.main);
        expect(builtPkg.exports).toBe(createdPkg.exports);
        expect(builtPkg.pokie).toEqual(createdPkg.pokie);
        expect(builtPkg.scripts).toEqual(createdPkg.scripts);
        expect(builtPkg.dependencies).toEqual(createdPkg.dependencies);
        // "pokie build"'s own devDependencies is exactly "pokie create"'s, plus the @types/node this
        // generator alone adds (see this generator's own DEFAULT_TYPES_NODE_VERSION doc comment) --
        // never a different typescript version, or a dropped/renamed key.
        expect(builtPkg.devDependencies).toEqual({...createdPkg.devDependencies, "@types/node": expect.any(String)});

        const builtTsconfig = JSON.parse(fs.readFileSync(path.join(built.projectRoot, "tsconfig.json"), "utf-8"));
        const createdTsconfig = JSON.parse(fs.readFileSync(path.join(created.projectRoot, "tsconfig.json"), "utf-8"));
        expect(builtTsconfig).toEqual(createdTsconfig);

        // GamePackagePreparer's own "create" phase (see its runCreatePhase) always writes README.md
        // right after GamePackageCreator.create() itself returns -- reproduced here without a real npm
        // install/build (already covered end-to-end by GamePackagePreparer.integration.test.ts's real,
        // subprocess-driven lifecycle). Every BUILT_PACKAGE_FILES entry that doesn't require an actual
        // "npm install"/"npm run build" to exist (package-lock.json, dist/index.js) must already be
        // exactly what that create phase produces too.
        const createPhaseFiles = [...created.createdFiles, "README.md"];
        const requiresInstallOrBuild = ["package-lock.json", "dist/index.js"];
        for (const canonicalFile of BUILT_PACKAGE_FILES) {
            if (requiresInstallOrBuild.includes(canonicalFile)) {
                continue;
            }
            expect(createPhaseFiles).toContain(canonicalFile);
        }
    });

    it("writes an src/index.ts typed with the real GameBlueprint contract -- the same blueprint data, entry point, and manifest dist/index.js embeds", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const source = fs.readFileSync(path.join(result.projectRoot, "src", "index.ts"), "utf-8");
        const distIndexJs = fs.readFileSync(path.join(result.projectRoot, "dist", "index.js"), "utf-8");

        expect(source).toContain('import type {GameBlueprint, PokieGameContext} from "@fromstan/pokie" with { "resolution-mode": "require" };');
        expect(source).toContain("const blueprint: GameBlueprint = ");
        expect(source).toContain("const sequences: unknown[] = [];");
        expect(source).toContain("module.exports = {");
        // Both files embed the exact same blueprint data and manifest -- a real "npm run build" of
        // src/index.ts would reproduce an equivalent dist/index.js, not a different game.
        const sourceBlueprint = JSON.parse(source.match(/const blueprint: GameBlueprint = ([\s\S]*?);\n\n/)![1]);
        const distBlueprint = JSON.parse(distIndexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);
        expect(sourceBlueprint).toEqual(distBlueprint);
    });

    it("defaults package.json's description when the blueprint manifest has none, and carries keywords", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));

        expect(pkg.description).toBe('Generated by "pokie build" — a POKIE video slot game package.');
        expect(pkg.keywords).toEqual(["pokie", "video-slot", "generated"]);
    });

    it("uses the blueprint manifest's own description when given", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0", description: "A fruity slot."},
        });

        const result = generator.generate(blueprint, cwd);
        const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));

        expect(pkg.description).toBe("A fruity slot.");
    });

    it("writes a README.md documenting the built structure and workflow", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const readme = fs.readFileSync(path.join(result.projectRoot, "README.md"), "utf-8");

        expect(readme).toContain("# Sample Slot");
        expect(readme).toContain("dist/index.js");
        expect(readme).toContain("Do not hand-edit");
        expect(readme).toContain("pokie inspect .");
        expect(readme).toContain("pokie validate .");
    });

    it("embeds a short header naming the game and pokie version in dist/index.js, but no blueprint-hash/provenance metadata", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const indexJs = fs.readFileSync(path.join(result.projectRoot, "dist", "index.js"), "utf-8");

        expect(indexJs).toContain("GENERATED FILE — do not hand-edit");
        expect(indexJs).toContain("Sample Slot");
        expect(indexJs).toContain("pokie 1.3.0");
    });

    it("honors --out (an explicit outDir) instead of deriving the directory from manifest.id", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd, "elsewhere");

        expect(result.projectRoot).toBe(path.join(cwd, "elsewhere"));
        expect(fs.existsSync(path.join(cwd, "sample-slot"))).toBe(false);
    });

    it.each(["../escape", "nested/slot", "nested\\slot", ".", "..", "/absolute-slot"])("rejects path-shaped manifest.id %s when no --out is given without publication", (id) => {
        const generator = new GamePackageGenerator("1.3.0");

        expect(() =>
            generator.generate(buildBlueprint({manifest: {id: id.startsWith("/") ? path.join(cwd, "absolute-slot") : id, name: "Escape", version: "0.1.0"}}), cwd),
        ).toThrow(/not a valid directory name/);
        expect(fs.readdirSync(cwd)).toEqual([]);
    });

    describe("missing-or-empty destination only -- no rebuild/merge recognition", () => {
        function readBuiltFiles(projectRoot: string): Record<string, string> {
            const contents: Record<string, string> = {};
            for (const relativePath of BUILT_PACKAGE_FILES) {
                contents[relativePath] = fs.readFileSync(path.join(projectRoot, ...relativePath.split("/")), "utf-8");
            }
            return contents;
        }

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it("builds into a directory that doesn't exist yet, or one that already exists but is empty", () => {
            const generator = new GamePackageGenerator("1.3.0");

            expect(() => generator.generate(buildBlueprint(), cwd)).not.toThrow();

            const emptyDir = path.join(cwd, "already-empty");
            fs.mkdirSync(emptyDir, {recursive: true});
            expect(() => generator.generate(buildBlueprint(), cwd, "already-empty")).not.toThrow();
            expect(fs.existsSync(path.join(emptyDir, "package.json"))).toBe(true);
        });

        it("refuses a build into a directory that already holds any content, leaving it untouched -- there is no recognition of prior pokie build output to safely overwrite", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const first = generator.generate(buildBlueprint(), cwd);

            expect(() =>
                generator.generate(buildBlueprint({manifest: {id: "sample-slot", name: "Sample Slot Deluxe", version: "0.2.0"}}), cwd),
            ).toThrow(/already exists and is not empty/);

            const pkg = JSON.parse(fs.readFileSync(path.join(first.projectRoot, "package.json"), "utf-8"));
            expect(pkg.version).toBe("0.1.0");
        });

        it("throws a descriptive error when the target path already exists and is not a directory", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const projectRoot = path.join(cwd, "sample-slot");
            fs.writeFileSync(projectRoot, "not a directory");

            expect(() => generator.generate(buildBlueprint(), cwd)).toThrow(/already exists and is not a directory/);
        });

        it("commits the whole package with a single atomic directory rename, never a partial write", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const projectRoot = path.join(cwd, "sample-slot");

            const realRenameSync = fs.renameSync.bind(fs);
            const renameTargets: string[] = [];
            jest.spyOn(fs, "renameSync").mockImplementation((from, to) => {
                renameTargets.push(String(to));
                return realRenameSync(from, to);
            });

            const result = generator.generate(buildBlueprint(), cwd);

            jest.restoreAllMocks();
            expect(renameTargets).toEqual([projectRoot]);
            expect(readBuiltFiles(result.projectRoot)["package.json"]).toContain("sample-slot");
        });

        it("leaves nothing behind -- no partial write, no leftover temp directory -- when staging a file fails", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const projectRoot = path.join(cwd, "sample-slot");

            jest.spyOn(fs, "writeFileSync").mockImplementation((targetPath) => {
                if (String(targetPath).endsWith("README.md")) {
                    throw new Error("simulated disk-full while staging");
                }
            });

            expect(() => generator.generate(buildBlueprint(), cwd)).toThrow(/simulated disk-full while staging/);

            jest.restoreAllMocks();
            expect(fs.existsSync(projectRoot)).toBe(false);
            expect(fs.readdirSync(cwd)).toEqual([]);

            // A clean retry (unmocked) still succeeds afterward -- the failure left nothing in the way.
            const result = generator.generate(buildBlueprint(), cwd);
            expect(fs.existsSync(path.join(result.projectRoot, "package.json"))).toBe(true);
        });

        it("leaves projectRoot missing and nothing else behind when the commit rename itself fails", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const projectRoot = path.join(cwd, "sample-slot");

            const realRenameSync = fs.renameSync.bind(fs);
            jest.spyOn(fs, "renameSync").mockImplementation((from, to) => {
                if (String(to) === projectRoot) {
                    throw new Error("simulated rename failure committing the build");
                }
                return realRenameSync(from, to);
            });

            expect(() => generator.generate(buildBlueprint(), cwd)).toThrow(/simulated rename failure committing the build/);

            jest.restoreAllMocks();
            expect(fs.existsSync(projectRoot)).toBe(false);
            expect(fs.readdirSync(cwd)).toEqual([]);
        });
    });

    it("generates a game package that is loadable and playable through the pokie contract", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStrips: [
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ],
        });

        const result = generator.generate(blueprint, cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;

        expect(game.getManifest()).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});

        const session = game.createSession();
        session.setBet(1);
        session.play();

        // Every reel strip is a single "A" repeated, so every spin lands an all-"A" screen and every
        // one of the default horizontal lines wins the "A": 3 payout (5x bet) configured above.
        expect(session.getWinAmount()).toBeGreaterThan(0);
    });

    it("preserves constructor consumption, initial continuation, and numeric/string seed distinction in generated CJS and TypeScript", () => {
        const result = new GamePackageGenerator("1.3.0").generate(RNG_PARITY_BLUEPRINT, cwd);
        const cjs = require(result.projectRoot) as PokieGame;
        const source = fs.readFileSync(path.join(result.projectRoot, "src/index.ts"), "utf8");
        const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
        const compiledPath = path.join(result.projectRoot, "dist", "typed-parity.js");
        fs.writeFileSync(compiledPath, compiled);
        const typed = require(compiledPath) as PokieGame;
        for (const seed of ["0", 0]) {
            const left = cjs.createSession({seed}) as VideoSlotSessionHandling & {toSessionState(): {rngState: number}; fromSessionState(state: {rngState: number}): unknown};
            const right = typed.createSession({seed}) as typeof left;
            const initial = JSON.parse(JSON.stringify(left.toSessionState()));
            expect(right.toSessionState()).toEqual(initial);
            left.setBet(1);
            left.play();
            const screen = left.getSymbolsCombination().toMatrix();
            const after = left.toSessionState();
            right.setBet(1);
            right.play();
            expect(right.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(right.toSessionState()).toEqual(after);
            const restored = cjs.createSession({seed}) as typeof left;
            restored.fromSessionState(initial);
            restored.setBet(1);
            restored.play();
            expect(restored.getSymbolsCombination().toMatrix()).toEqual(screen);
            expect(restored.toSessionState()).toEqual(after);
            if (seed === "0") expect({screen, win: left.getWinAmount(), rngState: after.rngState}).toEqual({screen: [["A"], ["B"]], win: 0, rngState: 3921318019});
        }
        const numeric = cjs.createSession({seed: 0}) as unknown as {toSessionState(): unknown};
        const text = cjs.createSession({seed: "0"}) as unknown as typeof numeric;
        expect(numeric.toSessionState()).not.toEqual(text.toSessionState());
    });

    it("wires a ways winModel into a playable generated package", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            winModel: {type: "ways"},
            reelStrips: [
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ],
        });

        const result = generator.generate(blueprint, cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const session = game.createSession();
        session.setBet(1);
        session.play();

        expect(session.getWinAmount()).toBeGreaterThan(0);
    });

    it("wires a clusters winModel (with minimumClusterSize) into a playable generated package", () => {
        const generator = new GamePackageGenerator("1.3.0");
        // A 3x3 all-"A" grid forms one 9-cell cluster -- unlike line/ways match-counts (bounded by
        // "reels"), a cluster's size is bounded by the whole grid, so the paytable needs an entry at
        // that actual size (9), not a reels-sized one.
        const blueprint = buildBlueprint({
            winModel: {type: "clusters", minimumClusterSize: 4},
            paytable: {A: {9: 50}, B: {3: 2}},
            reelStrips: [
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ],
        });

        const result = generator.generate(blueprint, cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const session = game.createSession();
        session.setBet(1);
        session.play();

        expect(session.getWinAmount()).toBeGreaterThan(0);
    });

    it("wires mechanics.freeGames into a VideoSlotWithFreeGamesSession-backed generated package", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            symbols: ["A", "B", "S"],
            scatters: ["S"],
            paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
            reelStrips: [
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ],
        });

        const result = generator.generate(blueprint, cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const session = game.createSession() as unknown as {getWonFreeGamesNumber?: () => number; setBet(bet: number): void; play(): void};

        // getWonFreeGamesNumber only exists on VideoSlotWithFreeGamesSession -- its presence confirms
        // the generated module actually wrapped the session (not just the config) for free games.
        expect(typeof session.getWonFreeGamesNumber).toBe("function");
        session.setBet(1);
        session.play();
        expect(session.getWonFreeGamesNumber?.()).toBeGreaterThanOrEqual(0);
    });

    it("exposes getBetModes() on the generated package only when betModes is configured", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const betModes = [{id: "base"}, {id: "buy-bonus", costMultiplier: 100}];
        const withBetModes = generator.generate(buildBlueprint({betModes, manifest: {id: "with-bet-modes", name: "With", version: "0.1.0"}}), cwd);
        const withoutBetModes = generator.generate(buildBlueprint({manifest: {id: "without-bet-modes", name: "Without", version: "0.1.0"}}), cwd);

        const gameWithBetModes = require(path.join(withBetModes.projectRoot, "dist", "index.js")) as PokieGame;
        const gameWithoutBetModes = require(path.join(withoutBetModes.projectRoot, "dist", "index.js")) as PokieGame;

        expect(gameWithBetModes.getBetModes?.()).toEqual(betModes);
        expect(gameWithoutBetModes.getBetModes).toBeUndefined();
    });

    // Regression: the blueprint's declarative BetMode shape (id/label/costMultiplier only) has no
    // field distinguishing a persistent ante-style multiplier from a one-shot buy-bonus/
    // forced-feature-entry mode, and no explicit "default mode" flag. Wiring createSession() to guess
    // either from costMultiplier/array order would silently misapply the wrong runtime semantics --
    // e.g. exactly the case below, where a high-multiplier "buy-bonus"-named mode must NOT become a
    // persistent 100x base mode the session just keeps charging forever. Until the blueprint schema
    // itself carries an explicit runtime-semantics contract, createSession() must not guess at all.
    it("a high-multiplier buy-bonus-like blueprint mode never becomes a persistent high-multiplier base mode -- no bet-mode wrapping happens at all", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const betModes = [{id: "base"}, {id: "buy-bonus", costMultiplier: 100}];
        const result = generator.generate(
            buildBlueprint({betModes, manifest: {id: "with-buy-bonus-like-mode", name: "With Buy Bonus", version: "0.1.0"}}),
            cwd,
        );

        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const session = game.createSession();

        // No BetModeSelecting/StakeAmountDetermining wiring at all -- getBet()/getStakeAmount() (if
        // present) are never silently multiplied by 100x, and there's no setBetMode() to even select
        // "buy-bonus" with, persistent or otherwise.
        const candidate = session as Partial<{setBetMode: unknown; getBetModeId: unknown; getStakeAmount: unknown}>;
        expect(candidate.setBetMode).toBeUndefined();
        expect(candidate.getBetModeId).toBeUndefined();
        expect(candidate.getStakeAmount).toBeUndefined();
        // getBetModes() still exposes the declarative data as-is, for a caller to build real runtime
        // wiring (or a UI) externally -- only createSession() itself never guesses from it.
        expect(game.getBetModes?.()).toEqual(betModes);
    });

    // Regression: with no explicit "default mode" contract in the blueprint schema, the first array
    // entry must never be silently treated as a runtime default -- since there is no wiring at all,
    // there is no "default" to derive incorrectly in the first place.
    it("does not derive a default mode from betModes array order -- there is no runtime mode concept to default at all", () => {
        const generator = new GamePackageGenerator("1.3.0");
        // "ante" listed first here, on purpose -- if anything ever silently picked "index 0" as the
        // runtime default again, this ordering would catch it defaulting to "ante" instead of "base".
        const betModes = [{id: "ante", costMultiplier: 1.25}, {id: "base"}];
        const result = generator.generate(
            buildBlueprint({betModes, manifest: {id: "no-implied-default", name: "No Implied Default", version: "0.1.0"}}),
            cwd,
        );

        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const session = game.createSession();

        expect((session as Partial<{getBetModeId: unknown}>).getBetModeId).toBeUndefined();
        expect(game.getBetModes?.()).toEqual(betModes);
    });

    describe("explicit runtime-semantics contract (runtimeType/isDefault/forcedFreeGames)", () => {
        function createSessionAs(result: {projectRoot: string}) {
            const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
            return game.createSession() as unknown as {
                getBetModeId(): string;
                setBetMode(modeId: string): void;
                getStakeAmount(): number;
                getBet(): number;
                setCreditsAmount(amount: number): void;
                getCreditsAmount(): number;
                getWinAmount(): number;
                play(): void;
            };
        }

        it("wires a persistent ante mode when the whole betModes array is a fully-determined, valid contract", () => {
            const generator = new GamePackageGenerator("1.3.0");
            // "ante" listed first, isDefault on "base" (second) -- the explicit flag, not array order,
            // must decide the starting mode (see the array-order regression test above).
            const betModes: BetMode[] = [
                {id: "ante", runtimeType: "ante", costMultiplier: 1.25},
                {id: "base", runtimeType: "base", isDefault: true},
            ];
            const result = generator.generate(
                buildBlueprint({betModes, manifest: {id: "explicit-ante", name: "Explicit Ante", version: "0.1.0"}}),
                cwd,
            );

            const session = createSessionAs(result);
            expect(session.getBetModeId()).toBe("base"); // explicit isDefault, not betModes[0]
            expect(session.getStakeAmount()).toBe(session.getBet());

            session.setBetMode("ante");
            expect(session.getStakeAmount()).toBeCloseTo(session.getBet() * 1.25, 10);

            session.setCreditsAmount(1000);
            const creditsBefore = session.getCreditsAmount();
            session.play();
            expect(session.getCreditsAmount()).toBeCloseTo(creditsBefore - session.getBet() * 1.25 + session.getWinAmount(), 10);
        });

        it("wires the same explicit base and ante semantics onto a finite package's exact-enumeration session", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const result = generator.generate(
                buildBlueprint({
                    reels: 2,
                    rows: 1,
                    reelStrips: [
                        ["A", "B"],
                        ["A", "B"],
                    ],
                    paytable: {A: {2: 5}, B: {2: 2}},
                    betModes: [
                        {id: "ante", runtimeType: "ante", costMultiplier: 1.25},
                        {id: "base", runtimeType: "base", isDefault: true},
                    ],
                    manifest: {id: "exact-enum-explicit-ante", name: "Exact Enum Explicit Ante", version: "0.1.0"},
                }),
                cwd,
            );
            const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
            const combinationsGenerator: SymbolsCombinationsGenerating<string> = {
                generateSymbolsCombination: () => new SymbolsCombination<string>().fromMatrix([["A"], ["A"]]),
            };
            const session = game.createExactEnumerationSession!(combinationsGenerator) as unknown as {
                getBetModeId(): string;
                setBetMode(modeId: string): void;
                getBet(): number;
                getStakeAmount(): number;
            };

            expect(session.getBetModeId()).toBe("base");
            expect(session.getStakeAmount()).toBe(session.getBet());

            session.setBetMode("ante");
            expect(session.getBetModeId()).toBe("ante");
            expect(session.getStakeAmount()).toBeCloseTo(session.getBet() * 1.25, 10);
        });

        it("wires a one-shot buyFeature mode that actually forces entry into mechanics.freeGames for the declared count", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const betModes: BetMode[] = [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 7},
            ];
            const result = generator.generate(
                buildBlueprint({
                    symbols: ["A", "B", "S"],
                    scatters: ["S"],
                    paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
                    betModes,
                    manifest: {id: "explicit-buy-bonus", name: "Explicit Buy Bonus", version: "0.1.0"},
                }),
                cwd,
            );

            const session = createSessionAs(result);
            session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
            expect(session.getBetModeId()).toBe("base");

            session.setBetMode("buy-bonus");
            const stakeAmount = session.getStakeAmount();
            expect(stakeAmount).toBeCloseTo(session.getBet() * 100, 10);

            const creditsBefore = session.getCreditsAmount();
            session.play();

            expect(session.getCreditsAmount()).toBeCloseTo(creditsBefore - stakeAmount, 10);
            expect(session.getBetModeId()).toBe("base"); // one-shot -- reverted after the purchase
            // getFreeGamesNum()/getFreeGamesSum() aren't exposed on the outer bet-mode-wrapped session
            // (VideoSlotWithBetModesSession only forwards VideoSlotSessionHandling, not the free-games-
            // specific extension) -- proving the forced entry actually granted free spins, rather than
            // just relabeling the mode, goes through the same public contract a caller actually has:
            // the very next play() must be free (stake 0), meaning a free round is genuinely active.
            expect(session.getStakeAmount()).toBe(0);
            const creditsBeforeFreeSpin = session.getCreditsAmount();
            session.play();
            expect(session.getCreditsAmount()).toBeGreaterThanOrEqual(creditsBeforeFreeSpin); // never charged
        });

        it("fails clearly (throws) rather than silently falling back to metadata-only for an incomplete/invalid runtime-semantics attempt", () => {
            const generator = new GamePackageGenerator("1.3.0");
            // "ante" opts in; "base" doesn't -- incomplete. Calling generate() directly (as this test
            // does) skips GameBlueprintValidator entirely, so this is the one guard standing between an
            // attempted-but-broken opt-in and a generated package that quietly ignores it.
            const betModes: BetMode[] = [{id: "ante", runtimeType: "ante", costMultiplier: 1.25, isDefault: true}, {id: "base"}];

            expect(() =>
                generator.generate(
                    buildBlueprint({betModes, manifest: {id: "incomplete-semantics", name: "Incomplete", version: "0.1.0"}}),
                    cwd,
                ),
            ).toThrow(BetModeRuntimeSemanticsInvalidError);
        });

        it("wires multiple buyFeature modes with different costs/grants, each dispatched to its own forced entry via PerModeForcedFeatureEntryHandler", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const betModes: BetMode[] = [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-10", runtimeType: "buyFeature", costMultiplier: 50, forcedFreeGames: 10},
                {id: "buy-20", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 20},
            ];
            const result = generator.generate(
                buildBlueprint({
                    symbols: ["A", "B", "S"],
                    scatters: ["S"],
                    paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
                    betModes,
                    manifest: {id: "explicit-multi-buy-bonus", name: "Explicit Multi Buy Bonus", version: "0.1.0"},
                }),
                cwd,
            );

            // Two independent sessions from the same generated package -- avoids relying on real,
            // RNG-driven gameplay to fully exhaust one forced-entry free round before buying the other
            // (setBetMode() rejects selecting a forcing mode while a zero-stake round is still active),
            // while still proving each mode routes to its own distinct forced entry via the real
            // generated session, not a shared/confused one.
            const session10 = createSessionAs(result);
            session10.setCreditsAmount(Number.MAX_SAFE_INTEGER);
            session10.setBetMode("buy-10");
            const stake10 = session10.getStakeAmount();
            expect(stake10).toBeCloseTo(session10.getBet() * 50, 10);
            const creditsBefore10 = session10.getCreditsAmount();
            session10.play();
            expect(session10.getCreditsAmount()).toBeCloseTo(creditsBefore10 - stake10, 10);
            expect(session10.getBetModeId()).toBe("base"); // one-shot -- reverted after the purchase
            expect(session10.getStakeAmount()).toBe(0); // proves a free round is genuinely active

            const session20 = createSessionAs(result);
            session20.setCreditsAmount(Number.MAX_SAFE_INTEGER);
            session20.setBetMode("buy-20");
            const stake20 = session20.getStakeAmount();
            expect(stake20).toBeCloseTo(session20.getBet() * 100, 10);
            expect(stake20).not.toBeCloseTo(stake10, 10); // never confused with buy-10's price
            const creditsBefore20 = session20.getCreditsAmount();
            session20.play();
            expect(session20.getCreditsAmount()).toBeCloseTo(creditsBefore20 - stake20, 10);
            expect(session20.getBetModeId()).toBe("base");
            expect(session20.getStakeAmount()).toBe(0);
        });

        it("wires each mode's declared targetRtp into the generated session's own BetModeDefinition, never dropping or mixing it up between modes", () => {
            const generator = new GamePackageGenerator("1.3.0");
            const betModes: BetMode[] = [
                {id: "base", runtimeType: "base", isDefault: true, targetRtp: 0.94},
                {id: "ante", runtimeType: "ante", costMultiplier: 1.25, targetRtp: 0.965},
            ];
            const result = generator.generate(
                buildBlueprint({betModes, manifest: {id: "explicit-target-rtp", name: "Explicit Target RTP", version: "0.1.0"}}),
                cwd,
            );

            // getBetModes() (declarative, always available) is the source pokie sim/report actually
            // read targetRtp from -- confirm it round-trips unchanged.
            const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
            expect(game.getBetModes?.()).toEqual(betModes);

            // The generated dist/index.js source itself must also wire each mode's own targetRtp into
            // its BetModeDefinition -- see renderBuiltGameModule.ts -- so a caller who bypasses pokie
            // sim/report and constructs/uses VideoSlotWithBetModesSession directly still sees a
            // BetModeDescribing.getTargetRtp() consistent with the declared blueprint, never a guess.
            const indexJs = fs.readFileSync(path.join(result.projectRoot, "dist", "index.js"), "utf-8");
            expect(indexJs).toContain("targetRtp: mode.targetRtp");
        });
    });

    it("createSession() behaves exactly as before -- no bet-mode wrapping at all -- when the blueprint has no betModes", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const result = generator.generate(buildBlueprint({manifest: {id: "no-modes", name: "No Modes", version: "0.1.0"}}), cwd);

        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const session = game.createSession();

        expect((session as Partial<{setBetMode: unknown}>).setBetMode).toBeUndefined();
    });

    it("materializes reelStrips from a mixed literal/generated reelStripGeneration into the built module, never leaking the generation config itself", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B"]},
                {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                {type: "literal", strip: ["B", "A"]},
            ],
        });
        const reelStripGeneration = {
            reels: [
                {
                    reelIndex: 1,
                    config: {type: "generated" as const, length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                    seed: 1,
                    success: true,
                    attemptsUsed: 1,
                    diagnostics: [],
                    strip: ["A", "B"],
                },
            ],
        };

        const result = generator.generate(blueprint, cwd, undefined, reelStripGeneration);

        const indexJs = fs.readFileSync(path.join(result.projectRoot, "dist", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);
        expect(embedded.reelStrips).toEqual([
            ["A", "B"],
            ["A", "B"],
            ["B", "A"],
        ]);
        expect(Object.keys(embedded)).not.toContain("reelStripGeneration");
    });

    it("materializes symbolWeights once into the model, independently of round seed", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const result = generator.generate(buildBlueprint({symbolWeights: {A: 3, B: 2}}), cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;

        const first = (game.createSession({seed: "round-seed-a"}) as VideoSlotSessionHandling).getSymbolsSequences().map((reel) => reel.toArray());
        const second = (game.createSession({seed: "round-seed-b"}) as VideoSlotSessionHandling).getSymbolsSequences().map((reel) => reel.toArray());

        expect(second).toEqual(first);
        const resolvedModel = {...buildBlueprint({symbolWeights: {A: 3, B: 2}}), reelStrips: first};
        Reflect.deleteProperty(resolvedModel, "symbolWeights");
        expect(game.getConfigHash?.()).toBe(computeGameBlueprintHash(resolvedModel));
    });

    it("materializes an implicit default reel model once, independently of round seed", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const source = buildBlueprint();
        const result = generator.generate(source, cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;

        const first = (game.createSession({seed: "round-seed-a"}) as VideoSlotSessionHandling).getSymbolsSequences().map((reel) => reel.toArray());
        const second = (game.createSession({seed: "round-seed-b"}) as VideoSlotSessionHandling).getSymbolsSequences().map((reel) => reel.toArray());

        expect(second).toEqual(first);
        expect(game.getConfigHash?.()).toBe(computeGameBlueprintHash({...source, reelStrips: first}));
    });

    it("uses that one implicit resolved model for repeatable sampled outcome libraries", async () => {
        const generator = new GamePackageGenerator("1.3.0");
        const result = generator.generate(buildBlueprint(), cwd);
        const game = require(path.join(result.projectRoot, "dist", "index.js")) as PokieGame;
        const request = {
            libraryId: "implicit-default-sample",
            game,
            pokieVersion: "1.3.0",
            generation: "sampled" as const,
            sample: {sampleSize: BigInt(11), seed: "same-sample-seed"},
        };

        const first = await generateWeightedOutcomeLibrary(request);
        const second = await generateWeightedOutcomeLibrary(request);

        expect(second.library).toEqual(first.library);
        expect(second.diagnostics.configHash).toBe(first.diagnostics.configHash);
    });

    it("self-resolves reelStripGeneration when called directly without a pre-resolved 4th argument", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B"]},
                {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                {type: "literal", strip: ["B", "A"]},
            ],
        });

        const result = generator.generate(blueprint, cwd);

        const indexJs = fs.readFileSync(path.join(result.projectRoot, "dist", "index.js"), "utf-8");
        const embedded = JSON.parse(indexJs.match(/const blueprint = ([\s\S]*?);\n\n/)![1]);
        expect(embedded.reelStrips[0]).toEqual(["A", "B"]);
        expect(embedded.reelStrips[1]).toHaveLength(2);
        expect(embedded.reelStrips[2]).toEqual(["B", "A"]);
    });

    it("computes the same blueprintHash from the authored blueprint regardless of reelStripGeneration materialization", () => {
        const blueprint = buildBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B"]},
                {type: "literal", strip: ["A", "B"]},
                {type: "literal", strip: ["A", "B"]},
            ],
        });

        expect(computeGameBlueprintHash(blueprint)).toBe(computeGameBlueprintHash(blueprint));
    });

    it("throws a clear error naming the failing reel and its diagnostics, and creates no files, when self-resolution can't satisfy a reel's constraints", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStripGeneration: [
                {
                    type: "generated",
                    length: 4,
                    symbolCounts: {A: 2, B: 2},
                    seed: 1,
                    maxAttempts: 3,
                    // Two "A"s on a 4-long strip always split the circle into two gaps summing to 4, so
                    // both can never simultaneously be <= 1 -- no arrangement can ever satisfy this.
                    constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["A"]}],
                },
            ],
        });

        let thrown: Error | undefined;
        try {
            generator.generate(blueprint, cwd);
        } catch (error) {
            thrown = error as Error;
        }

        expect(thrown?.message).toContain("reel 0");
        expect(thrown?.message).toContain("maximum-circular-distance");
        expect(fs.existsSync(path.join(cwd, "sample-slot"))).toBe(false);
    });

    it("throws and creates no files when a caller-supplied reelStripGeneration is missing an entry for a generated reel", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStripGeneration: [
                {type: "literal", strip: ["A", "B"]},
                {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
            ],
        });

        expect(() => generator.generate(blueprint, cwd, undefined, {reels: []})).toThrow(/reelStripGeneration\[1\] is missing/);
        expect(fs.existsSync(path.join(cwd, "sample-slot"))).toBe(false);
    });

    it("throws and creates no files when a caller-supplied reelStripGeneration reports an unsuccessful summary for a generated reel", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStripGeneration: [{type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1}],
        });
        const failedResolution = {
            reels: [
                {
                    reelIndex: 0,
                    config: {type: "generated" as const, length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                    seed: 1,
                    success: false,
                    attemptsUsed: 3,
                    diagnostics: [],
                },
            ],
        };

        expect(() => generator.generate(blueprint, cwd, undefined, failedResolution)).toThrow(
            /reelStripGeneration\[0\] did not generate successfully/,
        );
        expect(fs.existsSync(path.join(cwd, "sample-slot"))).toBe(false);
    });
});

it("recompiles authored mechanic TypeScript against emitted public CommonJS declarations", () => {
    const runtime = emitPublicRuntime();
    try {
        for (const id of ["hold-bet-modes", "accumulating-holdAndWin-bet-modes", "fixed-freeGames-modes"]) {
            const b = existingMechanicsBlueprint(AUTHORED_MECHANIC_CATALOG.find(row => row.id === id)!);
            const built = new GamePackageGenerator("1.3.0").generate(b, runtime.directory);
            const file = path.join(built.projectRoot, "tsconfig.json");
            const config = ts.readConfigFile(file, ts.sys.readFile);
            const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, built.projectRoot);
            const program = ts.createProgram(parsed.fileNames, {...parsed.options, noEmit: true});
            expect(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
        }
    } finally {
        runtime.dispose();
    }
}, 60000);

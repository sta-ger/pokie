import {
    BetMode,
    GamePackageGenerator,
    GameSessionHandling,
    loadPokieGame,
    MAX_SIMULATION_WORKERS,
    PokieGame,
    PokieGameManifest,
    SimulationReport,
    SimulationReportSet,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {SimCommand} from "../../../cli/commands/SimCommand.js";

function createFakeSession(): GameSessionHandling {
    let credits = 1000;
    let bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: (value: number) => {
            bet = value;
        },
        getAvailableBets: () => [1, 2, 5],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
    };
}

function createFakeGame(manifest: PokieGameManifest): PokieGame & {createdWith?: unknown} {
    return {
        getManifest: () => manifest,
        createSession(context) {
            this.createdWith = context;
            return createFakeSession();
        },
    };
}

describe("SimCommand", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("has the expected name and description", () => {
        const command = new SimCommand();

        expect(command.getName()).toBe("sim");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new SimCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie sim <packageRoot>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for a non-positive --rounds", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--rounds", "0"])).rejects.toThrow(/--rounds must be a positive integer/);
    });

    it("throws a descriptive error for a non-integer --workers", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--workers", "2.5"])).rejects.toThrow(/--workers must be an integer between 1 and/);
    });

    it("throws a descriptive error for a --workers below 1", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--workers", "0"])).rejects.toThrow(/--workers must be an integer between 1 and/);
    });

    it("throws a descriptive error for a --workers above the safe maximum", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--workers", String(MAX_SIMULATION_WORKERS + 1)])).rejects.toThrow(
            /--workers must be an integer between 1 and/,
        );
    });

    it("throws a descriptive error when only some of --min-rounds/--rtp-tolerance/--check-interval are given", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--min-rounds", "1000"])).rejects.toThrow(
            /--min-rounds, --rtp-tolerance and --check-interval must all be provided together/,
        );
        await expect(command.run(["./game", "--min-rounds", "1000", "--rtp-tolerance", "0.01"])).rejects.toThrow(
            /--min-rounds, --rtp-tolerance and --check-interval must all be provided together/,
        );
    });

    it("throws a descriptive error when --stable-checks is given without the other convergence flags", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--stable-checks", "5"])).rejects.toThrow(
            /--stable-checks requires --min-rounds, --rtp-tolerance and --check-interval/,
        );
    });

    it("throws a descriptive error for a negative --min-rounds", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--min-rounds", "-1"])).rejects.toThrow(/--min-rounds must be a non-negative integer/);
    });

    it("throws a descriptive error for a non-positive --rtp-tolerance", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--rtp-tolerance", "0"])).rejects.toThrow(/--rtp-tolerance must be a positive number/);
    });

    it("throws a descriptive error for a non-positive --check-interval", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--check-interval", "0"])).rejects.toThrow(/--check-interval must be a positive integer/);
    });

    it("defaults to workers=1 and reports it in the JSON report, using the in-process path (no workerEntryUrl needed)", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "30", "--out", "report.json"]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;
        expect(report.workers).toBe(1);

        (console.log as jest.Mock).mockRestore();
    });

    it("prints the workers count in the console summary", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "20"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("workers         1");

        logSpy.mockRestore();
    });

    it("without convergence flags, the report has stopReason 'maxRounds' and no convergence field", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "30", "--out", "report.json"]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;
        expect(report.rounds).toBe(30);
        expect(report.stopReason).toBe("maxRounds");
        expect(report.convergence).toBeUndefined();

        (console.log as jest.Mock).mockRestore();
    });

    it("stops early once adaptive convergence criteria are satisfied, and reports it in JSON and the console summary", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([
            "./crazy-fruits",
            "--rounds",
            "10000",
            "--min-rounds",
            "50",
            "--rtp-tolerance",
            "5",
            "--check-interval",
            "25",
            "--out",
            "report.json",
        ]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;
        // Checks at 25 (below minRounds), 50/75/100 (three consecutive satisfying checks, given the
        // generous tolerance) -> converges at 100, well short of the 10000 requested.
        expect(report.stopReason).toBe("converged");
        expect(report.rounds).toBe(100);
        expect(report.requestedRounds).toBe(10000);
        expect(report.convergence).toEqual({
            minRounds: 50,
            rtpTolerance: 5,
            checkIntervalRounds: 25,
            stableChecks: 3,
            checksPerformed: 4,
            consecutiveStableChecks: 3,
            achievedRtpHalfWidth: expect.any(Number),
        });

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("stop reason     converged");
        expect(printed).toContain("convergence     minRounds 50");

        logSpy.mockRestore();
    });

    it("falls back to the full requested rounds when convergence criteria are never satisfied", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([
            "./crazy-fruits",
            "--rounds",
            "60",
            "--min-rounds",
            "10000", // unreachable within --rounds
            "--rtp-tolerance",
            "0.01",
            "--check-interval",
            "20",
            "--out",
            "report.json",
        ]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;
        expect(report.stopReason).toBe("maxRounds");
        expect(report.rounds).toBe(60);
        expect(report.requestedRounds).toBe(60);
        expect(report.convergence!.consecutiveStableChecks).toBe(0);

        (console.log as jest.Mock).mockRestore();
    });

    // --workers > 1 with no configured workerEntryUrl falls back to ParallelSimulationRunner's own
    // default worker entry resolution (see src/simulation/parallel/internal/defaultWorkerEntryUrl.ts)
    // rather than throwing — not exercisable here since that default only ever resolves inside a real
    // built dist/ tree, which ts-jest's source-only module resolution doesn't provide (and can't even
    // attempt the dynamic import at all without extra Jest configuration). See the npm tarball smoke
    // test (tests/packaging/npmPackSmoke.test.ts) for the real, end-to-end verification of that path,
    // and SimCommand.realWorkers.test.ts (using TEST_WORKER_ENTRY_URL) for workers>1 exercised via
    // an explicit override instead.

    it("loads the game via the injected loader and plays the requested number of rounds", async () => {
        const game = createFakeGame(manifest);
        const command = new SimCommand(() => Promise.resolve(game));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "50", "--seed", "demo"]);

        expect(game.createdWith).toEqual({seed: "demo"});
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain('Simulated "Crazy Fruits"');
        expect(printed).toContain("rounds          50");
        expect(printed).toContain("seed            demo");

        logSpy.mockRestore();
    });

    it("writes a machine-readable JSON report when --out is given", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "30", "--out", "report.json"]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        const [file, contents] = writeFile.mock.calls[0];
        expect(file).toBe("report.json");
        const report = JSON.parse(contents) as SimulationReport;
        expect(report.game).toEqual(manifest);
        expect(report.rounds).toBe(30);
        expect(report.requestedRounds).toBe(30);
        expect(typeof report.rtp).toBe("number");
        expect(typeof report.hitFrequency).toBe("number");
        expect(typeof report.maxWin).toBe("number");
        expect(typeof report.spinsPerSecond).toBe("number");

        (console.log as jest.Mock).mockRestore();
    });

    it("prints the JSON report to stdout instead of the summary when --format json is given", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "20", "--format", "json"]);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const report = JSON.parse(logSpy.mock.calls[0][0]) as SimulationReport;
        expect(report.rounds).toBe(20);

        logSpy.mockRestore();
    });

    it("has no breakdown field when the session doesn't implement getStakeAmount", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "30", "--out", "report.json"]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;
        expect(report.breakdown).toBeUndefined();

        (console.log as jest.Mock).mockRestore();
    });

    function createFreeGamesAwareFakeGame(theManifest: PokieGameManifest): PokieGame {
        return {
            getManifest: () => theManifest,
            createSession() {
                let credits = 1000;
                const bet = 1;
                let round = 0;
                let pendingWin = 0;
                return {
                    getCreditsAmount: () => credits,
                    setCreditsAmount: (value: number) => {
                        credits = value;
                    },
                    getBet: () => bet,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => true,
                    getStakeAmount: () => (round % 5 === 4 ? 0 : bet),
                    play: () => {
                        pendingWin = round % 10 === 0 ? 10 : 0;
                        round++;
                        credits = credits - (round % 5 === 0 ? 0 : bet) + pendingWin;
                    },
                    getWinAmount: () => pendingWin,
                } as unknown as GameSessionHandling;
            },
        };
    }

    it("writes a base/freeGames breakdown when the session implements StakeAmountDetermining", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createFreeGamesAwareFakeGame(manifest)), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "50", "--out", "report.json"]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;

        expect(report.breakdown).toBeDefined();
        expect(report.breakdown!.components.base.rounds).toBe(40);
        expect(report.breakdown!.components.freeGames.rounds).toBe(10);
        expect(report.breakdown!.components.base.totalWin).toBeGreaterThan(0);

        (console.log as jest.Mock).mockRestore();
    });

    it("prints a Breakdown section in the summary when the session implements StakeAmountDetermining", async () => {
        const command = new SimCommand(() => Promise.resolve(createFreeGamesAwareFakeGame(manifest)));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "50"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Breakdown:");
        expect(printed).toContain("base");
        expect(printed).toContain("freeGames");

        logSpy.mockRestore();
    });
});

describe("SimCommand --mode", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    function createBetModeAwareFakeGame(): PokieGame {
        return {
            getManifest: () => manifest,
            createSession() {
                let credits = 1_000_000;
                const bet = 1;
                let round = 0;
                let winAmount = 0;
                let currentMode = "base";
                const modes: Record<string, number> = {base: 1, ante: 1.25};

                return {
                    getCreditsAmount: () => credits,
                    setCreditsAmount: (value: number) => {
                        credits = value;
                    },
                    getBet: () => bet,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => true,
                    getBetModeId: () => currentMode,
                    setBetMode: (modeId: string) => {
                        if (!(modeId in modes)) {
                            throw new Error(`Unknown bet mode "${modeId}". Available modes: ${Object.keys(modes).join(", ")}.`);
                        }
                        currentMode = modeId;
                    },
                    getStakeAmount: () => bet * modes[currentMode],
                    play: () => {
                        round++;
                        winAmount = round % 5 === 0 ? bet * 10 : 0;
                        credits = credits - bet * modes[currentMode] + winAmount;
                    },
                    getWinAmount: () => winAmount,
                } as unknown as GameSessionHandling;
            },
        };
    }

    it("plays under the selected mode and labels the JSON report with betMode", async () => {
        const writeFile = jest.fn();
        const command = new SimCommand(() => Promise.resolve(createBetModeAwareFakeGame()), writeFile);
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "40", "--mode", "ante", "--out", "report.json"]);

        const [, contents] = writeFile.mock.calls[0];
        const report = JSON.parse(contents) as SimulationReport;

        expect(report.betMode).toBe("ante");
        expect(report.totalBet).toBeCloseTo(1.25 * 40, 10); // the mode's real cost, not the nominal bet

        (console.log as jest.Mock).mockRestore();
    });

    it("prints the bet mode line in the console summary", async () => {
        const command = new SimCommand(() => Promise.resolve(createBetModeAwareFakeGame()));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "20", "--mode", "ante"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("bet mode        ante");

        logSpy.mockRestore();
    });

    it("omits the bet mode line entirely when --mode isn't given", async () => {
        const command = new SimCommand(() => Promise.resolve(createBetModeAwareFakeGame()));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits", "--rounds", "20"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).not.toContain("bet mode");

        logSpy.mockRestore();
    });

    it("surfaces the runtime's own error for an unknown mode id, rather than silently ignoring --mode", async () => {
        const command = new SimCommand(() => Promise.resolve(createBetModeAwareFakeGame()));

        await expect(command.run(["./crazy-fruits", "--rounds", "20", "--mode", "typo-mode"])).rejects.toThrow(/Unknown bet mode "typo-mode"/);
    });

    it("throws a descriptive error when --mode is given with no value", async () => {
        const command = new SimCommand(() => Promise.resolve(createBetModeAwareFakeGame()));

        await expect(command.run(["./crazy-fruits", "--mode"])).rejects.toThrow(/--mode requires a bet mode id/);
    });

    // Regression: --mode against a game whose session doesn't support bet modes at all must fail
    // clearly, never silently simulate the plain base game and still label the report with the
    // requested mode.
    it("fails clearly, rather than silently simulating the base game, when the game has no bet modes at all", async () => {
        const command = new SimCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./crazy-fruits", "--rounds", "20", "--mode", "ante"])).rejects.toThrow(
            /does not support bet mode selection/,
        );
    });
});

// End-to-end: a REAL "pokie build"-generated package (not a fake session) whose blueprint carries a
// fully-determined explicit runtime-semantics contract, run through the real CLI --mode flag.
describe("SimCommand --mode (integration, real generated package)", () => {
    let cwd: string;

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-betmode-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    function generateGameWithAnteMode(): string {
        const betModes: BetMode[] = [
            {id: "base", runtimeType: "base", isDefault: true},
            {id: "ante", runtimeType: "ante", costMultiplier: 1.25},
        ];
        const result = new GamePackageGenerator("1.3.0").generate(
            {
                manifest: {id: "generated-ante-game", name: "Generated Ante Game", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                betModes,
            },
            cwd,
        );
        return result.projectRoot;
    }

    it("plays a real generated package under the locked mode and reports its actual (ante-adjusted) cost", async () => {
        const packageRoot = generateGameWithAnteMode();
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(cwd, "report.json");

        await command.run([packageRoot, "--rounds", "200", "--seed", "demo", "--mode", "ante", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.betMode).toBe("ante");
        expect(report.rounds).toBe(200);
        // The generated package's default bet is 1 (GamePackageGenerator's own default), so ante's
        // 1.25x cost multiplier -- read from the real, codegen-wired VideoSlotWithBetModesSession's
        // own getStakeAmount(), never recomputed by the CLI/simulation layer -- makes this exact.
        expect(report.totalBet).toBeCloseTo(200 * 1.25, 10);
    });

    it("fails clearly for a mode id the generated package's blueprint never configured", async () => {
        const packageRoot = generateGameWithAnteMode();
        const command = new SimCommand(loadPokieGame);

        await expect(command.run([packageRoot, "--rounds", "20", "--mode", "buy-bonus"])).rejects.toThrow(/Unknown bet mode "buy-bonus"/);
    });

    function generateGameWithTwoBuyFeatureModes(): string {
        const betModes: BetMode[] = [
            {id: "base", runtimeType: "base", isDefault: true},
            {id: "buy-10", runtimeType: "buyFeature", costMultiplier: 50, forcedFreeGames: 10},
            {id: "buy-20", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 20},
        ];
        const result = new GamePackageGenerator("1.3.0").generate(
            {
                manifest: {id: "generated-multi-buy-game", name: "Generated Multi Buy Game", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B", "S"],
                scatters: ["S"],
                paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
                betModes,
            },
            cwd,
        );
        return result.projectRoot;
    }

    it("runs pokie sim --mode separately for each of several differently-priced buyFeature modes, reporting each mode's own cost", async () => {
        const packageRoot = generateGameWithTwoBuyFeatureModes();
        const command = new SimCommand(loadPokieGame);
        const outFile10 = path.join(cwd, "report-buy-10.json");
        const outFile20 = path.join(cwd, "report-buy-20.json");

        // Exactly 1 round each: the whole round is the forced purchase itself (see the GamePackageGenerator
        // "wires a one-shot buyFeature mode" test for why a buyFeature round's *own* cost, not a
        // multi-round run mixing in the free spins it then grants at 0 cost, is what isolates each
        // mode's price cleanly).
        await command.run([packageRoot, "--rounds", "1", "--seed", "demo", "--mode", "buy-10", "--out", outFile10]);
        await command.run([packageRoot, "--rounds", "1", "--seed", "demo", "--mode", "buy-20", "--out", outFile20]);

        const report10 = JSON.parse(fs.readFileSync(outFile10, "utf-8")) as SimulationReport;
        const report20 = JSON.parse(fs.readFileSync(outFile20, "utf-8")) as SimulationReport;

        expect(report10.betMode).toBe("buy-10");
        expect(report20.betMode).toBe("buy-20");
        // The generated package's default bet is 1, so buy-10's 50x and buy-20's 100x costs must be
        // reported distinctly per mode -- never confused with each other, and never falling back to
        // the same handler/cost regardless of which mode id was actually requested.
        expect(report10.totalBet).toBeCloseTo(50, 10);
        expect(report20.totalBet).toBeCloseTo(100, 10);
    });
});

// End-to-end: "pokie sim --mode all" against a real generated package declaring base/ante/multiple
// buyFeature modes -- one full simulation per mode, bundled into a SimulationReportSet, never a single
// blended/"overall" number across modes.
describe("SimCommand --mode all (integration, real generated package)", () => {
    const manifest: PokieGameManifest = {id: "deterministic-game", name: "Deterministic Game", version: "0.1.0"};
    let cwd: string;

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-allmodes-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    function generateGameWithBaseAnteAndTwoBuyModes(manifestId: string): string {
        const betModes: BetMode[] = [
            {id: "base", runtimeType: "base", isDefault: true, targetRtp: 0.94},
            {id: "ante", runtimeType: "ante", costMultiplier: 1.25, targetRtp: 0.965},
            {id: "buy-10", runtimeType: "buyFeature", costMultiplier: 50, forcedFreeGames: 10},
            {id: "buy-20", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 20, targetRtp: 0.97},
        ];
        const result = new GamePackageGenerator("1.3.0").generate(
            {
                manifest: {id: manifestId, name: "Generated All Modes Game", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B", "S"],
                scatters: ["S"],
                paytable: {A: {3: 5}, B: {3: 2}, S: {3: 2}},
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
                // Explicit (not shuffled) reel strips -- VideoSlotConfig's own default reel-strip
                // generation shuffles with an unseeded RNG at construction time, so without this, two
                // separate createSession() calls (one per "pokie sim" invocation below) would get
                // different reels every time regardless of --seed, breaking the determinism this test
                // exists to check. Deliberately no "S" on the physical reels -- "S"/mechanics.freeGames
                // still need to be declared for buyFeature's forced-entry requirement, but a NATURAL
                // scatter retrigger consumes a variable, hard-to-pin-down number of extra RNG draws per
                // round, which would make an exact reproducibility assertion fragile for reasons
                // unrelated to what this test actually checks (the CLI/report plumbing, not the win
                // engine's own RNG consumption). Forced entry (buy-10/buy-20) grants free games
                // directly regardless of what's physically on the reels.
                reelStrips: [
                    ["A", "B", "A", "B", "A", "B"],
                    ["B", "A", "B", "A", "B", "A"],
                    ["A", "A", "B", "B", "A", "B"],
                ],
                betModes,
            },
            cwd,
        );
        return result.projectRoot;
    }

    it("runs a full simulation for every declared mode and bundles them into a SimulationReportSet keyed by mode id", async () => {
        const packageRoot = generateGameWithBaseAnteAndTwoBuyModes("all-modes-bundle");
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(cwd, "report-set.json");

        await command.run([packageRoot, "--rounds", "30", "--seed", "demo", "--mode", "all", "--out", outFile]);

        const reportSet = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReportSet;

        expect(Object.keys(reportSet.modes)).toEqual(["base", "ante", "buy-10", "buy-20"]);
        expect(reportSet.modes.base.betMode).toBe("base");
        expect(reportSet.modes.ante.betMode).toBe("ante");
        expect(reportSet.modes["buy-10"].betMode).toBe("buy-10");
        expect(reportSet.modes["buy-20"].betMode).toBe("buy-20");
        // Each mode's own rounds were actually played in full -- never split/shared across modes.
        Object.values(reportSet.modes).forEach((report) => expect(report.rounds).toBe(30));
    });

    it("never computes a blended/overall RTP or totals across modes -- only the per-mode reports", async () => {
        const packageRoot = generateGameWithBaseAnteAndTwoBuyModes("all-modes-no-blend");
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(cwd, "report-set.json");

        await command.run([packageRoot, "--rounds", "10", "--seed", "demo", "--mode", "all", "--out", outFile]);

        const raw = JSON.parse(fs.readFileSync(outFile, "utf-8")) as Record<string, unknown>;

        // The set itself carries no rtp/totalBet/totalWin/hitFrequency of its own -- those only exist
        // per mode, inside reportSet.modes[id].
        expect(raw.rtp).toBeUndefined();
        expect(raw.totalBet).toBeUndefined();
        expect(raw.totalWin).toBeUndefined();
        expect(raw.hitFrequency).toBeUndefined();
        expect(Object.keys(raw)).toEqual(expect.arrayContaining(["game", "requestedRounds", "seed", "modes"]));
    });

    it("carries each mode's declared targetRtp/rtpDeviation through to its own report, and omits it where none was declared", async () => {
        const packageRoot = generateGameWithBaseAnteAndTwoBuyModes("all-modes-target-rtp");
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(cwd, "report-set.json");

        await command.run([packageRoot, "--rounds", "10", "--seed", "demo", "--mode", "all", "--out", outFile]);

        const reportSet = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReportSet;

        expect(reportSet.modes.base.targetRtp).toBe(0.94);
        expect(reportSet.modes.ante.targetRtp).toBe(0.965);
        expect(reportSet.modes["buy-20"].targetRtp).toBe(0.97);
        expect(reportSet.modes["buy-10"].targetRtp).toBeUndefined(); // never declared one
        expect(reportSet.modes.base.rtpDeviation).toBeCloseTo(reportSet.modes.base.rtp - 0.94, 10);
    });

    // Uses a hand-rolled, fully deterministic fake session (round-indexed win pattern, no RNG at all)
    // rather than a real "pokie build"-generated package: as docs/cli.md documents, --seed reproducing
    // a real generated package's reel spins is "best-effort, not guaranteed" -- renderGeneratedGameModule.ts's
    // createSession() never threads context.seed into a SeededRandomNumberGenerator, so a real
    // generated package is NOT actually seed-reproducible today (a pre-existing, documented limitation,
    // unrelated to bet modes). What this test needs to prove is that runAllModes()'s own orchestration
    // (looping declared modes, building one SimulationReportSet, never blending) is itself
    // deterministic given a deterministic session -- that's exactly what this isolates.
    function createDeterministicMultiModeFakeGame(): PokieGame {
        const declaredModes: BetMode[] = [
            {id: "base", targetRtp: 0.94},
            {id: "ante", costMultiplier: 1.25, targetRtp: 0.965},
            {id: "buy-10", costMultiplier: 50},
            {id: "buy-20", costMultiplier: 100, targetRtp: 0.97},
        ];
        const stakeMultipliers: Record<string, number> = {base: 1, ante: 1.25, "buy-10": 50, "buy-20": 100};

        return {
            getManifest: () => manifest,
            getBetModes: () => declaredModes,
            createSession() {
                let credits = 1_000_000;
                const bet = 1;
                let round = 0;
                let currentMode = "base";
                let winAmount = 0;
                return {
                    getCreditsAmount: () => credits,
                    setCreditsAmount: (value: number) => {
                        credits = value;
                    },
                    getBet: () => bet,
                    setBet: () => undefined,
                    getAvailableBets: () => [1],
                    canPlayNextGame: () => true,
                    getBetModeId: () => currentMode,
                    setBetMode: (modeId: string) => {
                        if (!(modeId in stakeMultipliers)) {
                            throw new Error(`Unknown bet mode "${modeId}". Available modes: ${Object.keys(stakeMultipliers).join(", ")}.`);
                        }
                        currentMode = modeId;
                    },
                    getStakeAmount: () => bet * stakeMultipliers[currentMode],
                    play: () => {
                        round++;
                        // A pure function of (mode, round) -- no randomness anywhere, so two separate
                        // command.run() invocations against a fresh instance of this fake always agree.
                        winAmount = round % 5 === 0 ? bet * stakeMultipliers[currentMode] * 2 : 0;
                        credits = credits - bet * stakeMultipliers[currentMode] + winAmount;
                    },
                    getWinAmount: () => winAmount,
                } as unknown as GameSessionHandling;
            },
        };
    }

    it("produces byte-for-byte identical per-mode reports (minus timing) across two separate --mode all runs of a deterministic session", async () => {
        const command = new SimCommand(() => Promise.resolve(createDeterministicMultiModeFakeGame()));
        const outFileA = path.join(cwd, "report-set-a.json");
        const outFileB = path.join(cwd, "report-set-b.json");

        await command.run(["./deterministic-game", "--rounds", "25", "--seed", "reproducible", "--mode", "all", "--out", outFileA]);
        await command.run(["./deterministic-game", "--rounds", "25", "--seed", "reproducible", "--mode", "all", "--out", outFileB]);

        const setA = JSON.parse(fs.readFileSync(outFileA, "utf-8")) as SimulationReportSet;
        const setB = JSON.parse(fs.readFileSync(outFileB, "utf-8")) as SimulationReportSet;

        expect(Object.keys(setA.modes)).toEqual(["base", "ante", "buy-10", "buy-20"]);
        Object.keys(setA.modes).forEach((modeId) => {
            const {durationMs: _durationA, spinsPerSecond: _spinsA, ...restA} = setA.modes[modeId];
            const {durationMs: _durationB, spinsPerSecond: _spinsB, ...restB} = setB.modes[modeId];
            expect(restA).toEqual(restB);
        });
    });

    it("fails clearly, rather than running only one mode, when the game doesn't declare any bet modes at all", async () => {
        const generator = new GamePackageGenerator("1.3.0");
        const result = generator.generate(
            {
                manifest: {id: "no-modes-all", name: "No Modes All", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
            },
            cwd,
        );
        const command = new SimCommand(loadPokieGame);

        await expect(command.run([result.projectRoot, "--rounds", "10", "--mode", "all"])).rejects.toThrow(
            /--mode all requires the game package to declare its bet modes/,
        );
    });

    it("prints each mode's summary separately in the console (never one blended summary)", async () => {
        const packageRoot = generateGameWithBaseAnteAndTwoBuyModes("all-modes-console");
        const command = new SimCommand(loadPokieGame);

        await command.run([packageRoot, "--rounds", "10", "--seed", "demo", "--mode", "all"]);

        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("=== Mode: base ===");
        expect(printed).toContain("=== Mode: ante ===");
        expect(printed).toContain("=== Mode: buy-10 ===");
        expect(printed).toContain("=== Mode: buy-20 ===");
    });
});

describe("SimCommand (integration, real loadPokieGame + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("loads a real game package and produces a JSON report file", async () => {
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "200", "--seed", "demo", "--out", outFile]);

        expect(fs.existsSync(outFile)).toBe(true);
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(report.rounds).toBe(200);
        expect(report.seed).toBe("demo");
        expect(report.totalBet).toBeGreaterThan(0);
        expect(Number.isFinite(report.rtp)).toBe(true);
    });

    it("produces a reproducible report for the same seed", async () => {
        const command = new SimCommand(loadPokieGame);
        const firstFile = path.join(outDir, "first.json");
        const secondFile = path.join(outDir, "second.json");

        await command.run([fixtureRoot, "--rounds", "300", "--seed", "reproducible-seed", "--out", firstFile]);
        await command.run([fixtureRoot, "--rounds", "300", "--seed", "reproducible-seed", "--out", secondFile]);

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as SimulationReport;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as SimulationReport;

        expect(second.totalBet).toBe(first.totalBet);
        expect(second.totalWin).toBe(first.totalWin);
        expect(second.rtp).toBe(first.rtp);
        expect(second.hitFrequency).toBe(first.hitFrequency);
        expect(second.maxWin).toBe(first.maxWin);
    });

    it("throws a clear error for an invalid packageRoot", async () => {
        const command = new SimCommand(loadPokieGame);

        await expect(command.run([path.join(outDir, "does-not-exist")])).rejects.toThrow(/package\.json/);
    });

    it("stops a real game package's simulation early once adaptive convergence is satisfied", async () => {
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(outDir, "report.json");

        await command.run([
            fixtureRoot,
            "--rounds",
            "50000",
            "--seed",
            "demo",
            // An effectively-infinite tolerance means the only real gate is minRounds/stableChecks --
            // deterministic regardless of the fixture game's actual RTP variance, so this can't flake.
            "--min-rounds",
            "500",
            "--rtp-tolerance",
            "10",
            "--check-interval",
            "250",
            "--out",
            outFile,
        ]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.stopReason).toBe("converged");
        expect(report.rounds).toBeLessThan(report.requestedRounds);
        expect(report.convergence!.minRounds).toBe(500);
        expect(report.convergence!.checkIntervalRounds).toBe(250);
        // No "stopped early" warning for a converged run -- this is the feature working as intended.
        expect(report.warnings!.some((warning) => warning.includes("stopped early"))).toBe(false);
    });
});

describe("SimCommand (integration, real game with a free-games feature)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game-with-free-games");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-breakdown-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("produces a JSON report with a base vs freeGames breakdown", async () => {
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "5000", "--seed", "demo", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.breakdown).toBeDefined();

        const {base, freeGames} = report.breakdown!.components;
        expect(base.rounds).toBeGreaterThan(0);
        expect(freeGames.rounds).toBeGreaterThan(0);
        expect(base.rounds + freeGames.rounds).toBe(report.rounds);
        expect(base.totalBet + freeGames.totalBet).toBeCloseTo(report.totalBet, 10);
        expect(base.totalWin + freeGames.totalWin).toBeCloseTo(report.totalWin, 10);
    });
});

describe("SimCommand (integration, real game with an explicit custom category)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game-with-bonus-round");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-custom-category-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("produces a JSON report with an arbitrary custom category (not base/freeGames)", async () => {
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "1000", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.breakdown).toBeDefined();

        const {base, bonus} = report.breakdown!.components;
        expect(bonus).toBeDefined();
        expect(bonus.rounds).toBeGreaterThan(0);
        expect(base.rounds + bonus.rounds).toBe(report.rounds);
        expect(base.totalWin + bonus.totalWin).toBeCloseTo(report.totalWin, 10);
        // Contributions across every category always sum to the overall rtp.
        expect(base.contribution + bonus.contribution).toBeCloseTo(report.rtp, 10);
    });

    it("renders the custom category in the markdown/html breakdown table via pokie report", async () => {
        const outFile = path.join(outDir, "report.json");
        await new SimCommand(loadPokieGame).run([fixtureRoot, "--rounds", "1000", "--out", outFile]);

        const {ReportCommand} = await import("../../../cli/commands/ReportCommand.js");
        const markdownOut = path.join(outDir, "report.md");
        await new ReportCommand().run([outFile, "--out", markdownOut]);

        const markdown = fs.readFileSync(markdownOut, "utf-8");
        expect(markdown).toContain("## Breakdown");
        expect(markdown).toContain("| bonus |");
        expect(markdown).toContain("| base |");
    });
});


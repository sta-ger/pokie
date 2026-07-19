import {
    BetMode,
    GamePackageGenerator,
    GameSessionHandling,
    loadPokieGame,
    MAX_SIMULATION_WORKERS,
    PokieGame,
    PokieGameManifest,
    SimulationReport,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {SimCommand} from "../../../cli/commands/SimCommand.js";
import {TEST_WORKER_ENTRY_URL} from "../../simulation/parallel/testWorkerEntryUrl.js";

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

    // --workers > 1 with no configured workerEntryUrl falls back to ParallelSimulationRunner's own
    // default worker entry resolution (see src/simulation/parallel/internal/defaultWorkerEntryUrl.ts)
    // rather than throwing — not exercisable here since that default only ever resolves inside a real
    // built dist/ tree, which ts-jest's source-only module resolution doesn't provide (and can't even
    // attempt the dynamic import at all without extra Jest configuration). See the npm tarball smoke
    // test (tests/packaging/npmPackSmoke.test.ts) for the real, end-to-end verification of that path,
    // and SimCommand's own real-worker-thread tests below (using TEST_WORKER_ENTRY_URL) for workers>1
    // exercised via an explicit override instead.

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

describe("SimCommand (integration, real loadPokieGame + --workers, real worker threads)", () => {
    jest.setTimeout(30000);
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-sim-workers-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("runs with --workers 2 across real worker threads and produces a full report", async () => {
        const command = new SimCommand(loadPokieGame, undefined, undefined, TEST_WORKER_ENTRY_URL);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "1000", "--seed", "demo", "--workers", "2", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(1000);
        expect(report.workers).toBe(2);
        expect(report.reproducibility?.command).toContain("--workers 2");
        expect(report.reproducibility?.workerSeedStrategy).toBeDefined();
        expect(report.totalBet).toBeGreaterThan(0);
        expect(Number.isFinite(report.rtp)).toBe(true);
    });

    it("runs with --workers 4, splitting rounds unevenly across workers, and rounds still add up exactly", async () => {
        const command = new SimCommand(loadPokieGame, undefined, undefined, TEST_WORKER_ENTRY_URL);
        const outFile = path.join(outDir, "report.json");

        // 1001 rounds across 4 workers forces an uneven split (251/250/250/250).
        await command.run([fixtureRoot, "--rounds", "1001", "--workers", "4", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(1001);
        expect(report.workers).toBe(4);
    });

    it("--workers 1 explicitly given still works without a worker entry point (in-process path)", async () => {
        const command = new SimCommand(loadPokieGame);
        const outFile = path.join(outDir, "report.json");

        await command.run([fixtureRoot, "--rounds", "100", "--workers", "1", "--out", outFile]);

        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimulationReport;
        expect(report.rounds).toBe(100);
        expect(report.workers).toBe(1);
    });

    it("produces a reproducible report for the same seed and workers count", async () => {
        const command = new SimCommand(loadPokieGame, undefined, undefined, TEST_WORKER_ENTRY_URL);
        const firstFile = path.join(outDir, "first.json");
        const secondFile = path.join(outDir, "second.json");

        await command.run([fixtureRoot, "--rounds", "600", "--seed", "reproducible", "--workers", "3", "--out", firstFile]);
        await command.run([fixtureRoot, "--rounds", "600", "--seed", "reproducible", "--workers", "3", "--out", secondFile]);

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as SimulationReport;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as SimulationReport;

        expect(second.totalBet).toBe(first.totalBet);
        expect(second.totalWin).toBe(first.totalWin);
        expect(second.rtp).toBe(first.rtp);
        expect(second.hitFrequency).toBe(first.hitFrequency);
        expect(second.maxWin).toBe(first.maxWin);
    });

    it("a smoke comparison of workers=1 vs workers=4 timing — both complete and produce valid reports (no asserted speedup)", async () => {
        const singleWorkerCommand = new SimCommand(loadPokieGame);
        const multiWorkerCommand = new SimCommand(loadPokieGame, undefined, undefined, TEST_WORKER_ENTRY_URL);
        const singleFile = path.join(outDir, "single.json");
        const multiFile = path.join(outDir, "multi.json");

        // A non-flaky smoke test: it never asserts that --workers 4 is faster (real CI machines can
        // have as little as 1 usable core, making parallel workers slower than sequential once thread
        // spawn overhead is counted) — it only asserts both configurations actually complete and
        // produce a full, valid report for the same workload.
        await singleWorkerCommand.run([fixtureRoot, "--rounds", "5000", "--out", singleFile]);
        await multiWorkerCommand.run([fixtureRoot, "--rounds", "5000", "--workers", "4", "--out", multiFile]);

        const single = JSON.parse(fs.readFileSync(singleFile, "utf-8")) as SimulationReport;
        const multi = JSON.parse(fs.readFileSync(multiFile, "utf-8")) as SimulationReport;
        expect(single.rounds).toBe(5000);
        expect(multi.rounds).toBe(5000);
        expect(multi.workers).toBe(4);
    });
});

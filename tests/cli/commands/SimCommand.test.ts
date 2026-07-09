import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameManifest} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {SimCommand, SimReport} from "../../../cli/commands/SimCommand";

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
        const report = JSON.parse(contents) as SimReport;
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
        const report = JSON.parse(logSpy.mock.calls[0][0]) as SimReport;
        expect(report.rounds).toBe(20);

        logSpy.mockRestore();
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
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as SimReport;
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

        const first = JSON.parse(fs.readFileSync(firstFile, "utf-8")) as SimReport;
        const second = JSON.parse(fs.readFileSync(secondFile, "utf-8")) as SimReport;

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
